// VIDEOTHEK LENZ · Anvisieren: Strahl gegen die Hüllenboxen der Regalseiten in der Nähe (ohne three-Raycaster, da die
// Hüllen zu einer Geometrie je Regalseite zusammengeführt sind) und gegen Interaktions-Boxen von Modulen. Ohne Allokationen.

let T0 = 0;
let T1 = 0;

// Slab-Test einer Achse; aktualisiert T0/T1, false = kein Treffer.
function slab(p, v, lo, hi) {
  if (Math.abs(v) < 1e-8) return p >= lo && p <= hi;
  let a = (lo - p) / v;
  let b = (hi - p) / v;
  if (a > b) { const t = a; a = b; b = t; }
  if (a > T0) T0 = a;
  if (b < T1) T1 = b;
  return T0 <= T1;
}

/**
 * @param {Array} faceViews aus build-shelves
 * @param {{x,y,z}} o Strahlursprung (Welt)
 * @param {{x,y,z}} d Strahlrichtung (normiert)
 * @param {number} maxDist Reichweite in Metern
 * @returns {{fv, info, t}|null}
 */
export function pickCover(faceViews, o, d, maxDist) {
  let best = null;
  const lim = (maxDist + 1.2) * (maxDist + 1.2);
  for (const fv of faceViews) {
    if (!fv.mesh) continue;
    const f = fv.face;
    const rx = o.x - f.x;
    const rz = o.z - f.z;
    if (rx * rx + rz * rz > lim) continue;
    const c = Math.cos(f.yaw);
    const s = Math.sin(f.yaw);
    // Welt -> Face-lokal (Umkehrung von Ry)
    const ox = rx * c - rz * s;
    const oz = rx * s + rz * c;
    if (oz < 0) continue; // Ursprung hinter der Regalfront: nicht durch das Regal greifen
    const dx = d.x * c - d.z * s;
    const dz = d.x * s + d.z * c;
    for (const info of fv.infos) {
      if (info.hidden) continue;
      const h = info.half;
      const l = info.local;
      T0 = 0;
      T1 = maxDist;
      if (slab(ox - l.x, dx, -h.x, h.x) && slab(o.y - l.y, d.y, -h.y, h.y) && slab(oz - l.z, dz, -h.z, h.z) && (!best || T0 < best.t)) {
        best = { fv, info, t: T0 };
      }
    }
  }
  return best;
}

/** Möbel/Requisiten: ihre Kollider umschließen oft die eigene Interaktionsbox (Sofa, Fach), sie verdecken nie. */
const NOT_WALL = new Set(['prop', 'shelf', 'counter', 'door', 'crate', 'car']);

/**
 * Sichtblocker aus einer Kollider-Liste: statische, mindestens 2,5 m hohe Kollider vom Boden aus (Wände, Fassaden, Gebäude).
 * Niedrige Möbel und Dächer verdecken nie.
 */
export function wallOccluders(colliders) {
  const out = [];
  for (const q of colliders || []) {
    if (q.dynamic || NOT_WALL.has(q.kind)) continue;
    const y0 = q.y0 === undefined ? 0 : q.y0;
    const y1 = q.y1 === undefined ? Infinity : q.y1;
    if (y0 <= 0.5 && y1 >= 2.5) out.push(q);
  }
  return out;
}

/** Verdeckt ein Blocker den Strahl vor der Entfernung t? Blocker, die den Ursprung enthalten, zählen nicht. */
function occludedBefore(occ, o, d, t) {
  for (let i = 0; i < occ.length; i++) {
    const q = occ[i];
    if (o.x >= q.x0 && o.x <= q.x1 && o.z >= q.z0 && o.z <= q.z1) continue;
    T0 = 0;
    T1 = t - 0.02;
    if (T1 <= 0) continue;
    const y1 = q.y1 === undefined ? Infinity : q.y1;
    if (slab(o.x, d.x, q.x0, q.x1) && slab(o.z, d.z, q.z0, q.z1) && slab(o.y, d.y, q.y0 || 0, y1)) return true;
  }
  return false;
}

/**
 * Strahl gegen Interaktions-Boxen (Weltkoordinaten) von Modulen. Mit `occ` (wallOccluders) zählen Boxen hinter einer Wand nicht.
 * @param {Array<{box:{min,max}, enabled?:Function}>} list
 * @returns {{ia, t}|null}
 */
export function pickBoxes(list, o, d, maxDist, occ = null) {
  let best = null;
  for (const ia of list) {
    if (ia.enabled && !ia.enabled()) continue;
    const { min, max } = ia.box;
    T0 = 0;
    T1 = maxDist;
    if (slab(o.x, d.x, min.x, max.x) && slab(o.y, d.y, min.y, max.y) && slab(o.z, d.z, min.z, max.z) && (!best || T0 < best.t)) {
      const t = T0;
      if (occ && occ.length && occludedBefore(occ, o, d, t)) continue;
      best = { ia, t };
    }
  }
  return best;
}
