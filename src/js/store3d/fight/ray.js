// VIDEOTHEK LENZ · Strahl gegen Wände (1.18.0; rein, ohne three): Laserpunkt-Auftreffpunkt für modules/fight.js.
// Kollider { x0, z0, x1, z1, y0?, y1? } (nav/collide.js; y0 Standard 0, y1 Standard 2,6). Dazu der Boden (y = 0).

/** Eintrittsabstand t (≥ 0) des Strahls o + t·d in die Box, sonst Infinity. */
function rayBoxT(o, d, b) {
  let t0 = 0;
  let t1 = Infinity;
  const y0 = b.y0 === undefined ? 0 : b.y0;
  const y1 = b.y1 === undefined ? 2.6 : b.y1;
  const axes = [[o.x, d.x, b.x0, b.x1], [o.y, d.y, y0, y1], [o.z, d.z, b.z0, b.z1]];
  for (const [p, v, lo, hi] of axes) {
    if (Math.abs(v) < 1e-9) { if (p < lo || p > hi) return Infinity; continue; }
    let a = (lo - p) / v;
    let c = (hi - p) / v;
    if (a > c) { const s = a; a = c; c = s; }
    if (a > t0) t0 = a;
    if (c < t1) t1 = c;
    if (t0 > t1) return Infinity;
  }
  return t0;
}

/** Nächster Auftreffpunkt innerhalb maxT: { t, point, hit: 'wall'|'floor'|null } (hit null = Strahl endet frei bei maxT). */
export function castRay(o, d, colliders, maxT) {
  const l = Math.hypot(d.x, d.y, d.z) || 1;
  const n = { x: d.x / l, y: d.y / l, z: d.z / l };
  let t = maxT;
  let hit = null;
  if (colliders) {
    for (const b of colliders) {
      if (!b || b.dynamic) continue;
      const s = rayBoxT(o, n, b);
      if (s < t) { t = s; hit = 'wall'; }
    }
  }
  if (n.y < -1e-6 && o.y > 0) {
    const s = -o.y / n.y;
    if (s < t) { t = s; hit = 'floor'; }
  }
  return { t, hit, point: { x: o.x + n.x * t, y: o.y + n.y * t, z: o.z + n.z * t }, dir: n };
}
