importScripts('fractal-math.js');
self.onmessage = ({ data: { id, real, imaginary, iterations, deltaBound } }) => {
    try {
        const started = performance.now();
        const result = FractalMath.orbit(real, imaginary, iterations);
        const series = FractalMath.series(result.data, result.length, deltaBound);
        self.postMessage({ id, ...result, series, milliseconds: performance.now() - started }, [result.data.buffer, series.coefficients.buffer]);
    } catch (error) {
        self.postMessage({ id, error: error.message });
    }
};
