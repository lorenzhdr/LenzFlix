// VIDEOTHEK LENZ · Bildschirm-Steuerung für Touch (Modus „Joystick“): Gehen-Knopf unten links (halten = vorwärts),
// Joystick unten rechts (Auslenkung = Blick drehen). Eigene Pointer-Events, damit Canvas-Gesten (Tippen, Wischen, Pinch)
// unabhängig davon weiterlaufen. Laufen und Umsehen gehen gleichzeitig mit zwei Daumen.

/** Totzone der Joystick-Auslenkung (0..1). */
export const STICK_DEAD = 0.12;

/** Rohauslenkung (−1..1 je Achse, Betrag ≤ 1) → Totzone + quadratische Kurve für feines Zielen. */
export function shapeStick(x, y) {
  const m = Math.hypot(x, y);
  if (m <= STICK_DEAD) return { x: 0, y: 0 };
  const k = Math.min(1, (m - STICK_DEAD) / (1 - STICK_DEAD));
  const s = (k * k) / m;
  return { x: x * s, y: y * s };
}

function mk(tag, cls, text) {
  const e = document.createElement(tag);
  e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/**
 * @param {HTMLElement} host
 * @param {object} cb { onWalk(on), onLook(x, y) } – x/y geformt (−1..1), y > 0 = Daumen nach unten.
 */
export function createJoypad(host, { onWalk, onLook } = {}) {
  const root = mk('div', 'lfx-store-pad');
  root.setAttribute('aria-hidden', 'true');
  const walk = mk('div', 'lfx-store-pad-walk', 'GEHEN');
  const stick = mk('div', 'lfx-store-pad-stick');
  const knob = mk('div', 'lfx-store-pad-knob');
  stick.appendChild(knob);
  root.append(walk, stick);
  host.appendChild(root);

  let walkId = null;
  let stickId = null;
  let center = null; // { x, y, r }

  const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* egal */ } };
  const stop = (e) => { e.preventDefault(); e.stopPropagation(); };

  function setWalk(on) {
    walk.classList.toggle('is-on', on);
    if (onWalk) onWalk(on);
  }
  function walkDown(e) {
    stop(e);
    if (walkId !== null) return;
    walkId = e.pointerId;
    capture(walk, e.pointerId);
    try { if (navigator.vibrate) navigator.vibrate(8); } catch { /* egal */ }
    setWalk(true);
  }
  function walkUp(e) {
    if (e.pointerId !== walkId) return;
    stop(e);
    walkId = null;
    setWalk(false);
  }

  function setKnob(dx, dy) {
    knob.style.transform = dx || dy ? `translate(${Math.round(dx)}px, ${Math.round(dy)}px)` : '';
  }
  function stickMove(e) {
    if (e.pointerId !== stickId || !center) return;
    stop(e);
    let dx = e.clientX - center.x;
    let dy = e.clientY - center.y;
    const m = Math.hypot(dx, dy);
    if (m > center.r) { dx *= center.r / m; dy *= center.r / m; }
    setKnob(dx, dy);
    const v = shapeStick(dx / center.r, dy / center.r);
    if (onLook) onLook(v.x, v.y);
  }
  function stickDown(e) {
    stop(e);
    if (stickId !== null) return;
    stickId = e.pointerId;
    capture(stick, e.pointerId);
    const r = stick.getBoundingClientRect();
    center = { x: r.left + r.width / 2, y: r.top + r.height / 2, r: Math.max(20, r.width / 2 - 8) };
    stick.classList.add('is-on');
    stickMove(e);
  }
  function stickUp(e) {
    if (e.pointerId !== stickId) return;
    stop(e);
    releaseStick();
  }
  function releaseStick() {
    stickId = null;
    center = null;
    stick.classList.remove('is-on');
    setKnob(0, 0);
    if (onLook) onLook(0, 0);
  }

  const noCtx = (e) => e.preventDefault();
  const L = [
    [walk, 'pointerdown', walkDown], [walk, 'pointerup', walkUp], [walk, 'pointercancel', walkUp], [walk, 'lostpointercapture', walkUp],
    [stick, 'pointerdown', stickDown], [stick, 'pointermove', stickMove], [stick, 'pointerup', stickUp], [stick, 'pointercancel', stickUp],
    [stick, 'lostpointercapture', stickUp], [root, 'contextmenu', noCtx],
  ];
  for (const [el, t, fn] of L) el.addEventListener(t, fn);
  // iOS: langes Halten auf „GEHEN“ soll weder Lupe/Textauswahl noch Kontextmenü auslösen (Pointer-Events laufen weiter)
  const noTouch = (e) => { if (e.cancelable) e.preventDefault(); };
  root.addEventListener('touchstart', noTouch, { passive: false });

  const api = {
    root,
    get walking() { return walkId !== null; },
    /** Gedrückte Finger loslassen (Moduswechsel, Ausblenden). */
    reset() {
      if (walkId !== null) { walkId = null; setWalk(false); }
      if (stickId !== null) releaseStick();
    },
    show(on) {
      if (!on) api.reset();
      root.hidden = !on;
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
