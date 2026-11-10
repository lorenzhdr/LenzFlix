import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { clearTokenCache } from '../src/index.js';

const UID = '0123456789abcdef0123456789abcdef';
const UID_DASH = '01234567-89AB-CDEF-0123-456789ABCDEF';
const EP = (i) => i.toString(16).padStart(32, '0');
const MOVIE = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const SERIES = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const env = {
  JELLYFIN_URL: 'https://jf.example',
  ALLOWED_ORIGIN: 'https://o.example',
  JELLYFIN_API_KEY: 'KEY',
  CHARTS: { get: vi.fn(), put: vi.fn() },
};
const reqOf = (qs = '', headers = { 'X-Emby-Token': 'tok' }, init = {}) =>
  new Request(`https://charts.example/lenzflix-stats/api/me/stats${qs}`, { headers, ...init });

let cacheMap;
let cacheOps;
let calls;

function fakeCaches() {
  cacheMap = new Map();
  cacheOps = { match: 0, put: 0, delete: 0 };
  return {
    default: {
      match: async (r) => {
        cacheOps.match++;
        const v = cacheMap.get(r.url);
        return v ? new Response(v) : undefined;
      },
      put: async (r, res) => {
        cacheOps.put++;
        cacheMap.set(r.url, await res.text());
      },
      delete: async (r) => {
        cacheOps.delete++;
        return cacheMap.delete(r.url);
      },
    },
  };
}

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'Content-Type': 'application/json' } });
const table = (colums, results) => json({ colums, results, message: '' });

const kindOf = (sql) => {
  if (/AS ignored/.test(sql)) return 'q1';
  if (/AVG\(t\)/.test(sql)) return 'q7';
  if (/^SELECT ItemType, COUNT\(\*\) AS n/.test(sql)) return 'q2b';
  if (/AS day, ItemId/.test(sql)) return 'q5b';
  if (/LIMIT 1$/.test(sql)) return 'q5a';
  if (/GROUP BY ItemId, ItemType/.test(sql)) return 'q2';
  if (/AS bucket/.test(sql)) return 'q3';
  if (/AS dow/.test(sql)) return 'q4';
  if (/ClientName/.test(sql)) return 'q6a';
  if (/PlaybackMethod/.test(sql)) return 'q6b';
  throw new Error('unbekannte Query');
};

const empty = {
  q1: () => table(['secs', 'plays', 'activeDays', 'firstAt', 'lastAt', 'ignored'], [['0', '0', '0', null, null, '0']]),
  q7: () => table(['n', 'avgSecs', 'ahead'], [['0', null, null]]),
};

/** Fake-Jellyfin. opts.q[kind] überschreibt Antworten, opts.me / opts.sql / opts.items steuern Sonderfälle. */
function makeFetch(opts = {}) {
  return vi.fn(async (url, init = {}) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.endsWith('/Users/Me')) return opts.me ? opts.me() : json({ Id: UID_DASH, Name: 'x' });
    if (u.includes('/Items?')) {
      if (opts.items) return opts.items(u);
      const ids = new URL(u).searchParams.get('Ids').split(',');
      return json({ Items: ids.map((id) => ({ Id: id, SeriesId: SERIES })) });
    }
    if (u.endsWith('/user_usage_stats/submit_custom_query')) {
      if (opts.sql) return opts.sql();
      const kind = kindOf(JSON.parse(init.body).CustomQueryString);
      const d = opts.q?.[kind] ?? empty[kind];
      return d ? d() : table(['x'], []);
    }
    throw new Error(`unerwartet: ${u}`);
  });
}

const full = {
  q1: () =>
    table(
      ['secs', 'plays', 'activeDays', 'firstAt', 'lastAt', 'ignored'],
      [['3000', '4', '2', '2026-11-01 20:00:00.123', '2026-11-02 21:00:00', '0']],
    ),
  q2: () =>
    table(
      ['ItemId', 'ItemType', 'plays', 'secs', 'lastAt'],
      [
        [EP(1), 'Episode', '1', '1200', ''],
        [EP(2), 'Episode', '1', '900', ''],
        [MOVIE, 'Movie', '1', '800', ''],
      ],
    ),
  q2b: () => table(['ItemType', 'n'], [['Episode', '2'], ['Movie', '1']]),
  q3: () => table(['bucket', 'secs'], [['2026-11-01', '1500'], ['2026-11-02', '1500']]),
  q4: () => table(['dow', 'hr', 'secs'], [['0', '21', '3000']]),
  q5a: () => table(['day', 'secs'], [['2026-11-01', '1500']]),
  q5b: () =>
    table(
      ['day', 'ItemId', 'secs'],
      [['2026-11-01', EP(1), '1200'], ['2026-11-01', EP(2), '900']],
    ),
  q6a: () => table(['ClientName', 'DeviceName', 'plays', 'secs'], [['Jellyfin Web', 'Chrome', '4', '3000']]),
  q6b: () =>
    table(
      ['PlaybackMethod', 'plays', 'secs'],
      [['DirectPlay', '2', '1000'], ['Transcode (h264)', '1', '1500'], ['DirectStream', '1', '300'], [null, '0', '200']],
    ),
  q7: () => table(['n', 'avgSecs', 'ahead'], [['7', '4000.4', '1']]),
};

const sentSql = () =>
  calls.filter((c) => c.url.endsWith('submit_custom_query')).map((c) => JSON.parse(c.init.body).CustomQueryString);
const subrequests = (f) => f.mock.calls.length + cacheOps.match + cacheOps.put + cacheOps.delete;
const ageTokenCache = (at) => {
  for (const [k, v] of cacheMap) if (k.includes('/tok/')) cacheMap.set(k, JSON.stringify({ ...JSON.parse(v), at }));
};

beforeEach(() => {
  clearTokenCache();
  calls = [];
  vi.stubGlobal('caches', fakeCaches());
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('GET /lenzflix-stats/api/me/stats', () => {
  it('401 ohne Token, kein Jellyfin-Aufruf', async () => {
    const f = makeFetch();
    vi.stubGlobal('fetch', f);
    const res = await worker.fetch(reqOf('', {}), env);
    expect(res.status).toBe(401);
    expect(f).not.toHaveBeenCalled();
    expect(res.headers.get('Cache-Control')).toBe('no-store');
  });

  it('Alias /me/stats funktioniert', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const res = await worker.fetch(new Request('https://c.example/me/stats', { headers: { 'X-Emby-Token': 't' } }), env);
    expect(res.status).toBe(200);
  });

  it('ungültiges Token -> 401, kein Fallback auf alten Token-Cache, Eintrag gelöscht', async () => {
    vi.stubGlobal('fetch', makeFetch({ q: full }));
    expect((await worker.fetch(reqOf(), env)).status).toBe(200);
    expect(cacheMap.size).toBe(2);
    ageTokenCache(Date.now() - 11 * 60 * 1000); // abgelaufen
    vi.stubGlobal('fetch', makeFetch({ me: () => new Response('', { status: 401 }) }));
    const res = await worker.fetch(reqOf(), env);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'unauthorized' });
    expect([...cacheMap.keys()].some((k) => k.includes('/tok/'))).toBe(false);
  });

  it('403 wird wie 401 behandelt', async () => {
    vi.stubGlobal('fetch', makeFetch({ me: () => new Response('', { status: 403 }) }));
    expect((await worker.fetch(reqOf(), env)).status).toBe(401);
  });

  it('Wartungsseite (200 + HTML) -> 502, nie gültig', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch({ me: () => new Response('<html>Wartung</html>', { status: 200, headers: { 'Content-Type': 'text/html' } }) }),
    );
    const res = await worker.fetch(reqOf(), env);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream-unreachable' });
    expect(sentSql()).toHaveLength(0);
  });

  it('200 mit JSON ohne GUID -> 502', async () => {
    vi.stubGlobal('fetch', makeFetch({ me: () => json({ Id: 'nope' }) }));
    expect((await worker.fetch(reqOf(), env)).status).toBe(502);
  });

  it('Wartungsseite bei abgelaufenem Token-Cache -> Fallback auf bekannte UID (nur Nicht-JSON/5xx)', async () => {
    vi.stubGlobal('fetch', makeFetch({ q: full }));
    await worker.fetch(reqOf('?range=7d'), env);
    ageTokenCache(0);
    vi.stubGlobal('fetch', makeFetch({ q: full, me: () => new Response('<html/>', { status: 200 }) }));
    const res = await worker.fetch(reqOf('?range=7d'), env);
    expect(res.status).toBe(200);
  });

  it('leeres Konto -> Nullwerte, compare null', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const res = await worker.fetch(reqOf('?range=30d'), env);
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b).toMatchObject({
      version: 1,
      range: '30d',
      stale: false,
      approx: false,
      ignored: false,
      compare: null,
      totals: { seconds: 0, plays: 0, episodes: 0, movies: 0, series: 0, activeDays: 0, firstAt: null, lastAt: null },
      topSeries: [],
      topMovies: [],
      heatmap: [],
      timeline: { unit: 'day', buckets: [] },
      binge: { topDay: null, seriesDay: null },
      devices: [],
    });
    expect(b.methods.directPlay).toEqual({ plays: 0, seconds: 0 });
  });

  it('vollständige Antwort nach Vertrag', async () => {
    vi.stubGlobal('fetch', makeFetch({ q: full }));
    const b = await (await worker.fetch(reqOf('?range=year'), env)).json();
    expect(b.timeline.unit).toBe('week');
    expect(b.totals).toEqual({
      seconds: 3000,
      plays: 4,
      episodes: 2,
      movies: 1,
      series: 1,
      activeDays: 2,
      firstAt: '2026-11-01 20:00:00',
      lastAt: '2026-11-02 21:00:00',
    });
    expect(b.topSeries).toEqual([{ id: SERIES, seconds: 2100, episodes: 2 }]);
    expect(b.topMovies).toEqual([{ id: MOVIE, seconds: 800, plays: 1 }]);
    expect(b.heatmap).toEqual([{ dow: 0, hour: 21, seconds: 3000 }]);
    expect(b.binge).toEqual({
      topDay: { date: '2026-11-01', seconds: 1500 },
      seriesDay: { date: '2026-11-01', seriesId: SERIES, episodes: 2 },
    });
    expect(b.devices).toEqual([{ client: 'Jellyfin Web', device: 'Chrome', plays: 4, seconds: 3000 }]);
    expect(b.methods).toEqual({
      directPlay: { plays: 2, seconds: 1000 },
      directStream: { plays: 1, seconds: 300 },
      transcode: { plays: 1, seconds: 1500 },
      other: { plays: 0, seconds: 200 },
    });
    expect(b.compare).toEqual({ rank: 2, of: 7, avgSeconds: 4000 });
    expect(Object.keys(b.compare).sort()).toEqual(['avgSeconds', 'of', 'rank']);
  });

  it('compare null bei < 3 Nutzern', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch({ q: { ...full, q7: () => table(['n', 'avgSecs', 'ahead'], [['2', '1000', '0']]) } }),
    );
    expect((await (await worker.fetch(reqOf(), env)).json()).compare).toBeNull();
  });

  it('Manipulation: userId/uid/Header werden ignoriert, SQL enthält nur die UID aus /Users/Me', async () => {
    vi.stubGlobal('fetch', makeFetch({ q: full }));
    const evil = 'ffffffffffffffffffffffffffffffff';
    const res = await worker.fetch(
      reqOf(`?range=30d&userId=${evil}&uid=${evil}`, { 'X-Emby-Token': 'tok', 'X-Emby-UserId': evil }),
      env,
    );
    expect(res.status).toBe(200);
    const all = sentSql();
    expect(all).toHaveLength(10);
    for (const sql of all) {
      expect(sql).not.toContain(evil);
      const hexes = sql.match(/[0-9a-f]{32}/g) ?? [];
      expect(hexes.length).toBeGreaterThan(0);
      expect(hexes.every((h) => h === UID)).toBe(true);
    }
    expect(calls.some((c) => c.url.includes(evil))).toBe(false);
  });

  it('Body bei GET-Variante wird ignoriert (POST wird nicht geroutet)', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const res = await worker.fetch(reqOf('', { 'X-Emby-Token': 'tok' }, { method: 'POST', body: '{"userId":"x"}' }), env);
    expect(res.status).toBe(404);
  });

  it('range mit Injection -> 400, kein SQL gesendet', async () => {
    vi.stubGlobal('fetch', makeFetch());
    for (const r of ["30d'--", 'all;DELETE', 'x', '']) {
      const res = await worker.fetch(reqOf(`?range=${encodeURIComponent(r)}`), env);
      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad-range' });
    }
    expect(sentSql()).toHaveLength(0);
  });

  it('Ignorierliste -> ignored:true mit Nullwerten, compare null', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch({
        q: {
          ...full,
          q1: () =>
            table(['secs', 'plays', 'activeDays', 'firstAt', 'lastAt', 'ignored'], [['500', '1', '1', 'a', 'b', '1']]),
        },
      }),
    );
    const b = await (await worker.fetch(reqOf(), env)).json();
    expect(b.ignored).toBe(true);
    expect(b.compare).toBeNull();
    expect(b.totals.seconds).toBe(0);
    expect(b.topSeries).toEqual([]);
    expect(calls.some((c) => c.url.includes('/Items?'))).toBe(false);
  });

  it('Statistik-Cache: frisch -> keine Neuberechnung; Cache-Keys ohne Klartext-Token', async () => {
    const f = makeFetch({ q: full });
    vi.stubGlobal('fetch', f);
    await worker.fetch(reqOf('', { 'X-Emby-Token': 'geheimes-token' }), env);
    for (const k of cacheMap.keys()) expect(k).not.toContain('geheimes-token');
    expect([...cacheMap.keys()].some((k) => k.includes(`/stats/v1/${UID}/30d`))).toBe(true);
    const n = f.mock.calls.length;
    const res = await worker.fetch(reqOf('', { 'X-Emby-Token': 'geheimes-token' }), env);
    expect(res.status).toBe(200);
    expect(f.mock.calls.length).toBe(n);
  });

  it('Upstream-Fehler: Altstand mit stale:true, sonst 502', async () => {
    vi.stubGlobal('fetch', makeFetch({ q: full }));
    await worker.fetch(reqOf(), env);
    const sk = [...cacheMap.keys()].find((k) => k.includes('/stats/'));
    cacheMap.set(sk, JSON.stringify({ ...JSON.parse(cacheMap.get(sk)), computedAt: '2020-01-01T00:00:00Z' }));
    vi.stubGlobal('fetch', makeFetch({ sql: () => new Response('', { status: 500 }) }));
    const stale = await (await worker.fetch(reqOf(), env)).json();
    expect(stale.stale).toBe(true);
    expect(stale.totals.seconds).toBe(3000);

    cacheMap.delete(sk);
    const res = await worker.fetch(reqOf(), env);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'upstream-unreachable' });
  });

  it('SQL-Antwort Nicht-JSON -> 502', async () => {
    vi.stubGlobal('fetch', makeFetch({ sql: () => new Response('<html>', { status: 200 }) }));
    expect((await worker.fetch(reqOf(), env)).status).toBe(502);
  });

  it('Subrequest-Cap: >3000 Episoden -> approx:true, 30 /Items-Blöcke, Gesamt <= 50', async () => {
    const q2rows = Array.from({ length: 3000 }, (_, i) => [EP(i + 1), 'Episode', '1', String(10000 - i), '']);
    const q5rows = Array.from({ length: 500 }, (_, i) => ['2026-11-01', EP(5000 + i), '400']);
    const f = makeFetch({
      q: {
        ...full,
        q2: () => table(['ItemId', 'ItemType', 'plays', 'secs', 'lastAt'], q2rows),
        q2b: () => table(['ItemType', 'n'], [['Episode', '3600']]),
        q5b: () => table(['day', 'ItemId', 'secs'], q5rows),
      },
    });
    vi.stubGlobal('fetch', f);
    const res = await worker.fetch(reqOf(), env, { waitUntil: () => {} });
    const b = await res.json();
    expect(b.approx).toBe(true);
    expect(b.totals.episodes).toBe(3600);
    const items = calls.filter((c) => c.url.includes('/Items?'));
    expect(items.length).toBe(30);
    expect(items[0].init.headers.Authorization).toBe('MediaBrowser Token="tok"');
    expect(subrequests(f)).toBeLessThanOrEqual(50);
  });

  it('Normalfall: Gesamtzahl fetch + Cache-Aufrufe <= 50', async () => {
    const f = makeFetch({ q: full });
    vi.stubGlobal('fetch', f);
    await worker.fetch(reqOf(), env);
    expect(subrequests(f)).toBeLessThanOrEqual(50);
  });

  it('kaputte Cache API ist nicht fatal, nie eine Exception nach außen', async () => {
    vi.stubGlobal('fetch', makeFetch({ q: full }));
    vi.stubGlobal('caches', {
      get default() {
        throw new Error('kaputt');
      },
    });
    const res = await worker.fetch(reqOf(), env);
    expect(res.status).toBe(200);
  });

  it('unerwartete Ausnahme -> 500 internal (eigenes try/catch)', async () => {
    vi.stubGlobal('fetch', makeFetch({ q: full }));
    vi.spyOn(crypto.subtle, 'digest').mockRejectedValue(new Error('boom'));
    const res = await worker.fetch(reqOf(), env);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal' });
  });
});
