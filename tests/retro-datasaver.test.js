// @vitest-environment jsdom
// LENZ//84 und Datensparmodus: Lazy-Rand, Hero-Pool (5 Titel, live), Pool-Cache, Vorladen, Browse-Rand.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ds = vi.hoisted(() => ({ on: false, off: [], cbs: [] }));
vi.mock('../src/js/core/datasaver.js', () => ({
  isDataSaver: (part) => ds.on && !(part && ds.off.includes(part)),
  onDataSaverChange: (cb) => { ds.cbs.push(cb); return () => {}; },
  onDataSaverPartsChange: (cb) => { ds.cbs.push(cb); return () => {}; },
}));
vi.mock('../src/js/core/theme.js', () => ({
  getTheme: () => 'retro', isTheme: (id) => id === 'retro', brandName: () => 'LENZ//84', onThemeChange: () => () => {},
}));
vi.mock('../src/js/core/api.js', () => ({
  isReady: () => true,
  getUserId: () => 'u1',
  getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }),
  getItems: vi.fn(async () => ({ Items: [] })),
  getJson: vi.fn(async () => ({ Items: [] })),
  imageUrl: (it, { type }) => `/Items/${it.Id}/Images/${type}?tag=t`,
}));
vi.mock('../src/js/core/itemmenu.js', () => ({
  openItemMenu: vi.fn(), isMenuOpen: () => false, onItemsChanged: vi.fn(() => () => {}),
}));
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isMobile: () => false }));
vi.mock('../src/js/shared/libraries.js', () => ({
  getLibraries: vi.fn().mockResolvedValue([{ id: 'lib1', name: 'Filme', collectionType: 'movies', href: '#/movies', hubCapable: true }]),
}));
vi.mock('../src/js/features/prime/hero-play.js', () => ({
  playTitle: vi.fn(), playLabel: () => ({ line1: 'Abspielen', line2: null, progress: 0 }),
}));
const prefetch = vi.hoisted(() => ({ start: vi.fn(() => ({ stop: vi.fn(), notify: vi.fn() })) }));
vi.mock('../src/js/features/rows/prefetch.js', () => ({
  startRowPrefetch: prefetch.start, allowPrefetch: () => true, heroSettled: () => true,
}));

import * as api from '../src/js/core/api.js';
import { createRows } from '../src/js/features/retro/home-rows.js';
import { renderHero, fetchCachedHomePool, peekHomePool } from '../src/js/features/retro/home-hero.js';
import browse from '../src/js/features/retro/browse.js';
import { parseHash } from '../src/js/core/router.js';
import { clearCache, peekCached } from '../src/js/core/cache.js';

const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const mk = (id) => ({ Id: id, Name: `Titel ${id}`, Type: 'Movie', ImageTags: { Logo: 'l' }, BackdropImageTags: ['b'] });
const many = (n) => Array.from({ length: n }, (_, i) => mk(`t${i}`));
let margins;

beforeEach(() => {
  ds.on = false; ds.off = []; ds.cbs = [];
  prefetch.start.mockClear();
  clearCache();
  margins = [];
  globalThis.IntersectionObserver = class {
    constructor(cb, opts) { margins.push(opts && opts.rootMargin); }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  document.body.innerHTML = '<div id="slot"></div>';
});
afterEach(() => { delete globalThis.IntersectionObserver; document.body.innerHTML = ''; });

const defs = [{ id: 'a', title: 'A', kind: 'landscape', load: async () => [] }];

describe('Zeilen', () => {
  it('Lazy-Rand: 600px, bei Datensparmodus (Teil lazy) 100px, Teil aus = 600px', () => {
    const slot = document.getElementById('slot');
    const run = () => { margins = []; const r = createRows(slot); r.add(defs); r.destroy(); return margins[0]; };
    expect(run()).toBe('600px 0px');
    ds.on = true;
    expect(run()).toBe('100px 0px');
    ds.off = ['lazy'];
    expect(run()).toBe('600px 0px');
  });

  it('Vorladen nur mit prefetch-Option, stop beim Zerstören', () => {
    const slot = document.getElementById('slot');
    createRows(slot).add(defs);
    expect(prefetch.start).not.toHaveBeenCalled();
    const heroFn = () => null;
    const r = createRows(slot, { prefetch: true, hero: heroFn });
    r.add(defs);
    expect(prefetch.start).toHaveBeenCalledTimes(1);
    expect(prefetch.start.mock.calls[0][0].hero).toBe(heroFn);
    const stop = prefetch.start.mock.results[0].value.stop;
    r.destroy();
    expect(stop).toHaveBeenCalled();
  });
});

describe('Hero', () => {
  const start = async (items, opts = {}) => {
    const slot = document.getElementById('slot');
    const dispose = renderHero(slot, { loadPool: async () => items, ...opts });
    await flush();
    return { slot, dispose };
  };

  it('ohne Modus alle Titel, mit Modus 5, Teil hero aus = alle', async () => {
    let r = await start(many(12));
    expect(r.slot.querySelector('.lfx-retro-hero__count').textContent).toBe('01/12');
    r.dispose();
    ds.on = true;
    r = await start(many(12));
    expect(r.slot.querySelector('.lfx-retro-hero__count').textContent).toBe('01/05');
    r.dispose();
    ds.off = ['hero'];
    r = await start(many(12));
    expect(r.slot.querySelector('.lfx-retro-hero__count').textContent).toBe('01/12');
    r.dispose();
  });

  it('kürzt live beim Einschalten', async () => {
    const r = await start(many(12));
    ds.on = true;
    ds.cbs.forEach((cb) => cb());
    expect(r.slot.querySelector('.lfx-retro-hero__count').textContent).toBe('01/05');
    r.dispose();
  });

  it('peekPool zeigt sofort ohne loadPool', async () => {
    const loadPool = vi.fn(async () => many(3));
    const slot = document.getElementById('slot');
    const dispose = renderHero(slot, { loadPool, peekPool: () => many(4) });
    await Promise.resolve();
    await Promise.resolve();
    expect(slot.querySelector('.lfx-retro-hero__count').textContent).toBe('01/04');
    expect(loadPool).not.toHaveBeenCalled();
    dispose();
  });

  it('Pool-Cache: Schlüssel mit home:, zweiter Aufruf aus dem Cache', async () => {
    api.getItems.mockResolvedValue({ Items: many(10) });
    expect(peekHomePool()).toBeUndefined();
    const a = await fetchCachedHomePool();
    const calls = api.getItems.mock.calls.length;
    expect(a.length).toBeGreaterThan(0);
    expect(peekHomePool()).toBe(a);
    expect(peekCached('home:u1:retro:hero')).toBe(a);
    await fetchCachedHomePool();
    expect(api.getItems.mock.calls.length).toBe(calls);
    clearCache('home:');
    expect(peekHomePool()).toBeUndefined();
  });
});

describe('Browse', () => {
  it('Nachlade-Rand 900px, bei Datensparmodus 100px', async () => {
    document.body.innerHTML = '<div id="indexPage"><div id="homeTab"></div></div>';
    api.getItems.mockResolvedValue({ Items: [], TotalRecordCount: 0 });
    browse.mount(parseHash('#/home?lfx=browse&lib=lib1'));
    await flush();
    browse.unmount();
    expect(margins).toContain('900px 0px');
    margins = [];
    ds.on = true;
    browse.mount(parseHash('#/home?lfx=browse&lib=lib1'));
    await flush();
    browse.unmount();
    expect(margins).toContain('100px 0px');
    expect(margins).not.toContain('900px 0px');
  });
});
