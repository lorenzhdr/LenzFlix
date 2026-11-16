// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const themeState = vi.hoisted(() => ({ id: 'retro' }));
vi.mock('../src/js/core/theme.js', () => ({
  getTheme: () => themeState.id,
  isTheme: (id) => themeState.id === id,
  brandName: () => 'LENZ//84',
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
const lay = vi.hoisted(() => ({ mobile: false, narrow: false }));
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isMobile: () => lay.mobile, isNarrow: () => lay.narrow }));
vi.mock('../src/js/shared/libraries.js', () => ({
  getLibraries: vi.fn().mockResolvedValue([{ id: 'lib1', name: 'Filme', collectionType: 'movies', href: '#/movies', hubCapable: true }]),
}));

import browse from '../src/js/features/retro/browse.js';
import { parseHash } from '../src/js/core/router.js';
import * as api from '../src/js/core/api.js';


const route = (hash) => parseHash(hash);
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const mk = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ Id: `i${from + i}`, Name: `Titel ${from + i}`, Type: 'Movie' }));

describe('retro-browse Nachladen bei dauerhaft sichtbarem Sentinel', () => {
  const realIO = globalThis.IntersectionObserver;
  beforeEach(() => {
    window.scrollTo = vi.fn();
    window.localStorage.clear();
    document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections">nativ</div></div></div>';
    api.getJson.mockReset();
    api.getJson.mockResolvedValue({ Items: [] });
    api.getItems.mockReset();
    // IO meldet nur Zustandswechsel: genau ein Callback beim observe(), danach nie wieder.
    globalThis.IntersectionObserver = class {
      constructor(cb) { this.cb = cb; }
      observe() { queueMicrotask(() => this.cb([{ isIntersecting: true }])); }
      unobserve() {}
      disconnect() {}
    };
    // Sentinel liegt innerhalb viewport + 900px rootMargin (z. B. 40 Zeilen * 40px = 1600px)
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
      const top = this.classList && this.classList.contains('lfx-rb__sentinel') ? 1600 : 0;
      return { top, bottom: top, left: 0, right: 0, width: 0, height: 0, x: 0, y: top, toJSON() {} };
    });
  });
  afterEach(() => {
    browse.unmount();
    globalThis.IntersectionObserver = realIO;
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  it('laedt Seite 2, solange der Sentinel nach Seite 1 noch im Ladebereich liegt', async () => {
    api.getItems.mockImplementation(async (p) => ({ Items: mk(p.StartIndex === 0 ? 40 : 40, p.StartIndex), TotalRecordCount: 100 }));
    browse.mount(route('#/home?lfx=browse&lib=lib1'));
    await flush();
    expect(api.getItems.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(api.getItems.mock.calls[1][0]).toMatchObject({ StartIndex: 40 });
  });

  it('Listenansicht im Handy-Querformat (mobile, nicht schmal) bleibt aktiv', async () => {
    lay.mobile = true; lay.narrow = false;
    window.localStorage.setItem('lfx.retro.browseview', 'list');
    api.getItems.mockImplementation(async () => ({ Items: mk(3), TotalRecordCount: 3 }));
    browse.mount(route('#/home?lfx=browse&lib=lib1'));
    await flush();
    lay.mobile = false;
    expect(document.querySelector('.lfx-rb__grid').classList.contains('is-list')).toBe(true);
  });
});
