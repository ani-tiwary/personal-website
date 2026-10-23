// A small, independent GPU surface: pointer movement never redraws the main view.
(() => {
    const renderer = window.fractalRenderer;
    if (!renderer) return;
    const panel = document.getElementById('juliaPreview');
    const canvas = document.getElementById('juliaCanvas');
    const caption = document.getElementById('juliaParameter');
    const preferences = window.sitePreferences;
    const palettes = { rainbow: 1, aurora: 2, opal: 3 };
    let gl, program, uniforms;
    let enabled = false, lost = false, frame = 0, previousTime = 0;
    let pointer = null, current = null;
    let target = { x: 0, y: 0 };
    window.juliaPreviewRenderer = { unavailable: false };

    function initialize() {
        gl = canvas.getContext('webgl', { antialias: false,
            preserveDrawingBuffer: new URLSearchParams(location.search).get('capture') === 'on' });
        if (!gl) throw Error('Julia preview WebGL unavailable');
        gl.getExtension('OES_standard_derivatives');
        program = gl.createProgram();
        for (const [type, source] of [
            [gl.VERTEX_SHADER, 'attribute vec2 position; void main() { gl_Position = vec4(position, 0., 1.); }'],
            [gl.FRAGMENT_SHADER, '#define FRACTAL_BASIC\n#define FRACTAL_JULIA\n' + window.fractalFragmentShaderSource]
        ]) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
            gl.attachShader(program, shader);
            gl.deleteShader(shader);
        }
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        const buffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);
        const position = gl.getAttribLocation(program, 'position');
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        uniforms = Object.fromEntries(['resolution', 'pixelScale', 'renderScale', 'colourPalette', 'maxIterations', 'juliaParameter']
            .map(name => [name, gl.getUniformLocation(program, `u_${name}`)]));
    }

    function updateTarget() {
        const camera = renderer.getState();
        const { cssWidth: width, cssHeight: height } = renderer.getResolution();
        const x = pointer?.x ?? width / 2, y = pointer?.y ?? height / 2;
        target = {
            x: camera.centerX + (x - width / 2) * 3 / (height * camera.zoom),
            y: camera.centerY + (height / 2 - y) * 3 / (height * camera.zoom)
        };
        schedule();
    }

    function schedule() {
        if (enabled && !lost && !document.hidden && !frame) frame = requestAnimationFrame(draw);
    }

    function stop() {
        cancelAnimationFrame(frame);
        frame = 0;
        previousTime = 0;
    }

    function draw(now) {
        frame = 0;
        const state = preferences.getState();
        // Time-based easing stays consistent across refresh rates. Reduced motion
        // still follows deliberate input, but without interpolated animation.
        const elapsed = previousTime ? Math.min(100, now - previousTime) : 16;
        const blend = state.reduceMotion ? 1 : 1 - Math.exp(-elapsed / 55);
        if (!current) current = { ...target };
        current.x += (target.x - current.x) * blend;
        current.y += (target.y - current.y) * blend;
        const moving = Math.hypot(target.x - current.x, target.y - current.y) > 0.000001;
        if (!moving) current = { ...target };
        const cssSize = canvas.getBoundingClientRect().width;
        const density = state.quality === 'low' ? 1 : Math.min(2, devicePixelRatio || 1);
        const size = Math.max(1, Math.min(512, Math.round(cssSize * density)));
        if (canvas.width !== size || canvas.height !== size) { canvas.width = size; canvas.height = size; }
        gl.viewport(0, 0, size, size);
        gl.uniform2f(uniforms.resolution, size, size);
        gl.uniform2f(uniforms.pixelScale, 3.6 / size, 0);
        gl.uniform1f(uniforms.renderScale, size / Math.max(1, cssSize));
        gl.uniform1f(uniforms.colourPalette, palettes[document.documentElement.dataset.theme] || 0);
        gl.uniform1i(uniforms.maxIterations, state.quality === 'low' ? 128 : 256);
        gl.uniform2f(uniforms.juliaParameter, current.x, current.y);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        caption.textContent = `${current.x.toFixed(4)} ${current.y < 0 ? '−' : '+'} ${Math.abs(current.y).toFixed(4)}i`;
        previousTime = moving ? now : 0;
        if (moving) schedule();
    }

    function fail(error) {
        stop();
        enabled = false;
        panel.hidden = true;
        window.juliaPreviewRenderer.unavailable = true;
        preferences.set('juliaPreview', 'off');
        console.warn('Julia preview unavailable:', error);
    }

    function updatePreferences() {
        const next = preferences.getState().juliaPreview === 'on' && !window.juliaPreviewRenderer.unavailable;
        if (!next) { enabled = false; panel.hidden = true; current = null; stop(); return; }
        try {
            if (!gl) initialize();
            enabled = true;
            panel.hidden = false;
            updateTarget();
        } catch (error) { fail(error); }
    }

    window.addEventListener('pointermove', event => {
        if (!event.isPrimary || !event.target.closest('#fractalCanvas, #sceneContent')) return;
        pointer = { x: event.clientX, y: event.clientY };
        if (enabled) updateTarget();
    });
    window.addEventListener('fractal:render', () => { if (enabled) updateTarget(); });
    window.addEventListener('site:preferences', updatePreferences);
    window.addEventListener('site:theme', schedule);
    window.addEventListener('resize', () => { if (enabled) updateTarget(); });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop();
        else if (enabled) updateTarget();
    });
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); lost = true; stop(); panel.hidden = true; });
    canvas.addEventListener('webglcontextrestored', () => {
        lost = false; gl = null;
        updatePreferences();
    });
    window.addEventListener('pagehide', stop);
    window.addEventListener('pageshow', () => { if (enabled) updateTarget(); });
    updatePreferences();
})();
