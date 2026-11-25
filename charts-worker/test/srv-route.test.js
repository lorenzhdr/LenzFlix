import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/auth.js', async (orig) => ({ ...(await orig()), resolveUser: vi.fn() }));
vi.mock('../src/srv/now.js', () => ({ getNow: vi.fn(), clearNowCache: vi.fn() }));
vi.mock('../src/srv/month.js', () => ({ getMonth: vi.fn(), getMonthMeta: vi.fn(), clearMonthCache: vi.fn() }));
vi.mock('../src/srv/daily.js', () => ({ runDaily: vi.fn(), runSlot: vi.fn() }));
vi.mock('../src/srv/vol.js', () => ({ runVol: vi.fn(), VOL_KEY: 'srv:vol:v1' }));

import { resolveUser } from '../src/auth.js';
import worker from '../src/index.js';
import { runDaily, runSlot } from '../src/srv/daily.js';
import { getMonth, getMonthMeta } from '../src/srv/month.js';
import { getNow } from '../src/srv/now.js';
import { clearReportState } from '../src/srv/report.js';
import { SRV_CRON, VOL_CRON, clearSrvRoute, routeSrv } from '../src/srv/route.js';
import { runVol } from '../src/srv/vol.js';
import { clearServerCache } from '../src/srv/server.js';

const ORIGIN = 'https://stream.example';
const req = (path, init = {}) => new Request(`https://charts.example${path}`, init);
const authed = (path, token = 'tok', extra = {}) => req(path, { headers: { 'X-Emby-Token': token, 'CF-Connecting-IP': '5.5.5.5', ...extra } });
const makeEnv = (kv = {}, over = {}) => ({
  JELLYFIN_URL: 'https://jf.example',
  ALLOWED_ORIGIN: ORIGIN,
  REFRESH_SECRET: 'sec',
  JELLYFIN_API_KEY: 'KEY',
  WINDOW_DAYS: '30',
  MIN_SECONDS: '300',
  CHARTS: { get: vi.fn(async (k) => kv[k] ?? null), put: vi.fn() },
  ...over,
});

beforeEach(() => {
  clearSrvRoute();
  clearServerCache();
  clearReportState();
  vi.mocked(resolveUser).mockReset().mockResolvedValue({ uid: 'u', name: 'N', admin: false });
  vi.mocked(getNow).mockReset().mockResolvedValue({ v: 1, n: 0, mbps: 0, rows: [] });
  vi.mocked(getMonth).mockReset().mockResolvedValue({ status: 200, body: { v: 1, ym: '2026-11' } });
  vi.mocked(getMonthMeta).mockReset().mockResolvedValue({ ym: '2026-11', maxM: 14 });
  vi.mocked(runDaily).mockReset().mockResolvedValue({ ok: true });
  vi.mocked(runSlot).mockReset().mockResolvedValue(undefined);
  vi.mocked(runVol).mockReset().mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllGlobals());

describe('routeSrv', () => {
  it('null für Pfade außerhalb von /srv', async () => {
    for (const p of ['/charts', '/srvx', '/']) expect(await routeSrv(req(p), makeEnv(), {}, new URL(`https://c.example${p}`))).toBeNull();
  });

  it('401 ohne Token (ohne Anmeldeprüfung), 401 bei ungültigem, 502 bei Jellyfin-Ausfall', async () => {
    const env = makeEnv();
    for (const p of ['/srv', '/srv/now', '/srv/month', '/srv/server']) expect((await worker.fetch(req(p), env)).status).toBe(401);
    expect(resolveUser).not.toHaveBeenCalled();
    vi.mocked(resolveUser).mockResolvedValue({ status: 401 });
    expect((await worker.fetch(authed('/srv/now'), env)).status).toBe(401);
    vi.mocked(resolveUser).mockResolvedValue({ status: 502 });
    const res = await worker.fetch(authed('/srv/now'), env);
    expect(res.status).toBe(502);
    expect((await res.json()).error).toBe('upstream-unreachable');
  });

  it('Probe: Reiter now/month ohne Meldung, mit maxM', async () => {
    const res = await worker.fetch(authed('/srv'), makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ v: 1, tabs: ['now', 'month'], maxM: 14 });
  });

  it('Probe: server-Reiter bei frischer Meldung oder vorhandenem Tageslauf, nicht bei alter Meldung', async () => {
    const fresh = makeEnv({ 'srv:report:v1': { at: Date.now() - 3600e3 } });
    expect((await (await worker.fetch(authed('/srv'), fresh)).json()).tabs).toContain('server');
    clearSrvRoute();
    clearServerCache();
    const daily = makeEnv({ 'srv:daily:v1': { v: 1, at: 1 } });
    expect((await (await worker.fetch(authed('/srv'), daily)).json()).tabs).toContain('server');
    clearSrvRoute();
    clearServerCache();
    const old = makeEnv({ 'srv:report:v1': { at: Date.now() - 8 * 86400e3 } });
    expect((await (await worker.fetch(authed('/srv'), old)).json()).tabs).toEqual(['now', 'month']);
  });

  it('Probe scheitert nicht an getMonthMeta oder KV', async () => {
    vi.mocked(getMonthMeta).mockRejectedValue(new Error('x'));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = makeEnv();
    env.CHARTS.get = vi.fn(async () => {
      throw new Error('kv');
    });
    const res = await worker.fetch(authed('/srv'), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ v: 1, tabs: ['now', 'month'], maxM: 0 });
    err.mockRestore();
  });

  it('Probe liegt 60 s im Isolate-Cache', async () => {
    const env = makeEnv();
    await worker.fetch(authed('/srv'), env);
    await worker.fetch(authed('/srv'), env);
    expect(getMonthMeta).toHaveBeenCalledTimes(1);
  });

  it('/srv/now reicht user und token durch, no-store, CORS', async () => {
    vi.mocked(getNow).mockResolvedValue({ v: 1, n: 1, mbps: 2, rows: [] });
    const res = await worker.fetch(authed('/srv/now', 'tok', { Origin: ORIGIN }), makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect((await res.json()).n).toBe(1);
    expect(getNow).toHaveBeenCalledWith(expect.anything(), undefined, { uid: 'u', name: 'N', admin: false }, 'tok');
  });

  it('/srv/now: getNow wirft -> {v:1,down:1} mit 200', async () => {
    vi.mocked(getNow).mockRejectedValue(new Error('x'));
    const res = await worker.fetch(authed('/srv/now'), makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ v: 1, down: 1 });
  });

  it('/srv/month übernimmt Status und Body und reicht m durch', async () => {
    vi.mocked(getMonth).mockResolvedValue({ status: 400, body: { error: 'bad-month' } });
    const res = await worker.fetch(authed('/srv/month?m=99'), makeEnv());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'bad-month' });
    expect(vi.mocked(getMonth).mock.calls[0][2]).toBe('99');
    await worker.fetch(authed('/srv/month'), makeEnv());
    expect(vi.mocked(getMonth).mock.calls[1][2]).toBe('0');
    vi.mocked(getMonth).mockResolvedValue({ status: 503, body: { error: 'unavailable' } });
    expect((await worker.fetch(authed('/srv/month?m=1'), makeEnv())).status).toBe(503);
  });

  it('/srv/server liefert {v:1} ohne KV-Stand, no-store', async () => {
    const res = await worker.fetch(authed('/srv/server'), makeEnv());
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(await res.json()).toEqual({ v: 1 });
  });

  it('Token-Limit: 12/min bei /srv/now, danach 429 rate (bei wechselnder IP)', async () => {
    const env = makeEnv();
    for (let i = 0; i < 12; i++) expect((await worker.fetch(authed('/srv/now', 'tok', { 'CF-Connecting-IP': `7.7.7.${i}` }), env)).status).toBe(200);
    const res = await worker.fetch(authed('/srv/now', 'tok', { 'CF-Connecting-IP': '7.7.7.99' }), env);
    expect(res.status).toBe(429);
    expect((await res.json()).error).toBe('rate');
    expect((await worker.fetch(authed('/srv/now', 'other', { 'CF-Connecting-IP': '7.7.8.1' }), env)).status).toBe(200);
  });

  it('IP-Limit vor der Anmeldung: 61. Anfrage je IP -> 429 ohne resolveUser', async () => {
    const env = makeEnv();
    for (let i = 0; i < 60; i++) await worker.fetch(authed('/srv/now', `t${i}`), env);
    vi.mocked(resolveUser).mockClear();
    expect((await worker.fetch(authed('/srv/now', 'neu'), env)).status).toBe(429);
    expect(resolveUser).not.toHaveBeenCalled();
  });

  it('Limits sind je Route getrennt (Probe 20/min)', async () => {
    const env = makeEnv();
    for (let i = 0; i < 20; i++) expect((await worker.fetch(authed('/srv', 'tok', { 'CF-Connecting-IP': `8.8.8.${i}` }), env)).status).toBe(200);
    expect((await worker.fetch(authed('/srv', 'tok', { 'CF-Connecting-IP': '8.8.9.1' }), env)).status).toBe(429);
    expect((await worker.fetch(authed('/srv/server', 'tok', { 'CF-Connecting-IP': '8.8.9.2' }), env)).status).toBe(200);
  });

  it('unbekannter /srv-Pfad -> 404, falsche Methode -> 405', async () => {
    expect((await worker.fetch(authed('/srv/nope'), makeEnv())).status).toBe(404);
    expect((await worker.fetch(req('/srv/now', { method: 'POST', headers: { 'X-Emby-Token': 't' } }), makeEnv())).status).toBe(405);
  });

  it('OPTIONS greift weiter global', async () => {
    const res = await worker.fetch(req('/srv/now', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), makeEnv());
    expect(res.status).toBe(204);
  });

  it('POST /srv/report läuft über den Router (ohne Secret 404 srv-off)', async () => {
    const res = await worker.fetch(req('/srv/report', { method: 'POST', body: '{}' }), makeEnv());
    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe('srv-off');
  });
});

describe('POST /srv/refresh', () => {
  const post = (path, secret) => req(path, { method: 'POST', headers: secret ? { 'X-Refresh-Secret': secret } : {} });
  it('ohne oder mit falschem Secret 401, ohne konfiguriertes Secret ebenfalls (wie /refresh)', async () => {
    expect((await worker.fetch(post('/srv/refresh'), makeEnv())).status).toBe(401);
    expect((await worker.fetch(post('/srv/refresh', 'falsch'), makeEnv())).status).toBe(401);
    expect((await worker.fetch(post('/srv/refresh', 'sec'), makeEnv({}, { REFRESH_SECRET: undefined }))).status).toBe(401);
    expect(runDaily).not.toHaveBeenCalled();
  });

  it('ruft runDaily, full nur bei full=1', async () => {
    const res = await worker.fetch(post('/srv/refresh', 'sec'), makeEnv());
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(runDaily).toHaveBeenLastCalledWith(expect.anything(), { full: false });
    await worker.fetch(post('/srv/refresh?full=1', 'sec'), makeEnv());
    expect(runDaily).toHaveBeenLastCalledWith(expect.anything(), { full: true });
  });

  it('runDaily scheitert -> 502', async () => {
    vi.mocked(runDaily).mockResolvedValue({ ok: false, code: 'sql' });
    const res = await worker.fetch(post('/srv/refresh', 'sec'), makeEnv());
    expect(res.status).toBe(502);
  });
});

describe('scheduled', () => {
  it('Server-Cron ruft runSlot und nicht den Charts-Lauf', async () => {
    const env = makeEnv();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const waited = [];
    await worker.scheduled({ cron: SRV_CRON }, env, { waitUntil: (p) => waited.push(p) });
    expect(SRV_CRON).toBe('23 */6 * * *');
    expect(runSlot).toHaveBeenCalledTimes(1);
    expect(waited).toHaveLength(1);
    expect(env.CHARTS.put).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Volumen-Cron ruft runVol und weder runSlot noch den Charts-Lauf', async () => {
    const env = makeEnv();
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const waited = [];
    await worker.scheduled({ cron: VOL_CRON }, env, { waitUntil: (p) => waited.push(p) });
    expect(VOL_CRON).toBe('7 * * * *');
    expect(runVol).toHaveBeenCalledTimes(1);
    expect(runSlot).not.toHaveBeenCalled();
    expect(waited).toHaveLength(1);
    expect(env.CHARTS.put).not.toHaveBeenCalled();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('Volumen-Cron: ein werfender runVol bricht scheduled nicht ab', async () => {
    vi.mocked(runVol).mockRejectedValue(new Error('x'));
    await expect(worker.scheduled({ cron: VOL_CRON }, makeEnv(), {})).resolves.toBeUndefined();
  });

  it('anderer Cron und leeres Event bleiben der Charts-Lauf', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ colums: [], results: [] }))));
    for (const ev of [{}, { cron: '0 * * * *' }, undefined]) {
      const env = makeEnv();
      await worker.scheduled(ev, env, {});
      expect(env.CHARTS.put).toHaveBeenCalledTimes(1);
    }
    expect(runSlot).not.toHaveBeenCalled();
    expect(runVol).not.toHaveBeenCalled();
  });
});
