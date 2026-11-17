import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearAuthCache, resolveUser } from '../src/auth.js';
import { getMeInfo } from '../src/jellyfin.js';

const ENV = { JELLYFIN_URL: 'https://jf.example', JELLYFIN_API_KEY: 'KEY' };
const UID = 'ab'.repeat(16);
const GUID = `${UID.slice(0, 8)}-${UID.slice(8, 12)}-${UID.slice(12, 16)}-${UID.slice(16, 20)}-${UID.slice(20)}`;

let cacheMap;
function fakeCaches() {
  cacheMap = new Map();
  return {
    default: {
      match: async (r) => {
        const v = cacheMap.get(r.url);
        return v ? new Response(v) : undefined;
      },
      put: async (r, res) => {
        cacheMap.set(r.url, await res.text());
      },
      delete: async (r) => cacheMap.delete(r.url),
    },
  };
}
const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
const me = (extra = {}) => ({ Id: GUID, Name: 'Lenz', Policy: { IsAdministrator: true }, ...extra });

beforeEach(() => {
  clearAuthCache();
  vi.stubGlobal('caches', fakeCaches());
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('getMeInfo', () => {
  it('Id, Name, Admin aus /Users/Me', async () => {
    const f = vi.fn(async () => json(me()));
    vi.stubGlobal('fetch', f);
    expect(await getMeInfo(ENV, 'tok')).toEqual({ uid: UID, name: 'Lenz', admin: true });
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe('https://jf.example/Users/Me');
  });
  it('Policy fehlt: Rückfall /Users/{uid}', async () => {
    const f = vi.fn(async (url) =>
      url.endsWith('/Users/Me') ? json({ Id: GUID, Name: 'N' }) : json({ Policy: { IsAdministrator: true } }),
    );
    vi.stubGlobal('fetch', f);
    expect(await getMeInfo(ENV, 'tok')).toEqual({ uid: UID, name: 'N', admin: true });
    expect(f.mock.calls[1][0]).toBe(`https://jf.example/Users/${UID}`);
  });
  it('Policy fehlt und Rückfall scheitert: admin=false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url) => (url.endsWith('/Users/Me') ? json({ Id: GUID, Name: 'N' }) : json({}, 500))),
    );
    expect((await getMeInfo(ENV, 'tok')).admin).toBe(false);
  });
  it('IsAdministrator nicht true: false', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(me({ Policy: { IsAdministrator: 'true' } }))));
    expect((await getMeInfo(ENV, 'tok')).admin).toBe(false);
  });
  it('401/403 -> false; 5xx, HTML, ungültige Id werfen', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 401)));
    expect(await getMeInfo(ENV, 'tok')).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 403)));
    expect(await getMeInfo(ENV, 'tok')).toBe(false);
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 503)));
    await expect(getMeInfo(ENV, 'tok')).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>', { status: 200 })));
    await expect(getMeInfo(ENV, 'tok')).rejects.toThrow();
    vi.stubGlobal('fetch', vi.fn(async () => json({ Id: 'zz', Name: 'x' })));
    await expect(getMeInfo(ENV, 'tok')).rejects.toThrow();
  });
});

describe('resolveUser', () => {
  it('holt, cacht unter tok2/ (nur Hash) und nutzt den Cache 10 min', async () => {
    const f = vi.fn(async () => json(me()));
    vi.stubGlobal('fetch', f);
    expect(await resolveUser(ENV, 'tok', null)).toEqual({ uid: UID, name: 'Lenz', admin: true });
    const keys = [...cacheMap.keys()];
    expect(keys).toHaveLength(1);
    expect(keys[0]).toMatch(/\/tok2\/[0-9a-f]{64}$/);
    expect(await resolveUser(ENV, 'tok', null)).toEqual({ uid: UID, name: 'Lenz', admin: true });
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('nach 10 min neu geholt; 5xx -> 24-h-Rückfall nur mit admin=false', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T10:00:00Z'));
    vi.stubGlobal('fetch', vi.fn(async () => json(me())));
    await resolveUser(ENV, 'tok', null);
    vi.setSystemTime(new Date('2026-11-17T10:11:00Z'));
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 503)));
    expect(await resolveUser(ENV, 'tok', null)).toEqual({ uid: UID, name: 'Lenz', admin: false });
  });

  it('5xx ohne Cache -> 502', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({}, 500)));
    expect(await resolveUser(ENV, 'tok', null)).toEqual({ status: 502 });
  });

  it('401 -> 401, Cache geleert, Negativ-Cache verhindert Wiederholung (60 s)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-17T10:00:00Z'));
    vi.stubGlobal('fetch', vi.fn(async () => json(me())));
    await resolveUser(ENV, 'tok', null);
    vi.setSystemTime(new Date('2026-11-17T10:11:00Z'));
    const f = vi.fn(async () => json({}, 401));
    vi.stubGlobal('fetch', f);
    expect(await resolveUser(ENV, 'tok', null)).toEqual({ status: 401 });
    expect(cacheMap.size).toBe(0);
    expect(await resolveUser(ENV, 'tok', null)).toEqual({ status: 401 });
    expect(f).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-11-17T10:12:05Z'));
    expect(await resolveUser(ENV, 'tok', null)).toEqual({ status: 401 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('nutzt ctx.waitUntil fürs Schreiben', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(me())));
    const jobs = [];
    await resolveUser(ENV, 'tok', { waitUntil: (p) => jobs.push(p) });
    expect(jobs).toHaveLength(1);
    await Promise.all(jobs);
    expect(cacheMap.size).toBe(1);
  });

  it('ohne Cache API funktioniert es weiter', async () => {
    vi.stubGlobal('caches', undefined);
    vi.stubGlobal('fetch', vi.fn(async () => json(me())));
    expect(await resolveUser(ENV, 'tok', null)).toMatchObject({ uid: UID });
  });
});
