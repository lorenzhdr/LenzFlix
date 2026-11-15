// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, isReady: () => true, getUserId: () => 'u1', getItems: vi.fn(async () => ({ Items: [], TotalRecordCount: 0 })) };
});

let themeId = 'flix';
vi.mock('../src/js/core/theme.js', async () => {
  const actual = await vi.importActual('../src/js/core/theme.js');
  return { ...actual, isTheme: (id) => id === themeId };
});

const bbCleanup = vi.fn();
const rowsCleanup = vi.fn();
vi.mock('../src/js/features/billboard.js', () => ({ render: vi.fn(() => bbCleanup) }));
vi.mock('../src/js/features/rows.js', () => ({ render: vi.fn(() => rowsCleanup) }));

const gridInstances = [];
vi.mock('../src/js/features/library/grid.js', () => ({
  createGrid: vi.fn((opts) => {
    const el = document.createElement('div');
    el.className = 'lfx-grid';
    const g = { el, opts, setSort: vi.fn(), setQuery: vi.fn(), refresh: vi.fn(), destroy: vi.fn(() => el.remove()) };
    gridInstances.push(g);
    return g;
  }),
}));

vi.mock('../src/js/features/library/sources.js', () => ({
  LIB_TYPES: { series: 'Series', movies: 'Movie' },
  getLibraryGenres: vi.fn(async () => [{ id: 'g1', name: 'Krimi' }, { id: 'g2', name: 'Drama' }]),
  buildLibraryRowDefs: vi.fn(async () => []),
  getLibraryHeroPool: vi.fn(async () => []),
  libraryPoolKey: vi.fn((k, g) => `pool:${k}:${g || 'all'}`),
}));

import feature from '../src/js/features/library.js';
import * as billboard from '../src/js/features/billboard.js';
import * as rows from '../src/js/features/rows.js';
import { createGrid } from '../src/js/features/library/grid.js';
import { buildLibraryRowDefs } from '../src/js/features/library/sources.js';

const route = (qs) => ({ path: '/home', params: new URLSearchParams(qs) });
const flush = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  document.body.innerHTML = '<header class="MuiAppBar-root"></header><div id="indexPage"><div id="homeTab"><div class="sections"></div></div></div>';
  document.documentElement.className = 'lfx-js';
}

beforeEach(() => {
  setup();
  gridInstances.length = 0;
  vi.clearAllMocks();
  themeId = 'flix';
});
afterEach(() => {
  feature.unmount();
  document.body.innerHTML = '';
  document.documentElement.className = '';
});

describe('library-Seite', () => {
  it('match nur für flix, modern, kein TV, Bibliotheksroute', () => {
    expect(feature.match(route('lfx=series'))).toBe(true);
    expect(feature.match(route('lfx=movies&genre=g1'))).toBe(true);
    expect(feature.match(route('lfx=new'))).toBe(false);
    document.documentElement.classList.add('layout-tv');
    expect(feature.match(route('lfx=series'))).toBe(false);
    document.documentElement.classList.remove('layout-tv');
    document.querySelector('header').remove();
    expect(feature.match(route('lfx=series'))).toBe(false);
  });

  it('match nicht unter plus/retro', () => {
    for (const id of ['plus', 'retro']) {
      themeId = id;
      expect(feature.match(route('lfx=series'))).toBe(false);
    }
  });

  it('mount legt #lfx-library als erstes Kind an, setzt Klasse; unmount räumt alles ab', () => {
    feature.mount(route('lfx=series'));
    const tab = document.getElementById('homeTab');
    expect(tab.firstElementChild.id).toBe('lfx-library');
    expect(document.documentElement.classList.contains('lfx-library-on')).toBe(true);
    expect(document.querySelector('.lfx-lib__title').textContent).toBe('Serien');
    feature.unmount();
    expect(document.getElementById('lfx-library')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-library-on')).toBe(false);
    expect(bbCleanup).toHaveBeenCalled();
    expect(rowsCleanup).toHaveBeenCalled();
  });

  it('Zeilen-Ansicht ruft billboard.render mit ctx.pool und rows.render mit ctx.defs/prefetch:false', async () => {
    feature.mount(route('lfx=movies'));
    expect(document.querySelector('.lfx-lib__title').textContent).toBe('Filme');
    expect(billboard.render).toHaveBeenCalledTimes(1);
    const bbCtx = billboard.render.mock.calls[0][1];
    expect(bbCtx.pool.key).toBe('pool:movies:all');
    expect(typeof bbCtx.pool.fetch).toBe('function');
    expect(bbCtx.pool.firstKey).toBe('lfx-bb-first:lib:movies');
    expect(billboard.render.mock.calls[0][0].id).toBe('lfx-billboard');
    const rCtx = rows.render.mock.calls[0][1];
    expect(rCtx.prefetch).toBe(false);
    await rCtx.defs.build();
    expect(buildLibraryRowDefs).toHaveBeenCalledWith('movies', { genre: null, genreName: undefined });
    expect(createGrid).not.toHaveBeenCalled();
    expect(document.querySelector('.lfx-lib__all')).toBeNull();
  });

  it('Genre-Ansicht: Titel mit Genre, Link zurück, „Alle anzeigen“', async () => {
    feature.mount(route('lfx=series&genre=g1'));
    await flush();
    const title = document.querySelector('.lfx-lib__title');
    expect(title.textContent).toContain('Serien');
    expect(title.textContent).toContain('Krimi');
    expect(title.querySelector('a').getAttribute('href')).toBe('#/home?lfx=series');
    expect(document.querySelector('.lfx-lib__all-btn').getAttribute('href')).toBe('#/home?lfx=series&genre=g1&view=grid');
  });

  it('Genres-Dropdown: Links, Öffnen, Esc, Klick außerhalb', async () => {
    feature.mount(route('lfx=series'));
    await flush();
    const btn = document.querySelector('.lfx-lib__genres-btn');
    const panel = document.querySelector('.lfx-lib__genres-panel');
    expect(panel.hidden).toBe(true);
    btn.click();
    expect(panel.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const links = [...panel.querySelectorAll('a')];
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      '#/home?lfx=series&genre=g1', '#/home?lfx=series&genre=g2',
    ]);
    expect(document.activeElement).toBe(links[0]);
    links[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(links[1]);
    links[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(btn);
    btn.click();
    expect(panel.hidden).toBe(false);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(panel.hidden).toBe(true);
  });

  it('Umschalter Zeilen/Raster mit aria-pressed und Links', () => {
    feature.mount(route('lfx=series&genre=g1'));
    const [rowsLink, gridLink] = document.querySelectorAll('.lfx-lib__view');
    expect(rowsLink.getAttribute('aria-pressed')).toBe('true');
    expect(gridLink.getAttribute('aria-pressed')).toBe('false');
    expect(gridLink.getAttribute('href')).toBe('#/home?lfx=series&genre=g1&view=grid');
    feature.update(route('lfx=series&genre=g1&view=grid&sort=za'));
    expect(rowsLink.getAttribute('aria-pressed')).toBe('false');
    expect(gridLink.getAttribute('aria-pressed')).toBe('true');
    expect(rowsLink.getAttribute('href')).toBe('#/home?lfx=series&genre=g1');
  });

  it('Raster-Ansicht: kein Billboard, createGrid mit Query und Sortierung, Anzahl, Sortierwahl', () => {
    feature.mount(route('lfx=movies&genre=g2&view=grid&sort=year'));
    expect(billboard.render).not.toHaveBeenCalled();
    expect(rows.render).not.toHaveBeenCalled();
    const opts = createGrid.mock.calls[0][0];
    expect(opts.query).toEqual({ IncludeItemTypes: 'Movie', GenreIds: 'g2' });
    expect(opts.sort).toBe('year');
    expect(document.querySelector('.lfx-grid')).not.toBeNull();
    opts.onCount(42);
    expect(document.querySelector('.lfx-lib__count').textContent).toBe('42 Titel');
    const select = document.querySelector('.lfx-lib__sort');
    expect(select.value).toBe('year');
    expect([...select.options].map((o) => o.textContent)).toEqual(['A–Z', 'Z–A', 'Neu hinzugefügt', 'Erscheinungsjahr']);
    select.value = 'za';
    select.dispatchEvent(new Event('change'));
    expect(window.location.hash).toBe('#/home?lfx=movies&genre=g2&view=grid&sort=za');
  });

  it('update: Sortierwechsel nutzt setSort ohne Neuaufbau; Ansichtswechsel baut ab und neu auf', () => {
    feature.mount(route('lfx=series&view=grid'));
    expect(createGrid).toHaveBeenCalledTimes(1);
    feature.update(route('lfx=series&view=grid&sort=new'));
    expect(createGrid).toHaveBeenCalledTimes(1);
    expect(gridInstances[0].setSort).toHaveBeenCalledWith('new');
    feature.update(route('lfx=series'));
    expect(gridInstances[0].destroy).toHaveBeenCalled();
    expect(billboard.render).toHaveBeenCalledTimes(1);
    feature.update(route('lfx=movies'));
    expect(bbCleanup).toHaveBeenCalledTimes(1);
    expect(rowsCleanup).toHaveBeenCalledTimes(1);
    expect(billboard.render).toHaveBeenCalledTimes(2);
    expect(document.querySelectorAll('#lfx-billboard').length).toBe(1);
    expect(document.querySelector('.lfx-lib__title').textContent).toBe('Filme');
    feature.update(route('lfx=movies&genre=g1'));
    expect(billboard.render).toHaveBeenCalledTimes(3);
  });

  it('unmount im Raster zerstört das Raster', () => {
    feature.mount(route('lfx=series&view=grid'));
    feature.unmount();
    expect(gridInstances[0].destroy).toHaveBeenCalled();
    expect(document.querySelector('.lfx-grid')).toBeNull();
  });
});
