// @vitest-environment jsdom
// Regressionstests Audit Welle 1 (Paket core): A011, A008, A012, B035, A014, B034, B036, A009.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cached, clearCache, peekCached, HOME_TTL } from '../src/js/core/cache.js';
import { setFavorite, setPlayed, getUser } from '../src/js/core/api.js';
import { getCharts } from '../src/js/core/charts.js';
import { applyFavicon, removeFavicon } from '../src/js/core/favicon.js';
import { initHomeCache, destroyHomeCache } from '../src/js/core/homecache.js';
import { putItems, getStoredItem, clearItemStore } from '../src/js/core/itemstore.js';
import { play } from '../src/js/core/playback.js';
import { destroy as destroyCover } from '../src/js/core/startcover.js';

const GOOD = {
  version: 1, generatedAt: '2026-11-08T19:00:00Z', windowDays: 30, metric: 'viewers',
  movies: [{ id: 'm1', viewers: 3, plays: 5, seconds: 1 }], series: [{ id: 's1', viewers: 2, plays: 4, seconds: 1 }], all: [],
};

function client(extra = {}) {
  window.ApiClient = {
    serverId: () => 'srv', getCurrentUserId: () => 'u1', accessToken: () => 'tok', serverAddress: () => 'http://x', ...extra,
  };
}

beforeEach(() => { clearCache(); client(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('A011: Startseiten-Cache nach dem Server-Aufruf erneut leeren', () => {
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

describe('A008: getUser dedupliziert parallele Aufrufe', () => {
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

describe('A012: cache.js begrenzt den Speicher', () => {
  it('älteste Einträge fallen bei Überschreitung der Obergrenze heraus', async () => {
    for (let i = 0; i < 700; i++) await cached(`k:${i}`, async () => i, 60_000);
    expect(peekCached('k:0')).toBeUndefined();
    expect(peekCached('k:699')).toBe(699);
  });
});

describe('B035: Charts-Fehler nur kurz merken', () => {
  it('null nach Fehler wird nach 30 s neu abgerufen, Erfolg bleibt 5 min', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
    window.LenzFlixConfig = { chartsUrl: 'https://charts.example.com' };
    const f = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ ok: true, status: 200, json: async () => GOOD });
    vi.stubGlobal('fetch', f);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getCharts()).toBeNull();
    expect(await getCharts()).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-11-16T10:00:31Z'));
    expect(await getCharts()).not.toBeNull();
    vi.setSystemTime(new Date('2026-11-16T10:03:00Z'));
    expect(await getCharts()).not.toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
    delete window.LenzFlixConfig;
  });
});

describe('A014: removeFavicon stellt sizes und fehlendes href wieder her', () => {
  afterEach(() => { removeFavicon(); document.head.innerHTML = ''; });
  it('sizes zurück, Link ohne href bleibt ohne href', () => {
    document.head.innerHTML = '<link rel="apple-touch-icon" sizes="180x180" href="a.png"><link rel="icon">';
    applyFavicon();
    removeFavicon();
    const [a, b] = [...document.head.querySelectorAll('link')];
    expect(a.getAttribute('sizes')).toBe('180x180');
    expect(a.getAttribute('href')).toBe('a.png');
    expect(b.hasAttribute('href')).toBe(false);
    expect(document.head.querySelector('[data-lfx-orig]')).toBeNull();
  });
});

describe('B034/B036: homecache', () => {
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

describe('A009: playViaDetails klickt nur auf der angesteuerten Detailseite', () => {
  beforeEach(() => { document.documentElement.className = 'lfx-js'; document.body.innerHTML = ''; destroyCover(); });
  it('Navigation zu anderem Titel -> kein Klick, false', async () => {
    const click = vi.fn();
    const pr = play({ Id: 'i1', Type: 'Movie', MediaType: 'Video' }, { timeoutMs: 600 });
    window.location.hash = '#/details?id=other&serverId=srv';
    document.body.innerHTML = '<div class="itemDetailPage"><div class="mainDetailButtons"><button class="btnPlay"></button></div></div>';
    document.querySelector('.btnPlay').addEventListener('click', click);
    expect(await pr).toBe(false);
    expect(click).not.toHaveBeenCalled();
  });
  it('richtige Detailseite -> Klick', async () => {
    const click = vi.fn();
    document.body.innerHTML = '<div class="itemDetailPage"><div class="mainDetailButtons"><button class="btnPlay"></button></div></div>';
    document.querySelector('.btnPlay').addEventListener('click', click);
    expect(await play({ Id: 'i2', Type: 'Movie', MediaType: 'Video' }, { timeoutMs: 600 })).toBe(true);
    expect(click).toHaveBeenCalledTimes(1);
  });
});
