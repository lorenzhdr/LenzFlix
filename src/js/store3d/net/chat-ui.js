// VIDEOTHEK LENZ · Mehrspieler: Chat-Oberfläche und Chat-Teil des Moduls net (Teil-Fabrik createChatPart, eingetragen in net/parts.js).
// Chat-Fenster `.lfx-mp-chatlog` (Verlauf, pointer-events:none; bei offener Eingabe scrollbar), Eingabe-Overlay `.lfx-mp-chatin` (ctx.overlay.open:
// gibt den Pointer-Lock frei, Esc/Enter schließen, runtime.js holt den Lock danach zurück), Blasen über Fremdfiguren (net/tags.js createBubbles).
// Alle Texte nur per textContent. Nichts wird gespeichert. Enter/T verbraucht nur der Aktions-Handler 'chat' (store.js canAct → nur mode==='play'
// und nicht in VR), im Kinosessel bleibt Enter unberührt. Das DOM entsteht erst bei der ersten Nachricht bzw. beim ersten Öffnen.
//   createChatUi(ctx, { model, say(text) → { ok, why?, wait? }, enabled(), now? }) → { push(entry), refresh(), open() → bool, close(), isOpen(), tick(dt), clear(), dispose(), note(text) }
//   createChatPart(core) → Teil-Handle { welcome, stop, tick, dispose, say(text) → bool, open(), close(), isOpen(), isMuted(k), setMuted(k, on), mutedList(), enabled() }
//   Provider 'netchat' (für hud.js/panel.js): { open, close, isOpen, say, enabled, isMuted, setMuted, mutedList }
import { createChat, createLimiter, clean, bubbleMs, withMute, normMute, HEAR_M } from './chat.js';
import { createBubbles } from './tags.js';
import { build } from './proto.js';

const FADE_MS = 10000;
const LINES_DESK = 6;
const LINES_TOUCH = 3;
const NOTE_MS = 2500;
const TICK_S = 0.25;
const warn = (what, err) => { try { console.warn('[LenzFlix Store3D] mp chat', what, err && err.message ? err.message : ''); } catch { /* egal */ } };

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function createChatUi(ctx, o) {
  const model = o.model;
  const now = o.now || (() => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()));
  const host = () => (ctx.renderer && ctx.renderer.domElement && ctx.renderer.domElement.parentNode) || null;
  const xrOn = () => !!(ctx.xr && ctx.xr.presenting());
  const maxLines = ctx.isTouch ? LINES_TOUCH : LINES_DESK;

  let log = null;
  let inRoot = null;
  let input = null;
  let noteEl = null;
  let sig = '';
  let isOpen = false;
  let noteUntil = 0;
  let acc = TICK_S;
  let disposed = false;
  let dirty = true;

  function ensureLog() {
    const h = host();
    if (!h) return null;
    if (!log) {
      log = el('div', 'lfx-mp-chatlog' + (ctx.isTouch ? ' is-touch' : ' is-desk'));
      log.hidden = true;
      log.setAttribute('role', 'log');
      log.setAttribute('aria-live', 'polite');
      log.style.pointerEvents = 'none';
    }
    if (log.parentNode !== h) h.appendChild(log);
    return log;
  }

  function lineEl(e) {
    const row = el('div', 'lfx-mp-chatline' + (e.mine ? ' is-mine' : ''));
    row.appendChild(el('span', 'lfx-mp-chatname', e.name));
    row.appendChild(el('span', 'lfx-mp-chattext', e.text));
    return row;
  }

  function render() {
    dirty = false;
    const t = now();
    const allowed = !disposed && o.enabled() && !xrOn();
    let list = [];
    if (allowed) {
      list = isOpen ? model.visible() : model.visible(maxLines).filter((e) => t - e.t < FADE_MS);
    }
    const s = `${isOpen ? 'o' : 'c'}${allowed ? 1 : 0}:${list.map((e) => e.id).join(',')}`;
    if (s === sig) return;
    sig = s;
    if (!list.length) { if (log) { log.hidden = true; log.textContent = ''; } return; }
    const l = ensureLog();
    if (!l) return;
    l.textContent = '';
    for (const e of list) l.appendChild(lineEl(e));
    l.classList.toggle('is-open', isOpen);
    l.style.pointerEvents = isOpen ? 'auto' : 'none';
    l.hidden = false;
    if (isOpen) l.scrollTop = l.scrollHeight;
  }

  function buildInput() {
    inRoot = el('div', 'lfx-mp-chatin' + (ctx.isTouch ? ' is-touch' : ' is-desk'));
    inRoot.style.pointerEvents = 'none'; // nur die Zeile selbst nimmt Eingaben an
    const row = el('div', 'lfx-mp-chatrow');
    row.style.pointerEvents = 'auto';
    input = el('input', 'lfx-mp-chatinput');
    input.type = 'text';
    input.maxLength = 200;
    input.autocomplete = 'off';
    input.autocapitalize = 'sentences';
    input.spellcheck = false;
    input.setAttribute('enterkeyhint', 'send');
    input.setAttribute('aria-label', 'Chat-Nachricht');
    input.placeholder = 'Nachricht an alle in der Nähe …';
    const send = el('button', 'lfx-store-act lfx-mp-chatsend', 'Senden');
    send.type = 'button';
    const close = el('button', 'lfx-store-act lfx-mp-chatclose', 'Schließen');
    close.type = 'button';
    close.setAttribute('aria-label', 'Chat schließen');
    noteEl = el('div', 'lfx-mp-chatnote');
    noteEl.hidden = true;
    noteEl.setAttribute('role', 'status');
    row.append(input, send, close);
    inRoot.append(row, noteEl);

    const stop = (e) => e.stopPropagation();
    input.addEventListener('keyup', stop);
    input.addEventListener('keypress', stop);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation(); // Spiel- und Jellyfin-Tastenkürzel bleiben draußen
      if (e.isComposing) return;
      if (e.key === 'Escape') { e.preventDefault(); api.close(); } else if (e.key === 'Enter') { e.preventDefault(); submit(); }
    });
    send.addEventListener('click', (e) => { e.stopPropagation(); submit(); });
    close.addEventListener('click', (e) => { e.stopPropagation(); api.close(); });
  }

  function showNote(text) {
    if (!noteEl) return;
    noteEl.textContent = text;
    noteEl.hidden = !text;
    noteUntil = text ? now() + NOTE_MS : 0;
  }

  function submit() {
    if (!isOpen) return;
    const text = clean(input.value);
    if (!text) { api.close(); return; } // leer: Enter schließt nur
    const r = o.say(text);
    if (r && r.ok) { input.value = ''; api.close(); return; }
    if (r && r.why === 'rate') showNote('Zu schnell – bitte kurz warten.');
    else if (r && r.why === 'xr') api.close();
    else showNote('Senden gerade nicht möglich.');
  }

  function onOverlayClosed() {
    // vom Runtime-Overlay (Esc, Moduswechsel, VR) beendet
    isOpen = false;
    if (input) { try { input.blur(); } catch { /* egal */ } }
    showNote('');
    dirty = true;
  }

  const api = {
    /** Neuer Eintrag im Modell: Fenster neu aufbauen. */
    push() { dirty = true; },
    refresh() { dirty = true; },
    /** Eingabe öffnen (Desktop: Enter, Handy: Chat-Knopf). false = nicht möglich (aus, VR, Overlay schon offen, kein Overlay-Dienst). */
    open() {
      if (disposed || isOpen || !o.enabled() || xrOn()) return false;
      if (!ctx.overlay || typeof ctx.overlay.open !== 'function' || (ctx.overlay.isOpen && ctx.overlay.isOpen())) return false;
      if (!host()) return false;
      if (!inRoot) buildInput();
      showNote('');
      input.value = '';
      isOpen = true;
      ctx.overlay.open(inRoot, { onClose: onOverlayClosed });
      if (!isOpen) return false; // sofort wieder zu (z. B. VR-Rückfall)
      try { input.focus({ preventScroll: true }); } catch { try { input.focus(); } catch { /* egal */ } }
      dirty = true;
      render();
      return true;
    },
    close() {
      if (!isOpen) return;
      isOpen = false;
      try { if (ctx.overlay && ctx.overlay.isOpen && ctx.overlay.isOpen()) ctx.overlay.close(); } catch (err) { warn('close', err); }
      onOverlayClosed();
      render();
    },
    isOpen: () => isOpen,
    note: showNote,
    /** Pro Frame: Ausblenden alter Zeilen, Hinweis-Ablauf. */
    tick(dt) {
      if (disposed) return;
      acc += dt;
      if (noteUntil && now() >= noteUntil) showNote('');
      if (dirty || acc >= TICK_S) { acc = 0; render(); }
    },
    clear() {
      if (isOpen) api.close();
      model.clear();
      sig = '';
      if (log) { log.hidden = true; log.textContent = ''; }
    },
    dispose() {
      if (disposed) return;
      if (isOpen) api.close();
      disposed = true;
      for (const e of [log, inRoot]) if (e && e.parentNode) e.parentNode.removeChild(e);
      log = null; inRoot = null; input = null; noteEl = null;
    },
  };
  return api;
}

export function createChatPart(core) {
  const ctx = core.ctx;
  const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  let local = null; // Stummliste nur im Speicher, wenn die Hülle keinen Schreibweg bietet (core.setPref fehlt)
  const enabled = () => !!core.prefs().chat;
  const mutedList = () => normMute(local || core.prefs().mute);
  const limiter = createLimiter();
  const xrOn = () => !!(ctx.xr && ctx.xr.presenting());

  const model = createChat({
    now: nowMs,
    enabled,
    mute: mutedList,
    me: () => core.me(),
    lookup: (c) => {
      const p = core.peers.list().find((x) => x.c === c);
      return p ? { k: p.k, name: core.peers.name(c) } : null;
    },
  });
  const ui = createChatUi(ctx, { model, enabled, now: nowMs, say: (t) => api.sayResult(t) });
  const bubbles = createBubbles(ctx, { hear: HEAR_M });
  const offs = [];
  let wasEnabled = enabled();

  function onMsg(e) {
    const entry = model.receive(e);
    if (!entry) return;
    ui.push(entry);
    if (entry.mine) return; // eigene Figur trägt keine Blase (das Fenster zeigt die Nachricht)
    const c = entry.c;
    bubbles.say(c, () => { const p = core.peers.get(c); return p ? p.figure : null; }, entry.text, bubbleMs(entry.text));
  }

  const api = {
    /** Senden mit Begründung: { ok } | { ok:false, why:'off'|'xr'|'inactive'|'empty'|'rate' }. */
    sayResult(text) {
      if (!enabled()) return { ok: false, why: 'off' };
      if (xrOn()) return { ok: false, why: 'xr' };
      if (!core.active() || !core.cap('chat')) return { ok: false, why: 'inactive' };
      const t = clean(text);
      if (!t) return { ok: false, why: 'empty' };
      const wait = limiter.take(nowMs());
      if (wait) return { ok: false, why: 'rate', wait };
      return core.send(build.m(t)) ? { ok: true } : { ok: false, why: 'inactive' };
    },
    say: (text) => api.sayResult(text).ok,
    open: () => ui.open(),
    close: () => ui.close(),
    isOpen: () => ui.isOpen(),
    enabled,
    mutedList,
    isMuted: (k) => mutedList().includes(k),
    /** Pro k stummschalten (das eigene k nie); schreibt über core.setPref({ mute }) in die Hülle, sonst nur für die Sitzung. */
    setMuted(k, on) {
      const me = core.me();
      const next = withMute(mutedList(), k, !!on, me && me.k);
      if (typeof core.setPref === 'function') { local = null; core.setPref({ mute: next }); } else local = next;
      if (on) for (const p of core.peers.list()) if (p.k === k) bubbles.drop(p.c);
      ui.refresh();
      return next.includes(k);
    },
    welcome() { limiter.reset(); ui.clear(); bubbles.clear(); },
    stop() { ui.clear(); bubbles.clear(); limiter.reset(); },
    tick(dt) {
      const en = enabled();
      if (!en && wasEnabled) { ui.clear(); bubbles.clear(); }
      wasEnabled = en;
      ui.tick(dt);
      if (en) bubbles.update(dt);
    },
    dispose() {
      for (const off of offs) { try { off(); } catch { /* egal */ } }
      offs.length = 0;
      ui.dispose();
      bubbles.dispose();
    },
  };

  offs.push(core.on('m', onMsg));
  offs.push(core.on('er', (e) => {
    if (!e || e.y !== 'm') return;
    if (e.c === 'rate') ui.note('Zu schnell – bitte kurz warten.');
    else if (e.c === 'perm' || e.c === 'cap' || e.c === 'off') { try { core.toast('Chat gerade nicht möglich.'); } catch { /* egal */ } }
  }));
  if (ctx.input && typeof ctx.input.onAction === 'function') {
    offs.push(ctx.input.onAction('chat', () => {
      if (!enabled() || xrOn() || !core.active() || !core.cap('chat')) return false;
      return ui.open();
    }, { prio: 10 }));
  }
  if (typeof ctx.provide === 'function') {
    offs.push(ctx.provide('netchat', {
      open: api.open, close: api.close, isOpen: api.isOpen, say: api.say, enabled, isMuted: api.isMuted, setMuted: api.setMuted, mutedList,
    }));
  }
  return api;
}
