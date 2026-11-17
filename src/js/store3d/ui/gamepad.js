// VIDEOTHEK LENZ · Touch-Schema „Spiel“ (game): schwebender Stick links (Laufen in alle Richtungen, Rennen am Rand),
// Knöpfe unten rechts (Springen, Benutzen, Schlagen bzw. Werfen, wenn etwas getragen wird). Umsehen übernimmt die rechte
// Hälfte über die Canvas-Handler von controls/touch.js. Eigene Pointer-Events: die linke Zone liegt als DOM-Overlay über dem Canvas,
// der Canvas sieht die linken Finger nie (Pinch und Look rechts bleiben unberührt). Ein kurzer Tipp in der linken Zone geht an onTap.

/** Totzone (Anteil des Radius) und Rennschwellen (Hysterese). */
export const GP_DEAD = 0.12;
export const GP_RUN_ON = 0.92;
export const GP_RUN_OFF = 0.8;
/** Tipp: höchstens so lange (ms) und so weit (px). */
const TAP_MS = 250;
const TAP_SLOP = 9;

/** Stickradius in px: 9 % der kleineren Fensterseite, mindestens 48. */
export function stickRadius(w, h) {
  return Math.max(48, 0.09 * Math.min(w, h));
}

/**
 * Stick-Verschiebung (dx, dy in px, dy > 0 = Daumen nach unten) → Eingabe. Linear (nicht quadratisch), damit Gehen fein dosierbar ist.
 * runLatch = bisheriger Renn-Zustand (Hysterese: an ab m >= 0,92, aus unter 0,8).
 * Rückgabe { fwd, strafe, scale (0..1 nach Totzone), run, m (0..1), kx, ky (Knopfversatz in px, auf R geklemmt) }.
 */
export function stickVector(dx, dy, R, runLatch = false) {
  const d = Math.hypot(dx, dy);
  const clampK = d > R ? R / d : 1;
  const kx = dx * clampK;
  const ky = dy * clampK;
  const m = Math.min(1, d / R);
  const run = m >= GP_RUN_ON ? true : m < GP_RUN_OFF ? false : !!runLatch;
  if (m <= GP_DEAD || d < 1e-6) return { fwd: 0, strafe: 0, scale: 0, run: m < GP_RUN_OFF ? false : run, m, kx, ky };
  return { fwd: -dy / d, strafe: dx / d, scale: Math.min(1, (m - GP_DEAD) / (1 - GP_DEAD)), run, m, kx, ky };
}

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * @param {HTMLElement} host
 * @param {object} cb { onJump(), onUse(), onHit(), onThrow(), onTap(x, y), now?() → ms }
 */
export function createGamepad(host, { onJump, onUse, onHit, onThrow, onTap, now } = {}) {
  const clock = () => (now ? now() : performance.now());
  const root = mk('div', 'lfx-store-gp');
  root.setAttribute('aria-hidden', 'true');
  const zone = mk('div', 'lfx-store-gp-zone');
  const base = mk('div', 'lfx-store-gp-base');
  const knob = mk('div', 'lfx-store-gp-knob');
  base.appendChild(knob);
  base.hidden = true;
  zone.appendChild(base);
  const btns = mk('div', 'lfx-store-gp-btns');
  const jump = mk('button', 'lfx-store-gp-jump', 'SPRINGEN');
  const use = mk('button', 'lfx-store-gp-use', 'BENUTZEN');
  const hit = mk('button', 'lfx-store-gp-hit', 'SCHLAGEN');
  const thr = mk('button', 'lfx-store-gp-throw', 'WERFEN');
  for (const b of [jump, use, hit, thr]) { b.type = 'button'; b.tabIndex = -1; }
  thr.hidden = true;
  btns.append(jump, use, hit, thr);
  root.append(zone, btns);
  host.appendChild(root);

  let stickId = null;
  let origin = null; // { x, y, t, moved }
  let latch = false;
  const state = { fwd: 0, strafe: 0, scale: 0, run: false };

  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };
  const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* egal */ } };

  function setKnob(kx, ky) {
    knob.style.transform = kx || ky ? `translate(${Math.round(kx)}px, ${Math.round(ky)}px)` : '';
  }
  function clearState() {
    state.fwd = 0; state.strafe = 0; state.scale = 0; state.run = false;
    latch = false;
  }
  function zoneDown(e) {
    stop(e);
    if (stickId !== null) return;
    stickId = e.pointerId;
    capture(zone, e.pointerId);
    origin = { x: e.clientX, y: e.clientY, t: clock(), moved: 0 };
    const r = host.getBoundingClientRect ? host.getBoundingClientRect() : { left: 0, top: 0 };
    base.style.transform = `translate(${Math.round(e.clientX - r.left)}px, ${Math.round(e.clientY - r.top)}px) translate(-50%, -50%)`;
    base.hidden = false;
    base.classList.add('is-on');
    setKnob(0, 0);
  }
  function zoneMove(e) {
    if (e.pointerId !== stickId || !origin) return;
    stop(e);
    const dx = e.clientX - origin.x;
    const dy = e.clientY - origin.y;
    origin.moved = Math.max(origin.moved, Math.hypot(dx, dy));
    const R = stickRadius(window.innerWidth || 800, window.innerHeight || 600);
    const v = stickVector(dx, dy, R, latch);
    latch = v.run;
    state.fwd = v.fwd; state.strafe = v.strafe; state.scale = v.scale; state.run = v.run;
    setKnob(v.kx, v.ky);
    base.classList.toggle('is-run', v.run);
  }
  function zoneUp(e, cancelled) {
    if (e.pointerId !== stickId) return;
    stop(e);
    const o = origin;
    release();
    if (!cancelled && o && o.moved <= TAP_SLOP && clock() - o.t <= TAP_MS && onTap) onTap(e.clientX, e.clientY);
  }
  function release() {
    stickId = null;
    origin = null;
    clearState();
    base.hidden = true;
    base.classList.remove('is-on', 'is-run');
    setKnob(0, 0);
  }

  const buttonHandlers = [];
  function wireButton(el, fn) {
    const down = (e) => { stop(e); el.classList.add('is-down'); if (fn) fn(); };
    const up = () => { el.classList.remove('is-down'); };
    buttonHandlers.push([el, 'pointerdown', down], [el, 'pointerup', up], [el, 'pointercancel', up], [el, 'lostpointercapture', up]);
  }
  wireButton(jump, () => onJump && onJump());
  wireButton(use, () => onUse && onUse());
  wireButton(hit, () => onHit && onHit());
  wireButton(thr, () => onThrow && onThrow());

  const noCtx = (e) => e.preventDefault();
  const noTouch = (e) => { if (e.cancelable) e.preventDefault(); };
  const L = [
    [zone, 'pointerdown', zoneDown], [zone, 'pointermove', zoneMove],
    [zone, 'pointerup', (e) => zoneUp(e, false)], [zone, 'pointercancel', (e) => zoneUp(e, true)], [zone, 'lostpointercapture', (e) => zoneUp(e, true)],
    [root, 'contextmenu', noCtx], ...buttonHandlers,
  ];
  for (const [el, t, fn] of L) el.addEventListener(t, fn);
  root.addEventListener('touchstart', noTouch, { passive: false });

  const api = {
    root,
    zone,
    /** Aktuelle Laufeingabe { fwd, strafe, scale, run } (für Player.update). */
    get input() { return state; },
    get stickActive() { return stickId !== null; },
    get carrying() { return !thr.hidden; },
    /** Gedrückte Finger loslassen (Moduswechsel, Ausblenden). */
    reset() {
      if (stickId !== null) release();
      for (const b of [jump, use, hit, thr]) b.classList.remove('is-down');
    },
    show(on) {
      if (!on) api.reset();
      root.hidden = !on;
    },
    /** Ziel im Fadenkreuz: Benutzen-Knopf hervorheben. */
    setAimed(on) { use.classList.toggle('is-aimed', !!on); },
    /** Getragene Hülle: „Werfen“ ersetzt „Schlagen“. */
    setCarrying(on) {
      thr.hidden = !on;
      hit.hidden = !!on;
      use.classList.toggle('is-carry', !!on);
    },
    destroy() {
      api.reset();
      for (const [el, t, fn] of L) el.removeEventListener(t, fn);
      root.removeEventListener('touchstart', noTouch, { passive: false });
      root.remove();
    },
  };
  return api;
}
