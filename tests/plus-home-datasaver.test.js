// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const themeState = vi.hoisted(() => ({ id: 'plus' }));
vi.mock('../src/js/core/theme.js', () => ({ getTheme: () => themeState.id, isTheme: (id) => themeState.id === id, brandName: () => 'LENZ+' }));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual, isReady: () => true, getUserId: () => 'u1',
    getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }),
    getItems: vi.fn(), getJson: vi.fn(),
  };
});
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isMobile: () => false }));
vi.mock('../src/js/shared/libraries.js', () => ({ getLibraries: vi.fn().mockResolvedValue([]) }));
vi.mock('../src/js/shared/collections.js', () => ({ getCollections: vi.fn().mockResolvedValue([]) }));
vi.mock('../src/js/shared/hub.js', () => ({ buildHubRowDefs: vi.fn().mockResolvedValue([]), getHubHeroPool: vi.fn().mockResolvedValue([]) }));
vi.mock('../src/js/shared/newcontent.js', () => ({
  getNewContentInfo: vi.fn().mockResolvedValue({ bySeries: new Map(), newMovieIds: new Set(), newSeriesIds: new Set() }),
  plusBadge: () => null,
}));
vi.mock('../src/js/features/rows/sources.js', () => ({
  buildRowDefs: vi.fn().mockResolvedValue([]), peekRowDefs: vi.fn(() => null), getNewSeriesIds: vi.fn().mockResolvedValue(new Set()),
}));
vi.mock('../src/js/features/rows/prefetch.js', () => ({
  startRowPrefetch: vi.fn(() => ({ stop: vi.fn(), notify: vi.fn() })), allowPrefetch: () => true, heroSettled: () => true,
}));

import home from '../src/js/features/plus/home.js';
import { parseHash } from '../src/js/core/router.js';
import * as api from '../src/js/core/api.js';
import { setDataSaver } from '../src/js/core/datasaver.js';

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const items = Array.from({ length: 10 }, (_, i) => ({ Id: `h${i}`, Name: `T${i}`, Type: 'Movie', ImageTags: {}, BackdropImageTags: ['b'], Genres: [] }));

beforeEach(() => {
  themeState.id = 'plus';
  localStorage.clear();
  document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections">nativ</div></div></div>';
  api.getItems.mockResolvedValue({ Items: items });
  api.getJson.mockResolvedValue({ Items: items });
});
afterEach(() => { setDataSaver(false); home.unmount(); document.body.innerHTML = ''; });

describe('plus-home: Datensparmodus zur Laufzeit (A061)', () => {
  it('Einschalten kürzt das Hero-Karussell auf 5 Folien, Ausschalten stellt es wieder her', async () => {
    home.mount(parseHash('#/home'));
    await flush();
    const before = document.querySelectorAll('.lfx-plus-hero__slide').length;
    expect(before).toBeGreaterThan(5);
    setDataSaver(true);
    await flush();
    expect(document.querySelectorAll('.lfx-plus-hero__slide').length).toBe(5);
    setDataSaver(false);
    await flush();
    expect(document.querySelectorAll('.lfx-plus-hero__slide').length).toBe(before);
  });
});
