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
