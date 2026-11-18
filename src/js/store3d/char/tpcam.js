// VIDEOTHEK LENZ · Außenansicht (1.17.0): Kameraberechnung hinter dem Auge (rein, ohne three/DOM, keine Timer).
// Die Kamera steht BACK m hinter und UP m über dem Auge (entlang Blickrichtung aus yaw/pitch). Die Strecke Auge → Wunschposition wird gegen
// statische Kollider (layout.cidx bzw. eine Kolliderliste) geprüft: Treffer → sofort einziehen, danach in EXTEND_T s wieder ausfahren;
// unter HIDE_DIST m Abstand blendet selfview die eigene Figur aus.
// Fallen (docs/store3d.md „Kollision“): `index.query` teilt einen `seen`-Satz, ceilingY/groundHeight teilen `scratch` →
// Kandidaten zuerst in ein eigenes Feld kopieren, erst danach weitere collide-Funktionen rufen, nie verschachtelt.
import { ceilingY } from '../nav/collide.js';

export const BACK = 2.4;
export const UP = 0.3;
export const HIDE_DIST = 0.7;
export const EXTEND_T = 0.25;
/** Pufferabstand der Kamera zu Wänden (m). */
export const MARGIN = 0.14;
/** Kamera bleibt mindestens so hoch über den Füßen bzw. so weit unter einer Decke. */
export const FLOOR_GAP = 0.12;
export const CEIL_GAP = 0.12;

const cands = [];

/** Kandidaten aus Liste oder Index in `out` kopieren (kein weiterer collide-Aufruf währenddessen). */
function collect(src, x0, z0, x1, z1, out) {
  out.length = 0;
  if (!src) return out;
  if (Array.isArray(src)) {
    for (let i = 0; i < src.length; i++) {
      const q = src[i];
      if (!q || q.dynamic) continue;
      if (q.x1 < x0 || q.x0 > x1 || q.z1 < z0 || q.z0 > z1) continue;
      out.push(q);
    }
    return out;
  }
  const index = typeof src.query === 'function' ? src : src.index;
  if (index) index.query(x0, z0, x1, z1, (q) => { if (!q.dynamic) out.push(q); });
  return out;
}

/** Blickrichtung (three, Euler YXZ): yaw um Y, pitch um X; out = {x,y,z}. */
export function forward(yaw, pitch, out = {}) {
  const cp = Math.cos(pitch);
  out.x = -Math.sin(yaw) * cp;
  out.y = Math.sin(pitch);
  out.z = -Math.cos(yaw) * cp;
  return out;
}

/** Strahl o + t·d (t in 0..1) gegen Quader q (um m geweitet): Eintrittsparameter, Infinity (kein Treffer) oder -1 (Start liegt innen). */
function slab(ox, oy, oz, dx, dy, dz, q, m) {
  const mn = [q.x0 - m, (q.y0 === undefined ? 0 : q.y0) - m, q.z0 - m];
  const mx = [q.x1 + m, (q.y1 === undefined ? Infinity : q.y1) + m, q.z1 + m];
  const o = [ox, oy, oz];
  const d = [dx, dy, dz];
  let t0 = 0;
  let t1 = 1;
  let inside = true;
  for (let i = 0; i < 3; i++) {
    if (o[i] < mn[i] || o[i] > mx[i]) inside = false;
    if (Math.abs(d[i]) < 1e-9) {
      if (o[i] < mn[i] || o[i] > mx[i]) return Infinity;
      continue;
    }
    let a = (mn[i] - o[i]) / d[i];
    let b = (mx[i] - o[i]) / d[i];
    if (a > b) { const s = a; a = b; b = s; }
    if (a > t0) t0 = a;
    if (b < t1) t1 = b;
    if (t0 > t1) return Infinity;
  }
  return inside ? -1 : t0;
}

/**
 * Kameraposition der Außenansicht.
 * @param {object|Array} src Kolliderliste oder Index (layout.cidx)
 * @param {{x:number,y:number,z:number}} eye Augenposition
 * @param {number} yaw
 * @param {number} pitch
 * @param {number} feetY Höhe der Füße (Boden unter dem Spieler)
 * @param {{back?:number, up?:number, margin?:number}} [o]
 * @returns {{x:number,y:number,z:number, frac:number, want:{x:number,y:number,z:number}, len:number, hit:boolean}}
 *   frac = zulässiger Anteil (0..1) der Strecke Auge → Wunschposition, len = Länge dieser Strecke (m)
 */
export function solveTpCam(src, eye, yaw, pitch, feetY, o = {}) {
  const back = o.back === undefined ? BACK : o.back;
  const up = o.up === undefined ? UP : o.up;
  const margin = o.margin === undefined ? MARGIN : o.margin;
  const f = forward(yaw, pitch);
  let wx = eye.x - f.x * back;
  let wy = eye.y - f.y * back + up;
  let wz = eye.z - f.z * back;
  // Boden: nie unter die Füße
  if (wy < feetY + FLOOR_GAP) wy = feetY + FLOOR_GAP;
  // Decke über dem Wunschpunkt (ceilingY meldet nur Unterkanten im Fenster feetY+STEP_H .. feetY+bodyH+0.2 → Fenster bis über die Kamerahöhe)
  const win = Math.max(1.7, wy - feetY + 0.1);
  const ceil = src ? ceilingY(wx, wz, margin, feetY, src, win) : Infinity;
  if (Number.isFinite(ceil) && wy > ceil - CEIL_GAP) wy = ceil - CEIL_GAP;
  const dx = wx - eye.x;
  const dy = wy - eye.y;
  const dz = wz - eye.z;
  const len = Math.hypot(dx, dy, dz);
  let frac = 1;
  const x0 = Math.min(eye.x, wx) - margin;
  const x1 = Math.max(eye.x, wx) + margin;
  const z0 = Math.min(eye.z, wz) - margin;
  const z1 = Math.max(eye.z, wz) + margin;
  collect(src, x0, z0, x1, z1, cands);
  for (let i = 0; i < cands.length; i++) {
    const q = cands[i];
    let t = slab(eye.x, eye.y, eye.z, dx, dy, dz, q, margin);
    if (t === -1) { // Auge liegt im geweiteten Quader: ohne Puffer prüfen, liegt es auch dann innen, ist der Weg zu
      t = slab(eye.x, eye.y, eye.z, dx, dy, dz, q, 0);
      if (t === -1) t = 0;
    }
    if (t < frac) frac = t;
  }
  cands.length = 0;
  frac = Math.max(0, Math.min(1, frac));
  return {
    x: eye.x + dx * frac, y: eye.y + dy * frac, z: eye.z + dz * frac, frac, want: { x: wx, y: wy, z: wz }, len, hit: frac < 1,
  };
}

/**
 * Anteil glätten: einziehen sofort, ausfahren in EXTEND_T s vom Eingezogenen bis voll (1 / EXTEND_T je s).
 * @returns {number} neuer Anteil
 */
export function smoothFrac(cur, target, dt) {
  if (!Number.isFinite(cur)) return target;
  if (target <= cur) return target;
  return Math.min(target, cur + (Math.max(0, dt) / EXTEND_T));
}

/** Eigene Figur ausblenden, wenn die Kamera näher als HIDE_DIST am Auge steht (Hysterese gegen Flackern). */
export function hideBody(dist, wasHidden = false) {
  return wasHidden ? dist < HIDE_DIST + 0.1 : dist < HIDE_DIST;
}
