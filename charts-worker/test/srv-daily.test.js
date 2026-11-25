import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/srv/device.js', () => ({ deviceKind: () => 'other' }));

import { runDaily, runSlot, sweepConcurrent } from '../src/srv/daily.js';
import { clearMonthCache } from '../src/srv/month.js';

const ADMIN = 'aaaaaaaa'.repeat(4);
const UID = '0123456789abcdef0123456789abcdef';
const EP = (i) => i.toString(16).padStart(32, '0');
const S1 = '11111111111111111111111111111111';
const S2 = '22222222222222222222222222222222';

const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
const table = (colums, results) => json({ colums, results, message: '' });
const env = { JELLYFIN_URL: 'https://jf.example', JELLYFIN_API_KEY: 'KEY', CHARTS: null };

let kv;
let kvOps;
let sqls;
let now;
let fetchCount;

function makeKv() {
  kv = new Map();
  kvOps = { get: 0, put: 0 };
  return {
    get: vi.fn(async (k) => {
      kvOps.get++;
      return kv.has(k) ? JSON.parse(kv.get(k)) : null;
    }),
    put: vi.fn(async (k, v) => {
      kvOps.put++;
      kv.set(k, v);
    }),
  };
}
const stored = (k) => (kv.has(k) ? JSON.parse(kv.get(k)) : null);

const sqlKind = (sql) => {
  if (/AS monthStartUtc/.test(sql)) return 'meta';
  if (/OVER \(/.test(sql)) return 'conc';
  if (/AS dur/.test(sql)) return 'concRows';
  if (/ORDER BY n DESC LIMIT/.test(sql)) return 'cand';
  if (/AND \(\(substr/.test(sql)) return 'eps';
  if (/AS ym, SUM/.test(sql)) return 'recMonth';
  if (/AS d, SUM\(PlayDuration\) AS secs/.test(sql)) return 'recDay';
  throw new Error(`unbekannte Abfrage: ${sql.slice(0, 60)}`);
};

const DEF = {
  meta: () => table(['ym', 'today', 'monthStartUtc', 'first'], [['2026-11', '2026-11-25', '2026-10-31 23:00:00', '2026-02']]),
  recDay: () => table(['d', 'secs'], [['2026-05-01', '30000']]),
  recMonth: () => table(['ym', 'secs'], [['2026-05', '300000']]),
  conc: () => table(['date', 'n'], [['2026-11-08', '3']]),
  cand: () => table(['d', 'u', 'n'], [['2026-11-10', UID, '3']]),
  eps: () =>
    table(
      ['d', 'u', 'ItemId'],
      [1, 2, 3].map((i) => ['2026-11-10', UID, EP(i)]),
    ),
};

const newItem = (type, iso) => ({ Id: 'x', Type: type, DateCreated: iso });
const NEW_DEFAULT = () => [
  newItem('Episode', '2026-11-02T10:00:00.0000000Z'),
  newItem('Episode', '2026-11-01T10:00:00.0000000Z'),
  newItem('Movie', '2026-10-31T23:30:00.0000000Z'),
  newItem('Movie', '2026-10-01T10:00:00.0000000Z'),
];

/** o.sql[kind] (Response|throw), o.counts, o.newPage(p), o.series. */
function makeFetch(o = {}) {
  return vi.fn(async (url, init = {}) => {
    fetchCount++;
    const u = String(url);
    if (u.endsWith('/user_usage_stats/submit_custom_query')) {
      const sql = JSON.parse(init.body).CustomQueryString;
      sqls.push(sql);
      const k = sqlKind(sql);
      return (o.sql?.[k] ?? DEF[k])(sql);
    }
    if (u.endsWith('/Users')) return json([{ Id: ADMIN, Policy: { IsAdministrator: true } }]);
    if (u.endsWith('/Items/Counts')) {
      return o.counts ? o.counts() : json({ MovieCount: 681, SeriesCount: 157, EpisodeCount: 9224 });
    }
    if (u.includes('/Items?')) {
      const sp = new URL(u).searchParams;
      if (sp.get('Ids')) {
        if (o.series) return o.series();
        const ids = sp.get('Ids').split(',');
        return json({ Items: ids.map((id, i) => ({ Id: id, SeriesId: i < 2 ? S1 : S2 })) });
      }
      if (sp.get('SortBy') === 'DateCreated') {
        const p = Number(sp.get('StartIndex')) / 200;
        if (o.newPage) return o.newPage(p);
        return json({ Items: p === 0 ? NEW_DEFAULT() : [] });
      }
      if (sp.get('SortBy') === 'SortName') {
        const start = Number(sp.get('StartIndex'));
        const total = o.libTotal ?? 4500;
        const n = Math.max(0, Math.min(2000, total - start));
        return json({
          TotalRecordCount: total,
          Items: Array.from({ length: n }, (_, i) => ({ Id: `i${start + i}`, RunTimeTicks: 100_000_000 })),
        });
      }
    }
    throw new Error(`unerwartet: ${u}`);
  });
}

const fail500 = () => json({}, 500);

beforeEach(() => {
  clearMonthCache();
  sqls = [];
  fetchCount = 0;
  now = 1_800_000_000_000;
  env.CHARTS = makeKv();
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runDaily', () => {
  it('schreibt Bibliothek und Rekorde mit genau einem put, Rekorde nur {n,date}', async () => {
    vi.stubGlobal('fetch', makeFetch());
    expect(await runDaily(env)).toEqual({ ok: true });
    expect(kvOps.put).toBe(1);
    const d = stored('srv:daily:v1');
    expect(d).toMatchObject({ v: 1, at: now, monthStartUtc: '2026-10-31 23:00:00' });
    expect(d.library).toEqual({ movies: 681, series: 157, episodes: 9224, newMovies: 1, newEpisodes: 2, ym: '2026-11' });
    expect(d.records.day).toEqual({ d: '2026-05-01', secs: 30000 });
    expect(d.records.month).toEqual({ ym: '2026-05', secs: 300000 });
    expect(d.records.conc).toEqual({ n: 3, date: '2026-11-08' });
    // 3 Folgen: 2 von Serie S1, 1 von S2 -> Marathon 2
    expect(d.records.binge).toEqual({ n: 2, date: '2026-11-10' });
    expect(d.records.approx).toBeUndefined();
    expect(JSON.stringify(d)).not.toContain(UID);
    for (const s of sqls) expect(s).toContain('UserId NOT IN (SELECT UserId FROM UserList)');
  });

  it('Neuzugänge: 3 Seiten ohne Ende ergeben newCapped', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch({
        newPage: () =>
          json({
            Items: Array.from({ length: 200 }, (_, i) => newItem(i % 2 ? 'Movie' : 'Episode', '2026-11-20T10:00:00.0000000Z')),
          }),
      }),
    );
    await runDaily(env);
    const lib = stored('srv:daily:v1').library;
    expect(lib).toMatchObject({ newMovies: 300, newEpisodes: 300, newCapped: 1 });
  });

  it('Meta scheitert: ok:false, kein Schreiben', async () => {
    vi.stubGlobal('fetch', makeFetch({ sql: { meta: fail500 } }));
    expect(await runDaily(env)).toEqual({ ok: false, code: 'meta' });
    expect(kvOps.put).toBe(0);
  });

  it('Teilfehler: alter Stand bleibt (Merge), at lässt den Nachholslot zu', async () => {
    const oldAt = now - 30 * 3600 * 1000;
    kv.set(
      'srv:daily:v1',
      JSON.stringify({
        v: 1,
        at: oldAt,
        monthStartUtc: 'x',
        library: { movies: 1, series: 2, episodes: 3, newMovies: 7, newEpisodes: 8, ym: '2026-10' },
        records: { day: { d: '2026-01-01', secs: 5 }, conc: { n: 5, date: '2026-03-03' }, binge: { n: 9, date: '2026-04-04' } },
      }),
    );
    vi.stubGlobal(
      'fetch',
      makeFetch({
        counts: fail500,
        sql: { conc: fail500, concRows: fail500 },
      }),
    );
    expect(await runDaily(env)).toEqual({ ok: false, code: 'partial' });
    const d = stored('srv:daily:v1');
    expect(d.library).toMatchObject({ movies: 1, series: 2, episodes: 3, newMovies: 1, newEpisodes: 2, ym: '2026-11' });
    expect(d.records.conc).toEqual({ n: 5, date: '2026-03-03' }); // alt
    expect(d.records.day).toEqual({ d: '2026-05-01', secs: 30000 }); // neu (größer)
    expect(d.records.binge).toEqual({ n: 9, date: '2026-04-04' }); // neu 2 < alt 9
    expect(d.at).toBeLessThanOrEqual(now - 19 * 3600 * 1000);
    expect(d.at).toBe(oldAt);
  });

  it('ohne full: Maximum aus Alt und Neu; full ersetzt', async () => {
    const seed = () =>
      kv.set(
        'srv:daily:v1',
        JSON.stringify({ v: 1, at: 1, library: {}, records: { conc: { n: 5, date: '2026-03-03' }, binge: { n: 9, date: '2026-04-04' } } }),
      );
    seed();
    vi.stubGlobal('fetch', makeFetch());
    await runDaily(env);
    let r = stored('srv:daily:v1').records;
    expect(r.conc).toEqual({ n: 5, date: '2026-03-03' });
    expect(r.binge).toEqual({ n: 9, date: '2026-04-04' });
    // neuer Wert größer -> übernommen
    vi.stubGlobal('fetch', makeFetch({ sql: { conc: () => table(['date', 'n'], [['2026-11-09', '7']]) } }));
    await runDaily(env);
    r = stored('srv:daily:v1').records;
    expect(r.conc).toEqual({ n: 7, date: '2026-11-09' });
    // full: ersetzt, auch wenn kleiner
    vi.stubGlobal('fetch', makeFetch());
    await runDaily(env, { full: true });
    r = stored('srv:daily:v1').records;
    expect(r.conc).toEqual({ n: 3, date: '2026-11-08' });
    expect(r.binge).toEqual({ n: 2, date: '2026-11-10' });
    expect(sqls.some((s) => /DateCreated >= datetime\('now','localtime','start of month','-1 months'\)/.test(s))).toBe(true);
    expect(sqls.at(-1)).not.toMatch(/-1 months/);
  });

  it('Gleichzeitige Streams: Rückfall auf den Sweep im Worker', async () => {
    const rows = [
      ['2026-11-04 20:00:00', '600'],
      ['2026-11-04 20:05:00', '600'],
      ['2026-11-04 20:09:00', '600'],
      ['2026-11-05 10:00:00', '60'], // Ende 10:01:00, nächster startet dort -> kein Überlapp
      ['2026-11-05 10:01:00', '60'],
    ];
    vi.stubGlobal(
      'fetch',
      makeFetch({
        sql: { conc: fail500, concRows: () => table(['s', 'dur'], rows) },
      }),
    );
    await runDaily(env);
    expect(stored('srv:daily:v1').records.conc).toEqual({ n: 3, date: '2026-11-04' });
    expect(stored('srv:daily:v1').records.approx).toBeUndefined();
  });

  it('Marathon ohne auflösbare Serien: Näherung mit approx', async () => {
    vi.stubGlobal('fetch', makeFetch({ series: fail500 }));
    await runDaily(env);
    const r = stored('srv:daily:v1').records;
    expect(r.binge).toEqual({ n: 3, date: '2026-11-10' });
    expect(r.approx).toBe(1);
  });

  it('Marathon: ungültiger Kandidat (Einschleusversuch) wird nie ins SQL gesetzt', async () => {
    vi.stubGlobal(
      'fetch',
      makeFetch({ sql: { cand: () => table(['d', 'u', 'n'], [["2026-11-10' OR 1=1 --", UID, '9']]) } }),
    );
    await runDaily(env);
    expect(sqls.some((s) => /AND \(\(substr/.test(s))).toBe(false);
  });
});

describe('sweepConcurrent', () => {
  it('Ende vor Start bei gleicher Sekunde, ungültige Zeilen werden ignoriert', () => {
    expect(
      sweepConcurrent([
        { s: '2026-11-05 10:00:00', dur: '60' },
        { s: '2026-11-05 10:01:00', dur: '60' },
        { s: 'kaputt', dur: '60' },
        { s: '2026-11-05 10:00:00', dur: '0' },
      ]),
    ).toEqual({ n: 1, date: '2026-11-05' });
    expect(sweepConcurrent([])).toBeNull();
  });
});

describe('runSlot', () => {
  it('wirft nie, auch wenn KV und Netz kaputt sind', async () => {
    env.CHARTS = {
      get: vi.fn(async () => {
        throw new Error('kv');
      }),
      put: vi.fn(async () => {
        throw new Error('kv');
      }),
    };
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('net');
    }));
    await expect(runSlot(env, {})).resolves.toBeUndefined();
  });

  it('höchstens 30 Subrequests je Slot (fetch + KV), höchstens 2 puts', async () => {
    const f = makeFetch();
    vi.stubGlobal('fetch', f);
    await runSlot(env, {});
    expect(fetchCount + kvOps.get + kvOps.put).toBeLessThanOrEqual(30);
    expect(kvOps.put).toBeLessThanOrEqual(2);
    expect(stored('srv:daily:v1')).not.toBeNull();
    expect(stored('srv:lib:v1')).toMatchObject({ v: 1, cursor: 2000 });
  });

  it('Bibliotheks-Cursor über mehrere Slots bis runtimeS, danach 20 h Ruhe', async () => {
    vi.stubGlobal('fetch', makeFetch());
    await runSlot(env, {});
    expect(stored('srv:lib:v1')).toMatchObject({ cursor: 2000, partS: 20000 });
    now += 6 * 3600 * 1000;
    await runSlot(env, {});
    expect(stored('srv:lib:v1')).toMatchObject({ cursor: 4000, partS: 40000 });
    const dailyAt = stored('srv:daily:v1').at;
    expect(dailyAt).toBe(1_800_000_000_000); // Tageslauf nicht erneut (jünger als 20 h)
    now += 6 * 3600 * 1000;
    await runSlot(env, {});
    expect(stored('srv:lib:v1')).toMatchObject({ cursor: 0, partS: 0, runtimeS: 45000, doneAt: now });
    // Ruhe: keine Abfrage, kein put
    const before = { f: fetchCount, p: kvOps.put };
    now += 6 * 3600 * 1000;
    await runSlot(env, {});
    expect(fetchCount).toBe(before.f);
    expect(kvOps.put).toBe(before.p);
    // nach 20 h neuer Durchlauf, runtimeS bleibt bis zum Ende erhalten
    now += 15 * 3600 * 1000;
    await runSlot(env, {});
    expect(stored('srv:lib:v1')).toMatchObject({ cursor: 2000, runtimeS: 45000 });
  });

  it('Nachhol-Slot: gescheiterter Tageslauf wird im nächsten Slot erneut versucht', async () => {
    vi.stubGlobal('fetch', makeFetch({ sql: { meta: fail500 } }));
    await runSlot(env, {});
    expect(stored('srv:daily:v1')).toBeNull();
    now += 6 * 3600 * 1000;
    clearMonthCache();
    vi.stubGlobal('fetch', makeFetch());
    await runSlot(env, {});
    expect(stored('srv:daily:v1')).toMatchObject({ v: 1, at: now });
  });

  it('Teilfehler wird im nächsten Slot nachgeholt, ein frischer Lauf nicht', async () => {
    vi.stubGlobal('fetch', makeFetch({ counts: fail500 }));
    await runSlot(env, {});
    expect(stored('srv:daily:v1').at).toBeLessThanOrEqual(now - 19 * 3600 * 1000);
    now += 6 * 3600 * 1000;
    vi.stubGlobal('fetch', makeFetch());
    await runSlot(env, {});
    expect(stored('srv:daily:v1').at).toBe(now);
    expect(stored('srv:daily:v1').library.movies).toBe(681);
    const n = sqls.length;
    now += 6 * 3600 * 1000;
    await runSlot(env, {});
    expect(sqls.length).toBe(n); // kein dritter Tageslauf
  });

  it('Bibliotheksfehler lässt den Cursor unverändert', async () => {
    vi.stubGlobal('fetch', makeFetch());
    await runSlot(env, {});
    const before = kv.get('srv:lib:v1');
    now += 6 * 3600 * 1000;
    const f = makeFetch();
    vi.stubGlobal('fetch', async (url, init) => {
      if (String(url).includes('SortBy=SortName')) return json({}, 500);
      return f(url, init);
    });
    await runSlot(env, {});
    expect(kv.get('srv:lib:v1')).toBe(before);
  });
});
