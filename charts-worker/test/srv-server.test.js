import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearServerCache, getServer } from '../src/srv/server.js';

const NOW = Date.UTC(2026, 10, 25, 12, 0, 0);
const MIN = 60000;

function envWith(map, fail = false) {
  return {
    CHARTS: {
      get: vi.fn(async (k) => {
        if (fail) throw new Error('kv down');
        return map[k] ?? null;
      }),
    },
  };
}
const report = (ageMs, extra = {}) => ({
  v: 1,
  at: NOW - ageMs,
  health: { at: NOW - ageMs, tempC: 50, cpuPct: 10, load: [1, 1, 1], cores: 4, mem: { total: 8, avail: 4 }, uptimeS: 99 },
  disks: { at: NOW - ageMs, list: [{ l: 'A', size: 10, used: 5, avail: 5 }] },
  traffic: { at: NOW - ageMs, days: [{ d: '2026-11-25', rx: 1, tx: 2 }], months: [{ ym: '2026-11', rx: 3, tx: 4 }] },
  rec: { tx: { ym: '2026-10', bytes: 77 } },
  ...extra,
});

beforeEach(() => {
  clearServerCache();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe('getServer', () => {
  it('frische Meldung: health ohne stale, alle Teile', async () => {
    const daily = { v: 1, at: NOW, library: { movies: 1, series: 2, episodes: 3, ym: '2026-11' }, records: { day: { d: '2026-11-01', secs: 9 } } };
    const env = envWith({ 'srv:report:v1': report(5 * MIN), 'srv:daily:v1': daily, 'srv:lib:v1': { v: 1, runtimeS: 12345 } });
    const r = await getServer(env, {});
    expect(r.v).toBe(1);
    expect(r.health).toEqual({ ageS: 300, stale: false, tempC: 50, cpuPct: 10, load: [1, 1, 1], cores: 4, mem: { total: 8, avail: 4 }, uptimeS: 99 });
    expect(r.disks).toEqual({ ageS: 300, list: [{ l: 'A', size: 10, used: 5, avail: 5 }] });
    expect(r.traffic).toMatchObject({ ageS: 300, days: [{ d: '2026-11-25', rx: 1, tx: 2 }] });
    expect(r.library).toEqual({ movies: 1, series: 2, episodes: 3, ym: '2026-11', runtimeS: 12345 });
    expect(r.records).toEqual({ day: { d: '2026-11-01', secs: 9 }, tx: { ym: '2026-10', bytes: 77 } });
  });

  it('stale bei 76 min, nicht bei 74 min', async () => {
    expect((await getServer(envWith({ 'srv:report:v1': report(76 * MIN) }), {})).health.stale).toBe(true);
    clearServerCache();
    expect((await getServer(envWith({ 'srv:report:v1': report(74 * MIN) }), {})).health.stale).toBe(false);
  });

  it('health fehlt bei 25 h, Platten, Traffic und Rekord bleiben', async () => {
    const r = await getServer(envWith({ 'srv:report:v1': report(25 * 60 * MIN) }), {});
    expect(r.health).toBeUndefined();
    expect(r.disks.ageS).toBe(25 * 3600);
    expect(r.traffic).toBeDefined();
    expect(r.records).toEqual({ tx: { ym: '2026-10', bytes: 77 } });
  });

  it('ohne jeden Stand nur {v:1}; fehlende Teile fehlen', async () => {
    expect(await getServer(envWith({}), {})).toEqual({ v: 1 });
    clearServerCache();
    const r = await getServer(envWith({ 'srv:daily:v1': { v: 1, at: 1, library: { movies: 1 } } }), {});
    expect(r).toEqual({ v: 1, library: { movies: 1 } });
  });

  it('KV-Fehler -> {v:1}, wirft nie', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await getServer(envWith({}, true), {})).toEqual({ v: 1 });
    err.mockRestore();
  });

  it('KV-Lesen 60 s im Isolate-Cache, Alter wird neu gerechnet', async () => {
    const env = envWith({ 'srv:report:v1': report(MIN) });
    await getServer(env, {});
    const calls = env.CHARTS.get.mock.calls.length;
    vi.setSystemTime(NOW + 30000);
    const r = await getServer(env, {});
    expect(env.CHARTS.get.mock.calls.length).toBe(calls);
    expect(r.health.ageS).toBe(90);
    vi.setSystemTime(NOW + 61000);
    await getServer(env, {});
    expect(env.CHARTS.get.mock.calls.length).toBeGreaterThan(calls);
  });
});
