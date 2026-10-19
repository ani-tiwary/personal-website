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



export { server, port, launchChrome, connect };
