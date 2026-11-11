// LENZ LIVE Zeitplan: öffentliche API (siehe docs/live.md „Zeitplan“). Rein, deterministisch, ohne DOM/Netzwerk.
//
// Spezialsender 17/18 (C7): `premiere.js` / `themeday.js` rufen beim Import `registerSpecial(17|18, impl)` auf (specials.js).
// Verdrahtung: in DIESER Datei die Zeilen `import './premiere.js'; import './themeday.js';` ergänzen (bzw. der Aufrufer importiert sie
// vor createScheduler). Alternativ pro Scheduler: createScheduler(catalog, { specials: { 17: impl, 18: impl } }).
import { broadcastDayOf, dayBounds } from './time.js';
import { createContext } from './plan.js';
import { getSpecial } from './specials.js';
import { closedownDay } from './fill.js';
import './premiere.js';
import './themeday.js';

export { offsetMs, wallToUtc, dayBounds, broadcastDayOf, dayOfDate, formatClock, formatDay } from './time.js';
export { ratingAge } from './rating.js';
export { normalizeCatalog } from './catalog.js';
export { registerSpecial, unregisterSpecial, getSpecial } from './specials.js';
export { createDayBuilder, fillSegment, packSubset, closedownDay, slotOf, ageAllowed } from './fill.js';
export { bucketCount, makeEntries, bucket, rotation, rotationWithBorrow, streamOfAge, CAP_MS } from './pool.js';
export { fnv1a, fmix32, bitrev32, mulberry32, keyHash } from './hash.js';

const LOOKAHEAD_DAYS = 3;

function validPlan(list, b) {
  if (!Array.isArray(list) || !list.length || list[0].start !== b.start || list[list.length - 1].end !== b.end) return false;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    if (!(e.end > e.start) || (i && e.start !== list[i - 1].end)) return false;
  }
  return true;
}

/**
 * createScheduler(catalog, { channelConfig, getBoxSetItems, now, specials }) → Scheduler
 * Zusätzliche Optionen (nicht im Vertrag): now() → ms für channels() ohne Argument (Standard Date.now);
 * specials { 17: impl, 18: impl } überschreibt die globale Registry (Tests).
 */
export function createScheduler(catalog, opts = {}) {
  const { ctx, channels, planBuiltin } = createContext(catalog, opts);
  const now = opts.now || (() => Date.now());
  const memo = new Map();
  const specialFor = (no) => (opts.specials && opts.specials[no]) || getSpecial(no);

  function planDay(no, D) {
    no = Number(no);
    if (!Number.isInteger(no) || no < 1 || no > 18 || !Number.isInteger(D)) throw new RangeError('planDay: ungültiger Sender oder Tag');
    const key = no + '|' + D;
    let p = memo.get(key);
    if (p) return p;
    const b = dayBounds(D);
    if (no >= 17) {
      const sp = specialFor(no);
      let list = null;
      if (sp && typeof sp.planDay === 'function') list = sp.planDay(ctx, D);
      p = validPlan(list, b) ? Object.freeze(list.map((e) => Object.freeze({ ...e }))) : closedownDay(D, 'empty');
    } else p = planBuiltin(no, D);
    memo.set(key, p);
    return p;
  }

  function nowOn(no, t) {
    const D = broadcastDayOf(t);
    const list = planDay(no, D);
    let lo = 0;
    let hi = list.length - 1;
    while (lo < hi) { const m = (lo + hi + 1) >>> 1; if (list[m].start <= t) lo = m; else hi = m - 1; }
    const entry = list[lo];
    return { entry, offsetMs: t - entry.start, D };
  }

  /** Aktueller Eintrag plus die n folgenden Sendungen (type program | fill | nightfill; filler/closedown übersprungen), höchstens 3 Tage voraus. */
  function upcoming(no, t, n) {
    const { entry, D } = nowOn(no, t);
    const out = [entry];
    let list = planDay(no, D);
    let i = list.indexOf(entry) + 1;
    let day = D;
    while (out.length <= n) {
      if (i >= list.length) {
        day++;
        if (day > D + LOOKAHEAD_DAYS) break;
        list = planDay(no, day);
        i = 0;
        continue;
      }
      const e = list[i++];
      if (e.type === 'program' || e.type === 'fill' || e.type === 'nightfill') out.push(e);
    }
    return out;
  }

  return {
    channels: (D) => channels(Number.isInteger(D) ? D : broadcastDayOf(now())),
    prepare: async (Ds) => {
      const days = Array.isArray(Ds) ? Ds : [];
      const jobs = [];
      for (const no of [17, 18]) {
        const sp = specialFor(no);
        if (sp && typeof sp.prepare === 'function') jobs.push(sp.prepare(ctx, days));
      }
      await Promise.all(jobs);
    },
    planDay,
    nowOn,
    upcoming,
    item: (id) => catalog.items.get(String(id)) || null,
    genres: () => catalog.genres.map((g) => ({ label: g.label, count: g.count })),
  };
}
