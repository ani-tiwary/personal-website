const canvas = document.getElementById('fractalCanvas');
// Preserve the last frame so deterministic browser captures see the same pixels as users.
const captureMode = new URLSearchParams(window.location.search).get('capture') === 'on';
const glOptions = { preserveDrawingBuffer: captureMode };
const gl = canvas.getContext('webgl', glOptions) || canvas.getContext('experimental-webgl', glOptions);

if (!gl) {
    alert('WebGL not supported. Please use a modern browser.');
}

let width = window.innerWidth;
let height = window.innerHeight;
let renderScale = 1;
let renderMode = 'final';
let pendingInteractiveFrame = 0;
let refinementTimer = 0;
canvas.style = "position: absolute; top: 0px; left: 0px; right: 0px; bottom: 0px; margin: auto;";

function resizeDrawingBuffer() {
    width = window.innerWidth;
    height = window.innerHeight;

    const quality = new URLSearchParams(window.location.search).get('quality');
    const deviceScale = Math.max(1, window.devicePixelRatio || 1);
    const finalScale = quality === 'native' ? deviceScale : Math.max(2, deviceScale);
    const desiredScale = renderMode === 'interactive' ? 1 : finalScale;
    const maxViewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) || [width * finalScale, height * finalScale];
    renderScale = Math.min(desiredScale, maxViewport[0] / width, maxViewport[1] / height);

    canvas.width = Math.max(1, Math.round(width * renderScale));
    canvas.height = Math.max(1, Math.round(height * renderScale));
    gl.viewport(0, 0, canvas.width, canvas.height);
}

resizeDrawingBuffer();

function setRenderMode(mode) {
    if (renderMode === mode) return;
    renderMode = mode;
    resizeDrawingBuffer();
}

function refineRender() {
    clearTimeout(refinementTimer);
    refinementTimer = 0;
    setRenderMode('final');
    render();
}

function scheduleRefinement(delay = 140) {
    clearTimeout(refinementTimer);
    refinementTimer = setTimeout(refineRender, delay);
}

function requestInteractiveRender() {
    setRenderMode('interactive');
    if (!pendingInteractiveFrame) {
        pendingInteractiveFrame = requestAnimationFrame(() => {
            pendingInteractiveFrame = 0;
            render();
        });
    }
    scheduleRefinement();
}

// Vertex shader - simple full-screen quad
const vertexShaderSource = `
    attribute vec2 a_position;
    void main() {
        gl_Position = vec4(a_position, 0.0, 1.0);
    }
`;

// Fragment shader - Mandelbrot set with adaptive precision
const legacyFragmentShaderSource = `
    precision highp float;
    uniform vec2 u_resolution;
    uniform float u_zoom;
    uniform vec2 u_center;
    uniform vec2 u_centerHigh;  // High precision center offset
    uniform int u_maxIterations;
    uniform float u_useHighPrecision;  // 1.0 if zoom > threshold, 0.0 otherwise
    
    // Fast single precision Mandelbrot (used at low zoom)
    int mandelbrot_single(vec2 c) {
        vec2 z = vec2(0.0, 0.0);
        for (int i = 0; i < 1000; i++) {
            if (i >= u_maxIterations) break;
            if (dot(z, z) > 4.0) return i;
            float x = (z.x * z.x - z.y * z.y) + c.x;
            float y = (z.x * z.y * 2.0) + c.y;
            z = vec2(x, y);
        }
        return u_maxIterations;
    }
    
    // Double-double arithmetic functions (used at high zoom)
    vec2 dd_add(vec2 a, vec2 b) {
        float s = a.x + b.x;
        float v = s - a.x;
        float e = (a.x - (s - v)) + (b.x - v);
        e += a.y + b.y;
        return vec2(s, e);
    }
    
    vec2 dd_mul(vec2 a, vec2 b) {
        float p = a.x * b.x;
        float e = (a.x * b.x) - p;
        e += a.x * b.y + a.y * b.x;
        return vec2(p, e);
    }
    
    vec2 dd_sqr(vec2 a) {
        float p = a.x * a.x;
        float e = (a.x * a.x) - p;
        e += 2.0 * a.x * a.y;
        return vec2(p, e);
    }
    
    float dd_mag2(vec2 real, vec2 imag) {
        vec2 real2 = dd_sqr(real);
        vec2 imag2 = dd_sqr(imag);
        vec2 sum = dd_add(real2, imag2);
        return sum.x + sum.y;
    }
    
    // High precision Mandelbrot (used at high zoom)
    int mandelbrot_double(vec2 c_single, vec2 centerHigh) {
        // Reconstruct c with high precision
        // c_single already includes u_center, so we add the high precision correction
        vec2 c_real = vec2(c_single.x, 0.0);
        vec2 c_imag = vec2(c_single.y, 0.0);
        c_real = dd_add(c_real, vec2(centerHigh.x, 0.0));
        c_imag = dd_add(c_imag, vec2(centerHigh.y, 0.0));
        
        vec2 z_real = vec2(0.0, 0.0);
        vec2 z_imag = vec2(0.0, 0.0);
        
        for (int i = 0; i < 1000; i++) {
            if (i >= u_maxIterations) break;
            if (dd_mag2(z_real, z_imag) > 4.0) return i;
            
            // z = z^2 + c using double-double arithmetic
            vec2 z_real_sq = dd_sqr(z_real);
            vec2 z_imag_sq = dd_sqr(z_imag);
            vec2 z_real_imag = dd_mul(z_real, z_imag);
            
            // real part: z_real^2 - z_imag^2 + c_real
            vec2 real_diff = dd_add(z_real_sq, vec2(-z_imag_sq.x, -z_imag_sq.y));
            z_real = dd_add(real_diff, c_real);
            
            // imag part: 2 * z_real * z_imag + c_imag
            vec2 imag_prod = dd_add(z_real_imag, z_real_imag);
            z_imag = dd_add(imag_prod, c_imag);
        }
        return u_maxIterations;
    }
    
    void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution;
        float aspect = u_resolution.x / u_resolution.y;
        vec2 c = (uv - 0.5) * vec2(aspect, 1.0) * 3.0 / u_zoom + u_center;
        
        int iterations;
        if (u_useHighPrecision > 0.5) {
            iterations = mandelbrot_double(c, u_centerHigh);
        } else {
            iterations = mandelbrot_single(c);
        }
        
        // Enhanced grayscale gradient with rich gray variations
        // Points in the set (max iterations) = black
        // Points that escaped get various shades of gray based on iteration count
        float color;
        if (iterations == u_maxIterations) {
            color = 0.0; // Black for points in the set
        } else {
            // Normalize iteration count
            float normalized = float(iterations) / float(u_maxIterations);
            
            // Create many distinct gray bands with smooth transitions
            // More bands in darker ranges for richer black/gray variation
            float gray;
            
            // Use a piecewise function with many more gray levels
            if (normalized < 0.05) {
                // Very light gray
                gray = mix(0.98, 0.92, normalized / 0.05);
            } else if (normalized < 0.1) {
                // Light gray
                gray = mix(0.92, 0.85, (normalized - 0.05) / 0.05);
            } else if (normalized < 0.15) {
                // Light-medium gray
                gray = mix(0.85, 0.78, (normalized - 0.1) / 0.05);
            } else if (normalized < 0.22) {
                // Medium-light gray
                gray = mix(0.78, 0.68, (normalized - 0.15) / 0.07);
            } else if (normalized < 0.3) {
                // Medium gray
                gray = mix(0.68, 0.58, (normalized - 0.22) / 0.08);
            } else if (normalized < 0.38) {
                // Medium gray (darker)
                gray = mix(0.58, 0.48, (normalized - 0.3) / 0.08);
            } else if (normalized < 0.46) {
                // Medium-dark gray
                gray = mix(0.48, 0.38, (normalized - 0.38) / 0.08);
            } else if (normalized < 0.54) {
                // Dark gray
                gray = mix(0.38, 0.28, (normalized - 0.46) / 0.08);
            } else if (normalized < 0.62) {
                // Dark gray (darker)
                gray = mix(0.28, 0.20, (normalized - 0.54) / 0.08);
            } else if (normalized < 0.70) {
                // Very dark gray
                gray = mix(0.20, 0.14, (normalized - 0.62) / 0.08);
            } else if (normalized < 0.78) {
                // Very dark gray (darker)
                gray = mix(0.14, 0.09, (normalized - 0.70) / 0.08);
            } else if (normalized < 0.85) {
                // Nearly black
                gray = mix(0.09, 0.05, (normalized - 0.78) / 0.07);
            } else if (normalized < 0.91) {
                // Almost black
                gray = mix(0.05, 0.025, (normalized - 0.85) / 0.06);
            } else if (normalized < 0.96) {
                // Very nearly black
                gray = mix(0.025, 0.01, (normalized - 0.91) / 0.05);
            } else {
                // Extremely dark, almost pure black
                gray = mix(0.01, 0.002, (normalized - 0.96) / 0.04);
            }
            
            // Add subtle banding/texture for more visual interest
            // Creates fine detail in the gray transitions
            float banding = sin(normalized * 30.0) * 0.025;
            gray = clamp(gray + banding, 0.0, 1.0);
            
            // Add micro-variation for smoother transitions and more texture
            float microVariation = sin(normalized * 60.0 + float(iterations) * 0.15) * 0.012;
            gray = clamp(gray + microVariation, 0.0, 1.0);
            
            // Add additional fine detail variation
            float fineDetail = sin(normalized * 100.0 + float(iterations) * 0.3) * 0.008;
            gray = clamp(gray + fineDetail, 0.0, 1.0);
            
            color = gray;
        }
        
        gl_FragColor = vec4(color, color, color, 1.0);
    }
`;

const fragmentShaderSource = window.fractalFragmentShaderSource || legacyFragmentShaderSource;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    
    return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program linking error:', gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    
    return program;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
const program = createProgram(gl, vertexShader, fragmentShader);

// Create full-screen quad
const positionBuffer = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
const positions = [
    -1, -1,
     1, -1,
    -1,  1,
    -1,  1,
     1, -1,
     1,  1,
];
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);

// Get attribute and uniform locations
const positionLocation = gl.getAttribLocation(program, 'a_position');
const resolutionLocation = gl.getUniformLocation(program, 'u_resolution');
const zoomLocation = gl.getUniformLocation(program, 'u_zoom');
const centerHiLocation = gl.getUniformLocation(program, 'u_centerHi');
const centerLoLocation = gl.getUniformLocation(program, 'u_centerLo');
const maxIterationsLocation = gl.getUniformLocation(program, 'u_maxIterations');
const useDoubleDoubleLocation = gl.getUniformLocation(program, 'u_useDoubleDouble');

// View state
let zoom = 1.35;
let centerX = -1.5;
let centerY = 0.0;
let maxIterations = 1;

// Debug info - cursor tracking
let cursorFractalX = 0;
let cursorFractalY = 0;

// Debug mode
let debugMode = false;
let savedLocations = [];

// Panning state
let isDragging = false;
let lastX = 0;
let lastY = 0;

// Iteration animation state
let isAnimatingIterations = true;
let iterationAnimationStartTime = performance.now();
let iterationAnimationDuration = 3800; // 3.8 seconds

// Easing function for smooth animation (ease-in-out)
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Smooth movement animation state
let isAnimatingMovement = false;
let movementAnimationStartTime = 0;
let movementAnimationDuration = 2000; // 2 seconds default
let movementStartZoom = 1.35;
let movementStartCenterX = -1.5;
let movementStartCenterY = 0.0;
let movementTargetZoom = 1.35;
let movementTargetCenterX = -1.5;
let movementTargetCenterY = 0.0;
let movementPhase = 'position'; // 'position' or 'zoom' - controls animation order
let movementNeedsReset = false; // Flag for high zoom reset
let movementOriginalTarget = null; // Store original target when reset is needed

/**
 * Smoothly animates the canvas to a specific center coordinate and zoom level
 * Can be called with either:
 * - A scene name (string): smoothMoveTo('Scene Name', duration)
 * - Coordinates: smoothMoveTo(targetCenterX, targetCenterY, targetZoom, duration)
 * 
 * @param {string|number} sceneNameOrX - Scene name (string) or target center X coordinate (number)
 * @param {number} [targetCenterY] - Target center Y coordinate (if first arg is number)
 * @param {number} [targetZoom] - Target zoom level (if first arg is number)
 * @param {number} [duration] - Animation duration in milliseconds (default: 2000)
 */
function smoothMoveTo(sceneNameOrX, targetCenterY, targetZoom, duration = 2000) {
    clearTimeout(refinementTimer);
    setRenderMode('interactive');
    let targetCenterX, finalTargetCenterY, finalTargetZoom, finalDuration;
    
    // Check if first argument is a string (scene name)
    if (typeof sceneNameOrX === 'string') {
        // Look up scene by name
        if (typeof sceneCoordinates === 'undefined' || !sceneCoordinates) {
            console.error('Scene coordinates not loaded. Cannot find scene:', sceneNameOrX);
            return;
        }
        
        const scene = sceneCoordinates.find(s => s.name === sceneNameOrX);
        if (!scene) {
            console.error('Scene not found:', sceneNameOrX);
            console.log('Available scenes:', sceneCoordinates.map(s => s.name));
            return;
        }
        
        targetCenterX = scene.centerX;
        finalTargetCenterY = scene.centerY;
        finalTargetZoom = scene.zoom;
        // If second argument is provided and is a number, use it as duration
        finalDuration = (typeof targetCenterY === 'number' && targetCenterY > 0) ? targetCenterY : duration;
    } else {
        // Original behavior: coordinates provided
        targetCenterX = sceneNameOrX;
        finalTargetCenterY = targetCenterY;
        finalTargetZoom = targetZoom;
        finalDuration = duration;
    }
    
    // If current zoom is > 2, first return to the home scale.
    if (zoom > 2.0) {
        movementNeedsReset = true;
        // Store original target for after reset
        movementOriginalTarget = {
            centerX: targetCenterX,
            centerY: finalTargetCenterY,
            zoom: finalTargetZoom,
            duration: finalDuration
        };
        const pos0Scene = sceneCoordinates && sceneCoordinates.find(s => s.name === 'home');
        if (pos0Scene) {
            // Zoom to pos0's zoom level at current position (don't change x,y)
            movementStartZoom = zoom;
            movementStartCenterX = centerX;
            movementStartCenterY = centerY;
            movementTargetZoom = pos0Scene.zoom; // Zoom to pos0's zoom level first
            movementTargetCenterX = centerX; // Keep current position
            movementTargetCenterY = centerY; // Keep current position
            movementAnimationDuration = 500; // Quick reset
            movementPhase = 'zoom'; // Zoom to pos0 first (position stays constant)
            movementAnimationStartTime = performance.now();
            isAnimatingMovement = true;
            animateMovement();
            return; // Will continue to target position after reset completes
        } else {
            // If pos0 not found, fall back to original behavior
            console.warn('pos0 scene not found, proceeding without reset');
        }
    }
    
    // Store starting values
    movementStartZoom = zoom;
    movementStartCenterX = centerX;
    movementStartCenterY = centerY;
    
    // Store target values
    movementTargetZoom = finalTargetZoom;
    movementTargetCenterX = targetCenterX;
    movementTargetCenterY = finalTargetCenterY;
    
    // Set animation parameters
    // Split duration: half for position, half for zoom
    movementAnimationDuration = finalDuration / 2;
    movementNeedsReset = false;
    movementAnimationStartTime = performance.now();
    isAnimatingMovement = true;
    
    // Determine animation order based on zoom direction
    // Zooming in (target > start): position first, then zoom
    // Zooming out (target < start): zoom first, then position
    const isZoomingIn = finalTargetZoom > zoom;
    movementPhase = isZoomingIn ? 'position' : 'zoom';
    
    // Start animation loop
    animateMovement();
}

/**
 * Animation loop for smooth movement
 * Animates position first, then zoom, for smoother visual experience
 */
function animateMovement() {
    if (!isAnimatingMovement) return;
    
    const currentTime = performance.now();
    const elapsed = currentTime - movementAnimationStartTime;
    const progress = Math.min(elapsed / movementAnimationDuration, 1.0);
    
    // Apply easing function for smooth animation
    const eased = easeInOutCubic(progress);
    
    if (movementPhase === 'position') {
        // Position phase: Move position (keep zoom constant)
        centerX = movementStartCenterX + (movementTargetCenterX - movementStartCenterX) * eased;
        centerY = movementStartCenterY + (movementTargetCenterY - movementStartCenterY) * eased;
        
        // Keep zoom constant during position movement
        zoom = movementStartZoom;
        
        render();
        
        if (progress >= 1.0) {
            // Position phase complete, now start zoom phase
            movementPhase = 'zoom';
            // Store the zoom at the start of zoom phase (should be same as movementStartZoom)
            movementStartZoom = zoom;
            movementStartCenterX = centerX;
            movementStartCenterY = centerY;
            movementAnimationStartTime = performance.now();
            // Continue to zoom phase immediately
            requestAnimationFrame(animateMovement);
            return;
        } else {
            // Position phase - continue animation if not complete
            requestAnimationFrame(animateMovement);
            return;
        }
    }
    
    if (movementPhase === 'zoom') {
        // Zoom phase: Zoom to target
        // Recalculate progress for zoom phase (starts fresh)
        const zoomElapsed = currentTime - movementAnimationStartTime;
        const zoomProgress = Math.min(zoomElapsed / movementAnimationDuration, 1.0);
        const zoomEased = easeInOutCubic(zoomProgress);
        
        // Interpolate zoom (use exponential interpolation for zoom to feel more natural)
        // For very large zoom differences, use logarithmic interpolation for better precision
        const zoomRatio = movementTargetZoom / movementStartZoom;
        if (zoomRatio > 100 || zoomRatio < 0.01) {
            // For very large ratios, use logarithmic interpolation to avoid precision issues
            const logStart = Math.log(movementStartZoom);
            const logTarget = Math.log(movementTargetZoom);
            const logCurrent = logStart + (logTarget - logStart) * zoomEased;
            zoom = Math.exp(logCurrent);
        } else {
            // Normal exponential interpolation for smaller ratios
            zoom = movementStartZoom * Math.pow(zoomRatio, zoomEased);
        }
        
        // During zoom phase, position behavior depends on whether we're zooming in or out
        const isZoomingIn = movementTargetZoom > movementStartZoom;
        if (isZoomingIn) {
            // Zooming in: position already at target (set during position phase)
            centerX = movementTargetCenterX;
            centerY = movementTargetCenterY;
        } else {
            // Zooming out: keep position constant during zoom
            centerX = movementStartCenterX;
            centerY = movementStartCenterY;
        }
        
        render();
        
        if (zoomProgress >= 1.0) {
            // Zoom phase complete
            // First check if this is a reset phase that needs to continue to target
            if (movementNeedsReset && movementOriginalTarget) {
                // Reset complete, now animate to final target
                const originalTarget = movementOriginalTarget;
                movementNeedsReset = false;
                movementOriginalTarget = null;
                // Small delay to ensure smooth transition
                setTimeout(() => {
                    smoothMoveTo(originalTarget.centerX, originalTarget.centerY, originalTarget.zoom, originalTarget.duration);
                }, 50);
                return;
            }
            
            // Normal zoom phase completion
            // Check if we need to move position (when zooming out)
            if (!isZoomingIn) {
                // Zooming out: now move position to target
                movementPhase = 'position';
                movementStartZoom = zoom;
                movementStartCenterX = centerX;
                movementStartCenterY = centerY;
                movementAnimationStartTime = performance.now();
                // Continue to position phase immediately
                requestAnimationFrame(animateMovement);
                return;
            }
        } else {
            // Zoom phase - continue animation if not complete
            requestAnimationFrame(animateMovement);
            return;
        }
    }
    
    // Animation complete
    // Check if we need to continue to final target after reset (fallback check)
    if (movementNeedsReset && movementPhase === 'zoom' && movementOriginalTarget) {
        // Reset complete, now animate to final target
        const originalTarget = movementOriginalTarget;
        movementNeedsReset = false;
        movementOriginalTarget = null;
        // Small delay to ensure smooth transition
        setTimeout(() => {
            smoothMoveTo(originalTarget.centerX, originalTarget.centerY, originalTarget.zoom, originalTarget.duration);
        }, 50);
        return;
    }
    
    // Animation complete - ensure exact target values
    isAnimatingMovement = false;
    // Force exact values to avoid any precision issues
    zoom = movementTargetZoom;
    centerX = movementTargetCenterX;
    centerY = movementTargetCenterY;
    refineRender();
    
    // Double-check zoom is set correctly (for very large values)
    if (Math.abs(zoom - movementTargetZoom) > 0.01) {
        zoom = movementTargetZoom;
        render();
    }
    window.dispatchEvent(new CustomEvent('fractal:camera-settled', { detail: getCameraState() }));
}

let lastRenderDiagnostics = {};

function splitForGPU(value) {
    const high = Math.fround(value);
    return { high, low: value - high };
}

function render() {
    gl.useProgram(program);
    
    // Set up attributes
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    const detailIterations = Math.min(
        maxIterations,
        Math.max(120, Math.floor(120 + Math.log2(Math.max(1, zoom)) * 45))
    );
    // A reduced iteration budget changes the boundary by temporarily treating
    // slow-escaping points as interior. Keep the maths identical while moving;
    // the lower-resolution framebuffer is the interactive performance lever.
    const adaptiveIterations = detailIterations;
    const useDoubleDouble = zoom > 100000;
    const centerXParts = splitForGPU(centerX);
    const centerYParts = splitForGPU(centerY);
    
    // Set uniforms
    gl.uniform2f(resolutionLocation, canvas.width, canvas.height);
    gl.uniform1f(zoomLocation, zoom);
    gl.uniform2f(centerHiLocation, centerXParts.high, centerYParts.high);
    gl.uniform2f(centerLoLocation, centerXParts.low, centerYParts.low);
    gl.uniform1i(maxIterationsLocation, adaptiveIterations);
    gl.uniform1f(useDoubleDoubleLocation, useDoubleDouble ? 1 : 0);
    
    // Clear and draw
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    lastRenderDiagnostics = {
        mode: renderMode,
        scale: renderScale,
        iterations: adaptiveIterations,
        precision: useDoubleDouble ? 'double-double' : 'direct',
        pixels: canvas.width * canvas.height
    };
    
    window.dispatchEvent(new CustomEvent('fractal:render', { detail: getCameraState() }));
}

function getCameraState() {
    return { centerX, centerY, zoom, cursorX: cursorFractalX, cursorY: cursorFractalY };
}

function setCameraImmediate(camera) {
    isAnimatingMovement = false;
    clearTimeout(refinementTimer);
    setRenderMode('final');
    centerX = camera.centerX;
    centerY = camera.centerY;
    zoom = camera.zoom;
    maxIterations = 1500;
    render();
    window.dispatchEvent(new CustomEvent('fractal:camera-settled', { detail: getCameraState() }));
}

// Map screen coordinates to complex plane
function mapToComplex(x, y) {
    const aspect = width / height;
    const real = (x / width - 0.5) * aspect * 3.0 / zoom + centerX;
    const imag = (y / height - 0.5) * 3.0 / zoom + centerY;
    return { real, imag };
}

// Save current location (debug mode only)
function saveLocation() {
    if (!debugMode) return;
    
    const location = {
        name: `Location ${savedLocations.length + 1}`,
        zoom: zoom,
        centerX: centerX,
        centerY: centerY
    };
    
    savedLocations.push(location);
    console.log('Saved location:', location);
    console.log('All saved locations:', savedLocations);
}

// Toggle debug mode
function toggleDebugMode() {
    debugMode = !debugMode;
    console.log('Debug mode:', debugMode ? 'ON' : 'OFF');
    if (debugMode) {
        console.log('Debug mode enabled. Press S to save current location.');
        console.log('Saved locations:', savedLocations);
    }
}

// Mouse wheel zoom (zooms to cursor position)
canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    
    // Stop any ongoing smooth movement animation
    if (isAnimatingMovement) {
        isAnimatingMovement = false;
    }
    
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    
    // Get the complex coordinate at the mouse position before zooming
    const aspect = width / height;
    const complexX = (mouseX / width - 0.5) * aspect * 3.0 / zoom + centerX;
    const complexY = (0.5 - mouseY / height) * 3.0 / zoom + centerY; // Flip Y: screen Y increases downward, complex Y increases upward
    
    const boundedDelta = Math.max(-120, Math.min(120, event.deltaY));
    const zoomFactor = Math.exp(-boundedDelta * 0.0018);
    zoom = Math.max(0.0001, Math.min(1e14, zoom * zoomFactor));
    
    // Adjust center so the point under the cursor stays fixed
    centerX = complexX - (mouseX / width - 0.5) * aspect * 3.0 / zoom;
    centerY = complexY - (0.5 - mouseY / height) * 3.0 / zoom; // Flip Y to match
    
    requestInteractiveRender();
});

// Panning with mouse drag
canvas.addEventListener('mousedown', (event) => {
    if (event.button === 0) { // Left mouse button
        // Stop any ongoing smooth movement animation
        if (isAnimatingMovement) {
            isAnimatingMovement = false;
        }
        
        isDragging = true;
        clearTimeout(refinementTimer);
        setRenderMode('interactive');
        lastX = event.clientX;
        lastY = event.clientY;
    }
});

canvas.addEventListener('mousemove', (event) => {
    // Update cursor fractal coordinates for debug display
    const rect = canvas.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const aspect = width / height;
    cursorFractalX = (mouseX / width - 0.5) * aspect * 3.0 / zoom + centerX;
    cursorFractalY = (0.5 - mouseY / height) * 3.0 / zoom + centerY; // Flip Y: screen Y increases downward, complex Y increases upward
    window.dispatchEvent(new CustomEvent('fractal:render', { detail: getCameraState() }));
    
    if (isDragging) {
        const dx = event.clientX - lastX;
        const dy = event.clientY - lastY;
        centerX -= dx / width * aspect * 3.0 / zoom;
        centerY += dy / height * 3.0 / zoom; // Note: + instead of - for correct direction
        lastX = event.clientX;
        lastY = event.clientY;
        requestInteractiveRender();
    }
});

canvas.addEventListener('mouseup', () => {
    isDragging = false;
    refineRender();
});

canvas.addEventListener('mouseleave', () => {
    if (isDragging) refineRender();
    isDragging = false;
});

window.addEventListener('resize', () => {
    resizeDrawingBuffer();
    render();
});

// Animate iterations from 1 to 500 on page load (reduced for performance)
function animateIterations() {
    const iteration = 1500;
    if (!isAnimatingIterations) return;
    
    const currentTime = performance.now();
    const elapsed = currentTime - iterationAnimationStartTime;
    const progress = Math.min(elapsed / iterationAnimationDuration, 1.0);
    
    // Smooth ease-in-out curve
    const eased = progress < 0.5 
        ? 2 * progress * progress 
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;
    
    // Interpolate from 1 to target iteration count
    maxIterations = Math.floor(1 + (iteration - 1) * eased);
    
    render();
    
    if (progress < 1.0) {
        requestAnimationFrame(animateIterations);
    } else {
        isAnimatingIterations = false;
        maxIterations = iteration; // Ensure we end exactly at target
        refineRender();
        
        // Don't start fade-in here - it's already started 0.5s after click
    }
}

// Black overlay click handler
function setupBlackOverlay() {
    const blackOverlay = document.getElementById('blackOverlay');
    if (!blackOverlay) {
        console.error('Black overlay element not found!');
        return;
    }
    
    // Remove any existing listeners by using a one-time handler flag
    if (blackOverlay.dataset.listenerAttached) {
        return; // Already set up
    }
    blackOverlay.dataset.listenerAttached = 'true';
    
    const handleClick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        
        blackOverlay.classList.add('is-dismissed');
        
        // Reset animation state and start
        isAnimatingIterations = true;
        iterationAnimationStartTime = performance.now();
        maxIterations = 1;
        setRenderMode('interactive');
        
        // Initial render with 1 iteration
        render();
        
        // Start iteration animation
        animateIterations();
        
    };
    
    blackOverlay.addEventListener('click', handleClick);
    blackOverlay.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') handleClick(event);
    });
}

// Set up overlay when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setupBlackOverlay);
} else {
    // DOM already loaded
    setupBlackOverlay();
}

window.fractalRenderer = {
    getState: getCameraState,
    getDiagnostics() {
        return { ...lastRenderDiagnostics };
    },
    getResolution() {
        return {
            cssWidth: width,
            cssHeight: height,
            pixelWidth: canvas.width,
            pixelHeight: canvas.height,
            scale: renderScale
        };
    },
    setCamera: setCameraImmediate,
    moveTo(camera, duration = 2000) {
        smoothMoveTo(camera.centerX, camera.centerY, camera.zoom, duration);
    },
    render
};

// Don't start animation automatically - wait for click
// Initial render with black screen (maxIterations = 1 will show mostly black anyway, but overlay covers it)
render();
