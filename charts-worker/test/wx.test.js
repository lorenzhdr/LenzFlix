import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthCache } from '../src/auth.js';
import worker from '../src/index.js';
import { clearWxCache, normalizeWx } from '../src/wx.js';

const ORIGIN = 'https://stream.example';
const GUID = 'cdcdcdcd-cdcd-cdcd-cdcd-cdcdcdcdcdcd';
const req = (path = '/wx', init = {}) => new Request(`https://charts.example${path}`, init);
const authed = (extra = {}) => ({ headers: { 'X-Emby-Token': 'tok', ...extra } });

function kvFake(initial) {
  const store = new Map(initial ? [['wx:v1', JSON.stringify(initial)]] : []);
  return {
    store,
    get: vi.fn(async (k) => (store.has(k) ? JSON.parse(store.get(k)) : null)),
    put: vi.fn(async (k, v) => void store.set(k, v)),
  };
}
const makeEnv = (over = {}) => ({
  JELLYFIN_URL: 'https://jf.example',
  ALLOWED_ORIGIN: ORIGIN,
  WX_LAT: '10.0',
  WX_LON: '20.0',
  CHARTS: kvFake(),
  ...over,
});
const upstreamBody = (cur = {}) => ({
  latitude: 10.0,
  longitude: 20.0,
  elevation: 123,
  timezone: 'GMT',
  current: { time: '2026-01-01T12:00', weather_code: 63, temperature_2m: -1.6, snow_depth: 0.126, visibility: 20000, is_day: 1, ...cur },
});

let upstream;
function stubFetch(handler) {
  upstream = vi.fn(handler);
  vi.stubGlobal('fetch', async (url, init) => {
    const u = String(url);
    if (u.startsWith('https://jf.example')) {
      return new Response(JSON.stringify({ Id: GUID, Name: 'Lenz', Policy: { IsAdministrator: false } }), { status: 200 });
    }
    return upstream(u, init);
  });
}
const okUp = (cur) => () => new Response(JSON.stringify(upstreamBody(cur)), { status: 200 });

beforeEach(() => {
  clearAuthCache();
  clearWxCache();
  vi.stubGlobal('caches', undefined);
  stubFetch(okUp());
});
afterEach(() => vi.unstubAllGlobals());

describe('normalizeWx', () => {
  const table = [
    [0, 'clear', 0], [1, 'clear', 0], [2, 'clear', 0], [3, 'cloudy', 0], [45, 'fog', 0], [48, 'fog', 0],
    [51, 'drizzle', 0.25], [53, 'drizzle', 0.35], [55, 'drizzle', 0.45], [56, 'drizzle', 0.35], [57, 'drizzle', 0.45],
    [61, 'rain', 0.5], [63, 'rain', 0.75], [65, 'heavy', 1], [66, 'rain', 0.6], [67, 'heavy', 0.9],
    [80, 'rain', 0.45], [81, 'rain', 0.75], [82, 'heavy', 1],
    [71, 'snow', 0.35], [73, 'snow', 0.65], [75, 'snow', 1], [77, 'snow', 0.3], [85, 'snow', 0.5], [86, 'snow', 0.9],
    [95, 'storm', 0.8], [96, 'storm', 1], [99, 'storm', 1], [42, 'clear', 0],
  ];
  it.each(table)('Code %i -> %s %f', (code, k, i) => {
    const r = normalizeWx(upstreamBody({ weather_code: code }), 5);
    expect(r.k).toBe(k);
    expect(r.i).toBe(i);
    expect(r.v).toBe(1);
  });
  it('Nebel, Schnee, Temperatur, Tag, Zeit', () => {
    expect(normalizeWx(upstreamBody({ visibility: 500 }), 5).fog).toBe(1);
    expect(normalizeWx(upstreamBody({ visibility: 2500 }), 5).fog).toBe(0.5);
    expect(normalizeWx(upstreamBody({ visibility: 4000 }), 5).fog).toBe(0);
    expect(normalizeWx(upstreamBody({ weather_code: 45 }), 5).fog).toBe(0.8);
    const r = normalizeWx(upstreamBody({ is_day: 0 }), 5);
    expect(r.sd).toBe(0.13);
    expect(r.t).toBe(-2);
    expect(r.day).toBe(0);
    expect(r.ts).toBe(Date.parse('2026-01-01T12:00:00Z'));
    expect(normalizeWx(upstreamBody({ time: undefined }), 777).ts).toBe(777);
    expect(normalizeWx(upstreamBody({ snow_depth: -1 }), 5).sd).toBe(0);
  });
  it('liefert nie Ortsfelder; Müll gibt null', () => {
    const r = normalizeWx(upstreamBody(), 5);
    expect(Object.keys(r).sort()).toEqual(['day', 'fog', 'i', 'k', 'sd', 't', 'ts', 'v']);
    expect(normalizeWx({}, 5)).toBeNull();
    expect(normalizeWx(null, 5)).toBeNull();
  });
});

describe('GET /wx', () => {
  it('404 wx-off ohne oder mit ungültiger Konfiguration', async () => {
    for (const over of [{ WX_LAT: '' }, { WX_LON: undefined }, { WX_LAT: 'abc' }, { WX_LAT: '95' }]) {
      const res = await worker.fetch(req('/wx', authed()), makeEnv(over), {});
      expect(res.status).toBe(404);
      expect((await res.json()).error).toBe('wx-off');
    }
    expect(upstream).not.toHaveBeenCalled();
  });

  it('401 ohne Token und bei ungültigem Token', async () => {
    expect((await worker.fetch(req(), makeEnv(), {})).status).toBe(401);
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 401 }));
    expect((await worker.fetch(req('/wx', authed()), makeEnv(), {})).status).toBe(401);
  });

  it('502 bei Jellyfin-Fehler', async () => {
    vi.stubGlobal('fetch', async () => new Response('{}', { status: 500 }));
    expect((await worker.fetch(req('/wx', authed()), makeEnv(), {})).status).toBe(502);
  });

  it('200 mit Schema, ohne Koordinaten, mit Cache-Control und CORS', async () => {
    const res = await worker.fetch(req('/wx', authed({ Origin: ORIGIN })), makeEnv(), {});
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const text = await res.text();
    expect(text).not.toMatch(/latitude|longitude|elevation|timezone/);
    expect(JSON.parse(text)).toMatchObject({ v: 1, k: 'rain', i: 0.75, sd: 0.13, t: -2, day: 1 });
    expect(upstream.mock.calls[0][0]).toContain('latitude=10&longitude=20');
  });

  it('OPTIONS beantwortet den Preflight', async () => {
    const res = await worker.fetch(req('/wx', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), makeEnv(), {});
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it('Rate-Limit 30/min je IP', async () => {
    const env = makeEnv();
    let last;
    for (let n = 0; n < 31; n++) last = await worker.fetch(req('/wx', authed({ 'CF-Connecting-IP': '203.0.113.9' })), env, {});
    expect(last.status).toBe(429);
    const other = await worker.fetch(req('/wx', authed({ 'CF-Connecting-IP': '203.0.113.10' })), env, {});
    expect(other.status).toBe(200);
  });

  it('zwei Anfragen ergeben einen Upstream-Abruf (Isolate-Cache), KV einmal geschrieben', async () => {
    const env = makeEnv();
    await worker.fetch(req('/wx', authed()), env, {});
    await worker.fetch(req('/wx', authed()), env, {});
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(env.CHARTS.put).toHaveBeenCalledTimes(1);
    expect(env.CHARTS.put.mock.calls[0][0]).toBe('wx:v1');
  });

  it('gleichzeitige Anfragen teilen den Upstream-Abruf', async () => {
    const env = makeEnv();
    await Promise.all([worker.fetch(req('/wx', authed()), env, {}), worker.fetch(req('/wx', authed()), env, {})]);
    expect(upstream).toHaveBeenCalledTimes(1);
  });

  it('frischer KV-Eintrag ohne Upstream', async () => {
    const data = { v: 1, k: 'snow', i: 0.65, sd: 0.4, fog: 0, t: -3, day: 1, ts: 1 };
    const env = makeEnv({ CHARTS: kvFake({ data, at: Date.now() - 60_000 }) });
    const res = await worker.fetch(req('/wx', authed()), env, {});
    expect((await res.json()).k).toBe('snow');
    expect(upstream).not.toHaveBeenCalled();
  });

  it('stale bei Upstream-Fehler mit Altwert bis 2 h', async () => {
    const data = { v: 1, k: 'snow', i: 0.65, sd: 0.4, fog: 0, t: -3, day: 1, ts: 1 };
    stubFetch(() => new Response('x', { status: 500 }));
    const env = makeEnv({ CHARTS: kvFake({ data, at: Date.now() - 60 * 60 * 1000 }) });
    const res = await worker.fetch(req('/wx', authed()), env, {});
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ k: 'snow', stale: 1 });
  });

  it('503 wx-down ohne Altwert oder mit zu altem Wert', async () => {
    stubFetch(() => {
      throw new TypeError('net');
    });
    const res = await worker.fetch(req('/wx', authed()), makeEnv(), {});
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe('wx-down');
    const data = { v: 1, k: 'snow', i: 0.65, sd: 0, fog: 0, t: 0, day: 1, ts: 1 };
    clearWxCache();
    const old = makeEnv({ CHARTS: kvFake({ data, at: Date.now() - 3 * 60 * 60 * 1000 }) });
    expect((await worker.fetch(req('/wx', authed()), old, {})).status).toBe(503);
  });

  it('nach Upstream-Fehler 60 s kein neuer Abruf (Negativ-Cache)', async () => {
    const data = { v: 1, k: 'snow', i: 0.65, sd: 0.4, fog: 0, t: -3, day: 1, ts: 1 };
    stubFetch(() => new Response('x', { status: 500 }));
    const env = makeEnv({ CHARTS: kvFake({ data, at: Date.now() - 60 * 60 * 1000 }) });
    for (let n = 0; n < 3; n++) {
      const res = await worker.fetch(req('/wx', authed()), env, {});
      expect(await res.json()).toMatchObject({ k: 'snow', stale: 1 });
    }
    expect(upstream).toHaveBeenCalledTimes(1);
    const env2 = makeEnv();
    clearWxCache();
    for (let n = 0; n < 3; n++) expect((await worker.fetch(req('/wx', authed()), env2, {})).status).toBe(503);
    expect(upstream).toHaveBeenCalledTimes(2);
  });
});
