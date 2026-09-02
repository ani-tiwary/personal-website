(function () {
    'use strict';

    const scenes = window.siteScenes || [];
    const renderer = window.fractalRenderer;
    const params = new URLSearchParams(window.location.search);
    const reduceMotion = params.get('motion') === 'off' || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const contentRoot = document.getElementById('sceneContent');
    const navRoot = document.getElementById('navBar');
    const authorPanel = document.getElementById('authorPanel');
    const crosshair = document.getElementById('authorCrosshair');
    const coordinates = document.getElementById('authorCoordinates');
    const cameraReadout = document.getElementById('cameraReadout');
    const progress = document.getElementById('sceneProgress');
    const number = document.getElementById('sceneNumber');
    const total = document.getElementById('sceneTotal');
    const themeToggle = document.getElementById('themeToggle');
    const socialIconPaths = {
        instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.6" r="1" class="social-icon-dot"/>',
        linkedin: '<path class="social-icon-fill" d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.44-2.13 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z"/>',
        github: '<path class="social-icon-fill" d="M12 .5A12 12 0 0 0 8.2 23.88c.6.11.82-.26.82-.58v-2.24c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23A11.5 11.5 0 0 1 12 6.28c1.02 0 2.04.14 3 .4 2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.82 1.1.82 2.22v3.3c0 .32.22.7.83.58A12 12 0 0 0 12 .5z"/>'
    };
    let activeScene = null;
    let authorMode = params.get('debug') === 'on';
    let easterEggTimer = 0;
    let easterEggStartTheme = null;
    let typedSequence = '';
    let resolveReady;

    const ready = new Promise(resolve => { resolveReady = resolve; });

    function findScene(id) {
        return scenes.find(scene => scene.id === id);
    }

    function setTheme(theme, persist = true) {
        const nextTheme = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.dataset.theme = nextTheme;
        const isDark = nextTheme === 'dark';
        themeToggle.setAttribute('aria-pressed', String(isDark));
        themeToggle.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} mode`);
        themeToggle.title = `${isDark ? 'Light' : 'Dark'} mode`;
        if (persist) {
            try { localStorage.setItem('theme', nextTheme); } catch (_) { /* Storage may be disabled. */ }
        }
    }

    function stopThemeEasterEgg(restoreTheme = true) {
        if (!easterEggTimer) return;
        clearInterval(easterEggTimer);
        easterEggTimer = 0;
        if (restoreTheme && easterEggStartTheme) setTheme(easterEggStartTheme, false);
        easterEggStartTheme = null;
        document.body.classList.remove('is-theme-looping');
    }

    function toggleThemeEasterEgg() {
        if (easterEggTimer) {
            stopThemeEasterEgg();
            return;
        }
        if (reduceMotion) return;

        easterEggStartTheme = document.documentElement.dataset.theme;
        document.body.classList.add('is-theme-looping');
        const flipTheme = () => {
            setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark', false);
        };
        flipTheme();
        // Keep the inversion playful without entering rapid-strobe territory.
        easterEggTimer = window.setInterval(flipTheme, 50);
    }

    function requestedScene() {
        const requested = window.location.hash.slice(1) || params.get('scene');
        return findScene(requested) || scenes[0];
    }

    function makeElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }

    function renderNavigation() {
        navRoot.replaceChildren();
        scenes.forEach(scene => {
            const button = makeElement('button', 'nav-button', scene.label);
            button.type = 'button';
            button.dataset.sceneLink = scene.id;
            button.setAttribute('aria-label', `Go to ${scene.label}`);
            navRoot.append(button);
        });
        total.textContent = String(scenes.length).padStart(2, '0');
    }

    function renderContent(scene) {
        const anchor = makeElement('div', 'scene-anchor');
        const panel = makeElement('article', 'scene-panel');
        panel.dataset.align = scene.content.align || 'left';
        panel.dataset.surface = String(Boolean(scene.content.surface));
        panel.dataset.scene = scene.id;

        panel.append(makeElement('p', 'scene-eyebrow', scene.content.eyebrow));
        panel.append(makeElement('h1', 'scene-title', scene.content.title));
        if (scene.content.body) panel.append(makeElement('p', 'scene-copy', scene.content.body));

        if (scene.content.links?.length) {
            const links = makeElement('div', 'scene-links');
            scene.content.links.forEach(link => {
                const anchor = makeElement('a', 'scene-link', link.label);
                if (link.scene) {
                    anchor.href = `#${link.scene}`;
                    anchor.dataset.sceneLink = link.scene;
                } else {
                    anchor.href = link.href;
                    if (/^https?:/.test(link.href)) {
                        anchor.target = '_blank';
                        anchor.rel = 'noreferrer';
                    }
                }
                links.append(anchor);
            });
            panel.append(links);
        }

        if (scene.content.socialLinks?.length) {
            const socialLinks = makeElement('div', 'scene-socials');
            socialLinks.setAttribute('aria-label', 'Social profiles');
            scene.content.socialLinks.forEach(link => {
                const socialLink = makeElement('a', 'social-link');
                socialLink.href = link.href;
                socialLink.target = '_blank';
                socialLink.rel = 'noopener noreferrer';
                socialLink.setAttribute('aria-label', link.label);
                socialLink.title = link.label;

                const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                icon.setAttribute('viewBox', '0 0 24 24');
                icon.setAttribute('aria-hidden', 'true');
                icon.innerHTML = socialIconPaths[link.icon] || '';
                socialLink.append(icon);
                socialLinks.append(socialLink);
            });
            panel.append(socialLinks);
        }

        anchor.append(panel);
        contentRoot.replaceChildren(anchor);
        requestAnimationFrame(() => panel.classList.add('is-visible'));
    }

    function updateSceneUI(scene) {
        const index = scenes.indexOf(scene);
        activeScene = scene;
        document.body.dataset.scene = scene.id;
        document.title = `${scene.label} — Ani`;
        renderContent(scene);
        positionContent(renderer.getState());
        number.textContent = String(index + 1).padStart(2, '0');
        progress.style.width = `${((index + 1) / scenes.length) * 100}%`;
        navRoot.querySelectorAll('[data-scene-link]').forEach(button => {
            if (button.dataset.sceneLink === scene.id) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
    }

    // Convert a responsive target-screen placement into a fractal coordinate, then
    // project that coordinate through the current camera. The DOM therefore behaves
    // like geometry in the WebGL world while remaining semantic and accessible.
    function positionContent(camera = renderer.getState()) {
        if (!activeScene) return;
        const anchor = contentRoot.querySelector('.scene-anchor');
        const panel = contentRoot.querySelector('.scene-panel');
        if (!anchor || !panel) return;

        const placementOptions = activeScene.content.placement || {};
        const placement = window.innerWidth <= 620
            ? (placementOptions.mobile || placementOptions.desktop)
            : (placementOptions.desktop || placementOptions.mobile);
        const target = placement || { x: 0.5, y: 0.5 };
        const aspect = window.innerWidth / window.innerHeight;
        const reference = activeScene.camera;

        const worldX = reference.centerX + (target.x - 0.5) * aspect * 3 / reference.zoom;
        const worldY = reference.centerY + (0.5 - target.y) * 3 / reference.zoom;
        const screenX = ((worldX - camera.centerX) * camera.zoom / (3 * aspect) + 0.5) * window.innerWidth;
        const screenY = (0.5 - (worldY - camera.centerY) * camera.zoom / 3) * window.innerHeight;
        const scale = camera.zoom / reference.zoom;

        anchor.style.left = `${screenX}px`;
        anchor.style.top = `${screenY}px`;

        // CSS transforms often scale a cached bitmap of the whole element. CSS zoom
        // participates in layout, so the browser rasterizes glyphs at their displayed
        // size and keeps the typography sharp as the fractal camera gets closer.
        const rasterScale = Math.min(32, Math.max(0.02, scale));
        panel.style.zoom = String(rasterScale);
        panel.style.visibility = scale >= 0.02 && scale <= 32 ? 'visible' : 'hidden';
        const linksAreUsable = scale > 0.2 && scale < 5;
        panel.querySelectorAll('a').forEach(link => {
            link.style.pointerEvents = linksAreUsable ? 'auto' : 'none';
        });
    }

    function afterPaint(callback) {
        requestAnimationFrame(() => requestAnimationFrame(callback));
    }

    function gotoScene(id, options = {}) {
        const scene = typeof id === 'string' ? findScene(id) : id;
        if (!scene) return Promise.reject(new Error(`Unknown scene: ${id}`));
        const animate = options.animate ?? !reduceMotion;
        const updateURL = options.updateURL ?? true;

        updateSceneUI(scene);
        if (updateURL && window.location.hash !== `#${scene.id}`) {
            history.pushState({ scene: scene.id }, '', `#${scene.id}`);
        }

        return new Promise(resolve => {
            const finish = () => afterPaint(() => {
                window.dispatchEvent(new CustomEvent('site:scene-rendered', { detail: { scene: scene.id } }));
                resolve(getState());
            });

            if (!animate) {
                renderer.setCamera(scene.camera);
                positionContent(renderer.getState());
                finish();
                return;
            }

            window.addEventListener('fractal:camera-settled', finish, { once: true });
            renderer.moveTo(scene.camera, options.duration || 1800);
        });
    }

    function getState() {
        return { scene: activeScene?.id || null, camera: renderer.getState(), authorMode };
    }

    function updateCameraUI(event) {
        const state = event?.detail || renderer.getState();
        positionContent(state);
        cameraReadout.textContent = `${state.centerX.toFixed(5)} / ${state.centerY.toFixed(5)} / ${state.zoom.toFixed(2)}×`;
        if (authorMode) {
            coordinates.textContent = JSON.stringify({
                centerX: state.centerX,
                centerY: state.centerY,
                zoom: state.zoom,
                cursorX: state.cursorX,
                cursorY: state.cursorY
            }, null, 2);
        }
    }

    function setAuthorMode(enabled) {
        authorMode = Boolean(enabled);
        authorPanel.hidden = !authorMode;
        crosshair.hidden = !authorMode;
        document.body.classList.toggle('is-authoring', authorMode);
        updateCameraUI();
        return authorMode;
    }

    function copySceneJSON() {
        const camera = renderer.getState();
        const snippet = JSON.stringify({
            id: 'new-scene',
            label: 'New scene',
            camera: { centerX: camera.centerX, centerY: camera.centerY, zoom: camera.zoom },
            content: { eyebrow: 'Section', title: 'New scene.', body: 'Add copy here.', align: 'left' }
        }, null, 4);
        navigator.clipboard.writeText(snippet).then(() => {
            const button = document.getElementById('copyPositionBtn');
            button.textContent = 'Copied';
            setTimeout(() => { button.textContent = 'Copy scene JSON'; }, 1000);
        }).catch(() => window.prompt('Copy this scene configuration:', snippet));
    }

    function adjacentScene(direction) {
        const index = scenes.indexOf(activeScene);
        return scenes[(index + direction + scenes.length) % scenes.length];
    }

    document.addEventListener('click', event => {
        const link = event.target.closest('[data-scene-link]');
        if (!link) return;
        event.preventDefault();
        gotoScene(link.dataset.sceneLink);
    });

    window.addEventListener('popstate', () => gotoScene(requestedScene(), { updateURL: false }));
    window.addEventListener('fractal:render', updateCameraUI);
    window.addEventListener('resize', () => positionContent());
    document.getElementById('copyPositionBtn').addEventListener('click', copySceneJSON);
    themeToggle.addEventListener('click', () => {
        stopThemeEasterEgg();
        setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
    window.addEventListener('keydown', event => {
        if (event.key === 'Escape') stopThemeEasterEgg();

        const target = event.target;
        const isTypingField = target instanceof HTMLElement
            && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
        if (!isTypingField && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
            typedSequence = `${typedSequence}${event.key.toLowerCase()}`.slice(-7);
            if (typedSequence === 'seizure') {
                typedSequence = '';
                toggleThemeEasterEgg();
            }
        }

        if (event.key.toLowerCase() === 'd') setAuthorMode(!authorMode);
        if (event.key === 'ArrowRight') gotoScene(adjacentScene(1));
        if (event.key === 'ArrowLeft') gotoScene(adjacentScene(-1));
        if (/^[1-9]$/.test(event.key) && scenes[Number(event.key) - 1]) gotoScene(scenes[Number(event.key) - 1]);
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopThemeEasterEgg();
    });

    window.site = {
        ready,
        scenes,
        gotoScene,
        getState,
        setCamera(camera) { renderer.setCamera(camera); return getState(); },
        setAuthorMode
    };

    renderNavigation();
    setTheme(document.documentElement.dataset.theme, false);
    setAuthorMode(authorMode);
    document.body.classList.toggle('is-motionless', reduceMotion);
    if (params.get('intro') === 'off') document.getElementById('blackOverlay').style.display = 'none';

    const initialScene = requestedScene();
    gotoScene(initialScene, { animate: false, updateURL: false }).then(async () => {
        try { await document.fonts.ready; } catch (_) { /* Font readiness is an enhancement. */ }
        afterPaint(() => {
            document.documentElement.dataset.ready = 'true';
            resolveReady(getState());
        });
    });
})();
