import { afterEach, describe, expect, it, vi } from 'vitest';
import { computeCharts } from '../src/index.js';

const env = { JELLYFIN_URL: 'https://jf.example', JELLYFIN_API_KEY: 'KEY' };
afterEach(() => vi.restoreAllMocks());

const COLS = ['ItemId', 'ItemType', 'UserId', 'plays', 'secs', 'age'];
const stub = (results, cols = COLS) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('submit_custom_query')) return new Response(JSON.stringify({ colums: cols, results }));
      if (u.endsWith('/Users')) return new Response('[]');
      return new Response(JSON.stringify({ Items: [] }));
    }),
  );

describe('computeCharts: Regeln und Fehlerfall', () => {
  it('liefert rules und metric score', async () => {
    stub([['m1', 'Movie', 'u1', '1', '900', '0']]);
    const c = await computeCharts({ ...env, MIN_SECONDS_MOVIE: '1000' });
    expect(c.metric).toBe('score');
    expect(c.version).toBe(1);
    expect(c.rules).toEqual({ halfLifeDays: 7, ageUnit: 'day', minSecondsMovie: 1000, minSecondsEpisode: 300 });
    expect(c.movies[0]).toEqual({ id: 'm1', viewers: 1, plays: 1, seconds: 900, score: 1 });
  });

  it('Defaults in rules bei ungültigen Werten', async () => {
    stub([]);
    const c = await computeCharts({ ...env, MIN_SECONDS: 'x', MIN_SECONDS_MOVIE: '99999' });
    expect(c.rules).toEqual({ halfLifeDays: 7, ageUnit: 'day', minSecondsMovie: 800, minSecondsEpisode: 300 });
  });

  it('wirft bei fehlender age-Spalte (altes KV-Ergebnis bleibt)', async () => {
    stub([['m1', 'Movie', 'u1', '1', '900']], COLS.slice(0, 5));
    await expect(computeCharts(env)).rejects.toThrow('age column missing');
  });

  it('wirft, wenn keine Zeile ein gültiges age hat', async () => {
    stub([['m1', 'Movie', 'u1', '1', '900', '']]);
    await expect(computeCharts(env)).rejects.toThrow('age column missing');
  });

  it('leeres Ergebnis ist kein Fehler', async () => {
    stub([]);
    const c = await computeCharts(env);
    expect(c.movies).toEqual([]);
  });
});

describe('computeCharts: Episoden-Obergrenze', () => {
  it('löst bei sehr vielen Episoden nur eine begrenzte Zahl auf (Subrequest-Budget)', async () => {
    const N = 6000;
    const results = [];
    for (let i = 0; i < N; i++) results.push([`ep${String(i).padStart(6, '0')}`, 'Episode', 'u1', '1', String(300 + i), '3600']);
    const f = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('submit_custom_query')) {
        return new Response(JSON.stringify({ colums: COLS, results }));
      }
      if (u.endsWith('/Users')) return new Response('[]');
      return new Response(JSON.stringify({ Items: [] }));
    });
    vi.stubGlobal('fetch', f);
    await computeCharts(env);
    // 1 Query + 1 /Users + ceil(2000/100) Items-Blöcke = 22, weit unter 50 (ohne Filme kein Laufzeit-Aufruf)
    expect(f.mock.calls.length).toBe(22);
    const itemCalls = f.mock.calls.filter(([u]) => String(u).includes('/Items?Ids='));
    const ids = new Set(itemCalls.flatMap(([u]) => new URL(String(u)).searchParams.get('Ids').split(',')));
    expect(ids.size).toBeLessThanOrEqual(2000);
    // die stärksten Episoden (meiste Sekunden) bleiben erhalten
    expect(ids.has(`ep${String(N - 1).padStart(6, '0')}`)).toBe(true);
  });
});

describe('computeCharts: Filmlaufzeiten', () => {
  const mk = (results, items) =>
    vi.fn(async (url) => {
      const u = String(url);
      if (u.includes('submit_custom_query')) return new Response(JSON.stringify({ colums: COLS, results }));
      if (u.endsWith('/Users')) return new Response('[]');
      if (items === 'fail') return new Response('x', { status: 500 });
      return new Response(JSON.stringify({ Items: items }));
    });

  it('höchstens 5 Laufzeit-Blöcke, worst case 28 Subrequests', async () => {
    const results = Array.from({ length: 800 }, (_, i) => [`mv${String(i).padStart(4, '0')}`, 'Movie', 'u1', '1', String(900 + i), '0']);
    for (let i = 0; i < 6000; i++) results.push([`ep${String(i).padStart(6, '0')}`, 'Episode', 'u1', '1', String(300 + i), '0']);
    const f = mk(results, []);
    vi.stubGlobal('fetch', f);
    await computeCharts(env);
    expect(f.mock.calls.length).toBe(28);
    expect(f.mock.calls.filter(([u]) => String(u).includes('/Items?Ids=mv'))).toHaveLength(5);
  });

  it('Laufzeit liefert completion; Fehler beim Holen bricht den Lauf nicht ab', async () => {
    const results = [['m1', 'Movie', 'u1', '1', '2700', '0']];
    vi.stubGlobal('fetch', mk(results, [{ Id: 'm1', RunTimeTicks: 5400 * 10_000_000 }]));
    const c = await computeCharts(env);
    expect(c.movies[0]).toEqual({ id: 'm1', viewers: 1, plays: 1, seconds: 2700, score: 1, completion: 0.5 });
    vi.stubGlobal('fetch', mk(results, 'fail'));
    const c2 = await computeCharts(env);
    expect(c2.movies[0]).toEqual({ id: 'm1', viewers: 1, plays: 1, seconds: 2700, score: 1 });
  });
});
