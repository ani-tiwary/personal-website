# Isolated course edition

Run `npm run build`, then serve `dist/` with the existing hosting setup. The edition is available at `/terrible-version/` (directory hosts also resolve `/terrible-version`). Its five sections use the same hash navigation as the main portfolio.

The main page, shared assets, résumé PDF, and résumé source are unchanged. The only integration outside this folder is the call in `tools/build-site.mjs` that packages this edition. There are no links from the main site. This page declares `noindex, nofollow, noarchive`; it is unlisted, not password-protected.

`content.js`, `edition.js`, and `edition.css` contain the course-specific writing, media, contact form, and layout changes. `build.mjs` adapts copies of the original controller and preferences. Its generated files are ignored by Git and recreated by the normal build. Course preferences use separate local-storage keys. Root-relative assets and an explicit base URL support direct entry and trailing-slash variants.

## Feedback addressed

- Entry overlay removed; camera animations default to off, with the existing Display controls available.
- Home explains the portfolio's purpose, audience, background, and featured projects; social links now have visible labels. The requested comma is included.
- Home and About use the existing portrait. About expands technical interests, observations from project work, personal interests, and related links.
- Experience adds context, tools, dates, outcomes, reflections, and resource links. Scarlet Sync has a live application link; the fractal portfolio has source code and linked media. Organization links are labeled as context, rather than presented as public internal projects.
- Résumé is readable as HTML, with an objective, education, skills, dated experience, highlights, interests, and contact navigation. The HTML omits high school details and direct email/phone display. The original PDF remains available unchanged.
- The fifth page includes a silent renderer video with a visual description, a generated audio experiment with a listening guide, and an optional rotating gallery. Controls do not autoplay. Media stops when leaving the page. Related projects link directly to each sample.
- Feedback/contact controls prepare an email in the visitor's email application, or copy a message for use with LinkedIn. They do not pretend to submit to a backend.

Facts and metrics come from the existing website and résumé, with Parker Lab dates (January 2026–present) and the Instagram music blog (@ani_talks_music) supplied by Ani. The railway cost-reduction figure is explicitly described as a potential benefit, not a realized saving.

## Validation

`node terrible-version/check.mjs` after a build checks desktop and phone layouts, all five pages, direct links and reloads, a WebGL-unavailable fallback, video/audio playback, gallery and feedback controls, preference isolation, PDF links, and the original homepage. It uses the repository's existing headless-Chrome harness. Screenshots go to ignored `artifacts/course-check/`.

`node terrible-version/render-video.mjs` regenerates the 28-second annotated video from settled renderer frames. The camera stays centered on a boundary point throughout the zoom, and chapter holds provide time to read the explanations. The generator decodes the finished video and checks every second for visible color detail; its review contact sheet and measurements go to `artifacts/course-video/`.

To remove this edition later, delete this folder and remove its two-line build integration, then rebuild and deploy. No main-page changes need reverting.
