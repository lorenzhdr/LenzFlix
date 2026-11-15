// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/js/core/api.js', async () => ({
  getUserId: () => 'u1',
  getAuth: () => ({ serverId: 's' }),
  getJson: vi.fn(),
  getItems: vi.fn(),
  getResume: vi.fn(),
  getNextUp: vi.fn(),
  getLatest: vi.fn(),
  getSimilar: vi.fn(),
  isReady: () => true,
}));
vi.mock('../src/js/core/theme.js', () => ({ brandName: () => 'LENZFLIX', getTheme: () => 'flix', isTheme: () => true }));
vi.mock('../src/js/core/charts.js', () => ({
  getCharts: vi.fn(async () => null),
  getChartsUrl: () => '',
  resolveChartItems: vi.fn(async () => []),
}));

import * as api from '../src/js/core/api.js';
import { clearCache } from '../src/js/core/cache.js';
import { buildLibraryRowDefs, getLibraryHeroPool, getLibraryGenres, libraryPoolKey, LIB_TYPES } from '../src/js/features/library/sources.js';

const genres = Array.from({ length: 10 }, (_, i) => ({ Id: `g${i}`, Name: `Genre ${String.fromCharCode(65 + i)}` }));
const mk = (n, extra = {}) => Array.from({ length: n }, (_, i) => ({ Id: `i${i}`, Name: `T${i}`, Type: 'Movie', ...extra }));

beforeEach(() => {
  clearCache();
  vi.clearAllMocks();
  api.getJson.mockResolvedValue({ Items: genres });
  api.getItems.mockResolvedValue({ Items: mk(10) });
  api.getResume.mockResolvedValue({ Items: [] });
  api.getLatest.mockResolvedValue(mk(5));
  api.getNextUp.mockResolvedValue({ Items: [] });
  api.getSimilar.mockResolvedValue({ Items: [] });
});

describe('getLibraryGenres', () => {
  it('liefert {id,name} sortiert und cacht', async () => {
    api.getJson.mockResolvedValue({ Items: [{ Id: 'b', Name: 'Zeta' }, { Id: 'a', Name: 'Alpha' }] });
    expect(await getLibraryGenres('series')).toEqual([{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Zeta' }]);
    await getLibraryGenres('series');
    expect(api.getJson).toHaveBeenCalledTimes(1);
    expect(api.getJson.mock.calls[0][1].IncludeItemTypes).toBe('Series');
  });
});

describe('buildLibraryRowDefs ohne Genre', () => {
  it('Ids tragen den Präfix, Reihenfolge Serien', async () => {
    const defs = await buildLibraryRowDefs('series');
    expect(defs.every((d) => d.id.startsWith('lib:series:all:'))).toBe(true);
    const ids = defs.map((d) => d.id.replace('lib:series:all:', ''));
    expect(ids.slice(0, 5)).toEqual(['resume', 'nextup', 'top10', 'latest', 'because']);
    expect(ids.slice(5, 7).every((i) => i.startsWith('genre-'))).toBe(true);
    expect(ids[7]).toBe('toprated');
    expect(ids[8]).toMatch(/^genre-/);
    expect(ids[9]).toMatch(/^genre-/);
    expect(ids[10]).toBe('random');
    expect(ids.slice(11).every((i) => i.startsWith('genre-'))).toBe(true);
    expect(defs.find((d) => d.id.endsWith('top10')).kind).toBe('top10');
    expect(LIB_TYPES.series).toBe('Series');
  });

  it('Filme: kein Als Nächstes', async () => {
    const defs = await buildLibraryRowDefs('movies');
    expect(defs.some((d) => d.id.endsWith('nextup'))).toBe(false);
    expect(defs[0].id).toBe('lib:movies:all:resume');
  });

  it('Top 10 fällt ohne Charts auf die Neuesten des Typs zurück', async () => {
    api.getItems.mockResolvedValue({ Items: mk(12, { DateCreated: '2026-01-01T00:00:00Z' }) });
    const defs = await buildLibraryRowDefs('movies');
    const top = defs.find((d) => d.id.endsWith('top10'));
    const items = await top.load();
    expect(items).toHaveLength(10);
    expect(top.title).toBe('Top 10: Neu auf LENZFLIX');
    expect(api.getItems.mock.calls.at(-1)[0].IncludeItemTypes).toBe('Movie');
  });

  it('Weiterschauen filtert Serien auf Episoden', async () => {
    api.getResume.mockResolvedValue({ Items: [{ Id: 'e', Type: 'Episode' }, { Id: 'm', Type: 'Movie' }] });
    const defs = await buildLibraryRowDefs('series');
    const items = await defs[0].load();
    expect(items.map((i) => i.Id)).toEqual(['e']);
    expect(api.getResume.mock.calls[0][0].IncludeItemTypes).toBe('Episode');
  });

  it('Genre-Zeile mit weniger als 8 Titeln entfällt (leere Liste)', async () => {
    api.getItems.mockResolvedValue({ Items: mk(5) });
    const defs = await buildLibraryRowDefs('movies');
    const g = defs.find((d) => d.id.includes(':genre-'));
    expect(await g.load()).toEqual([]);
  });

  it('Weil du: Titel und Typfilter', async () => {
    api.getItems.mockResolvedValue({ Items: [{ Id: 'e1', Type: 'Episode', SeriesId: 's1', SeriesName: 'Show' }] });
    api.getSimilar.mockResolvedValue({ Items: [{ Id: 's2', Type: 'Series' }, { Id: 'm', Type: 'Movie' }] });
    const defs = await buildLibraryRowDefs('series');
    const because = defs.find((d) => d.id.endsWith('because'));
    const items = await because.load();
    expect(items.map((i) => i.Id)).toEqual(['s2']);
    expect(because.title).toBe('Weil du Show angesehen hast');
  });
});

describe('buildLibraryRowDefs mit Genre', () => {
  it('ohne Top 10, Weil du und Genre-Zeilen; mit Jahrzehnten', async () => {
    const defs = await buildLibraryRowDefs('movies', { genre: 'g1', genreName: 'Krimi' });
    const ids = defs.map((d) => d.id.replace('lib:movies:g1:', ''));
    expect(defs.every((d) => d.id.startsWith('lib:movies:g1:'))).toBe(true);
    expect(ids).toEqual(['resume', 'latest', 'toprated', 'random', 'decade-2020', 'decade-2010', 'decade-2000', 'decade-1990', 'decade-1980']);
    expect(defs.find((d) => d.id.endsWith('decade-2010')).title).toBe('Krimi der 2010er');
  });

  it('Jahrzehnt-Zeile braucht mindestens 8 Titel und nutzt Years + GenreIds', async () => {
    const defs = await buildLibraryRowDefs('movies', { genre: 'g1', genreName: 'Krimi' });
    const dec = defs.find((d) => d.id.endsWith('decade-2010'));
    api.getItems.mockResolvedValue({ Items: mk(7) });
    expect(await dec.load()).toEqual([]);
    clearCache();
    const dec2 = (await buildLibraryRowDefs('movies', { genre: 'g1', genreName: 'Krimi' })).find((d) => d.id.endsWith('decade-2010'));
    api.getItems.mockResolvedValue({ Items: mk(9) });
    expect(await dec2.load()).toHaveLength(9);
    const p = api.getItems.mock.calls.at(-1)[0];
    expect(p.GenreIds).toBe('g1');
    expect(p.Years).toBe('2010,2011,2012,2013,2014,2015,2016,2017,2018,2019');
  });

  it('Weiterschauen: nur Treffer im Genre', async () => {
    api.getResume.mockResolvedValue({ Items: [
      { Id: 'a', Type: 'Movie', Genres: ['Krimi'] },
      { Id: 'b', Type: 'Movie', Genres: ['Drama'] },
      { Id: 'c', Type: 'Movie', GenreItems: [{ Id: 'g1' }] },
    ] });
    const defs = await buildLibraryRowDefs('movies', { genre: 'g1', genreName: 'Krimi' });
    expect((await defs[0].load()).map((i) => i.Id)).toEqual(['a', 'c']);
  });

  it('Weiterschauen ohne Treffer: leere Liste', async () => {
    api.getResume.mockResolvedValue({ Items: [{ Id: 'b', Type: 'Movie', Genres: ['Drama'] }] });
    const defs = await buildLibraryRowDefs('movies', { genre: 'g1', genreName: 'Krimi' });
    expect(await defs[0].load()).toEqual([]);
  });
});

describe('getLibraryHeroPool', () => {
  const hero = (id) => ({ Id: id, BackdropImageTags: ['b'], ImageTags: { Logo: 'l' }, Type: 'Movie' });

  it('Key und Genre-Filter', async () => {
    expect(libraryPoolKey('series', 'g1')).toBe('home:u1:lib:series:g1:pool');
    expect(libraryPoolKey('movies')).toBe('home:u1:lib:movies:all:pool');
    api.getItems.mockResolvedValue({ Items: [hero('a'), hero('b'), hero('c')] });
    const pool = await getLibraryHeroPool('movies', { genre: 'g1' });
    expect(pool.length).toBeGreaterThan(0);
    expect(api.getItems.mock.calls.every(([p]) => p.GenreIds === 'g1' && p.IncludeItemTypes === 'Movie' && !p.ParentId)).toBe(true);
    await getLibraryHeroPool('movies', { genre: 'g1' });
    expect(api.getItems).toHaveBeenCalledTimes(2); // 2 Abfragen, 2. Aufruf aus dem Cache
  });
});
