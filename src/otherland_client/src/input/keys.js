/** Set of currently pressed keys (lowercase). */
export const keys = new Set();

/**
 * Keyboard listeners. Pass escape/VR handlers from the composition root
 * to avoid a circular import with gameMenu.
 */
export function initKeys({ onEscape, onDebugVr } = {}) {
    document.addEventListener('keydown', event => {
        if (!event || !event.key || typeof event.key !== 'string') return;

        const key = event.key.toLowerCase();
        keys.add(key);

        if (key === 'escape' && onEscape) {
            onEscape();
        }

        if (key === 'v' && onDebugVr) {
            onDebugVr();
        }
    });

    document.addEventListener('keyup', event => {
        if (!event || !event.key || typeof event.key !== 'string') return;
        keys.delete(event.key.toLowerCase());
    });

    document.addEventListener('contextmenu', e => {
        e.preventDefault();
    }, false);
}
