// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const userState = vi.hoisted(() => ({ id: 'u1' }));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, getUserId: () => userState.id };
});

import { cached, clearCache, peekCached, homeKey } from '../src/js/core/cache.js';
import { initHomeCache, destroyHomeCache } from '../src/js/core/homecache.js';

const KEY = homeKey('u1', 'x');
const hash = (h) => {
  window.location.hash = h;
  window.dispatchEvent(new Event('hashchange'));
};

describe('Startseiten-Cache: Invalidierung', () => {
  beforeEach(async () => {
    userState.id = 'u1';
    clearCache();
    window.location.hash = '#/home';
    initHomeCache();
    await cached(KEY, async () => 1, 60_000);
  });
  afterEach(() => destroyHomeCache());

  it('Schlüssel pro Nutzer', () => {
    expect(homeKey('u1', 'row', 'a')).toBe('home:u1:row:a');
    expect(homeKey(undefined, 'row')).toBe('home:anon:row');
  });

  it('lfx:play leert', () => {
    expect(peekCached(KEY)).toBe(1);
    window.dispatchEvent(new CustomEvent('lfx:play', { detail: { id: 'a' } }));
    expect(peekCached(KEY)).toBeUndefined();
  });

  it('Player per pushState (ohne hashchange) + viewshow leert', () => {
    history.pushState(null, '', '#/video');
    expect(peekCached(KEY)).toBe(1);
    document.dispatchEvent(new Event('viewshow'));
    expect(peekCached(KEY)).toBeUndefined();
    history.pushState(null, '', '#/home');
  });

  it('Player-Route leert, TV-Modus nicht', () => {
    hash('#/home?lfx=tv');
    expect(peekCached(KEY)).toBe(1);
    hash('#/home');
    expect(peekCached(KEY)).toBe(1);
    hash('#/video');
    expect(peekCached(KEY)).toBeUndefined();
  });

  it('Nutzerwechsel leert', () => {
    userState.id = 'u2';
    hash('#/home?x=1');
    expect(peekCached(KEY)).toBeUndefined();
  });

  it('destroy entfernt die Listener', () => {
    destroyHomeCache();
    window.dispatchEvent(new CustomEvent('lfx:play'));
    expect(peekCached(KEY)).toBe(1);
  });

  it('clearCache verwirft laufende Abrufe (kein veraltetes Ergebnis)', async () => {
    let release;
    const p = cached('home:u1:slow', () => new Promise((r) => { release = r; }), 60_000);
    await Promise.resolve();
    await Promise.resolve();
    clearCache('home:');
    release(5);
    await p;
    expect(peekCached('home:u1:slow')).toBeUndefined();
  });
});
