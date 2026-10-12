import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const root = process.env.FRACTAL_ROOT || resolve(import.meta.dirname, '..');
const output = join(root, 'artifacts', 'screenshots');
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
            if (message.method === 'Runtime.consoleAPICalled') console.log('browser:', message.params.args.map(a => a.value || a.description).join(' '));
            if (message.method === 'Runtime.exceptionThrown') {
                const details = message.params.exceptionDetails; console.error('Browser exception:', details.exception?.description || details.text);
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


await mkdir(output, { recursive: true });
await new Promise((yes, no) => { server.once('error', no); server.listen(port, '127.0.0.1', yes); });
let browser, client;
try {
    browser = await launchChrome(); client = await connect(browser.websocketURL);
    const target = await client.command('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.command('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    await client.command('Runtime.enable', {}, sessionId);
    await client.command('Emulation.setDeviceMetricsOverride', { width: 400, height: 250, deviceScaleFactor: 1, mobile: false }, sessionId);
    await client.command('Page.navigate', { url: `http://127.0.0.1:${port}/?intro=off&motion=off&capture=on` }, sessionId);
    async function evaluate(expression) {
        const result = await Promise.race([client.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId), new Promise((_, no) => { const timer = setTimeout(() => no(Error('Browser evaluation timed out: ' + expression.slice(0,120))), 30000); timer.unref(); })]);
        if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
        return result.result.value;
    }
    await evaluate(`new Promise((yes,no) => { let n=0; const poll=()=> { if(window.site) window.site.ready.then(yes); else if(n++>200) no(Error('Startup timeout')); else setTimeout(poll,50); }; poll(); })`);
    console.log('Browser ready');
    await evaluate(`(() => { const g=document.querySelector('canvas').getContext('webgl'); if(g.isContextLost() || g.getError()) throw Error('WebGL context invalid'); return true; })()`);
    const results = [];
    for (const [name, camera] of [
        ['home', { centerX: -1.5, centerY: 0, zoom: 1.35 }],
        ['about', { centerX: -0.6619150588774977, centerY: 0.4626763853121446, zoom: 6252.914748397133 }],
        ['detail', { centerX: -0.7436438897030277, centerY: 0.13182589503471387, zoom: 1e12 }]
    ]) {
        console.log('Checking', name);
        await evaluate(`window.site.setCamera(${JSON.stringify(camera)}); true`);
        await evaluate(`window.fractalRenderer.whenReady ? window.fractalRenderer.whenReady() : true`);
        const stats = await evaluate(`(async () => {
            const renderer = window.fractalRenderer;
            const gl = document.getElementById('fractalCanvas').getContext('webgl');
            const samples=[];
            for(let i=0;i<5;i++) { const start=performance.now(); renderer.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); if(i>0) samples.push(performance.now()-start); await new Promise(requestAnimationFrame); }
            samples.sort((a,b)=>a-b);
            return { median: (samples[1]+samples[2])/2, p95: samples[3], ...renderer.getDiagnostics() };
        })()`);
        results.push({ name, ...stats }); console.log(name, JSON.stringify(stats));
        await writeFile(join(output, 'fractal-performance.json'), JSON.stringify(results, null, 2));
        const screenshot = await client.command('Page.captureScreenshot', { format:'png' }, sessionId);
        await writeFile(join(output, `fractal-${name}.png`), Buffer.from(screenshot.data,'base64'));
    }
    const interactive = await evaluate(`(async () => {
        const renderer=window.fractalRenderer, canvas=document.querySelector('canvas'), gl=canvas.getContext('webgl');
        const samples=[]; let diagnostics;
        for(let i=0;i<5;i++) {
            const start=performance.now();
            canvas.dispatchEvent(new WheelEvent('wheel',{deltaY:-0.1,clientX:200,clientY:125,cancelable:true}));
            await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
            diagnostics=renderer.getDiagnostics();
            gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));
            if(i>0) samples.push(performance.now()-start);
        }
        samples.sort((a,b)=>a-b);
        return {median:(samples[1]+samples[2])/2,p95:samples[3],...diagnostics};
    })()`);
    results.push({name:'deep interaction',...interactive});
    await writeFile(join(output,'fractal-performance.json'),JSON.stringify(results,null,2));
    console.log(JSON.stringify(results, null, 2));
    if (!process.env.FRACTAL_ROOT) {
        console.log('GPU accuracy:', await evaluate(await readFile(join(root, 'tools/fractal-probes.js'), 'utf8')));
        await evaluate(`window.site.setCamera({centerX:'-1.999999999999999999999998',centerY:'0',zoom:1e24}); window.fractalRenderer.whenReady()`);
        const before = await evaluate(`({state:window.fractalRenderer.getState(),diagnostics:window.fractalRenderer.getDiagnostics()})`);
        await client.command('Input.dispatchMouseEvent',{type:'mousePressed',x:200,y:170,button:'left',clickCount:1},sessionId);
        await client.command('Input.dispatchMouseEvent',{type:'mouseMoved',x:201,y:170,button:'left',buttons:1},sessionId);
        await evaluate(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);
        const after = await evaluate(`({state:window.fractalRenderer.getState(),diagnostics:window.fractalRenderer.getDiagnostics()})`);
        await client.command('Input.dispatchMouseEvent',{type:'mouseReleased',x:201,y:170,button:'left',clickCount:1},sessionId);
        if (before.state.preciseCenterX === after.state.preciseCenterX || before.state.centerX !== after.state.centerX) throw Error('Sub-double drag failed');
        if (before.diagnostics.referenceBuilds !== after.diagnostics.referenceBuilds) throw Error('Dragging unnecessarily rebuilt the reference');
        if (after.diagnostics.precision !== 'reference-orbit perturbation') throw Error('Dragging lost precision');
        await client.command('Emulation.setTouchEmulationEnabled',{enabled:true},sessionId);
        await client.command('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:150,y:160,id:1},{x:250,y:160,id:2}]},sessionId);
        await client.command('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:130,y:160,id:1},{x:270,y:160,id:2}]},sessionId);
        await client.command('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]},sessionId);
        const pinched = await evaluate(`window.fractalRenderer.getState()`);
        if (Math.abs(pinched.zoom/after.state.zoom-1.4)>0.001) throw Error('Pinch zoom failed: '+JSON.stringify(pinched));
        await client.command('Emulation.setTouchEmulationEnabled',{enabled:false},sessionId);
        const navigation = await evaluate(`(async()=>{
            window.site.setCamera({centerX:-0.7436438897030277,centerY:0.13182589503471387,zoom:1e12});
            window.site.setCamera({centerX:-1.25,centerY:0.02,zoom:1e6});
            window.site.setCamera({centerX:-1.5,centerY:0,zoom:1.35});
            await new Promise(resolve=>setTimeout(resolve,250));
            if(window.fractalRenderer.getState().centerX!==-1.5) throw Error('Stale reference changed camera');
            await window.site.gotoScene('work',{animate:true,duration:200});
            const destination=window.site.getState().camera;
            if(Math.abs(destination.zoom-window.site.scenes.find(s=>s.id==='work').camera.zoom)>1e-8) throw Error('Scene animation missed destination');
            return true;
        })()`);
        console.log('Verified precise dragging, reference reuse, touch pinch, stale-worker handling and scene animation:',navigation);
    }
    if(client.exceptions.length) throw Error(client.exceptions.join('\n'));
} finally { client?.close(); browser?.child.kill('SIGTERM'); server.close(); }
