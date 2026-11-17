// VIDEOTHEK LENZ · Basketballkorb (rein): Treffer = Ball kreuzt die Ringebene von oben nach unten innerhalb des Rings.
// Serie: Treffer ohne dazwischenliegenden Fehlwurf; ein Wurf des Spielers, der ohne Treffer landet, setzt die Serie zurück.
const RING_R = 0.3; // Innenradius (großzügiger als echt: der Ball hat 0,12 m Radius)
const RING_Y = 3.05;

/** Korb-Anker aus layout.city.yard.hoop (tolerant: { ring: {x,y,z,r} } oder { x, z, ringY, ringR }) oder Rückfall aus dem Hofrechteck. */
export function resolveHoop(yard) {
  const h = yard && yard.hoop;
  if (h) {
    const ring = h.ring || h;
    const y = Number.isFinite(ring.y) ? ring.y : (Number.isFinite(h.ringY) ? h.ringY : RING_Y);
    const r = Number.isFinite(ring.r) ? ring.r : (Number.isFinite(h.ringR) ? h.ringR : RING_R);
    if (Number.isFinite(ring.x) && Number.isFinite(ring.z)) return { x: ring.x, z: ring.z, y, r, yaw: h.yaw || 0, fallback: false, mast: h.mast || null };
  }
  const y1 = yard && yard.x1;
  const z0 = yard && yard.z0;
  if (!Number.isFinite(y1) || !Number.isFinite(z0)) return null;
  // Rückfall: Ost-Ende des Hofs, Brett zur Ostwand, Ring zeigt nach Westen in den Hof
  const x = yard.x1 - 1.5;
  const z = z0 + 4.2;
  return { x, z, y: RING_Y, r: RING_R, yaw: Math.PI / 2, fallback: true, mast: { x: x + 0.95, z } };
}

/** Zähler. feed(id, prev, cur, ballR) mit Mittelpunkten vor/nach dem Schritt; landed(id) beim ersten Bodenkontakt. */
export function createHoopTracker(hoop, { onScore, onMiss } = {}) {
  const st = { hits: 0, streak: 0, best: 0 };
  const flying = new Set();
  const scored = new Set();
  return {
    state: st,
    /** Wurf des Spielers markieren (nur diese zählen für Fehlwurf-Rücksetzen). */
    shot(id) { flying.add(id); scored.delete(id); },
    feed(id, prev, cur, ballR = 0.12) {
      if (scored.has(id)) return false;
      if (!(prev.y > hoop.y && cur.y <= hoop.y)) return false;
      const t = (prev.y - hoop.y) / (prev.y - cur.y || 1);
      const x = prev.x + (cur.x - prev.x) * t;
      const z = prev.z + (cur.z - prev.z) * t;
      if (Math.hypot(x - hoop.x, z - hoop.z) > hoop.r - ballR * 0.4) return false;
      scored.add(id);
      st.hits++; st.streak++; if (st.streak > st.best) st.best = st.streak;
      if (onScore) onScore({ ...st });
      return true;
    },
    landed(id) {
      const was = flying.delete(id);
      if (was && !scored.has(id)) {
        if (st.streak) { st.streak = 0; if (onMiss) onMiss({ ...st }); }
      }
      scored.delete(id);
    },
  };
}
