// VIDEOTHEK LENZ · LENZ PALAST: Sitzplätze im Netz (rein: kein three, kein DOM). Sitz-IDs aus plan.js sind breitenabhängig und gehen nie
// über die Leitung (Vertrag lfx-mp.1 §6.1): Auf der Leitung steht `se:[Reihe 0..5, Anteil 0..1000 über die Reihenbreite]`.
//   encodeSeat(table, seatId) → [row, frac] | null          Sender: eigener Sitz → se (Provider cinema2d.seated/seatId)
//   createSeatNet(seats) → { sit(c, se), stand(c), seatOf(c), setOwn(id|null), has(c), taken(), clear(), count() }
// Empfänger: der nächste freie eigene Sitz in der Reihe (sonst in der nächsten Reihe) am Anteil; der eigene Sitz zählt als belegt.
// seats: [{ id, row, x, z, y?, base?, yaw }] (plan.seats). Rückgabe von sit(): { id, x, y (Boden unter dem Sitz), z, yaw }.
import { SEAT } from './plan.js';

const num = (v, d = 0) => (Number.isFinite(v) ? v : d);

/** Sitztabelle: Sitze je Reihe nach x sortiert. */
export function buildSeatTable(seats) {
  const rows = new Map();
  const byId = new Map();
  for (const s of Array.isArray(seats) ? seats : []) {
    if (!s || !Number.isFinite(s.x) || !Number.isFinite(s.z)) continue;
    const row = Number.isInteger(s.row) ? s.row : 0;
    const base = Number.isFinite(s.base) ? s.base : num(s.y, SEAT.eye) - SEAT.eye;
    const e = { id: s.id, row, x: s.x, z: s.z, y: base, yaw: num(s.yaw, Math.PI), frac: 500 };
    if (!rows.has(row)) rows.set(row, []);
    rows.get(row).push(e);
    byId.set(e.id, e);
  }
  const order = [...rows.keys()].sort((a, b) => a - b);
  for (const r of order) {
    const list = rows.get(r).sort((a, b) => a.x - b.x);
    const x0 = list[0].x;
    const x1 = list[list.length - 1].x;
    for (const e of list) e.frac = x1 > x0 ? Math.round(((e.x - x0) / (x1 - x0)) * 1000) : 500;
  }
  return { rows, order, byId };
}

/** Eigener Sitz → se [Reihe, Anteil 0..1000] (Reihe auf 0..5 geklemmt) oder null. */
export function encodeSeat(table, seatId) {
  const s = table && table.byId.get(seatId);
  if (!s) return null;
  return [Math.max(0, Math.min(5, s.row)), s.frac];
}

/** Zustand der sitzenden Fremden. */
export function createSeatNet(seats) {
  const table = buildSeatTable(seats);
  const seatOfC = new Map(); // c → Sitz
  let own = null;

  const ownerOf = (id, except) => {
    if (own === id) return -1;
    for (const [c, s] of seatOfC) if (c !== except && s.id === id) return c;
    return null;
  };

  function best(c, row, frac) {
    const cur = seatOfC.get(c) || null;
    const rows = table.order;
    if (!rows.length) return null;
    const want = Number.isFinite(row) ? Math.max(0, Math.min(rows[rows.length - 1], Math.round(row))) : rows[0];
    let pick = null;
    let pickScore = Infinity;
    for (const r of rows) {
      const list = table.rows.get(r);
      for (const s of list) {
        if (ownerOf(s.id, c) !== null) continue;
        const score = Math.abs(r - want) * 10000 + Math.abs(s.frac - frac) - (cur && cur.id === s.id ? 0.5 : 0);
        if (score < pickScore) { pickScore = score; pick = s; }
      }
    }
    return pick;
  }

  return {
    /** Fremden setzen/umsetzen. se = [Reihe, Anteil]; ungültig → null (und freigeben). */
    sit(c, se) {
      if (!Array.isArray(se) || !Number.isFinite(se[0]) || !Number.isFinite(se[1])) { seatOfC.delete(c); return null; }
      const s = best(c, se[0], Math.max(0, Math.min(1000, se[1])));
      if (!s) { seatOfC.delete(c); return null; }
      seatOfC.set(c, s);
      return { id: s.id, x: s.x, y: s.y, z: s.z, yaw: s.yaw };
    },
    stand(c) { seatOfC.delete(c); },
    seatOf(c) { const s = seatOfC.get(c); return s ? { id: s.id, x: s.x, y: s.y, z: s.z, yaw: s.yaw } : null; },
    has: (c) => seatOfC.has(c),
    /** Eigener Sitz (id | null): zählt für Fremde als belegt; ein Fremder auf diesem Sitz weicht beim nächsten sit() aus. */
    setOwn(id) { own = id == null ? null : id; },
    taken() { const t = new Set([...seatOfC.values()].map((s) => s.id)); if (own != null) t.add(own); return t; },
    clear() { seatOfC.clear(); own = null; },
    count: () => seatOfC.size,
    encode: (seatId) => encodeSeat(table, seatId),
    table,
  };
}
