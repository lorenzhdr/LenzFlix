// VIDEOTHEK LENZ · Mehrspieler (lfx-mp.1, Welle b): Emote-Rad und Teil „emotes“ des Moduls net (Fabrik createEmotes, siehe net/parts.js).
// Desktop: T (Aktion 'emote', nur im Laufmodus, nur bei aktivem Mehrspieler mit Fähigkeit `emote`) öffnet das Rad als Overlay
// (ctx.overlay.open gibt den Pointer-Lock frei, schließen holt ihn zurück). Auswahl: Maus, Pfeiltasten + Enter, Ziffern 1..8 (nur solange
// das Rad offen ist; ein aktiver Kino-Tastenwächter schluckt sie vorher, dann bleibt Maus/Pfeile), T/Esc schließen.
// Handy: der Knopf in der Dock-Zeile (net/hud.js) ruft part.open() bzw. den Provider auf; Tippen wählt, Tippen daneben/„Schließen“ schließt.
// Im Sitzen (Kino) und in VR wird die Aktion nie verbraucht. Eigene Figur: kein Emote sichtbar (Ego-Sicht), nur ein kurzer Hinweis („Du winkst“).
// Alle Texte per textContent.
//   createEmoteUi({ ctx, onPick(emote) → bool /* true = Rad schließen */ }) → { open() → bool, close(), isOpen(), dispose() }
//   createEmotes(core) → { open(), emote(x) → bool, stop(), dispose(), cooldown }   x = Code 1..8, id oder Beschriftung
// 1.18.0: Das Rad gibt es auch OHNE Mehrspieler (createLocalEmotes, vom Modul net aus gestartet): lokal an der eigenen Figur (selfview.playAnim) und als Hook
//   für NPC-Reaktionen. Der Mehrspieler-Teil meldet jedes gesendete Emote ebenfalls über core.localEmote(em) (Animation + Hook), die Taste T geht zuerst an ihn
//   (prio 10), sonst an den lokalen Zweig (prio 0).
//   createLocalEmotes(ctx) → { open() → bool, emote(x) → bool, notify(em), usable() → bool, onPlayerEmote(fn) → off, isOpen(), stop(), dispose() }   fn({ name, code, anim })
import { EMOTES, findEmote, createCooldown } from './emotes.js';
import { build } from './proto.js';

const warn = (what, err) => { try { console.warn('[LenzFlix Store3D] mp emotes', what, err && err.message ? err.message : ''); } catch { /* egal */ } };
const TOAST_MS = 1700;

export function createEmoteUi({ ctx, onPick }) {
  let el = null;
  let buttons = [];
  let closing = false;

  const xrOn = () => !!(ctx.xr && ctx.xr.presenting && ctx.xr.presenting());

  function cleanup() {
    el = null;
    buttons = [];
  }

  function focusAt(i) {
    const n = buttons.length;
    if (!n) return;
    const b = buttons[((i % n) + n) % n];
    try { b.focus({ preventScroll: true }); } catch { /* egal */ }
  }

  function pick(emote) {
    let done = true;
    try { done = onPick ? onPick(emote) !== false : true; } catch (err) { warn('onPick', err); }
    if (done) api.close();
  }

  function onKey(e) {
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const idx = buttons.indexOf(document.activeElement);
    if (e.code === 'KeyT') { e.preventDefault(); e.stopPropagation(); api.close(); return; }
    if (/^(Digit|Numpad)[1-8]$/.test(e.code)) {
      e.preventDefault(); e.stopPropagation();
      if (!e.repeat) pick(EMOTES[Number(e.code.slice(-1)) - 1]);
      return;
    }
    if (e.code === 'ArrowRight' || e.code === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); focusAt(idx + 1); return; }
    if (e.code === 'ArrowLeft' || e.code === 'ArrowUp') { e.preventDefault(); e.stopPropagation(); focusAt(idx < 0 ? 0 : idx - 1); }
    // Enter/Leertaste lösen den fokussierten Knopf von selbst aus (click); Esc behandelt controls/desktop.js
  }

  function build8() {
    const root = document.createElement('div');
    root.className = 'lfx-mp-emotes' + (ctx.isTouch ? ' is-touch' : ' is-desk');
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-label', 'Emotes');
    const ring = document.createElement('div');
    ring.className = 'lfx-mp-emotes-ring';
    EMOTES.forEach((em, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'lfx-mp-emote';
      b.dataset.emote = em.id;
      const a = (i / EMOTES.length) * Math.PI * 2;
      b.style.left = (50 + 37 * Math.sin(a)).toFixed(2) + '%';
      b.style.top = (50 - 37 * Math.cos(a)).toFixed(2) + '%';
      const label = document.createElement('span');
      label.className = 'lfx-mp-emote-label';
      label.textContent = em.label;
      b.appendChild(label);
      if (!ctx.isTouch) {
        const key = document.createElement('span');
        key.className = 'lfx-mp-emote-key';
        key.textContent = em.key;
        b.appendChild(key);
      }
      b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); pick(em); });
      ring.appendChild(b);
      buttons.push(b);
    });
    const hub = document.createElement('button');
    hub.type = 'button';
    hub.className = 'lfx-mp-emotes-hub';
    hub.textContent = ctx.isTouch ? 'Schließen' : 'T / Esc';
    hub.setAttribute('aria-label', 'Emote-Auswahl schließen');
    hub.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); api.close(); });
    ring.appendChild(hub);
    root.appendChild(ring);
    // Tippen/Klicken neben das Rad schließt (nur direkt auf den Hintergrund)
    root.addEventListener('click', (e) => { if (e.target === root) api.close(); });
    root.addEventListener('keydown', onKey);
    return root;
  }

  const api = {
    open() {
      if (el || xrOn() || !ctx.overlay || typeof ctx.overlay.open !== 'function') return false;
      el = build8();
      try { ctx.overlay.open(el, { onClose: () => { cleanup(); } }); } catch (err) { warn('overlay', err); cleanup(); return false; }
      if (!el) return false; // Overlay hat sofort wieder geschlossen (z. B. VR)
      focusAt(0);
      return true;
    },
    close() {
      if (!el || closing) return;
      closing = true;
      try { if (ctx.overlay && ctx.overlay.isOpen && ctx.overlay.isOpen()) ctx.overlay.close(); } catch (err) { warn('close', err); }
      if (el && el.parentNode) el.parentNode.removeChild(el);
      cleanup();
      closing = false;
    },
    isOpen: () => !!el,
    dispose() { api.close(); },
  };
  return api;
}

/**
 * Lokaler Zweig (ohne Mehrspieler): T/Knopf öffnet das Rad, die Wahl spielt die Animation an der eigenen Figur und meldet das Emote an die Hörer
 * (onPlayerEmote). Nie in VR und nur im Laufmodus (ctx.playing).
 */
export function createLocalEmotes(ctx) {
  const cd = createCooldown();
  const hooks = new Set();
  let disposed = false;
  const xrOn = () => !!(ctx.xr && ctx.xr.presenting && ctx.xr.presenting());
  const usable = () => !disposed && !xrOn() && !!ctx.overlay && (typeof ctx.playing !== 'function' || !!ctx.playing());
  function toast(text) { try { ctx.xr.toast(text, TOAST_MS); } catch { /* egal */ } }

  /** Emote ist ausgelöst (lokal oder gesendet): Animation an der eigenen Figur, dann die Hörer. */
  function notify(em) {
    if (disposed || !em) return;
    try { const sv = ctx.use && ctx.use('selfview'); if (sv && typeof sv.playAnim === 'function' && em.anim) sv.playAnim(em.anim); } catch (err) { warn('selfview', err); }
    for (const fn of [...hooks]) { try { fn({ name: em.id, code: em.code, anim: em.anim }); } catch (err) { warn('Hörer', err); } }
  }
  function emote(x) {
    const em = findEmote(x);
    if (!em || !usable()) return false;
    if (!cd.ready()) { toast('Einen Moment …'); return false; }
    cd.mark();
    toast(em.verb);
    notify(em);
    return true;
  }
  const ui = createEmoteUi({ ctx, onPick: (em) => { emote(em.code); return true; } });
  let off = null;
  try {
    if (ctx.input && typeof ctx.input.onAction === 'function') off = ctx.input.onAction('emote', () => (usable() ? ui.open() : false), { prio: 0 });
  } catch (err) { warn('Aktion', err); }
  return {
    open: () => (usable() ? ui.open() : false),
    emote,
    notify,
    usable,
    isOpen: ui.isOpen,
    onPlayerEmote(fn) {
      if (typeof fn !== 'function') return () => {};
      hooks.add(fn);
      return () => hooks.delete(fn);
    },
    stop() { ui.close(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (off) { try { off(); } catch { /* egal */ } off = null; }
      hooks.clear();
      ui.dispose();
    },
  };
}

/** Teil „emotes“: Aktion T, Senden mit Cooldown, Rückmeldung. core siehe net/parts.js. */
export function createEmotes(core) {
  const ctx = core.ctx;
  const cd = createCooldown();
  let disposed = false;

  const xrOn = () => !!(ctx.xr && ctx.xr.presenting && ctx.xr.presenting());
  const usable = () => !disposed && core.active() && core.cap('emote') && core.prefs().on !== false && !xrOn();
  function toast(text) {
    try { ctx.xr.toast(text, TOAST_MS); } catch { try { core.toast(text); } catch { /* egal */ } }
  }

  /** Emote senden (Code, id oder Beschriftung). false = nicht möglich (aus, VR, Cooldown, ungültig). */
  function emote(x) {
    const em = findEmote(x);
    if (!em || !usable()) return false;
    if (!cd.ready()) { toast('Einen Moment …'); return false; }
    if (!core.send(build.e(em.code))) return false;
    cd.mark();
    toast(em.verb);
    if (typeof core.localEmote === 'function') { try { core.localEmote(em); } catch (err) { warn('localEmote', err); } } // eigene Figur + NPC-Hook (1.18.0)
    return true;
  }

  const ui = createEmoteUi({ ctx, onPick: (em) => { emote(em.code); return true; } });

  let off = null;
  try {
    if (ctx.input && typeof ctx.input.onAction === 'function') {
      off = ctx.input.onAction('emote', () => { if (!usable()) return false; return ui.open(); }, { prio: 10 });
    }
  } catch (err) { warn('Aktion', err); }

  return {
    open: () => (usable() ? ui.open() : false),
    emote,
    cooldown: cd,
    isOpen: ui.isOpen,
    stop() { ui.close(); }, // Verbindung weg: Rad zu
    dispose() {
      if (disposed) return;
      disposed = true;
      if (off) { try { off(); } catch { /* egal */ } off = null; }
      ui.dispose();
    },
  };
}
