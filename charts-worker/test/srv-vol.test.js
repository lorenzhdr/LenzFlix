import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BR_BLOCKS, BR_MAX_TEXT, VOL_KEY, VOL_ROW_LIMIT, buildVolRows, runVol } from '../src/srv/vol.js';

const NOW = Date.UTC(2026, 10, 25, 12, 7, 0);
const hex = (c) => c.repeat(32);
const ADMIN = hex('a');
const U1 = hex('1');
const U2 = hex('2');
const U3 = hex('3'); // Ignorierliste
const M1 = hex('b');
const M2 = hex('c');
const M3 = hex('d');
const E1 = hex('e');
const E2 = hex('f');
const dashed = (id) => `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20)}`.toUpperCase();

const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
const table = (colums, results) => json({ colums, results, message: '' });
const ROW_COLS = ['today', 'u', 'i', 't', 'w7', 'w30', 'wy', 'wa', 'o7', 'o30', 'oy', 'oa', 'ig'];

// Sekunden je Fenster (w) und ab Überlappungsbeginn (o); M1 und M2 haben Wiedergaben vor since (wa > oa).
const ROWS = [
  [U1, M1, 'Movie', [3600, 7200, 10000, 20000], [3600, 7200, 8000, 8000], 0],
  [U1, E1, 'Episode', [1800, 1800, 1800, 1800], [1800, 1800, 1800, 1800], 0],
  [U2, M2, 'Movie', [0, 3600, 3600, 9000], [0, 3600, 3600, 3600], 0],
  [U2, E2, 'Episode', [1200, 1200, 5000, 5000], [1200, 1200, 1200, 1200], 0],
  [U3, M3, 'Movie', [600, 600, 600, 600], [600, 600, 600, 600], 1],
];
const sqlRows = (rows = ROWS) => rows.map(([u, i, t, w, o, ig]) => ['2026-11-25', dashed(u), dashed(i), t, ...w.map(String), ...o.map(String), String(ig)]);
// Bitraten in bit/s: M2 ohne Bitrate, E2 fehlt in der Antwort
const ITEMS = { [M1]: 10_000_000, [M3]: 6_000_000, [E1]: 5_000_000, [M2]: null };

function daysFrom(from, to, tx) {
  const out = [];
  for (let t = Date.parse(from + 'T00:00:00Z'); t <= Date.parse(to + 'T00:00:00Z'); t += 86400e3) {
    out.push({ d: new Date(t).toISOString().slice(0, 10), rx: 1, tx: tx(new Date(t).toISOString().slice(0, 10)) });
  }
  return out;
}
const REPORT = {
  v: 1,
  at: NOW - 1800e3,
  traffic: {
    at: NOW - 1800e3,
    since: '2026-10-07',
    days: daysFrom('2026-10-07', '2026-11-25', (d) => (d >= '2026-11-19' ? (d === '2026-11-22' ? 18.17e9 : 1.17e9) : 3e9)).slice(-62),
    months: [
      { ym: '2026-10', rx: 1, tx: 10e9 },
      { ym: '2026-11', rx: 1, tx: 30e9 },
    ],
    bk: [{ d: '2026-11-22', tx: 17e9, src: 'h' }],
    bkm: [
      { ym: '2026-10', tx: 2e9 },
      { ym: '2026-11', tx: 17e9 },
    ],
  },
};

let kv;
let ops;
let sqls;
let itemCalls;

function makeEnv(initial = {}, over = {}) {
  kv = new Map(Object.entries(initial).map(([k, v]) => [k, JSON.stringify(v)]));
  ops = { get: 0, put: 0, fetch: 0 };
  return {
    JELLYFIN_URL: 'https://jf.example',
    JELLYFIN_API_KEY: 'KEY',
    CHARTS: {
      get: vi.fn(async (k) => {
        ops.get++;
        return kv.has(k) ? JSON.parse(kv.get(k)) : null;
      }),
      put: vi.fn(async (k, v) => {
        ops.put++;
        kv.set(k, v);
      }),
    },
    ...over,
  };
}
const stored = () => (kv.has(VOL_KEY) ? JSON.parse(kv.get(VOL_KEY)) : null);

/** o.ids / o.rows: () => Response | throw; o.items(ids, n) -> Response. */
function makeFetch(o = {}) {
  return vi.fn(async (url, init = {}) => {
    ops.fetch++;
    const u = String(url);
    if (u.endsWith('/user_usage_stats/submit_custom_query')) {
      const sql = JSON.parse(init.body).CustomQueryString;
      sqls.push(sql);
      if (/^SELECT DISTINCT ItemId/.test(sql)) return (o.ids ?? (() => table(['ItemId', 'ItemType'], ROWS.map((r) => [dashed(r[1]), r[2]]))))();
      if (/GROUP BY UserId, ItemId/.test(sql)) return (o.rows ?? (() => table(ROW_COLS, sqlRows())))();
      throw new Error('unbekannte Abfrage');
    }
    if (u.endsWith('/Users')) return json([{ Id: dashed(ADMIN), Policy: { IsAdministrator: true } }]);
    if (u.includes('/Items?Ids=')) {
      itemCalls.push(u);
      const ids = new URL(u).searchParams.get('Ids').split(',');
      if (o.items) return o.items(ids, itemCalls.length);
      const Items = ids
        .filter((id) => id in ITEMS)
        .map((id) => ({ Id: dashed(id), MediaSources: [ITEMS[id] === null ? {} : { Bitrate: ITEMS[id] }] }));
      return json({ Items });
    }
    throw new Error('unerwartet ' + u);
  });
}

let errSpy;
beforeEach(() => {
  sqls = [];
  itemCalls = [];
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  errSpy.mockRestore();
});

const BPS = { [M1]: 10000 * 125, [M2]: 8000 * 125, [M3]: 6000 * 125, [E1]: 5000 * 125, [E2]: 5000 * 125 };
const RI = { '7d': 0, '30d': 1, year: 2, all: 3 };
/** Unabhängige Referenz aus dem Fixture: Schätzung aller (w oder o), nur Ignorierliste, je Konto. */
function ref(r, col = 4) {
  let all = 0;
  let ign = 0;
  const per = {};
  for (const row of ROWS) {
    const b = row[col - 4 + 3][RI[r]] * BPS[row[1]];
    all += b;
    if (row[5]) ign += b;
    else per[row[0]] = (per[row[0]] ?? 0) + b;
  }
  return { all, ign, per };
}

describe('runVol', () => {
  it('schreibt br, fb (Median je Typ), ranges und users nach iface.md', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const env = makeEnv({ 'srv:report:v1': REPORT });
    await runVol(env, {});
    const v = stored();
    expect(v.v).toBe(1);
    expect(v.at).toBe(NOW);
    expect(v.approx).toBeUndefined();
    expect(v.br).toEqual({ [M1]: 10000, [M3]: 6000, [E1]: 5000, [M2]: 0, [E2]: 0 });
    expect(v.fb).toEqual({ movie: 8000, episode: 5000 });
    expect(itemCalls).toHaveLength(1);
    expect(itemCalls[0]).toContain(`userId=${ADMIN}`);
    expect(itemCalls[0]).toContain('Fields=MediaSources&EnableImages=false&EnableUserData=false');

    // 7d: up = 7 × 1,17e9 (22.11. ohne Backup), k = up / Überlappungs-Schätzung
    const e7 = ref('7d');
    expect(v.ranges['7d'].est).toBe(Math.round(e7.all));
    expect(v.ranges['7d'].up).toBe(Math.round(7 * 1.17e9));
    expect(v.ranges['7d'].k).toBeCloseTo(1.2, 6);
    expect(v.ranges['7d'].scaled).toBe(true);
    expect(v.ranges['7d'].cov).toBeCloseTo(6000 / 7200, 4);
    // 30d: k außerhalb [0,5; 2,5] -> Rückfall k = 1
    expect(v.ranges['30d'].up).toBe(Math.round(23 * 3e9 + 7 * 1.17e9));
    expect(v.ranges['30d'].scaled).toBe(false);
    expect(v.ranges['30d'].k).toBe(1);
    // year/all: Monate ab since minus bkm; Überlappungs-Schätzung ohne Wiedergaben vor since
    const ov = ref('year', 5).all;
    for (const r of ['year', 'all']) {
      expect(v.ranges[r].up).toBe(21e9);
      expect(v.ranges[r].k).toBeCloseTo(21e9 / ov, 5);
      expect(v.ranges[r].scaled).toBe(true);
    }
    // users: ohne Ignorierliste, skaliert, ganzes Fenster
    for (const r of Object.keys(RI)) {
      const e = ref(r);
      expect(Object.keys(v.users[r]).sort()).toEqual(Object.keys(e.per).sort());
      expect(v.users[r][U3]).toBeUndefined();
      for (const [uid, b] of Object.entries(e.per)) expect(v.users[r][uid]).toBe(Math.round(b * v.ranges[r].k));
    }
  });

  it('PFLICHT: Σ users/(est·k) + Anteil Ignorierliste = 1 je Fenster (mehrere Konten, Wiedergaben vor since)', async () => {
    vi.stubGlobal('fetch', makeFetch());
    await runVol(makeEnv({ 'srv:report:v1': REPORT }), {});
    const v = stored();
    const ks = new Set();
    for (const r of Object.keys(RI)) {
      const { est, k } = v.ranges[r];
      ks.add(k);
      const sumUsers = Object.values(v.users[r]).reduce((a, b) => a + b, 0);
      const ign = ref(r).ign; // unabhängig aus dem Fixture
      expect(ign).toBeGreaterThan(0);
      expect(sumUsers / (est * k) + ign / est).toBeCloseTo(1, 9);
    }
    expect([...ks].some((k) => k !== 1)).toBe(true);
    expect(ref('all').all).toBeGreaterThan(ref('all', 5).all); // Fixture hat Wiedergaben vor since
  });

  it('Ignorierliste zählt in est (vnstat zählt alles), aber nicht in users', async () => {
    vi.stubGlobal('fetch', makeFetch());
    await runVol(makeEnv({ 'srv:report:v1': REPORT }), {});
    const v = stored();
    const withoutIgn = ref('7d').all - ref('7d').ign;
    expect(v.ranges['7d'].est).toBe(Math.round(ref('7d').all));
    expect(v.ranges['7d'].est).toBeGreaterThan(withoutIgn);
    expect(JSON.stringify(v.users)).not.toContain(U3);
  });

  it('SQL: Überlappungsbeginn aus since geprüft eingesetzt, UserList-Kennzeichen, LIMIT; ohne Bericht keine o-Spalten und k = 1', async () => {
    vi.stubGlobal('fetch', makeFetch());
    await runVol(makeEnv({ 'srv:report:v1': REPORT }), {});
    const sql = sqls.find((s) => /GROUP BY/.test(s));
    expect(sql).toContain("max(date('now','localtime','-6 days'), '2026-10-07')");
    expect(sql).toContain("SUM(CASE WHEN DateCreated >= '2026-10-07' THEN PlayDuration ELSE 0 END) AS oa");
    expect(sql).toContain('UserId IN (SELECT UserId FROM UserList)');
    expect(sql).toContain("date('now','localtime') AS today");
    expect(sql).toContain(`LIMIT ${VOL_ROW_LIMIT}`);
    expect(sql).toContain("ItemType IN ('Movie','Episode')");
    expect(() => buildVolRows({ day: "2026-10-07'; DROP", mon: '2026-10-07' })).toThrow();

    sqls = [];
    const rows = sqlRows().map((r) => [...r.slice(0, 8), r[12]]);
    vi.stubGlobal('fetch', makeFetch({ rows: () => table(['today', 'u', 'i', 't', 'w7', 'w30', 'wy', 'wa', 'ig'], rows) }));
    await runVol(makeEnv({ 'srv:report:v1': { ...REPORT, traffic: { ...REPORT.traffic, since: "x' OR 1" } } }), {});
    expect(sqls.find((s) => /GROUP BY/.test(s))).not.toMatch(/ AS o7/);
    for (const r of Object.values(stored().ranges)) {
      expect(r.up).toBeNull();
      expect(r.k).toBe(1);
      expect(r.scaled).toBe(false);
    }
  });

  it('veralteter Bericht (> 48 h) -> up null, k = 1', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const old = { ...REPORT, traffic: { ...REPORT.traffic, at: NOW - 50 * 3600e3 } };
    await runVol(makeEnv({ 'srv:report:v1': old }), {});
    expect(stored().ranges['7d']).toMatchObject({ up: null, k: 1, scaled: false });
  });

  it('Median-Rückfall: ohne bekannte Bitraten 8000/4000, bekannte Bitrate 0 zählt nicht als bekannt (cov)', async () => {
    vi.stubGlobal('fetch', makeFetch({ items: (ids) => json({ Items: ids.map((id) => ({ Id: id, MediaSources: [{ Bitrate: 0 }] })) }) }));
    await runVol(makeEnv({}), {});
    const v = stored();
    expect(v.fb).toEqual({ movie: 8000, episode: 4000 });
    expect(Object.values(v.br).every((x) => x === 0)).toBe(true);
    expect(v.ranges['7d'].cov).toBe(0);
    const s7 = 3600 * 8000 + 1800 * 4000 + 1200 * 4000 + 600 * 8000;
    expect(v.ranges['7d'].est).toBe(s7 * 125);
  });

  it('fehlgeschlagener Block schreibt nichts für seine Titel; nächster Lauf holt sie nach', async () => {
    vi.stubGlobal('fetch', makeFetch({ items: () => json({ error: 1 }, 500) }));
    const env = makeEnv({ 'srv:report:v1': REPORT });
    await runVol(env, {});
    const v = stored();
    expect(v.br).toEqual({});
    expect(v.ranges['7d'].cov).toBe(0);
    expect(errSpy.mock.calls.every((c) => c.length === 1 && c[0] === 'srv: vol')).toBe(true);
    vi.stubGlobal('fetch', makeFetch());
    await runVol(env, {});
    expect(Object.keys(stored().br)).toHaveLength(5);
  });

  it('Größendeckel: Antwort über 2 MB wird verworfen; kaputtes JSON ebenso', async () => {
    const huge = JSON.stringify({ Items: [{ Id: M1, MediaSources: [{ Bitrate: 1e7 }] }], pad: 'x'.repeat(BR_MAX_TEXT) });
    vi.stubGlobal('fetch', makeFetch({ items: () => new Response(huge) }));
    await runVol(makeEnv({}), {});
    expect(stored().br).toEqual({});
    vi.stubGlobal('fetch', makeFetch({ items: () => new Response('{kaputt') }));
    await runVol(makeEnv({}), {});
    expect(stored().br).toEqual({});
  });

  it('approx bei erreichtem LIMIT', async () => {
    const many = Array.from({ length: VOL_ROW_LIMIT }, (_, n) => {
      const id = n.toString(16).padStart(32, '0');
      return ['2026-11-25', U1, id, 'Episode', '1', '1', '1', '1', '1', '1', '1', '1', '0'];
    });
    const brOld = Object.fromEntries(many.map((r) => [r[2], 4000]));
    vi.stubGlobal('fetch', makeFetch({ rows: () => table(ROW_COLS, many), ids: () => table(['ItemId', 'ItemType'], many.map((r) => [r[2], 'Episode'])) }));
    await runVol(makeEnv({ [VOL_KEY]: { v: 1, at: 1, br: brOld } }), {});
    const v = stored();
    expect(v.approx).toBe(1);
    expect(itemCalls).toHaveLength(0);
  });

  it('Subrequests: höchstens 10 je Lauf (KV 2+1, SQL 2, Admin 1, /Items <= 4) auch bei vielen fehlenden Titeln', async () => {
    const rows = Array.from({ length: 600 }, (_, n) => ['2026-11-25', U1, n.toString(16).padStart(32, '0'), 'Movie', '10', '10', '10', '10', '10', '10', '10', '10', '0']);
    vi.stubGlobal('fetch', makeFetch({ rows: () => table(ROW_COLS, rows), ids: () => table(['ItemId', 'ItemType'], rows.map((r) => [r[2], 'Movie'])) }));
    await runVol(makeEnv({ 'srv:report:v1': REPORT }), {});
    expect(itemCalls).toHaveLength(BR_BLOCKS);
    expect(ops.get + ops.put + ops.fetch).toBeLessThanOrEqual(10);
    expect(ops).toEqual({ get: 2, put: 1, fetch: 7 });
    expect(Object.keys(stored().br)).toHaveLength(BR_BLOCKS * 50);
  });

  it('ohne fehlende Titel kein Admin- und kein /Items-Abruf (6 Subrequests)', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const env = makeEnv({ 'srv:report:v1': REPORT });
    await runVol(env, {});
    sqls = [];
    itemCalls = [];
    ops = { get: 0, put: 0, fetch: 0 };
    await runVol(env, {});
    expect(itemCalls).toHaveLength(0);
    expect(ops).toEqual({ get: 2, put: 1, fetch: 2 });
  });

  it('Volumen-SQL scheitert -> kein /Items, kein Put, alter Stand bleibt', async () => {
    const prev = { v: 1, at: 5, br: { [M1]: 9 }, fb: { movie: 1, episode: 1 }, ranges: {}, users: {} };
    vi.stubGlobal('fetch', makeFetch({ rows: () => json({}, 500) }));
    const env = makeEnv({ [VOL_KEY]: prev });
    await expect(runVol(env, {})).resolves.toBeUndefined();
    expect(ops.put).toBe(0);
    expect(itemCalls).toHaveLength(0);
    expect(stored()).toEqual(prev);
  });

  it('Teilfehler ID-Abfrage: alter br bleibt (kein Ausdünnen), Titel aus den Volumen-Zeilen werden ergänzt', async () => {
    const stale = hex('9');
    vi.stubGlobal('fetch', makeFetch({ ids: () => json({}, 500) }));
    await runVol(makeEnv({ [VOL_KEY]: { v: 1, at: 1, br: { [stale]: 1234, [M1]: 10000, bad: 5 } } }), {});
    const v = stored();
    expect(v.br[stale]).toBe(1234);
    expect(v.br.bad).toBeUndefined();
    expect(v.br[E1]).toBe(5000);
    // mit erfolgreicher ID-Abfrage fällt der nicht mehr gespielte Titel heraus
    vi.stubGlobal('fetch', makeFetch());
    await runVol(makeEnv({ [VOL_KEY]: v }), {});
    expect(stored().br[stale]).toBeUndefined();
  });

  it('wirft nie und loggt nur den festen Code', async () => {
    vi.stubGlobal('fetch', makeFetch());
    const env = makeEnv({ 'srv:report:v1': REPORT });
    env.CHARTS.put = vi.fn(async () => {
      throw new Error(`kv ${U1}`);
    });
    await expect(runVol(env, {})).resolves.toBeUndefined();
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error(`net ${U1}`))));
    await expect(runVol(makeEnv({}), {})).resolves.toBeUndefined();
    await expect(runVol({}, {})).resolves.toBeUndefined();
    expect(errSpy).toHaveBeenCalled();
    for (const c of errSpy.mock.calls) expect(c).toEqual(['srv: vol']);
  });
});
