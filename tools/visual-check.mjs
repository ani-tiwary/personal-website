import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = join(root, 'artifacts', 'screenshots');
const port = Number(process.env.PORT || 4173);
const chromePath = process.env.CHROME_PATH || '/usr/bin/google-chrome';
const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
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
        '--use-gl=swiftshader',
        '--enable-unsafe-swiftshader',
        '--remote-debugging-port=0',
        `--user-data-dir=/tmp/ani-visual-check-${process.pid}`,
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

async function capture(client, sessionId, scene, viewport) {
    const destination = join(output, `${scene}-${viewport.name}.png`);
    const url = `http://127.0.0.1:${port}/?intro=off&motion=off&capture=on&scene=${scene}`;

    await client.command('Emulation.setDeviceMetricsOverride', {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: 1,
        mobile: viewport.name === 'mobile'
    }, sessionId);
    await client.command('Page.navigate', { url }, sessionId);
    await client.command('Runtime.evaluate', {
        expression: `new Promise((resolve, reject) => {
            const started = Date.now();
            (function waitForSite() {
                if (window.site) return window.site.ready.then(() => resolve(true));
                if (Date.now() - started > 10000) return reject(new Error('Site did not become ready'));
                setTimeout(waitForSite, 50);
            })();
        })`,
        awaitPromise: true,
        returnByValue: true
    }, sessionId);
    await client.command('Runtime.evaluate', {
        expression: `new Promise(resolve => setTimeout(() => {
            window.fractalRenderer.render();
            requestAnimationFrame(() => requestAnimationFrame(resolve));
        }, 150))`,
        awaitPromise: true,
        returnByValue: true
    }, sessionId);

    const layout = await client.command('Runtime.evaluate', {
        expression: `({
            width: innerWidth,
            height: innerHeight,
            overflow: document.documentElement.scrollWidth > innerWidth,
            ready: document.documentElement.dataset.ready,
            renderScale: window.fractalRenderer.getResolution().scale
        })`,
        returnByValue: true
    }, sessionId);
    if (layout.result.value.width !== viewport.width || layout.result.value.height !== viewport.height) {
        throw new Error(`Viewport mismatch for ${scene}: ${JSON.stringify(layout.result.value)}`);
    }
    if (layout.result.value.overflow) throw new Error(`Horizontal overflow in ${scene} at ${viewport.name}`);
    if (layout.result.value.renderScale < 1.99) throw new Error(`Supersampling disabled in ${scene}: ${layout.result.value.renderScale}x`);

    const screenshot = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
    await writeFile(destination, Buffer.from(screenshot.data, 'base64'));
    const details = await stat(destination);
    if (details.size < 10_000) throw new Error(`Suspiciously small screenshot: ${destination}`);
    console.log(`captured ${scene.padEnd(5)} ${viewport.name.padEnd(7)} ${(details.size / 1024).toFixed(0)} KB`);
}

await mkdir(output, { recursive: true });
await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen);
    server.listen(port, '127.0.0.1', resolveListen);
});

let browser;
let client;
try {
    browser = await launchChrome();
    client = await connect(browser.websocketURL);
    const target = await client.command('Target.createTarget', { url: 'about:blank' });
    const attached = await client.command('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const sessionId = attached.sessionId;
    await client.command('Page.enable', {}, sessionId);
    await client.command('Runtime.enable', {}, sessionId);

    // Warm SwiftShader once before the measured captures; its first compiled frame can be blank.
    await client.command('Emulation.setDeviceMetricsOverride', { width: 800, height: 600, deviceScaleFactor: 1, mobile: false }, sessionId);
    await client.command('Page.navigate', { url: `http://127.0.0.1:${port}/?intro=off&motion=off&capture=on&scene=home` }, sessionId);
    await client.command('Runtime.evaluate', {
        expression: `new Promise(resolve => {
            (function waitForRenderer() {
                if (window.site) return window.site.ready.then(() => setTimeout(resolve, 200));
                setTimeout(waitForRenderer, 25);
            })();
        })`,
        awaitPromise: true
    }, sessionId);

    const scenes = ['home', 'about', 'work'];
    const viewports = [
        { name: 'desktop', width: 1440, height: 900 },
        { name: 'mobile', width: 390, height: 844 }
    ];
    for (const viewport of viewports) {
        for (const scene of scenes) await capture(client, sessionId, scene, viewport);
    }

    const zoomOutRender = await client.command('Runtime.evaluate', {
        expression: `(() => {
            window.site.setCamera({ centerX: -0.5, centerY: 0, zoom: 0.1 });
            const canvas = document.getElementById('fractalCanvas');
            const gl = canvas.getContext('webgl');
            const pixels = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            const samples = [
                [0.02, 0.02], [0.5, 0.02], [0.98, 0.02],
                [0.02, 0.5], [0.98, 0.5],
                [0.02, 0.98], [0.5, 0.98], [0.98, 0.98]
            ].map(([x, y]) => {
                const pixelX = Math.min(canvas.width - 1, Math.floor(canvas.width * x));
                const pixelY = Math.min(canvas.height - 1, Math.floor(canvas.height * y));
                return pixels[(pixelY * canvas.width + pixelX) * 4];
            });
            return { minimum: Math.min(...samples), maximum: Math.max(...samples), samples };
        })()`,
        returnByValue: true
    }, sessionId);
    const zoomOutStats = zoomOutRender.result.value;
    if (zoomOutStats.minimum < 200 || zoomOutStats.maximum - zoomOutStats.minimum > 2) {
        throw new Error(`Zoomed-out far field is not uniform: ${JSON.stringify(zoomOutStats)}`);
    }
    const zoomOutScreenshot = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
    const zoomOutDestination = join(output, 'zoom-out-probe-mobile.png');
    await writeFile(zoomOutDestination, Buffer.from(zoomOutScreenshot.data, 'base64'));
    console.log(`verified uniform far field at 0.1× (${zoomOutStats.minimum}–${zoomOutStats.maximum})`);

    const depthRender = await client.command('Runtime.evaluate', {
        expression: `(() => {
            window.site.setCamera({ centerX: -0.7436438897030277, centerY: 0.13182589503471387, zoom: 1e12 });
            const canvas = document.getElementById('fractalCanvas');
            const gl = canvas.getContext('webgl');
            const pixels = new Uint8Array(canvas.width * canvas.height * 4);
            gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
            let minimum = 255;
            let maximum = 0;
            const buckets = new Set();
            for (let index = 0; index < pixels.length; index += 388) {
                minimum = Math.min(minimum, pixels[index]);
                maximum = Math.max(maximum, pixels[index]);
                buckets.add(Math.floor(pixels[index] / 16));
            }
            return { minimum, maximum, tonalBuckets: buckets.size };
        })()`,
        returnByValue: true
    }, sessionId);
    const depthStats = depthRender.result.value;
    if (depthStats.maximum - depthStats.minimum < 100 || depthStats.tonalBuckets < 6) {
        throw new Error(`Depth probe lacks stable tonal detail: ${JSON.stringify(depthStats)}`);
    }
    const deepScreenshot = await client.command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
    const deepDestination = join(output, 'depth-probe-1e12-mobile.png');
    await writeFile(deepDestination, Buffer.from(deepScreenshot.data, 'base64'));
    console.log(`captured depth probe at 1,000,000,000,000× (${depthStats.tonalBuckets} tonal buckets)`);

    const projectionCheck = await client.command('Runtime.evaluate', {
        expression: `(async () => {
            await window.site.gotoScene('home', { animate: false });
            const panel = document.querySelector('.scene-panel');
            const camera = window.site.getState().camera;
            window.site.setCamera(camera);
            await new Promise(resolve => requestAnimationFrame(resolve));
            const before = panel.getBoundingClientRect();
            window.site.setCamera({ centerX: camera.centerX + 0.1, centerY: camera.centerY, zoom: camera.zoom });
            await new Promise(resolve => requestAnimationFrame(resolve));
            const panned = panel.getBoundingClientRect();
            window.site.setCamera({ centerX: camera.centerX, centerY: camera.centerY, zoom: camera.zoom * 1.5 });
            await new Promise(resolve => requestAnimationFrame(resolve));
            const zoomed = panel.getBoundingClientRect();
            window.site.setCamera(camera);
            return {
                movesWithPan: panned.left < before.left - 10,
                scalesWithZoom: zoomed.width > before.width * 1.45,
                before: { left: before.left, width: before.width },
                panned: { left: panned.left, width: panned.width },
                zoomed: { left: zoomed.left, width: zoomed.width }
            };
        })()`,
        awaitPromise: true,
        returnByValue: true
    }, sessionId);
    if (!projectionCheck.result.value.movesWithPan || !projectionCheck.result.value.scalesWithZoom) {
        throw new Error(`World-space projection failed: ${JSON.stringify(projectionCheck.result.value)}`);
    }
    console.log('verified DOM content moves with pan and scales with zoom');

    const rendererCheck = await client.command('Runtime.evaluate', {
        expression: `(async () => {
            window.site.setCamera({ centerX: -0.7436438897030277, centerY: 0.13182589503471387, zoom: 1e12 });
            const deep = window.fractalRenderer.getDiagnostics();

            window.site.setCamera({
                centerX: -1.29305,
                centerY: 0.06655,
                zoom: 34617.15
            });
            const canvas = document.getElementById('fractalCanvas');
            canvas.dispatchEvent(new WheelEvent('wheel', {
                deltaY: -1,
                clientX: innerWidth / 2,
                clientY: innerHeight / 2,
                bubbles: true,
                cancelable: true
            }));
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            const preview = window.fractalRenderer.getDiagnostics();
            await new Promise(resolve => setTimeout(resolve, 220));
            const refined = window.fractalRenderer.getDiagnostics();
            return { deep, preview, refined };
        })()`,
        awaitPromise: true,
        returnByValue: true
    }, sessionId);
    const modes = rendererCheck.result.value;
    if (modes.deep.precision !== 'double-double') throw new Error(`Deep path inactive: ${JSON.stringify(modes.deep)}`);
    if (modes.preview.mode !== 'interactive' || modes.preview.scale !== 1) {
        throw new Error(`Interactive preview invalid: ${JSON.stringify(modes.preview)}`);
    }
    if (modes.refined.mode !== 'final' || modes.refined.scale < 1.99) {
        throw new Error(`Idle refinement invalid: ${JSON.stringify(modes.refined)}`);
    }
    if (modes.preview.iterations !== modes.refined.iterations) {
        throw new Error(`Iteration budget changed during refinement: ${JSON.stringify(modes)}`);
    }
    console.log('verified matching iteration budgets at 1× preview and 2× idle refinement near 34,617×, plus double-double precision at 1,000,000,000,000×');
    if (client.exceptions.length) throw new Error(`Browser exceptions:\n${client.exceptions.join('\n')}`);
    console.log(`Visual check complete: ${output}`);
} finally {
    client?.close();
    browser?.child.kill('SIGTERM');
    server.close();
}
