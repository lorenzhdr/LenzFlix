// LENZ LIVE Zeitplan: Serien-Sichten (nur Folgen mit addedAt < Stichtag) und Folgen-Zeiger („Durchlauf“-Regel).
import { admitDay, GRID, MIN, wallToUtc } from './time.js';
import { lowerMedian } from './catalog.js';

export function createSeriesTools() {
  const views = new Map();
  const starts = new Map();
  const walks = new Map();

  /** Sendetagsbeginn (ms) mit Cache. */
  const dayStart = (d) => { let v = starts.get(d); if (v === undefined) starts.set(d, (v = wallToUtc(d, 300))); return v; };

  /**
   * Sicht auf eine Serie zum Stichtag `cut` (= dayStart(D)); null, wenn die Serie dann nicht im Pool ist.
   * { s, n, eps (kanonisch, nur verfügbare), medianMs, p90Ms, age (strengste Freigabe), b (Folgen je Auftritt 1|2),
   *   aufMs (Auftrittslänge), slotLen (feste Sendeplatzlänge, Sender 3), totalMs, admit (erster Sendetag im Pool) }
   */
  function view(s, cut) {
    if (s.addedAt >= cut) return null;
    const a = s.epAddedSorted;
    let lo = 0;
    let hi = a.length;
    while (lo < hi) { const m = (lo + hi) >>> 1; if (a[m] < cut) lo = m + 1; else hi = m; }
    if (!lo) return null;
    const key = s.id + '|' + lo;
    let v = views.get(key);
    if (v) return v;
    const eps = s.eps.filter((e) => e.addedAt < cut);
    const durs = eps.map((e) => e.durMs).sort((x, y) => x - y);
    const n = durs.length;
    const medianMs = lowerMedian(durs);
    const p90Ms = durs[Math.ceil((9 * n) / 10) - 1];
    let age = s.age;
    let totalMs = 0;
    for (const e of eps) { if (e.age != null && (age == null || e.age > age)) age = e.age; totalMs += e.durMs; }
    const b = Math.min(n, medianMs <= 30 * MIN ? 2 : 1);
    v = Object.freeze({
      s, n, eps, medianMs, p90Ms, age, b, aufMs: b * medianMs,
      slotLen: Math.ceil((p90Ms * b) / GRID) * GRID, totalMs, admit: admitDay(Math.max(s.addedAt, s.firstEpAdded)),
    });
    views.set(key, v);
    return v;
  }

  /**
   * Folgen des Auftritts k (b Folgen). Zeiger-Simulation: bei Auftritt k (Verfügbarkeitstag dayOfK(k)) wird je Folge die
   * nächste verfügbare ab dem Zeiger gesendet; gibt es keine mehr, endet der Durchlauf (Zeiger zurück auf 0).
   * wkey muss alle Parameter von dayOfK/b eindeutig kodieren.
   */
  function block(s, wkey, k, b, dayOfK) {
    let w = walks.get(wkey);
    if (!w) walks.set(wkey, (w = { next: 0, cursor: 0, blocks: [] }));
    const eps = s.eps;
    while (w.next <= k) {
      const cutK = dayStart(dayOfK(w.next));
      const picks = [];
      for (let i = 0; i < b; i++) {
        let j = -1;
        for (let pass = 0; pass < 2 && j < 0; pass++) {
          for (let x = w.cursor; x < eps.length; x++) if (eps[x].addedAt < cutK) { j = x; break; }
          if (j < 0) w.cursor = 0;
        }
        if (j >= 0) { w.cursor = j + 1; picks.push(j); }
      }
      w.blocks.push(picks);
      w.next++;
    }
    const seen = new Set();
    const out = [];
    for (const j of w.blocks[k]) if (!seen.has(j)) { seen.add(j); out.push(eps[j]); }
    return out;
  }

  return { dayStart, view, block };
}
