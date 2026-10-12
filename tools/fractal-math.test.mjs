import test from 'node:test';
import assert from 'node:assert/strict';
import '../fractal-math.js';
const m = globalThis.FractalMath;

test('decimal camera coordinates and sub-double pixel movements survive serialization', () => {
    const text = '-0.743643887037151007923796441234567890123456789';
    const start = m.parse(text);
    const pixel = m.fromNumber(3 / (900 * 1e25));
    assert.notEqual(pixel, 0n);
    assert.equal(m.number(start + pixel), m.number(start));
    assert.notEqual(m.format(start + pixel), m.format(start));
    assert.equal(m.parse(m.format(start + pixel)), start + pixel);
    assert.equal(m.format(start), text);
    assert.equal(m.number(m.parse('-1.5')), -1.5);
    assert.equal(m.parse('1e-30'), m.SCALE / 10n ** 30n);
    for (const value of ['NaN', 'Infinity', '', '1e900', 'hello']) assert.throws(() => m.parse(value));
});

test('float pairs retain the error introduced by rounding to float32', () => {
    for (const text of ['0.1', '-0.743643887037151007923796441', '0.13182590420533', '1e-25']) {
        const fixed = m.parse(text);
        const [hi, lo] = m.pair(fixed);
        const errorBefore = fixed - m.fromNumber(hi);
        const errorAfter = errorBefore - m.fromNumber(lo);
        const abs = n => n < 0n ? -n : n;
        assert.ok(abs(errorAfter) * 1000000n < abs(errorBefore), `Lost residual for ${text}`);
    }
});

test('reference keeps an escaping endpoint and bounded orbits have every requested step', () => {
    const escaped = m.orbit('1', '0', 100);
    assert.equal(escaped.length, 5);
    assert.deepEqual(Array.from(escaped.data.filter((_, i) => i % 4 === 0)), [0, 1, 2, 5, 26]);
    const bounded = m.orbit('-1', '0', 100);
    assert.equal(bounded.length, 101);
    for (let i = 0; i < bounded.length; i++) assert.equal(bounded.data[i * 4], i % 2 ? -1 : 0);
});
