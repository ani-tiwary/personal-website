(() => {
    // Keep the original scene destinations, palettes, typography, and renderer.
    window.siteScenes.forEach(scene => {
        scene.content.align = 'left';
        scene.content.surface = true;
        scene.content.placement = { desktop: { x: 0.5, y: 0.52 }, mobile: { x: 0.5, y: 0.57 } };
    });
    const { label, ...content } = window.siteContent.pages.media;
    window.siteScenes.push({
        id: 'media', persistent: true, label,
        camera: { centerX: '-0.7435', centerY: '0.1314', zoom: 1200 },
        content: { ...content, align: 'left', surface: true,
            placement: { desktop: { x: 0.5, y: 0.52 }, mobile: { x: 0.5, y: 0.57 } } }
    });
    window.sceneCoordinates = window.siteScenes.map(({ id, camera }) => ({ name: id, ...camera }));

    const el = (tag, className, text) => {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text) node.textContent = text;
        return node;
    };
    function section(parent, id, title, text) {
        const node = el('section', 'course-section');
        if (id) { node.id = id; node.tabIndex = -1; }
        node.append(el('h2', '', title));
        if (text) node.append(el('p', '', text));
        parent.append(node);
        return node;
    }
    function feedback(body) {
        const node = section(body, 'media-feedback', 'Start a conversation', 'Have a question about a project, a response to the media, or feedback on the site? Tell me what caught your attention.');
        const form = el('form', 'feedback-form');
        form.innerHTML = `
            <label for="feedbackName">Your name (optional)</label>
            <input id="feedbackName" name="name" autocomplete="name" maxlength="100">
            <label for="feedbackEmail">Your email (optional)</label>
            <input id="feedbackEmail" name="email" type="email" autocomplete="email" maxlength="254">
            <label for="feedbackTopic">What would you like to discuss?</label>
            <select id="feedbackTopic" name="topic"><option>Website feedback</option><option>Project question</option><option>Media response</option><option>Collaboration or opportunity</option></select>
            <label for="feedbackMessage">Message</label>
            <textarea id="feedbackMessage" name="message" rows="5" required maxlength="3000" aria-describedby="feedbackHelp"></textarea>
            <p id="feedbackHelp">This form prepares an email in your email app. Review and send it there; nothing is submitted from this website. If you do not have an email app configured, copy your message and contact me on LinkedIn.</p>
            <div class="scene-links"><button type="submit" class="scene-link">Prepare email</button><button type="button" class="scene-link" id="copyFeedback">Copy message</button><a class="scene-link" href="https://www.linkedin.com/in/ani-tiwary/" target="_blank" rel="noopener noreferrer">Contact on LinkedIn</a></div>
            <p id="feedbackStatus" role="status"></p>`;
        const message = () => {
            const data = new FormData(form);
            return `${data.get('topic')}\n\n${data.get('message').trim()}\n\nFrom: ${data.get('name').trim() || 'A portfolio visitor'}${data.get('email') ? `\nReply to: ${data.get('email')}` : ''}`;
        };
        const status = form.querySelector('#feedbackStatus');
        form.addEventListener('submit', event => {
            event.preventDefault();
            if (!form.reportValidity()) return;
            const subject = new FormData(form).get('topic');
            location.href = `mailto:anitiwary87@gmail.com?subject=${encodeURIComponent(`Portfolio: ${subject}`)}&body=${encodeURIComponent(message())}`;
            status.textContent = 'Your email app was requested. Review and send the message there. If it did not open, use Copy message and contact me on LinkedIn.';
        });
        form.querySelector('#copyFeedback').addEventListener('click', async () => {
            if (!form.reportValidity()) return;
            try {
                await navigator.clipboard.writeText(message());
                status.textContent = 'Message copied. Paste it into your email app or a LinkedIn message to send it.';
            } catch (_) {
                const textarea = form.querySelector('textarea');
                textarea.focus(); textarea.select();
                status.textContent = 'Select and copy the message above, then paste it into your email app or LinkedIn.';
            }
        });
        node.append(form);
    }
    function media(body, links) {
        const videoSection = section(body, 'media-video', 'Project video · how a simple rule becomes a fractal', 'This 28-second guided demo compares three views of the Mandelbrot boundary, from an overview to 1,200× magnification. Each chapter uses a short zoom and a pause to connect the calculation, the colors, and the spiral detail. Cuts between chapters skip the less informative scales. Use the controls to pause, seek, or replay; there is no audio.');
        const video = el('video');
        video.controls = true; video.preload = 'metadata'; video.playsInline = true;
        video.poster = '/terrible-version/media/fractal-tour-poster.png';
        video.src = '/terrible-version/media/fractal-demo.webm?v=boundary-tour-2';
        video.setAttribute('aria-label', 'Guided Mandelbrot boundary tour with on-screen explanations');
        video.append(el('p', '', 'Your browser cannot play this video. The visual description below covers its content.'));
        videoSection.append(video);
        const description = el('details');
        description.append(el('summary', '', 'Video description'));
        description.append(el('p', '', 'Chapter 1 shows the whole set and explains the rule: start at z = 0 and repeatedly calculate z² + c. Dark points stay bounded within the iteration limit. Chapter 2 follows the boundary, where colors show how quickly nearby points escape and broad curves resolve into smaller branches. Chapter 3 reaches 1,200× magnification and holds on intricate spiral structures produced by the same rule. The closing text connects the WebGL graphics to this portfolio’s readable HTML content. A magnification counter tracks the journey. There is no speech or soundtrack.'));
        videoSection.append(description, links([{ label: 'Project details and source', scene: 'work', section: 'portfolio' }]));

        const audioSection = section(body, 'media-audio', 'Audio experiment · hearing iteration counts', 'This short sonification maps escape-time calculations to pitch. Each note samples a different point across a horizontal slice of the Mandelbrot plane. Points that take more iterations to escape produce higher notes; points that do not escape within the calculation limit are silent. The sound is a data interpretation, not a recording of a physical phenomenon.');
        const audio = el('audio');
        audio.controls = true; audio.preload = 'metadata';
        audio.src = '/terrible-version/media/fractal-sonification.wav';
        audio.setAttribute('aria-label', 'Mandelbrot iteration counts translated into musical tones');
        audioSection.append(audio, el('p', 'media-caption', 'Listening guide: a sequence of short tones changes pitch as the sample crosses the set. Quiet gaps represent points that remain bounded for 80 iterations. There is no speech.'));
        audioSection.append(links([{ label: 'How the renderer works', scene: 'work', section: 'portfolio' }]));

        const gallery = section(body, 'media-gallery', 'Image slideshow · one rule, many patterns', 'Three views rendered by this website show how scale changes what we notice. Move through them yourself or choose Play slideshow to rotate every four seconds.');
        const slides = [
            { src: 'fractal-1.png', alt: 'Full Mandelbrot set, with a dark central body and colorful bands around its boundary.', caption: '1 / 3 · Overview: the central body and its surrounding escape-time bands.' },
            { src: 'fractal-2.png', alt: 'Closer view of the Mandelbrot boundary with curved colored bands and smaller dark shapes.', caption: '2 / 3 · Boundary: smaller structures become visible as the view moves closer.' },
            { src: 'fractal-3.png', alt: 'Magnified Mandelbrot boundary with tightly layered branching patterns.', caption: '3 / 3 · Detail: repeated calculations reveal intricate layers at a smaller scale.' }
        ];
        const figure = el('figure');
        const image = el('img'); image.width = 960; image.height = 540; image.loading = 'lazy';
        const caption = el('figcaption', 'media-caption');
        figure.append(image, caption); gallery.append(figure);
        const controls = el('div', 'scene-links');
        let index = 0, timer;
        const show = () => { image.src = `/terrible-version/media/${slides[index].src}`; image.alt = slides[index].alt; caption.textContent = slides[index].caption; };
        const previous = el('button', 'scene-link', 'Previous image');
        const play = el('button', 'scene-link', 'Play slideshow');
        const next = el('button', 'scene-link', 'Next image');
        [previous, play, next].forEach(button => { button.type = 'button'; });
        play.setAttribute('aria-pressed', 'false');
        const pause = () => { clearInterval(timer); timer = null; play.textContent = 'Play slideshow'; play.setAttribute('aria-pressed', 'false'); caption.setAttribute('aria-live', 'polite'); };
        previous.addEventListener('click', () => { pause(); index = (index + slides.length - 1) % slides.length; show(); });
        next.addEventListener('click', () => { pause(); index = (index + 1) % slides.length; show(); });
        play.addEventListener('click', () => {
            if (timer) return pause();
            caption.setAttribute('aria-live', 'off');
            timer = setInterval(() => { index = (index + 1) % slides.length; show(); }, 4000);
            play.textContent = 'Pause slideshow'; play.setAttribute('aria-pressed', 'true');
        });
        document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
        window.addEventListener('site:scene-rendered', event => { if (event.detail.scene !== 'media') pause(); });
        controls.append(previous, play, next); gallery.append(controls); show();
        gallery.append(links([{ label: 'Back to the fractal project', scene: 'work', section: 'portfolio' }]));
        const credits = section(body, 'media-sources', 'Sources and media credits', 'The video and gallery use this portfolio’s own renderer; the audio is generated from the same escape-time idea. The portrait is from my existing site assets. For the mathematical background, see Eric W. Weisstein’s “Mandelbrot Set” in Wolfram MathWorld.');
        credits.append(links([{ label: 'Mandelbrot Set · Wolfram MathWorld', href: 'https://mathworld.wolfram.com/MandelbrotSet.html' }, { label: 'Portfolio source code', href: 'https://github.com/ani-tiwary/personal-website' }]));
        feedback(body);
    }
    window.renderCourseExtras = (scene, body, links) => {
        if (scene.id === 'home' || scene.id === 'about') {
            const image = el('img', 'course-portrait');
            image.src = '/media/ani-tiwary.jpg'; image.alt = 'Ani Tiwary';
            image.width = 160; image.height = 160;
            image.loading = scene.id === 'home' ? 'eager' : 'lazy';
            body.insertBefore(image, body.querySelector('.scene-copy'));
        }
        for (const item of scene.content.sections || []) {
            const node = section(body, null, item.title, item.text);
            if (item.links) node.append(links(item.links));
        }
        for (const item of scene.content.experience || []) {
            if (!item.reflection) continue;
            const details = body.querySelector(`#${scene.id}-${item.id} .experience-details`);
            const paragraph = el('p', 'experience-reflection', item.reflection);
            details.insertBefore(paragraph, details.querySelector('.scene-links'));
        }
        if (scene.id === 'resume') {
            const download = el('a', 'scene-link', 'Download résumé');
            download.href = '/media/resume.pdf'; download.download = 'Ani-Tiwary-Resume.pdf';
            body.lastElementChild.append(download);
        }
        if (scene.id === 'media') media(body, links);
        else body.append(links([{ label: 'Questions or feedback? Get in touch', scene: 'media', section: 'feedback' }]));
    };
})();
