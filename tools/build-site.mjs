import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import '../site-content.js';
import { renderHTML } from './render-html.mjs';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
// Catch outdated content schemas before publishing an empty Experience section.
if (!globalThis.siteContent.pages.work.experience?.length) {
    throw new Error('Missing Experience entries: use pages.work.experience in site-content.js, not the old projects array.');
}
// Generate the root entry too, so serving the repository or dist uses the same copy.
const template = await readFile(resolve(root, 'tools/index.template.html'), 'utf8');
let html = renderHTML(template, globalThis.siteContent);
// Content hashes make each changed script/style a fresh browser request.
const assets = [...html.matchAll(/(?:src|href)="([^"?]+\.(?:js|css))(?:\?[^\"]*)?"/g)];
for (const [attribute, file] of assets) {
    const hash = createHash('sha256').update(await readFile(resolve(root, file))).digest('hex').slice(0, 12);
    html = html.replace(attribute, attribute.replace(/=".*"$/, `="${file}?v=${hash}"`));
}
await writeFile(resolve(root, 'index.html'), html);
await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, 'Manrope'), { recursive: true });
for (const file of ['index.html', 'site.css', 'site-content.js', 'scene-data.js', 'site-controller.js', 'site-preferences.js', 'script.js', 'fractal-screenshot.js', 'julia-preview.js', 'camera-travel.js', 'fractal-shader.js', 'fractal-math.js', 'fractal-worker.js', 'cursor.png', 'media']) {
    await cp(resolve(root, file), resolve(output, file), { recursive: true });
}
await cp(resolve(root, 'Manrope/Manrope-VariableFont_wght.ttf'), resolve(output, 'Manrope/Manrope-VariableFont_wght.ttf'));
// Hash scenes belong to one canonical document; do not list them as separate pages.
const canonicalURL = new URL(globalThis.siteContent.meta.url);
if (canonicalURL.protocol !== 'https:') throw new Error('The canonical URL must use HTTPS.');
const robots = `User-agent: *\nAllow: /\n\nSitemap: ${new URL('sitemap.xml', canonicalURL)}\n`;
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${canonicalURL.href.replaceAll('&', '&amp;')}</loc></url></urlset>\n`;
for (const [file, body] of [['robots.txt', robots], ['sitemap.xml', sitemap]]) {
    await writeFile(resolve(root, file), body);
    await writeFile(resolve(output, file), body);
}
// Package the isolated course edition without changing the main site's output.
await (await import('../terrible-version/build.mjs')).buildCourseVersion(output);
console.log('Static site ready in dist/.');

