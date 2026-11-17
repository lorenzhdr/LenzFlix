// @vitest-environment jsdom
// TV-Planer und Senderlogos: Plan-Memo, Premiere vs. Füllprogramm, Thementag ohne Cache-Abhängigkeit,
// Senderlogo-Kontrast.
import { describe, it, expect } from 'vitest';
import { normalizeCatalog, createScheduler, dayOfDate, dayBounds, mulberry32 } from '../src/js/tv/schedule/index.js';
import { channelInk, channelColor } from '../src/js/tv/ui/logos.js';

const MIN = 6e8;
const iso = (D, h = 12) => new Date(D * 864e5 + h * 36e5).toISOString();
const dNov = (d) => dayOfDate(2026, 10, d);
function film(id, D, { min = 100, h = 12 } = {}) {
  return { Id: id, Name: id, RunTimeTicks: min * MIN, Genres: ['Drama'], OfficialRating: 'G', ProductionYear: 2010, DateCreated: iso(D, h) };
}
function base({ films = 60 } = {}) {
  const raw = { movies: [], series: [], episodes: [], boxsets: [], loadedAt: 0 };
  const rnd = mulberry32(3);
  for (let i = 0; i < films; i++) raw.movies.push(film('old' + i, dNov(1) - 5 - (i % 20), { min: 80 + Math.floor(rnd() * 60) }));
  return raw;
}

describe('Plan-Memo ist begrenzt', () => {
  it('alte Einträge werden verdrängt, der Plan bleibt gleich', () => {
    const sch = createScheduler(normalizeCatalog(base()));
    const first = sch.planDay(1, dNov(10));
    expect(sch.planDay(1, dNov(10))).toBe(first);
    for (let d = 11; d < 23; d++) for (let no = 1; no <= 16; no++) sch.planDay(no, dNov(d));
    const again = sch.planDay(1, dNov(10));
    expect(again).not.toBe(first);
    expect(again).toEqual(first);
  });
});

describe('Premiere wird nicht vorher als Füllprogramm gesendet', () => {
  it('kurze Premiere läuft um 20:15 (mit kleinem Rerun-Pool)', () => {
    const raw = { movies: [], series: [], episodes: [], boxsets: [], loadedAt: 0 };
    for (let i = 0; i < 3; i++) raw.movies.push(film('m' + i, dNov(1) - 5 - i, { min: 100 }));
    raw.series.push({ Id: 's1', Name: 'S', Genres: ['Krimi'], OfficialRating: 'PG', ProductionYear: 2005, DateCreated: iso(dNov(1) - 30) });
    raw.episodes.push({ Id: 'e1', SeriesId: 's1', ParentIndexNumber: 1, IndexNumber: 1, RunTimeTicks: 40 * MIN, DateCreated: iso(dNov(5)) });
    const sch = createScheduler(normalizeCatalog(raw));
    const D = dNov(6);
    const L = sch.planDay(17, D);
    const prem = L.filter((e) => e.premiere);
    expect(prem).toHaveLength(1);
    expect(prem[0]).toMatchObject({ itemId: 'e1', start: dayBounds(D).a2015 });
    expect(L.filter((e) => e.itemId === 'e1')).toHaveLength(1);
  });
});

describe('Thementag-Kandidaten sind cache-unabhängig', () => {
  it('Kandidaten jenseits der ersten 12 Rotationsplätze je Tag werden nie geladen (Tag + Wochenanfang)', async () => {
    const raw = base();
    for (let i = 0; i < 30; i++) raw.boxsets.push({ Id: 'b' + i, Name: 'Reihe ' + i, ChildCount: 3 });
    const loaded = new Set();
    const sch = createScheduler(normalizeCatalog(raw), { getBoxSetItems: async (id) => { loaded.add(id); return []; } });
    await sch.prepare([dNov(10)]);
    const n = loaded.size;
    expect(n).toBeGreaterThanOrEqual(12);
    expect(n).toBeLessThanOrEqual(24); // 12 für den Tag, höchstens 12 für den Wochenanfang
    await sch.prepare([dNov(10)]); // warmer Cache darf die Zulassung nicht erweitern
    expect(loaded.size).toBe(n);
  });
});

describe('Senderlogo-Schrift nach WCAG-Kontrast', () => {
  const lum = (hex) => {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  it('wählt für alle 18 Plätze die Schrift mit dem höheren Kontrast', () => {
    for (let no = 1; no <= 18; no++) {
      const bg = channelColor(no);
      const ink = channelInk(no);
      expect(['#1a1a1a', '#ffffff']).toContain(ink);
      const other = ink === '#ffffff' ? '#1a1a1a' : '#ffffff';
      expect(cr(bg, ink)).toBeGreaterThanOrEqual(cr(bg, other));
    }
    for (const no of [4, 6, 7, 13, 15, 16, 18]) expect(channelInk(no)).toBe('#1a1a1a');
  });
});
