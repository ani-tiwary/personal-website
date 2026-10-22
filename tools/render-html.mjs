// Substitute plain text only: content cannot inject HTML or break attributes.
export function renderHTML(template, content) {
    const escapeHTML = text => text.replace(/[&<>"']/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[character]);
    return template.replace(/\{\{([\w.]+)\}\}/g, (_, path) => {
        const value = path.split('.').reduce((object, key) => object?.[key], content);
        if (typeof value !== 'string') throw new Error(`Missing website text: ${path}`);
        return escapeHTML(value);
    });
}
