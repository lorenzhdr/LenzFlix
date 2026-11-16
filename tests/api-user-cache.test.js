// @vitest-environment jsdom
// Core-API: Startseiten-Cache nach Favorit/Gesehen erneut leeren, getUser dedupliziert parallele Aufrufe.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cached, clearCache, peekCached, HOME_TTL } from '../src/js/core/cache.js';
import { setFavorite, setPlayed, getUser } from '../src/js/core/api.js';

function client(extra = {}) {
  window.ApiClient = {
    serverId: () => 'srv', getCurrentUserId: () => 'u1', accessToken: () => 'tok', serverAddress: () => 'http://x', ...extra,
  };
}

beforeEach(() => { clearCache(); client(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Startseiten-Cache nach dem Server-Aufruf erneut leeren', () => {
  it('setFavorite: im Fenster zwischen Leeren und Antwort gespeichertes Ergebnis wird verworfen', async () => {
    let release;
    client({ updateFavoriteStatus: () => new Promise((r) => { release = r; }) });
    const p = setFavorite('i1', true);
    await cached('home:u1:row:fav', async () => 'alt', HOME_TTL);
    expect(peekCached('home:u1:row:fav')).toBe('alt');
    release({});
    await p;
    expect(peekCached('home:u1:row:fav')).toBeUndefined();
  });
  it('setPlayed: dito', async () => {
    let release;
    vi.stubGlobal('fetch', vi.fn(() => new Promise((r) => { release = () => r({ ok: true, status: 200 }); })));
    const p = setPlayed('i1', true);
    await cached('home:u1:row:resume', async () => 'alt', HOME_TTL);
    release();
    await p;
    expect(peekCached('home:u1:row:resume')).toBeUndefined();
  });
});

describe('getUser dedupliziert parallele Aufrufe', () => {
  it('drei parallele Aufrufe -> ein Abruf', async () => {
    const getCurrentUser = vi.fn(async () => ({ Name: 'A' }));
    client({ getCurrentUserId: () => 'dedup-user', getCurrentUser });
    const r = await Promise.all([getUser(), getUser(), getUser()]);
    expect(r.map((u) => u.Name)).toEqual(['A', 'A', 'A']);
    expect(getCurrentUser).toHaveBeenCalledTimes(1);
  });
  it('Fehler wird nicht gemerkt', async () => {
    const getCurrentUser = vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue({ Name: 'B' });
    client({ getCurrentUserId: () => 'retry-user', getCurrentUser });
    expect(await getUser()).toBeNull();
    expect((await getUser()).Name).toBe('B');
  });
});

