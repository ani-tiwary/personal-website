import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { server, port, launchChrome, connect } from './browser-harness.mjs';

await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
});
let browser, client;
try {
    browser = await launchChrome();
    client = await connect(browser.websocketURL);
    const { targetId } = await client.command('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.command('Target.attachToTarget', { targetId, flatten: true });
    const command = (method, params = {}) => client.command(method, params, sessionId);
    await command('Page.enable');
    await command('Runtime.enable');
    await command('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false });
    async function evaluate(expression) {
        const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
        if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
        return response.result.value;
    }
    async function waitFor(expression) {
        return evaluate(`new Promise((resolve, reject) => {
            const start = Date.now();
            (function poll() {
                if (${expression}) return resolve(true);
                if (Date.now() - start > 15000) return reject(Error('Timed out: ' + ${JSON.stringify(expression)}));
                setTimeout(poll, 40);
            })();
        })`);
    }
    async function navigate(query = '?intro=off') {
        await command('Page.navigate', { url: `http://127.0.0.1:${port}/${query}` });
        await waitFor(`document.documentElement?.dataset.ready === 'true'`);
    }
    async function choose(id, value) {
        await evaluate(`(() => {
            const select = document.getElementById(${JSON.stringify(id)});
            select.value = ${JSON.stringify(value)};
            select.dispatchEvent(new Event('change', { bubbles: true }));
        })()`);
    }

    await navigate();
    assert.equal(await evaluate('window.fractalRenderer.getDiagnostics().quality'), 'auto');
    const initial = await evaluate('window.fractalRenderer.getDiagnostics()');
    assert.ok(initial.pixels <= 3003000, JSON.stringify(initial));
    const wheel = await evaluate(`(async () => {
        const renderer = window.fractalRenderer;
        const canvas = document.getElementById('fractalCanvas');
        const camera = renderer.getState();
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -4, clientX: innerWidth / 2, clientY: innerHeight / 2, cancelable: true }));
        const smallRatio = renderer.getState().zoom / camera.zoom;
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const preview = renderer.getDiagnostics();
        renderer.setCamera(camera);
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -120, clientX: 720, clientY: 450, cancelable: true }));
        const mouseRatio = renderer.getState().zoom / camera.zoom;
        renderer.setCamera(camera);
        canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -4, ctrlKey: true, clientX: 720, clientY: 450, cancelable: true }));
        return { smallRatio, mouseRatio, pinchRatio: renderer.getState().zoom / camera.zoom, preview };
    })()`);
    assert.ok(Math.abs(wheel.smallRatio - Math.exp(0.018)) < 1e-8);
    assert.ok(Math.abs(wheel.mouseRatio - Math.exp(0.216)) < 1e-8);
    assert.ok(Math.abs(wheel.pinchRatio - Math.exp(0.04)) < 1e-8);
    assert.ok(wheel.preview.pixels <= 1002000);
    await waitFor(`window.fractalRenderer.getDiagnostics().mode === 'final'`);
    console.log('Passed: Retina pixel budgets, stronger trackpad zoom, unchanged mouse-wheel steps, pinch zoom, idle refinement');

    const adaptation = await evaluate(`(() => {
        const renderer = window.fractalRenderer, canvas = document.getElementById('fractalCanvas');
        const original = performance.now;
        let clock = original.call(performance);
        try {
            performance.now = () => (clock += 50);
            canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, clientX: 720, clientY: 450, cancelable: true }));
            renderer.render();
            const before = renderer.getDiagnostics();
            for (let i = 0; i < 6; i++) renderer.render();
            return { before, after: renderer.getDiagnostics() };
        } finally { performance.now = original; }
    })()`);
    assert.ok(adaptation.after.adaptiveScale < adaptation.before.adaptiveScale);
    assert.ok(adaptation.after.pixels < adaptation.before.pixels);
    assert.equal(adaptation.after.iterations, adaptation.before.iterations);
    await choose('qualityPreference', 'low');
    await waitFor(`window.fractalRenderer.getDiagnostics().mode === 'final'`);
    assert.ok(await evaluate('window.fractalRenderer.getDiagnostics().pixels <= 1202000'));
    await choose('qualityPreference', 'high');
    await waitFor(`window.fractalRenderer.getDiagnostics().scale === 2`);
    await choose('qualityPreference', 'auto');
    console.log('Passed: slow frames reduce GPU work without reducing iteration detail; quality controls update rendering');

    const projection = await evaluate(`(async () => {
        await window.site.gotoScene('home', { animate: false });
        const camera = window.site.getState().camera;
        window.site.setCamera({ ...camera, zoom: camera.zoom * 1.5 });
        const panel = document.querySelector('.scene-panel[data-scene="home"]');
        const settled = panel.getBoundingClientRect();
        document.getElementById('fractalCanvas').dispatchEvent(new WheelEvent('wheel', { deltaY: 0, clientX: 720, clientY: 450, cancelable: true }));
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const moving = panel.getBoundingClientRect();
        return { widthDifference: Math.abs(moving.width - settled.width), leftDifference: Math.abs(moving.left - settled.left) };
    })()`);
    assert.ok(projection.widthDifference < 2 && projection.leftDifference < 2, JSON.stringify(projection));
    console.log('Passed: text stays in place when switching between moving and settled rendering');

    await evaluate(`window.site.gotoScene('work', { animate: false })`);
    const beforeScroll = await evaluate(`window.site.getState().camera.zoom`);
    const scrollPoint = await evaluate(`(() => {
        const scroll = document.querySelector('.scene-panel[data-scene="work"] .scene-scroll');
        scroll.scrollTop = 0;
        const r = scroll.getBoundingClientRect();
        return { x: r.right - 20, y: r.top + 50 };
    })()`);
    await command('Input.dispatchMouseEvent', { type: 'mouseWheel', ...scrollPoint, deltaX: 0, deltaY: 180 });
    await waitFor(`document.querySelector('.scene-panel[data-scene="work"] .scene-scroll').scrollTop > 0`);
    assert.equal(await evaluate('window.site.getState().camera.zoom'), beforeScroll);
    console.log('Passed: trackpad scrolling inside content scrolls the panel without zooming the background');

    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    assert.equal(await evaluate('window.sitePreferences.getState().motion'), 'on');
    assert.equal(await evaluate('window.sitePreferences.getState().reduceMotion'), false);
    await choose('motionPreference', 'auto');
    await waitFor('window.sitePreferences.getState().reduceMotion');
    await evaluate(`window.site.gotoScene('home')`);
    assert.equal(await evaluate('window.site.getState().camera.zoom'), 1.35);
    await choose('motionPreference', 'on');
    assert.equal(await evaluate('window.sitePreferences.getState().reduceMotion'), false);
    assert.notEqual(await evaluate(`getComputedStyle(document.querySelector('.scene-panel')).transitionDuration`), '0s');
    const motion = await evaluate(`(async () => {
        const frames = [];
        const listener = e => frames.push(e.detail.zoom);
        window.addEventListener('fractal:render', listener);
        await window.site.gotoScene('work', { duration: 600 });
        window.removeEventListener('fractal:render', listener);
        return { frames, target: window.site.getState().camera.zoom };
    })()`);
    assert.ok(motion.frames.some(zoom => zoom > 1.35 && zoom < motion.target), JSON.stringify(motion));
    await navigate();
    assert.equal(await evaluate('window.sitePreferences.getState().motion'), 'on');
    await choose('motionPreference', 'off');
    assert.equal(await evaluate('window.sitePreferences.getState().reduceMotion'), true);
    await choose('motionPreference', 'auto');
    await command('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
    await waitFor('!window.sitePreferences.getState().reduceMotion');
    console.log('Passed: animations default on regardless of device preference; explicit device setting, overrides, and persistence');

    await evaluate(`document.getElementById('displaySettings').open = true; document.getElementById('qualityPreference').focus()`);
    const scene = await evaluate('window.site.getState().scene');
    await command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    await command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39 });
    assert.equal(await evaluate('window.site.getState().scene'), scene);
    await mkdir('artifacts/screenshots', { recursive: true });
    for (const [name, width, height] of [['laptop', 1366, 768], ['mobile', 390, 844]]) {
        await command('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: name === 'mobile' });
        await evaluate(`window.site.gotoScene('home', { animate: false })`);
        await evaluate(`document.getElementById('displaySettings').open = true`);
        const layout = await evaluate(`(() => {
            const r = document.querySelector('.display-options').getBoundingClientRect();
            const option = document.getElementById('motionPreference'), b = option.getBoundingClientRect();
            return { fits: r.left >= 0 && r.right <= innerWidth && r.bottom < innerHeight,
                clickable: option.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)) };
        })()`);
        assert.ok(layout.fits && layout.clickable, JSON.stringify(layout));
        const screenshot = await command('Page.captureScreenshot', { format: 'png' });
        await writeFile(`artifacts/screenshots/display-${name}.png`, Buffer.from(screenshot.data, 'base64'));
    }
    console.log('Passed: laptop/mobile Display menu layout, click targets, and keyboard controls');

    // A driver rejecting the heavy shader must still animate ordinary scenes.
    await command('Page.addScriptToEvaluateOnNewDocument', { source: `
        const original = WebGLRenderingContext.prototype.getShaderParameter;
        WebGLRenderingContext.prototype.getShaderParameter = function(shader, parameter) {
            if (parameter === this.COMPILE_STATUS && this.getShaderSource(shader).includes('mandelbrotPerturbation')
                && !this.getShaderSource(shader).startsWith('#define FRACTAL_BASIC')) return false;
            return original.call(this, shader, parameter);
        };
    ` });
    await navigate('?intro=off&motion=on');
    assert.ok(await evaluate('!!window.fractalRenderer'));
    await evaluate(`window.site.gotoScene('about', { duration: 300 })`);
    assert.equal(await evaluate('window.site.getState().scene'), 'about');
    await evaluate(`window.site.setCamera({centerX:-0.743, centerY:0.13, zoom:1e6})`);
    assert.ok(await evaluate('window.fractalRenderer.getDiagnostics().deepUnavailable'));
    for (const scene of ['about', 'work', 'resume']) {
        const layout = await evaluate(`(async () => {
            await window.site.gotoScene('${scene}', { animate: false });
            const panel = document.querySelector('.scene-panel[data-scene="${scene}"]');
            const r = panel.getBoundingClientRect();
            const otherVisible = [...document.querySelectorAll('.scene-panel')].some(other =>
                other !== panel && getComputedStyle(other).visibility === 'visible');
            return { usable: !panel.inert && getComputedStyle(panel).visibility === 'visible',
                otherVisible, width: r.width, centerX: r.x + r.width / 2, centerY: r.y + r.height / 2 };
        })()`);
        assert.ok(layout.usable && layout.width > 300, JSON.stringify(layout));
        assert.equal(layout.otherVisible, false, JSON.stringify(layout));
        assert.ok(Math.abs(layout.centerX - 195) < 1 && Math.abs(layout.centerY - 844 * 0.55) < 1, JSON.stringify(layout));
    }
    await evaluate(`window.site.gotoScene('home', { duration: 300 })`);
    assert.equal(await evaluate('window.site.getState().camera.zoom'), 1.35);
    console.log('Passed: deep-shader failure preserves readable deep pages and normal scene animations');
    assert.deepEqual(client.exceptions, []);
} finally {
    client?.close();
    browser?.child.kill('SIGTERM');
    server.close();
}
