// LENZ LIVE Zeitplan: Sendeplanung (Sender 1-16, 17/18 ohne Spezialisierung), Stabilität, Rotation, Jugendschutz.
import { describe, it, expect } from 'vitest';
import {
  normalizeCatalog, createScheduler, dayOfDate, dayBounds, formatClock, broadcastDayOf, mulberry32, fnv1a,
  bucketCount, makeEntries, streamOfAge, CAP_MS, registerSpecial, unregisterSpecial, getSpecial, createDayBuilder, closedownDay,
} from '../src/js/live/schedule/index.js';

const MIN = 6e8; // Ticks je Minute
// Sender 17/18 ohne Spezialisierung (Premiere/Thementag sind global registriert, siehe live-special-*.test.js)
const CLOSED = { planDay: (ctx, D) => closedownDay(D, 'empty') };
const NO_SPECIALS = { 17: CLOSED, 18: CLOSED };
const D0 = dayOfDate(2026, 10, 11);
const GENRES = ['Action', 'Komödie', 'Drama', 'Horror', 'Thriller', 'Animation', 'Familie', 'Sci-Fi', 'Krimi', 'Abenteuer', 'Fantasy', 'Dokumentation', 'Western', 'Musik'];
const RATINGS = ['G', 'PG', 'FSK-12', 'FSK-16', 'R', 'TV-MA', 'NC-17', '', 'FSK-6'];
const iso = (ms) => new Date(ms).toISOString();

/** Zufalls-Mediathek (deterministisch). */
function makeRaw({ movies = 300, series = 40, epsPer = 20, seed = 1, extra = false } = {}) {
  const rnd = mulberry32(seed);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const base = Date.UTC(2026, 0, 1);
  const out = { movies: [], series: [], episodes: [], boxsets: [], loadedAt: 0 };
  for (let i = 0; i < movies; i++) {
    out.movies.push({
      Id: 'm' + i, Name: 'Film ' + i, RunTimeTicks: (70 + Math.floor(rnd() * 80)) * MIN,
      Genres: [pick(GENRES), ...(rnd() < 0.4 ? [pick(GENRES)] : [])], OfficialRating: pick(RATINGS),
      ProductionYear: 1960 + Math.floor(rnd() * 66), DateCreated: iso(base + Math.floor(rnd() * 280) * 864e5),
    });
  }
  for (let s = 0; s < series; s++) {
    const dur = rnd() < 0.5 ? 22 : 45;
    const added = base + Math.floor(rnd() * 200) * 864e5;
    out.series.push({ Id: 's' + s, Name: 'Serie ' + s, Genres: [pick(GENRES)], OfficialRating: pick(RATINGS), ProductionYear: 2000 + (s % 25), DateCreated: iso(added) });
    for (let e = 0; e < epsPer; e++) {
      out.episodes.push({ Id: `s${s}e${e}`, SeriesId: 's' + s, ParentIndexNumber: 1 + Math.floor(e / 10), IndexNumber: 1 + (e % 10), RunTimeTicks: (dur + Math.floor(rnd() * 5)) * MIN, DateCreated: iso(added + 1000 + e) });
    }
    if (extra) out.episodes.push({ Id: `s${s}x0`, SeriesId: 's' + s, ParentIndexNumber: 0, IndexNumber: 1, RunTimeTicks: 20 * MIN, DateCreated: iso(added + 500) });
  }
  return out;
}

const digest = (sch, Ds, nos = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]) => {
  let s = '';
  for (const D of Ds) for (const no of nos) for (const e of sch.planDay(no, D)) s += no + ':' + e.start + ':' + e.end + ':' + e.type + ':' + (e.itemId || '') + (e.rerun ? 'r' : '') + ';';
  return fnv1a(s) + '/' + s.length;
};
const days = (from, n) => Array.from({ length: n }, (_, i) => from + i);
const sched = (raw, opts = {}) => createScheduler(normalizeCatalog(raw), opts);

describe('Plan: Invarianten', () => {
  const raw = makeRaw({ extra: true });
  const sch = sched(raw, { specials: NO_SPECIALS });
  const plans = {};
  for (const D of days(D0, 60)) for (let no = 1; no <= 18; no++) plans[no + '|' + D] = sch.planDay(no, D);

  it('60 Tage x 18 Sender: lückenlos, Raster, bis dayEnd, kein Titel doppelt, Jugendschutz', () => {
    let programs = 0;
    for (const D of days(D0, 60)) {
      const b = dayBounds(D);
      for (let no = 1; no <= 18; no++) {
        const L = plans[no + '|' + D];
        const where = `Sender ${no}, Tag ${D}`;
        expect(L[0].start, where).toBe(b.start);
        expect(L[L.length - 1].end, where).toBe(b.end);
        const ids = new Set();
        L.forEach((e, i) => {
          if (i) expect(e.start, where).toBe(L[i - 1].end);
          expect(e.end, where).toBeGreaterThan(e.start);
          expect(e.end, where).toBeLessThanOrEqual(b.end);
          if (e.type !== 'filler') expect((e.start - b.start) % 3e5, where + ' ' + formatClock(e.start)).toBe(0);
          if (e.itemId) {
            programs++;
            expect(ids.has(e.itemId), where + ' doppelt ' + e.itemId).toBe(false);
            ids.add(e.itemId);
            const it = sch.item(e.itemId);
            expect(e.end - e.start, where).toBe(it.durMs);
            if (it.age >= 16) expect(e.start, where + ' ab 16').toBeGreaterThanOrEqual(b.a2200);
            if (it.age === 18) expect(e.start, where + ' ab 18').toBeGreaterThanOrEqual(b.a2300);
          }
        });
      }
    }
    expect(programs).toBeGreaterThan(5000);
  });

  it('Pläne sind memoisiert und eingefroren', () => {
    const a = sch.planDay(1, D0);
    expect(sch.planDay(1, D0)).toBe(a);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a[0])).toBe(true);
    expect(() => sch.planDay(0, D0)).toThrow();
    expect(() => sch.planDay(19, D0)).toThrow();
  });

  it('Staffel 0 fehlt in allen Plänen', () => {
    for (const L of Object.values(plans)) for (const e of L) if (e.itemId) expect(/x0$/.test(e.itemId)).toBe(false);
  });

  it('17/18 liefern ohne Spezialisierung genau einen closedown-Eintrag', () => {
    for (const no of [17, 18]) {
      const L = sch.planDay(no, D0);
      expect(L).toHaveLength(1);
      expect(L[0]).toMatchObject({ type: 'closedown', start: dayBounds(D0).start, end: dayBounds(D0).end });
    }
  });

  it('Genre-Sender bilden die 12 größten Genres, größtes zuerst', () => {
    const ch = sch.channels(D0);
    expect(ch).toHaveLength(18);
    expect(ch.slice(0, 4).map((c) => c.name)).toEqual(['LIVE Kino', 'LIVE Klassik', 'LIVE Serie', 'LIVE Marathon']);
    expect(ch[16].name).toBe('LIVE Premiere');
    expect(ch[17].name).toBe('LIVE Thementag');
    const counts = new Map(sch.genres().map((g) => [g.label, g.count]));
    const cs = ch.slice(4, 16).map((c) => counts.get(c.genreLabel));
    for (let i = 1; i < cs.length; i++) expect(cs[i]).toBeLessThanOrEqual(cs[i - 1]);
    expect(ch.slice(4, 16).every((c) => c.kind === 'genre' && c.key.startsWith('genre:'))).toBe(true);
  });

  it('jeder Titel liegt auf genau einem Genre-Sender', () => {
    const where = new Map();
    for (const D of days(D0, 30)) for (let no = 5; no <= 16; no++) for (const e of plans[no + '|' + D]) {
      if (e.type !== 'program') continue;
      const id = e.seriesId || e.itemId;
      if (!where.has(id)) where.set(id, new Set());
      where.get(id).add(no);
    }
    expect(where.size).toBeGreaterThan(100);
    for (const [id, set] of where) expect(set.size, id).toBe(1);
  });
});

describe('Plan: Reproduzierbarkeit und Stabilität', () => {
  const raw = makeRaw();
  const Ds = days(D0, 7);

  it('Snapshot der Fixture (Digest)', () => {
    expect(digest(sched(raw, { specials: NO_SPECIALS }), Ds)).toBe('2756565556/148343');
  });

  it('Eingabereihenfolge ist egal', () => {
    const rnd = mulberry32(7);
    const shuffle = (a) => { const x = a.slice(); for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
    const sh = { ...raw, movies: shuffle(raw.movies), series: shuffle(raw.series), episodes: shuffle(raw.episodes) };
    expect(digest(sched(sh), Ds)).toBe(digest(sched(raw), Ds));
  });

  it('Neuzugang von heute ändert den heutigen Plan nicht, morgen schon', () => {
    const b = dayBounds(D0);
    const add = (t) => {
      const r = makeRaw();
      r.movies.push({ Id: 'neu', Name: 'Neu', RunTimeTicks: 100 * MIN, Genres: ['Action', 'Drama', 'Komödie'], OfficialRating: 'G', ProductionYear: 2026, DateCreated: iso(t) });
      r.series.push({ Id: 'sneu', Name: 'Neu', Genres: ['Drama'], DateCreated: iso(t) });
      for (let e = 0; e < 8; e++) r.episodes.push({ Id: 'sneue' + e, SeriesId: 'sneu', ParentIndexNumber: 1, IndexNumber: e + 1, RunTimeTicks: 25 * MIN, DateCreated: iso(t + e) });
      r.episodes.push({ Id: 's3e99', SeriesId: 's3', ParentIndexNumber: 9, IndexNumber: 1, RunTimeTicks: 30 * MIN, DateCreated: iso(t) });
      return sched(r);
    };
    const base = digest(sched(raw), [D0]);
    expect(digest(add(b.start + 36e5), [D0])).toBe(base);
    expect(digest(add(b.start - 36e5), [D0])).not.toBe(base);
    expect(digest(add(b.start + 36e5), [D0 + 1])).not.toBe(digest(sched(raw), [D0 + 1]));
  });

  it('Löschung eines Films ändert nur Tage seines Eimers (und Leih-Tage)', () => {
    const Dn = days(D0, 96);
    const base = sched(raw);
    const kinoFilm = [...new Set(Dn.flatMap((D) => base.planDay(1, D)).filter((e) => e.type === 'program').map((e) => e.itemId))][5];
    const r = { ...raw, movies: raw.movies.filter((m) => m.Id !== kinoFilm) };
    const after = sched(r);
    const ch = after.channels(D0);
    expect(ch.map((c) => c.name)).toEqual(base.channels(D0).map((c) => c.name)); // Top-12 unverändert
    const changed = Dn.filter((D) => JSON.stringify(base.planDay(1, D)) !== JSON.stringify(after.planDay(1, D)));
    expect(changed.length).toBeGreaterThan(0);
    expect(changed.length).toBeLessThan(Dn.length * 0.4);
    for (const no of [3, 4]) for (const D of Dn.slice(0, 20)) expect(after.planDay(no, D)).toEqual(base.planDay(no, D));
  });
});

describe('Plan: Rotation, Anker, Füller', () => {
  const sch = sched(makeRaw({ movies: 400, series: 30 }));
  const cat = normalizeCatalog(makeRaw({ movies: 400, series: 30 }));

  it('Kino: fast jeder Titel binnen 3 Zyklen, jeder binnen 8', () => {
    const ys = cat.movies.map((m) => m.year).sort((a, b) => a - b);
    const med = ys[Math.floor((ys.length - 1) / 2)];
    const kino = cat.movies.filter((m) => m.year >= med);
    const Cs = {};
    for (const S of ['A', 'B']) Cs[S] = bucketCount(makeEntries('kino', kino.filter((m) => streamOfAge(m.age) === S)).reduce((a, x) => a + x.ms, 0), CAP_MS[S]);
    const first = new Map();
    for (const D of days(D0, 400)) for (const e of sch.planDay(1, D)) if (e.type === 'program' && !first.has(e.itemId)) first.set(e.itemId, D - D0);
    expect(first.size).toBe(kino.length);
    const cycles = [...first].map(([id, d]) => Math.floor(d / Cs[streamOfAge(cat.items.get(id).age)]) + 1);
    expect(cycles.filter((c) => c <= 3).length / cycles.length).toBeGreaterThanOrEqual(0.95);
    expect(Math.max(...cycles)).toBeLessThanOrEqual(8);
  });

  it('Horror-Fixture (70 % ab 16) verhungert nicht', () => {
    const rnd = mulberry32(3);
    const raw = { movies: [], series: [], episodes: [], boxsets: [] };
    for (let i = 0; i < 120; i++) raw.movies.push({ Id: 'h' + i, Name: 'H' + i, RunTimeTicks: (80 + Math.floor(rnd() * 40)) * MIN, Genres: ['Horror'], OfficialRating: i % 10 < 7 ? (i % 2 ? 'R' : 'NC-17') : 'PG', ProductionYear: 1980 + (i % 40), DateCreated: '2026-01-02T00:00:00Z' });
    const s = sched(raw);
    expect(s.channels(D0)[4].name).toBe('LIVE Horror');
    const seen = new Set();
    let bMin = 0;
    let total = 0;
    for (const D of days(D0, 500)) for (const e of s.planDay(5, D)) {
      if (e.type !== 'program') continue;
      seen.add(e.itemId);
      total += e.end - e.start;
      if (e.age >= 16) bMin += e.end - e.start;
    }
    expect(seen.size).toBe(120);
    expect(bMin / total).toBeGreaterThan(0.2);
  });

  it('20:15-Anker auf Film-/Genresendern (nur A-Filme), Füller davor im Mittel <= 10 min', () => {
    for (const no of [1, 2, 5, 6, 7, 8]) {
      let n = 0;
      let gaps = 0;
      const N = 40;
      for (const D of days(D0, N)) {
        const b = dayBounds(D);
        const L = sch.planDay(no, D);
        const i = L.findIndex((e) => e.start === b.a2015);
        expect(i, `Sender ${no} Tag ${D}`).toBeGreaterThanOrEqual(0);
        expect(L[i].type).toBe('program');
        const it = sch.item(L[i].itemId);
        expect(it.kind).toBe('movie');
        expect(it.age == null || it.age <= 12).toBe(true);
        n++;
        const prev = L[i - 1];
        gaps += prev && prev.type !== 'program' ? prev.end - prev.start : 0;
      }
      expect(n).toBe(N);
      expect(gaps / N / 6e4, `Sender ${no}`).toBeLessThanOrEqual(10);
    }
  });

  it('Tagsüber-Füllprogramm nur Strom A ohne „ab 5:00“, Nachtfüllung am Tagesende', () => {
    const rnd = mulberry32(5);
    const raw = { movies: [], series: [{ Id: 'sx', Name: 'X', Genres: ['Drama'], OfficialRating: 'TV-MA', DateCreated: '2026-01-01T00:00:00Z' }, { Id: 'sy', Name: 'Y', Genres: ['Drama'], DateCreated: '2026-01-01T00:00:00Z' }], episodes: [], boxsets: [] };
    for (let i = 0; i < 4; i++) raw.movies.push({ Id: 'f' + i, Name: 'F' + i, RunTimeTicks: (95 + i * 10) * MIN, Genres: ['Action'], OfficialRating: 'PG', ProductionYear: 2000 + i, DateCreated: '2026-01-02T00:00:00Z' });
    for (let e = 0; e < 40; e++) {
      raw.episodes.push({ Id: 'x' + e, SeriesId: 'sx', ParentIndexNumber: 1, IndexNumber: e + 1, RunTimeTicks: (20 + Math.floor(rnd() * 20)) * MIN, DateCreated: '2026-01-02T00:00:00Z' });
      raw.episodes.push({ Id: 'y' + e, SeriesId: 'sy', ParentIndexNumber: 1, IndexNumber: e + 1, RunTimeTicks: (20 + Math.floor(rnd() * 20)) * MIN, DateCreated: '2026-01-02T00:00:00Z' });
    }
    const s = sched(raw);
    let fills = 0;
    let nights = 0;
    for (const D of days(D0, 10)) {
      const b = dayBounds(D);
      const L = s.planDay(5, D);
      let seenNight = false;
      for (const e of L) {
        if (e.type === 'fill') {
          fills++;
          expect(e.label).toBe('Füllprogramm');
          const it = s.item(e.itemId);
          if (e.start < b.a2200) expect(it.age == null || it.age <= 12).toBe(true);
        }
        if (e.type === 'nightfill') {
          nights++;
          seenNight = true;
          expect(e.label).toBe('Füllprogramm – reguläres Programm ab 5:00');
        }
        if (seenNight) expect(['nightfill', 'filler']).toContain(e.type);
      }
      expect(L[L.length - 1].type === 'nightfill' || L[L.length - 1].type === 'filler').toBe(true);
      expect(L.some((e) => e.type === 'program')).toBe(true);
    }
    expect(fills).toBeGreaterThan(0);
    expect(nights).toBeGreaterThan(0);
  });

  it('Pool unter 2 h: ganzer Tag closedown', () => {
    const s = sched({ movies: [{ Id: 'a', Name: 'A', RunTimeTicks: 90 * MIN, Genres: ['X'], DateCreated: '2026-01-01T00:00:00Z' }], series: [], episodes: [] });
    const L = s.planDay(1, D0);
    expect(L).toHaveLength(1);
    expect(L[0]).toMatchObject({ type: 'closedown', reason: 'empty' });
  });
});

describe('Plan: Serien', () => {
  it('Marathon: Folgen in Reihenfolge, lückenlos über die Tage fortgesetzt; angehängte Folge verschiebt nichts', () => {
    const mk = (n, extraAdded) => {
      const raw = { movies: [], series: [{ Id: 'sA', Name: 'A', Genres: ['Drama'], DateCreated: '2026-01-01T00:00:00Z' }, { Id: 'sB', Name: 'B', Genres: ['Drama'], OfficialRating: 'TV-MA', DateCreated: '2026-01-01T00:00:00Z' }], episodes: [], boxsets: [] };
      for (let e = 0; e < n; e++) for (const s of ['sA', 'sB']) raw.episodes.push({ Id: s + String(e).padStart(3, '0'), SeriesId: s, ParentIndexNumber: 1 + Math.floor(e / 20), IndexNumber: 1 + (e % 20), RunTimeTicks: 45 * MIN, DateCreated: '2026-01-02T00:00:00Z' });
      if (extraAdded) raw.episodes.push({ Id: 'sA999', SeriesId: 'sA', ParentIndexNumber: 9, IndexNumber: 1, RunTimeTicks: 45 * MIN, DateCreated: extraAdded });
      return raw;
    };
    const s = sched(mk(100));
    const idx = (e) => Number(e.itemId.slice(2));
    let prevLast = null;
    for (const D of days(D0, 8)) {
      const eps = s.planDay(4, D).filter((e) => e.type === 'program' && e.seriesId === 'sA');
      expect(eps.length).toBeGreaterThan(15);
      for (let i = 1; i < eps.length; i++) expect(idx(eps[i])).toBe((idx(eps[i - 1]) + 1) % 100);
      if (prevLast != null) expect(idx(eps[0])).toBe((prevLast + 1) % 100);
      prevLast = idx(eps[eps.length - 1]);
      const bs = s.planDay(4, D).filter((e) => e.type === 'program' && e.seriesId === 'sB');
      expect(bs.length).toBeGreaterThan(3);
      for (const e of bs) expect(e.start).toBeGreaterThanOrEqual(dayBounds(D).a2200);
    }
    // angehängte Folge (heute hinzugekommen) ändert den heutigen Plan nicht
    const todayAdd = iso(dayBounds(D0).start + 36e5);
    expect(digest(sched(mk(100, todayAdd)), [D0], [4])).toBe(digest(s, [D0], [4]));
  });

  it('Serie (3): feste Sendeplätze, gleiche Wanduhrzeit Mo-So, auch über die Zeitumstellung', () => {
    const raw = { movies: [], series: [], episodes: [], boxsets: [] };
    for (let i = 0; i < 12; i++) {
      raw.series.push({ Id: 's' + i, Name: 'S' + i, Genres: ['Drama'], DateCreated: '2026-01-01T00:00:00Z' });
      const dur = [20, 24, 45, 40][i % 4];
      for (let e = 0; e < 30; e++) raw.episodes.push({ Id: `s${i}e${String(e).padStart(2, '0')}`, SeriesId: 's' + i, ParentIndexNumber: 1, IndexNumber: e + 1, RunTimeTicks: dur * MIN, DateCreated: '2026-01-02T00:00:00Z' });
    }
    const s = sched(raw);
    for (const monday of [dayOfDate(2026, 2, 23), dayOfDate(2026, 9, 19), dayOfDate(2026, 10, 9)]) {
      const times = new Map();
      for (let d = 0; d < 7; d++) {
        const D = monday + d;
        const b = dayBounds(D);
        const firstOf = new Map();
        for (const e of s.planDay(3, D)) if (e.seriesId && !e.rerun && e.start < b.start + 21 * 36e5 && !firstOf.has(e.seriesId)) firstOf.set(e.seriesId, formatClock(e.start));
        for (const [id, c] of firstOf) { if (!times.has(id)) times.set(id, new Set()); times.get(id).add(c); }
      }
      expect(times.size).toBeGreaterThan(4);
      for (const [id, set] of times) expect(set.size, `${id} ${[...set]}`).toBe(1);
      // Folgen rücken täglich weiter
      const ep = (D) => s.planDay(3, D).find((e) => e.seriesId && !e.rerun).itemId;
      expect(ep(monday)).not.toBe(ep(monday + 1));
      // Nacht bis 05:00: Wiederholung
      const last = s.planDay(3, monday + 2).filter((e) => e.type === 'program').pop();
      expect(last.rerun).toBe(true);
    }
  });
});

describe('Plan: Genre-Plätze und Konfiguration', () => {
  const mkRaw = (counts) => {
    const raw = { movies: [], series: [], episodes: [], boxsets: [] };
    for (const [g, n] of counts) for (let i = 0; i < n; i++) raw.movies.push({ Id: `${g}-${i}`, Name: g + i, RunTimeTicks: 100 * MIN, Genres: [g], OfficialRating: 'PG', ProductionYear: 2000, DateCreated: '2026-01-01T00:00:00Z' });
    return raw;
  };
  const base = [['Aaa', 30], ['Bbb', 29], ['Ccc', 20], ['Ddd', 19], ['Eee', 18], ['Fff', 17], ['Ggg', 16], ['Hhh', 15], ['Iii', 14], ['Jjj', 13], ['Kkk', 12], ['Lll', 11], ['Mmm', 10]];

  it('Gleichstand: Code-Unit-Reihenfolge; fast gleich große Genres tauschen nach Neuzugängen (dokumentiertes Verhalten)', () => {
    const tie = base.map(([g, n]) => [g, g === 'Bbb' ? 30 : n]);
    expect(sched(mkRaw(tie)).channels(D0)[4].name).toBe('LIVE Aaa');
    expect(sched(mkRaw(tie)).channels(D0)[5].name).toBe('LIVE Bbb');
    const swapped = base.map(([g, n]) => [g, g === 'Bbb' ? 31 : n]);
    expect(sched(mkRaw(swapped)).channels(D0)[4].name).toBe('LIVE Bbb');
    expect(sched(mkRaw(base)).channels(D0).slice(4, 16).map((c) => c.genreLabel)).toEqual(base.slice(0, 12).map((x) => x[0]));
  });

  it('channelConfig hält die Belegung fest, unbekannte Genres → automatisch', () => {
    const swapped = base.map(([g, n]) => [g, g === 'Bbb' ? 31 : n]);
    const cfg = { 5: 'Aaa', 6: ' BBB ', 7: 'gibtsnicht', 8: 'Mmm' };
    const s = sched(mkRaw(swapped), { channelConfig: cfg });
    const names = s.channels(D0).map((c) => c.name);
    expect(names[4]).toBe('LIVE Aaa');
    expect(names[5]).toBe('LIVE Bbb');
    expect(names[7]).toBe('LIVE Mmm');
    expect(names[6]).toBe('LIVE Ccc'); // unbekannt → nächstes freies Top-Genre
    expect(new Set(names.slice(4, 16)).size).toBe(12);
    expect(sched(mkRaw(swapped), { channelConfig: '5=Aaa;6=Bbb' }).channels(D0)[4].name).toBe('LIVE Aaa');
  });

  it('weniger als 12 Genres: 18 Sender, freie Plätze sind closedown', () => {
    const s = sched(mkRaw([['Aaa', 30], ['Bbb', 20]]));
    const ch = s.channels(D0);
    expect(ch).toHaveLength(18);
    expect(ch[4].name).toBe('LIVE Aaa');
    expect(s.planDay(12, D0)[0].type).toBe('closedown');
  });
});

describe('Scheduler: nowOn / upcoming / item', () => {
  const sch = sched(makeRaw());

  it('nowOn an den Grenzen', () => {
    const b = dayBounds(D0);
    const L = sch.planDay(1, D0);
    for (const e of L.slice(0, 6)) {
      expect(sch.nowOn(1, e.start).entry).toBe(e);
      expect(sch.nowOn(1, e.start).offsetMs).toBe(0);
      expect(sch.nowOn(1, e.end - 1).entry).toBe(e);
      expect(sch.nowOn(1, e.end - 1).offsetMs).toBe(e.end - 1 - e.start);
    }
    expect(sch.nowOn(1, b.start).D).toBe(D0);
    const before = sch.nowOn(1, b.start - 1);
    expect(before.D).toBe(D0 - 1);
    expect(before.entry).toBe(sch.planDay(1, D0 - 1).at(-1));
    expect(sch.nowOn(1, b.end).entry).toBe(sch.planDay(1, D0 + 1)[0]);
    expect(broadcastDayOf(Date.UTC(2026, 10, 11, 3, 59))).toBe(D0 - 1); // 04:59 MEZ
  });

  it('upcoming: aktuelle plus n folgende Sendungen, endet auch bei Testbild-Sendern', () => {
    const b = dayBounds(D0);
    const u = sch.upcoming(1, b.start + 36e5, 3);
    expect(u).toHaveLength(4);
    expect(u[0]).toBe(sch.nowOn(1, b.start + 36e5).entry);
    for (const e of u.slice(1)) expect(['program', 'fill', 'nightfill']).toContain(e.type);
    for (let i = 1; i < u.length; i++) expect(u[i].start).toBeGreaterThanOrEqual(u[i - 1].end);
    expect(sched(makeRaw(), { specials: NO_SPECIALS }).upcoming(17, b.start + 36e5, 5)).toHaveLength(1);
  });

  it('item / genres', () => {
    expect(sch.item('m0')).toMatchObject({ id: 'm0', kind: 'movie' });
    expect(sch.item('s1e1')).toMatchObject({ kind: 'episode', seriesId: 's1' });
    expect(sch.item('nix')).toBeNull();
    const g = sch.genres();
    expect(g[0]).toEqual({ label: expect.any(String), count: expect.any(Number) });
    for (let i = 1; i < g.length; i++) expect(g[i].count).toBeLessThanOrEqual(g[i - 1].count);
  });
});

describe('Andockpunkt für Spezialsender', () => {
  it('registerSpecial: Bausteine aus fill.js, prepare wird awaited, ungültige Pläne fallen auf closedown', async () => {
    const calls = [];
    const impl = {
      prepare: async (ctx, Ds) => { calls.push(Ds); },
      planDay: (ctx, D) => {
        const B = ctx.builder(17, D);
        const m = ctx.catalog.movies[0];
        B.fillUntil(B.bounds.a2015);
        B.place({ itemId: m.id, durMs: m.durMs, premiere: 'film', label: 'Premiere' });
        return B.finish();
      },
    };
    const prev = getSpecial(17); // echte Premiere (global registriert) danach wiederherstellen
    registerSpecial(17, impl);
    try {
      const s = sched(makeRaw());
      await s.prepare([D0, D0 + 1]);
      expect(calls).toEqual([[D0, D0 + 1]]);
      const L = s.planDay(17, D0);
      expect(L.find((e) => e.premiere === 'film').start).toBe(dayBounds(D0).a2015);
      expect(L.at(-1).end).toBe(dayBounds(D0).end);
      const bad = sched(makeRaw(), { specials: { 18: { planDay: () => [{ start: 1, end: 2, type: 'program' }] } } });
      expect(bad.planDay(18, D0)[0].type).toBe('closedown');
    } finally {
      if (prev) registerSpecial(17, prev);
      else unregisterSpecial(17);
    }
    expect(getSpecial(17)).toBe(prev);
    expect(sched(makeRaw(), { specials: NO_SPECIALS }).planDay(17, D0)[0].type).toBe('closedown');
    expect(closedownDay(D0)[0].type).toBe('closedown');
    expect(typeof createDayBuilder).toBe('function');
  });
});

describe('Performance', () => {
  it('2000 Filme + 20000 Folgen: Katalog, Index und 7 Tage x 18 Sender', () => {
    const rnd = mulberry32(11);
    const raw = { movies: [], series: [], episodes: [], boxsets: [] };
    for (let i = 0; i < 2000; i++) raw.movies.push({ Id: 'm' + i, Name: 'F' + i, RunTimeTicks: (70 + Math.floor(rnd() * 80)) * MIN, Genres: [GENRES[i % 14], GENRES[(i * 7) % 14]], OfficialRating: RATINGS[i % 9], ProductionYear: 1950 + (i % 75), DateCreated: iso(Date.UTC(2026, 0, 1) + (i % 300) * 864e5) });
    for (let s = 0; s < 200; s++) {
      raw.series.push({ Id: 's' + s, Name: 'S' + s, Genres: [GENRES[s % 14]], OfficialRating: RATINGS[s % 9], DateCreated: iso(Date.UTC(2026, 0, 1) + (s % 200) * 864e5) });
      for (let e = 0; e < 100; e++) raw.episodes.push({ Id: `s${s}e${e}`, SeriesId: 's' + s, ParentIndexNumber: 1 + Math.floor(e / 20), IndexNumber: 1 + (e % 20), RunTimeTicks: (20 + (e % 30)) * MIN, DateCreated: iso(Date.UTC(2026, 0, 1) + (s % 200) * 864e5 + e) });
    }
    const t0 = performance.now();
    const s = sched(raw);
    for (const D of days(D0, 7)) for (let no = 1; no <= 18; no++) s.planDay(no, D);
    const ms = performance.now() - t0;
    expect(ms).toBeLessThan(1500); // inkl. Premiere und Thementag; lokal ~0,5 s, Puffer für parallele Testläufe
  });
});
