import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { clearTokenCache } from '../src/index.js';

const ORIGIN = 'https://stream.example';
const DATA = { version: 1, generatedAt: '2026-11-08T19:00:00Z', windowDays: 30, metric: 'viewers', movies: [], series: [], all: [] };

function makeEnv(stored) {
  const kv = new Map(stored ? [['charts:v1', stored]] : []);
  return {
    JELLYFIN_URL: 'https://jf.example',
    ALLOWED_ORIGIN: ORIGIN,
    WINDOW_DAYS: '30',
    MIN_SECONDS: '300',
    JELLYFIN_API_KEY: 'KEY',
    REFRESH_SECRET: 'sec',
    CHARTS: {
      get: async (k) => kv.get(k) ?? null,
      put: vi.fn(async (k, v) => kv.set(k, JSON.parse(v))),
    },
  };
}
const req = (path, init = {}) => new Request(`https://charts.example${path}`, init);

beforeEach(() => clearTokenCache());
afterEach(() => vi.unstubAllGlobals());

describe('CORS & Preflight', () => {
  it('Preflight -> 204 mit CORS für ALLOWED_ORIGIN', async () => {
    const res = await worker.fetch(req('/charts', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), makeEnv());
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    expect(res.headers.get('Access-Control-Allow-Headers')).toBe('X-Emby-Token');
    expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
    expect(res.headers.get('Vary')).toBe('Origin');
  });

  it('fremder Origin bekommt kein Allow-Origin', async () => {
    const res = await worker.fetch(req('/charts', { method: 'OPTIONS', headers: { Origin: 'https://evil.example' } }), makeEnv());
    expect(res.status).toBe(204);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('GET /charts', () => {
  it('401 ohne Token', async () => {
    const res = await worker.fetch(req('/charts'), makeEnv(DATA));
    expect(res.status).toBe(401);
  });

  it('401 bei ungültigem Token', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 })));
    const res = await worker.fetch(req('/charts', { headers: { 'X-Emby-Token': 'bad' } }), makeEnv(DATA));
    expect(res.status).toBe(401);
  });

  it('503 no-data bei gültigem Token ohne KV-Eintrag', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 200 })));
    const res = await worker.fetch(req('/charts', { headers: { 'X-Emby-Token': 't' } }), makeEnv());
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: 'no-data' });
  });

  it('502 wenn Jellyfin nicht erreichbar', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const res = await worker.fetch(req('/charts', { headers: { 'X-Emby-Token': 't' } }), makeEnv(DATA));
    expect(res.status).toBe(502);
  });

  it('200 mit Daten, Cache-Control und CORS; Token wird gecacht', async () => {
    const f = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', f);
    const env = makeEnv(DATA);
    const r = () => req('/charts', { headers: { 'X-Emby-Token': 'good', Origin: ORIGIN } });
    const res = await worker.fetch(r(), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(DATA);
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=300');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    await worker.fetch(r(), env);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][1].headers.Authorization).toBe('MediaBrowser Token="good"');
  });
});

describe('/health und /refresh', () => {
  it('health ohne Auth', async () => {
    const res = await worker.fetch(req('/health'), makeEnv(DATA));
    expect(await res.json()).toEqual({ ok: true, generatedAt: DATA.generatedAt });
  });

  it('refresh ohne/falsches Secret -> 401', async () => {
    const env = makeEnv();
    expect((await worker.fetch(req('/refresh', { method: 'POST' }), env)).status).toBe(401);
    expect((await worker.fetch(req('/refresh', { method: 'POST', headers: { 'X-Refresh-Secret': 'x' } }), env)).status).toBe(401);
  });

  it('refresh mit Secret schreibt KV ohne UserIds', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ colums: ['ItemId', 'ItemType', 'UserId', 'plays', 'secs'], results: [['m1', 'Movie', 'secretuser', '1', '300']] }))),
    );
    const env = makeEnv();
    const res = await worker.fetch(req('/refresh', { method: 'POST', headers: { 'X-Refresh-Secret': 'sec' } }), env);
    expect(res.status).toBe(200);
    const stored = env.CHARTS.put.mock.calls[0][1];
    expect(stored).not.toContain('secretuser');
    expect(JSON.parse(stored).movies[0]).toEqual({ id: 'm1', viewers: 1, plays: 1, seconds: 300 });
  });

  it('Cron: leeres Ergebnis wird gespeichert, Fehler behält altes Ergebnis', async () => {
    const env = makeEnv();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ colums: [], results: [] }))));
    await worker.scheduled({}, env, {});
    expect(env.CHARTS.put).toHaveBeenCalledTimes(1);
    expect(JSON.parse(env.CHARTS.put.mock.calls[0][1])).toMatchObject({ movies: [], series: [], all: [] });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    await worker.scheduled({}, env, {});
    expect(env.CHARTS.put).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });

  it('404 für unbekannte Pfade', async () => {
    expect((await worker.fetch(req('/nope'), makeEnv())).status).toBe(404);
  });
});
