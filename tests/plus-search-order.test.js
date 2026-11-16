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
  };
});
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isMobile: () => false }));
vi.mock('../src/js/shared/search.js', () => ({
  searchItems: vi.fn(),
  getGenreTiles: vi.fn(),
}));
vi.mock('../src/js/shared/collections.js', () => ({ getCollections: vi.fn() }));
vi.mock('../src/js/shared/libraries.js', () => ({
  getLibraries: vi.fn().mockResolvedValue([{ id: 'lib1', name: 'Filme', collectionType: 'movies', href: '#/movies', hubCapable: true }]),
}));
vi.mock('../src/js/shared/newcontent.js', () => ({
  getNewContentInfo: vi.fn().mockResolvedValue({}),
  plusBadge: () => null,
}));

import search from '../src/js/features/plus/search.js';
import { parseHash } from '../src/js/core/router.js';
import { searchItems, getGenreTiles } from '../src/js/shared/search.js';
import { getCollections } from '../src/js/shared/collections.js';


const route = (hash) => parseHash(hash);
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

beforeEach(() => {
  window.scrollTo = vi.fn();
  document.documentElement.className = '';
  document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections">nativ</div></div></div>';
  vi.mocked(getGenreTiles).mockReset().mockResolvedValue([]);
  vi.mocked(getCollections).mockReset().mockResolvedValue([]);
});
afterEach(() => { search.unmount(); document.body.innerHTML = ''; });

describe('plus-search: Reihenfolge', () => {
  it('Treffer erscheinen in Serverreihenfolge (Serie vor Film)', async () => {
    const serie = { Id: 's1', Name: 'Family Guy', Type: 'Series' };
    const film = { Id: 'm1', Name: 'A Family Affair', Type: 'Movie' };
    vi.mocked(searchItems).mockResolvedValue({ titles: [serie, film], movies: [film], series: [serie], episodes: [], people: [] });
    search.mount(route('#/home?lfx=search&q=family%20guy'));
    await flush();
    const ids = [...document.querySelectorAll('.lfx-card[data-lfx-id]')].map((c) => c.dataset.lfxId);
    expect(ids).toEqual(['s1', 'm1']);
  });
});
