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
  };
});
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isMobile: () => false }));
vi.mock('../src/js/shared/search.js', () => ({ searchItems: vi.fn(), getGenreTiles: vi.fn() }));
vi.mock('../src/js/shared/collections.js', () => ({ getCollections: vi.fn() }));
vi.mock('../src/js/shared/libraries.js', () => ({
  getLibraries: vi.fn().mockResolvedValue([{ id: 'lib1', name: 'Filme', collectionType: 'movies', href: '#/movies', hubCapable: true }]),
}));

import search from '../src/js/features/retro/search.js';
import { parseHash } from '../src/js/core/router.js';
import * as api from '../src/js/core/api.js';
import { searchItems, getGenreTiles } from '../src/js/shared/search.js';
import { getCollections } from '../src/js/shared/collections.js';
import { FX_EVENT } from '../src/js/features/retro/prefs.js';

const route = (hash) => parseHash(hash);
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const empty = { movies: [], series: [], episodes: [], people: [] };

beforeEach(() => {
  vi.useRealTimers();
  themeState.id = 'retro';
  window.scrollTo = vi.fn();
  document.documentElement.className = '';
  document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections">nativ</div></div></div>';
  vi.mocked(searchItems).mockReset().mockResolvedValue(empty);
  vi.mocked(getGenreTiles).mockReset().mockResolvedValue([{ id: 'g1', name: 'Drama', imageUrl: null }]);
  vi.mocked(getCollections).mockReset().mockResolvedValue([{ id: 'c1', name: 'Reihe', imageUrl: null }]);
  vi.mocked(api.getItems).mockReset().mockResolvedValue({ Items: [{ Id: 'n1', Name: 'Neu', Type: 'Movie' }] });
});
afterEach(() => { search.unmount(); vi.useRealTimers(); document.body.innerHTML = ''; });

describe('retro-search', () => {
  it('match nur für retro + lfx=search', () => {
    expect(search.match(route('#/home?lfx=search'))).toBe(true);
    expect(search.match(route('#/home?lfx=search&q=abc'))).toBe(true);
    expect(search.match(route('#/home?lfx=new'))).toBe(false);
    expect(search.match(route('#/home?lfx=title&id=1'))).toBe(false);
    themeState.id = 'prime';
    expect(search.match(route('#/home?lfx=search'))).toBe(false);
  });

  it('Startzustand: Kommandozeile, Vorschläge, Sammlungen, neue Titel; kein Such-Request', async () => {
    search.mount(route('#/home?lfx=search'));
    await flush();
    expect(document.querySelector('.lfx-rs__prompt').textContent).toBe('SUCHE>');
    const hrefs = [...document.querySelectorAll('.lfx-rs__opt')].map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['#/home?lfx=browse&lib=lib1&genre=g1', '#/home?lfx=title&id=c1']);
    expect(document.querySelectorAll('.lfx-rs__group--new .lfx-retro-card--cover').length).toBe(1);
    expect(searchItems).not.toHaveBeenCalled();
  });

  it('Eingabe wird 300 ms entprellt, schreibt q in den Hash, rendert gruppierte Ergebnisse', async () => {
    search.mount(route('#/home?lfx=search'));
    await flush();
    vi.mocked(searchItems).mockResolvedValue({
      movies: [{ Id: 'm1', Name: 'Sterne', Type: 'Movie' }],
      series: [{ Id: 's1', Name: 'Serie', Type: 'Series' }],
      episodes: [{ Id: 'e1', Name: 'Pilot', Type: 'Episode', SeriesName: 'Serie' }],
      people: [{ Id: 'p1', Name: 'Jemand' }],
    });
    const fx = [];
    const onFx = (e) => fx.push(e.detail.name);
    document.addEventListener(FX_EVENT, onFx);
    vi.useFakeTimers();
    const input = document.querySelector('.lfx-rs__input');
    input.value = 'ster';
    input.dispatchEvent(new Event('input'));
    input.value = 'sterne';
    input.dispatchEvent(new Event('input'));
    await vi.advanceTimersByTimeAsync(299);
    expect(searchItems).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(2);
    vi.useRealTimers();
    await flush();
    document.removeEventListener(FX_EVENT, onFx);
    expect(fx).toContain('type');
    expect(searchItems).toHaveBeenCalledTimes(1);
    expect(vi.mocked(searchItems).mock.calls[0][0]).toBe('sterne');
    expect(vi.mocked(searchItems).mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(window.location.hash).toBe('#/home?lfx=search&q=sterne');
    expect([...document.querySelectorAll('.lfx-rs__group > h2')].map((x) => x.textContent)).toEqual(['Filme', 'Serien', 'Episoden', 'Personen']);
    expect(document.querySelectorAll('.lfx-retro-card[data-lfx-id]').length).toBe(3);
    expect(document.querySelector('.lfx-rs__group--wide .lfx-retro-card--wide')).toBeTruthy();
    expect(document.querySelectorAll('.lfx-rs__person').length).toBe(1);
    expect(document.querySelector('.lfx-rs__count').textContent).toBe('4 TREFFER');
  });

  it('q aus der Route startet sofort; ohne Treffer Leerzustand; Löschen zeigt Startzustand', async () => {
    search.mount(route('#/home?lfx=search&q=xyz'));
    await flush();
    expect(document.querySelector('.lfx-rs__input').value).toBe('xyz');
    expect(searchItems).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.lfx-rs__results').textContent).toContain('KEINE TREFFER. VERSUCHE ES ERNEUT');
    document.querySelector('.lfx-rs__clear').click();
    await flush();
    expect(document.querySelector('.lfx-rs__input').value).toBe('');
    expect(document.querySelectorAll('.lfx-rs__opt').length).toBe(2);
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
    expect([...document.querySelectorAll('.lfx-retro-card')].map((c) => c.dataset.lfxId)).toEqual(['neu']);
  });

  it('unmount räumt Mount und Klassen auf', async () => {
    search.mount(route('#/home?lfx=search'));
    await flush();
    expect(document.documentElement.classList.contains('lfx-retro-search-on')).toBe(true);
    search.unmount();
    expect(document.getElementById('lfx-retro-search')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-retro-search-on')).toBe(false);
    expect(document.documentElement.classList.contains('lfx-retro-page-on')).toBe(false);
  });
});
