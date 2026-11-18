import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthCache } from '../src/auth.js';
import worker from '../src/index.js';
import { clearMpRate } from '../src/mp/route.js';
import { createState, onlineCount } from '../src/mp/room.js';

vi.mock('../src/mp/cf.js', () => ({
  pair: () => ({ client: {}, server: {} }),
  upgrade: () => ({ status: 101 }),
  autoPing: () => {},
}));

const ORIGIN = 'https://stream.example';
const SECRET = 's'.repeat(40);
const UID = 'cd'.repeat(16);
const GUID = `${UID.slice(0, 8)}-${UID.slice(8, 12)}-${UID.slice(12, 16)}-${UID.slice(16, 20)}-${UID.slice(20)}`;

function makeEnv(n = 3, over = {}) {
  const fetchDo = vi.fn(async () => new Response(JSON.stringify({ v: 1, n }), { status: 200 }));
  const world = { idFromName: vi.fn((x) => `id:${x}`), get: vi.fn(() => ({ fetch: fetchDo })) };
  return {
    env: { JELLYFIN_URL: 'https://jf.example', ALLOWED_ORIGIN: ORIGIN, MP_SECRET: SECRET, WORLD: world, CHARTS: { get: async () => null }, ...over },
    fetchDo,
  };
}
const req = (headers = {}) => new Request('https://charts.example/mp/online', { headers });
const jfOk = () => vi.fn(async () => new Response(JSON.stringify({ Id: GUID, Name: 'Lenz', Policy: { IsAdministrator: false } }), { status: 200 }));

beforeEach(() => {
  clearAuthCache();
  clearMpRate();
  vi.stubGlobal('caches', undefined);
  vi.stubGlobal('fetch', jfOk());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('GET /mp/online', () => {
  it('503 bei ausgeschaltetem Mehrspieler', async () => {
    const { env } = makeEnv(3, { MP_SECRET: undefined });
    expect((await worker.fetch(req({ 'X-Emby-Token': 't' }), env)).status).toBe(503);
  });

  it('401 ohne Token und bei ungültigem Token', async () => {
    const { env } = makeEnv();
    expect((await worker.fetch(req(), env)).status).toBe(401);
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })));
    expect((await worker.fetch(req({ 'X-Emby-Token': 'bad' }), env)).status).toBe(401);
  });

  it('200 mit Zahl, Cache-Control und CORS', async () => {
    const { env } = makeEnv(3);
    const res = await worker.fetch(req({ 'X-Emby-Token': 't', Origin: ORIGIN }), env);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ v: 1, n: 3 });
    expect(res.headers.get('Cache-Control')).toBe('private, max-age=30');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
  });

  it('Cache 30 s: nur ein DO-Aufruf, danach wieder einer', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    const { env, fetchDo } = makeEnv(2);
    await worker.fetch(req({ 'X-Emby-Token': 'a' }), env);
    vi.setSystemTime(1_010_000);
    const r2 = await worker.fetch(req({ 'X-Emby-Token': 'b' }), env);
    expect((await r2.json()).n).toBe(2);
    expect(fetchDo).toHaveBeenCalledTimes(1);
    vi.setSystemTime(1_031_000);
    await worker.fetch(req({ 'X-Emby-Token': 'a' }), env);
    expect(fetchDo).toHaveBeenCalledTimes(2);
  });

  it('503 wenn das DO ausfällt, kein Cache des Fehlers', async () => {
    const { env, fetchDo } = makeEnv();
    fetchDo.mockRejectedValueOnce(new Error('x'));
    expect((await worker.fetch(req({ 'X-Emby-Token': 't' }), env)).status).toBe(503);
    expect((await worker.fetch(req({ 'X-Emby-Token': 't' }), env)).status).toBe(200);
  });

  it('eigenes Limit 12/min je Token (Ticket-Limit 6 greift nicht)', async () => {
    const { env } = makeEnv();
    const codes = [];
    for (let i = 0; i < 13; i++) codes.push((await worker.fetch(req({ 'X-Emby-Token': 'same' }), env)).status);
    expect(codes.slice(0, 12).every((c) => c === 200)).toBe(true);
    expect(codes[12]).toBe(429);
  });

  it('Limit 60/min je IP', async () => {
    const { env } = makeEnv();
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await worker.fetch(req({ 'X-Emby-Token': 't' + i, 'CF-Connecting-IP': '1.2.3.4' }), env)).status;
    expect(last).toBe(429);
  });

  it('Limit 60/min je IP auch ohne CF-Connecting-IP (Rückfallschlüssel)', async () => {
    const { env } = makeEnv();
    let last = 0;
    for (let i = 0; i < 61; i++) last = (await worker.fetch(req({ 'X-Emby-Token': 't' + i }), env)).status;
    expect(last).toBe(429);
  });

  it('OPTIONS-Preflight bleibt 204', async () => {
    const { env } = makeEnv();
    const res = await worker.fetch(new Request('https://charts.example/mp/online', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env);
    expect(res.status).toBe(204);
  });
});

describe('onlineCount', () => {
  const att = (c, k, live) => ({ c, k: k.repeat(12), live });
  it('zählt verschiedene Konten, Duplikate einmal, nicht-live nie', () => {
    const st = createState({ atts: [att(1, 'a', true), att(2, 'a', true), att(3, 'b', true), att(4, 'c', false)], now: 1 });
    expect(onlineCount(st)).toBe(2);
    expect(st.qn).toBe(0);
  });
  it('leerer Raum ist 0', () => {
    expect(onlineCount(createState({ now: 1 }))).toBe(0);
  });
});

describe('MpWorld /online', () => {
  it('antwortet nach Wiederherstellung aus Attachments, ohne Speicherschreibvorgang; anderer Pfad bleibt 426', async () => {
    const { MpWorld } = await import('../src/mp/world.js');
    const put = vi.fn();
    const mk = (k, live) => ({ deserializeAttachment: () => ({ c: k.charCodeAt(0), k: k.repeat(12), live }) });
    const ctx = {
      blockConcurrencyWhile: (fn) => fn(),
      getWebSockets: () => [mk('a', true), mk('b', true), mk('c', false)],
      getWebSocketAutoResponseTimestamp: () => null,
      setWebSocketAutoResponse: () => {},
      storage: { list: async () => new Map(), put, delete: put, getAlarm: async () => null, setAlarm: put },
    };
    const w = new MpWorld(ctx, { MP_SECRET: SECRET });
    const res = await w.fetch(new Request('https://world/online'));
    expect(await res.json()).toEqual({ v: 1, n: 2 });
    expect(put).not.toHaveBeenCalled();
    expect((await w.fetch(new Request('https://world/other'))).status).toBe(426);
  });
});
