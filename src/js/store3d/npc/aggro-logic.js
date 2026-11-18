// VIDEOTHEK LENZ · Provokations-Gedächtnis des Personals (1.18.0; rein, Zeit in s injiziert): Gabi (Föhn), Ronny (Kleiderbügel),
// Kioskfrau (Bonbons), Popcorn-Personal (Popcorn).
// createAggro(role) → Zustand; provoke(a, t) → 'threat' | 'attack' | 'throw' | null; stepAggro(a, t) → 'swing' (einmal, wenn die Drohung abgelaufen ist) | 'calm' | null.
export const AGGRO = {
  gabi: { item: 'dryer', melee: true, attackOn: 2, threatS: 1.2, memory: 8, cool: 5, dmg: 8, reach: 2.6 },
  ronny: { item: 'hanger', melee: true, attackOn: 1, threatS: 1.0, memory: 8, cool: 5, dmg: 10, reach: 2.6 },
  kiosk: { item: 'candy', melee: false, cool: 3.5, dmg: 4, hold: 1.4 },
  popcorn: { item: 'popcorn', melee: false, cool: 4, dmg: 4, hold: 1.4 },
};

export function createAggro(role) {
  return { role, cfg: AGGRO[role] || AGGRO.kiosk, hits: 0, last: -1e9, readyAt: 0, strikeAt: null, calmAt: null };
}

export function provoke(a, t) {
  const c = a.cfg;
  if (t - a.last > (c.memory || 0)) a.hits = 0;
  a.last = t;
  a.hits++;
  if (!c.melee) {
    if (t < a.readyAt) return null;
    a.readyAt = t + c.cool;
    a.calmAt = t + c.hold;
    return 'throw';
  }
  a.calmAt = t + c.memory;
  if (a.hits >= c.attackOn && t >= a.readyAt) {
    a.strikeAt = t + c.threatS;
    a.readyAt = t + c.cool;
    return 'attack';
  }
  return 'threat';
}

export function stepAggro(a, t) {
  if (a.strikeAt !== null && t >= a.strikeAt) { a.strikeAt = null; return 'swing'; }
  if (a.calmAt !== null && t >= a.calmAt && a.strikeAt === null) { a.calmAt = null; return 'calm'; }
  return null;
}
