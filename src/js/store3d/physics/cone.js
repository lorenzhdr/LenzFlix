// VIDEOTHEK LENZ · Physik: Trefferwahl im Kegel (rein). Horizontal ab der Spielerposition (XZ), mit Höhenband ab den Füßen,
// weil die Kamera auf 1,65 m sitzt und Dinge am Boden sonst nie im 3D-Kegel lägen (Auslegung zum Brief: Kegel ±25° in XZ, 1,6 m).
export const HIT_RANGE = 1.6;
export const HIT_CONE_DEG = 25;
export const GRAB_RANGE = 1.2;

/**
 * Nächster Körper im horizontalen Kegel.
 * q = { x, z, dx, dz (Blickrichtung, wird normiert), y (Füße), range, deg, bandUp = 2.1, bandDown = 0.15 }
 * Körper mit .held oder .removed werden übersprungen. Rückgabe { body, dist, ang } | null.
 */
export function pickInCone(bodies, q) {
  const len = Math.hypot(q.dx, q.dz);
  if (!(len > 1e-6)) return null;
  const fx = q.dx / len;
  const fz = q.dz / len;
  const range = q.range || HIT_RANGE;
  const maxAng = ((q.deg === undefined ? HIT_CONE_DEG : q.deg) * Math.PI) / 180;
  const up = q.bandUp === undefined ? 2.1 : q.bandUp;
  const down = q.bandDown === undefined ? 0.15 : q.bandDown;
  let best = null;
  for (const b of bodies) {
    if (b.held || b.removed) continue;
    const bot = b.pos.y - b.hy;
    const top = b.pos.y + b.hy;
    if (top < q.y - down || bot > q.y + up) continue;
    const vx = b.pos.x - q.x;
    const vz = b.pos.z - q.z;
    const d = Math.hypot(vx, vz);
    const rb = b.r;
    if (d - rb > range) continue;
    // Körper direkt am Spieler (Kreis überlappt): immer Treffer
    let ang = 0;
    if (d > rb) {
      const cos = (vx * fx + vz * fz) / d;
      ang = Math.acos(Math.max(-1, Math.min(1, cos)));
      if (ang > maxAng + Math.asin(Math.min(1, rb / d))) continue;
    } else if (vx * fx + vz * fz < -rb) continue;
    const dist = Math.max(0, d - rb);
    if (!best || dist < best.dist) best = { body: b, dist, ang };
  }
  return best;
}
