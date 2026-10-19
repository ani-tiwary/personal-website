// Escape-time renderer with float-pair perturbation and bounded series skipping.
// Screen-space contour relief keeps shading outside the expensive iteration loop.
window.fractalFragmentShaderSource = `
    #ifdef GL_OES_standard_derivatives
    #extension GL_OES_standard_derivatives : enable
    #endif
    precision highp float;

    uniform vec2 u_resolution;
    uniform vec2 u_centerHi;
    uniform vec2 u_centerLo;
    uniform vec4 u_referenceDelta;
    uniform vec2 u_pixelScale;
    uniform vec4 u_series[4];
    uniform int u_seriesIteration;
    uniform vec2 u_seriesInverse;
    uniform float u_renderScale;
    uniform int u_maxIterations;
    uniform float u_useDoubleDouble;
    uniform float u_usePerturbation;
    uniform sampler2D u_referenceOrbit;
    uniform float u_referenceOrbitLength;

    #ifdef FRACTAL_BASIC
    const int LOOP_LIMIT = 1024;
    #else
    const int LOOP_LIMIT = 4096;
    #endif
    const float DD_SPLITTER = 4097.0;

    bool isKnownInterior(vec2 c) {
        float y2 = c.y * c.y;
        float xMinusQuarter = c.x - 0.25;
        float q = xMinusQuarter * xMinusQuarter + y2;
        bool cardioid = q * (q + xMinusQuarter) <= 0.25 * y2;
        float xPlusOne = c.x + 1.0;
        bool periodTwoBulb = xPlusOne * xPlusOne + y2 <= 0.0625;
        return cardioid || periodTwoBulb;
    }

    vec2 complexSquare(vec2 z) {
        return vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y);
    }

    float continuousIteration(int iteration, float magnitudeSquared) {
        float logMagnitude = 0.5 * log(max(magnitudeSquared, 4.000001));
        // Very distant points can produce a negative smooth-iteration value.
        // Negative values are reserved for the interior sentinel, so clamp escaped
        // points to the uniform far-field tone instead of drawing a false circle.
        return max(0.0, float(iteration) + 1.0 - log(max(logMagnitude, 0.000001)) / log(2.0));
    }

    // Two inexpensive exterior steps remove visible escape-ring seams from
    // smooth coloring. Stop at a safe magnitude before repeated squaring overflows.
    float finishEscape(int iteration, vec2 z, vec2 c) {
        int smoothIteration = iteration;
        if (dot(z, z) <= 65536.0) {
            z = complexSquare(z) + c;
            smoothIteration++;
            if (dot(z, z) <= 65536.0) {
                z = complexSquare(z) + c;
                smoothIteration++;
            }
        }
        return continuousIteration(smoothIteration, dot(z, z));
    }

    float mandelbrotDirect(vec2 c) {
        if (isKnownInterior(c)) return -1.0;
        vec2 z = vec2(0.0);
        int escapedAt = -1;
        for (int i = 0; i < LOOP_LIMIT; i++) {
            if (i >= u_maxIterations) break;
            z = complexSquare(z) + c;
            if (dot(z, z) > 4.0) { escapedAt = i; break; }
        }
        // Keep exterior smoothing outside the divergent iteration loop.
        if (escapedAt >= 0) return finishEscape(escapedAt, z, c);
        return -1.0;
    }

    #ifndef FRACTAL_BASIC
    // A double-double is vec2(high, low). The low component explicitly carries
    // the rounding error discarded by the high component.
    vec2 ddNormalize(float high, float low) {
        float sum = high + low;
        return vec2(sum, low - (sum - high));
    }

    vec2 ddAdd(vec2 a, vec2 b) {
        float sum = a.x + b.x;
        float virtualB = sum - a.x;
        float error = (a.x - (sum - virtualB)) + (b.x - virtualB);
        error += a.y + b.y;
        return ddNormalize(sum, error);
    }

    vec2 ddSplit(float value) {
        float combined = DD_SPLITTER * value;
        float high = combined - (combined - value);
        return vec2(high, value - high);
    }

    vec2 ddProduct(float a, float b) {
        float product = a * b;
        vec2 aParts = ddSplit(a);
        vec2 bParts = ddSplit(b);
        float error = ((aParts.x * bParts.x - product)
            + aParts.x * bParts.y
            + aParts.y * bParts.x)
            + aParts.y * bParts.y;
        return vec2(product, error);
    }

    vec2 ddMultiply(vec2 a, vec2 b) {
        vec2 product = ddProduct(a.x, b.x);
        product.y += a.x * b.y + a.y * b.x;
        return ddNormalize(product.x, product.y);
    }

    float ddValue(vec2 value) {
        return value.x + value.y;
    }

    float mandelbrotDoubleDouble(vec4 pixelDelta) {
        vec2 cReal = ddAdd(vec2(u_centerHi.x, u_centerLo.x), pixelDelta.xy);
        vec2 cImaginary = ddAdd(vec2(u_centerHi.y, u_centerLo.y), pixelDelta.zw);
        vec2 zReal = vec2(0.0);
        vec2 zImaginary = vec2(0.0);
        int escapedAt = -1;

        for (int i = 0; i < LOOP_LIMIT; i++) {
            if (i >= u_maxIterations) break;

            vec2 realSquared = ddMultiply(zReal, zReal);
            vec2 imaginarySquared = ddMultiply(zImaginary, zImaginary);
            vec2 realImaginary = ddMultiply(zReal, zImaginary);
            zReal = ddAdd(ddAdd(realSquared, -imaginarySquared), cReal);
            zImaginary = ddAdd(ddAdd(realImaginary, realImaginary), cImaginary);

            vec2 magnitude = ddAdd(
                ddMultiply(zReal, zReal),
                ddMultiply(zImaginary, zImaginary)
            );
            float magnitudeSquared = ddValue(magnitude);
            if (magnitudeSquared > 4.0) { escapedAt = i; break; }
        }
        if (escapedAt >= 0) return finishEscape(escapedAt, vec2(ddValue(zReal), ddValue(zImaginary)), vec2(ddValue(cReal), ddValue(cImaginary)));
        return -1.0;
    }

    // The reference orbit is calculated on the CPU with fixed-point integers.
    // For a pixel c = C + dc, iterate only dz where z = Z + dz:
    // dz(n+1) = 2 Z(n) dz(n) + dz(n)^2 + dc.  This keeps the GPU values small
    // even when dc is far below the precision of a native float.
    vec4 referenceOrbitAt(int iteration) {
        float x = (float(iteration) + 0.5) / u_referenceOrbitLength;
        return texture2D(u_referenceOrbit, vec2(x, 0.5));
    }

    vec4 complexMultiplyDD(vec4 a, vec4 b) {
        return vec4(ddAdd(ddMultiply(a.xy, b.xy), -ddMultiply(a.zw, b.zw)),
                    ddAdd(ddMultiply(a.xy, b.zw), ddMultiply(a.zw, b.xy)));
    }
    vec4 complexAddDD(vec4 a, vec4 b) {
        return vec4(ddAdd(a.xy,b.xy),ddAdd(a.zw,b.zw));
    }
    float mandelbrotPerturbation(vec4 pixelDelta) {
        // Conservative interior shortcut: leave a margin around the analytic
        // boundaries so a rounded center cannot swallow deep boundary detail.
        vec2 c = u_centerHi + vec2(pixelDelta.x, pixelDelta.z);
        float q = (c.x - 0.25)*(c.x - 0.25) + c.y*c.y;
        if (q*(q+c.x-0.25) < 0.25*c.y*c.y - 0.00001 ||
            (c.x+1.0)*(c.x+1.0)+c.y*c.y < 0.0625 - 0.00001) return -1.0;
        vec4 dc = complexAddDD(pixelDelta, u_referenceDelta);
        vec4 dz = vec4(0.0);
        int referenceIndex = 0;
        int iteration = 0;
        int escapedAt = -1;
        vec2 escapedZ = vec2(0.0);
        if (u_seriesIteration > 0 && u_seriesIteration < u_maxIterations) {
            vec4 t = vec4(ddMultiply(dc.xy,u_seriesInverse),ddMultiply(dc.zw,u_seriesInverse));
            dz = complexMultiplyDD(complexAddDD(complexMultiplyDD(
                 complexAddDD(complexMultiplyDD(u_series[3],t),u_series[2]),t),u_series[1]),t);
            dz = complexMultiplyDD(complexAddDD(dz,u_series[0]),t);
            iteration = u_seriesIteration;
            referenceIndex = iteration;
        }
        for (int step = 0; step < LOOP_LIMIT; step++) {
            if (iteration >= u_maxIterations) break;
            vec4 reference = referenceOrbitAt(referenceIndex);
            vec4 linear = complexMultiplyDD(reference,dz);
            vec2 rr = ddMultiply(dz.xy,dz.xy);
            vec2 ii = ddMultiply(dz.zw,dz.zw);
            vec2 ri = ddMultiply(dz.xy,dz.zw);
            dz = complexAddDD(complexAddDD(complexAddDD(linear,linear),
                 vec4(ddAdd(rr,-ii),ddAdd(ri,ri))),dc);
            referenceIndex++;
            vec4 z = complexAddDD(referenceOrbitAt(referenceIndex),dz);
            float magnitudeSquared = z.x*z.x + z.z*z.z;
            if (magnitudeSquared > 4.0) {
                escapedAt = iteration;
                escapedZ = vec2(ddValue(z.xy), ddValue(z.zw));
                break;
            }
            iteration++;
            if (magnitudeSquared < dz.x*dz.x + dz.z*dz.z || float(referenceIndex) >= u_referenceOrbitLength - 1.0) {
                dz = z;
                referenceIndex = 0;
            }
        }
        if (escapedAt >= 0) return finishEscape(escapedAt, escapedZ, c);
        return -1.0;
    }

    #endif

    void main() {
        vec2 pixel = gl_FragCoord.xy - 0.5 * u_resolution;
        float escapeIteration;
        #ifdef FRACTAL_BASIC
        escapeIteration = mandelbrotDirect(pixel * u_pixelScale.x + u_centerHi + u_centerLo);
        #else
        if (u_usePerturbation > 0.5 || u_useDoubleDouble > 0.5) {
            vec4 pixelDelta = vec4(ddMultiply(vec2(pixel.x,0.0),u_pixelScale),
                                   ddMultiply(vec2(pixel.y,0.0),u_pixelScale));
            if (u_usePerturbation > 0.5) escapeIteration = mandelbrotPerturbation(pixelDelta);
            else escapeIteration = mandelbrotDoubleDouble(pixelDelta);
        } else {
            escapeIteration = mandelbrotDirect(pixel * u_pixelScale.x + u_centerHi + u_centerLo);
        }
        #endif

        // Screen-space relief adds no work inside the fractal iteration loop.
        // Derivatives are evaluated for every fragment, before the interior branch.
        float escaped = max(escapeIteration, 0.0);
        vec2 slope = vec2(0.0);
        #ifdef GL_OES_standard_derivatives
        slope = vec2(dFdx(escaped), dFdy(escaped)) * u_renderScale;
        #endif
        float color = 0.0;
        if (escapeIteration >= 0.0) {
            float phase = escaped * 0.16;
            float bandwidth = length(slope);
            float fineVisibility = 1.0 - smoothstep(0.5, 2.5, bandwidth);
            float wave = 0.5 + 0.5 * cos(phase);
            float tone = 0.30 + 0.58 * smoothstep(0.0, 1.0, wave);
            tone += 0.022 * sin(escaped * 0.8) * fineVisibility;

            // A satin surface: broad, soft light and a narrow polished edge.
            // All material work is once per pixel, outside the orbit calculation.
            vec2 relief = slope * (-sin(phase)) * 0.42;
            relief /= 1.0 + 0.12 * length(relief);
            vec3 normal = normalize(vec3(-relief, 1.0));
            vec3 lightDirection = vec3(-0.408248, 0.408248, 0.816497);
            float diffuse = dot(normal, lightDirection) - lightDirection.z;
            float highlight = max(0.0, dot(normal, vec3(-0.214186, 0.214186, 0.953021)));
            float flatHighlight = 0.953021;
            // Power 16 gives a soft glint without a texture or another render pass.
            highlight *= highlight; highlight *= highlight;
            highlight *= highlight; highlight *= highlight;
            flatHighlight *= flatHighlight; flatHighlight *= flatHighlight;
            flatHighlight *= flatHighlight; flatHighlight *= flatHighlight;
            float depth = clamp(escaped / 1800.0, 0.0, 1.0);
            float shading = diffuse * 0.18 + (highlight - flatHighlight) * 0.12;
            color = clamp(tone + shading - depth * 0.10, 0.10, 0.96);

            // Sub-byte, stationary dither keeps broad gradients smooth on 8-bit
            // displays. CSS-pixel anchoring prevents grain changing on refinement.
            vec2 grainPixel = floor(gl_FragCoord.xy / u_renderScale);
            float grain = fract(52.9829189 * fract(dot(grainPixel, vec2(0.06711056, 0.00583715))));
            color += (grain - 0.5) / 255.0;
        }
        gl_FragColor = vec4(vec3(color), 1.0);
    }
`;
