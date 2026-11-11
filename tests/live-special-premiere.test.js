// LENZ LIVE Zeitplan: Sender 17 „LIVE Premiere“ (Premieren-Kette, Uhrzeiten, Jugendschutz, Wiederholungen).
import { describe, it, expect } from 'vitest';
import { normalizeCatalog, createScheduler, dayOfDate, dayBounds, mulberry32, fnv1a } from '../src/js/live/schedule/index.js';

const MIN = 6e8;
const iso = (D, h = 12) => new Date(D * 864e5 + h * 36e5).toISOString();
const dNov = (d) => dayOfDate(2026, 10, d);

function film(id, D, { min = 100, rating = 'G', h = 12 } = {}) {
  return { Id: id, Name: id, RunTimeTicks: min * MIN, Genres: ['Drama'], OfficialRating: rating, ProductionYear: 2010, DateCreated: iso(D, h) };
}
/** Altbestand (vor der Epoche): ausreichend Filme und Serien für Wiederholungen und Füllprogramm. */
function base({ films = 60, series = 6 } = {}) {
  const raw = { movies: [], series: [], episodes: [], boxsets: [], loadedAt: 0 };
  const rnd = mulberry32(3);
  for (let i = 0; i < films; i++) raw.movies.push(film('old' + i, dNov(1) - 5 - (i % 20), { min: 80 + Math.floor(rnd() * 60), rating: i % 9 === 0 ? 'R' : 'G' }));
  for (let s = 0; s < series; s++) {
    const D = dNov(1) - 30 - s;
    raw.series.push({ Id: 'os' + s, Name: 'Serie ' + s, Genres: ['Krimi'], OfficialRating: 'PG', ProductionYear: 2005, DateCreated: iso(D) });
    for (let e = 0; e < 12; e++) raw.episodes.push({ Id: `os${s}e${e}`, SeriesId: 'os' + s, ParentIndexNumber: 1, IndexNumber: e + 1, RunTimeTicks: 25 * MIN, DateCreated: iso(D, 12 + (e % 5)) });
  }
  return raw;
}
const sched = (raw) => createScheduler(normalizeCatalog(raw));
const premiereEntries = (L) => L.filter((e) => e.premiere);

describe('Premiere (17)', () => {
  it('genau eine Premiere pro Abend um 20:15, Film am Tag nach dem Zugang', () => {
    const raw = base();
    raw.movies.push(film('p1', dNov(5)), film('p2', dNov(5)));
    const sch = sched(raw);
    const b6 = dayBounds(dNov(6));
    const e6 = premiereEntries(sch.planDay(17, dNov(6)));
    expect(e6).toHaveLength(1);
    expect(e6[0]).toMatchObject({ itemId: 'p1', premiere: 'film', start: b6.a2015 });
    expect(e6[0].rerun).toBeUndefined();
    const b7 = dayBounds(dNov(7));
    const e7 = premiereEntries(sch.planDay(17, dNov(7)));
    expect(e7).toHaveLength(1);
    expect(e7[0]).toMatchObject({ itemId: 'p2', start: b7.a2015 });
    // Danach nur noch als Wiederholung
    const later = sch.planDay(17, dNov(9)).filter((e) => e.itemId === 'p1' || e.itemId === 'p2');
    for (const e of later) expect(e.rerun).toBe(true);
    // Vor der Premiere nie
    for (let D = dNov(1); D <= dNov(5); D++) expect(sch.planDay(17, D).some((e) => e.itemId === 'p1' || e.itemId === 'p2')).toBe(false);
  });

  it('Altersfreigabe 16 -> 22:00, 18 -> 23:00; um 20:15 läuft eine Wiederholung', () => {
    const raw = base();
    raw.movies.push(film('f16', dNov(5), { rating: 'R' }), film('f18', dNov(6), { rating: 'NC-17' }));
    const sch = sched(raw);
    for (const [D, id, at] of [[dNov(6), 'f16', 'a2200'], [dNov(7), 'f18', 'a2300']]) {
      const b = dayBounds(D);
      const L = sch.planDay(17, D);
      const p = L.find((e) => e.itemId === id);
      expect(p.premiere).toBe('film');
      expect(p.start).toBe(b[at]);
      const at2015 = L.find((e) => e.start === b.a2015);
      expect(at2015.itemId).toBeTruthy();
      expect(at2015.rerun).toBe(true);
      expect(at2015.premiere).toBeUndefined();
    }
  });

  it('Folgenblöcke: gleiche Serie, selber Tag, höchstens 2 h, Folgenreihenfolge, Label', () => {
    const raw = base();
    raw.series.push({ Id: 'ns', Name: 'Neu', Genres: ['Drama'], OfficialRating: 'PG', ProductionYear: 2026, DateCreated: iso(dNov(5)) });
    for (let e = 0; e < 8; e++) raw.episodes.push({ Id: 'ns' + e, SeriesId: 'ns', ParentIndexNumber: 1, IndexNumber: e + 1, RunTimeTicks: 25 * MIN, DateCreated: iso(dNov(5), 12) });
    const sch = sched(raw);
    const seen = [];
    for (let D = dNov(6); D <= dNov(12); D++) {
      const b = dayBounds(D);
      const ev = premiereEntries(sch.planDay(17, D));
      if (!ev.length) continue;
      expect(ev[0].start).toBe(b.a2015);
      expect(ev.length).toBeGreaterThanOrEqual(1);
      expect(ev.length).toBeLessThanOrEqual(3);
      expect(ev[ev.length - 1].end - ev[0].start).toBeLessThanOrEqual(2 * 36e5);
      for (const e of ev) { expect(e.premiere).toBe('episode'); expect(e.label).toBe('Neue Folge'); expect(e.seriesId).toBe('ns'); seen.push(e.itemId); }
    }
    expect(seen).toEqual(['ns0', 'ns1', 'ns2', 'ns3', 'ns4', 'ns5', 'ns6', 'ns7']);
  });

  it('Massenimport: 40 Filme an einem Tag -> 15 Premieren an 15 Folgetagen, Rest nie Premiere, unabhängig vom Rechentag', () => {
    const raw = base();
    for (let i = 0; i < 40; i++) raw.movies.push(film('mass' + String(i).padStart(2, '0'), dNov(4), { min: 90 }));
    const days = Array.from({ length: 40 }, (_, i) => dNov(1) + i);
    const run = (order) => {
      const sch = sched(raw);
      const premiereOf = new Map();
      const out = new Map();
      for (const D of order) out.set(D, sch.planDay(17, D));
      for (const D of days) for (const e of out.get(D)) if (e.premiere && e.itemId.startsWith('mass')) {
        expect(premiereOf.has(e.itemId)).toBe(false);
        premiereOf.set(e.itemId, D);
      }
      return { premiereOf, out };
    };
    const a = run(days);
    expect(a.premiereOf.size).toBe(15);
    expect([...a.premiereOf.values()].sort((x, y) => x - y)).toEqual(Array.from({ length: 15 }, (_, i) => dNov(5) + i));
    // erste 15 in (addedAt, id)-Reihenfolge, Rest verworfen
    for (let i = 0; i < 15; i++) expect(a.premiereOf.get('mass' + String(i).padStart(2, '0'))).toBe(dNov(5) + i);
    // rückwärts gerechnet (anderer Rechentag zuerst) -> identische Pläne
    const rev = run(days.slice().reverse());
    const dig = (r) => fnv1a(days.map((D) => r.out.get(D).map((e) => e.start + ':' + e.itemId + ':' + (e.premiere || '') + (e.rerun ? 'r' : '')).join(',')).join('|'));
    expect(dig(rev)).toBe(dig(a));
    // künftige Premieren laufen nie vorher als Wiederholung; verworfene laufen als Wiederholung (später)
    let discardedRerun = 0;
    for (const D of days) for (const e of a.out.get(D)) {
      if (!e.itemId || !e.itemId.startsWith('mass')) continue;
      const pd = a.premiereOf.get(e.itemId);
      if (pd == null) { expect(e.premiere).toBeUndefined(); expect(e.rerun).toBe(true); discardedRerun++; } else if (!e.premiere) { expect(D).toBeGreaterThan(pd); expect(e.rerun).toBe(true); }
      expect(D).toBeGreaterThan(dNov(4));
      if (pd != null && D < pd) throw new Error('vor der Premiere gelaufen');
    }
    expect(discardedRerun).toBeGreaterThan(0);
  });

  it('Fenster-Verlängerung: wenig Neues -> ältere Titel kommen dazu; viel Neues -> nur das Neue', () => {
    // Nur alter Bestand (> 30 Tage alt) -> Fenster wächst, Plan ist trotzdem gefüllt
    const old = { movies: [], series: [], episodes: [], boxsets: [] };
    for (let i = 0; i < 40; i++) old.movies.push(film('o' + i, dNov(11) - 100 - i, { min: 100 }));
    const L = sched(old).planDay(17, dNov(11));
    const progs = L.filter((e) => e.type === 'program');
    expect(progs.length).toBeGreaterThan(8);
    expect(progs.every((e) => e.rerun)).toBe(true);
    // Viel Neues (≥ 24 h in den letzten 30 Tagen) -> keine Titel älter als 30 Tage
    const rich = { movies: [], series: [], episodes: [], boxsets: [] };
    for (let i = 0; i < 30; i++) rich.movies.push(film('n' + i, dNov(11) - 2 - (i % 20), { min: 100 }));
    for (let i = 0; i < 10; i++) rich.movies.push(film('x' + i, dNov(11) - 200 - i, { min: 100 }));
    const L2 = sched(rich).planDay(17, dNov(11));
    expect(L2.some((e) => e.itemId && e.itemId.startsWith('n'))).toBe(true);
    expect(L2.some((e) => e.itemId && e.itemId.startsWith('x') && e.type === 'program')).toBe(false);
  });

  it('Invarianten: lückenlos, Raster, Jugendschutz, keine Doppelten (30 Tage, gemischt)', () => {
    const raw = base();
    raw.movies.push(film('a1', dNov(3)), film('a2', dNov(3), { rating: 'R' }), film('a3', dNov(4), { rating: 'NC-17' }), film('a4', dNov(4)), film('a5', dNov(9), { rating: 'R' }));
    raw.series.push({ Id: 'ns', Name: 'Neu', Genres: ['Drama'], OfficialRating: 'TV-MA', ProductionYear: 2026, DateCreated: iso(dNov(8)) });
    for (let e = 0; e < 5; e++) raw.episodes.push({ Id: 'ns' + e, SeriesId: 'ns', ParentIndexNumber: 1, IndexNumber: e + 1, RunTimeTicks: 45 * MIN, DateCreated: iso(dNov(8), 12) });
    const sch = sched(raw);
    let premieres = 0;
    for (let D = dNov(1); D < dNov(1) + 30; D++) {
      const b = dayBounds(D);
      const L = sch.planDay(17, D);
      expect(L[0].start).toBe(b.start);
      expect(L[L.length - 1].end).toBe(b.end);
      const ids = new Set();
      L.forEach((e, i) => {
        if (i) expect(e.start).toBe(L[i - 1].end);
        if (e.type !== 'filler') expect((e.start - b.start) % 3e5).toBe(0);
        if (e.itemId) {
          expect(ids.has(e.itemId)).toBe(false);
          ids.add(e.itemId);
          const it = sch.item(e.itemId);
          expect(e.end - e.start).toBe(it.durMs);
          if (it.age >= 16) expect(e.start).toBeGreaterThanOrEqual(b.a2200);
          if (it.age === 18) expect(e.start).toBeGreaterThanOrEqual(b.a2300);
          if (e.premiere) premieres++;
        }
      });
    }
    expect(premieres).toBeGreaterThan(5);
  });
});
