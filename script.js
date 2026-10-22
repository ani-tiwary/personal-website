/* GPU Mandelbrot renderer. Public camera numbers remain compatible with the DOM
   scene projection; preciseCenterX/Y preserve all 70 decimal places for navigation. */
(() => {
    try {
        initializeRenderer();
    } catch (error) {
        // The content controller supplies navigation without graphics if startup fails.
        delete window.fractalRenderer;
        console.warn('Fractal renderer unavailable:', error);
    }

    function initializeRenderer() {
    const canvas = document.getElementById('fractalCanvas');
    const params = new URLSearchParams(location.search);
    const preferences = window.sitePreferences;
    let quality = preferences.getState().quality;
    const colourPalettes = { rainbow: 1, aurora: 2, opal: 3 };
    let colourPalette = colourPalettes[document.documentElement.dataset.theme] || 0;
    const gl = canvas.getContext('webgl', { preserveDrawingBuffer: params.get('capture') === 'on', antialias: false });
    if (!gl) {
        console.warn('WebGL is unavailable');
        return;
    }
    const math = FractalMath;
    gl.getExtension('OES_standard_derivatives');
    const floatTextures = gl.getExtension('OES_texture_float');
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS);
    const maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const DEEP_ZOOM = 20000;
    const MIN_ZOOM = 0.06561864456068546;
    const MAX_ZOOM = 1e26; // Leave room for float-pair residuals above float32 underflow.
    const MAX_ITERATIONS = 4096;
    let centerX = math.parse(-1.5), centerY = 0n, zoom = 1.35;
    let width = innerWidth, height = innerHeight, renderScale = 1;
    let mode = 'final', frame = 0, refinement = 0, animation = 0;
    let iterationLimit = MAX_ITERATIONS;
    let diagnostics = {};
    let adaptiveScale = 1, previousFrame = 0, slowFrames = 0, fastFrames = 0;
    let animationTarget = null;
    let cursorX = 0, cursorY = 0;
    let reference = null, pending = null, nextJob = 0, worker = null, workerError = null;
    let referenceTexture = null;
    const readyWaiters = new Set();

    function shader(type, source) {
        const result = gl.createShader(type);
        gl.shaderSource(result, source);
        gl.compileShader(result);
        if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(result));
        return result;
    }
    function createPipeline(source) {
        const program = gl.createProgram();
        gl.attachShader(program, shader(gl.VERTEX_SHADER, `attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0., 1.); }`));
        gl.attachShader(program, shader(gl.FRAGMENT_SHADER, source));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
        const position = gl.getAttribLocation(program, 'a_position');
        const uniforms = Object.fromEntries(['resolution', 'centerHi', 'centerLo', 'maxIterations',
            'useDoubleDouble', 'usePerturbation', 'pixelScale', 'series[0]', 'seriesIteration', 'seriesInverse',
            'referenceOrbit', 'referenceOrbitLength', 'referenceDelta', 'renderScale', 'colourPalette']
            .map(name => [name, gl.getUniformLocation(program, `u_${name}`)]));
        return { program, position, uniforms };
    }
    // Ordinary scenes should not depend on an expensive deep-zoom shader compiling.
    const basicPipeline = createPipeline('#define FRACTAL_BASIC\n' + window.fractalFragmentShaderSource);
    let precisePipeline = null, deepUnavailable = false;
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, -1,1, 1,-1, 1,1]), gl.STATIC_DRAW);

    function getState() {
        return { centerX: math.number(centerX), centerY: math.number(centerY), zoom,
            preciseCenterX: math.format(centerX), preciseCenterY: math.format(centerY), cursorX, cursorY };
    }
    function getMaxZoom() {
        return deepUnavailable ? DEEP_ZOOM - 1 : worker ? MAX_ZOOM : 1e10;
    }
    function emit(type = 'fractal:render') {
        window.dispatchEvent(new CustomEvent(type, { detail: getState() }));
    }
    function resize() {
        width = innerWidth; height = innerHeight;
        const deviceScale = Math.max(1, devicePixelRatio || 1);
        const pixels = width * height;
        let finalScale, interactiveScale;
        if (quality === 'high' || quality === 'native') {
            finalScale = quality === 'native' ? deviceScale : Math.max(2, deviceScale);
            interactiveScale = 1;
        } else {
            // A pixel budget prevents Retina and large laptop displays multiplying GPU work.
            const light = quality === 'low';
            interactiveScale = Math.min(light ? 0.65 : 1, Math.sqrt((light ? 500000 : 1000000) / pixels));
            if (!light) interactiveScale *= adaptiveScale;
            finalScale = Math.min(light ? 1 : 2, Math.sqrt((light ? 1200000 : 3000000) / pixels));
            if (!light) finalScale *= Math.max(0.6, adaptiveScale);
        }
        renderScale = Math.min(mode === 'interactive' ? interactiveScale : finalScale,
            maxViewport[0] / width, maxViewport[1] / height);
        const w = Math.max(1, Math.round(width * renderScale)), h = Math.max(1, Math.round(height * renderScale));
        // Resizing an unchanged canvas clears it and reallocates GPU storage.
        if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
        gl.viewport(0, 0, w, h);
    }
    function referenceFits(candidate) {
        if (!candidate) return false;
        const distance = Math.hypot(math.number(centerX - candidate.x), math.number(centerY - candidate.y));
        return distance <= 8 / candidate.zoom;
    }
    function resolveReady() {
        if (diagnostics.pendingReference) return;
        for (const resolve of readyWaiters) resolve({ ...diagnostics });
        readyWaiters.clear();
    }
    function failWorker(message) {
        workerError = message;
        worker?.terminate(); worker = null; pending = null;
        zoom = Math.min(zoom, 1e10);
        queueRender();
    }
    if (floatTextures && typeof Worker !== 'undefined') {
        try {
            worker = new Worker('fractal-worker.js');
            worker.onerror = event => { event.preventDefault(); failWorker(event.message || 'Reference worker unavailable'); };
            worker.onmessage = ({ data }) => {
                if (!pending || data.id !== pending.id) return;
                const job = pending; pending = null;
                if (data.error) { failWorker(data.error); return; }
                // Never upload stale work after a scene change. The next frame requests the current view.
                if (referenceFits(job) && zoom >= DEEP_ZOOM) {
                    reference = { ...job, length: data.length, series: data.series, milliseconds: data.milliseconds };
                    referenceTexture ||= gl.createTexture();
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D, referenceTexture);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, data.length, 1, 0, gl.RGBA, gl.FLOAT, data.data);
                }
                queueRender();
            };
        } catch (error) { workerError = error.message; }
    }
    function prepareReference() {
        if (!worker) return false;
        const usable = referenceFits(reference);
        // Reuse the live orbit while preparing a tighter series for deeper zooms.
        const optimal = usable && zoom <= reference.zoom * 8 && zoom >= reference.zoom / 8;
        if (!optimal && !pending) {
            pending = { id: ++nextJob, x: centerX, y: centerY, zoom, deltaBound: 32 / zoom };
            worker.postMessage({ id: pending.id, real: math.format(centerX), imaginary: math.format(centerY),
                deltaBound: pending.deltaBound, iterations: Math.min(MAX_ITERATIONS, maxTexture - 1) });
        }
        return usable;
    }
    function render() {
        const now = performance.now();
        if (mode === 'interactive' && quality === 'auto') {
            const elapsed = now - previousFrame;
            if (previousFrame && elapsed < 2000) {
                slowFrames = elapsed > 32 ? slowFrames + 1 : 0;
                fastFrames = elapsed < 20 ? fastFrames + 1 : 0;
                if (slowFrames >= 3) { adaptiveScale = Math.max(0.4, adaptiveScale * 0.8); slowFrames = 0; }
                if (fastFrames >= 45) { adaptiveScale = Math.min(1, adaptiveScale + 0.1); fastFrames = 0; }
            }
            previousFrame = now;
        } else { previousFrame = 0; slowFrames = 0; fastFrames = 0; }
        if (zoom >= DEEP_ZOOM && !precisePipeline && !deepUnavailable) {
            try { precisePipeline = createPipeline(window.fractalFragmentShaderSource); }
            catch (error) {
                deepUnavailable = true;
                console.warn('Deep zoom unavailable; retaining the lightweight renderer:', error);
            }
        }
        if (deepUnavailable) zoom = Math.min(zoom, DEEP_ZOOM - 1);
        const deep = zoom >= DEEP_ZOOM;
        const { program, position, uniforms } = deep ? precisePipeline : basicPipeline;
        const usePerturbation = deep && prepareReference();
        const iterations = Math.min(iterationLimit, MAX_ITERATIONS,
            Math.max(120, Math.floor(120 + Math.log2(Math.max(1, zoom)) * 45 + Math.max(0, Math.log2(zoom / DEEP_ZOOM)) * 20)));
        diagnostics = { mode, scale: renderScale, iterations, quality, adaptiveScale, deepUnavailable, colourPalette,
            precision: usePerturbation ? 'reference-orbit perturbation' : (deep ? 'double-double' : 'direct'),
            pendingReference: deep && !!worker && !usePerturbation,
            precisionFallback: deep && !worker ? (workerError || 'Float textures or workers unavailable') : null,
            referenceMilliseconds: reference?.milliseconds || 0, referenceBuilds: nextJob, skippedIterations: 0,
            pixels: canvas.width * canvas.height };
        // Retain the last complete frame during a new very deep reference calculation.
        // Reused references render immediately throughout ordinary dragging and zooming.
        if (diagnostics.pendingReference && zoom > 1e9) { emit(); return; }
        resize();
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(position);
        gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
        const x = math.pair(centerX), y = math.pair(centerY);
        gl.uniform2f(uniforms.resolution, canvas.width, canvas.height);
        gl.uniform2fv(uniforms.pixelScale, math.pair(math.fromNumber(3 / (canvas.height * zoom))));
        gl.uniform1f(uniforms.renderScale, renderScale);
        gl.uniform1f(uniforms.colourPalette, colourPalette);
        gl.uniform2f(uniforms.centerHi, x[0], y[0]);
        gl.uniform2f(uniforms.centerLo, x[1], y[1]);
        gl.uniform1i(uniforms.maxIterations, iterations);
        gl.uniform1f(uniforms.useDoubleDouble, deep ? 1 : 0);
        gl.uniform1f(uniforms.usePerturbation, usePerturbation ? 1 : 0);
        if (usePerturbation) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, referenceTexture);
            gl.uniform1i(uniforms.referenceOrbit, 0);
            gl.uniform1f(uniforms.referenceOrbitLength, reference.length);
            const dx = math.number(centerX - reference.x), dy = math.number(centerY - reference.y);
            gl.uniform4fv(uniforms.referenceDelta, [...math.pair(centerX-reference.x), ...math.pair(centerY-reference.y)]);
            const bound = Math.hypot(dx, dy) + Math.hypot(width / height, 1) * 1.5 / zoom;
            const skip = bound <= reference.series.radius && reference.series.iteration < iterations ? reference.series.iteration : 0;
            gl.uniform1i(uniforms.seriesIteration, skip);
            gl.uniform4fv(uniforms['series[0]'], reference.series.coefficients);
            gl.uniform2fv(uniforms.seriesInverse, math.pair(math.fromNumber(1/reference.series.radius)));
            diagnostics.skippedIterations = skip;
        }
        gl.drawArrays(gl.TRIANGLES, 0, 6);
        diagnostics.scale = renderScale; diagnostics.pixels = canvas.width * canvas.height;
        emit(); resolveReady();
    }
    function queueRender() {
        if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); });
    }
    function refine() {
        clearTimeout(refinement); refinement = 0;
        mode = 'final'; queueRender();
    }
    function interact() {
        mode = 'interactive'; queueRender();
        clearTimeout(refinement);
        // Trackpad momentum often pauses briefly; avoid a costly full-size frame mid-gesture.
        refinement = setTimeout(refine, 280);
    }
    function stopAnimation() {
        cancelAnimationFrame(animation); animation = 0;
        animationTarget = null;
        iterationLimit = MAX_ITERATIONS;
    }
    function parseCamera(camera) {
        const coordinate = axis => {
            const ordinary = camera[`center${axis}`], precise = camera[`preciseCenter${axis}`];
            return math.parse(precise != null && (ordinary == null || Number(ordinary) === Number(precise)) ? precise : ordinary);
        };
        const x = coordinate('X'), y = coordinate('Y');
        const scale = Number(camera.zoom);
        if (!Number.isFinite(scale) || scale <= 0 || Math.abs(math.number(x)) > 1e6 || Math.abs(math.number(y)) > 1e6) {
            throw Error('Invalid fractal camera');
        }
        return { x, y, zoom: Math.max(MIN_ZOOM, Math.min(getMaxZoom(), scale)) };
    }
    function setCamera(camera) {
        const next = parseCamera(camera);
        stopAnimation(); clearTimeout(refinement); cancelAnimationFrame(frame); frame = 0;
        centerX = next.x; centerY = next.y; zoom = next.zoom; mode = 'final';
        render(); emit('fractal:camera-settled');
    }
    function moveTo(camera, duration) {
        const target = parseCamera(camera);
        if (preferences.getState().reduceMotion || (Number.isFinite(duration) && duration <= 0)) { setCamera(camera); return; }
        stopAnimation(); clearTimeout(refinement); mode = 'interactive';
        animationTarget = camera;
        const start = { x: centerX, y: centerY, zoom };
        const trip = CameraTravel.plan(start, target, {
            aspect: width / height, minZoom: MIN_ZOOM, maxZoom: getMaxZoom(),
            minOverviewZoom: window.siteScenes.find(scene => scene.id === 'home').camera.zoom
        });
        duration = Number.isFinite(duration) ? duration : trip.duration;
        if (!trip.tracks.length) { setCamera(camera); return; }
        const began = performance.now();
        function tick(now) {
            // A frame's timestamp can precede a click handled in that same frame.
            // Clamp the lower bound too, so the camera stays at the starting point.
            const progress = Math.max(0, Math.min(1, (now - began) / Math.max(1, duration)));
            const next = CameraTravel.sample(trip, progress);
            centerX = next.x; centerY = next.y; zoom = Math.max(MIN_ZOOM, next.zoom);
            render();
            if (progress < 1) animation = requestAnimationFrame(tick);
            else { animation = 0; setCamera(camera); }
        }
        animation = requestAnimationFrame(tick);
    }
    function pan(dx, dy) {
        centerX += math.fromNumber(-dx * 3 / (height * zoom));
        centerY += math.fromNumber(dy * 3 / (height * zoom));
    }
    function zoomAt(factor, x, y) {
        const next = Math.max(MIN_ZOOM, Math.min(getMaxZoom(), zoom * factor));
        const shift = 3 / zoom - 3 / next;
        centerX += math.fromNumber((x - width / 2) / height * shift);
        centerY += math.fromNumber((height / 2 - y) / height * shift);
        zoom = next;
    }
    function handleWheel(event) {
        if (event.defaultPrevented || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
        const scroll = event.target.closest('.scene-scroll');
        // Let long sections scroll while there is content in this direction.
        // Pinch gestures and wheels over ordinary text still zoom the fractal.
        if (scroll && !event.ctrlKey) {
            const canScroll = event.deltaY < 0 ? scroll.scrollTop > 1
                : event.deltaY > 0 && scroll.scrollTop + scroll.clientHeight < scroll.scrollHeight - 1;
            if (canScroll) return;
        }
        event.preventDefault(); stopAnimation();
        const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1;
        let delta = Math.max(-120, Math.min(120, event.deltaY * units));
        if (event.deltaMode === 0 && !event.ctrlKey) {
            // Boost small trackpad deltas while retaining a 120px mouse-wheel step.
            const magnitude = Math.abs(delta);
            delta = Math.sign(delta) * (magnitude <= 40 ? magnitude * 2.5 : 100 + (magnitude - 40) * 0.25);
        }
        const sensitivity = preferences.getState().scrollSensitivity;
        zoomAt(Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0018) * sensitivity), event.clientX, event.clientY);
        interact();
    }
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    document.getElementById('sceneContent').addEventListener('wheel', handleWheel, { passive: false });
    const pointers = new Map();
    function gesture() {
        const points = [...pointers.values()];
        return points.length === 1 ? { ...points[0], distance: 0 } : {
            x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2,
            distance: Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y)
        };
    }
    canvas.addEventListener('pointerdown', event => {
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        stopAnimation(); clearTimeout(refinement);
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', event => {
        cursorX = math.number(centerX) + (event.clientX - width / 2) * 3 / (height * zoom);
        cursorY = math.number(centerY) + (height / 2 - event.clientY) * 3 / (height * zoom);
        if (!pointers.has(event.pointerId)) return;
        const before = gesture();
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        const after = gesture();
        pan(after.x - before.x, after.y - before.y);
        if (before.distance > 0 && after.distance > 0) zoomAt(after.distance / before.distance, after.x, after.y);
        mode = 'interactive'; queueRender();
    });
    function release(event) {
        pointers.delete(event.pointerId);
        if (!pointers.size) refine();
    }
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('lostpointercapture', release);
    window.addEventListener('resize', () => { width = innerWidth; height = innerHeight; queueRender(); });
    function reveal() {
        if (preferences.getState().reduceMotion) return;
        stopAnimation(); mode = 'interactive';
        const began = performance.now();
        const ease = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        function reveal(now) {
            const t = Math.max(0, Math.min(1, (now - began) / 1800));
            iterationLimit = Math.max(1, Math.floor(MAX_ITERATIONS * ease(t)));
            render();
            if (t < 1) animation = requestAnimationFrame(reveal);
            else { animation = 0; iterationLimit = MAX_ITERATIONS; refine(); }
        }
        animation = requestAnimationFrame(reveal);
    }
    window.fractalRenderer = {
        getState, getMaxZoom, setCamera, moveTo, render, reveal,
        getMinZoom: () => MIN_ZOOM,
        getDiagnostics: () => ({ ...diagnostics }),
        getResolution: () => ({ cssWidth: width, cssHeight: height, pixelWidth: canvas.width, pixelHeight: canvas.height, scale: renderScale }),
        whenReady() {
            if (!diagnostics.pendingReference) return Promise.resolve({ ...diagnostics });
            return new Promise(resolve => readyWaiters.add(resolve));
        }
    };
    window.addEventListener('site:theme', ({ detail }) => {
        const nextPalette = colourPalettes[detail.theme] || 0;
        if (nextPalette === colourPalette) return;
        colourPalette = nextPalette;
        queueRender();
    });
    window.addEventListener('site:preferences', ({ detail }) => {
        if (quality !== detail.quality) {
            quality = detail.quality;
            adaptiveScale = 1;
            queueRender();
        }
        if (detail.reduceMotion && animation) {
            if (animationTarget) setCamera(animationTarget);
            else { stopAnimation(); refine(); }
        }
    });
    window.addEventListener('pagehide', event => { if (!event.persisted) worker?.terminate(); });
    render();
    }
})();
