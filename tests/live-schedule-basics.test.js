// LENZ LIVE Zeitplan: Zeit, Hash, Freigabe, Katalog-Normalisierung, Eimer-Primitive.
/* global process */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import {
  offsetMs, wallToUtc, dayBounds, broadcastDayOf, dayOfDate, formatClock, formatDay, ratingAge, normalizeCatalog,
  fnv1a, fmix32, bitrev32, mulberry32, keyHash, bucketCount, makeEntries, bucket, rotation, packSubset,
} from '../src/js/live/schedule/index.js';

const SCHED_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'js', 'live', 'schedule');

describe('Zeit', () => {
  it('offsetMs an den Umstellungsgrenzen', () => {
    expect(offsetMs(Date.UTC(2026, 2, 29, 0, 59, 59))).toBe(36e5);
    expect(offsetMs(Date.UTC(2026, 2, 29, 1, 0, 0))).toBe(72e5);
    expect(offsetMs(Date.UTC(2026, 9, 25, 0, 59, 59))).toBe(72e5);
    expect(offsetMs(Date.UTC(2026, 9, 25, 1, 0, 0))).toBe(36e5);
    expect(offsetMs(Date.UTC(2026, 0, 15))).toBe(36e5);
    expect(offsetMs(Date.UTC(2026, 6, 15))).toBe(72e5);
  });

  it('Sendetage der Umstellung dauern 23 h bzw. 25 h', () => {
    const len = (y, m, d) => { const b = dayBounds(dayOfDate(y, m, d)); return (b.end - b.start) / 36e5; };
    expect(len(2026, 2, 28)).toBe(23);
    expect(len(2026, 9, 24)).toBe(25);
    expect(len(2026, 5, 10)).toBe(24);
    expect(len(2026, 0, 10)).toBe(24);
  });

  it('dayBounds: Anker liegen im Raster ab dayStart', () => {
    for (const D of [dayOfDate(2026, 2, 28), dayOfDate(2026, 9, 24), dayOfDate(2026, 10, 11)]) {
      const b = dayBounds(D);
      expect(formatClock(b.start)).toBe('05:00');
      expect(formatClock(b.a2015)).toBe('20:15');
      expect(formatClock(b.a2200)).toBe('22:00');
      expect(formatClock(b.a2300)).toBe('23:00');
      expect(formatClock(b.end)).toBe('05:00');
      for (const k of ['a2015', 'a2200', 'a2300', 'end']) expect((b[k] - b.start) % 3e5).toBe(0);
    }
  });

  it('wallToUtc ist rund um die Umstellung eindeutig', () => {
    const D = dayOfDate(2026, 2, 29);
    expect(wallToUtc(D, 300)).toBe(Date.UTC(2026, 2, 29, 3, 0)); // 05:00 MESZ
    expect(wallToUtc(D - 1, 1320)).toBe(Date.UTC(2026, 2, 28, 21, 0)); // 22:00 MEZ
  });

  it('broadcastDayOf: 04:59 gehört zum Vortag, 05:00 zum Tag', () => {
    const D = dayOfDate(2026, 10, 11);
    const b = dayBounds(D);
    expect(broadcastDayOf(b.start)).toBe(D);
    expect(broadcastDayOf(b.start - 1)).toBe(D - 1);
    expect(broadcastDayOf(b.end - 1)).toBe(D);
    expect(broadcastDayOf(b.end)).toBe(D + 1);
    // Umstellungstag
    const S = dayOfDate(2026, 2, 29);
    expect(broadcastDayOf(Date.UTC(2026, 2, 29, 2, 59))).toBe(S - 1); // 04:59 MESZ
    expect(broadcastDayOf(Date.UTC(2026, 2, 29, 3, 0))).toBe(S);
  });

  it('formatClock und formatDay (ohne Intl)', () => {
    expect(formatClock(Date.UTC(2026, 10, 11, 19, 15))).toBe('20:15');
    expect(formatClock(Date.UTC(2026, 6, 1, 22, 30))).toBe('00:30');
    expect(formatDay(dayOfDate(2026, 10, 11))).toEqual({ weekday: 'Mi', long: 'Mittwoch', date: '11.11.' });
    expect(formatDay(dayOfDate(2026, 0, 4))).toEqual({ weekday: 'So', long: 'Sonntag', date: '04.01.' });
    expect(formatDay(dayOfDate(2026, 0, 5)).weekday).toBe('Mo');
    expect(formatDay(dayOfDate(1969, 11, 31)).weekday).toBe('Mi');
  });

  it('dayOfDate ist ganzzahlig (Monat 0-basiert wie Date.UTC)', () => {
    expect(dayOfDate(1970, 0, 1)).toBe(0);
    expect(Number.isInteger(dayOfDate(2026, 10, 11))).toBe(true);
    expect(dayOfDate(2026, 10, 12) - dayOfDate(2026, 10, 11)).toBe(1);
  });
});

describe('Hash', () => {
  const ref = (s) => { let h = 0x811c9dc5n; for (let i = 0; i < s.length; i++) { h ^= BigInt(s.charCodeAt(i)); h = (h * 16777619n) & 0xffffffffn; } return Number(h); };

  it('FNV-1a Testvektoren', () => {
    expect(fnv1a('')).toBe(0x811c9dc5);
    expect(fnv1a('a')).toBe(0xe40c292c);
    expect(fnv1a('foobar')).toBe(0xbf9cf968);
  });

  it('FNV-1a über UTF-16-Code-Units (Nicht-ASCII, Surrogate)', () => {
    for (const s of ['ä', 'Ünïcödé', 'Komödie 😀', '日本語']) expect(fnv1a(s)).toBe(ref(s));
    expect(fnv1a('ä')).toBe(0x610b5af3);
    expect(fnv1a('Ünïcödé 😀')).toBe(0xc23d0c37);
  });

  it('fmix32, bitrev32, mulberry32, keyHash', () => {
    expect(fmix32(0)).toBe(0);
    expect(fmix32(1)).toBe(0x514e28b7);
    expect(fmix32(0xdeadbeef)).toBe(0x0de5c6a9);
    expect(bitrev32(1)).toBe(0x80000000);
    expect(bitrev32(0x80000000)).toBe(1);
    expect(bitrev32(0x12345678)).toBe(0x1e6a2c48);
    expect(bitrev32(bitrev32(0xcafebabe))).toBe(0xcafebabe);
    const r = mulberry32(1);
    expect([r(), r(), r()]).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
    expect(keyHash('kino', 'abc')).toBe(fmix32(fnv1a('kino\u0001abc')));
    expect(keyHash('kino', 'abc')).toBe(0x7f0c5e10);
  });
});

describe('ratingAge', () => {
  it('feste Werte', () => {
    for (const s of ['G', 'U', 'TV-Y', 'TV-G']) expect(ratingAge(s)).toBe(0);
    for (const s of ['PG', 'TV-PG', 'TV-Y7']) expect(ratingAge(s)).toBe(6);
    for (const s of ['R', 'TV-MA']) expect(ratingAge(s)).toBe(16);
    for (const s of ['NC-17', 'X', 'XXX', 'AO', 'R18']) expect(ratingAge(s)).toBe(18);
    for (const s of ['NR', 'UNRATED', '', null, undefined, 'Not Rated']) expect(ratingAge(s)).toBeNull();
  });
  it('Zahlen und Bänder', () => {
    const t = { 'FSK-0': 0, 'FSK-6': 6, 'FSK 6': 6, 'FSK-12': 12, 'DE-16': 16, 'FSK-18': 18, '12A': 12, '16+': 16, '18+': 18, 'PG-13': 12, 'TV-14': 12, 15: 16, 17: 16, 21: 18, 9: 6, 3: 0 };
    for (const [k, v] of Object.entries(t)) expect(ratingAge(k), String(k)).toBe(v);
    expect(ratingAge(' pg ')).toBe(6);
  });
});

describe('Determinismus-Quellen', () => {
  const files = readdirSync(SCHED_DIR).filter((f) => f.endsWith('.js'));
  it('keine verbotenen APIs im Planer', () => {
    expect(files.length).toBeGreaterThan(5);
    const bad = /\bIntl\b|localeCompare|toLocale\w*|Math\.random|\.get(Hours|Minutes|Seconds|Milliseconds|Date|Day|FullYear|Month|TimezoneOffset)\s*\(|\.set(Hours|Minutes|Seconds|Date|FullYear|Month)\s*\(|Date\.now|new Date\(\)|toString\(\)\s*\.|toTimeString|toDateString/;
    for (const f of files) {
      const src = readFileSync(join(SCHED_DIR, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
      const m = f === 'index.js' ? src.replace(/Date\.now\(\)/g, '') : src; // index.js: Date.now nur als Standard-Uhr für channels()
      expect(bad.test(m), f).toBe(false);
    }
  });

  it('Lokalzeit-Methoden von Date werden nie aufgerufen', async () => {
    const { normalizeCatalog: nc, createScheduler: cs } = await import('../src/js/live/schedule/index.js');
    const names = ['getHours', 'getMinutes', 'getSeconds', 'getDate', 'getDay', 'getFullYear', 'getMonth', 'getTimezoneOffset', 'toLocaleString', 'toLocaleDateString', 'toLocaleTimeString', 'toString'];
    const orig = names.map((n) => [n, Date.prototype[n]]);
    let calls = 0;
    for (const n of names) Date.prototype[n] = function (...a) { calls++; return orig.find((o) => o[0] === n)[1].apply(this, a); };
    try {
      const D = dayOfDate(2026, 2, 28);
      const cat = nc({ movies: [{ Id: 'a', Name: 'A', RunTimeTicks: 54e9, Genres: ['X'], DateCreated: '2026-01-01T00:00:00Z', ProductionYear: 2000 }], series: [], episodes: [], boxsets: [] });
      const s = cs(cat, {});
      for (let no = 1; no <= 18; no++) s.planDay(no, D);
      formatClock(Date.UTC(2026, 0, 1));
      formatDay(D);
    } finally {
      for (const [n, f] of orig) Date.prototype[n] = f;
    }
    expect(calls).toBe(0);
  });

  it('identische Pläne unter TZ Berlin / UTC / New_York (Kindprozess)', () => {
    const script = `
      import { normalizeCatalog, createScheduler, dayOfDate, formatClock, fnv1a } from ${JSON.stringify(pathToFileURL(join(SCHED_DIR, 'index.js')).href)};
      const raw = { movies: [], series: [], episodes: [], boxsets: [] };
      for (let i = 0; i < 80; i++) raw.movies.push({ Id: 'm' + i, Name: 'F' + i, RunTimeTicks: (80 + (i * 7) % 60) * 6e8, Genres: [['Action', 'Drama', 'Horror'][i % 3]], OfficialRating: ['G', 'FSK-12', 'R'][i % 3], ProductionYear: 1970 + i % 50, DateCreated: '2026-02-' + String(1 + i % 20).padStart(2, '0') + 'T10:00:00' });
      for (let s = 0; s < 6; s++) { raw.series.push({ Id: 's' + s, Name: 'S' + s, Genres: ['Drama'], DateCreated: '2026-01-05T00:00:00.000Z' }); for (let e = 0; e < 12; e++) raw.episodes.push({ Id: 's' + s + 'e' + e, SeriesId: 's' + s, ParentIndexNumber: 1, IndexNumber: e + 1, RunTimeTicks: (22 + s * 4) * 6e8, DateCreated: '2026-01-05T00:00:01.000Z' }); }
      const sch = createScheduler(normalizeCatalog(raw), {});
      let out = '';
      for (const D0 of [dayOfDate(2026, 2, 27), dayOfDate(2026, 9, 23)]) for (let d = 0; d < 4; d++) for (let no = 1; no <= 18; no++) for (const e of sch.planDay(no, D0 + d)) out += no + ':' + e.start + ':' + e.end + ':' + e.type + ':' + (e.itemId || '') + ';';
      console.log(fnv1a(out) + ' ' + out.length + ' ' + formatClock(Date.UTC(2026, 2, 29, 1, 0)) + ' ' + new Date(2026, 5, 1).getTimezoneOffset());
    `;
    const run = (tz) => execFileSync(process.execPath, ['--input-type=module', '-e', script], { env: { ...process.env, TZ: tz }, encoding: 'utf8' }).trim().split(' ');
    const a = run('Europe/Berlin');
    const b = run('UTC');
    const c = run('America/New_York');
    // Die Pläne (Hash, Länge, formatClock) sind gleich; der letzte Wert (Lokalzeit des Prozesses) belegt, dass die Zone wirkt.
    expect(b.slice(0, 3)).toEqual(a.slice(0, 3));
    expect(c.slice(0, 3)).toEqual(a.slice(0, 3));
    expect(new Set([a[3], b[3], c[3]]).size).toBeGreaterThan(1);
  }, 60000);
});

describe('Katalog', () => {
  const min = (n) => n * 6e8;
  const raw = () => ({
    movies: [
      { Id: 'm1', Name: 'Kurz', RunTimeTicks: min(4), Genres: ['Action'] },
      { Id: 'm2', Name: 'Lang', RunTimeTicks: min(301), Genres: ['Action'] },
      { Id: 'm3', Name: 'Ohne', Genres: ['Action'] },
      { Id: 'm4', Name: 'Ok', RunTimeTicks: min(100), Genres: ['  Komödie ', 'komödie', 'Drama'], OfficialRating: 'FSK-12', ProductionYear: 1999, DateCreated: '2026-03-01T12:00:00Z', LocalTrailerCount: 1 },
      { Id: 'm5', Name: 'Ok2', RunTimeTicks: min(90), Genres: ['Komödie'], PremiereDate: '1985-05-05T00:00:00.0000000Z' },
    ],
    series: [{ Id: 's1', Name: 'Serie', Genres: ['Drama'], OfficialRating: 'TV-PG', DateCreated: '2026-03-01T00:00:00Z' }, { Id: 's2', Name: 'Leer', Genres: ['Drama'] }],
    episodes: [
      { Id: 'e3', SeriesId: 's1', ParentIndexNumber: 1, IndexNumber: 2, RunTimeTicks: min(40), OfficialRating: 'TV-MA', DateCreated: '2026-03-02T00:00:00Z' },
      { Id: 'e1', SeriesId: 's1', ParentIndexNumber: 1, IndexNumber: 1, RunTimeTicks: min(20), DateCreated: '2026-03-02T00:00:00Z' },
      { Id: 'e0', SeriesId: 's1', ParentIndexNumber: 0, IndexNumber: 1, RunTimeTicks: min(20), DateCreated: '2026-03-02T00:00:00Z' },
      { Id: 'e4', SeriesId: 's1', ParentIndexNumber: 1, IndexNumber: 3, DateCreated: '2026-03-02T00:00:00Z' },
      { Id: 'e5', SeriesId: 's1', ParentIndexNumber: 1, IndexNumber: 4, RunTimeTicks: min(3), DateCreated: '2026-03-02T00:00:00Z' },
      { Id: 'e6', SeriesId: 'xx', ParentIndexNumber: 1, IndexNumber: 1, RunTimeTicks: min(20) },
    ],
    boxsets: [{ Id: 'b1', Name: 'Reihe', ChildCount: 3 }],
    loadedAt: 5,
  });

  it('filtert Titel ohne/zu kurze/zu lange Laufzeit, Staffel 0 und Waisen', () => {
    const c = normalizeCatalog(raw());
    expect(c.movies.map((m) => m.id)).toEqual(['m4', 'm5']);
    const s = c.items.get('s1');
    expect(s.eps.map((e) => e.id)).toEqual(['e1', 'e3', 'e4']);
    expect(c.items.has('e0')).toBe(false);
    expect(c.items.has('e5')).toBe(false);
    expect(c.items.has('e6')).toBe(false);
    expect(c.series.map((x) => x.id)).toEqual(['s1']); // s2 ohne Folgen
  });

  it('Folgen erben Genre/Freigabe, strengere eigene Freigabe zählt, fehlende Laufzeit → Median', () => {
    const c = normalizeCatalog(raw());
    const e1 = c.items.get('e1');
    const e3 = c.items.get('e3');
    const e4 = c.items.get('e4');
    expect(e1.genres).toEqual(['drama']);
    expect(e1.age).toBe(6);
    expect(e3.age).toBe(16);
    expect(c.items.get('s1').ageMax).toBe(16);
    expect(e4.durMs).toBe(min(20) / 1e4); // unterer Median von [20, 40] min
    expect(e1.durMs).toBe(20 * 60000);
  });

  it('Genres normalisiert, Label = häufigste Schreibweise, Jahr/PremiereDate/addedAt', () => {
    const c = normalizeCatalog(raw());
    const m4 = c.items.get('m4');
    expect(m4.genres).toEqual(['drama', 'komödie']);
    expect(m4.year).toBe(1999);
    expect(m4.addedAt).toBe(Date.UTC(2026, 2, 1, 12));
    expect(m4.age).toBe(12);
    expect(m4.trailer).toBe(true);
    expect(c.items.get('m5').year).toBe(1985);
    expect(c.items.get('m5').addedAt).toBe(0);
    expect(c.genres.find((g) => g.norm === 'komödie')).toMatchObject({ label: 'Komödie', count: 2 });
    expect(c.genreLabel('komödie')).toBe('Komödie');
    const t = normalizeCatalog({ movies: [{ Id: 'a', RunTimeTicks: 6e10, Genres: ['KOMÖDIE'] }, { Id: 'b', RunTimeTicks: 6e10, Genres: ['komödie'] }], series: [], episodes: [] });
    expect(t.genreLabel('komödie')).toBe('KOMÖDIE'); // Gleichstand: kleinste Code-Unit-Folge
  });

  it('Datum ohne Zeitzone wird als UTC gelesen', () => {
    const r = raw();
    r.movies[3].DateCreated = '2026-03-01T12:00:00';
    expect(normalizeCatalog(r).items.get('m4').addedAt).toBe(Date.UTC(2026, 2, 1, 12));
  });

  it('Reihenfolge der Eingabe ist egal', () => {
    const a = normalizeCatalog(raw());
    const r = raw();
    r.movies.reverse(); r.series.reverse(); r.episodes.reverse(); r.boxsets.reverse();
    const b = normalizeCatalog(r);
    const dump = (c) => JSON.stringify([c.movies, c.series.map((s) => [s.id, s.eps.map((e) => e.id)]), c.genres, c.boxsets]);
    expect(dump(b)).toBe(dump(a));
  });

  it('kanonische Folgenreihenfolge: Staffel, Folge, Premiere, Id', () => {
    const r = { movies: [], series: [{ Id: 's', Name: 'S', Genres: [] }], boxsets: [], episodes: [] };
    const add = (Id, s, e, p) => r.episodes.push({ Id, SeriesId: 's', ParentIndexNumber: s, IndexNumber: e, PremiereDate: p, RunTimeTicks: min(30) });
    add('z', 2, 1); add('a', 1, 2); add('b', 1, 1, '2020-01-01'); add('c', 1, 1, '2019-01-01'); add('x', undefined, undefined); add('d', 1, 1, '2019-01-01');
    expect(normalizeCatalog(r).items.get('s').eps.map((e) => e.id)).toEqual(['c', 'd', 'b', 'a', 'z', 'x']);
  });
});

describe('Eimer', () => {
  it('bucketCount: Zweierpotenz ≤ Pool/Kapazität, nur Ganzzahlen', () => {
    expect(bucketCount(0, 100)).toBe(1);
    expect(bucketCount(199, 100)).toBe(1);
    expect(bucketCount(200, 100)).toBe(2);
    expect(bucketCount(399, 100)).toBe(2);
    expect(bucketCount(400, 100)).toBe(4);
    expect(bucketCount(1e12, 1)).toBe(4096);
  });

  const ents = (n, key = 'k') => makeEntries(key, Array.from({ length: n }, (_, i) => ({ id: 'id' + i, durMs: 6e6 })));

  it('Eimer sind zusammenhängende Bereiche, Tag-Eimer partitionieren den Pool', () => {
    const sorted = ents(1000);
    for (const C of [1, 2, 8, 64]) {
      const seen = new Set();
      for (let D = 20000; D < 20000 + C; D++) for (const e of bucket(sorted, C, D)) { expect(seen.has(e.id)).toBe(false); seen.add(e.id); expect(e.h & (C - 1)).toBe(D & (C - 1)); }
      expect(seen.size).toBe(1000);
    }
  });

  it('Stufenwechsel von C: mindestens 40 % der Titel bleiben im Eimer', () => {
    const sorted = ents(2000);
    for (const [c1, c2] of [[8, 16], [16, 8], [4, 8], [32, 16]]) {
      let kept = 0;
      let total = 0;
      for (let D = 20000; D < 20064; D++) {
        const a = new Set(bucket(sorted, c1, D).map((e) => e.id));
        const b = bucket(sorted, c2, D);
        total += Math.max(a.size, b.length);
        kept += b.filter((e) => a.has(e.id)).length;
      }
      expect(kept / total).toBeGreaterThanOrEqual(0.4);
    }
  });

  it('rotation: gleiche Menge wie der Eimer, Start pro Zyklus verschieden', () => {
    const sorted = ents(400);
    const C = 4;
    const starts = new Set();
    for (let q = 0; q < 12; q++) {
      const D = 20000 - (20000 % C) + q * C; // gleicher Tag-Eimer, verschiedene Zyklen
      const rot = rotation(sorted, C, D);
      expect(rot.map((e) => e.id).sort()).toEqual(bucket(sorted, C, D).map((e) => e.id).sort());
      starts.add(rot[0].id);
    }
    expect(starts.size).toBeGreaterThan(3);
  });

  it('packSubset: maximale Füllung, deterministischer Gleichstand', () => {
    expect(packSubset([5, 4, 3], 9)).toEqual([0, 1]);
    expect(packSubset([3, 3, 3], 6)).toEqual([0, 1]);
    expect(packSubset([10, 20], 5)).toEqual([]);
    const sizes = [7, 3, 9, 5, 2, 8];
    const idx = packSubset(sizes, 20);
    expect(idx.reduce((s, i) => s + sizes[i], 0)).toBe(20);
  });
});
