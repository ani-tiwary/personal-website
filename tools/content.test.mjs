import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import '../site-content.js';
import { renderHTML } from './render-html.mjs';

const content = globalThis.siteContent;
const template = await readFile(new URL('./index.template.html', import.meta.url), 'utf8');
const sceneSource = await readFile(new URL('../scene-data.js', import.meta.url), 'utf8');

test('HTML uses centralized copy, including metadata and the no-JavaScript notice', () => {
    const changed = structuredClone(content);
    changed.meta.title = 'A new title';
    changed.meta.noScript = 'A new no-JavaScript notice';
    changed.display.motionOptions.on = 'Enable animation';
    changed.theme.options.light.label = 'Paper';
    const html = renderHTML(template, changed);
    assert.ok(html.includes('<title>A new title</title>'));
    assert.ok(html.includes('<noscript>A new no-JavaScript notice</noscript>'));
    assert.ok(html.includes('<option value="on">Enable animation</option>'));
    assert.ok(html.includes('value="light" aria-label="Paper"'));
    assert.ok(!/\{\{[\w.]+\}\}/.test(html));
    assert.ok(html.indexOf('src="site-content.js"') < html.indexOf('src="scene-data.js"'));
});

test('plain-text edits cannot inject markup or escape HTML attributes', () => {
    const changed = structuredClone(content);
    changed.meta.description = 'A "quote" & <script>alert(1)</script>';
    changed.header.homeLabel = "Ani's <home>";
    const html = renderHTML(template, changed);
    assert.ok(html.includes('content="A &quot;quote&quot; &amp; &lt;script&gt;alert(1)&lt;/script&gt;"'));
    assert.ok(html.includes('aria-label="Ani&#39;s &lt;home&gt;"'));
    assert.throws(() => renderHTML('{{missing.text}}', changed), /Missing website text/);
});

test('scene labels, experience copy, and links follow content edits without changing camera layout', () => {
    const changed = structuredClone(content);
    changed.pages.work.label = 'Projects';
    changed.pages.work.title = 'A revised work heading';
    changed.pages.work.experience[0].title = 'A revised role';
    const context = { window: { siteContent: changed } };
    vm.runInNewContext(sceneSource, context);
    const scenes = context.window.siteScenes;
    const work = scenes.find(scene => scene.id === 'work');
    assert.equal(work.label, 'Projects');
    assert.equal(work.content.title, 'A revised work heading');
    assert.equal(work.content.experience[0].title, 'A revised role');
    assert.equal(work.camera.zoom, 14652251.863736669);
    assert.equal(work.content.placement.desktop.x, 0.68);
    assert.equal(work.content.experience.length, 6);
    for (const scene of scenes) {
        assert.ok(content.pages[scene.id], `Missing page copy: ${scene.id}`);
        for (const link of scene.content.links || []) {
            if (link.scene) assert.ok(scenes.some(target => target.id === link.scene));
        }
    }
});
