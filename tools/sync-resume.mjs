// Download the compiled PDF through an Overleaf view-only link. Node 22+, Chrome.
// No account cookies, paid integration, or third-party sync service is needed.
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(root, 'media', 'resume.pdf');
const pause = ms => new Promise(resolvePause => setTimeout(resolvePause, ms));

async function stopBrowser(browser) {
    if (!browser || browser.exitCode !== null || browser.signalCode !== null) return;
    const exited = once(browser, 'exit').catch(() => {});
    browser.kill('SIGTERM');
    await Promise.race([exited, pause(2000)]);
    if (browser.exitCode === null && browser.signalCode === null) {
        browser.kill('SIGKILL');
        await Promise.race([exited, pause(2000)]);
    }
}

// Capture startup output only, before navigating to the private sharing link.
// Exported separately so slow starts and immediate exits can be regression-tested.
export function waitForChromeEndpoint(browser, timeoutMs = 30000) {
    return new Promise((resolveEndpoint, rejectEndpoint) => {
        let output = '';
        const diagnostics = () => output.trim().slice(-2000)
            .replace(/(?:https?|wss?):\/\/\S+/gi, '[URL redacted]');
        const finish = (error, endpoint) => {
            clearTimeout(timer);
            browser.removeListener('error', onError);
            browser.removeListener('exit', onExit);
            browser.stdout?.removeListener('data', onData);
            browser.stderr?.removeListener('data', onData);
            if (error) rejectEndpoint(error);
            else resolveEndpoint(endpoint);
        };
        const failure = message => new Error(`${message}${diagnostics() ? ` Startup diagnostics: ${diagnostics()}` : ' No startup diagnostics were emitted.'}`);
        const onError = error => {
            const failure = new Error(`Chrome could not start (${error.code || 'spawn error'}). Check CHROME_PATH.`);
            failure.code = error.code;
            finish(failure);
        };
        const onExit = (code, signal) => finish(failure(`Chrome exited before becoming ready (${signal || `exit ${code}`}).`));
        const onData = chunk => {
            output = (output + chunk).slice(-8000);
            const match = output.match(/DevTools listening on (ws:\/\/[^\s]+)/);
            if (match) finish(null, match[1]);
        };
        const timer = setTimeout(() => finish(failure(`Chrome startup timed out after ${timeoutMs / 1000}s.`)), timeoutMs);
        browser.once('error', onError);
        browser.once('exit', onExit);
        browser.stdout?.on('data', onData);
        browser.stderr?.on('data', onData);
    });
}

export async function launchChrome(workspace, {
    executable = process.env.CHROME_PATH || '/usr/bin/google-chrome',
    spawnProcess = spawn,
    timeoutMs = 30000,
    retryDelayMs = 1000
} = {}) {
    for (let attempt = 1; attempt <= 2; attempt++) {
        const browser = spawnProcess(executable, [
            '--headless=new', '--no-sandbox', '--disable-dev-shm-usage',
            '--disable-gpu', '--no-first-run', '--no-default-browser-check',
            '--remote-debugging-port=0', `--user-data-dir=${join(workspace, `profile-${attempt}`)}`,
            'about:blank'
        ], { stdio: ['ignore', 'pipe', 'pipe'] });
        try {
            const endpoint = await waitForChromeEndpoint(browser, timeoutMs);
            return { browser, endpoint };
        } catch (error) {
            await stopBrowser(browser);
            if (attempt === 2 || ['ENOENT', 'EACCES'].includes(error.code)) throw error;
            console.warn(`Chrome startup attempt ${attempt} failed; retrying with a fresh profile. ${error.message}`);
            await pause(retryDelayMs);
        }
    }
}

async function connect(endpoint) {
    const socket = new WebSocket(endpoint);
    await once(socket, 'open');
    let nextId = 0;
    const pending = new Map();
    socket.addEventListener('message', ({ data }) => {
        const message = JSON.parse(data);
        const task = pending.get(message.id);
        if (!task) return;
        pending.delete(message.id);
        clearTimeout(task.timer);
        if (message.error) task.reject(new Error('Browser command failed.'));
        else task.resolve(message.result);
    });
    socket.addEventListener('close', () => {
        for (const task of pending.values()) {
            clearTimeout(task.timer);
            task.reject(new Error('Browser disconnected.'));
        }
        pending.clear();
    });
    return {
        command(method, params = {}, sessionId) {
            const id = ++nextId;
            return new Promise((resolveCommand, rejectCommand) => {
                const timer = setTimeout(() => {
                    pending.delete(id);
                    rejectCommand(new Error('Browser command timed out.'));
                }, 20000);
                pending.set(id, { resolve: resolveCommand, reject: rejectCommand, timer });
                socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
            });
        },
        close() { socket.close(); }
    };
}

export async function saveVerifiedPDF(pdf, path = destination) {
    if (pdf.length < 1024 || pdf.length > 20 * 1024 * 1024
        || pdf.subarray(0, 5).toString() !== '%PDF-'
        || !pdf.subarray(-1024).toString().includes('%%EOF')) {
        throw new Error('The download is not a complete PDF. Existing resume kept.');
    }
    let previous;
    try { previous = await readFile(path); } catch (error) {
        if (error.code !== 'ENOENT') throw error;
    }
    if (previous?.equals(pdf)) return false;
    await mkdir(dirname(path), { recursive: true });
    const staging = `${path}.${process.pid}.tmp`;
    try {
        await writeFile(staging, pdf);
        await rename(staging, path);
    } finally {
        await rm(staging, { force: true });
    }
    return true;
}

async function syncResume() {
    const checkBrowser = process.argv.includes('--check-browser');
    let supplied = process.env.OVERLEAF_URL;
    if (process.argv.includes('--stdin')) {
        supplied = '';
        for await (const chunk of process.stdin) supplied += chunk;
    }
    if (!checkBrowser && !supplied?.trim()) throw new Error('Set OVERLEAF_URL to the view-only sharing link, or provide it with --stdin.');
    let url;
    if (!checkBrowser) {
        try { url = new URL(supplied.trim()); } catch { throw new Error('Invalid Overleaf sharing link.'); }
        if (url.protocol !== 'https:' || url.hostname !== 'www.overleaf.com'
        || !/^\/(read\/|project\/[^/]+\/share)/.test(url.pathname)) {
            throw new Error('Use an HTTPS Overleaf view-only sharing link.');
        }
    }

    const workspace = await mkdtemp(join(tmpdir(), 'resume-sync-'));
    const downloads = join(workspace, 'downloads');
    await mkdir(downloads);
    let browser, client;
    // Bound the entire run, including a stuck browser or network challenge.
    const deadline = setTimeout(() => {
        browser?.kill('SIGKILL');
        console.error('Resume sync timed out. Existing resume kept.');
        process.exit(1);
    }, 150000);
    try {
        const started = await launchChrome(workspace);
        browser = started.browser;
        const endpoint = started.endpoint;
        client = await connect(endpoint);
        if (checkBrowser) {
            const version = await client.command('Browser.getVersion');
            console.log(`Chrome startup check passed (${version.product}).`);
            return;
        }
        const target = await client.command('Target.createTarget', { url: 'about:blank' });
        const { sessionId } = await client.command('Target.attachToTarget', { targetId: target.targetId, flatten: true });
        await client.command('Page.enable', {}, sessionId);
        await client.command('Runtime.enable', {}, sessionId);
        await client.command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
        await client.command('Page.navigate', { url: url.href }, sessionId);

        let clicked = false;
        for (let attempt = 0; attempt < 60; attempt++) {
            const state = await client.command('Runtime.evaluate', {
                expression: `(() => {
                    const link = document.querySelector('a[aria-label="Download PDF"][data-disabled="false"]');
                    if (!link || !link.href) return false;
                    link.click();
                    return true;
                })()`, returnByValue: true
            }, sessionId);
            if (state.result?.value === true) { clicked = true; break; }
            await pause(1000);
        }
        if (!clicked) throw new Error('PDF download unavailable. Check link sharing and recompile in Overleaf. Existing resume kept.');

        let pdf;
        for (let attempt = 0; attempt < 30; attempt++) {
            const files = await readdir(downloads);
            const filename = files.find(file => file.toLowerCase().endsWith('.pdf'));
            if (filename && !files.some(file => file.endsWith('.crdownload'))) {
                pdf = await readFile(join(downloads, filename));
                break;
            }
            await pause(1000);
        }
        if (!pdf) throw new Error('PDF download timed out. Existing resume kept.');
        const changed = await saveVerifiedPDF(pdf);
        console.log(changed ? `Updated media/resume.pdf (${pdf.length} bytes).` : 'Resume is already up to date.');
    } finally {
        clearTimeout(deadline);
        client?.close();
        await stopBrowser(browser);
        await rm(workspace, { recursive: true, force: true, maxRetries: 3 });
    }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    syncResume().catch(error => {
        // Never print the sharing URL, browser page content, or session cookies.
        console.error(error.message);
        process.exitCode = 1;
    });
}
