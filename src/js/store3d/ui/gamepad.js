// VIDEOTHEK LENZ · Touch-Schema „Spiel“ (game), reine Ansicht: Ruhe-Stick links (immer sichtbar, dezent), Knöpfe unten rechts
// (Springen, Benutzen, Schlagen bzw. Werfen, Zoom). Die gesamte Eingabe (Finger-Rollen, Stick, Umsehen, Tippen) macht
// controls/gametouch.js; hier nur DOM, Zustände und Geometrie. .lfx-store-gp ist ganzflächig (Touch-Fläche), die Stick-Zone ist reine Geometrie.

/** Totzone (Anteil des Radius) und Rennschwellen (Hysterese). */
export const GP_DEAD = 0.12;
export const GP_RUN_ON = 0.92;
export const GP_RUN_OFF = 0.8;
/** Stick-Zone als Anteil der Fensterbreite/-höhe: Finger links von x und unterhalb y legen den Stick an. */
export const GP_ZONE = {
  landscape: { x: 0.42, y: 0.28 },
  portrait: { x: 0.48, y: 0.42 },
};

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
 * Ansicht des Touch-Schemas „game“.
 * @param {HTMLElement} host
 * 1.17.0: Knopf „Ansicht“ (name 'view', Standard versteckt, setViewShown) und freier Platz 'aux' neben Schlagen/Werfen (1.18-Naht, Standard versteckt, setAux).
 * @returns {{root, btnOf, setStick, restStick, press, setAimed, setCarrying, carrying, setViewShown, setAux, show, setParked, zoneOf, destroy}}
 */
export function createGamepad(host) {
  const root = mk('div', 'lfx-store-gp');
  root.setAttribute('aria-hidden', 'true');
  const base = mk('div', 'lfx-store-gp-base is-rest');
  const knob = mk('div', 'lfx-store-gp-knob');
  base.appendChild(knob);
  const btns = mk('div', 'lfx-store-gp-btns');
  const jump = mk('button', 'lfx-store-gp-jump', 'SPRINGEN');
  const use = mk('button', 'lfx-store-gp-use', 'BENUTZEN');
  const hit = mk('button', 'lfx-store-gp-hit', 'SCHLAGEN');
  const thr = mk('button', 'lfx-store-gp-throw', 'WERFEN');
  const zoom = mk('button', 'lfx-store-gp-zoom', 'ZOOM');
  const view = mk('button', 'lfx-store-gp-view', 'ANSICHT');
  const aux = mk('button', 'lfx-store-gp-aux', '');
  for (const b of [jump, use, hit, thr, zoom, view, aux]) { b.type = 'button'; b.tabIndex = -1; }
  thr.hidden = true;
  view.hidden = true;
  aux.hidden = true;
  btns.append(jump, use, hit, thr, zoom, view, aux);
  root.append(base, btns);
  host.appendChild(root);

  const byName = { jump, use, act: hit, zoom, view, aux };
  let carrying = false;

  const actEl = () => (carrying ? thr : hit);
  const nameOf = (el) => (el === jump ? 'jump' : el === use ? 'use' : el === hit || el === thr ? 'act' : el === zoom ? 'zoom' : el === view ? 'view' : el === aux ? 'aux' : null);

  const noCtx = (e) => e.preventDefault();
  root.addEventListener('contextmenu', noCtx);

  const api = {
    root,
    /** Knopfname zu einem Ereignisziel (auch Kindelemente): 'jump' | 'use' | 'act' | 'zoom' | 'view' | 'aux' | null. */
    btnOf(target) {
      let el = target && target.nodeType ? target : null;
      while (el && el !== root) {
        if (el.parentNode === btns) return nameOf(el);
        el = el.parentNode;
      }
      return null;
    },
    /**
     * Stick-Basis an Client-Position (cx, cy; Mitte), Knopfversatz kx/ky in px, run → Rennen-Rand.
     * Position relativ zum Rect von root (H1-Fix: Basis ist Kind von root, nicht einer versetzten Zone).
     */
    setStick(cx, cy, kx, ky, run) {
      const r = root.getBoundingClientRect();
      const x = Math.round(cx - r.left);
      const y = Math.round(cy - r.top);
      base.classList.remove('is-rest');
      base.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
      knob.style.transform = kx || ky ? `translate(${Math.round(kx)}px, ${Math.round(ky)}px)` : '';
      base.classList.toggle('is-run', !!run);
    },
    /** Zurück zum Ruheplatz (dezent, ohne Transformation). */
    restStick() {
      base.classList.add('is-rest');
      base.classList.remove('is-run');
      base.style.transform = '';
      knob.style.transform = '';
    },
    /** Knopf optisch gedrückt (name: jump | use | act | zoom | view | aux). */
    press(name, on) {
      const el = name === 'act' ? actEl() : byName[name];
      if (el) el.classList.toggle('is-down', !!on);
      if (name === 'act') { const o = el === hit ? thr : hit; o.classList.remove('is-down'); }
    },
    /** Knopf „Ansicht“ zeigen/verstecken (versteckte Knöpfe nimmt GameTouch nicht als Ziel). */
    setViewShown(on) { view.hidden = !on; },
    /** Freier Knopf neben Schlagen/Werfen (1.18-Naht): zeigen mit Beschriftung, off = verstecken. */
    setAux(on, label) { aux.hidden = !on; if (label !== undefined) aux.textContent = label; },
    /** Ziel im Fadenkreuz: Benutzen-Knopf hervorheben. */
    setAimed(on) { use.classList.toggle('is-aimed', !!on); },
    /** Getragene Hülle: „Werfen“ ersetzt „Schlagen“ (btnOf liefert weiter 'act'). */
    setCarrying(on) {
      carrying = !!on;
      thr.hidden = !carrying;
      hit.hidden = carrying;
      use.classList.toggle('is-carry', carrying);
    },
    get carrying() { return carrying; },
    show(on) { root.hidden = !on; },
    /** Geparkt (Kamerafahrt): unsichtbar, Ereignisse laufen weiter. */
    setParked(on) { root.classList.toggle('is-parked', !!on); },
    /** Liegt der Client-Punkt in der Stick-Zone? Hoch-/Querformat per innerHeight > innerWidth. */
    zoneOf(x, y) {
      const w = window.innerWidth || 800;
      const h = window.innerHeight || 600;
      const z = h > w ? GP_ZONE.portrait : GP_ZONE.landscape;
      return x < z.x * w && y > z.y * h;
    },
    destroy() {
      root.removeEventListener('contextmenu', noCtx);
      root.remove();
    },
  };
  return api;
}
