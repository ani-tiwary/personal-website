// Shared motion, rendering, and interaction preferences for the controls and canvas.
(() => {
    const params = new URLSearchParams(location.search);
    const systemMotion = matchMedia('(prefers-reduced-motion: reduce)');
    const choices = { motion: ['auto', 'on', 'off'], quality: ['auto', 'low', 'high', 'native'], juliaPreview: ['off', 'on'] };
    const defaults = { motion: 'on', quality: 'auto', scrollSensitivity: 1, juliaPreview: 'off' };
    const values = {};
    for (const key of Object.keys(choices)) {
        let saved;
        try { saved = localStorage.getItem(`portfolio:${key}`); } catch (_) { /* Optional storage. */ }
        const value = params.get(key) || saved;
        values[key] = choices[key].includes(value) ? value : defaults[key];
    }
    function normalizeSensitivity(value) {
        if (value == null || String(value).trim() === '' || !Number.isFinite(Number(value))) return defaults.scrollSensitivity;
        return Math.round(Math.min(3, Math.max(0.25, Number(value))) * 20) / 20;
    }
    let savedSensitivity;
    try { savedSensitivity = localStorage.getItem('portfolio:scrollSensitivity'); } catch (_) { /* Optional storage. */ }
    values.scrollSensitivity = normalizeSensitivity(params.get('scrollSensitivity') ?? savedSensitivity);
    function getState() {
        return { ...values, reduceMotion: values.motion === 'off' || (values.motion === 'auto' && systemMotion.matches) };
    }
    function notify() {
        const state = getState();
        document.documentElement.dataset.motion = state.motion;
        document.body.classList.toggle('is-motionless', state.reduceMotion);
        window.dispatchEvent(new CustomEvent('site:preferences', { detail: state }));
    }
    window.sitePreferences = {
        getState,
        set(key, value) {
            if (key === 'scrollSensitivity') value = normalizeSensitivity(value);
            else if (!choices[key]?.includes(value)) return;
            values[key] = value;
            try { localStorage.setItem(`portfolio:${key}`, value); } catch (_) { /* Optional storage. */ }
            notify();
        }
    };
    systemMotion.addEventListener('change', notify);
    notify();
})();
