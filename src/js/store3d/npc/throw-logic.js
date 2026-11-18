// VIDEOTHEK LENZ · Wurfgeschosse der NPC (1.18.0; rein): Bonbon (Kioskfrau) und Popcorn (Kino-Personal). Flugbahn ohne Physik (Parabel),
// Treffer wird bei der Ankunft gegen die Spielerposition geprüft (Ausweichen möglich).
export const THROW = { speed: 8, minDur: 0.25, maxDur: 1.4, hitR: 0.9, hitDy: 1.3, max: 6 };
export const THROW_DMG = { candy: 4, popcorn: 4 };
export const THROW_SOUND = { candy: 'candy', popcorn: 'pop' };
export const THROW_COLORS = { candy: [[1, 0.2, 0.55], [0.25, 0.8, 1], [1, 0.85, 0.2]], popcorn: [[1, 0.95, 0.75], [1, 0.9, 0.55]] };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** from/to = {x,y,z} (to = Zielpunkt in Brusthöhe). */
export function createThrow(kind, from, to) {
  const d = Math.hypot(to.x - from.x, to.z - from.z);
  return {
    kind: THROW_DMG[kind] !== undefined ? kind : 'popcorn', from: { x: from.x, y: from.y, z: from.z }, to: { x: to.x, y: to.y, z: to.z },
    t: 0, dur: clamp(d / THROW.speed, THROW.minDur, THROW.maxDur), arc: 0.15 + 0.35 * Math.min(1, d / 6), x: from.x, y: from.y, z: from.z, done: false,
    color: 0, spin: 0,
  };
}

/** Schritt. player = { x, z, y (Füße) } | null. → { arrived, hit }. */
export function stepThrow(p, dt, player) {
  if (p.done) return { arrived: true, hit: false };
  p.t += dt;
  p.spin += dt * 14;
  const s = clamp(p.t / p.dur, 0, 1);
  p.x = p.from.x + (p.to.x - p.from.x) * s;
  p.z = p.from.z + (p.to.z - p.from.z) * s;
  p.y = p.from.y + (p.to.y - p.from.y) * s + 4 * p.arc * s * (1 - s);
  if (s < 1) return { arrived: false, hit: false };
  p.done = true;
  const hit = !!player && Math.hypot(player.x - p.to.x, player.z - p.to.z) <= THROW.hitR && Math.abs((player.y || 0) + THROW.hitDy - p.to.y) < 1.2;
  return { arrived: true, hit };
}
