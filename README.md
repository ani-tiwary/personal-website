# Ani's fractal portfolio

The site uses WebGL for its Mandelbrot background and semantic HTML for portfolio content. Both layers are coordinated by declarative scenes in `scene-data.js`.

## Run locally

Serve the repository with any static file server, for example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Resume updates from Overleaf

The Resume section embeds `media/resume.pdf` and includes open/download links. The PDF retains its original colors in dark mode. Home has no portrait or visible scrollbar; the longer sections remain scrollable.

`tools/sync-resume.mjs` opens your Overleaf **view-only sharing link** in a temporary Chrome session and downloads the latest compiled PDF. It requires Node 22+ and Chrome (`CHROME_PATH` can override the executable). It validates the PDF before replacing the existing file, retains the previous copy on failure, and skips identical downloads. The sharing link stays in the `OVERLEAF_URL` environment variable or GitHub secret, never the public site.

For a local refresh, enter the sharing link at the hidden prompt:

```bash
read -rsp 'Overleaf view-only link: ' OVERLEAF_URL
export OVERLEAF_URL
npm run sync-resume
unset OVERLEAF_URL
```

The workflow `.github/workflows/sync-resume.yml` checks at 05:23 and 17:23 UTC daily and can also run from **Actions → Sync resume from Overleaf → Run workflow**. It commits only `media/resume.pdf` when the file changes. Edit and recompile normally in Overleaf; updates appear after the next successful run and deployment, not instantly. Local checkouts receive those remote updates on `git pull`.

To activate it:

1. Push the workflow, updater, PDF, and website changes to the repository's default branch. Scheduled workflows only run from that branch.
2. Set the repository's Actions secret `OVERLEAF_URL` to the full view-only sharing link, including its `#…` fragment. This was configured during setup for `ani-tiwary/personal-website`.
3. Connect the repository to Vercel or Netlify. Both configs build with `npm run build` and publish `dist/`.
4. Add an Actions secret `DEPLOY_HOOK_URL` for reliable deployment after a resume update. On [Vercel](https://vercel.com/docs/deploy-hooks), create a hook under **Settings → Git → Deploy Hooks** for `main`. On [Netlify](https://docs.netlify.com/build/configure-builds/build-hooks/), create a build hook for `main`. Keep the hook URL in the secret, not in source code.
5. Run the workflow once and check both the Actions result and the hosting dashboard. Manual runs also request a deployment when the PDF is unchanged, allowing a failed deployment to be retried.

Until the workflow is pushed, there is no scheduled updater running remotely. Without the optional hook, the workflow saves the PDF to Git and relies on the host's Git auto-deploy integration. Public-repository schedules may be disabled by GitHub after 60 days of repository inactivity; re-enable from Actions if needed. If Overleaf changes its download control or presents a browser challenge, the run fails and the last good PDF remains available.

Run `npm run test:resume` to check that invalid downloads preserve the existing PDF.

## Content to finish

The five sections now have labeled placeholders, using `assignment/website_rubric.md` as a loose content guide. Fill these in through `scene-data.js`:

1. **About:** add your education/background story.
2. **Work:** replace the four placeholder cards in `content.projects` with project names and descriptions. For at least two, explain purpose, contribution, tools, and outcome, and add demo/source links.
3. **Resume:** keep editing the Overleaf resume; `media/resume.pdf` is the displayed copy. The old `resume.tex` file is not used by the updater.
4. **Media:** write introductions connecting each sample to a project, then replace the slots with embedded video, audio, and a rotating image slideshow. Include captions/transcripts, alt text, and accessible controls.
5. **Finish:** check phone layouts, light/dark contrast, keyboard navigation, and real links. Publish to the intended public host and verify access while signed out.

Text comes first; the assignment separates the basic site from the later multimedia work. Placeholders are scaffolding, not completed rubric content. The site still uses hash-addressable scenes within one HTML document; confirm whether the assignment accepts these as its five pages before submission.

Media and project slots support direct links such as `/#media/video`, `/#media/audio`, `/#media/slideshow`, and `/#work/project-one`. Longer panels scroll independently of the fractal canvas. The `placeholders` array supplies titles, prompts, and related links; remove the placeholder styling/status when replacing a slot with finished content.

## Add or edit a scene

Edit `scene-data.js`. A scene contains an `id`, navigation `label`, fractal `camera`, and DOM `content`. Navigation and scene numbering are generated automatically.

`content.placement` sets where the panel sits when its scene camera is reached, using viewport fractions from `0` to `1`. The controller converts that placement to a fractal-space anchor. Afterward, panning moves the HTML with the fractal and zooming scales it with the fractal:

```js
placement: {
    desktop: { x: 0.32, y: 0.5 },
    mobile: { x: 0.5, y: 0.63 }
}
```

Useful development URLs:

```text
/#about
/?scene=work&intro=off&motion=off
/?scene=about&intro=off&motion=off&debug=on
/?scene=about&intro=off&quality=native
```

The fractal renders at a 2× internal drawing resolution by default and is downsampled to the viewport for smoother edges. Add `quality=native` while developing on a slower machine to render at the display's native pixel ratio instead.

During dragging, pinch zoom, wheel zoom, and camera animation, rendering uses a 1× preview with the same iteration budget as the settled image. After 160 ms without wheel input (or when dragging ends), a 2× frame refines the contours. The renderer only reallocates its drawing buffer when its size actually changes.

Camera coordinates use 70-digit fixed-point integers. At 20,000×, a Web Worker builds a high-precision reference orbit; the GPU then uses float-pair perturbation, including rebasing for escaping references. The reference stays active during movement and is reused for nearby views. A bounded fourth-order series skips early iterations, and tighter series are prepared in the background as zoom increases. The iteration budget grows continuously up to 4,096. A new reference at extreme zoom temporarily retains the previous complete image instead of drawing an inaccurate preview.

Decimal coordinate strings preserve deep locations through scene JSON and author-mode copying. `getState()` keeps numeric `centerX`/`centerY` for compatibility and includes `preciseCenterX`/`preciseCenterY` strings for lossless round trips. The zoom cap is 10²⁶× to leave headroom for GPU float-pair residuals; without workers or float textures, the direct float-pair fallback caps navigation at 10¹⁰×. More iterations may still be needed to resolve particularly intricate regions.

The monochrome palette uses continuous escape time, subtle contour relief and finer bands with suppression of subpixel detail. Shading stays outside the fractal iteration loop. Browsers without shader derivatives retain the tonal palette without the relief.

Renderer state is available for profiling in the browser console:

```js
window.fractalRenderer.getDiagnostics()
// { mode: "final", scale: 2, iterations: 687, precision: "direct",
//   pendingReference: false, referenceBuilds: 0, skippedIterations: 0, ... }
await window.fractalRenderer.whenReady() // wait for a required reference and draw submission
window.site.setCamera({
    centerX: "-1.999999999999999999999998", centerY: "0", zoom: 1e24
})
```

`npm run test:fractal` checks precision and reference arithmetic. `npm run test:fractal-browser` checks completed GPU frames against independent 70-digit CPU samples (including 10²⁴× boundary detail), tests mouse/touch navigation, and records software-rendered benchmarks in `artifacts/screenshots/fractal-performance.json`. Set `FRACTAL_ROOT` to a baseline checkout to compare identical workloads. These software timings measure regressions, not a hardware GPU's frame rate. `npm run visual-check` captures all five scenes at desktop/mobile sizes and verifies deep rendering and idle refinement.

Press `D` to toggle author mode. Pan and zoom to a composition you like, then use **Copy scene JSON** to copy a ready-to-edit scene definition. Arrow keys move between scenes; number keys jump directly to them.

## Browser control API

Automation and browser-console work can wait for a stable frame and navigate without animation:

```js
await window.site.ready;
await window.site.gotoScene('about', { animate: false });
window.site.getState();
window.site.setCamera({ centerX: -1.5, centerY: 0, zoom: 1.35 });
```

The document sets `data-ready="true"` after the initial scene and font are painted. A `site:scene-rendered` event fires after later scene changes.

## Visual checks

Chrome is driven directly, so there are no browser-test dependencies to install:

```sh
npm run check
npm run visual-check
```

The visual check captures all scenes at desktop and mobile sizes in `artifacts/screenshots/`. Set `CHROME_PATH` or `PORT` if the defaults do not suit the local machine.
