// VIDEOTHEK LENZ · Mehrspieler: Netzrahmen (rein, ohne three/DOM). Rechnet zwischen den lokalen Koordinaten (Ladenbreite W und
// -tiefe D hängen vom Katalog ab) und dem kanonischen Leitungsrahmen mit W0 = 12.5, D0 = 18, PW0 = 20 um. Vertrag: docs/mp-api.md §6.1.
// Die Abbildung ist stückweise linear, stetig und monoton; außerhalb der Knoten gilt Steigung 1. Der Palast-Bereich wird
// nicht geometrisch erkannt, sondern über `r = 1` der Pose gewählt (nur x; z nutzt immer die allgemeine Abbildung).
import { areaAt } from '../world/city.js';

export const W0 = 12.5;
export const D0 = 18;
export const PW0 = 20;
export const SZ0 = 28.7;
/** Knoten im Netzrahmen: allgemein (x) und Palast (x). */
export const NET_KX = [0, 1.75, 10.75, 12.5];
export const NET_KP = [-3.75, 0.75, 11.75, 16.25];

const TAU = Math.PI * 2;
const r0 = (v) => Math.round(v) + 0; // kein -0
const r3 = (v) => Math.round(v * 1000) / 1000 + 0;

/** Yaw auf (-π, π] wrappen (Body.yaw ist ungewrappt). */
export function wrapYaw(yaw) {
  if (!Number.isFinite(yaw)) return 0;
  const y = yaw - TAU * Math.ceil((yaw - Math.PI) / TAU);
  return y + 0;
}
/** Yaw (rad) -> cRad im Bereich ±314. */
export const encYaw = (yaw) => r0(wrapYaw(yaw) * 100);
export const decYaw = (c) => c / 100;
/** Pitch (rad) -> cRad, geklemmt auf ±157. */
export const encPitch = (p) => Math.max(-157, Math.min(157, r0((Number.isFinite(p) ? p : 0) * 100)));
export const decPitch = (c) => c / 100;

/** Stückweise linear von `from` nach `to` (gleich lange, aufsteigende Knoten); außerhalb Steigung 1. */
function pw(v, from, to) {
  const n = from.length - 1;
  if (v <= from[0]) return to[0] + (v - from[0]);
  if (v >= from[n]) return to[n] + (v - from[n]);
  let i = 0;
  while (i < n - 1 && v > from[i + 1]) i++;
  return to[i] + ((v - from[i]) * (to[i + 1] - to[i])) / (from[i + 1] - from[i]);
}
/** Steigung dto/dfrom an der Stelle v. */
function slope(v, from, to) {
  const n = from.length - 1;
  if (v <= from[0] || v >= from[n]) return 1;
  let i = 0;
  while (i < n - 1 && v > from[i + 1]) i++;
  return (to[i + 1] - to[i]) / (from[i + 1] - from[i]);
}
const increasing = (k) => k.every((v, i) => i === 0 || v > k[i - 1]);

/**
 * Netzrahmen für ein Layout (`layout.w`, `layout.d`, optional `layout.city`).
 * Positionen: `enc(x,y,z,r)` Meter -> [cm,cm,cm] (int), `dec(cx,cy,cz,r)` cm -> Meter. `r`: 0 Laden, 1 Palast, 2 draußen.
 * Vektoren: `encVec(x,z,vx,vz,r)` (lokale Position, m/s) -> [cm/s, cm/s] mit der lokalen Steigung skaliert;
 * `decVec(cx,cz,cvx,cvz,r)` (Netzposition in cm, cm/s) -> m/s. Richtungen: `encDir`/`decDir` -> Einheitsvektor x100 bzw. Einheitsvektor.
 */
export function createFrame(layout) {
  const W = Number(layout && layout.w) || W0;
  const D = Number(layout && layout.d) || D0;
  const city = layout && layout.city;
  let xFrom = [0, W / 2 - 4.5, W / 2 + 4.5, W];
  let xTo = NET_KX;
  if (!increasing(xFrom)) { xFrom = [0, W]; xTo = [0, W0]; }
  const zFrom = D > 0 ? [0, D] : [0, D0];
  const zTo = [0, D0];
  let pFrom = null;
  const rc = city && city.palast && city.palast.rect;
  if (rc && Number.isFinite(rc.x0) && Number.isFinite(rc.x1)) {
    pFrom = [rc.x0, W / 2 - 5.5, W / 2 + 5.5, rc.x1];
    if (!increasing(pFrom)) pFrom = null;
  }

  const xmap = (r) => (r === 1 && pFrom ? [pFrom, NET_KP] : [xFrom, xTo]);

  return {
    W, D, hasPalast: !!pFrom,
    /** Ortskennung `r` für eine lokale Position (0 Laden, 1 Palast, 2 draußen). */
    area(x, z, y = 0) {
      const a = areaAt(layout, x, z, y);
      return a === 'shop' ? 0 : a === 'palastHall' || a === 'palastFoyer' ? 1 : 2;
    },
    enc(x, y, z, r = 0) {
      const [f, t] = xmap(r);
      return [r0(pw(x, f, t) * 100), r0(y * 100), r0(pw(z, zFrom, zTo) * 100)];
    },
    dec(cx, cy, cz, r = 0) {
      const [f, t] = xmap(r);
      return [r3(pw(cx / 100, t, f)), r3(cy / 100), r3(pw(cz / 100, zTo, zFrom))];
    },
    encVec(x, z, vx, vz, r = 0) {
      const [f, t] = xmap(r);
      return [r0(vx * slope(x, f, t) * 100), r0(vz * slope(z, zFrom, zTo) * 100)];
    },
    decVec(cx, cz, cvx, cvz, r = 0) {
      const [f, t] = xmap(r);
      const x = pw(cx / 100, t, f);
      const z = pw(cz / 100, zTo, zFrom);
      return [r3(cvx / 100 / slope(x, f, t)), r3(cvz / 100 / slope(z, zFrom, zTo))];
    },
    encDir(x, z, dx, dz, r = 0) {
      const [f, t] = xmap(r);
      const ax = dx * slope(x, f, t);
      const az = dz * slope(z, zFrom, zTo);
      const l = Math.hypot(ax, az) || 1;
      return [r0((ax / l) * 100), r0((az / l) * 100)];
    },
    decDir(cx, cz, dx, dz, r = 0) {
      const [f, t] = xmap(r);
      const x = pw(cx / 100, t, f);
      const z = pw(cz / 100, zTo, zFrom);
      const ax = dx / 100 / slope(x, f, t);
      const az = dz / 100 / slope(z, zFrom, zTo);
      const l = Math.hypot(ax, az) || 1;
      return [r3(ax / l), r3(az / l)];
    },
    encYaw, decYaw, encPitch, decPitch, wrapYaw,
  };
}
