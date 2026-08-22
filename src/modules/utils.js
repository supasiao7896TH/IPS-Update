        // [C-1] XSS helper
export function escHtml(str) {
            return String(str ?? '')
                .replace(/&/g, '&amp;').replace(/</g, '&lt;')
                .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
        }

        // [M-3] localStorage guard
export function storageAvailable() {
            try { const k='__t__'; localStorage.setItem(k,k); localStorage.removeItem(k); return true; }
            catch(e) { return false; }
        }
export const HAS_STORAGE = storageAvailable();
