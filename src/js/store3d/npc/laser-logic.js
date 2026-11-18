// VIDEOTHEK LENZ · Laser-Logik (1.18.0; rein): 0,5 s aufs Gesicht → 2 s geblendet; Katze jagt den Punkt, Tauben flattern auf, Fahrer bremsen.
export const LASER_RANGE = 15;
export const DWELL = 0.5;
export const BLIND_MS = 2000;
export const BRAKE_DECEL = 9;
export const HONK_S = 2.5;
export const TARGETS = ['person', 'richard', 'driver', 'cat', 'pigeon'];

/** Trifft der Strahl (origin, dir) die Kopfkugel (center, r) innerhalb range? Rein 3D. */
export function rayHitsHead(origin, dir, center, r = 0.16, range = LASER_RANGE) {
  const l = Math.hypot(dir.x, dir.y, dir.z) || 1;
  const dx = dir.x / l;
  const dy = dir.y / l;
  const dz = dir.z / l;
  const cx = center.x - origin.x;
  const cy = center.y - origin.y;
  const cz = center.z - origin.z;
  const tca = cx * dx + cy * dy + cz * dz;
  if (tca < 0 || tca > range + r) return false;
  return cx * cx + cy * cy + cz * cz - tca * tca <= r * r;
}

/** Verweil-Zustand je Ziel. */
export function createLaserDwell() { return { t: 0, fired: false }; }

/**
 * Schritt: onTarget = Strahl trifft das Ziel (Kopfkugel bei person/richard, Körper sonst). kind aus TARGETS.
 * → Ereignisse: { type: 'blind', ms } (person) · { type: 'hit', kind: 'richard' } · { type: 'chase', x, z } (Katze, jeden Schritt)
 *   · { type: 'flush' } (Tauben, einmal je Auftreffen) · { type: 'brake', decel, honk } (Fahrer, nach 0,5 s einmal).
 * Verlässt der Strahl das Ziel, setzt sich der Zustand zurück.
 */
export function stepLaser(st, dt, kind, onTarget, point) {
  const ev = [];
  if (!onTarget) { st.t = 0; st.fired = false; return ev; }
  st.t += dt;
  if (kind === 'cat') { ev.push({ type: 'chase', x: point ? point.x : 0, z: point ? point.z : 0 }); return ev; }
  if (kind === 'pigeon') { if (!st.fired) { st.fired = true; ev.push({ type: 'flush' }); } return ev; }
  if (st.t < DWELL || st.fired) return ev;
  st.fired = true;
  if (kind === 'richard') ev.push({ type: 'hit', kind: 'richard' });
  else if (kind === 'driver') ev.push({ type: 'brake', decel: BRAKE_DECEL, honk: HONK_S });
  else ev.push({ type: 'blind', ms: BLIND_MS });
  return ev;
}
