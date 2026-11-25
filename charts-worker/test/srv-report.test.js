import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearReportState, handleReport, sanitizeReport } from '../src/srv/report.js';

const SECRET = 's'.repeat(40);
const NOW = Date.UTC(2026, 10, 25, 12, 0, 0);

function kvFake(initial) {
  const store = new Map(initial ? [['srv:report:v1', JSON.stringify(initial)]] : []);
  return {
    store,
    get: vi.fn(async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null)),
    put: vi.fn(async (k, v) => void store.set(k, v)),
  };
}
const makeEnv = (over = {}, initial) => ({ SERVER_REPORT_SECRET: SECRET, CHARTS: kvFake(initial), ...over });
const post = (body, headers = {}, raw) =>
  new Request('https://charts.example/srv/report', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json', 'CF-Connecting-IP': '1.2.3.4', ...headers },
    body: raw ?? JSON.stringify(body),
  });
const month = (y, m, rx, tx) => ({ date: { year: y, month: m }, rx, tx });
const day = (y, m, d, rx, tx) => ({ date: { year: y, month: m, day: d }, rx, tx });
const vn = (traffic, jsonversion = '2') => ({ jsonversion, interfaces: [{ name: 'eth0', traffic }] });
const GOOD = {
  v: 1,
  host: { tempC: 51.2, cpuPct: 12.5, load: [0.4, 0.3, 0.2], cores: 4, memTotal: 8e9, memAvail: 5e9, uptimeS: 123456 },
  disks: [{ l: 'Medien', size: 1000, used: 400, avail: 600 }],
  vnstat: { m: vn({ month: [month(2026, 11, 100, 500)] }), d: vn({ day: [day(2026, 11, 25, 10, 50)] }) },
};

beforeEach(() => {
  clearReportState();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('handleReport', () => {
  it('404 srv-off ohne Secret oder mit zu kurzem Secret', async () => {
    for (const s of [undefined, '', 'kurz']) {
      const res = await handleReport(post(GOOD), makeEnv({ SERVER_REPORT_SECRET: s }));
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('srv-off');
    }
  });

  it('401 bei falschem oder fehlendem Bearer, 429 nach 6 Fehlversuchen je IP', async () => {
    const env = makeEnv();
    for (let i = 0; i < 6; i++) expect((await handleReport(post(GOOD, { Authorization: 'Bearer falsch' }), env)).status).toBe(401);
    expect((await handleReport(post(GOOD, { Authorization: 'Bearer falsch' }), env)).status).toBe(429);
    const other = post(GOOD, { Authorization: '', 'CF-Connecting-IP': '9.9.9.9' });
    expect((await handleReport(other, env)).status).toBe(401);
    expect(env.CHARTS.put).not.toHaveBeenCalled();
  });

  it('415 bei falschem Content-Type', async () => {
    const res = await handleReport(post(GOOD, { 'Content-Type': 'text/plain' }), makeEnv());
    expect(res.status).toBe(415);
  });

  it('413 über den Content-Length-Header', async () => {
    const res = await handleReport(post(GOOD, { 'Content-Length': '70000' }), makeEnv());
    expect(res.status).toBe(413);
  });

  it('413 beim gestreamten Lesen ohne ehrlichen Header', async () => {
    const chunk = new TextEncoder().encode('x'.repeat(40000));
    const stream = new ReadableStream({
      start(c) {
        c.enqueue(chunk);
        c.enqueue(chunk);
        c.close();
      },
    });
    const req = new Request('https://charts.example/srv/report', {
      method: 'POST',
      headers: { Authorization: `Bearer ${SECRET}`, 'Content-Type': 'application/json' },
      body: stream,
      duplex: 'half',
    });
    const env = makeEnv();
    expect((await handleReport(req, env)).status).toBe(413);
    expect(env.CHARTS.put).not.toHaveBeenCalled();
  });

  it('400 bei kaputtem JSON und bei nicht verwertbarem Body', async () => {
    const env = makeEnv();
    expect((await handleReport(post(null, {}, '{kaputt'), env)).status).toBe(400);
    const res = await handleReport(post({ v: 1, foo: 'bar' }), env);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('bad-body');
    expect((await handleReport(post([1, 2]), env)).status).toBe(400);
    expect(env.CHARTS.put).not.toHaveBeenCalled();
  });

  it('200 schreibt einen bereinigten Datensatz', async () => {
    const env = makeEnv();
    const res = await handleReport(post(GOOD), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(env.CHARTS.put).toHaveBeenCalledTimes(1);
    const rec = JSON.parse(env.CHARTS.put.mock.calls[0][1]);
    expect(rec).toMatchObject({
      v: 1,
      at: NOW,
      health: { at: NOW, tempC: 51.2, cpuPct: 12.5, load: [0.4, 0.3, 0.2], cores: 4, mem: { total: 8e9, avail: 5e9 }, uptimeS: 123456 },
      disks: { at: NOW, list: [{ l: 'Medien', size: 1000, used: 400, avail: 600 }] },
      traffic: { at: NOW, days: [{ d: '2026-11-25', rx: 10, tx: 50 }], months: [{ ym: '2026-11', rx: 100, tx: 500 }] },
      rec: { tx: { ym: '2026-11', bytes: 500 } },
    });
  });

  it('Schreibbremse: zweite Meldung innerhalb 10 min -> skipped, kein put; danach wieder put', async () => {
    const env = makeEnv();
    await handleReport(post(GOOD), env);
    vi.setSystemTime(NOW + 5 * 60000);
    const res = await handleReport(post(GOOD), env);
    expect(await res.json()).toEqual({ ok: true, skipped: 1 });
    expect(env.CHARTS.put).toHaveBeenCalledTimes(1);
    vi.setSystemTime(NOW + 11 * 60000);
    expect(await (await handleReport(post(GOOD), env)).json()).toEqual({ ok: true });
    expect(env.CHARTS.put).toHaveBeenCalledTimes(2);
  });

  it('Schreibbremse greift auch über das KV-at ohne Isolate-Merker', async () => {
    const env = makeEnv({}, { v: 1, at: NOW - 60000, health: { at: NOW - 60000, tempC: 40 } });
    expect(await (await handleReport(post(GOOD), env)).json()).toEqual({ ok: true, skipped: 1 });
    expect(env.CHARTS.put).not.toHaveBeenCalled();
  });

  it('Fremdfelder im Body landen nicht im KV', async () => {
    const env = makeEnv();
    const evil = {
      ...GOOD,
      evil: 'ROOT',
      host: { ...GOOD.host, hostname: 'geheim-host', ip: '10.0.0.5' },
      disks: [{ l: 'Medien', size: 1, used: 1, avail: 0, mount: '/srv/geheim' }],
      vnstat: { m: { ...vn({ month: [month(2026, 11, 1, 2)] }), extra: 'X' }, d: GOOD.vnstat.d, secret: 'Y' },
    };
    await handleReport(post(evil), env);
    const text = env.CHARTS.put.mock.calls[0][1];
    for (const w of ['evil', 'ROOT', 'geheim', '10.0.0.5', 'mount', 'extra', 'eth0']) expect(text).not.toContain(w);
  });
});

describe('sanitizeReport', () => {
  it('klemmt Zahlen und verwirft Ungültiges', () => {
    const r = sanitizeReport(
      {
        host: { tempC: 999, cpuPct: -5, load: [1, 'x', 3], cores: 5000, memTotal: 1e30, memAvail: 1, uptimeS: 1e12 },
        disks: [
          { l: 'ok-1', size: 1, used: 1, avail: 1 },
          { l: 'böse/../', size: 1, used: 1, avail: 1 },
          { l: 'x'.repeat(25), size: 1, used: 1, avail: 1 },
          { l: 'nan', size: 'a', used: 1, avail: 1 },
          { l: 'Daten ß', size: -4, used: 1, avail: 1 },
        ],
      },
      null,
      NOW,
    );
    expect(r.health.tempC).toBe(150);
    expect(r.health.cpuPct).toBe(0);
    expect(r.health.load).toBeUndefined();
    expect(r.health.cores).toBe(1024);
    expect(r.health.mem).toEqual({ total: 1e16, avail: 1 });
    expect(r.health.uptimeS).toBe(10 * 365 * 86400);
    expect(r.disks.list.map((d) => d.l)).toEqual(['ok-1', 'Daten ß']);
    expect(r.disks.list[1].size).toBe(0);
    expect(r.traffic).toBeUndefined();
  });

  it('höchstens 6 Platten', () => {
    const disks = Array.from({ length: 9 }, (_, i) => ({ l: `P${i}`, size: 1, used: 1, avail: 1 }));
    expect(sanitizeReport({ disks }, null, NOW).disks.list).toHaveLength(6);
  });

  it('Traffic nur bei vnstat jsonversion 2', () => {
    const v1 = { vnstat: { m: vn({ month: [month(2026, 11, 1, 2)] }, '1'), d: vn({ day: [day(2026, 11, 1, 1, 2)] }, '1') } };
    expect(sanitizeReport(v1, null, NOW)).toBeNull();
    const v2 = sanitizeReport({ vnstat: { m: vn({ month: [month(2026, 11, 1, 2)] }) } }, null, NOW);
    expect(v2.traffic.months).toEqual([{ ym: '2026-11', rx: 1, tx: 2 }]);
    expect(v2.traffic.days).toEqual([]);
  });

  it('Merge: ohne Traffic bleibt der Traffic, ohne Platten die alten Platten, ohne Health der alte', () => {
    const prev = sanitizeReport(GOOD, null, NOW - 3600e3);
    const r = sanitizeReport({ host: { tempC: 60 } }, prev, NOW);
    expect(r.traffic).toEqual(prev.traffic);
    expect(r.disks).toEqual(prev.disks);
    expect(r.health.tempC).toBe(60);
    expect(r.health.at).toBe(NOW);
    const r2 = sanitizeReport({ disks: [{ l: 'A', size: 1, used: 1, avail: 0 }] }, prev, NOW);
    expect(r2.health).toEqual(prev.health);
    expect(r2.disks.list[0].l).toBe('A');
    const r3 = sanitizeReport({ host: { tempC: 1 }, disks: [] }, prev, NOW);
    expect(r3.disks).toEqual(prev.disks);
  });

  it('Merge: kleinere Monats- und Tageswerte senken nicht, neue Schlüssel kommen dazu, sortiert', () => {
    const prev = sanitizeReport(GOOD, null, NOW - 3600e3);
    const r = sanitizeReport(
      {
        vnstat: {
          m: vn({ month: [month(2026, 11, 1, 2), month(2026, 10, 7, 9000)] }),
          d: vn({ day: [day(2026, 11, 25, 20, 10), day(2026, 11, 24, 5, 5)] }),
        },
      },
      prev,
      NOW,
    );
    expect(r.traffic.months).toEqual([
      { ym: '2026-10', rx: 7, tx: 9000 },
      { ym: '2026-11', rx: 100, tx: 500 },
    ]);
    expect(r.traffic.days).toEqual([
      { d: '2026-11-24', rx: 5, tx: 5 },
      { d: '2026-11-25', rx: 20, tx: 50 },
    ]);
    expect(r.rec.tx).toEqual({ ym: '2026-10', bytes: 9000 });
  });

  it('rec.tx ist ein Maximum und sinkt nie; Obergrenzen 24 Monate und 62 Tage', () => {
    const prev = { v: 1, at: 1, rec: { tx: { ym: '2025-01', bytes: 1e12 } } };
    const months = Array.from({ length: 30 }, (_, i) => month(2024 + Math.floor(i / 12), (i % 12) + 1, 1, 2));
    const days = Array.from({ length: 70 }, (_, i) => day(2026, 1 + Math.floor(i / 28), (i % 28) + 1, 1, 2));
    const r = sanitizeReport({ vnstat: { m: vn({ month: months }), d: vn({ day: days }) } }, prev, NOW);
    expect(r.rec.tx).toEqual({ ym: '2025-01', bytes: 1e12 });
    expect(r.traffic.months).toHaveLength(24);
    expect(r.traffic.months.at(-1).ym).toBe('2026-06');
    expect(r.traffic.days).toHaveLength(62);
  });
});

describe('Backup-Abzug (bk, bkm, since)', () => {
  const GiB = 1024 ** 3;
  const hour = (y, m, d, h, tx) => ({ date: { year: y, month: m, day: d }, time: { hour: h, minute: 0 }, rx: 1, tx });
  const created = { date: { year: 2026, month: 10, day: 7 }, timestamp: 1791331200 };
  const vnH = (list, c = created) => ({ jsonversion: '2', interfaces: [{ name: 'eth0', created: c, traffic: { hour: list } }] });
  /** Stunden vom 21.11. 20:00 bis (Tag, Stunde) inklusive; am 22.11. Stunden 5/6/7 mit den Messwerten, sonst 0,1 GiB. */
  function hoursUntil(endD, endH) {
    const out = [];
    const spec = { 5: 4.54 * GiB, 6: 7.2 * GiB, 7: 5.25 * GiB };
    for (const [d, from] of [
      [21, 20],
      [22, 0],
      [23, 0],
    ]) {
      for (let h = from; h < 24; h++) {
        if (d > endD || (d === endD && h > endH)) return out;
        out.push(hour(2026, 11, d, h, d === 22 && spec[h] ? spec[h] : 0.1 * GiB));
      }
    }
    return out;
  }

  it('Backup aus Stunden: 22.11. Stunden 5/6/7 ergeben ≈ 16,99 GiB (src h), bkm dazu, since übernommen', () => {
    const r = sanitizeReport({ vnstat: { h: vnH(hoursUntil(23, 10)) } }, null, NOW);
    expect(r.traffic.bk).toHaveLength(1);
    expect(r.traffic.bk[0].d).toBe('2026-11-22');
    expect(r.traffic.bk[0].src).toBe('h');
    expect(r.traffic.bk[0].tx / GiB).toBeCloseTo(16.99, 2);
    expect(r.traffic.bkm).toEqual([{ ym: '2026-11', tx: r.traffic.bk[0].tx }]);
    expect(r.traffic.since).toBe('2026-10-07');
  });

  it('laufender Sonntag im Fenster ergibt keinen Wert, erst ab der Stunde nach dem Fenster', () => {
    for (const h of [4, 6, 7]) {
      const r = sanitizeReport({ vnstat: { h: vnH(hoursUntil(22, h)) } }, null, NOW);
      expect(r.traffic.bk).toBeUndefined();
    }
    const done = sanitizeReport({ vnstat: { h: vnH(hoursUntil(22, 8)) } }, null, NOW);
    expect(done.traffic.bk[0].tx / GiB).toBeCloseTo(16.99, 2);
  });

  it('Stundenreihe setzt erst im Fenster ein (Vorhaltezeit) -> kein halber Wert', () => {
    const list = hoursUntil(23, 10).filter((x) => !(x.date.day === 21 || (x.date.day === 22 && x.time.hour < 6)));
    expect(sanitizeReport({ vnstat: { h: vnH(list) } }, null, NOW).traffic.bk).toBeUndefined();
  });

  it('Backup-Fenster aus der Var; ungültig -> Standard; handleReport reicht env.SRV_BACKUP_WINDOW durch', async () => {
    const h = vnH(hoursUntil(23, 10));
    const mon = sanitizeReport({ vnstat: { h } }, null, NOW, '1:0-3'); // Montag 23.11. Stunden 0-2
    expect(mon.traffic.bk).toHaveLength(1);
    expect(mon.traffic.bk[0].d).toBe('2026-11-23');
    expect(mon.traffic.bk[0].tx / GiB).toBeCloseTo(0.3, 6);
    for (const bad of [undefined, 'x', '7:1-2', '0:8-5', '0:5-25', '']) {
      expect(sanitizeReport({ vnstat: { h } }, null, NOW, bad).traffic.bk[0].d).toBe('2026-11-22');
    }
    const env = makeEnv({ SRV_BACKUP_WINDOW: '1:0-3' });
    await handleReport(post({ vnstat: { h } }), env);
    expect(JSON.parse(env.CHARTS.store.get('srv:report:v1')).traffic.bk[0].d).toBe('2026-11-23');
  });

  /** Woche Mo 09.11. bis So 15.11., dazu Mo 16.11. (damit der Sonntag nicht der neueste Tag ist). */
  const week = (sun, monToSat = [10, 12, 11, 13, 9, 10]) => [
    ...monToSat.map((g, i) => day(2026, 11, 9 + i, 1, g * GiB)),
    day(2026, 11, 15, 1, sun * GiB),
    day(2026, 11, 16, 1, 10 * GiB),
  ];

  it('est-Heuristik: Sonntag minus Median Mo–Sa, gedeckelt auf 60 GiB, mind. 3 Vergleichstage', () => {
    const r = sanitizeReport({ vnstat: { d: vn({ day: week(30) }) } }, null, NOW);
    expect(r.traffic.bk).toEqual([{ d: '2026-11-15', tx: Math.round(19.5 * GiB), src: 'est' }]);
    expect(r.traffic.bkm).toEqual([{ ym: '2026-11', tx: Math.round(19.5 * GiB) }]);
    expect(sanitizeReport({ vnstat: { d: vn({ day: week(200) }) } }, null, NOW).traffic.bk[0].tx).toBe(64424509440);
    expect(sanitizeReport({ vnstat: { d: vn({ day: week(5) }) } }, null, NOW).traffic.bk[0].tx).toBe(0);
    const few = [day(2026, 11, 13, 1, GiB), day(2026, 11, 14, 1, GiB), day(2026, 11, 15, 1, 30 * GiB), day(2026, 11, 16, 1, GiB)];
    expect(sanitizeReport({ vnstat: { d: vn({ day: few }) } }, null, NOW).traffic.bk).toBeUndefined();
    // Sonntag als neuester Tag (läuft womöglich noch) -> kein Wert
    expect(sanitizeReport({ vnstat: { d: vn({ day: week(30).slice(0, 7) }) } }, null, NOW).traffic.bk).toBeUndefined();
  });

  it("Merge: 'h' ersetzt 'est', neuer 'est' lässt 'h' stehen, zwei 'h' -> Maximum, zwei 'est' -> neuer Wert", () => {
    const days22 = [16, 17, 18, 19, 20, 21]
      .map((d) => day(2026, 11, d, 1, 10 * GiB))
      .concat([day(2026, 11, 22, 1, 40 * GiB), day(2026, 11, 23, 1, GiB)]);
    const estOnly = sanitizeReport({ vnstat: { d: vn({ day: days22 }) } }, null, NOW - 3600e3);
    expect(estOnly.traffic.bk).toEqual([{ d: '2026-11-22', tx: 30 * GiB, src: 'est' }]);
    const withH = sanitizeReport({ vnstat: { d: vn({ day: days22 }), h: vnH(hoursUntil(23, 10)) } }, estOnly, NOW);
    expect(withH.traffic.bk).toHaveLength(1);
    expect(withH.traffic.bk[0].src).toBe('h');
    expect(withH.traffic.bk[0].tx / GiB).toBeCloseTo(16.99, 2);
    expect(withH.traffic.bkm).toEqual([{ ym: '2026-11', tx: 30 * GiB }]); // Monats-Merge per Maximum
    const again = sanitizeReport({ vnstat: { d: vn({ day: days22 }) } }, withH, NOW);
    expect(again.traffic.bk[0]).toEqual(withH.traffic.bk[0]);
    const smaller = hoursUntil(23, 10).map((x) => ({ ...x, tx: x.tx / 2 }));
    expect(sanitizeReport({ vnstat: { h: vnH(smaller) } }, withH, NOW).traffic.bk[0].tx).toBe(withH.traffic.bk[0].tx);
    const bigger = hoursUntil(23, 10).map((x) => ({ ...x, tx: x.tx * 2 }));
    expect(sanitizeReport({ vnstat: { h: vnH(bigger) } }, withH, NOW).traffic.bk[0].tx).toBe(withH.traffic.bk[0].tx * 2);
    // Vortage wachsen nachträglich (Tageswerte mergen per Maximum) -> kleinere neue Schätzung ersetzt die alte
    const days22b = days22.map((x) => (x.date.day < 22 ? day(2026, 11, x.date.day, 1, 15 * GiB) : x));
    const est2 = sanitizeReport({ vnstat: { d: vn({ day: days22b }) } }, estOnly, NOW);
    expect(est2.traffic.bk).toEqual([{ d: '2026-11-22', tx: 25 * GiB, src: 'est' }]);
  });

  it('bkm: voll abgedeckter Monat wird ersetzt (früher est 30 GiB, danach h 16,99 GiB), nicht per Maximum', () => {
    // Tage 01.11.-23.11.: 10 GiB, So 15.11. 30 GiB (est 20 GiB), So 22.11. 40 GiB (est 30 GiB)
    const tx = (d) => (d === 15 ? 30 : d === 22 ? 40 : 10) * GiB;
    const daysNov = Array.from({ length: 23 }, (_, i) => day(2026, 11, i + 1, 1, tx(i + 1)));
    const estOnly = sanitizeReport({ vnstat: { d: vn({ day: daysNov }) } }, null, NOW - 3600e3);
    expect(estOnly.traffic.bk).toEqual([
      { d: '2026-11-08', tx: 0, src: 'est' },
      { d: '2026-11-15', tx: 20 * GiB, src: 'est' },
      { d: '2026-11-22', tx: 30 * GiB, src: 'est' },
    ]);
    expect(estOnly.traffic.bkm).toEqual([{ ym: '2026-11', tx: 50 * GiB }]);
    const withH = sanitizeReport({ vnstat: { d: vn({ day: daysNov }), h: vnH(hoursUntil(23, 10)) } }, estOnly, NOW);
    const h22 = withH.traffic.bk.find((x) => x.d === '2026-11-22');
    expect(h22.src).toBe('h');
    expect(h22.tx / GiB).toBeCloseTo(16.99, 2);
    expect(withH.traffic.bkm).toEqual([{ ym: '2026-11', tx: 20 * GiB + h22.tx }]);
    // Monat, dessen Anfang aus den Tagen gefallen ist: Maximum bleibt
    const dropped = { ...estOnly, traffic: { ...estOnly.traffic, days: estOnly.traffic.days.slice(1) } };
    const partial = sanitizeReport({ vnstat: { d: vn({ day: daysNov.slice(1) }), h: vnH(hoursUntil(23, 10)) } }, dropped, NOW);
    expect(partial.traffic.bkm).toEqual([{ ym: '2026-11', tx: 50 * GiB }]);
    // since später als der Monatsanfang zählt als Beginn
    const withSince = { ...dropped, traffic: { ...dropped.traffic, since: '2026-11-02' } };
    const s = sanitizeReport({ vnstat: { d: vn({ day: daysNov.slice(1) }), h: vnH(hoursUntil(23, 10), null) } }, withSince, NOW);
    expect(s.traffic.bkm).toEqual([{ ym: '2026-11', tx: 20 * GiB + h22.tx }]);
  });

  it('bkm überlebt das Herausfallen der Tage; bk höchstens 62, bkm höchstens 120; Ungültiges im alten bk fällt raus', () => {
    const prev = {
      v: 1,
      at: 1,
      traffic: {
        at: 1,
        days: [],
        months: [],
        since: '2026-10-07',
        bk: [
          { d: '2026-11-01', tx: 5, src: 'h' },
          { d: 'kaputt', tx: 1, src: 'h' },
          { d: '2026-11-08', tx: 1, src: 'x' },
        ],
        bkm: [
          { ym: '2026-08', tx: 17 * GiB },
          { ym: '2026-11', tx: 3 },
          { ym: 'nope', tx: 1 },
        ],
      },
    };
    const r = sanitizeReport({ vnstat: { h: vnH(hoursUntil(23, 10)) } }, prev, NOW);
    expect(r.traffic.bk.map((x) => x.d)).toEqual(['2026-11-01', '2026-11-22']);
    expect(r.traffic.bkm[0]).toEqual({ ym: '2026-08', tx: 17 * GiB });
    expect(r.traffic.bkm[1]).toEqual({ ym: '2026-11', tx: 5 + r.traffic.bk[1].tx });
    expect(r.traffic.since).toBe('2026-10-07');
    const p2 = (n) => String(n).padStart(2, '0');
    const many = Array.from({ length: 80 }, (_, i) => ({ d: `2026-${p2(1 + Math.floor(i / 28))}-${p2((i % 28) + 1)}`, tx: 1, src: 'h' }));
    const manyM = Array.from({ length: 130 }, (_, i) => ({ ym: `${2010 + Math.floor(i / 12)}-${p2((i % 12) + 1)}`, tx: 1 }));
    const r2 = sanitizeReport({ vnstat: { h: vnH(hoursUntil(23, 10)) } }, { traffic: { at: 1, days: [], months: [], bk: many, bkm: manyM } }, NOW);
    expect(r2.traffic.bk).toHaveLength(62);
    expect(r2.traffic.bk.at(-1).d).toBe('2026-11-22');
    expect(r2.traffic.bkm).toHaveLength(120);
    expect(r2.traffic.bkm.at(-1).ym).toBe('2026-11');
  });

  it('since: aus created jeder Teilausgabe, bleibt ohne neue Angabe erhalten, ungültig -> keins', () => {
    const withC = (traffic, c) => ({ jsonversion: '2', interfaces: [{ name: 'eth0', created: c, traffic }] });
    const r = sanitizeReport({ vnstat: { m: withC({ month: [month(2026, 11, 1, 2)] }, created) } }, null, NOW);
    expect(r.traffic.since).toBe('2026-10-07');
    const keep = sanitizeReport({ vnstat: { d: vn({ day: [day(2026, 11, 25, 1, 2)] }) } }, r, NOW);
    expect(keep.traffic.since).toBe('2026-10-07');
    const bad = sanitizeReport({ vnstat: { m: withC({ month: [month(2026, 11, 1, 2)] }, { date: { year: 'x' } }) } }, null, NOW);
    expect(bad.traffic.since).toBeUndefined();
  });

  it('Stunden nur bei jsonversion 2; rohe Stunden nicht im Datensatz; Datensatz ohne neue Felder bleibt wie bisher', () => {
    expect(sanitizeReport({ vnstat: { h: { ...vnH(hoursUntil(23, 10)), jsonversion: '1' } } }, null, NOW)).toBeNull();
    const r = sanitizeReport({ vnstat: { h: vnH(hoursUntil(23, 10)) } }, null, NOW);
    expect(Object.keys(r.traffic).sort()).toEqual(['at', 'bk', 'bkm', 'days', 'months', 'since']);
    expect(JSON.stringify(r)).not.toContain('hour');
    expect(Object.keys(sanitizeReport(GOOD, null, NOW).traffic).sort()).toEqual(['at', 'days', 'months']);
    const legacy = { v: 1, at: 1, traffic: { at: 1, days: [{ d: '2026-11-24', rx: 1, tx: 2 }], months: [] } };
    const merged = sanitizeReport(GOOD, legacy, NOW);
    expect(merged.traffic.days.map((x) => x.d)).toEqual(['2026-11-24', '2026-11-25']);
  });
});
