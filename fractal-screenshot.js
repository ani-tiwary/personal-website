(() => {
    const renderer = window.fractalRenderer;
    if (!renderer) return;
    const dialog = document.createElement('dialog');
    dialog.className = 'screenshot-dialog';
    dialog.setAttribute('aria-labelledby', 'screenshotTitle');
    dialog.innerHTML = `<h2 id="screenshotTitle">Fractal screenshot</h2>
        <p role="status">Preparing image…</p><img alt="Fractal screenshot preview" hidden>
        <div class="screenshot-actions"><button type="button" data-close>Close</button>
        <button type="button" data-save disabled>Save PNG</button></div>`;
    document.body.append(dialog);
    const status = dialog.querySelector('p'), preview = dialog.querySelector('img');
    const save = dialog.querySelector('[data-save]');
    let url = null, filename = '', busy = false;

    // Standard PNG tEXt chunks, including CRC32, preserve all coordinate digits.
    function textChunk(key, value) {
        const bytes = new TextEncoder().encode(`tEXt${key}\0${value}`);
        const chunk = new Uint8Array(bytes.length + 8);
        const view = new DataView(chunk.buffer);
        view.setUint32(0, bytes.length - 4);
        chunk.set(bytes, 4);
        let crc = 0xffffffff;
        for (const byte of bytes) {
            crc ^= byte;
            for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
        }
        view.setUint32(chunk.length - 4, (crc ^ 0xffffffff) >>> 0);
        return chunk;
    }
    async function capture() {
        if (busy || dialog.open) return;
        busy = true;
        dialog.showModal();
        status.textContent = 'Rendering high-detail screenshot…';
        save.disabled = true; preview.hidden = true;
        try {
            const { blob, metadata } = await renderer.capture();
            const png = new Uint8Array(await blob.arrayBuffer());
            const chunks = Object.entries({
                CenterX: metadata.preciseCenterX, CenterY: metadata.preciseCenterY,
                Zoom: String(metadata.zoom), Description: JSON.stringify(metadata)
            }).map(([key, value]) => textChunk(key, value));
            if (!dialog.open) return;
            url = URL.createObjectURL(new Blob([png.slice(0, -12), ...chunks, png.slice(-12)], { type: 'image/png' }));
            filename = `fractal-${metadata.created.replace(/[:.]/g, '-')}.png`;
            preview.src = url; preview.hidden = false;
            status.textContent = 'Coordinates and zoom are embedded in the PNG metadata.';
            save.disabled = false;
        } catch (error) { status.textContent = error.message; }
        finally { busy = false; }
    }
    dialog.querySelector('[data-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
        preview.removeAttribute('src');
        if (url) URL.revokeObjectURL(url);
        url = null;
    });
    save.addEventListener('click', () => {
        if (!url) return;
        const link = document.createElement('a');
        link.href = url; link.download = filename;
        document.body.append(link); link.click(); link.remove();
    });
    document.getElementById('screenshotButton').addEventListener('click', capture);
    window.addEventListener('keydown', event => {
        if (event.defaultPrevented || event.repeat || event.ctrlKey || event.metaKey || event.altKey
            || event.isComposing || event.target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
        if (event.key.toLowerCase() === 'o') { event.preventDefault(); capture(); }
    });
})();
