// VIDEOTHEK LENZ · Richard: reine Hilfsfunktionen (ohne three/DOM): Trefferkegel, Pfadfolge, Sprungbogen, Wurfbahn,
// Ausleih-Buch und Diebstahlsicherung. Alles mit injizierter Zeit/Speicher, testbar.
const DEG = Math.PI / 180;

/**
 * Trifft der Schlag? origin/dir = Auge + Blickrichtung (x,y,z), target = Richards Brustmitte (x,y,z).
 * Kegel ±half (Standard 25°) horizontal, Reichweite range (1,6 m, plus Körperradius), senkrecht ±50°.
 */
export function inCone(origin, dir, target, { range = 1.6, half = 25 * DEG, radius = 0.25 } = {}) {
  const dx = target.x - origin.x;
  const dz = target.z - origin.z;
  const d = Math.hypot(dx, dz);
  if (d - radius > range) return { hit: false, dist: d };
  const hl = Math.hypot(dir.x, dir.z);
  if (hl < 0.2) return { hit: d <= range * 0.8, dist: d }; // fast senkrechter Blick: nur Nähe
  const cos = (dx * dir.x + dz * dir.z) / (Math.max(d, 1e-6) * hl);
  const ang = Math.acos(Math.min(1, Math.max(-1, cos)));
  const tol = half + (d > 1e-6 ? Math.atan(radius / d) : Math.PI);
  if (ang > tol) return { hit: false, dist: d, angle: ang };
  const want = Math.atan2(target.y - origin.y, Math.max(d, 1e-6));
  const have = Math.asin(Math.min(1, Math.max(-1, dir.y)));
  return { hit: Math.abs(want - have) <= 50 * DEG, dist: d, angle: ang };
}

/** Schritt entlang Wegpunkten: pos {x,z}, path [{x,z}], Index i; Rückgabe { x, z, i, yaw, done }. */
export function stepAlong(pos, path, i, speed, dt) {
  let x = pos.x;
  let z = pos.z;
  let yaw = null;
  let left = speed * dt;
  while (i < path.length && left > 0) {
    const w = path[i];
    const dx = w.x - x;
    const dz = w.z - z;
    const d = Math.hypot(dx, dz);
    if (d > 1e-5) yaw = Math.atan2(-dx, -dz);
    if (d <= left) { x = w.x; z = w.z; left -= d; i++; } else { x += (dx / d) * left; z += (dz / d) * left; left = 0; }
  }
  return { x, z, i, yaw, done: i >= path.length };
}

/** Sprungbogen von a nach b, u 0..1; Start/Ende auf by, Scheitel by + peak. */
export function hopPoint(a, b, u, peak, by = 0) {
  const k = Math.min(1, Math.max(0, u));
  return { x: a.x + (b.x - a.x) * k, z: a.z + (b.z - a.z) * k, y: by + 4 * peak * k * (1 - k) };
}

export const GRAV = 9.8;
/** Startgeschwindigkeit für eine Wurfbahn von from nach to in der Zeit T (s). */
export function aimVelocity(from, to, T) {
  return { x: (to.x - from.x) / T, y: (to.y - from.y) / T + 0.5 * GRAV * T, z: (to.z - from.z) / T };
}
/** Ein Schritt der Wurfbahn (mutiert p, v); true, wenn der Boden erreicht ist. */
export function ballisticStep(p, v, dt, floor = 0.04) {
  v.y -= GRAV * dt;
  p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
  if (p.y <= floor) { p.y = floor; return true; }
  return false;
}

/** Ausleih-Buch (nur Sitzung). storage: { getItem, setItem } oder null (dann nur Speicher). */
export function createRentLedger(storage, key = 'lfx.store.rented') {
  const set = new Set();
  try { const raw = storage && storage.getItem(key); if (raw) for (const id of JSON.parse(raw)) set.add(String(id)); } catch { /* egal */ }
  const save = () => { try { if (storage) storage.setItem(key, JSON.stringify([...set].slice(-200))); } catch { /* egal */ } };
  return {
    isRented: (id) => set.has(String(id)),
    /** true, wenn neu ausgeliehen */
    rent(id) { id = String(id); if (set.has(id)) return false; set.add(id); save(); return true; },
    count: () => set.size,
  };
}

/** Alarm höchstens einmal je Hülle und cooldown Sekunden. */
export function createTheftGuard(cooldown = 60) {
  const last = new Map();
  return {
    shouldAlarm(id, t) {
      const l = last.get(id);
      if (l !== undefined && t - l < cooldown) return false;
      last.set(id, t);
      return true;
    },
    reset() { last.clear(); },
  };
}

/** Ist der Spieler (prev -> cur) in diesem Schritt durch das Tor (Linie z = gate.z, x0..x1) nach draußen (+z) gegangen? */
export function crossedGate(prev, cur, gate) {
  if (!prev || !cur) return false;
  if (!(prev.z < gate.z && cur.z >= gate.z)) return false;
  const k = (gate.z - prev.z) / (cur.z - prev.z);
  const x = prev.x + (cur.x - prev.x) * k;
  return x >= gate.x0 && x <= gate.x1;
}
