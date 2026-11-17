// VIDEOTHEK LENZ · 2D-Kino im LENZ PALAST: Tastenwächter. Solange die Bühne über dem Jellyfin-Player (#/video) liegt, würden
// dessen Kürzel (Leertaste, F, K, M, Pfeile, J/L, Ziffern, G/H, Home/End, < >) neben unseren auslösen. Der Wächter hängt im
// Capture am window (kommt vor allen document-Listenern an) und stoppt die Ereignisse; belegt sind nur die Sitztasten.
// Die Bewegungs- und Esc-Behandlung bleibt in controls/desktop.js (derselbe Listener-Typ auf window, läuft unabhängig mit).

const FN_KEY = /^F([1-9]|1[0-2])$/;

function typingTarget(t) {
  if (!t || !t.tagName) return false;
  const n = String(t.tagName).toUpperCase();
  return n === 'INPUT' || n === 'TEXTAREA' || n === 'SELECT' || Boolean(t.isContentEditable);
}

/** Ereignisse, die der Wächter nie anfasst: Strg/Alt/Meta-Kombinationen, F1–F12, Tab, Eingabefelder. */
export function passesGuard(e) {
  if (!e) return true;
  if (e.ctrlKey || e.altKey || e.metaKey) return true;
  if (FN_KEY.test(String(e.key || '')) || FN_KEY.test(String(e.code || ''))) return true;
  if (e.key === 'Tab' || e.code === 'Tab') return true;
  return typingTarget(e.target);
}

/**
 * createKeyGuard({ win, isActive(), isSeated(), handlers }) → { attach(), detach(), attached }
 * isActive: Wächter wirksam (Palast-Kino aktiv und nicht im Vollbild). isSeated: Sitztasten belegt.
 * handlers: { pause(), seekBy(delta), volume(dir), mute(), full() } (alle optional).
 */
export function createKeyGuard({ win = typeof window !== 'undefined' ? window : null, isActive, isSeated, handlers = {} } = {}) {
  let attached = false;
  const call = (name, ...a) => { const f = handlers[name]; if (typeof f === 'function') { try { return f(...a); } catch (err) { try { console.warn('[LenzFlix Store3D] keyguard', err); } catch { /* egal */ } } } return undefined; };

  function seatedKey(e) {
    switch (e.code) {
      case 'Space': case 'KeyK': if (!e.repeat) call('pause'); return true;
      case 'KeyJ': case 'ArrowLeft': if (!e.repeat) call('seekBy', -10); return true;
      case 'KeyL': case 'ArrowRight': if (!e.repeat) call('seekBy', 30); return true;
      case 'ArrowUp': call('volume', 1); return true;
      case 'ArrowDown': call('volume', -1); return true;
      case 'KeyM': if (!e.repeat) call('mute'); return true;
      case 'KeyF': if (!e.repeat) call('full'); return true;
      case 'Enter': return !e.repeat && call('chat') === true; // Chat-Zeile der Leiste; nur verbraucht, wenn sie aufgeht
      default: return false;
    }
  }

  function onKey(e) {
    if (!isActive || !isActive() || passesGuard(e)) return;
    e.stopPropagation();
    if (e.type === 'keydown') {
      if (isSeated && isSeated() && seatedKey(e)) e.preventDefault();
    } else if (e.type === 'keyup' && e.code === 'Space') {
      e.preventDefault(); // Firefox löst fokussierte Knöpfe erst beim Loslassen aus
    }
  }

  return {
    get attached() { return attached; },
    attach() {
      if (attached || !win) return;
      attached = true;
      win.addEventListener('keydown', onKey, true);
      win.addEventListener('keyup', onKey, true);
      win.addEventListener('keypress', onKey, true);
    },
    detach() {
      if (!attached) return;
      attached = false;
      win.removeEventListener('keydown', onKey, true);
      win.removeEventListener('keyup', onKey, true);
      win.removeEventListener('keypress', onKey, true);
    },
  };
}
