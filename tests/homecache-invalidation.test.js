// @vitest-environment jsdom
// homecache: UserDataChanged, Player-Verlassen und Nutzerwechsel leeren den Cache.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cached, clearCache, peekCached } from '../src/js/core/cache.js';
import { initHomeCache, destroyHomeCache } from '../src/js/core/homecache.js';
import { putItems, getStoredItem, clearItemStore } from '../src/js/core/itemstore.js';

function client(extra = {}) {
  window.ApiClient = {
    serverId: () => 'srv', getCurrentUserId: () => 'u1', accessToken: () => 'tok', serverAddress: () => 'http://x', ...extra,
  };
}

beforeEach(() => { clearCache(); client(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('homecache', () => {
  const KEY = 'home:u1:x';
  const hash = (h) => { window.location.hash = h; window.dispatchEvent(new Event('hashchange')); };
  afterEach(() => destroyHomeCache());

  it('UserDataChanged leert den Startseiten-Cache, Abmeldung bei destroy', async () => {
    let cb = null;
    const unsub = vi.fn();
    client({ subscribe: vi.fn((_t, fn) => { cb = fn; return unsub; }) });
    window.location.hash = '#/home';
    initHomeCache();
    await cached(KEY, async () => 1, 60_000);
    expect(cb).toBeTypeOf('function');
    cb({ MessageType: 'UserDataChanged', Data: {} });
    expect(peekCached(KEY)).toBeUndefined();
    destroyHomeCache();
    expect(unsub).toHaveBeenCalled();
  });

  it('Verlassen des Players leert sofort und nach 2 s erneut', async () => {
    window.location.hash = '#/home';
    initHomeCache();
    hash('#/video');
    vi.useFakeTimers();
    hash('#/home');
    await cached(KEY, async () => 1, 60_000);
    expect(peekCached(KEY)).toBe(1);
    await vi.advanceTimersByTimeAsync(2100);
    expect(peekCached(KEY)).toBeUndefined();
  });

  it('Nutzerwechsel leert auch den itemstore', () => {
    window.location.hash = '#/home';
    initHomeCache();
    putItems([{ Id: 'a', UserData: { IsFavorite: true } }]);
    expect(getStoredItem('a')).not.toBeNull();
    client({ getCurrentUserId: () => 'u2' });
    hash('#/home?x=1');
    expect(getStoredItem('a')).toBeNull();
    clearItemStore();
  });
});

