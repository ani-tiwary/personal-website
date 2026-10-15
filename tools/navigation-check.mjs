import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(process.env.SITE_ROOT || resolve(import.meta.dirname, '..'));
const port = Number(process.env.PORT || 4173);
const chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.pdf': 'application/pdf',
    '.ttf': 'font/ttf'
};

const server = createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, `http://localhost:${port}`).pathname);
        const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const file = normalize(join(root, relative));
        if (!file.startsWith(`${root}/`)) throw new Error('Invalid path');
        const body = await readFile(file);
        response.writeHead(200, { 'Content-Type': mime[extname(file)] || 'application/octet-stream' });
        response.end(body);
    } catch {
        response.writeHead(404);
        response.end('Not found');
    }
});

async function launchChrome() {
    const child = spawn(chromePath, [
        '--headless=new',
        '--no-sandbox',
        '--hide-scrollbars',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--disable-gpu-watchdog',
        '--enable-unsafe-swiftshader',
        '--remote-debugging-port=0',
        `--user-data-dir=/tmp/ani-navigation-check-${process.pid}`,
        'about:blank'
    ], { stdio: ['ignore', 'ignore', 'pipe'] });

    const websocketURL = await new Promise((resolveURL, rejectURL) => {
        let buffer = '';
        const timer = setTimeout(() => rejectURL(new Error('Chrome DevTools did not start')), 10_000);
        child.once('error', rejectURL);
        child.stderr.on('data', chunk => {
            buffer += chunk;
            const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
            if (match) {
                clearTimeout(timer);
                resolveURL(match[1]);
            }
        });
    });
    return { child, websocketURL };
}

function connect(websocketURL) {
    return new Promise((resolveSocket, rejectSocket) => {
        const socket = new WebSocket(websocketURL);
        const pending = new Map();
        const exceptions = [];
        let nextId = 0;

        socket.addEventListener('error', rejectSocket, { once: true });
        socket.addEventListener('message', event => {
            const message = JSON.parse(event.data);
            if (message.method === 'Runtime.exceptionThrown') {
                const details = message.params.exceptionDetails;
                exceptions.push(details.exception?.description || `${details.text} at ${details.url || 'unknown'}:${details.lineNumber || 0}`);
            }
            if (!message.id || !pending.has(message.id)) return;
            const { resolveCommand, rejectCommand } = pending.get(message.id);
            pending.delete(message.id);
            if (message.error) rejectCommand(new Error(message.error.message));
            else resolveCommand(message.result);
        });
        socket.addEventListener('open', () => {
            resolveSocket({
                exceptions,
                command(method, params = {}, sessionId) {
                    const id = ++nextId;
                    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
                    return new Promise((resolveCommand, rejectCommand) => pending.set(id, { resolveCommand, rejectCommand }));
                },
                close() { socket.close(); }
            });
        }, { once: true });
    });
}


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
            async function waitFor(expression) {
                await evaluate(`new Promise((resolve, reject) => {
                    const started = Date.now();
                    (function poll() {
                        if (${expression}) return resolve(true);
                        if (Date.now() - started > 10000) return reject(Error('Timed out: ' + ${JSON.stringify(expression)}));
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
                await waitFor(`window.site?.getState().scene === '${id}' && Math.abs(window.site.getState().camera.zoom - window.site.scenes.find(s => s.id === '${id}').camera.zoom) < 0.01`);
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
            await click('.scene-panel[data-scene="work"] [data-section-link="video"]');
            await sceneReady('media');
            await waitFor(`document.activeElement.id === 'media-video' && location.hash === '#media/video'`);
            await click('.scene-panel[data-scene="media"] [data-section-link="project-one"]');
            await sceneReady('work');
            await waitFor(`document.activeElement.id === 'work-project-one'`);
            for (const id of ['resume', 'media', 'home', 'about', 'work']) {
                await click(`#navBar [data-scene-link="${id}"]`);
                await sceneReady(id);
            }
            const theme = await evaluate('document.documentElement.dataset.theme');
            await click('#themeToggle');
            if (await evaluate('document.documentElement.dataset.theme') === theme) throw Error('Theme toggle failed');
            await evaluate('history.back()');
            await sceneReady('about');
            // Direct section entry and keyboard activation of the intro.
            await client.command('Page.navigate', { url: `http://127.0.0.1:${port}/?motion=off#media/audio` }, sessionId);
            await waitFor(`document.documentElement?.dataset.ready === 'true'`);
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
