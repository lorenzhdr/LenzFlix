// VIDEOTHEK LENZ · 2D-Kino im LENZ PALAST: Bedienleiste als DOM-Overlay (läuft über ctx.overlay.open, hängt in der Bühne).
// Alles am Player geht über die Bridge der Hülle (deps.cinema). Kein Jellyfin-DOM hier. CSS: themes/store/palast.css.
import { fmtTime, trackSpec, stepVolume, applyVolumeStep } from './controls.js';

export const IDLE_MS = 4000; // beim Spielen blendet sich die Leiste nach so langer Ruhe aus

function el(doc, tag, cls, text) {
  const e = doc.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * createBar({ bridge, getState, onStand, onFull, toast, doc, win }) → { el, update(st), show(), hide(), touch(), openTracks(kind), closeTracks(), dispose(), renders }
 * st (update): Bridge-Zustand (title, time, duration, phase, hasPrev, hasNext, volume, muted) plus { startPending, ended, canFull }.
 * Die Knöpfe nehmen keinen Fokus (Leertaste löst so keinen Klick aus); „Starten“ ruft togglePause synchron im Klick (Nutzergeste).
 */
export function createBar({ bridge, getState, onStand, onFull, toast, chat = null, doc = document, win = typeof window !== 'undefined' ? window : null } = {}) {
  const root = el(doc, 'div', 'lfx-palast-bar');
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', 'Kino');
  const panel = el(doc, 'div', 'lfx-palast-panel');
  const title = el(doc, 'div', 'lfx-palast-title');
  const msg = el(doc, 'div', 'lfx-palast-msg');
  msg.setAttribute('role', 'status');
  const prog = el(doc, 'div', 'lfx-palast-prog');
  const tNow = el(doc, 'span', 'lfx-palast-time');
  const seek = el(doc, 'input', 'lfx-palast-seek');
  seek.type = 'range'; seek.min = '0'; seek.max = '1000'; seek.value = '0'; seek.step = '1'; seek.tabIndex = -1;
  seek.setAttribute('aria-label', 'Position');
  const tDur = el(doc, 'span', 'lfx-palast-time');
  prog.append(tNow, seek, tDur);
  const row = el(doc, 'div', 'lfx-palast-row');
  const pop = el(doc, 'div', 'lfx-palast-pop');
  pop.hidden = true;
  // Chat-Zeile (Mehrspieler): erst per openChat() sichtbar, Enter sendet, Esc/Leerlauf schließt
  const chatRow = el(doc, 'div', 'lfx-palast-chat');
  chatRow.hidden = true;
  const chatIn = el(doc, 'input', 'lfx-palast-chatin');
  chatIn.type = 'text'; chatIn.maxLength = 200; chatIn.placeholder = 'Nachricht an alle im Saal …'; chatIn.setAttribute('aria-label', 'Chat-Nachricht');
  chatRow.appendChild(chatIn);
  panel.append(title, msg, prog, row, chatRow, pop);
  root.appendChild(panel);

  const btn = (label, cls, fn, parent = row) => {
    const b = el(doc, 'button', `lfx-palast-btn${cls ? ` ${cls}` : ''}`, label);
    b.type = 'button';
    b.tabIndex = -1;
    b.addEventListener('mousedown', (e) => e.preventDefault()); // nimmt keinen Fokus
    b.addEventListener('click', fn);
    parent.appendChild(b);
    return b;
  };
  const st = () => (getState && getState()) || {};
  let swallow = false; // der Tipp, der die ausgeblendete Leiste weckt, löst keinen (unsichtbaren) Knopf aus
  const act = (f) => () => { if (swallow) { swallow = false; return; } api.touch(); try { f(); } catch { /* egal */ } };

  const bPause = btn('Pause', 'is-main', act(() => bridge.togglePause()));
  const bBack = btn('−10 s', '', act(() => bridge.seekBy(-10)));
  const bFwd = btn('+30 s', '', act(() => bridge.seekBy(30)));
  const bPrev = btn('◀ Folge', '', act(() => bridge.prev()));
  const bNext = btn('Folge ▶', '', act(() => bridge.next()));
  const bMute = btn('Stumm', '', act(() => bridge.toggleMute()));
  const bDown = btn('Leiser', '', act(() => applyVolumeStep(stepVolume(st(), -1), bridge, toast)));
  const bUp = btn('Lauter', '', act(() => applyVolumeStep(stepVolume(st(), 1), bridge, toast)));
  const vol = el(doc, 'span', 'lfx-palast-vol');
  row.appendChild(vol);
  const bAudio = btn('Ton', '', act(() => api.openTracks('audio')));
  const bSub = btn('Untertitel', '', act(() => api.openTracks('subtitle')));
  const bFull = btn('Vollbild', '', act(() => { if (onFull) onFull(); }));
  btn('Aufstehen', 'is-stand', act(() => { if (onStand) onStand(); }));

  let lastKey = '';
  let renders = 0;
  let disposed = false;
  let hideT = 0;
  let lastPhase = '';
  let dragging = false;
  let popKind = null;
  let popToken = 0;
  let popRows = null;
  let popBusy = false;

  seek.addEventListener('input', () => { dragging = true; });
  seek.addEventListener('change', () => {
    dragging = false;
    api.touch();
    const d = st().duration;
    if (d > 0) bridge.seekTo((Number(seek.value) / 1000) * d);
  });

  const keyOf = (s) => [s.group, s.title,Math.floor(s.time || 0), Math.floor(s.duration || 0), s.phase, s.hasPrev, s.hasNext, Math.round((Number.isFinite(s.volume) ? s.volume : 1) * 100), s.muted, s.startPending, s.ended, s.canFull].join('~');

  function renderPop() {
    if (!popKind) { pop.hidden = true; return; }
    const spec = trackSpec(popKind, popRows, {
      busy: popBusy,
      onPick: (r) => pick(r),
      onBack: () => api.closeTracks(),
    });
    pop.textContent = '';
    pop.hidden = false;
    pop.appendChild(el(doc, 'div', 'lfx-palast-pop-title', spec.title));
    if (spec.text) pop.appendChild(el(doc, 'div', 'lfx-palast-pop-text', spec.text));
    if (spec.list) {
      const ul = el(doc, 'div', 'lfx-palast-pop-list');
      for (const r of spec.list.rows) {
        const b = el(doc, 'button', `lfx-palast-pop-row${r.selected ? ' is-on' : ''}`, r.label);
        b.type = 'button';
        b.tabIndex = -1;
        b.addEventListener('mousedown', (e) => e.preventDefault());
        b.addEventListener('click', r.onSelect);
        ul.appendChild(b);
      }
      pop.appendChild(ul);
    }
    const back = el(doc, 'button', 'lfx-palast-btn lfx-palast-pop-close', 'Schließen');
    back.type = 'button';
    back.tabIndex = -1;
    back.addEventListener('mousedown', (e) => e.preventDefault());
    back.addEventListener('click', () => api.closeTracks());
    pop.appendChild(back);
  }

  function pick(r) {
    if (popBusy || !popKind) return;
    const kind = popKind;
    const token = popToken;
    popBusy = true;
    api.touch();
    renderPop();
    Promise.resolve(bridge.selectTrack(kind, r.id)).then((ok) => {
      if (token !== popToken) return;
      popBusy = false;
      if (ok === false && toast) toast('Auswahl nicht möglich');
      api.closeTracks();
    }, () => { if (token === popToken) { popBusy = false; api.closeTracks(); } });
  }

  function idleHide() { if (!disposed && lastPhase === 'playing' && !popKind && chatRow.hidden) root.classList.add('is-idle'); }
  function armIdle() {
    clearTimeout(hideT);
    hideT = 0;
    if (lastPhase === 'playing' && !popKind && chatRow.hidden) hideT = setTimeout(idleHide, IDLE_MS);
  }
  const stopKey = (e) => e.stopPropagation(); // Spiel- und Jellyfin-Kürzel bleiben draußen
  chatIn.addEventListener('keyup', stopKey);
  chatIn.addEventListener('keypress', stopKey);
  chatIn.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.isComposing) return;
    if (e.key === 'Escape') { e.preventDefault(); api.closeChat(); return; }
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const text = chatIn.value.trim();
    if (!text) { api.closeChat(); return; }
    if (chat && chat.say(text)) { chatIn.value = ''; api.closeChat(); } else if (toast) toast('Senden gerade nicht möglich');
  });
  const onMove = () => { if (!disposed) api.touch(); };
  const onDown = () => { swallow = api.idle; onMove(); };
  const evs = [['mousemove', onMove], ['pointerdown', onDown], ['touchstart', onMove]];
  if (win) for (const [n, f] of evs) win.addEventListener(n, f, { passive: true, capture: true });

  const api = {
    el: root,
    get renders() { return renders; },
    get idle() { return root.classList.contains('is-idle'); },
    /** Nur bei Änderung neu schreiben. Rückgabe: true, wenn gezeichnet wurde. */
    update(s) {
      if (disposed) return false;
      const x = s || {};
      const phaseNow = x.phase || '';
      if (phaseNow !== lastPhase) {
        lastPhase = phaseNow;
        if (phaseNow === 'playing') api.touch(); else { root.classList.remove('is-idle'); armIdle(); }
      }
      const k = keyOf(x);
      if (k === lastKey) return false;
      lastKey = k;
      renders++;
      const dur = x.duration > 0 ? x.duration : 0;
      const t = dur ? Math.min(x.time || 0, dur) : (x.time || 0);
      title.textContent = String(x.title || 'Kino').slice(0, 70);
      tNow.textContent = fmtTime(t);
      tDur.textContent = fmtTime(dur);
      if (!dragging) seek.value = String(dur ? Math.round((t / dur) * 1000) : 0);
      seek.disabled = !dur;
      const playing = x.phase === 'playing';
      bPause.textContent = x.startPending ? 'Starten' : playing ? 'Pause' : 'Weiter';
      bPause.classList.toggle('is-attn', Boolean(x.startPending));
      bPrev.hidden = !x.hasPrev;
      bNext.hidden = !x.hasNext;
      msg.textContent = x.ended ? 'Film zu Ende' : x.startPending ? 'Zum Starten „Starten“ drücken' : String(x.group || '');
      msg.hidden = !msg.textContent;
      const pct = Math.round((Number.isFinite(x.volume) ? x.volume : 1) * 100);
      vol.textContent = x.muted ? 'stumm' : `${pct} %`;
      bMute.textContent = x.muted ? 'Ton an' : 'Stumm';
      bFull.hidden = x.canFull === false;
      for (const b of [bBack, bFwd, bPause, bAudio, bSub, bMute, bDown, bUp]) b.disabled = Boolean(x.ended) && b !== bAudio;
      return true;
    },
    show() { if (!disposed) { root.hidden = false; api.touch(); } },
    hide() { root.hidden = true; api.closeTracks(); api.closeChat(); },
    /** Bedienung/Bewegung: Leiste sichtbar, Ausblend-Zeit neu. */
    touch() {
      if (disposed) return;
      root.classList.remove('is-idle');
      armIdle();
    },
    openTracks(kind) {
      if (disposed) return;
      if (popKind === kind) { api.closeTracks(); return; }
      popKind = kind;
      popRows = null;
      popBusy = false;
      const token = ++popToken;
      clearTimeout(hideT);
      root.classList.remove('is-idle');
      renderPop();
      Promise.resolve(bridge.tracks(kind)).then((list) => {
        if (token !== popToken) return;
        popRows = Array.isArray(list) ? list : [];
        renderPop();
      }, () => { if (token === popToken) { popRows = []; renderPop(); } });
    },
    /** Chat-Zeile öffnen (Enter im Sessel). false = Chat aus/nicht verbunden: die Taste bleibt unverbraucht. */
    openChat() {
      if (disposed || !chat || !chat.enabled() || root.hidden) return false;
      if (!chatRow.hidden) return true;
      api.closeTracks();
      chatRow.hidden = false;
      chatIn.value = '';
      clearTimeout(hideT);
      root.classList.remove('is-idle');
      try { chatIn.focus({ preventScroll: true }); } catch { try { chatIn.focus(); } catch { /* egal */ } }
      return true;
    },
    closeChat() {
      if (chatRow.hidden) return;
      chatRow.hidden = true;
      try { chatIn.blur(); } catch { /* egal */ }
      armIdle();
    },
    closeTracks() {
      popToken++;
      popKind = null;
      popRows = null;
      popBusy = false;
      pop.hidden = true;
      pop.textContent = '';
      armIdle();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(hideT);
      popToken++;
      if (win) for (const [n, f] of evs) win.removeEventListener(n, f, true);
      if (root.parentNode) root.parentNode.removeChild(root);
    },
  };
  return api;
}
