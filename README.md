# Ani's fractal portfolio

The site uses WebGL for its Mandelbrot background and semantic HTML for portfolio content. Both layers are coordinated by declarative scenes in `scene-data.js`.

## Run locally

Serve the repository with any static file server, for example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Edit website text

Edit **`site-content.js`** for all website copy, then run `npm run build` and refresh. It is organized into `pages.home`, `pages.about`, `pages.work` (Experience, including all six entries), and `pages.resume`, plus interface sections for navigation, the intro, Display settings, colour schemes, footer, shared labels, and author tools. Links and the resume file path live beside their labels.

Keep IDs, option keys, and `{templateVariables}` unchanged when editing wording. Text is plain text, not HTML. `scene-data.js` contains only scene order, camera positions and panel layout; it combines those with the page copy at load time. `site-controller.js` reads dynamic labels and messages from the same content file.

`tools/index.template.html` contains structure and `{{content.paths}}`. The build fills those from `site-content.js` and generates both root `index.html` and the deployable `dist/` copy. Do not edit generated `index.html` or files in `dist/` directly. Metadata, accessibility labels, and the no-JavaScript notice are generated as real HTML, so they also work without JavaScript. Run `npm run test:content` to validate this wiring.

The text **inside the embedded resume PDF** is still maintained in Overleaf; it is not website UI copy. `site-content.js` controls its heading, description, accessible title, and download labels. Developer-only diagnostics and technical identifiers stay in the code.

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

The workflow installs the current stable Chrome for Testing from Google’s published download manifest and verifies its DevTools connection before accessing Overleaf. Local runs still use `/usr/bin/google-chrome` unless `CHROME_PATH` is set. Browser startup allows 30 seconds and retries once with a fresh profile; early exits include bounded startup diagnostics with URLs redacted. No sharing link is opened during that diagnostic phase.

Run `node tools/sync-resume.mjs --check-browser` to check browser startup without an Overleaf secret or a PDF change. Run `npm run test:resume` to check startup failure handling and ensure invalid downloads preserve the existing PDF.

## Content to finish

The four scenes are Home, About, Experience, and Resume. All six experience entries stay together in the existing `work` scene, with no separate fractal destinations. Finish the content through `site-content.js`:

1. **About:** add your education/background story.
2. **Experience:** edit titles, roles, and concise descriptions in `pages.work.experience`. Each entry selects a small vector icon with its `icon` key; the SVG artwork lives in `site-controller.js`.
3. **Resume:** keep editing the Overleaf resume; `media/resume.pdf` is the displayed copy. The old `resume.tex` file is not used by the updater.
4. **Finish:** check phone layouts, light/dark contrast, keyboard navigation, and real links. Publish to the intended public host and verify access while signed out.

Placeholders are scaffolding for future content. The site uses four hash-addressable scenes within one HTML document.

Experience cards support direct links such as `/#work/goldman-sachs`; these scroll within Experience without moving to a separate fractal destination. Longer panels scroll independently of the fractal canvas. The `placeholders` array supplies titles, prompts, and related links; remove the placeholder styling/status when replacing a slot with finished content.

## Add or edit a scene

Edit `scene-data.js` for scene order, camera destinations, and layout. Add matching copy under `site-content.js` → `pages` using the same scene ID. Navigation labels and page content are pulled from that file; numbering is generated automatically.

The tour starts at Home, then visits the lower seahorse branch for About (200 million×), the saved location near −0.73255 / −0.24115 for Work (about 14.65 million×), and an upper crystal canopy for Resume (1 trillion×). Keep deep camera coordinates as decimal strings. Panel projection subtracts those precise coordinates before converting to pixels and follows the renderer’s zoom limit on less capable browsers.

`camera-travel.js` plans each transition automatically from the current camera, destination, viewport aspect ratio, and renderer zoom bounds. Scene definitions need no timing fields. It compares local travel with wider overviews, stopping the pullback once the route fits within 75% of a viewport, then refines the quickest candidate under the motion policy. Navigation never pulls back beyond Home’s framing unless the starting or destination camera is already wider. This prevents time optimization from shrinking the pan into an unnecessary detour through a distant overview. Short local moves avoid unnecessary zooming out; distant deep moves zoom out, pan, and dive back in. Timing depends on screen distance and zoom octaves, so equivalent local moves feel consistent even at extreme magnifications. Larger depth changes allow faster zoom cruising.

Pan and zoom use overlapping quintic curves with zero velocity and acceleration at their endpoints. Overlap stays within 4× of the overview. The planner measures combined screen-space speed, acceleration, and jerk, including the way zoom amplifies sideways motion, and stretches timing to fit those limits. Candidate evaluation samples each track with numerical headroom; this is a bounded numerical search over these paths, not a claim of a globally optimal trajectory. The site-wide motion policy lives at the top of `camera-travel.js`.

Call `site.gotoScene('work')` or `fractalRenderer.moveTo(camera)` for adaptive travel. An explicit `duration` remains available for scripted choreography and overrides the automatic timing (and its motion limits); zero duration and reduced motion jump directly to the destination. Repeated destinations finish immediately. Interrupted navigation replans from the actual current position; the replacement eases from rest rather than preserving the interrupted velocity. `CameraTravel.plan(start, target, { aspect, minZoom, maxZoom, minOverviewZoom })` exposes `duration` in milliseconds, `overview`, `needsZoomOut`, motion `limits`, and normalized `tracks` for diagnostics. Its cameras use fixed-point `x`/`y` and numeric `zoom`; `CameraTravel.sample(plan, progress)` returns a precise camera.

Run `npm run test:travel` for precision, motion-limit, viewport, and adaptive-timing tests. `npm run test:animation` checks every directed scene pair in desktop and mobile browsers, plus interruptions, explicit durations, and reduced motion.

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

The Settings button to the right of the colour button opens a scroll-sensitivity slider (0.25×–3×, default 1×). Changes apply immediately to mouse-wheel and trackpad zoom and are remembered in this browser. The menu supports keyboard controls, Escape, and outside-click dismissal. Its labels live in `site-content.js` under `settings`.

The same menu includes **Julia set at pointer**, off by default and remembered in this browser. Press **J** to toggle it; the boxed J beside the label hints at the shortcut. It opens a small preview in the bottom left using the pointer’s complex coordinate in the Mandelbrot view as the Julia parameter. The preview follows pointer movement and camera changes, shares the current palette and inversion, and respects reduced motion. Its separate, bounded GPU canvas renders only while enabled and changing; hovering does not redraw the main fractal. Use `npm run test:julia` for the desktop/mobile browser checks.

The Display menu controls animations and fractal detail, and remembers your choices in this browser. Animations default to **On**, regardless of the device’s reduced-motion setting. Choose **Off** to skip camera travel, or **Use device setting** to follow your device’s preference. Explicit saved choices are preserved. The status text explains when animations are disabled or the browser cannot draw the fractal. You can also use `motion=on`, `motion=off`, and `quality=auto|low|high|native` in development URLs. URL preferences override saved values on load.

The colour menu contains four text-free swatches: Rainbow, Aurora, Opal, and Light. Non-inverted Rainbow is the default; explicit selections are remembered. Type `lol` to cycle through all four every 50 ms; type `lol` again or press Escape to stop and restore the selected theme. Cycling respects the animation preference and stops when the tab is hidden. Use the icon button below the palettes or press `i` to toggle inversion of the entire page in any theme, including during cycling. Shortcuts ignore text-entry fields. Inversion lasts for the current visit; cycling does not overwrite the saved theme.


Automatic detail caps moving frames at about 1 million pixels and settled frames at 3 million pixels, then lowers resolution further if consecutive frames are slow. Lighter mode uses smaller budgets; High detail retains the original 2× supersampling, and Screen resolution uses the display pixel ratio. The iteration budget remains unchanged. After 280 ms without wheel input (or when dragging ends), the image sharpens. Text uses transforms while moving and returns to crisp layout rendering when settled. Small trackpad deltas receive a stronger zoom response, normal mouse-wheel steps retain their existing response, and trackpad pinch has its own sensitivity. Scrollable content keeps native scrolling.

Only the lightweight shader compiles at startup. Deep-zoom shaders compile on first use; if a driver rejects them, ordinary scene animation continues with a capped zoom. Run `npm run test:travel` for camera-path continuity, precision, and pacing, and `npm run test:animation` for rendered travel across all scene pairs on desktop/mobile, timing, interruptions, and motion preferences. Browser timing traces are written to `artifacts/screenshots/animation/timings.json`. Run `npm run test:laptop` for trackpad, Retina pixel-budget, reduced-motion override, Display-menu, and shader-fallback checks. `npm run test:navigation` covers desktop/mobile navigation, including browsers without WebGL.

Camera coordinates use 70-digit fixed-point integers. At 20,000×, a Web Worker builds a high-precision reference orbit; the GPU then uses float-pair perturbation, including rebasing for escaping references. The reference stays active during movement and is reused for nearby views. A bounded fourth-order series skips early iterations, and tighter series are prepared in the background as zoom increases. The iteration budget grows continuously up to 4,096. A new reference at extreme zoom temporarily retains the previous complete image instead of drawing an inaccurate preview.

Decimal coordinate strings preserve deep locations through scene JSON and author-mode copying. `getState()` keeps numeric `centerX`/`centerY` for compatibility and includes `preciseCenterX`/`preciseCenterY` strings for lossless round trips. The zoom cap is 10²⁶× to leave headroom for GPU float-pair residuals; without workers or float textures, the direct float-pair fallback caps navigation at 10¹⁰×. More iterations may still be needed to resolve particularly intricate regions.

The colour button opens four text-free palette swatches: Rainbow, Aurora, Opal, and Light. The three multicolour schemes use contour-based shader palettes: a full spectrum, mint/cyan/orchid ribbons, and pastel iridescence. They also add matching gradient accents to the interface. New visits default to non-inverted Rainbow, regardless of the device setting; a saved selection takes precedence. The menu supports keyboard selection, Escape, and outside-click dismissal. Palette colours apply to the interface and fractal independently; the `i` shortcut additionally inverts the entire page, including PDF previews.

The monochrome palette uses smooth escape-time coloring, satin contour lighting and finer bands with suppression of subpixel detail. Two bounded exterior steps soften escape-ring seams; soft directional light and restrained highlights give the contours a carved appearance. Stationary, sub-byte dithering smooths broad 8-bit gradients. Material shading stays outside the fractal iteration loop. Browsers without shader derivatives retain the tonal palette without the relief.

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

`npm run test:fractal` checks precision and reference arithmetic. `npm run test:fractal-browser` checks completed GPU frames against independent 70-digit CPU samples (including 10²⁴× boundary detail), tests mouse/touch navigation, and records software-rendered benchmarks in `artifacts/screenshots/fractal-performance.json`. Set `FRACTAL_ROOT` to a baseline checkout to compare identical workloads. These software timings measure regressions, not a hardware GPU's frame rate. `npm run visual-check` captures all four scenes at desktop/mobile sizes and verifies deep rendering and idle refinement.

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
