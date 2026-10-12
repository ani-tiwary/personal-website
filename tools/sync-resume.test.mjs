import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { saveVerifiedPDF } from './sync-resume.mjs';

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
