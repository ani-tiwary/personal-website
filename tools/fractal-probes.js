// Browser integration probe: compare the production GPU escape calculation with
// an independent 70-digit CPU iteration. Only the final color encoding is replaced.
(async () => {
    const m = FractalMath;
    const canvas = document.createElement('canvas');
    canvas.width = 9; canvas.height = 7;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: true, antialias: false });
    if (!gl || gl.isContextLost()) throw Error('No working WebGL context');
    gl.getExtension('OES_standard_derivatives');
    if (!gl.getExtension('OES_texture_float')) throw Error('Float texture test unavailable');
    function shader(type, source) {
        const result = gl.createShader(type);
        gl.shaderSource(result, source); gl.compileShader(result);
        if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(result));
        return result;
    }
    const program = gl.createProgram();
    gl.attachShader(program, shader(gl.VERTEX_SHADER, 'attribute vec2 p; void main(){gl_Position=vec4(p,0.,1.);}'));
    gl.attachShader(program, shader(gl.FRAGMENT_SHADER, fractalFragmentShaderSource.replace(
        'gl_FragColor = vec4(vec3(color), 1.0);',
        `float encoded = floor((escapeIteration + 1.0) * 256.0 + 0.5);
         gl_FragColor = vec4(mod(floor(encoded / 65536.0),256.0), mod(floor(encoded / 256.0),256.0),mod(encoded,256.0),255.0) / 255.0;`)));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,-1,1,1,-1,1,1]), gl.STATIC_DRAW);
    const p = gl.getAttribLocation(program, 'p'); gl.enableVertexAttribArray(p); gl.vertexAttribPointer(p,2,gl.FLOAT,false,0,0);
    const u = name => gl.getUniformLocation(program, `u_${name}`);
    const texture = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texture);
    for (const parameter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.NEAREST);
    for (const parameter of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.CLAMP_TO_EDGE);
    gl.uniform1i(u('referenceOrbit'),0);
    gl.uniform1f(u('usePerturbation'),1); gl.uniform4f(u('referenceDelta'),0,0,0,0);
    gl.uniform2f(u('resolution'),9,7);
    const reports = [];
    for (const accelerated of [false, true])
    for (const view of [
        { x:'-0.7436438897030277', y:'0.13182589503471387', zoom:1e12 },
        { x:'-0.7436438897030277', y:'0.13182589503471387', zoom:1e12, offset:1.25e-12 },
        { x:'-1.999999999999999999999998', y:'0', zoom:1e24 },
        { x:'-0.5', y:'0', zoom:1e25 },
        { x:'-1.99999999999999999999999998', y:'0', zoom:1e26 }
    ]) {
        const iterations = 3000;
        const offset=m.fromNumber(view.offset || 0);
        const cx=m.pair(m.parse(view.x)+offset),cy=m.pair(m.parse(view.y));
        gl.uniform4fv(u('referenceDelta'),[...m.pair(offset),0,0]);
        gl.uniform2f(u('centerHi'),cx[0],cy[0]); gl.uniform2f(u('centerLo'),cx[1],cy[1]);
        const reference = m.orbit(view.x, view.y, iterations);
        gl.activeTexture(gl.TEXTURE0);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,reference.length,1,0,gl.RGBA,gl.FLOAT,reference.data);
        const series = m.series(reference.data, reference.length, 32/view.zoom);
        gl.uniform1i(u('seriesIteration'),accelerated ? series.iteration : 0);
        gl.uniform4fv(u('series[0]'),series.coefficients);
        gl.uniform2fv(u('seriesInverse'),m.pair(m.fromNumber(1/series.radius)));
        gl.uniform2fv(u('pixelScale'),m.pair(m.fromNumber(3/(7*view.zoom))));
        gl.uniform1f(u('referenceOrbitLength'),reference.length);
        gl.uniform1f(u('zoom'),view.zoom); gl.uniform1i(u('maxIterations'),iterations);
        gl.viewport(0,0,9,7); gl.drawArrays(gl.TRIANGLES,0,6);
        const pixels = new Uint8Array(9*7*4); gl.readPixels(0,0,9,7,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
        if (gl.getError() || gl.isContextLost()) throw Error('GPU probe failed');
        let maximumError = 0, failures = [], escaped = 0;
        for(let y=0;y<7;y++) for(let x=0;x<9;x++) {
            const cr = m.parse(view.x) + offset + m.fromNumber(((x+0.5)/9-0.5)*9/7*3/view.zoom);
            const ci = m.parse(view.y) + m.fromNumber(((y+0.5)/7-0.5)*3/view.zoom);
            let zr=0n, zi=0n, expected=-1;
            for(let i=0;i<iterations;i++) {
                const next = (zr*zr-zi*zi)/m.SCALE+cr;
                zi=2n*zr*zi/m.SCALE+ci; zr=next;
                const magnitude = zr*zr+zi*zi;
                if(magnitude>4n*m.SCALE*m.SCALE) {
                    expected=Math.max(0,i+1-Math.log(0.5*Math.log(Number(magnitude)/Number(m.SCALE*m.SCALE)))/Math.LN2);
                    escaped++; break;
                }
            }
            const index=(y*9+x)*4;
            const actual=(pixels[index]*65536+pixels[index+1]*256+pixels[index+2])/256-1;
            const error=Math.abs(actual-expected);
            maximumError=Math.max(maximumError,error);
            if(error>0.25 || ((actual<0)!==(expected<0))) failures.push({x,y,actual,expected});
        }
        reports.push({accelerated, zoom:view.zoom, offset:view.offset || 0, maximumError, escaped, failures});
    }
    gl.deleteTexture(texture); gl.deleteBuffer(buffer); gl.deleteProgram(program);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    if(reports.some(r=>r.failures.length)) throw Error(JSON.stringify(reports));
    return reports;
})()
