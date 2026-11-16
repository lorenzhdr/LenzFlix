// LENZ LIVE Thementag: Verfügbarkeit von „boxset“ hängt nur vom Wochenanfang ab, nicht davon, welche Tage ein Client vorbereitet hat.
import { describe, it, expect } from 'vitest';
import { normalizeCatalog, createScheduler, dayOfDate } from '../src/js/live/schedule/index.js';

const MIN = 6e8;
const D0 = dayOfDate(2026, 10, 9); // Montag
const OLD = D0 - 60;
const iso = (D) => new Date(D * 864e5 + 432e5).toISOString();
const mv = (id, year, min) => ({ Id: id, Name: id, RunTimeTicks: min * MIN, Genres: ['Drama'], OfficialRating: 'G', ProductionYear: year, DateCreated: iso(OLD) });

function catalog() {
  const raw = { movies: [], series: [], episodes: [], boxsets: [], loadedAt: 0 };
  for (let i = 0; i < 5; i++) raw.movies.push(mv('sh' + i, 2020, 30));
  for (let i = 0; i < 8; i++) raw.movies.push(mv('d80_' + i, 1980 + i, 100));
  for (let i = 0; i < 6; i++) raw.movies.push(mv('bx' + i, 1970 + i, 95));
  for (let i = 0; i < 4; i++) raw.movies.push(mv('ov' + i, 1995, 160));
  for (let s = 0; s < 5; s++) {
    raw.series.push({ Id: 'sr' + s, Name: 'Serie ' + s, Genres: ['Krimi'], OfficialRating: 'PG', ProductionYear: 2012, DateCreated: iso(OLD) });
    for (let e = 0; e < 4; e++) raw.episodes.push({ Id: `sr${s}e${e}`, SeriesId: 'sr' + s, ParentIndexNumber: 1, IndexNumber: e + 1, RunTimeTicks: 25 * MIN, DateCreated: iso(OLD) });
  }
  for (let i = 0; i < 60; i++) raw.boxsets.push({ Id: 'x' + i, Name: 'Leer ' + i, ChildCount: 3 });
  raw.boxsets.push({ Id: 'bs1', Name: 'Reihe Eins', ChildCount: 3 });
  return raw;
}
const BOX = { bs1: ['bx0', 'bx1', 'bx2'] };
const getBoxSetItems = async (id) => BOX[id] || [];

describe('Thementag: Wochenarten unabhängig vom vorbereiteten Fenster', () => {
  it('Sender 18 an Mo und Di ist gleich, ob zusätzlich der Mittwoch vorbereitet wurde', async () => {
    for (let w = 0; w < 40; w++) {
      const mon = D0 + w * 7;
      const days2 = [mon, mon + 1];
      const a = createScheduler(normalizeCatalog(catalog()), { getBoxSetItems });
      const b = createScheduler(normalizeCatalog(catalog()), { getBoxSetItems });
      await a.prepare(days2);
      await b.prepare([mon, mon + 1, mon + 2]);
      const key = (L) => L.map((e) => `${e.start}|${e.itemId || e.type}`).join(',');
      for (const d of days2) expect(key(a.planDay(18, d)), 'Woche ' + w).toBe(key(b.planDay(18, d)));
    }
  });
});
