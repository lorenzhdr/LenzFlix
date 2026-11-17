import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthCache } from '../src/auth.js';
import worker from '../src/index.js';
import { clearMpRate } from '../src/mp/route.js';
import { b64urlDecode, mintTicket, verifyTicket } from '../src/mp/ticket.js';

const ORIGIN = 'https://stream.example';
const SECRET = 's'.repeat(40);
const UID = 'cd'.repeat(16);
const GUID = `${UID.slice(0, 8)}-${UID.slice(8, 12)}-${UID.slice(12, 16)}-${UID.slice(16, 20)}-${UID.slice(20)}`;

function makeEnv(over = {}) {
  const seen = [];
  const world = {
    idFromName: vi.fn((n) => `id:${n}`),
    get: vi.fn(() => ({
      fetch: vi.fn(async (r) => {
        seen.push(r);
        return new Response('stub', { status: 200 });
      }),
    })),
  };
  return {
    env: {
      JELLYFIN_URL: 'https://jf.example',
      ALLOWED_ORIGIN: ORIGIN,
      MP_SECRET: SECRET,
      WORLD: world,
      CHARTS: { get: async () => null },
      ...over,
    },
    world,
    seen,
  };
}
const req = (path, init = {}) => new Request(`https://charts.example${path}`, init);
const jf = (admin = true, status = 200) =>
  vi.fn(async () =>
    status === 200
      ? new Response(JSON.stringify({ Id: GUID, Name: 'Lenz', Policy: { IsAdministrator: admin } }), { status })
      : new Response('{}', { status }),
  );

beforeEach(() => {
  clearAuthCache();
  clearMpRate();
  vi.stubGlobal('caches', undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('GET /mp/ticket', () => {
  it('200 mit Admin, no-store, CORS, Ticket prüfbar', async () => {
    vi.stubGlobal('fetch', jf(true));
    const { env } = makeEnv();
    const res = await worker.fetch(req('/mp/ticket', { headers: { 'X-Emby-Token': 'tok', Origin: ORIGIN } }), env);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe(ORIGIN);
    const b = await res.json();
    expect(b).toMatchObject({ v: 1, url: '/mp', pv: [1] });
    expect(typeof b.s).toBe('number');
    expect(b.exp - b.s).toBe(60000);
    const c = await verifyTicket(SECRET, b.tk, Date.now());
    expect(c).toMatchObject({ n: 'Lenz', a: 1 });
    expect(JSON.stringify(b)).not.toContain(UID);
  });

  it('Rückfall nach Jellyfin-5xx ohne Admin (aus Cache)', async () => {
    const store = new Map();
    vi.stubGlobal('caches', {
      default: {
        match: async (r) => (store.has(r.url) ? new Response(store.get(r.url)) : undefined),
        put: async (r, res) => void store.set(r.url, await res.text()),
        delete: async (r) => store.delete(r.url),
      },
    });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T10:00:00Z'));
    vi.stubGlobal('fetch', jf(true));
    const { env } = makeEnv();
    const first = await worker.fetch(req('/mp/ticket', { headers: { 'X-Emby-Token': 'tok' } }), env);
    expect((await verifyTicket(SECRET, (await first.json()).tk, Date.now())).a).toBe(1);
    vi.setSystemTime(new Date('2026-11-17T10:30:00Z'));
    vi.stubGlobal('fetch', jf(true, 503));
    const res = await worker.fetch(req('/mp/ticket', { headers: { 'X-Emby-Token': 'tok' } }), env);
    expect(res.status).toBe(200);
    const c = await verifyTicket(SECRET, (await res.json()).tk, Date.now());
    expect(c.a).toBe(0);
  });

  it('401 ohne Token und bei ungültigem Token (Jellyfin 401)', async () => {
    const { env } = makeEnv();
    const f = jf(true);
    vi.stubGlobal('fetch', f);
    expect((await worker.fetch(req('/mp/ticket'), env)).status).toBe(401);
    expect(f).not.toHaveBeenCalled();
    vi.stubGlobal('fetch', jf(true, 401));
    expect((await worker.fetch(req('/mp/ticket', { headers: { 'X-Emby-Token': 'bad' } }), env)).status).toBe(401);
  });

  it('502 bei Jellyfin-5xx ohne Cache', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', jf(true, 500));
    const { env } = makeEnv();
    expect((await worker.fetch(req('/mp/ticket', { headers: { 'X-Emby-Token': 't' } }), env)).status).toBe(502);
    err.mockRestore();
  });

  it('429 beim 7. Aufruf je Token', async () => {
    vi.stubGlobal('fetch', jf(false));
    const { env } = makeEnv();
    const call = (t) => worker.fetch(req('/mp/ticket', { headers: { 'X-Emby-Token': t } }), env);
    for (let i = 0; i < 6; i++) expect((await call('same')).status).toBe(200);
    const r = await call('same');
    expect(r.status).toBe(429);
    expect((await r.json()).error).toBe('rate');
    expect((await call('other')).status).toBe(200);
  });

  it('429 ab dem 31. Aufruf je Client-IP, auch mit wechselnden Tokens', async () => {
    vi.stubGlobal('fetch', jf(false));
    const { env } = makeEnv();
    const call = (t, ip) => worker.fetch(req('/mp/ticket', { headers: { 'X-Emby-Token': t, 'CF-Connecting-IP': ip } }), env);
    for (let i = 0; i < 30; i++) expect((await call('rnd' + i, '203.0.113.7')).status).toBe(200);
    expect((await call('rnd-x', '203.0.113.7')).status).toBe(429);
    expect((await call('rnd-y', '203.0.113.8')).status).toBe(200);
  });

  it('503 mp-disabled ohne Secret, mit zu kurzem Secret, ohne Binding; ohne Jellyfin-Aufruf', async () => {
    const f = jf(true);
    vi.stubGlobal('fetch', f);
    const h = { headers: { 'X-Emby-Token': 'tok' } };
    for (const over of [{ MP_SECRET: undefined }, { MP_SECRET: 'short' }, { WORLD: undefined }]) {
      const { env } = makeEnv(over);
      const r = await worker.fetch(req('/mp/ticket', h), env);
      expect(r.status).toBe(503);
      expect((await r.json()).error).toBe('mp-disabled');
    }
    expect(f).not.toHaveBeenCalled();
  });

  it('Preflight liefert CORS wie gehabt', async () => {
    const { env } = makeEnv();
    const r = await worker.fetch(req('/mp/ticket', { method: 'OPTIONS', headers: { Origin: ORIGIN } }), env);
    expect(r.status).toBe(204);
    expect(r.headers.get('Access-Control-Allow-Headers')).toBe('X-Emby-Token');
    expect(r.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
  });
});

describe('GET /mp (Upgrade)', () => {
  const up = (ticket, over = {}) => ({
    headers: {
      Upgrade: 'websocket',
      Connection: 'Upgrade',
      Origin: ORIGIN,
      'Sec-WebSocket-Protocol': ticket ? `lfx-mp.1, t.${ticket}` : 'lfx-mp.1',
      ...over,
    },
  });
  const good = async (user = { uid: UID, name: 'Lenz', admin: false }, now = Date.now()) =>
    (await mintTicket(SECRET, user, now)).tk;

  it('426 ohne Upgrade-Header', async () => {
    const { env } = makeEnv();
    expect((await worker.fetch(req('/mp', { headers: { Origin: ORIGIN } }), env)).status).toBe(426);
  });

  it('403 bei fehlendem oder falschem Origin', async () => {
    const { env, seen } = makeEnv();
    const tk = await good();
    const noOrigin = up(tk);
    delete noOrigin.headers.Origin;
    expect((await worker.fetch(req('/mp', noOrigin), env)).status).toBe(403);
    expect((await worker.fetch(req('/mp', up(tk, { Origin: 'https://evil.example' })), env)).status).toBe(403);
    expect(seen).toHaveLength(0);
  });

  it('MP_DEV_ORIGINS: nur https', async () => {
    const { env } = makeEnv({ MP_DEV_ORIGINS: 'https://dev.example, http://plain.example' });
    const tk = await good();
    expect((await worker.fetch(req('/mp', up(tk, { Origin: 'https://dev.example' })), env)).status).toBe(200);
    expect((await worker.fetch(req('/mp', up(tk, { Origin: 'http://plain.example' })), env)).status).toBe(403);
  });

  it('426 ohne Subprotokoll lfx-mp.1', async () => {
    const { env } = makeEnv();
    const tk = await good();
    const r = await worker.fetch(req('/mp', up(tk, { 'Sec-WebSocket-Protocol': `t.${tk}` })), env);
    expect(r.status).toBe(426);
  });

  it('401 bei fehlendem, manipuliertem, fremd signiertem und abgelaufenem Ticket', async () => {
    const { env, seen } = makeEnv();
    const tk = await good();
    const other = (await mintTicket('o'.repeat(40), { uid: UID, name: 'x', admin: true }, Date.now())).tk;
    const old = await good(undefined, Date.now() - 120000);
    const flip = tk.endsWith('A') ? 'B' : 'A';
    for (const t of [null, tk.slice(0, -1) + flip, other, old]) {
      expect((await worker.fetch(req('/mp', up(t)), env)).status).toBe(401);
    }
    expect(seen).toHaveLength(0);
  });

  it('leitet an WORLD (idFromName world) weiter: Claims gesetzt, x-lfx-* entfernt, Upgrade/Protokoll erhalten', async () => {
    const { env, world, seen } = makeEnv();
    const tk = await good({ uid: UID, name: 'Lenz', admin: true });
    const r = await worker.fetch(
      req('/mp', up(tk, { 'X-Lfx-Claims': 'evil', 'x-lfx-evil': '1', 'X-LFX-Other': '2' })),
      env,
    );
    expect(r.status).toBe(200);
    expect(world.idFromName).toHaveBeenCalledWith('world');
    expect(seen).toHaveLength(1);
    const f = seen[0];
    expect(f.headers.get('x-lfx-evil')).toBeNull();
    expect(f.headers.get('x-lfx-other')).toBeNull();
    expect(f.headers.get('Upgrade')).toBe('websocket');
    expect(f.headers.get('Sec-WebSocket-Protocol')).toContain('lfx-mp.1');
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(f.headers.get('X-Lfx-Claims'))));
    expect(Object.keys(claims).sort()).toEqual(['a', 'e', 'j', 'k', 'n']);
    expect(claims).toMatchObject({ n: 'Lenz', a: 1 });
    expect(claims.k).toMatch(/^[0-9a-f]{12}$/);
    expect(JSON.stringify(claims)).not.toContain(UID);
  });

  it('503, wenn das DO wirft (ohne Fehlertext im Log)', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { env } = makeEnv();
    env.WORLD.get = () => ({
      fetch: async () => {
        throw new Error('boom');
      },
    });
    const r = await worker.fetch(req('/mp', up(await good())), env);
    expect(r.status).toBe(503);
    expect(err.mock.calls.flat().join(' ')).not.toContain('boom');
    err.mockRestore();
  });

  it('503 mp-disabled ohne Binding', async () => {
    const { env } = makeEnv({ WORLD: undefined });
    expect((await worker.fetch(req('/mp', up(await good())), env)).status).toBe(503);
  });
});

describe('bestehende Routen unverändert', () => {
  it('unbekannter Pfad 404, POST /mp/ticket 404', async () => {
    const { env } = makeEnv();
    expect((await worker.fetch(req('/nix'), env)).status).toBe(404);
    expect((await worker.fetch(req('/mp/ticket', { method: 'POST' }), env)).status).toBe(404);
  });
});
