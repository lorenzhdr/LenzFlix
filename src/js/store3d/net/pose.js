// VIDEOTHEK LENZ · Mehrspieler: Sendedrossel für die eigene Pose `p` (rein). Nur bei Änderung (Position > 2 cm, yaw > 2 cRad,
// pitch > 4 cRad, `a`/`r`/`se` neu), höchstens `rate()` Hz (Standard 8, `cf.pr`); beim Stillstand folgt sofort ein Abschluss-Frame;
// kein Heartbeat. Der Transport bündelt zusätzlich im 125-ms-Takt. Vertrag: docs/mp-api.md §6.3.
import { build } from './proto.js';

export const POS_EPS = 2; // cm (euklidisch, Netzrahmen)
export const YAW_EPS = 2; // cRad
export const PITCH_EPS = 4; // cRad
const YAW_PERIOD = 628; // 2π in cRad

const yawDiff = (a, b) => { const d = Math.abs(a - b) % YAW_PERIOD; return Math.min(d, YAW_PERIOD - d); };
const seKey = (se) => (se ? `${se[0]}:${se[1]}` : '');
const same = (a, b) => a.x === b.x && a.y === b.y && a.z === b.z && a.yaw === b.yaw && a.pitch === b.pitch && a.a === b.a && a.r === b.r && a.se === b.se;
const moved = (a, b) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) > POS_EPS || yawDiff(a.yaw, b.yaw) > YAW_EPS || Math.abs(a.pitch - b.pitch) > PITCH_EPS
  || a.a !== b.a || a.r !== b.r || a.se !== b.se;

/**
 * `frame` = createFrame(layout); `rate()` -> Hz (cf.pr, Standard 8).
 * update(s, t): s = { x, y, z (m, lokal), yaw, pitch (rad), a (Leitungscode), r? (0/1/2, sonst frame.area), se? [reihe, anteil] }, t = Zeit in ms.
 * Rückgabe: Nachricht `{t:'p', q, se?}` oder null.
 */
export function createPose({ frame, rate = () => 8 }) {
  let lastSent = null; // quantisiert
  let lastSentT = -Infinity;
  let lastObs = null;

  const quant = (s) => {
    const r = s.r === undefined || s.r === null ? frame.area(s.x, s.z, s.y) : s.r;
    const [x, y, z] = frame.enc(s.x, s.y, s.z, r);
    return { x, y, z, yaw: frame.encYaw(s.yaw), pitch: frame.encPitch(s.pitch), a: s.a | 0, r, se: seKey(s.se), seRaw: s.se || null };
  };
  const emit = (c, t) => {
    lastSent = c;
    lastSentT = t;
    return build.p([c.x, c.y, c.z, c.yaw, c.pitch, c.a, c.r], c.seRaw);
  };

  return {
    update(s, t) {
      const c = quant(s);
      const prev = lastObs;
      lastObs = c;
      if (!lastSent) return emit(c, t);
      // Abschluss-Frame: Stillstand (exakt gleich zur letzten Beobachtung), aber der letzte gesendete Stand weicht ab.
      if (prev && same(c, prev) && !same(c, lastSent)) return emit(c, t);
      if (!moved(c, lastSent)) return null;
      const hz = Math.max(1, Math.min(8, Number(rate()) || 8));
      return t - lastSentT >= 1000 / hz ? emit(c, t) : null;
    },
    /** Nach (Wieder-)Verbinden: nächster Aufruf sendet sofort. */
    reset() { lastSent = null; lastObs = null; lastSentT = -Infinity; },
    last() { return lastSent; },
  };
}
