import { server, port, launchChrome, connect } from './browser-harness.mjs';

const cases = [
    { name: 'Frame timestamp precedes click', source: `
        const requestFrame = window.requestAnimationFrame;
        window.requestAnimationFrame = callback => requestFrame(time => callback(time - 100));
    ` },
    { name: 'WebGL', source: '' },
    { name: 'WebGL unavailable', source: `
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function(type, ...args) {
            return type === 'webgl' ? null : getContext.call(this, type, ...args);
        };
    ` },
    { name: 'Shader compilation fails', source: `
        WebGLRenderingContext.prototype.getShaderParameter = () => false;
        WebGLRenderingContext.prototype.getShaderInfoLog = () => 'Simulated shader failure';
    ` }
];
await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
});
let browser, client;
try {
    browser = await launchChrome();
    client = await connect(browser.websocketURL);
    for (const viewport of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
        for (const scenario of cases) {
            const { targetId } = await client.command('Target.createTarget', { url: 'about:blank' });
            const { sessionId } = await client.command('Target.attachToTarget', { targetId, flatten: true });
            await client.command('Page.enable', {}, sessionId);
            await client.command('Runtime.enable', {}, sessionId);
            await client.command('Emulation.setDeviceMetricsOverride', {
                ...viewport, deviceScaleFactor: 1, mobile: viewport.width < 620
            }, sessionId);
            // Exercise full-size DOM interactions without making SwiftShader render
            // millions of deep-fractal pixels per animation frame. visual-check
            // separately validates the compositions at full rendering resolution.
            await client.command('Page.addScriptToEvaluateOnNewDocument', { source: `
                const getParameter = WebGLRenderingContext.prototype.getParameter;
                WebGLRenderingContext.prototype.getParameter = function(parameter) {
                    return parameter === this.MAX_VIEWPORT_DIMS ? new Int32Array([640, 640])
                        : getParameter.call(this, parameter);
                };
            ` }, sessionId);
            if (scenario.source) await client.command('Page.addScriptToEvaluateOnNewDocument', { source: scenario.source }, sessionId);
            async function evaluate(expression) {
                const response = await client.command('Runtime.evaluate', {
                    expression, returnByValue: true, awaitPromise: true
                }, sessionId);
                if (response.exceptionDetails) {
                    const state = await client.command('Runtime.evaluate', { expression: 'JSON.stringify({hidden:document.hidden,state:window.site?.getState(),scrollX,scrollY,active:document.activeElement?.outerHTML.slice(0,200)})', returnByValue:true }, sessionId);
                    console.log('Browser exceptions',client.exceptions);
                    throw Error((response.exceptionDetails.exception?.description || response.exceptionDetails.text) + '\n' + state.result.value);
                }
                return response.result.value;
            }
            async function waitFor(expression, timeout = 10000) {
                await evaluate(`new Promise((resolve, reject) => {
                    const started = Date.now();
                    (function poll() {
                        if (${expression}) return resolve(true);
                        if (Date.now() - started > ${timeout}) return reject(Error('Timed out: ' + ${JSON.stringify(expression)}));
                        setTimeout(poll, 50);
                    })();
                })`);
            }
            async function click(selector) {
                const point = await evaluate(`(() => {
                    const element = document.querySelector(${JSON.stringify(selector)});
                    if (!element) throw Error('Missing control: ' + ${JSON.stringify(selector)});
                    element.scrollIntoView({ block: 'nearest' });
                    const r = element.getBoundingClientRect();
                    const x = r.x + r.width / 2, y = r.y + r.height / 2;
                    if (!element.contains(document.elementFromPoint(x,y))) throw Error('Blocked control: ' + ${JSON.stringify(selector)});
                    return { x, y };
                })()`);
                for (const type of ['mousePressed', 'mouseReleased']) {
                    await client.command('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 }, sessionId);
                }
            }
            async function sceneReady(id) {
                // Adaptive routes can exceed a fixed deadline. Include the planned
                // remaining travel and software-GPU rendering overhead.
                const timeout = await evaluate(`(() => {
                    const m=window.FractalMath, current=window.site.getState().camera;
                    const target=window.site.scenes.find(s=>s.id==='${id}').camera;
                    const camera=s=>({x:m.parse(s.preciseCenterX??s.centerX),y:m.parse(s.preciseCenterY??s.centerY),zoom:s.zoom});
                    const plan=window.CameraTravel.plan(camera(current),camera(target),{
                        aspect:innerWidth/innerHeight,minZoom:window.fractalRenderer?.getMinZoom(),
                        maxZoom:window.fractalRenderer?.getMaxZoom()
                    });
                    return Math.max(10000,plan.duration+5000);
                })()`);
                await waitFor(`window.site?.getState().scene === '${id}' && Math.abs(window.site.getState().camera.zoom - window.site.scenes.find(s => s.id === '${id}').camera.zoom) < 0.01`,timeout);
                await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
            }
            await client.command('Page.navigate', { url: `http://127.0.0.1:${port}/?quality=native` }, sessionId);
            await waitFor(`document.documentElement?.dataset.ready === 'true'`);
            await click('#blackOverlay');
            await waitFor(`document.getElementById('blackOverlay').classList.contains('is-dismissed')`);
            await click('.scene-panel[data-scene="home"] [data-scene-link="about"]');
            await sceneReady('about');
            await click('.scene-panel[data-scene="about"] [data-scene-link="work"]');
            await sceneReady('work');
            const work = await evaluate(`({
                tabs: [...document.querySelectorAll('#navBar [data-scene-link]')].map(b => b.dataset.sceneLink),
                entries: document.querySelectorAll('[data-scene="work"] .experience-card').length,
                exits: document.querySelectorAll('[data-scene="work"] .experience-card [data-scene-link], [data-fractal-link]').length
            })`);
            if (work.tabs.join(',') !== 'home,about,work,resume' || work.entries !== 6 || work.exits !== 0) {
                throw Error('Entries must stay together in Experience: ' + JSON.stringify(work));
            }
            for (const id of ['resume', 'home', 'about', 'work']) {
                await click(`#navBar [data-scene-link="${id}"]`);
                await sceneReady(id);
            }
            await click('#themeToggle');
            if (!await evaluate(`document.getElementById('themeToggle').getAttribute('aria-expanded') === 'true'`)) throw Error('Colour menu did not open');
            await click('[data-palette="light"]');
            if (await evaluate('document.documentElement.dataset.theme') !== 'light') throw Error('Colour selection failed');
            await client.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 }, sessionId);
            if (!await evaluate(`document.getElementById('colourMenu').hidden && document.activeElement.id === 'themeToggle'`)) throw Error('Colour menu did not dismiss');
            await evaluate('history.back()');
            await sceneReady('about');
            // Direct section entry and keyboard activation of the intro.
            await client.command('Page.navigate', { url: `http://127.0.0.1:${port}/?motion=off#work/lykke` }, sessionId);
            await waitFor(`document.documentElement?.dataset.ready === 'true'`);
            await sceneReady('work');
            await waitFor(`document.activeElement.id === 'work-lykke'`);
            await evaluate(`document.getElementById('blackOverlay').focus()`);
            await client.command('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
            await client.command('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 }, sessionId);
            await waitFor(`document.getElementById('blackOverlay').inert`);
            await click('#navBar [data-scene-link="resume"]');
            await sceneReady('resume');
            const pdf = await evaluate(`(async () => {
                const link = document.querySelector('.resume-actions a');
                const r = link.getBoundingClientRect();
                return { ok: (await fetch(link.href)).ok, clickable: link.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)) };
            })()`);
            if (!pdf.ok || !pdf.clickable) throw Error('Resume link failed');
            await client.command('Target.closeTarget', { targetId });
            console.log(`Passed: ${scenario.name}, ${viewport.width}px — intro, links, navigation, history, theme, deep links, resume`);
        }
    }
    if (client.exceptions.length) throw Error(client.exceptions.join('\n'));
} finally {
    client?.close();
    browser?.child.kill('SIGTERM');
    server.close();
}
