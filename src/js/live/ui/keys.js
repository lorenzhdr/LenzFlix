// LENZ LIVE · Tastatur → normalisierte Tastennamen (siehe docs/live.md „Tasten“).
// capture-Listener auf window, nur solange die App sichtbar ist (isActive). Ignoriert Eingabefelder, Theme-Picker, Popover.

const FKEYS = { F1: 'red', F2: 'green', F3: 'yellow', F4: 'blue' };

function isEditable(t) {
  if (!t || !t.tagName) return false;
  const tag = String(t.tagName).toLowerCase();
  return tag === 'input' || tag === 'textarea' || tag === 'select' || !!t.isContentEditable;
}

function pickerOpen(doc) {
  return !!doc.querySelector('.lfx-tp, .lfx-popover.is-open');
}

/** Name der Taste oder null. overlayOpen: Pfeile ↑/↓ bleiben dann up/down statt ch±. */
export function keyName(e, overlayOpen = false) {
  const k = e.key;
  if (typeof k === 'string' && k.length === 1 && k >= '0' && k <= '9') return k;
  if (FKEYS[k]) return FKEYS[k];
  switch (k) {
    case 'ArrowUp': return overlayOpen ? 'up' : 'ch+';
    case 'ArrowDown': return overlayOpen ? 'down' : 'ch-';
    case 'ArrowLeft': return 'left';
    case 'ArrowRight': return 'right';
    case 'PageUp': return 'ch+';
    case 'PageDown': return 'ch-';
    case '+': case '=': return 'vol+';
    case '-': case '_': return 'vol-';
    case 'Enter': return 'ok';
    case 'Escape': case 'Backspace': return 'back';
    case 'm': case 'M': return 'mute';
    case 'g': case 'G': return 'epg';
    case 'z': case 'Z': return 'guide';
    case 'i': case 'I': return 'info';
    case 't': case 'T': return 'txt';
    case 'f': case 'F': return 'fullscreen';
    default: return null;
  }
}

/**
 * @param {object} o { onKey(name), isActive(), isOverlayOpen?(), win? }
 */
export function createKeys({ onKey, isActive, isOverlayOpen = () => false, win = window }) {
  const doc = win.document;
  let attached = false;

  function handler(e) {
    if (!isActive()) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target;
    if (isEditable(t)) return;
    if ((t && t.closest && t.closest('.lfx-tp')) || pickerOpen(doc)) return;
    // Fokussierte Fernbedienungs-Taste: Enter/Leertaste löst nativ den Klick aus (sonst doppelt).
    if ((e.key === 'Enter' || e.key === ' ') && t && t.closest && t.closest('.lfx-live-remote')) return;
    if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); e.stopPropagation(); return; }
    const name = keyName(e, !!isOverlayOpen());
    if (!name) return;
    e.preventDefault();
    e.stopPropagation();
    onKey(name);
  }

  return {
    attach() { if (!attached) { win.addEventListener('keydown', handler, true); attached = true; } },
    detach() { if (attached) { win.removeEventListener('keydown', handler, true); attached = false; } },
    destroy() { if (attached) { win.removeEventListener('keydown', handler, true); attached = false; } },
    handler,
  };
}
