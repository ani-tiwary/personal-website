// Stable escape-time renderer. Deep zooms use a pair of floats for every scalar,
// retaining roughly twice the precision of the native WebGL float path.
window.fractalFragmentShaderSource = `
    precision highp float;

    uniform vec2 u_resolution;
    uniform float u_zoom;
    uniform vec2 u_centerHi;
    uniform vec2 u_centerLo;
    uniform int u_maxIterations;
    uniform float u_useDoubleDouble;

    const int LOOP_LIMIT = 2000;
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

    float mandelbrotDirect(vec2 c) {
        if (isKnownInterior(c)) return -1.0;
        vec2 z = vec2(0.0);
        for (int i = 0; i < LOOP_LIMIT; i++) {
            if (i >= u_maxIterations) break;
            z = complexSquare(z) + c;
            float magnitudeSquared = dot(z, z);
            if (magnitudeSquared > 4.0) return continuousIteration(i, magnitudeSquared);
        }
        return -1.0;
    }

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

    float mandelbrotDoubleDouble(vec2 pixelDelta) {
        vec2 cReal = ddAdd(vec2(u_centerHi.x, u_centerLo.x), vec2(pixelDelta.x, 0.0));
        vec2 cImaginary = ddAdd(vec2(u_centerHi.y, u_centerLo.y), vec2(pixelDelta.y, 0.0));
        vec2 zReal = vec2(0.0);
        vec2 zImaginary = vec2(0.0);

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
            if (magnitudeSquared > 4.0) return continuousIteration(i, magnitudeSquared);
        }
        return -1.0;
    }

    void main() {
        vec2 uv = gl_FragCoord.xy / u_resolution;
        float aspect = u_resolution.x / u_resolution.y;
        vec2 pixelDelta = (uv - 0.5) * vec2(aspect, 1.0) * 3.0 / u_zoom;

        float escapeIteration;
        if (u_useDoubleDouble > 0.5) {
            escapeIteration = mandelbrotDoubleDouble(pixelDelta);
        } else {
            escapeIteration = mandelbrotDirect(pixelDelta + u_centerHi + u_centerLo);
        }

        float color = 0.0;
        if (escapeIteration >= 0.0) {
            // Absolute escape-time tones do not change when the preview iteration
            // budget changes. Broad waves form clean, deliberate gray regions.
            float tone = 0.58 + 0.30 * cos(escapeIteration * 0.16);
            float deepening = clamp(escapeIteration / 1800.0, 0.0, 1.0) * 0.12;
            color = clamp(tone - deepening, 0.16, 0.92);
        }

        gl_FragColor = vec4(vec3(color), 1.0);
    }
`;
