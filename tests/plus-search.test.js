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
const empty = { movies: [], series: [], episodes: [], people: [] };

beforeEach(() => {
  vi.useRealTimers();
  themeState.id = 'plus';
  window.scrollTo = vi.fn();
  document.documentElement.className = '';
  document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections">nativ</div></div></div>';
  vi.mocked(searchItems).mockReset().mockResolvedValue(empty);
  vi.mocked(getGenreTiles).mockReset().mockResolvedValue([{ id: 'g1', name: 'Drama', imageUrl: 'http://x/i.jpg' }]);
  vi.mocked(getCollections).mockReset().mockResolvedValue([{ id: 'c1', name: 'Reihe', imageUrl: null }]);
});
afterEach(() => { search.unmount(); vi.useRealTimers(); document.body.innerHTML = ''; });

describe('plus-search', () => {
  it('match nur für lfx=search', () => {
    expect(search.match(route('#/home?lfx=search'))).toBe(true);
    expect(search.match(route('#/home?lfx=search&q=abc'))).toBe(true);
    expect(search.match(route('#/home?lfx=new'))).toBe(false);
  });

  it('leer: Genre- und Sammlungs-Kacheln mit Links, Platzhalter, kein Request', async () => {
    search.mount(route('#/home?lfx=search'));
    await flush();
    const input = document.querySelector('.lfx-plus-search__input');
    expect(input.placeholder).toBe('Titel, Charakter oder Genre suchen');
    const hrefs = [...document.querySelectorAll('.lfx-plus-tile')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['#/home?lfx=browse&lib=lib1&genre=g1', '#/home?lfx=title&id=c1']);
    expect(searchItems).not.toHaveBeenCalled();
  });

  it('Eingabe wird 300 ms entprellt, schreibt q in den Hash und rendert Ergebnisse', async () => {
    search.mount(route('#/home?lfx=search'));
    await flush();
    vi.mocked(searchItems).mockResolvedValue({
      movies: [{ Id: 'm1', Name: 'Sterne', Type: 'Movie', Genres: ['Drama'], ProductionYear: 2001 }],
      series: [],
      episodes: [{ Id: 'e1', Name: 'Pilot', Type: 'Episode', SeriesName: 'Serie', ParentIndexNumber: 1, IndexNumber: 1 }],
      people: [{ Id: 'p1', Name: 'Jemand' }],
    });
    vi.useFakeTimers();
    const input = document.querySelector('.lfx-plus-search__input');
    input.value = 'ster';
    input.dispatchEvent(new Event('input'));
    input.value = 'sterne';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(299);
    expect(searchItems).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    vi.useRealTimers();
    await flush();
    expect(searchItems).toHaveBeenCalledTimes(1);
    expect(vi.mocked(searchItems).mock.calls[0][0]).toBe('sterne');
    expect(vi.mocked(searchItems).mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(window.location.hash).toBe('#/home?lfx=search&q=sterne');
    expect(document.querySelectorAll('.lfx-card[data-lfx-id]').length).toBe(2);
    expect(document.querySelector('.lfx-plus-result__title').textContent).toBe('Sterne');
    expect(document.querySelectorAll('.lfx-plus-person').length).toBe(1);
  });

  it('startet mit q aus der Route; ohne Treffer erscheint ein Hinweis; Löschen leert', async () => {
    search.mount(route('#/home?lfx=search&q=xyz'));
    await flush();
    expect(document.querySelector('.lfx-plus-search__input').value).toBe('xyz');
    expect(searchItems).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.lfx-plus-search__results').textContent).toContain('Keine Ergebnisse');
    document.querySelector('.lfx-plus-search__clear').click();
    await flush();
    expect(document.querySelector('.lfx-plus-search__input').value).toBe('');
    expect(document.querySelectorAll('.lfx-plus-tile').length).toBe(2);
  });

  it('alte Anfrage wird abgebrochen, ihre Antwort verworfen', async () => {
    let signal1;
    vi.mocked(searchItems).mockImplementationOnce((q, { signal }) => {
      signal1 = signal;
      return new Promise((r) => setTimeout(() => r({ ...empty, movies: [{ Id: 'alt', Name: 'Alt', Type: 'Movie' }] }), 20));
    });
    search.mount(route('#/home?lfx=search&q=alt'));
    await flush();
    vi.mocked(searchItems).mockResolvedValue({ ...empty, movies: [{ Id: 'neu', Name: 'Neu', Type: 'Movie' }] });
    search.update(route('#/home?lfx=search&q=neu'));
    await new Promise((r) => setTimeout(r, 40));
    expect(signal1.aborted).toBe(true);
    const ids = [...document.querySelectorAll('.lfx-card')].map((c) => c.dataset.lfxId);
    expect(ids).toEqual(['neu']);
  });

  it('unmount räumt Mount und Klasse auf', async () => {
    search.mount(route('#/home?lfx=search'));
    await flush();
    expect(document.documentElement.classList.contains('lfx-plus-search-on')).toBe(true);
    search.unmount();
    expect(document.getElementById('lfx-plus-search')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-plus-search-on')).toBe(false);
    expect(document.documentElement.classList.contains('lfx-plus-page-on')).toBe(false);
  });
});
