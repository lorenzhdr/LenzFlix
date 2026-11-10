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

const route = (hash) => parseHash(hash);
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const mk = (n, from = 0) => Array.from({ length: n }, (_, i) => ({ Id: `i${from + i}`, Name: `Titel ${from + i}`, Type: 'Movie' }));

beforeEach(() => {
  themeState.id = 'plus';
  window.scrollTo = vi.fn();
  document.documentElement.className = '';
  document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections">nativ</div></div></div>';
  api.getItems.mockReset();
  api.getJson.mockReset();
  api.getJson.mockResolvedValue({ Items: [{ Id: 'g1', Name: 'Drama' }, { Id: 'g2', Name: 'Komödie' }] });
  api.getItems.mockResolvedValue({ Items: mk(3), TotalRecordCount: 3 });
});
afterEach(() => { browse.unmount(); document.body.innerHTML = ''; });

describe('plus-browse', () => {
  it('match nur für lfx=browse mit lib', () => {
    expect(browse.match(route('#/home?lfx=browse&lib=lib1'))).toBe(true);
    expect(browse.match(route('#/home?lfx=browse'))).toBe(false);
    expect(browse.match(route('#/home?lfx=search'))).toBe(false);
  });

  it('rendert H1, Genre-Chips und Raster; Typen aus collectionType', async () => {
    browse.mount(route('#/home?lfx=browse&lib=lib1'));
    await flush();
    expect(document.querySelector('.lfx-plus-browse__title').textContent).toBe('Filme');
    const chips = [...document.querySelectorAll('.lfx-plus-chip')].map((c) => c.textContent);
    expect(chips).toEqual(['Alle', 'Drama', 'Komödie']);
    expect(document.querySelector('.lfx-plus-chip.is-active').textContent).toBe('Alle');
    expect(document.querySelectorAll('.lfx-card').length).toBe(3);
    const params = api.getItems.mock.calls[0][0];
    expect(params).toMatchObject({ ParentId: 'lib1', IncludeItemTypes: 'Movie', StartIndex: 0, Limit: 40, Recursive: true });
    expect(api.getJson.mock.calls[0][1]).toMatchObject({ ParentId: 'lib1', IncludeItemTypes: 'Movie', SortBy: 'SortName' });
    expect(document.documentElement.classList.contains('lfx-plus-browse-on')).toBe(true);
  });

  it('Genre aus der Route filtert und markiert den Chip; Genre-Wechsel per update lädt neu', async () => {
    browse.mount(route('#/home?lfx=browse&lib=lib1&genre=g1'));
    await flush();
    expect(api.getItems.mock.calls[0][0].GenreIds).toBe('g1');
    expect(document.querySelector('.lfx-plus-chip.is-active').textContent).toBe('Drama');
    api.getItems.mockResolvedValue({ Items: mk(1, 50), TotalRecordCount: 1 });
    browse.update(route('#/home?lfx=browse&lib=lib1&genre=g2'));
    await flush();
    expect(api.getItems.mock.calls.at(-1)[0].GenreIds).toBe('g2');
    expect(document.querySelectorAll('.lfx-card').length).toBe(1);
    expect(document.querySelector('.lfx-plus-chip.is-active').textContent).toBe('Komödie');
  });

  it('Paging: volle Seite -> nächste Seite per Scroll-Fallback mit StartIndex', async () => {
    api.getItems.mockResolvedValueOnce({ Items: mk(40), TotalRecordCount: 45 }).mockResolvedValueOnce({ Items: mk(5, 40), TotalRecordCount: 45 });
    browse.mount(route('#/home?lfx=browse&lib=lib1'));
    await flush();
    expect(document.querySelectorAll('.lfx-card').length).toBe(40);
    window.dispatchEvent(new Event('scroll'));
    await flush();
    expect(api.getItems.mock.calls[1][0].StartIndex).toBe(40);
    expect(document.querySelectorAll('.lfx-card').length).toBe(45);
    window.dispatchEvent(new Event('scroll'));
    await flush();
    expect(api.getItems).toHaveBeenCalledTimes(2);
  });

  it('leere Bibliothek und Fehler zeigen Hinweise; unmount räumt auf', async () => {
    api.getItems.mockResolvedValue({ Items: [], TotalRecordCount: 0 });
    browse.mount(route('#/home?lfx=browse&lib=lib1'));
    await flush();
    expect(document.querySelector('.lfx-plus-browse__status').textContent).toContain('Keine Titel');
    browse.unmount();
    expect(document.getElementById('lfx-plus-browse')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-plus-browse-on')).toBe(false);
    api.getItems.mockRejectedValue(new Error('x'));
    browse.mount(route('#/home?lfx=browse&lib=lib1'));
    await flush();
    expect(document.querySelector('.lfx-plus-browse__status').textContent).toContain('nicht geladen');
  });
});
