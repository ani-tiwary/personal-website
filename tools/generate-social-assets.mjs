// Optional artwork refresh using the existing site renderer and Chrome.
// The checked-in assets keep normal builds independent of a browser.
import { readFile, writeFile } from 'node:fs/promises';
import { server, port, launchChrome, connect } from './browser-harness.mjs';
import { renderHTML } from './render-html.mjs';
import '../site-content.js';

let browser;
let client;
try {
    await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', resolve);
    });
    browser = await launchChrome();
    client = await connect(browser.websocketURL);
    const { targetId } = await client.command('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await client.command('Target.attachToTarget', { targetId, flatten: true });
    const command = (method, params) => client.command(method, params, sessionId);
    await command('Runtime.enable');
    await command('Page.enable');
    await command('Emulation.setDeviceMetricsOverride', { width: 1200, height: 630, deviceScaleFactor: 1, mobile: false });
    await command('Page.navigate', { url: `http://127.0.0.1:${port}/?intro=off&motion=off&quality=high` });
    const ready = await command('Runtime.evaluate', {
        expression: `new Promise((resolve, reject) => {
            const started = Date.now();
            (function wait() {
                if (window.site) return window.site.ready.then(resolve, reject);
                if (Date.now() - started > 15000) return reject(new Error('Site readiness timed out'));
                setTimeout(wait, 50);
            })();
        })`, awaitPromise: true
    });
    if (ready.exceptionDetails) throw new Error('Site failed to become ready');
    const markup = renderHTML(await readFile(new URL('./social-card.html', import.meta.url), 'utf8'), globalThis.siteContent);
    const rendered = await command('Runtime.evaluate', {
        expression: `(async () => {
            document.documentElement.dataset.theme = 'rainbow';
            document.documentElement.dataset.inverted = 'false';
            document.body.insertAdjacentHTML('beforeend', ${JSON.stringify(markup)});
            await document.fonts.ready;
            await window.fractalRenderer.whenReady();
            await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        })()`, awaitPromise: true
    });
    if (rendered.exceptionDetails) throw new Error('Social card rendering failed');
    const shot = await command('Page.captureScreenshot', { format: 'jpeg', quality: 92 });
    await writeFile(new URL('../media/social-preview-v1.jpg', import.meta.url), Buffer.from(shot.data, 'base64'));
    for (const [file, size] of [['favicon-32.png', 32], ['icon-192.png', 192], ['apple-touch-icon.png', 180]]) {
        const icon = await command('Runtime.evaluate', {
            expression: `(() => {
                const canvas = document.createElement('canvas');
                canvas.width = canvas.height = ${size};
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#101014'; ctx.fillRect(0, 0, ${size}, ${size});
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.font = '800 ' + (${size} * .76) + 'px Manrope';
                ctx.fillStyle = '#f7f6fb'; ctx.fillText('a', ${size} * .43, ${size} * .46);
                ctx.fillStyle = '#a5e5d6'; ctx.beginPath();
                ctx.arc(${size} * .78, ${size} * .69, ${size} * .065, 0, Math.PI * 2); ctx.fill();
                return canvas.toDataURL('image/png').split(',')[1];
            })()`, returnByValue: true
        });
        await writeFile(new URL(`../media/${file}`, import.meta.url), Buffer.from(icon.result.value, 'base64'));
    }
    if (client.exceptions.length) throw new Error(client.exceptions.join('\n'));
    console.log('Created 1200×630 social preview and browser/touch icons in media/.');
} finally {
    client?.close();
    browser?.child.kill('SIGTERM');
    server.close();
}
