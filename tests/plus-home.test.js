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
    getViews: vi.fn(),
    getJson: vi.fn(),
    getResume: vi.fn(),
    getNextUp: vi.fn(),
    getLatest: vi.fn(),
    getSimilar: vi.fn(),
  };
});
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isMobile: () => false }));
vi.mock('../src/js/shared/libraries.js', () => ({
  getLibraries: vi.fn().mockResolvedValue([{ id: 'lib1', name: 'Filme', collectionType: 'movies', href: '#/movies', hubCapable: true }]),
}));
vi.mock('../src/js/shared/collections.js', () => ({ getCollections: vi.fn().mockResolvedValue([]) }));
vi.mock('../src/js/shared/hub.js', () => ({
  buildHubRowDefs: vi.fn().mockResolvedValue([]),
  getHubHeroPool: vi.fn().mockResolvedValue([]),
}));
vi.mock('../src/js/shared/newcontent.js', () => ({
  getNewContentInfo: vi.fn().mockResolvedValue({ bySeries: new Map(), newMovieIds: new Set(), newSeriesIds: new Set() }),
  plusBadge: () => null,
}));
vi.mock('../src/js/features/rows/sources.js', () => ({
  buildRowDefs: vi.fn().mockResolvedValue([]),
  peekRowDefs: vi.fn(() => undefined),
  getNewSeriesIds: vi.fn().mockResolvedValue(new Set()),
  asItems: (r) => (r && r.Items) || [],
}));

import home, { routeKey } from '../src/js/features/plus/home.js';
import { parseHash } from '../src/js/core/router.js';
import { buildHubRowDefs, getHubHeroPool } from '../src/js/shared/hub.js';
import { buildRowDefs } from '../src/js/features/rows/sources.js';
import * as api from '../src/js/core/api.js';

const route = (hash) => parseHash(hash);
const flush = () => new Promise((r) => setTimeout(r, 0));
const item = { Id: 'h1', Name: 'Held', Type: 'Movie', ImageTags: { Logo: 'l' }, BackdropImageTags: ['b'], Genres: [] };

beforeEach(() => {
  themeState.id = 'plus';
  document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections">nativ</div></div></div>';
  api.getItems.mockResolvedValue({ Items: [item] });
  vi.mocked(buildRowDefs).mockClear();
  vi.mocked(buildHubRowDefs).mockClear();
});
afterEach(() => { home.unmount(); document.body.innerHTML = ''; });

describe('routeKey / match', () => {
  it('erkennt Startseite und Hub, nicht andere Routen', () => {
    expect(routeKey(route('#/home'))).toBe('home');
    expect(routeKey(route('#/home?lfx=hub&lib=lib1'))).toBe('hub:lib1');
    expect(routeKey(route('#/home?lfx=hub'))).toBeNull();
    expect(routeKey(route('#/home?tab=1'))).toBeNull();
    expect(routeKey(route('#/home?lfx=title&id=1'))).toBeNull();
    expect(routeKey(route('#/movies'))).toBeNull();
  });
  it('match nur im Theme plus', () => {
    expect(home.match(route('#/home'))).toBe(true);
    themeState.id = 'flix';
    expect(home.match(route('#/home'))).toBe(false);
  });
});

describe('mount / update / unmount', () => {
  it('mountet Hülle, blendet nativ per Klasse aus, räumt auf', async () => {
    home.mount(route('#/home'));
    await flush(); await flush();
    expect(document.getElementById('lfx-plus-home')).not.toBeNull();
    expect(document.documentElement.classList.contains('lfx-plus-home-on')).toBe(true);
    expect(document.querySelector('.lfx-plus-hero')).not.toBeNull();
    expect(buildRowDefs).toHaveBeenCalled();
    expect(document.querySelector('.sections').textContent).toBe('nativ'); // nicht mutiert
    home.unmount();
    expect(document.getElementById('lfx-plus-home')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-plus-home-on')).toBe(false);
  });

  it('rendert beim Wechsel Startseite -> Hub neu', async () => {
    home.mount(route('#/home'));
    await flush(); await flush();
    const first = document.getElementById('lfx-plus-home');
    vi.mocked(getHubHeroPool).mockResolvedValueOnce([item]);
    home.update(route('#/home?lfx=hub&lib=lib1'));
    await flush(); await flush(); await flush();
    const second = document.getElementById('lfx-plus-home');
    expect(second).not.toBe(first);
    expect(second.classList.contains('lfx-plus-home--hub')).toBe(true);
    expect(buildHubRowDefs).toHaveBeenCalledWith(expect.objectContaining({ id: 'lib1' }));
    expect(document.querySelector('.lfx-plus-brands')).toBeNull();
    // gleiche Route: nicht neu bauen
    home.update(route('#/home?lfx=hub&lib=lib1'));
    expect(document.getElementById('lfx-plus-home')).toBe(second);
  });
});
