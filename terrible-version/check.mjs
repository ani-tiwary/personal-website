// Run after npm run build: node terrible-version/check.mjs
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { launchChrome, connect } from '../tools/browser-harness.mjs';

const root = resolve(import.meta.dirname, '../dist');
const screenshots = resolve(import.meta.dirname, '../artifacts/course-check');
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.pdf': 'application/pdf', '.ttf': 'font/ttf', '.webm': 'video/webm', '.wav': 'audio/wav' };
const server = createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        let file = resolve(root, '.' + decodeURIComponent(url.pathname));
        if (file !== root && !file.startsWith(root + '/')) throw Error('Invalid path');
        if ((await stat(file)).isDirectory()) {
            if (!url.pathname.endsWith('/')) { res.writeHead(301, { Location: url.pathname + '/' + url.search }); res.end(); return; }
            file = resolve(file, 'index.html');
        }
        const content = await readFile(file);
        res.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' }); res.end(content);
    } catch { res.writeHead(404); res.end('Not found'); }
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
const origin = `http://127.0.0.1:${server.address().port}`;
let browser, client;
try {
    const main = await readFile(resolve(root, 'index.html'), 'utf8');
    assert(!main.includes('terrible-version'));
    assert.deepEqual(await readFile(resolve(root, 'media/resume.pdf')), await readFile(resolve(root, '../media/resume.pdf')));
    const route = await fetch(`${origin}/terrible-version`);
    assert.equal(route.status, 200);
    await mkdir(screenshots, { recursive: true });
    browser = await launchChrome(); client = await connect(browser.websocketURL);
    for (const scenario of [
        { width: 1280, height: 900, webgl: true },
        { width: 390, height: 844, webgl: true },
        { width: 320, height: 700, webgl: false }
    ]) {
        const { targetId } = await client.command('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await client.command('Target.attachToTarget', { targetId, flatten: true });
        const command = (method, params = {}) => client.command(method, params, sessionId);
        await command('Page.enable'); await command('Runtime.enable'); await command('Network.enable');
        await command('Emulation.setDeviceMetricsOverride', { width: scenario.width, height: scenario.height, deviceScaleFactor: 1, mobile: scenario.width < 620 });
        await command('Page.addScriptToEvaluateOnNewDocument', { source: `
            localStorage.setItem('theme','aurora');
            localStorage.setItem('portfolio:motion','on');
            localStorage.removeItem('course:theme');localStorage.removeItem('course:motion');
            ${scenario.webgl ? `const original=WebGLRenderingContext.prototype.getParameter;WebGLRenderingContext.prototype.getParameter=function(p){return p===this.MAX_VIEWPORT_DIMS?new Int32Array([640,640]):original.call(this,p)}` : `const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(t,...args){return t==='webgl'?null:original.call(this,t,...args)}`}
        ` });
        const evaluate = async expression => {
            const response = await command('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
            if (response.exceptionDetails) throw Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
            return response.result.value;
        };
        const waitFor = expression => evaluate(`new Promise((resolve,reject)=>{const start=Date.now();(function poll(){if(${expression})return resolve(true);if(Date.now()-start>15000)return reject(Error('Timed out: '+${JSON.stringify(expression)}));setTimeout(poll,50)})()})`);
        const click = async selector => {
            const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'nearest'});const r=e.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;if(!e.contains(document.elementFromPoint(x,y)))throw Error('Blocked control: '+${JSON.stringify(selector)});return {x,y}})()`);
            for (const type of ['mousePressed', 'mouseReleased']) await command('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
        };
        await command('Page.navigate', { url: `${origin}/terrible-version` });
        await waitFor(`document.documentElement?.dataset.ready==='true'`);
        assert.equal(await evaluate(`getComputedStyle(document.getElementById('blackOverlay')).display`), 'none');
        assert.equal(await evaluate('window.sitePreferences.getState().motion'), 'off');
        assert.equal(await evaluate('document.documentElement.dataset.theme'), 'rainbow');
        assert.deepEqual(await evaluate(`[...document.querySelectorAll('#navBar a')].map(a=>a.dataset.sceneLink)`), ['home', 'about', 'work', 'resume', 'media']);
        for (const id of ['home', 'about', 'work', 'resume', 'media']) {
            await click(`#navBar [data-scene-link="${id}"]`);
            await waitFor(`window.site.getState().scene==='${id}'`);
            await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
            const layout = await evaluate(`(()=>{const panel=document.querySelector('.scene-panel[data-scene="${id}"]'),r=panel.getBoundingClientRect(),scroll=panel.querySelector('.scene-scroll');return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:innerWidth,height:innerHeight,headerBottom:document.querySelector('.site-header').getBoundingClientRect().bottom,horizontal:scroll.scrollWidth-scroll.clientWidth,active:document.querySelector('#navBar [aria-current="page"]').dataset.sceneLink}})()`);
            assert(layout.left >= -1 && layout.right <= layout.width + 1 && layout.top >= layout.headerBottom && layout.bottom <= layout.height, JSON.stringify({ id, ...layout }));
            assert(layout.horizontal <= 2, `${id} overflows horizontally: ${layout.horizontal}`);
            assert.equal(layout.active, id);
            const { data } = await command('Page.captureScreenshot', { format: 'png' });
            await writeFile(resolve(screenshots, `${id}-${scenario.width}.png`), Buffer.from(data, 'base64'));
        }
        await waitFor(`document.querySelector('video').readyState>=2 && document.querySelector('audio').readyState>=2`);
        await evaluate(`(async()=>{await document.querySelector('video').play();await document.querySelector('audio').play()})()`);
        await waitFor(`document.querySelector('video').currentTime>0 && document.querySelector('audio').currentTime>0`);
        await click('#navBar [data-scene-link="about"]');
        assert(await evaluate(`[...document.querySelectorAll('video,audio')].every(m=>m.paused)`));
        await evaluate(`window.site.gotoScene('media',{animate:false,section:'gallery'})`);
        const firstImage = await evaluate(`document.querySelector('#media-gallery img').src`);
        await click('#media-gallery button:last-child');
        assert.notEqual(await evaluate(`document.querySelector('#media-gallery img').src`), firstImage);
        await click('#media-gallery button:nth-child(2)');
        assert.equal(await evaluate(`document.querySelector('#media-gallery button:nth-child(2)').getAttribute('aria-pressed')`), 'true');
        await click('#media-gallery button:nth-child(2)');
        await evaluate(`window.site.gotoScene('media',{animate:false,section:'feedback'})`);
        assert.equal(await evaluate(`document.querySelector('.feedback-form').checkValidity()`), false);
        await evaluate(`document.getElementById('feedbackMessage').value='Useful fractal demo!';Object.defineProperty(navigator,'clipboard',{value:{writeText:async text=>{window.copiedFeedback=text}},configurable:true})`);
        await click('#copyFeedback');
        await waitFor(`window.copiedFeedback?.includes('Useful fractal demo!')`);
        await click('#themeToggle'); await click('[data-palette="light"]');
        assert.equal(await evaluate(`localStorage.getItem('theme')`), 'aurora');
        assert.equal(await evaluate(`localStorage.getItem('portfolio:motion')`), 'on');
        await command('Page.navigate', { url: `${origin}/terrible-version/#work/scarlet-sync` });
        await waitFor(`document.documentElement?.dataset.ready==='true' && document.activeElement.id==='work-scarlet-sync'`);
        await command('Page.reload');
        await waitFor(`document.documentElement?.dataset.ready==='true' && document.activeElement.id==='work-scarlet-sync'`);
        await evaluate(`window.site.gotoScene('resume',{animate:false})`);
        const pdf = await evaluate(`(async()=>{const a=document.querySelector('[download]');return {path:new URL(a.href).pathname,ok:(await fetch(a.href)).ok}})()`);
        assert.deepEqual(pdf, { path: '/media/resume.pdf', ok: true });
        await command('Page.navigate', { url: origin + '/' });
        await waitFor(`document.documentElement?.dataset.ready==='true'`);
        assert.equal(await evaluate(`document.querySelectorAll('#navBar [data-scene-link]').length`), 4);
        assert.equal(await evaluate(`getComputedStyle(document.getElementById('blackOverlay')).display==='none'`), false);
        assert.equal(await evaluate('window.sitePreferences.getState().motion'), 'on');
        console.log(`Passed ${scenario.width}px ${scenario.webgl ? 'WebGL' : 'fallback'}: five pages, layout, media playback, feedback, deep links, preferences, original homepage.`);
        await client.command('Target.closeTarget', { targetId });
    }
    assert.deepEqual(client.exceptions, []);
} finally { client?.close(); browser?.child.kill('SIGTERM'); server.close(); }
