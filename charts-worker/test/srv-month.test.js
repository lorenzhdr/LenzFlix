import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/srv/device.js', () => ({
  deviceKind: (c, d) => {
    const s = `${c} ${d}`;
    if (/TVBOX/.test(s)) return 'tv';
    if (/PHONEX/.test(s)) return 'phone';
    if (/BROWSERX/.test(s)) return 'web';
    return 'other';
  },
}));

import { clearMonthCache, getMonth, getMonthMeta } from '../src/srv/month.js';

const env = { JELLYFIN_URL: 'https://jf.example', JELLYFIN_API_KEY: 'KEY', CHARTS: { get: vi.fn() } };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
const table = (colums, results) => json({ colums, results, message: '' });
const META = (ym = '2026-11', today = '2026-11-25', first = '2026-02') =>
  table(['ym', 'today', 'monthStartUtc', 'first'], [[ym, today, '2026-10-31 23:00:00', first]]);
const UCOLS = ['k', 'a', 'b', 'c', 'd'];
const UROWS = [
  ['tot', '7200', '5', '3', null],
  ['day', '2026-11-03', '3600', '2', null],
  ['day', '2026-11-10', '3000', '2', null],
  ['day', '2026-11-25', '600', '1', null],
  ['hm', '0', '21', '3600', null],
  ['hm', '5', '20', '1200', null],
  ['dev', 'SECRETCLIENT', 'TVBOX livingroom', '4000', null],
  ['dev', 'SECRETCLIENT2', 'PHONEX', '2000', null],
  ['dev', 'BROWSERX', 'SECRETDEVICE', '1000', null],
  ['dev', null, null, '200', null],
  ['pm', 'DirectPlay', null, '3000', null],
  ['pm', 'Transcode (v:direct a:direct)', null, '1000', null],
  ['pm', 'Transcode (h264)', null, '3200', null],
  ['ty', 'Movie', null, '4000', null],
  ['ty', 'Episode', null, '3200', null],
  ['prev', '5400', null, null, null],
];
const KEYS = ['tot', 'day', 'hm', 'dev', 'pm', 'ty', 'prev'];

let cacheMap;
let sqls;
let now;
let reportKv;

function fakeCaches() {
  cacheMap = new Map();
  return {
    default: {
      match: async (r) => (cacheMap.has(r.url) ? new Response(cacheMap.get(r.url)) : undefined),
      put: async (r, res) => {
        cacheMap.set(r.url, await res.text());
        expect(res.headers.get('Cache-Control')).toContain('max-age=604800');
      },
    },
  };
}

const kindOf = (sql) =>
  /AS monthStartUtc/.test(sql) ? 'meta' : /UNION ALL/.test(sql) ? 'union' : sql.match(/^SELECT '(\w+)' AS k/)?.[1];

/** o.meta / o.union / o.part[k] liefern eine Response oder werfen. */
function makeFetch(o = {}) {
  return vi.fn(async (url, init = {}) => {
    if (!String(url).endsWith('/user_usage_stats/submit_custom_query')) throw new Error(`unerwartet: ${url}`);
    const sql = JSON.parse(init.body).CustomQueryString;
    sqls.push(sql);
    const k = kindOf(sql);
    if (k === 'meta') return o.meta ? o.meta() : META();
    if (k === 'union') return o.union ? o.union(sql) : table(UCOLS, o.rows ?? UROWS);
    if (o.part?.[k]) return o.part[k]();
    return table(
      UCOLS,
      (o.rows ?? UROWS).filter((r) => r[0] === k),
    );
  });
}

const down = () => vi.fn(async () => {
  throw new Error('down');
});
const unions = () => sqls.filter((s) => /UNION ALL/.test(s)).length;

beforeEach(() => {
  clearMonthCache();
  sqls = [];
  now = 1_800_000_000_000;
  reportKv = null;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.stubGlobal('caches', fakeCaches());
  env.CHARTS.get = vi.fn(async () => reportKv);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getMonth: Parameter', () => {
  it('Whitelist: schlechte m ergeben 400 ohne Abfrage', async () => {
    const f = makeFetch();
    vi.stubGlobal('fetch', f);
    for (const bad of ['-1', '36', '1a', '', '99', undefined, null]) {
      expect(await getMonth(env, null, bad)).toEqual({ status: 400, body: { error: 'bad-month' } });
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('"01" ist 1', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const r = await getMonth(env, null, '01');
    expect(r.status).toBe(200);
    expect(r.body.m).toBe(1);
    expect(r.body.ym).toBe('2026-10');
    expect(r.body.partial).toBe(false);
  });
});

describe('getMonth: Inhalt', () => {
  it('laufender Monat: Tage bis heute aufgefüllt, Rekordtag, Mix, Heatmap, Vormonat', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const { status, body } = await getMonth(env, null, '0');
    expect(status).toBe(200);
    expect(body).toMatchObject({ v: 1, ym: '2026-11', m: 0, maxM: 9, partial: true });
    expect(body.stale).toBeUndefined();
    expect(body.totals).toEqual({ secs: 7200, plays: 5, users: 3 });
    expect(body.prev).toEqual({ ym: '2026-10', secs: 5400 });
    expect(body.days).toHaveLength(25);
    expect(body.days[0]).toEqual({ d: '2026-11-01', secs: 0 });
    expect(body.days[2]).toEqual({ d: '2026-11-03', secs: 3600 });
    expect(body.days[24]).toEqual({ d: '2026-11-25', secs: 600 });
    expect(body.top).toEqual({ d: '2026-11-03', secs: 3600 });
    expect(body.heat).toEqual([
      [0, 21, 3600],
      [5, 20, 1200],
    ]);
    expect(body.mix).toEqual({
      dev: { tv: 4000, phone: 2000, web: 1000, other: 200 },
      method: { direct: 4000, transcode: 3200 },
      type: { movie: 4000, episode: 3200 },
    });
    expect(body.tx).toBeUndefined();
  });

  it('vergangener Monat: alle Tage, leerer Monat ohne top', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch({
        rows: [
          ['tot', '0', '0', '0', null],
          ['prev', '0', null, null, null],
        ],
      }),
    );
    const { body } = await getMonth(env, null, '9'); // 2026-02
    expect(body.ym).toBe('2026-02');
    expect(body.days).toHaveLength(28);
    expect(body.top).toBeNull();
    expect(body.heat).toEqual([]);
    expect(body.maxM).toBe(9);
  });

  it('keine Client- oder Gerätenamen in Antwort und Cache', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const { body } = await getMonth(env, null, '0');
    const txt = JSON.stringify(body);
    for (const s of ['SECRET', 'TVBOX', 'PHONEX', 'BROWSERX', 'livingroom', 'Client', 'Device']) {
      expect(txt).not.toContain(s);
    }
    expect(cacheMap.size).toBe(1);
    for (const v of cacheMap.values()) expect(v).not.toMatch(/SECRET|TVBOX|PHONEX|BROWSERX/);
  });

  it('jede gesendete Abfrage schließt die Ignorierliste aus', async () => {
    vi.stubGlobal('fetch', makeFetch({ union: () => json({}, 500) })); // Union und Einzelteile
    await getMonth(env, null, '0');
    expect(sqls.length).toBe(1 + 1 + 7);
    for (const s of sqls) expect(s).toContain('UserId NOT IN (SELECT UserId FROM UserList)');
  });

  it('tx aus srv:report:v1 für diesen ym, fehlt es, fehlt das Feld', async () => {
    vi.stubGlobal('fetch', makeFetch());
    reportKv = {
      traffic: {
        months: [
          { ym: '2026-10', rx: 5, tx: 9 },
          { ym: '2026-11', rx: 100, tx: 400 },
        ],
      },
    };
    expect((await getMonth(env, null, '0')).body.tx).toEqual({ tx: 400, rx: 100 });
    expect((await getMonth(env, null, '1')).body.tx).toEqual({ tx: 9, rx: 5 });
    reportKv = { traffic: { months: [] } };
    expect((await getMonth(env, null, '0')).body.tx).toBeUndefined();
    env.CHARTS.get = vi.fn(async () => {
      throw new Error('kv');
    });
    expect((await getMonth(env, null, '0')).status).toBe(200);
  });
});

describe('getMonth: Teilfehler', () => {
  it('Union scheitert: Einzelteile, ein gescheiterter Teil fehlt', async () => {
    vi.stubGlobal('fetch', makeFetch({ union: () => json({}, 500), part: { dev: () => json({}, 500) } }));
    const { status, body } = await getMonth(env, null, '0');
    expect(status).toBe(200);
    expect(body.totals.secs).toBe(7200);
    expect(body.mix.dev).toBeUndefined();
    expect(body.mix.method).toEqual({ direct: 4000, transcode: 3200 });
    expect(body.days).toHaveLength(25);
  });
});

describe('getMonth: Cache unter ym', () => {
  it('zweiter Aufruf kommt aus der Kopie, Schlüssel enthält ym', async () => {
    vi.stubGlobal('fetch', makeFetch());
    await getMonth(env, null, '0');
    const n = sqls.length;
    const r = await getMonth(env, null, '0');
    expect(sqls.length).toBe(n);
    expect(r.body.ym).toBe('2026-11');
    expect([...cacheMap.keys()].some((k) => k.endsWith('/srv/month/2026-11'))).toBe(true);
  });

  it('laufender Monat nach 10 min neu, vergangener erst nach 24 h', async () => {
    vi.stubGlobal('fetch', makeFetch());
    await getMonth(env, null, '0');
    await getMonth(env, null, '2');
    expect(unions()).toBe(2);
    now += 11 * 60 * 1000;
    await getMonth(env, null, '2');
    expect(unions()).toBe(2); // vergangener Monat noch frisch
    await getMonth(env, null, '0');
    expect(unions()).toBe(3);
    now += 25 * 3600 * 1000;
    await getMonth(env, null, '2');
    expect(unions()).toBe(4);
  });

  it('Monatswechsel: m=1 liefert den neuen Vormonat, nicht die alte Teilkopie', async () => {
    let meta = META('2026-11');
    vi.stubGlobal('fetch', makeFetch({ meta: () => meta }));
    const a = await getMonth(env, null, '0');
    expect(a.body.ym).toBe('2026-11');
    expect(a.body.partial).toBe(true);
    expect(a.body.days).toHaveLength(25);
    now += 60 * 1000; // innerhalb der Frische des alten Eintrags
    clearMonthCache();
    meta = META('2026-12', '2026-12-01');
    const b = await getMonth(env, null, '1');
    expect(b.body.ym).toBe('2026-11');
    expect(b.body.partial).toBe(false);
    expect(b.body.m).toBe(1);
    expect(b.body.days).toHaveLength(30); // voller November, nicht die Teilkopie
    const c = await getMonth(env, null, '0');
    expect(c.body.ym).toBe('2026-12');
    expect(c.body.days).toHaveLength(1);
  });
});

describe('getMonth: Ausfall', () => {
  it('abgelaufene Kopie mit stale:1, wenn Jellyfin nicht antwortet', async () => {
    vi.stubGlobal('fetch', makeFetch());
    await getMonth(env, null, '0');
    now += 3 * 24 * 3600 * 1000;
    vi.stubGlobal('fetch', down());
    const r = await getMonth(env, null, '0');
    expect(r.status).toBe(200);
    expect(r.body.stale).toBe(1);
    expect(r.body.totals.secs).toBe(7200);
  });

  it('Meta weg und neuer Isolate: Notfall-Kopie aus der UTC-Schätzung mit stale', async () => {
    const t = Date.UTC(2026, 10, 25);
    now = t;
    vi.stubGlobal('fetch', makeFetch());
    await getMonth(env, null, '0');
    clearMonthCache();
    vi.stubGlobal('fetch', down());
    const r = await getMonth(env, null, '0');
    expect(r.status).toBe(200);
    expect(r.body.stale).toBe(1);
    expect(r.body.ym).toBe('2026-11');
  });

  it('503 unavailable ohne Kopie (Meta da, alle Abfragen tot)', async () => {
    const fail = () => json({}, 500);
    vi.stubGlobal('fetch', makeFetch({ union: fail, part: Object.fromEntries(KEYS.map((k) => [k, fail])) }));
    expect(await getMonth(env, null, '0')).toEqual({ status: 503, body: { error: 'unavailable' } });
  });

  it('503 ohne Meta und ohne Kopie', async () => {
    vi.stubGlobal('fetch', down());
    expect(await getMonth(env, null, '0')).toEqual({ status: 503, body: { error: 'unavailable' } });
  });
});

describe('getMonthMeta', () => {
  it('Isolate-Cache 10 min, bei Fehler der letzte Wert, sonst null', async () => {
    const f = makeFetch();
    vi.stubGlobal('fetch', f);
    const a = await getMonthMeta(env, null);
    expect(a).toMatchObject({ ym: '2026-11', maxM: 9, monthStartUtc: '2026-10-31 23:00:00' });
    await getMonthMeta(env, null);
    expect(f).toHaveBeenCalledTimes(1);
    now += 11 * 60 * 1000;
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 500)));
    expect(await getMonthMeta(env, null)).toEqual(a);
    clearMonthCache();
    expect(await getMonthMeta(env, null)).toBeNull();
  });

  it('maxM wird auf 35 geklemmt, ohne Daten 0', async () => {
    vi.stubGlobal('fetch', makeFetch({ meta: () => META('2026-11', '2026-11-25', '2019-01') }));
    expect((await getMonthMeta(env, null)).maxM).toBe(35);
    clearMonthCache();
    vi.stubGlobal('fetch', makeFetch({ meta: () => META('2026-11', '2026-11-25', null) }));
    expect((await getMonthMeta(env, null)).maxM).toBe(0);
  });
});
