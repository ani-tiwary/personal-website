import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { server, port, launchChrome, connect } from './browser-harness.mjs';

await new Promise((done, fail) => { server.once('error', fail); server.listen(port, '127.0.0.1', done); });
let browser, client;
try {
    browser = await launchChrome();
    client = await connect(browser.websocketURL);
    for (const width of [1280, 390]) {
        const { targetId } = await client.command('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await client.command('Target.attachToTarget', { targetId, flatten: true });
        const cmd = (method, params = {}) => client.command(method, params, sessionId);
        const evaluate = async expression => {
            const result = await cmd('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
            if (result.exceptionDetails) throw Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
            return result.result.value;
        };
        await cmd('Page.enable'); await cmd('Runtime.enable');
        await cmd('Emulation.setDeviceMetricsOverride', { width, height: 844, deviceScaleFactor: 1, mobile: width < 620 });
        await cmd('Page.addScriptToEvaluateOnNewDocument', { source: `
            window.draws = { main: 0, julia: 0 };
            window.juliaContexts = 0;
            const getContext = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function(type, ...args) {
                if (this.id === 'juliaCanvas' && type === 'webgl') window.juliaContexts++;
                return getContext.call(this, type, ...args);
            };
            const draw = WebGLRenderingContext.prototype.drawArrays;
            WebGLRenderingContext.prototype.drawArrays = function(...args) {
                window.draws[this.canvas.id === 'juliaCanvas' ? 'julia' : 'main']++;
                return draw.apply(this, args);
            };
            const getParameter = WebGLRenderingContext.prototype.getParameter;
            WebGLRenderingContext.prototype.getParameter = function(p) {
                return p === this.MAX_VIEWPORT_DIMS ? new Int32Array([320, 320]) : getParameter.call(this, p);
            };
        ` });
        const ready = async (previousOrigin = null) => {
            const deadline = Date.now() + 15000;
            while (Date.now() < deadline) {
                try {
                    if (await evaluate(`!!window.site && performance.timeOrigin !== ${previousOrigin}`)) {
                        await evaluate('window.site.ready');
                        return;
                    }
                } catch (error) {
                    if (!/context|undefined|Cannot find/i.test(error.message)) throw error;
                }
                await new Promise(resolve => setTimeout(resolve, 50));
            }
            throw Error('Page did not become ready');
        };
        const reload = async () => {
            const previousOrigin = await evaluate('performance.timeOrigin');
            await cmd('Page.reload');
            await ready(previousOrigin);
        };
        await cmd('Page.navigate', { url: `http://127.0.0.1:${port}/?intro=off&motion=on&capture=on` });
        await ready();
        await evaluate(`localStorage.removeItem('portfolio:juliaPreview')`);
        await reload();
        assert.deepEqual(await evaluate(`[juliaPreview.hidden, juliaPreviewToggle.checked, window.juliaContexts]`), [true, false, 0]);
        await evaluate(`
            window.pause = ms => new Promise(r => setTimeout(() => requestAnimationFrame(r), ms));
            window.point = (x,y) => fractalCanvas.dispatchEvent(new PointerEvent('pointermove', {clientX:x,clientY:y,isPrimary:true,bubbles:true}));
            window.parameter = () => {
                const gl = juliaCanvas.getContext('webgl'), p = gl.getParameter(gl.CURRENT_PROGRAM);
                return Array.from(gl.getUniform(p, gl.getUniformLocation(p, 'u_juliaParameter')));
            };
            fractalRenderer.setCamera({centerX:0,centerY:0,zoom:1});
            point(innerWidth/2,innerHeight/2);
            settingsToggle.click(); juliaPreviewToggle.click();
        `);
        await evaluate('pause(1000)');
        assert.deepEqual(await evaluate('[juliaPreview.hidden, juliaPreviewToggle.checked, ...parameter()]'), [false, true, 0, 0]);
        // c=0 is a unit disk: both horizontal sides outside it must escape.
        await evaluate(`document.querySelector('input[value="light"]').click()`);
        await evaluate('pause(200)');
        const pixels = await evaluate(`(() => {
            const gl = juliaCanvas.getContext('webgl');
            const sample = x => { const p = new Uint8Array(4); gl.readPixels(x, Math.floor(juliaCanvas.height/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,p); return p[0]; };
            return [sample(5), sample(Math.floor(juliaCanvas.width/2)), sample(juliaCanvas.width-6), gl.getError()];
        })()`);
        assert.ok(pixels[0] > 20 && pixels[1] === 0 && pixels[2] > 20, `Julia unit disk: ${pixels}`);
        assert.equal(pixels[3], 0);
        const movement = await evaluate(`(async () => {
            const before = {...draws}; point(innerWidth/2 + 70, innerHeight/2 - 45);
            await pause(80); const midway = parameter();
            await pause(1100); const final = parameter(); const settled = {...draws};
            await pause(150);
            return {before, midway, final, settled, idle:{...draws}, expected:[70*3/innerHeight,45*3/innerHeight]};
        })()`);
        assert.ok(movement.midway[0] > 0 && movement.midway[0] < movement.expected[0]);
        movement.final.forEach((value, i) => assert.ok(Math.abs(value - movement.expected[i]) < 1e-6));
        assert.equal(movement.before.main, movement.settled.main, 'Hover must not redraw Mandelbrot');
        assert.ok(movement.settled.julia > movement.before.julia + 1, 'Interpolated frames');
        assert.equal(movement.idle.julia, movement.settled.julia, 'Idle preview must stop rendering');
        await evaluate(`sitePreferences.set('motion','off'); fractalRenderer.setCamera({centerX:-.75,centerY:.1,zoom:2})`);
        await evaluate('pause(200)');
        const parameter = await evaluate('parameter()');
        assert.ok(Math.abs(parameter[0] - (-.75 + 70*3/(844*2))) < 1e-6);
        assert.ok(Math.abs(parameter[1] - (.1 + 45*3/(844*2))) < 1e-6);
        for (const [theme, expected] of [['rainbow',1],['aurora',2],['opal',3],['light',0]]) {
            await evaluate(`document.querySelector('input[value="${theme}"]').click()`);
            await evaluate('pause(100)');
            assert.equal(await evaluate(`(() => { const gl=juliaCanvas.getContext('webgl'), p=gl.getParameter(gl.CURRENT_PROGRAM); return gl.getUniform(p,gl.getUniformLocation(p,'u_colourPalette')); })()`), expected);
        }
        await evaluate('invertToggle.click()');
        assert.equal(await evaluate(`getComputedStyle(document.documentElement).filter`), 'invert(1)');
        await evaluate('invertToggle.click(); document.querySelector(\'input[value="rainbow"]\').click(); settingsToggle.click()');
        const bounds = await evaluate(`(() => {const r=juliaPreview.getBoundingClientRect();return {left:r.left,bottom:r.bottom,width:r.width,height:r.height}})()`);
        assert.ok(bounds.left >= 0 && bounds.left + bounds.width <= width && bounds.bottom <= 844);
        await mkdir('artifacts/screenshots/julia', { recursive: true });
        const shot = await cmd('Page.captureScreenshot', { format: 'png' });
        await writeFile(`artifacts/screenshots/julia/${width}.png`, Buffer.from(shot.data, 'base64'));
        await reload();
        assert.deepEqual(await evaluate('[juliaPreview.hidden,juliaPreviewToggle.checked]'), [false,true]);
        await evaluate('juliaPreviewToggle.click()');
        const disabled = await evaluate(`(async () => { const before=draws.julia; fractalCanvas.dispatchEvent(new PointerEvent('pointermove',{clientX:10,clientY:10,isPrimary:true,bubbles:true})); await new Promise(r=>setTimeout(r,200));return [juliaPreview.hidden,draws.julia===before]; })()`);
        assert.deepEqual(disabled, [true,true]);
        await reload();
        assert.deepEqual(await evaluate('[juliaPreview.hidden,juliaPreviewToggle.checked,window.juliaContexts]'), [true,false,0]);
        console.log(`${width}px: default off, Julia pixels, smooth tracking, camera mapping, palettes, inversion, persistence, idle/disabled rendering passed`);
        await client.command('Target.closeTarget', { targetId });
    }
    assert.deepEqual(client.exceptions, []);
} finally {
    client?.close(); browser?.child.kill('SIGTERM'); server.close();
}
