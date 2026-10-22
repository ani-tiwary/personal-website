import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { launchChrome, saveVerifiedPDF, waitForChromeEndpoint } from './sync-resume.mjs';

function fakeBrowser() {
    const browser = new EventEmitter();
    browser.stderr = new EventEmitter();
    browser.stdout = new EventEmitter();
    browser.exitCode = null;
    browser.signalCode = null;
    browser.kill = signal => {
        browser.signalCode = signal;
        queueMicrotask(() => browser.emit('exit', null, signal));
        return true;
    };
    return browser;
}

test('Chrome readiness accepts split output on either stream and removes startup listeners', async () => {
    for (const stream of ['stdout', 'stderr']) {
        const browser = fakeBrowser();
        const ready = waitForChromeEndpoint(browser, 1000);
        browser[stream].emit('data', 'DevTools listen');
        browser[stream].emit('data', 'ing on ws://127.0.0.1:1234/devtools/browser/test\n');
        assert.equal(await ready, 'ws://127.0.0.1:1234/devtools/browser/test');
        assert.equal(browser.stderr.listenerCount('data'), 0);
        assert.equal(browser.stdout.listenerCount('data'), 0);
        assert.equal(browser.listenerCount('exit'), 0);
    }
});

test('Chrome early exit fails immediately with bounded, URL-redacted startup diagnostics', async () => {
    const browser = fakeBrowser();
    const ready = waitForChromeEndpoint(browser, 1000);
    browser.stderr.emit('data', 'x'.repeat(9000) + '\nMissing shared library; see https://example.test/private#token');
    browser.emit('exit', 127, null);
    await assert.rejects(ready, error => {
        assert.match(error.message, /exit 127/);
        assert.match(error.message, /Missing shared library/);
        assert.ok(!error.message.includes('private#token'));
        assert.ok(error.message.length < 2200);
        return true;
    });
});

test('a startup timeout kills the old process and retries with a fresh profile', async () => {
    const browsers = [], profiles = [];
    const started = await launchChrome('/tmp/resume-browser-test', {
        timeoutMs: 10, retryDelayMs: 0,
        spawnProcess(_executable, args) {
            profiles.push(args.find(arg => arg.startsWith('--user-data-dir=')));
            const browser = fakeBrowser();
            browsers.push(browser);
            if (browsers.length === 2) queueMicrotask(() => browser.stderr.emit('data', 'DevTools listening on ws://127.0.0.1:1234/devtools/browser/retry\n'));
            return browser;
        }
    });
    assert.equal(browsers.length, 2);
    assert.equal(browsers[0].signalCode, 'SIGTERM');
    assert.notEqual(profiles[0], profiles[1]);
    assert.equal(started.browser, browsers[1]);
    assert.match(started.endpoint, /retry$/);
});

test('a missing executable gives a useful error without retrying', async () => {
    let attempts = 0;
    await assert.rejects(launchChrome('/tmp/resume-browser-test', {
        timeoutMs: 1000, retryDelayMs: 0,
        spawnProcess() {
            attempts++;
            const browser = fakeBrowser();
            queueMicrotask(() => {
                browser.exitCode = -2;
                browser.emit('error', Object.assign(new Error('spawn failed'), { code: 'ENOENT' }));
            });
            return browser;
        }
    }), /ENOENT.*CHROME_PATH/);
    assert.equal(attempts, 1);
});

test('failed downloads preserve the last resume; identical downloads leave it unchanged', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'resume-save-test-'));
    const target = join(directory, 'resume.pdf');
    try {
        const resume = await readFile(new URL('../media/resume.pdf', import.meta.url));
        assert.equal(await saveVerifiedPDF(resume, target), true);
        for (const invalid of [Buffer.from('<html>Sign in</html>'), resume.subarray(0, 1500)]) {
            await assert.rejects(saveVerifiedPDF(invalid, target), /not a complete PDF/);
            assert.deepEqual(await readFile(target), resume);
        }
        assert.equal(await saveVerifiedPDF(resume, target), false);
        assert.deepEqual(await readdir(directory), ['resume.pdf']);
    } finally {
        await rm(directory, { recursive: true, force: true });
    }
});
