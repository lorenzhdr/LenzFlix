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
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isMobile: () => false }));
vi.mock('../src/js/shared/libraries.js', () => ({
  getLibraries: vi.fn().mockResolvedValue([{ id: 'lib1', name: 'Filme', collectionType: 'movies', href: '#/movies', hubCapable: true }]),
}));

import browse, { fileName, runtimeShort } from '../src/js/features/retro/browse.js';
import { parseHash } from '../src/js/core/router.js';
import * as api from '../src/js/core/api.js';

const route = (hash) => parseHash(hash);
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };
const mk = (n, from = 0) => Array.from({ length: n }, (_, i) => ({
  Id: `i${from + i}`, Name: `Titel ${from + i}`, Type: 'Movie', ProductionYear: 1982, RunTimeTicks: 68_400_000_000, Genres: ['Sci-Fi'],
}));

beforeEach(() => {
  themeState.id = 'retro';
  window.scrollTo = vi.fn();
  window.localStorage.clear();
  document.documentElement.className = '';
  document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections">nativ</div></div></div>';
  api.getItems.mockReset();
  api.getJson.mockReset();
  api.getJson.mockResolvedValue({ Items: [{ Id: 'g1', Name: 'Drama' }, { Id: 'g2', Name: 'Komödie' }] });
  api.getItems.mockResolvedValue({ Items: mk(3), TotalRecordCount: 3 });
});
afterEach(() => { browse.unmount(); document.body.innerHTML = ''; });

describe('Hilfsfunktionen', () => {
  it('Dateiname und Kurz-Laufzeit', () => {
    expect(fileName({ Name: 'Neon Läufer: 2', Type: 'Movie' })).toBe('NEON LÄUFER 2.MOV');
    expect(fileName({ Name: 'Serie', Type: 'Series' })).toBe('SERIE.SER');
    expect(runtimeShort(68_400_000_000)).toBe('1H54');
    expect(runtimeShort(1_800_000_000)).toBe('3M');
    expect(runtimeShort(0)).toBe('--');
  });
});

describe('retro-browse', () => {
  it('match nur für retro + lfx=browse mit lib', () => {
    expect(browse.match(route('#/home?lfx=browse&lib=lib1'))).toBe(true);
    expect(browse.match(route('#/home?lfx=browse'))).toBe(false);
    expect(browse.match(route('#/home?lfx=search'))).toBe(false);
    themeState.id = 'plus';
    expect(browse.match(route('#/home?lfx=browse&lib=lib1'))).toBe(false);
  });

  it('rendert DIR-Kopf, Zähler, Optionen und Cover-Raster', async () => {
    browse.mount(route('#/home?lfx=browse&lib=lib1'));
    await flush();
    expect(document.querySelector('.lfx-rb__path').textContent).toBe('DIR C:\\FILME\\');
    expect(document.querySelector('.lfx-rb__count').textContent).toBe('3 DATEI(EN)');
    expect([...document.querySelectorAll('.lfx-rb__opts [data-sort]')].map((b) => b.textContent)).toEqual(['/S:NAME', '/S:DATUM', '/S:WERTUNG']);
    expect(document.querySelectorAll('.lfx-rb__grid .lfx-retro-card--cover').length).toBe(3);
    expect([...document.querySelectorAll('.lfx-rb__genre')].map((c) => c.textContent)).toEqual(['ALLE', 'Drama', 'Komödie']);
    const params = api.getItems.mock.calls[0][0];
    expect(params).toMatchObject({ ParentId: 'lib1', IncludeItemTypes: 'Movie', StartIndex: 0, Limit: 40, Recursive: true, SortBy: 'SortName' });
    expect(document.documentElement.classList.contains('lfx-retro-browse-on')).toBe(true);
  });

  it('Sortierung lädt neu; Liste zeigt TITEL.MOV-Zeilen ohne Neuladen', async () => {
    browse.mount(route('#/home?lfx=browse&lib=lib1'));
    await flush();
    document.querySelector('[data-sort="date"]').click();
    await flush();
    expect(api.getItems.mock.calls.at(-1)[0]).toMatchObject({ SortBy: 'DateCreated', SortOrder: 'Descending', StartIndex: 0 });
    const calls = api.getItems.mock.calls.length;
    document.querySelector('[data-view="list"]').click();
    const rows = document.querySelectorAll('.lfx-rb__row');
    expect(rows.length).toBe(3);
    expect(rows[0].querySelector('.lfx-rb__row-name').textContent).toBe('TITEL 0.MOV');
    expect(rows[0].querySelector('.lfx-rb__row-time').textContent).toBe('1H54');
    expect(rows[0].querySelector('.lfx-rb__row-genre').textContent).toBe('SCI-FI');
    expect(rows[0].getAttribute('href')).toBe('#/home?lfx=title&id=i0');
    expect(api.getItems.mock.calls.length).toBe(calls);
  });

  it('Genre aus der Route filtert und erscheint im Pfad; update wechselt Genre', async () => {
    browse.mount(route('#/home?lfx=browse&lib=lib1&genre=g1'));
    await flush();
    expect(api.getItems.mock.calls[0][0].GenreIds).toBe('g1');
    expect(document.querySelector('.lfx-rb__genre.is-active').textContent).toBe('Drama');
    expect(document.querySelector('.lfx-rb__path').textContent).toBe('DIR C:\\FILME\\DRAMA\\');
    api.getItems.mockResolvedValue({ Items: mk(1, 50), TotalRecordCount: 1 });
    browse.update(route('#/home?lfx=browse&lib=lib1&genre=g2'));
    await flush();
    expect(api.getItems.mock.calls.at(-1)[0].GenreIds).toBe('g2');
    expect(document.querySelectorAll('.lfx-retro-card').length).toBe(1);
  });

  it('lädt per IntersectionObserver nach (volle Seite = mehr vorhanden)', async () => {
    let trigger;
    class IO {
      constructor(cb) { trigger = () => cb([{ isIntersecting: true }]); }
      observe() {}
      disconnect() {}
    }
    const orig = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = IO;
    api.getItems.mockResolvedValueOnce({ Items: mk(40), TotalRecordCount: 45 });
    browse.mount(route('#/home?lfx=browse&lib=lib1'));
    await flush();
    expect(document.querySelectorAll('.lfx-retro-card').length).toBe(40);
    api.getItems.mockResolvedValueOnce({ Items: mk(5, 40), TotalRecordCount: 45 });
    trigger();
    await flush();
    expect(document.querySelectorAll('.lfx-retro-card').length).toBe(45);
    expect(api.getItems.mock.calls.at(-1)[0].StartIndex).toBe(40);
    expect(document.querySelector('.lfx-rb__end')).toBeTruthy();
    globalThis.IntersectionObserver = orig;
  });

  it('Fehler zeigt Wiederholen-Knopf; unmount räumt auf', async () => {
    api.getItems.mockRejectedValueOnce(new Error('x'));
    browse.mount(route('#/home?lfx=browse&lib=lib1'));
    await flush();
    expect(document.querySelector('.lfx-rb__status .lfx-retro-btn')).toBeTruthy();
    browse.unmount();
    expect(document.getElementById('lfx-retro-browse')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-retro-browse-on')).toBe(false);
    expect(document.documentElement.classList.contains('lfx-retro-page-on')).toBe(false);
  });
});
