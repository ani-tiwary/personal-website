# Ani's fractal portfolio

The site uses WebGL for its Mandelbrot background and semantic HTML for portfolio content. Both layers are coordinated by declarative scenes in `scene-data.js`.

## Run locally

Serve the repository with any static file server, for example:

```sh
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

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

During panning, wheel zoom, and camera animation, rendering automatically drops to a 1× preview while retaining the same iteration budget as the settled frame. After 140 ms without input, a sharper 2× frame replaces it. This keeps the fractal boundary and grayscale stable during movement—the only temporary quality change is spatial resolution. At zooms above 100,000×, the renderer switches to error-compensated double-double arithmetic so coordinate detail is retained instead of being approximated by unstable perturbation textures.

The grayscale palette is based on absolute continuous escape time rather than the current iteration budget. Consequently, pixels that resolve in both the interactive and final pass keep the same shade instead of flickering when refinement begins. The visual suite includes a detailed one-trillion-times depth probe and checks its tonal range.

Renderer state is available for profiling in the browser console:

```js
window.fractalRenderer.getDiagnostics()
// { mode: "final", scale: 2, iterations: 687, precision: "direct", pixels: ... }
```

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
