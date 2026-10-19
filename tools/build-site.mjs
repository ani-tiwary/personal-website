import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const output = resolve(root, 'dist');
await rm(output, { recursive: true, force: true });
await mkdir(resolve(output, 'Manrope'), { recursive: true });
for (const file of ['index.html', 'site.css', 'scene-data.js', 'site-controller.js', 'site-preferences.js', 'script.js', 'fractal-shader.js', 'fractal-math.js', 'fractal-worker.js', 'cursor.png', 'media']) {
    await cp(resolve(root, file), resolve(output, file), { recursive: true });
}
await cp(resolve(root, 'Manrope/Manrope-VariableFont_wght.ttf'), resolve(output, 'Manrope/Manrope-VariableFont_wght.ttf'));
console.log('Static site ready in dist/.');
