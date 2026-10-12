// Shared by the camera and reference worker. Decimal strings never pass through Number.
(function (scope) {
    const DIGITS = 70;
    const SCALE = 10n ** BigInt(DIGITS);
    function parse(value) {
        const text = String(value);
        const match = /^([+-]?)(\d*)(?:\.(\d*))?(?:e([+-]?\d+))?$/i.exec(text);
        if (!match || !(match[2] || match[3]) || text.length > 200) throw new Error('Invalid fractal coordinate');
        const exponent = Number(match[4] || 0) - (match[3] || '').length + DIGITS;
        if (Math.abs(exponent) > 400) throw new Error('Coordinate exponent out of range');
        let result = BigInt((match[2] || '') + (match[3] || ''));
        result = exponent >= 0 ? result * 10n ** BigInt(exponent) : result / 10n ** BigInt(-exponent);
        return match[1] === '-' ? -result : result;
    }
    function format(value) {
        const sign = value < 0n ? '-' : '';
        const digits = (value < 0n ? -value : value).toString().padStart(DIGITS + 1, '0');
        return sign + digits.slice(0, -DIGITS) + '.' + (digits.slice(-DIGITS).replace(/0+$/, '') || '0');
    }
    const number = value => Number(format(value));
    // Convert a binary float to exact fixed point before subtracting its rounding error.
    // toString() alone describes a decimal round-trip, not the exact binary value.
    function fromNumber(value) {
        if (!Number.isFinite(value)) throw new Error('Non-finite coordinate');
        return parse(value.toExponential(80));
    }
    function pair(value) {
        const high = Math.fround(number(value));
        return [high, Math.fround(number(value - fromNumber(high)))];
    }
    function orbit(real, imaginary, iterations) {
        const x = parse(real), y = parse(imaginary);
        let zx = 0n, zy = 0n;
        const data = new Float32Array((iterations + 1) * 4);
        let length = 0;
        for (let i = 0; i <= iterations; i++) {
            data.set([...pair(zx), ...pair(zy)], i * 4);
            length++;
            // Keep the escaping endpoint: pixels can rebase onto Z(0) and continue.
            if (zx * zx + zy * zy > 256n * SCALE * SCALE) break;
            const next = (zx * zx - zy * zy) / SCALE + x;
            zy = 2n * zx * zy / SCALE + y;
            zx = next;
        }
        return { data: data.slice(0, length * 4), length };
    }
    // Fourth-order series in t = dc / radius. Track a conservative truncation
    // bound on the unit disk, stopping before it can amplify into visible error.
    function series(data, length, radius) {
        const mul = (a,b) => [a[0]*b[0]-a[1]*b[1], a[0]*b[1]+a[1]*b[0]];
        let coefficients = Array.from({length: 5}, () => [0,0]);
        let error = 0, result = { iteration: 0, coefficients: new Float32Array(16), radius };
        for(let i=0;i<length-1;i++) {
            const z = [data[i*4]+data[i*4+1], data[i*4+2]+data[i*4+3]];
            const next = Array.from({length: 9}, () => [0,0]);
            for(let k=1;k<=4;k++) {
                const linear = mul(z,coefficients[k]);
                next[k][0] += 2*linear[0]; next[k][1] += 2*linear[1];
                for(let j=1;j<=4;j++) {
                    const product = mul(coefficients[k], coefficients[j]);
                    next[k+j][0] += product[0]; next[k+j][1] += product[1];
                }
            }
            next[1][0] += radius;
            const size = coefficients.reduce((sum,c)=>sum+Math.hypot(...c),0);
            const omitted = next.slice(5).reduce((sum,c)=>sum+Math.hypot(...c),0);
            const nextSize = next.slice(1,5).reduce((sum,c)=>sum+Math.hypot(...c),0);
            error = 2*(Math.hypot(...z)+size)*error + error*error + omitted + nextSize*4e-16;
            if (!Number.isFinite(error) || nextSize > 0.01 ||
                Math.hypot(data[(i+1)*4],data[(i+1)*4+2])+nextSize > 1.8 ||
                error > nextSize*1e-11) break;
            coefficients = next.slice(0,5);
            const encoded = new Float32Array(16);
            for(let k=1;k<=4;k++) {
                const [x,y]=coefficients[k]; const hx=Math.fround(x), hy=Math.fround(y);
                encoded.set([hx, x-hx, hy, y-hy],(k-1)*4);
            }
            result = {iteration:i+1, coefficients:encoded, radius};
        }
        return result;
    }
    scope.FractalMath = { DIGITS, SCALE, parse, format, number, fromNumber, pair, orbit, series };
})(globalThis);
