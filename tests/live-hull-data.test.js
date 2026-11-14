// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearCache } from '../src/js/core/cache.js';
import { loadCatalog, fetchCatalog, broadcastDayKey, cacheKey, PAGE_SIZE, EPISODE_PAGE_SIZE, KEEP } from '../src/js/features/live/data.js';

const TOKEN = 'SECRET-TOKEN-123';
let calls;
let data; // type -> Item[]

function makeItems(type, n) {
  return Array.from({ length: n }, (_, i) => {
    const base = { Id: `${type}-${i}`, Name: `${type} ${i}`, Overview: 'lang lang lang', ImageTags: { Primary: 'x', Logo: 'l', Thumb: 't' }, BackdropImageTags: ['b1', 'b2'], UserData: { Played: true }, MediaSources: [{}] };
    if (type === 'Movie') return { ...base, RunTimeTicks: 5e10, Genres: ['Action'], OfficialRating: 'FSK-12', ProductionYear: 1999, PremiereDate: '1999-01-01', DateCreated: '2020-01-01', LocalTrailerCount: 1 };
    if (type === 'Series') return { ...base, Genres: ['Drama'], OfficialRating: 'FSK-16', ProductionYear: 2010, DateCreated: '2020-01-01' };
    if (type === 'Episode') return { ...base, SeriesId: 's-1', SeriesName: 'Serie', ParentIndexNumber: 1, IndexNumber: i + 1, RunTimeTicks: 1e10, PremiereDate: '2011-01-01', DateCreated: '2020-01-01', OfficialRating: 'FSK-12', Genres: ['x'] };
    return { ...base, ChildCount: 3 };
  });
}

beforeEach(() => {
  clearCache();
  calls = [];
  data = { Movie: makeItems('Movie', 3), Series: makeItems('Series', 2), Episode: makeItems('Episode', 5), BoxSet: makeItems('BoxSet', 1) };
  window.ApiClient = {
    serverAddress: () => 'http://srv',
    getCurrentUserId: () => 'u1',
    accessToken: () => TOKEN,
    serverId: () => 's',
  };
  window.fetch = vi.fn(async (url, init) => {
    const u = new URL(url);
    const type = u.searchParams.get('IncludeItemTypes');
    const start = Number(u.searchParams.get('StartIndex') || 0);
    const limit = Number(u.searchParams.get('Limit') || 0);
    calls.push({ url, init, type, start, limit, params: u.searchParams });
    const all = data[type] || [];
    return { ok: true, status: 200, json: async () => ({ Items: all.slice(start, start + limit), TotalRecordCount: all.length }) };
  });
});
afterEach(() => {
  delete window.ApiClient;
  delete window.fetch;
  vi.restoreAllMocks();
});

describe('Sendetag', () => {
  it('lokales Datum von now − 5 h', () => {
    expect(broadcastDayKey(new Date(2026, 10, 11, 4, 59).getTime())).toBe('2026-11-10');
    expect(broadcastDayKey(new Date(2026, 10, 11, 5, 0).getTime())).toBe('2026-11-11');
    expect(broadcastDayKey(new Date(2026, 0, 1, 2, 0).getTime())).toBe('2025-12-31');
    expect(cacheKey('u1', new Date(2026, 10, 11, 12, 0).getTime())).toBe('u1:2026-11-11');
    expect(cacheKey(null, new Date(2026, 10, 11, 12, 0).getTime())).toBe('anon:2026-11-11');
  });
});

describe('fetchCatalog', () => {
  it('lädt Filme, Serien, Folgen und Sammlungen mit schlanken Parametern', async () => {
    const raw = await fetchCatalog({}, 1234);
    expect(raw.loadedAt).toBe(1234);
    expect(raw.movies).toHaveLength(3);
    expect(raw.series).toHaveLength(2);
    expect(raw.episodes).toHaveLength(5);
    expect(raw.boxsets).toHaveLength(1);
    expect(calls.map((c) => c.type).sort()).toEqual(['BoxSet', 'Episode', 'Movie', 'Series']);
    for (const c of calls) {
      expect(c.params.get('Recursive')).toBe('true');
      expect(c.params.get('EnableImages')).toBe(c.type === 'Movie' || c.type === 'Series' ? 'true' : 'false');
      expect(c.params.get('EnableUserData')).toBe('false');
      expect(c.params.get('userId')).toBe('u1');
      expect(c.params.get('Fields')).not.toContain('Overview');
      expect(c.params.get('Fields')).not.toContain('People');
    }
    expect(calls.find((c) => c.type === 'Episode').limit).toBe(EPISODE_PAGE_SIZE);
    expect(calls.find((c) => c.type === 'Movie').limit).toBe(PAGE_SIZE);
  });

  it('übernimmt nur die Vertragsfelder (kompakt)', async () => {
    const raw = await fetchCatalog();
    expect(raw.movies[0].ImageTags).toEqual({ Primary: 'x', Thumb: 't' });
    expect(raw.movies[0].BackdropImageTags).toEqual(['b1']);
    expect(raw.episodes[0]).not.toHaveProperty('ImageTags');
    expect(Object.keys(raw.episodes[0]).sort()).toEqual([...KEEP.episodes].sort());
    expect(Object.keys(raw.movies[0]).sort()).toEqual([...KEEP.movies].sort());
    expect(Object.keys(raw.series[0]).sort()).toEqual([...KEEP.series].sort());
    expect(Object.keys(raw.boxsets[0]).sort()).toEqual([...KEEP.boxsets].sort());
    expect(raw.movies[0]).not.toHaveProperty('Overview');
    expect(raw.movies[0]).not.toHaveProperty('UserData');
    expect(raw.episodes[0]).not.toHaveProperty('Genres');
    expect(raw.boxsets[0].ChildCount).toBe(3);
  });

  it('lässt fehlende Felder weg statt undefined/null zu speichern', async () => {
    data.Movie = [{ Id: 'm', Name: 'Nur Name', Genres: null }];
    const raw = await fetchCatalog();
    expect(raw.movies[0]).toEqual({ Id: 'm', Name: 'Nur Name' });
  });

  it('blättert seitenweise bis TotalRecordCount und entfernt doppelte Ids', async () => {
    data.Movie = makeItems('Movie', PAGE_SIZE + 250);
    const raw = await fetchCatalog();
    expect(raw.movies).toHaveLength(PAGE_SIZE + 250);
    const movieCalls = calls.filter((c) => c.type === 'Movie');
    expect(movieCalls.map((c) => c.start)).toEqual([0, PAGE_SIZE]);
    data.Movie = [...makeItems('Movie', 5), ...makeItems('Movie', 5)];
    calls.length = 0;
    expect((await fetchCatalog()).movies).toHaveLength(5);
  });

  it('exakt volle letzte Seite: kein überflüssiger Abruf', async () => {
    data.Movie = makeItems('Movie', PAGE_SIZE);
    await fetchCatalog();
    expect(calls.filter((c) => c.type === 'Movie')).toHaveLength(1);
  });

  it('Fortschritt pro Teilabruf, monoton bis 1', async () => {
    const seen = [];
    await fetchCatalog({ onProgress: (f, label) => seen.push([f, label]) });
    expect(seen.length).toBeGreaterThanOrEqual(4);
    expect(seen[seen.length - 1][0]).toBe(1);
    expect(seen.every(([f, l]) => f >= 0 && f <= 1 && l === 'Sendersuchlauf …')).toBe(true);
    for (let i = 1; i < seen.length; i++) expect(seen[i][0]).toBeGreaterThanOrEqual(seen[i - 1][0]);
  });

  it('kein Token in URLs: Authorization-Header statt api_key/ApiKey', async () => {
    await fetchCatalog();
    for (const c of calls) {
      expect(c.url).not.toContain(TOKEN);
      expect(c.url).not.toMatch(/api_key|ApiKey/i);
      expect(c.init.headers.Authorization).toContain(TOKEN);
    }
  });

  it('Serverfehler: Fehlertext ohne Query/Token', async () => {
    window.fetch = vi.fn(async () => ({ ok: false, status: 500 }));
    await expect(fetchCatalog()).rejects.toThrow(/HTTP 500 für \/Items$/);
  });
});

describe('loadCatalog (Speicher-Cache, jsdom ohne IndexedDB)', () => {
  it('zweiter Aufruf kommt aus dem Cache', async () => {
    const now = new Date(2026, 10, 11, 12, 0).getTime();
    const a = await loadCatalog({ now });
    const n = calls.length;
    expect(n).toBeGreaterThanOrEqual(4);
    const b = await loadCatalog({ now });
    expect(calls.length).toBe(n);
    expect(b).toBe(a);
    expect(a.loadedAt).toBe(now);
  });

  it('neuer Sendetag oder anderer Benutzer lädt neu', async () => {
    await loadCatalog({ now: new Date(2026, 10, 11, 12, 0).getTime() });
    const n = calls.length;
    await loadCatalog({ now: new Date(2026, 10, 12, 12, 0).getTime() });
    expect(calls.length).toBeGreaterThan(n);
    const m = calls.length;
    window.ApiClient.getCurrentUserId = () => 'u2';
    await loadCatalog({ now: new Date(2026, 10, 12, 12, 0).getTime() });
    expect(calls.length).toBeGreaterThan(m);
  });

  it('Fehler wird nicht gecacht', async () => {
    window.fetch = vi.fn(async () => ({ ok: false, status: 503 }));
    await expect(loadCatalog()).rejects.toThrow(/HTTP 503/);
    window.fetch = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ Items: [], TotalRecordCount: 0 }) }));
    const raw = await loadCatalog();
    expect(raw.movies).toEqual([]);
  });

  it('gleichzeitige Aufrufe teilen sich einen Abruf', async () => {
    const [a, b] = await Promise.all([loadCatalog(), loadCatalog()]);
    expect(a).toBe(b);
    expect(calls.filter((c) => c.type === 'Movie')).toHaveLength(1);
  });
});
