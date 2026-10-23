import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
    '.css': 'text/css', '.pdf': 'application/pdf', '.png': 'image/png',
    '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
createServer(async (request, response) => {
    try {
        const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        const file = resolve(root, `.${pathname.endsWith('/') ? pathname + 'index.html' : pathname}`);
        if (!file.startsWith(root + sep)) {
            response.writeHead(403); response.end(); return;
        }
        const data = await readFile(file);
        response.setHeader('Content-Type', types[extname(file)] || 'application/octet-stream');
        if (extname(file) === '.pdf') response.setHeader('Content-Disposition', 'inline');
        response.end(data);
    } catch {
        response.writeHead(404); response.end('Not found');
    }
}).listen(8000, '127.0.0.1', () => console.log('Local app: http://127.0.0.1:8000'));
