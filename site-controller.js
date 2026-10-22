(function () {
    'use strict';

    const copy = window.siteContent;
    const text = (template, values = {}) => template.replace(/\{(\w+)\}/g,
        (token, key) => Object.hasOwn(values, key) ? String(values[key]) : token);
    const scenes = window.siteScenes || [];
    // The portfolio must remain usable when a browser cannot start WebGL.
    const renderer = window.fractalRenderer || createStaticRenderer();
    // Refresh starts a new visit at Home; ordinary deep links still open their section.
    if (performance.getEntriesByType('navigation')[0]?.type === 'reload') {
        const homeURL = new URL(window.location.href);
        homeURL.searchParams.delete('scene');
        homeURL.hash = 'home';
        history.replaceState({ scene: 'home' }, '', homeURL);
    }
    const params = new URLSearchParams(window.location.search);
    let reduceMotion = window.sitePreferences.getState().reduceMotion;
    const contentRoot = document.getElementById('sceneContent');
    const navRoot = document.getElementById('navBar');
    const authorPanel = document.getElementById('authorPanel');
    const crosshair = document.getElementById('authorCrosshair');
    const coordinates = document.getElementById('authorCoordinates');
    const cameraReadout = document.getElementById('cameraReadout');
    const zoomOutMessage = document.getElementById('zoomOutMessage');
    const themeToggle = document.getElementById('themeToggle');
    const invertToggle = document.getElementById('invertToggle');
    const colourSettings = document.getElementById('colourSettings');
    const colourMenu = document.getElementById('colourMenu');
    const colourChoices = [...colourMenu.querySelectorAll('input[name="colourScheme"]')];
    const interactionSettings = document.getElementById('interactionSettings');
    const settingsToggle = document.getElementById('settingsToggle');
    const settingsMenu = document.getElementById('settingsMenu');
    const scrollSensitivity = document.getElementById('scrollSensitivity');
    const sensitivityFormatter = new Intl.NumberFormat(copy.meta.locale, { maximumFractionDigits: 2 });
    const socialIconPaths = {
        instagram: '<rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.4" cy="6.6" r="1" class="social-icon-dot"/>',
        linkedin: '<path class="social-icon-fill" d="M20.45 20.45h-3.56v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.44-2.13 2.94v5.67H9.35V9h3.42v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM7.12 20.45H3.56V9h3.56v11.45z"/>',
        github: '<path class="social-icon-fill" d="M12 .5A12 12 0 0 0 8.2 23.88c.6.11.82-.26.82-.58v-2.24c-3.34.73-4.04-1.42-4.04-1.42-.55-1.39-1.34-1.76-1.34-1.76-1.09-.75.08-.73.08-.73 1.21.09 1.85 1.24 1.85 1.24 1.07 1.84 2.81 1.31 3.5 1 .11-.78.42-1.31.76-1.61-2.66-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.13-.3-.54-1.52.12-3.18 0 0 1.01-.32 3.3 1.23A11.5 11.5 0 0 1 12 6.28c1.02 0 2.04.14 3 .4 2.29-1.55 3.3-1.23 3.3-1.23.66 1.66.25 2.88.12 3.18.77.84 1.24 1.91 1.24 3.22 0 4.61-2.8 5.62-5.48 5.92.43.37.82 1.1.82 2.22v3.3c0 .32.22.7.83.58A12 12 0 0 0 12 .5z"/>'
    };
    const experienceIconPaths = {
        code: '<rect x="3" y="4" width="18" height="16" rx="3"/><path d="m9 9-3 3 3 3m6-6 3 3-3 3"/>',
        chart: '<path d="M4 3v17h17M8 16v-4m5 4V9m5 7V6M7 8l5-4 5 1 4-3"/>',
        train: '<rect x="5" y="3" width="14" height="15" rx="4"/><path d="M5 10h14M12 3v7m-4 8-3 3m11-3 3 3M8 21h8"/><circle cx="9" cy="14" r=".7"/><circle cx="15" cy="14" r=".7"/>',
        calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 5 3 3 5-5"/>',
        microscope: '<path d="m10 3 4 2-4 8-4-2 4-8Zm-2 9-1 2m6-6a6 6 0 0 1 0 12H6m-2 1h16M4 16h7"/>',
        network: '<circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2"/><circle cx="19" cy="5" r="2"/><circle cx="5" cy="19" r="2"/><circle cx="19" cy="19" r="2"/><path d="m7 7 3 3m4 0 3-3M7 17l3-3m4 0 3 3"/>'
    };
    let activeScene = null;
    let cancelNavigation = null;
    let authorMode = params.get('debug') === 'on';
    let easterEggTimer = 0;
    let easterEggStartTheme = null;
    let typedSequence = '';
    let resolveReady;

    const ready = new Promise(resolve => { resolveReady = resolve; });

    function createStaticRenderer() {
        let camera = { ...scenes[0].camera };
        document.body.classList.add('is-static');
        function getState() {
            return { ...camera, centerX: Number(camera.centerX), centerY: Number(camera.centerY),
                preciseCenterX: String(camera.centerX), preciseCenterY: String(camera.centerY) };
        }
        function setCamera(next) {
            camera = { ...next };
            window.dispatchEvent(new CustomEvent('fractal:render', { detail: getState() }));
            window.dispatchEvent(new CustomEvent('fractal:camera-settled', { detail: getState() }));
        }
        return { getState, setCamera, moveTo: setCamera };
    }

    function findScene(id) {
        return scenes.find(scene => scene.id === id);
    }

    function setTheme(theme, persist = true) {
        const nextTheme = colourChoices.some(choice => choice.value === theme) ? theme : 'rainbow';
        document.documentElement.dataset.theme = nextTheme;
        window.dispatchEvent(new CustomEvent('site:theme', { detail: { theme: nextTheme } }));
        colourChoices.forEach(choice => { choice.checked = choice.value === nextTheme; });
        const name = copy.theme.options[nextTheme].label;
        themeToggle.setAttribute('aria-label', text(copy.theme.currentLabel, { name }));
        themeToggle.title = text(copy.theme.currentTitle, { name });
        if (persist) {
            try { localStorage.setItem('theme', nextTheme); } catch (_) { /* Storage may be disabled. */ }
        }
    }

    function setInverted(inverted) {
        document.documentElement.dataset.inverted = String(inverted);
        invertToggle.setAttribute('aria-pressed', String(inverted));
    }

    function toggleInversion() {
        setInverted(document.documentElement.dataset.inverted !== 'true');
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
        const themes = colourChoices.map(choice => choice.value);
        let index = themes.indexOf(easterEggStartTheme);
        const nextTheme = () => {
            index = (index + 1) % themes.length;
            setTheme(themes[index], false);
        };
        nextTheme();
        easterEggTimer = window.setInterval(nextTheme, 50);
    }

    function requestedScene() {
        const requested = window.location.hash.slice(1).split('/')[0] || params.get('scene');
        return findScene(requested) || scenes[0];
    }

    function requestedSection() {
        return window.location.hash.slice(1).split('/')[1];
    }

    function makeElement(tag, className, text) {
        const element = document.createElement(tag);
        if (className) element.className = className;
        if (text) element.textContent = text;
        return element;
    }

    function makeSceneTitle(title, accent) {
        const heading = makeElement('h1', 'scene-title');
        const accentStart = accent ? title.toLowerCase().indexOf(accent.toLowerCase()) : -1;
        if (accentStart < 0) {
            heading.textContent = title;
            return heading;
        }

        heading.append(document.createTextNode(title.slice(0, accentStart)));
        const name = makeElement('span', 'title-name', title.slice(accentStart, accentStart + accent.length));
        name.setAttribute('aria-label', accent);
        heading.append(name, document.createTextNode(title.slice(accentStart + accent.length)));
        return heading;
    }

    function renderNavigation() {
        navRoot.replaceChildren();
        scenes.forEach(scene => {
            const button = makeElement('button', 'nav-button', scene.label);
            button.type = 'button';
            button.dataset.sceneLink = scene.id;
            button.setAttribute('aria-label', text(copy.navigation.goTo, { scene: scene.label }));
            navRoot.append(button);
        });
    }

    function renderSceneContent(scene) {
        const anchor = makeElement('div', 'scene-anchor');
        anchor.dataset.sceneAnchor = scene.id;
        const panel = makeElement('article', 'scene-panel');
        panel.dataset.align = scene.content.align || 'left';
        panel.dataset.surface = String(Boolean(scene.content.surface));
        panel.dataset.scene = scene.id;
        const body = makeElement('div', 'scene-scroll');
        body.tabIndex = 0;
        body.setAttribute('role', 'region');
        body.setAttribute('aria-label', text(copy.navigation.contentRegion, { scene: scene.label }));
        panel.append(body);

        if (scene.content.eyebrow) body.append(makeElement('p', 'scene-eyebrow', scene.content.eyebrow));
        body.append(makeSceneTitle(scene.content.title, scene.content.titleAccent));
        if (scene.content.body) body.append(makeElement('p', 'scene-copy', scene.content.body));
        if (scene.content.experience?.length) {
            const grid = makeElement('div', 'experience-grid');
            scene.content.experience.forEach(item => {
                const card = makeElement('section', 'experience-card');
                card.id = `${scene.id}-${item.id}`;
                card.tabIndex = -1;
                const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
                icon.setAttribute('viewBox', '0 0 24 24');
                icon.setAttribute('class', 'experience-icon');
                icon.setAttribute('aria-hidden', 'true');
                icon.setAttribute('focusable', 'false');
                icon.innerHTML = experienceIconPaths[item.icon] || experienceIconPaths.code;
                const details = makeElement('div', 'experience-details');
                details.append(makeElement('h2', 'experience-title', item.title));
                details.append(makeElement('p', 'experience-role', item.role));
                details.append(makeElement('p', 'experience-description', item.description));
                card.append(icon, details);
                if (item.links?.length) details.append(makeSceneLinks(item.links));
                grid.append(card);
            });
            body.append(grid);
        }
        if (scene.content.resume) {
            const { src, title } = scene.content.resume;
            const actions = makeElement('div', 'scene-links resume-actions');
            const open = makeElement('a', 'scene-link', copy.shared.openResume);
            open.href = src;
            open.target = '_blank';
            open.rel = 'noopener';
            const download = makeElement('a', 'scene-link', copy.shared.downloadResume);
            download.href = src;
            download.download = copy.shared.resumeFilename;
            actions.append(open, download);
            const frame = makeElement('iframe', 'resume-frame');
            // Load on first visit, avoiding an offscreen PDF viewer at startup.
            frame.dataset.src = `${src}#view=FitH&toolbar=0`;
            frame.title = title;
            body.append(actions, frame);
        }

        if (scene.content.placeholders?.length) {
            const placeholders = makeElement('div', 'content-placeholders');
            scene.content.placeholders.forEach(item => {
                const section = makeElement('section', 'content-placeholder');
                section.id = `${scene.id}-${item.id}`;
                section.tabIndex = -1;
                section.append(makeElement('p', 'placeholder-status', item.medium || copy.shared.placeholderStatus));
                section.append(makeElement('h2', 'placeholder-title', item.title));
                section.append(makeElement('p', 'placeholder-copy', item.description));
                if (item.prompts?.length) {
                    const prompts = makeElement('ul', 'placeholder-prompts');
                    item.prompts.forEach(prompt => prompts.append(makeElement('li', '', prompt)));
                    section.append(prompts);
                }
                if (item.links?.length) section.append(makeSceneLinks(item.links));
                placeholders.append(section);
            });
            body.append(placeholders);
        }

        if (scene.content.links?.length) {
            body.append(makeSceneLinks(scene.content.links));
        }

        if (scene.content.socialLinks?.length) {
            const socialLinks = makeElement('div', 'scene-socials');
            socialLinks.setAttribute('aria-label', copy.shared.socialLabel);
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
            body.append(socialLinks);
        }

        anchor.append(panel);
        contentRoot.append(anchor);
        requestAnimationFrame(() => panel.classList.add('is-visible'));
    }

    function makeSceneLinks(items) {
        const links = makeElement('div', 'scene-links');
        items.forEach(link => {
            const anchor = makeElement('a', 'scene-link', link.label);
            if (link.scene) {
                anchor.href = `#${link.scene}${link.section ? `/${link.section}` : ''}`;
                anchor.dataset.sceneLink = link.scene;
                if (link.section) anchor.dataset.sectionLink = link.section;
            } else {
                anchor.href = link.href;
                if (/^https?:/.test(link.href)) {
                    anchor.target = '_blank';
                    anchor.rel = 'noreferrer';
                }
            }
            links.append(anchor);
        });
        return links;
    }

    // Core scenes are all kept in the fractal world at once. This lets their
    // panels appear naturally as the camera travels or zooms between them,
    // instead of replacing Home with the newly selected scene.
    function renderPersistentContent() {
        contentRoot.replaceChildren();
        scenes.filter(scene => scene.persistent).forEach(renderSceneContent);
    }

    function ensureActiveSceneContent(scene) {
        const selector = `[data-scene-anchor="${scene.id}"]`;
        if (contentRoot.querySelector(selector)) return;

        // Future, non-persistent scenes only need to exist while selected.
        contentRoot.querySelectorAll('.scene-anchor').forEach(anchor => {
            const anchoredScene = findScene(anchor.dataset.sceneAnchor);
            if (!anchoredScene?.persistent) anchor.remove();
        });
        renderSceneContent(scene);
    }

    function updateSceneUI(scene) {
        activeScene = scene;
        document.body.dataset.scene = scene.id;
        document.title = text(copy.navigation.pageTitle, { scene: scene.label, name: copy.meta.name });
        ensureActiveSceneContent(scene);
        const resumeFrame = contentRoot.querySelector(`[data-scene="${scene.id}"] .resume-frame`);
        if (resumeFrame && !resumeFrame.src) resumeFrame.src = resumeFrame.dataset.src;
        positionContent(renderer.getState());
        navRoot.querySelectorAll('[data-scene-link]').forEach(button => {
            if (button.dataset.sceneLink === scene.id) button.setAttribute('aria-current', 'page');
            else button.removeAttribute('aria-current');
        });
    }

    // Convert a responsive target-screen placement into a fractal coordinate, then
    // project that coordinate through the current camera. The DOM therefore behaves
    // like geometry in the WebGL world while remaining semantic and accessible.
    function positionContent(camera = renderer.getState()) {
        const aspect = window.innerWidth / window.innerHeight;
        const moving = window.fractalRenderer?.getDiagnostics().mode === 'interactive';
        contentRoot.querySelectorAll('.scene-anchor').forEach(anchor => {
            const scene = findScene(anchor.dataset.sceneAnchor);
            const panel = anchor.querySelector('.scene-panel');
            if (!scene || !panel) return;

            const placementOptions = scene.content.placement || {};
            const placement = window.innerWidth <= 620
                ? (placementOptions.mobile || placementOptions.desktop)
                : (placementOptions.desktop || placementOptions.mobile);
            const target = placement || { x: 0.5, y: 0.5 };
            const reference = scene.camera;

            // Subtract precise centers before converting to screen space. Adding a tiny
            // panel offset to a Number coordinate loses its placement at deep zoom.
            const math = window.FractalMath;
            const dx = math.number(math.parse(reference.centerX) - math.parse(camera.preciseCenterX ?? camera.centerX));
            const dy = math.number(math.parse(reference.centerY) - math.parse(camera.preciseCenterY ?? camera.centerY));
            // Keep pages at readable size when a device caps the available zoom.
            const maxZoom = renderer.getMaxZoom?.() ?? Infinity;
            const referenceZoom = Math.min(reference.zoom, maxZoom);
            const scale = camera.zoom / referenceZoom;
            const screenX = (dx * camera.zoom / (3 * aspect) + (target.x - 0.5) * scale + 0.5) * window.innerWidth;
            const screenY = (-dy * camera.zoom / 3 + (target.y - 0.5) * scale + 0.5) * window.innerHeight;

            const halfWidth = Math.min(624, innerWidth - 40) * scale / 2;
            const halfHeight = innerHeight * scale / 2;
            const visible = scale >= 0.02 && scale <= 32
                // Capped destinations can coincide; only show the selected page there.
                && (reference.zoom <= maxZoom || scene === activeScene)
                && screenX + halfWidth > -100 && screenX - halfWidth < innerWidth + 100
                && screenY + halfHeight > -100 && screenY - halfHeight < innerHeight + 100;
            panel.style.visibility = visible ? 'visible' : 'hidden';
            if (!visible) { panel.inert = true; return; }

            anchor.style.left = `${screenX}px`;
            anchor.style.top = `${screenY}px`;

            // Composite cached text while moving; rasterize crisp glyphs once settled.
            panel.style.zoom = moving ? '1' : String(scale);
            panel.style.transform = moving ? `translate(-50%, -50%) scale(${scale})` : '';
            const linksAreUsable = scale > 0.2 && scale < 5;
            panel.inert = !linksAreUsable || scene !== activeScene;
            panel.querySelector('.scene-scroll').style.pointerEvents = panel.inert ? 'none' : 'auto';
            panel.querySelectorAll('a').forEach(link => {
                link.style.pointerEvents = linksAreUsable ? 'auto' : 'none';
            });
        });
    }

    function afterPaint(callback) {
        requestAnimationFrame(() => requestAnimationFrame(callback));
    }

    function gotoScene(id, options = {}) {
        const scene = typeof id === 'string' ? findScene(id) : id;
        if (!scene) return Promise.reject(new Error(`Unknown scene: ${id}`));
        cancelNavigation?.();
        const animate = options.animate ?? !reduceMotion;
        const updateURL = options.updateURL ?? true;
        // Let the renderer plan from the actual camera, including interrupted trips.
        const duration = options.duration;

        updateSceneUI(scene);
        const hash = `#${scene.id}${options.section ? `/${options.section}` : ''}`;
        if (updateURL && window.location.hash !== hash) {
            history.pushState({ scene: scene.id }, '', hash);
        }

        return new Promise(resolve => {
            let cancelled = false;
            const finish = () => afterPaint(() => {
                if (cancelled) return;
                cancelNavigation = null;
                const panel = contentRoot.querySelector(`[data-scene="${scene.id}"]`);
                const section = options.section && document.getElementById(`${scene.id}-${options.section}`);
                if (section && panel.contains(section)) {
                    const scroll = panel.querySelector('.scene-scroll');
                    scroll.scrollTop = section.offsetTop - scroll.offsetTop;
                    section.focus({ preventScroll: true });
                } else {
                    panel.querySelector('.scene-scroll').scrollTop = 0;
                }
                window.dispatchEvent(new CustomEvent('site:scene-rendered', { detail: { scene: scene.id } }));
                resolve(getState());
            });
            // A newer route owns arrival effects. Settle the old request without
            // announcing its destination or moving focus after the new arrival.
            cancelNavigation = () => {
                cancelled = true;
                window.removeEventListener('fractal:camera-settled', finish);
                resolve(getState());
            };

            if (!animate) {
                renderer.setCamera(scene.camera);
                positionContent(renderer.getState());
                finish();
                return;
            }

            window.addEventListener('fractal:camera-settled', finish, { once: true });
            renderer.moveTo(scene.camera, duration);
        });
    }

    function getState() {
        return { scene: activeScene?.id || null, camera: renderer.getState(), authorMode };
    }

    function updateCameraUI(event) {
        const state = event?.detail || renderer.getState();
        zoomOutMessage.hidden = state.zoom > (renderer.getMinZoom?.() ?? 0) * 1.12;
        positionContent(state);
        const magnification = state.zoom < 10000 ? state.zoom.toFixed(2)
            : new Intl.NumberFormat(copy.meta.locale, { notation: 'compact', maximumFractionDigits: 1 }).format(state.zoom);
        cameraReadout.textContent = text(copy.footer.cameraReadout, { x: state.centerX.toFixed(5), y: state.centerY.toFixed(5), zoom: magnification });
        if (authorMode) {
            coordinates.textContent = JSON.stringify({
                centerX: state.preciseCenterX,
                centerY: state.preciseCenterY,
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
            label: copy.author.newScene.label,
            camera: { centerX: camera.preciseCenterX, centerY: camera.preciseCenterY, zoom: camera.zoom },
            content: { eyebrow: copy.author.newScene.eyebrow, title: copy.author.newScene.title, body: copy.author.newScene.body, align: 'left' }
        }, null, 4);
        navigator.clipboard.writeText(snippet).then(() => {
            const button = document.getElementById('copyPositionBtn');
            button.textContent = copy.author.copied;
            setTimeout(() => { button.textContent = copy.author.copy; }, 1000);
        }).catch(() => window.prompt(copy.author.copyPrompt, snippet));
    }

    function adjacentScene(direction) {
        const index = scenes.indexOf(activeScene);
        return scenes[(index + direction + scenes.length) % scenes.length];
    }

    document.addEventListener('click', event => {
        const link = event.target.closest('[data-scene-link]');
        if (!link) return;
        event.preventDefault();
        gotoScene(link.dataset.sceneLink, { section: link.dataset.sectionLink });
    });

    window.addEventListener('popstate', () => gotoScene(requestedScene(), { updateURL: false, section: requestedSection() }));
    window.addEventListener('fractal:render', updateCameraUI);
    window.addEventListener('resize', () => positionContent());
    document.getElementById('copyPositionBtn').addEventListener('click', copySceneJSON);
    function closeColourMenu(restoreFocus = false) {
        colourMenu.hidden = true;
        themeToggle.setAttribute('aria-expanded', 'false');
        if (restoreFocus) themeToggle.focus();
    }
    function closeSettingsMenu(restoreFocus = false) {
        settingsMenu.hidden = true;
        settingsToggle.setAttribute('aria-expanded', 'false');
        if (restoreFocus) settingsToggle.focus();
    }
    settingsToggle.addEventListener('click', () => {
        const opening = settingsMenu.hidden;
        settingsMenu.hidden = !opening;
        settingsToggle.setAttribute('aria-expanded', String(opening));
        if (opening) {
            closeColourMenu();
            document.getElementById('displaySettings').open = false;
            scrollSensitivity.focus();
        }
    });
    interactionSettings.addEventListener('focusout', event => {
        if (event.relatedTarget && !interactionSettings.contains(event.relatedTarget)) closeSettingsMenu();
    });
    invertToggle.addEventListener('click', toggleInversion);
    themeToggle.addEventListener('click', () => {
        stopThemeEasterEgg();
        const opening = colourMenu.hidden;
        colourMenu.hidden = !opening;
        themeToggle.setAttribute('aria-expanded', String(opening));
        if (opening) {
            document.getElementById('displaySettings').open = false;
            closeSettingsMenu();
            colourChoices.find(choice => choice.checked)?.focus();
        }
    });
    colourMenu.addEventListener('change', event => {
        if (colourChoices.includes(event.target)) {
            stopThemeEasterEgg(false);
            setTheme(event.target.value);
        }
    });
    document.addEventListener('click', event => {
        if (!colourSettings.contains(event.target)) closeColourMenu();
        if (!interactionSettings.contains(event.target)) closeSettingsMenu();
    });
    colourSettings.addEventListener('focusout', event => {
        if (event.relatedTarget && !colourSettings.contains(event.relatedTarget)) closeColourMenu();
    });
    window.addEventListener('keydown', event => {
        if (event.key === 'Escape') {
            if (!settingsMenu.hidden) closeSettingsMenu(true);
            if (!colourMenu.hidden) closeColourMenu(true);
            stopThemeEasterEgg();
            const settings = document.getElementById('displaySettings');
            if (settings.open) { settings.open = false; settings.querySelector('summary').focus(); }
        }

        const target = event.target;
        const isTypingField = target instanceof HTMLElement
            && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName));
        // Palette radios retain arrow-key behaviour but allow the theme shortcuts.
        const isTextEntry = isTypingField && !(target instanceof HTMLInputElement && /^(radio|checkbox)$/.test(target.type));
        if (!isTextEntry && !event.isComposing && !event.repeat && !event.ctrlKey && !event.metaKey && !event.altKey && event.key.length === 1) {
            const key = event.key.toLowerCase();
            if (key === 'i') toggleInversion();
            typedSequence = `${typedSequence}${key}`.slice(-3);
            if (typedSequence === 'lol') {
                typedSequence = '';
                toggleThemeEasterEgg();
            }
        }

        if (isTypingField || event.ctrlKey || event.metaKey || event.altKey) return;
        if (event.key.toLowerCase() === 'd') setAuthorMode(!authorMode);
        if (event.key === 'ArrowRight') gotoScene(adjacentScene(1));
        if (event.key === 'ArrowLeft') gotoScene(adjacentScene(-1));
        if (/^[1-9]$/.test(event.key) && scenes[Number(event.key) - 1]) gotoScene(scenes[Number(event.key) - 1]);
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopThemeEasterEgg();
    });

    const overlay = document.getElementById('blackOverlay');
    function enter(event) {
        if (event.type === 'keydown' && event.key !== 'Enter' && event.key !== ' ') return;
        if (overlay.classList.contains('is-dismissed')) return;
        event.preventDefault();
        overlay.classList.add('is-dismissed');
        overlay.inert = true;
        renderer.reveal?.();
    }
    overlay.addEventListener('click', enter);
    overlay.addEventListener('keydown', enter);

    const motionPreference = document.getElementById('motionPreference');
    const qualityPreference = document.getElementById('qualityPreference');
    function updatePreferences() {
        const state = window.sitePreferences.getState();
        reduceMotion = state.reduceMotion;
        if (reduceMotion) stopThemeEasterEgg();
        motionPreference.value = state.motion;
        qualityPreference.value = state.quality;
        qualityPreference.disabled = !window.fractalRenderer;
        scrollSensitivity.value = state.scrollSensitivity;
        const sensitivityLabel = text(copy.settings.sensitivityValue, { value: sensitivityFormatter.format(state.scrollSensitivity) });
        document.getElementById('sensitivityValue').textContent = sensitivityLabel;
        scrollSensitivity.setAttribute('aria-valuetext', sensitivityLabel);
        scrollSensitivity.style.setProperty('--sensitivity-position', `${(state.scrollSensitivity - 0.25) / 2.75 * 100}%`);
        document.getElementById('displayStatus').textContent = !window.fractalRenderer
            ? copy.display.status.unavailable
            : state.reduceMotion
                ? state.motion === 'auto' ? copy.display.status.deviceOff : copy.display.status.off
                : state.quality === 'auto' ? copy.display.status.adaptive : copy.display.status.on;
    }
    motionPreference.addEventListener('change', () => window.sitePreferences.set('motion', motionPreference.value));
    qualityPreference.addEventListener('change', () => window.sitePreferences.set('quality', qualityPreference.value));
    scrollSensitivity.addEventListener('input', () => window.sitePreferences.set('scrollSensitivity', scrollSensitivity.value));
    window.addEventListener('site:preferences', updatePreferences);
    document.addEventListener('click', event => {
        const settings = document.getElementById('displaySettings');
        if (!settings.contains(event.target)) settings.open = false;
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
    renderPersistentContent();
    setTheme(document.documentElement.dataset.theme, false);
    setInverted(false);
    setAuthorMode(authorMode);
    updatePreferences();
    if (params.get('intro') === 'off') document.getElementById('blackOverlay').style.display = 'none';

    const initialScene = requestedScene();
    gotoScene(initialScene, { animate: false, updateURL: false, section: requestedSection() }).then(async () => {
        try { await document.fonts.ready; } catch (_) { /* Font readiness is an enhancement. */ }
        afterPaint(() => {
            document.documentElement.dataset.ready = 'true';
            resolveReady(getState());
        });
    });
})();
