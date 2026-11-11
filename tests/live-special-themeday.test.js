// LENZ LIVE Zeitplan: Sender 18 „LIVE Thementag“ (Arten, Wochenpermutation, Reihenfolge, Jugendschutz, prepare).
import { describe, it, expect } from 'vitest';
import { normalizeCatalog, createScheduler, dayOfDate, dayBounds, mulberry32, fnv1a } from '../src/js/live/schedule/index.js';

const MIN = 6e8;
const iso = (D, h = 12) => new Date(D * 864e5 + h * 36e5).toISOString();
const D0 = dayOfDate(2026, 10, 11); // Mi
const OLD = D0 - 60;
const days = (from, n) => Array.from({ length: n }, (_, i) => from + i);

const mv = (id, year, min, rating = 'G', extra = {}) => ({ Id: id, Name: id, RunTimeTicks: min * MIN, Genres: ['Drama'], OfficialRating: rating, ProductionYear: year, DateCreated: iso(OLD), ...extra });
const empty = () => ({ movies: [], series: [], episodes: [], boxsets: [], loadedAt: 0 });
/** Kurze Füllfilme (keine Art wird dadurch verfügbar: Jahr 2020, 5 x 30 min). */
function shorts(raw) { for (let i = 0; i < 5; i++) raw.movies.push(mv('sh' + i, 2020, 30)); }
const kindOf = (name) => (/^Filmreihe: /.test(name) ? 'boxset' : /^Die \d+er$/.test(name) ? 'decade' : name === 'Pilotfolgen-Tag' ? 'pilot' : name === 'Überlänge' ? 'overlength' : '?');
const themesOf = (L) => { const out = []; for (const e of L) if (e.theme && !out.includes(e.theme)) out.push(e.theme); return out; };

function rich() {
  const raw = empty();
  shorts(raw);
  for (let i = 0; i < 8; i++) raw.movies.push(mv('d80_' + i, 1980 + i, 100)); // Jahrzehnt 80er, > 6 h
  for (let i = 0; i < 8; i++) raw.movies.push(mv('d00_' + i, 2000 + i, 100, i % 4 === 3 ? 'R' : 'G')); // 2000er
  for (let i = 0; i < 4; i++) raw.movies.push(mv('ov' + i, 1995, 160, i === 3 ? 'NC-17' : 'PG'));
  for (let i = 0; i < 6; i++) raw.movies.push(mv('bx' + i, 1970 + i, 95));
  for (let s = 0; s < 5; s++) {
    raw.series.push({ Id: 'sr' + s, Name: 'Serie ' + s, Genres: ['Krimi'], OfficialRating: 'PG', ProductionYear: 2012, DateCreated: iso(OLD) });
    for (let e = 0; e < 4; e++) raw.episodes.push({ Id: `sr${s}e${e}`, SeriesId: 'sr' + s, ParentIndexNumber: 1, IndexNumber: e + 1, RunTimeTicks: 25 * MIN, DateCreated: iso(OLD) });
  }
  raw.boxsets.push({ Id: 'bs1', Name: 'Reihe Eins', ChildCount: 3 }, { Id: 'bs2', Name: 'Reihe Zwei', ChildCount: 3 });
  return raw;
}
const stub = (map, calls = []) => async (id) => {
  calls.push(id);
  const v = map[id];
  if (v instanceof Error) throw v;
  return v || [];
};
const BOX = { bs1: ['bx0', 'bx1', 'bx2'], bs2: ['bx3', 'bx4', 'bx5'] };

function checkPlan(sch, L, D) {
  const b = dayBounds(D);
  expect(L[0].start).toBe(b.start);
  expect(L[L.length - 1].end).toBe(b.end);
  const ids = new Set();
  L.forEach((e, i) => {
    if (i) expect(e.start).toBe(L[i - 1].end);
    expect(e.end).toBeGreaterThan(e.start);
    if (e.type !== 'filler') expect((e.start - b.start) % 3e5).toBe(0);
    if (e.itemId) {
      expect(ids.has(e.itemId)).toBe(false);
      ids.add(e.itemId);
      const it = sch.item(e.itemId);
      expect(e.end - e.start).toBe(it.durMs);
      if (it.age >= 16) expect(e.start).toBeGreaterThanOrEqual(b.a2200);
      if (it.age === 18) expect(e.start).toBeGreaterThanOrEqual(b.a2300);
    }
  });
}

describe('Thementag (18)', () => {
  it('Wochenpermutation: nie dieselbe Art an aufeinanderfolgenden Tagen einer Woche; alle Arten kommen vor', async () => {
    const sch = createScheduler(normalizeCatalog(rich()), { getBoxSetItems: stub(BOX) });
    const Ds = days(D0, 28);
    await sch.prepare(Ds);
    const kinds = new Map();
    for (const D of Ds) {
      const L = sch.planDay(18, D);
      checkPlan(sch, L, D);
      const th = themesOf(L);
      expect(th.length, 'Tag ' + D).toBeGreaterThan(0);
      kinds.set(D, kindOf(th[0]));
    }
    const wk = (D) => Math.floor((D + 3) / 7);
    for (const D of Ds.slice(1)) if (wk(D) === wk(D - 1)) expect(kinds.get(D), 'Tag ' + D).not.toBe(kinds.get(D - 1));
    expect(new Set(kinds.values())).toEqual(new Set(['boxset', 'decade', 'pilot', 'overlength']));
  });

  it('Filmreihe in chronologischer Reihenfolge, Jugendschutz gewinnt', async () => {
    const raw = empty();
    shorts(raw);
    raw.movies.push(mv('r1', 1950, 100), mv('r2', 1960, 100, 'NC-17'), mv('r3', 1970, 100), mv('r4', 1980, 100, 'R'));
    raw.boxsets.push({ Id: 'bsx', Name: 'Meine Reihe', ChildCount: 4 });
    const sch = createScheduler(normalizeCatalog(raw), { getBoxSetItems: stub({ bsx: ['r4', 'r2', 'r3', 'r1'] }) });
    await sch.prepare(days(D0, 7));
    for (const D of days(D0, 7)) {
      const L = sch.planDay(18, D);
      checkPlan(sch, L, D);
      const b = dayBounds(D);
      const at = (id) => L.find((e) => e.itemId === id);
      expect(themesOf(L)).toEqual(['Filmreihe: Meine Reihe']);
      // A-Titel in Reihenfolge, davor nie B-Titel
      expect(at('r1').start).toBeLessThan(at('r3').start);
      // Jugendschutz: 16 ab 22:00, 18 ab 23:00; chronologisch innerhalb des Stroms (r4 = 16 vor r2 = 18 wäre falsch: r2 ist älter, aber erst ab 23:00)
      expect(at('r4').start).toBeGreaterThanOrEqual(b.a2200);
      expect(at('r2').start).toBeGreaterThanOrEqual(b.a2300);
      expect(at('r4').start).toBeLessThan(at('r2').start);
      expect(at('r3').start).toBeLessThan(b.a2200);
    }
  });

  it('Zweites Thema bei wenig Material (Filmreihe + Überlänge), danach Füllung', async () => {
    const raw = empty();
    shorts(raw);
    for (let i = 0; i < 3; i++) raw.movies.push(mv('s' + i, 1990 + i, 100)); // Filmreihe 5 h
    for (let i = 0; i < 2; i++) raw.movies.push(mv('l' + i, 1970 + i, 160)); // Überlänge 5,3 h
    raw.boxsets.push({ Id: 'bsy', Name: 'Kurz', ChildCount: 3 });
    const sch = createScheduler(normalizeCatalog(raw), { getBoxSetItems: stub({ bsy: ['s0', 's1', 's2'] }) });
    const Ds = days(D0, 14);
    await sch.prepare(Ds);
    for (const D of Ds) {
      const L = sch.planDay(18, D);
      checkPlan(sch, L, D);
      const th = themesOf(L);
      expect(th.slice().sort(), 'Tag ' + D).toEqual(['Filmreihe: Kurz', 'Überlänge']);
      expect(L[L.length - 1].type === 'nightfill' || L[L.length - 1].type === 'filler' || L[L.length - 1].type === 'closedown').toBe(true);
    }
  });

  it('Jahrzehnt: Name und Mindestmaterial; Pilotfolgen und Überlänge', () => {
    const sch = createScheduler(normalizeCatalog(rich()));
    const names = new Set();
    for (const D of days(D0, 70)) for (const n of themesOf(sch.planDay(18, D))) names.add(n);
    expect(names.has('Die 80er')).toBe(true);
    expect(names.has('Die 2000er')).toBe(true);
    expect(names.has('Pilotfolgen-Tag')).toBe(true);
    expect(names.has('Überlänge')).toBe(true);
    expect([...names].some((n) => /^Filmreihe/.test(n))).toBe(false); // ohne prepare keine Sammlungen
    // Pilotfolgen: S1E1 verschiedener Serien
    for (const D of days(D0, 70)) {
      const L = sch.planDay(18, D);
      if (themesOf(L)[0] === 'Pilotfolgen-Tag') {
        const ids = L.filter((e) => e.theme === 'Pilotfolgen-Tag').map((e) => e.itemId);
        expect(ids.length).toBeGreaterThanOrEqual(3);
        for (const id of ids) expect(/^sr\de0$/.test(id)).toBe(true);
      }
    }
  });

  it('Determinismus: andere Eingabereihenfolge -> gleiche Pläne', async () => {
    const raw = rich();
    const rnd = mulberry32(5);
    const shuffle = (a) => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
    const sh = { ...raw, movies: shuffle(raw.movies), series: shuffle(raw.series), episodes: shuffle(raw.episodes), boxsets: shuffle(raw.boxsets) };
    const Ds = days(D0, 14);
    const dig = async (r, map) => {
      const sch = createScheduler(normalizeCatalog(r), { getBoxSetItems: stub(map) });
      await sch.prepare(Ds);
      let s = '';
      for (const D of Ds) for (const e of sch.planDay(18, D)) s += e.start + ':' + e.type + ':' + (e.itemId || '') + ':' + (e.theme || '') + ';';
      return fnv1a(s) + '/' + s.length;
    };
    const rev = { bs1: BOX.bs1.slice().reverse(), bs2: BOX.bs2.slice().reverse() };
    expect(await dig(sh, rev)).toBe(await dig(raw, BOX));
  });

  it('prepare: Fehler und zu kleine Sammlungen werden übersprungen, Cache vermeidet Doppelladen', async () => {
    const raw = rich();
    raw.boxsets.push({ Id: 'bs0', Name: 'Kaputt', ChildCount: 5 }, { Id: 'bs3', Name: 'Klein', ChildCount: 2 });
    const calls = [];
    const map = { ...BOX, bs0: new Error('Netz'), bs3: ['bx0'] };
    const sch = createScheduler(normalizeCatalog(raw), { getBoxSetItems: stub(map, calls) });
    const Ds = days(D0, 14);
    await expect(sch.prepare(Ds)).resolves.toBeUndefined();
    const n = calls.length;
    expect(n).toBeGreaterThan(0);
    await sch.prepare(Ds);
    expect(calls.length).toBe(n); // alles im Cache
    expect(new Set(calls).size).toBe(calls.length); // nie doppelt geladen
    const seen = new Set();
    for (const D of Ds) {
      const L = sch.planDay(18, D);
      checkPlan(sch, L, D);
      for (const t of themesOf(L)) if (kindOf(t) === 'boxset') seen.add(t);
    }
    expect(seen.size).toBeGreaterThan(0);
    expect(seen.has('Filmreihe: Kaputt')).toBe(false);
    expect(seen.has('Filmreihe: Klein')).toBe(false);
    for (const t of seen) expect(['Filmreihe: Reihe Eins', 'Filmreihe: Reihe Zwei']).toContain(t);
  });

  it('ohne prepare: Ausweich-Plan ohne Sammlungs-Thema, weiterhin gültig', () => {
    const raw = empty();
    shorts(raw);
    raw.movies.push(mv('q1', 1990, 100), mv('q2', 1991, 100), mv('q3', 1992, 100));
    raw.boxsets.push({ Id: 'bsq', Name: 'Nur Reihe', ChildCount: 3 });
    const sch = createScheduler(normalizeCatalog(raw), { getBoxSetItems: stub({ bsq: ['q1', 'q2', 'q3'] }) });
    for (const D of days(D0, 3)) {
      const L = sch.planDay(18, D);
      checkPlan(sch, L, D);
      expect(L.some((e) => e.theme)).toBe(false);
    }
  });

  it('Invarianten über 60 Tage (mit prepare): lückenlos, Raster, Jugendschutz, keine Doppelten', async () => {
    const sch = createScheduler(normalizeCatalog(rich()), { getBoxSetItems: stub(BOX) });
    const Ds = days(D0, 60);
    await sch.prepare(Ds);
    let withTheme = 0;
    for (const D of Ds) {
      const L = sch.planDay(18, D);
      checkPlan(sch, L, D);
      if (L.some((e) => e.theme)) withTheme++;
    }
    expect(withTheme).toBe(60);
  });
});
