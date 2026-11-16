// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const themeState = vi.hoisted(() => ({ id: 'plus' }));
vi.mock('../src/js/core/theme.js', () => ({
  getTheme: () => themeState.id,
  isTheme: (id) => themeState.id === id,
  brandName: () => 'LENZ+',
}));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    isReady: () => true,
    getUserId: () => 'u1',
    getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }),
    getItems: vi.fn(),
    getJson: vi.fn(),
  };
});
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isMobile: () => false }));
vi.mock('../src/js/shared/libraries.js', () => ({
  getLibraries: vi.fn().mockResolvedValue([{ id: 'lib1', name: 'Filme', collectionType: 'movies', href: '#/movies', hubCapable: true }]),
}));
vi.mock('../src/js/shared/newcontent.js', () => ({
  getNewContentInfo: vi.fn().mockResolvedValue({}),
  plusBadge: () => null,
}));

import browse from '../src/js/features/plus/browse.js';
import { parseHash } from '../src/js/core/router.js';
import * as api from '../src/js/core/api.js';

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const mk = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ Id: `i${from + i}`, Name: `Titel ${from + i}`, Type: 'Movie' }));

const realIO = globalThis.IntersectionObserver;
beforeEach(() => {
  themeState.id = 'plus';
  window.scrollTo = vi.fn();
  document.documentElement.className = '';
  document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections">nativ</div></div></div>';
  api.getItems.mockReset();
  api.getJson.mockReset();
  api.getJson.mockResolvedValue({ Items: [] });
});
afterEach(() => { browse.unmount(); document.body.innerHTML = ''; globalThis.IntersectionObserver = realIO; });

describe('Raster-Nachladen bei dauerhaft sichtbarem Sentinel', () => {
  it('lädt Seite 2, obwohl der IntersectionObserver nur einmal (während Seite 1 lädt) feuert', async () => {
    // Echter IO: meldet nur den Anfangszustand (sichtbar) einmal, danach nur bei Zustandswechsel.
    globalThis.IntersectionObserver = class {
      constructor(cb) { this.cb = cb; }
      observe(el) { setTimeout(() => this.cb([{ target: el, isIntersecting: true }]), 0); }
      unobserve() {}
      disconnect() {}
    };
    let release;
    const gate = new Promise((r) => { release = r; });
    api.getItems.mockImplementation(async (p) => {
      if (p.StartIndex === 0) { await gate; return { Items: mk(40), TotalRecordCount: 100 }; }
      return { Items: mk(40, p.StartIndex), TotalRecordCount: 100 };
    });
    browse.mount(parseHash('#/home?lfx=browse&lib=lib1'));
    await flush(); // IO-Rückruf kommt, während Seite 1 noch lädt -> wird verworfen
    release();
    await flush();
    expect(document.querySelectorAll('.lfx-card').length).toBeGreaterThanOrEqual(40);
    // Sentinel liegt weiter im 800-px-Rand (jsdom: top=0) -> Seite 2 muss nachgeladen werden
    expect(api.getItems.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
