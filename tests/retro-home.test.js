// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/theme.js', () => ({
  isTheme: vi.fn((id) => id === 'retro'),
  getTheme: () => 'retro',
  brandName: () => 'LENZ//84',
  onThemeChange: () => () => {},
}));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, isReady: () => true };
});
vi.mock('../src/js/core/itemmenu.js', () => ({
  openItemMenu: vi.fn(), isMenuOpen: () => false, onItemsChanged: vi.fn(() => () => {}),
}));
vi.mock('../src/js/shared/libraries.js', () => ({ getLibraries: vi.fn() }));
vi.mock('../src/js/shared/hub.js', () => ({ buildHubRowDefs: vi.fn(), getHubHeroPool: vi.fn(async () => []) }));
vi.mock('../src/js/features/rows/sources.js', () => ({ buildRowDefs: vi.fn() }));
vi.mock('../src/js/features/retro/home-hero.js', () => ({
  renderHero: vi.fn(() => vi.fn()),
  fetchHomePool: vi.fn(async () => []),
}));

import feature, { moreHrefFor, SYSTEM_LINE } from '../src/js/features/retro/home.js';
import { rowLabel, displayKind, variantFor } from '../src/js/features/retro/home-rows.js';
import { retroHomeRoute } from '../src/js/features/retro/home-route.js';
import { isTheme } from '../src/js/core/theme.js';
import { getLibraries } from '../src/js/shared/libraries.js';
import { buildHubRowDefs } from '../src/js/shared/hub.js';
import { buildRowDefs } from '../src/js/features/rows/sources.js';
import { renderHero } from '../src/js/features/retro/home-hero.js';

const route = (q) => ({ path: '/home', params: new URLSearchParams(q) });
const setWidth = (w) => Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w });
const mk = (id, type = 'Movie', extra = {}) => ({
  Id: id, Name: id, Type: type, ImageTags: { Thumb: 't', Primary: 'p' }, ProductionYear: 1984, DateCreated: '2020-01-01T00:00:00Z', ...extra,
});
const def = (id, kind = 'landscape', n = 3, extra = {}) => ({
  id, title: `Zeile ${id}`, kind, load: async () => Array.from({ length: n }, (_, i) => mk(`${id}-${i}`)), ...extra,
});
const libs = [
  { id: 'L1', name: 'Filme', collectionType: 'movies', href: '#/movies?topParentId=L1', hubCapable: true },
  { id: 'L2', name: 'Serien', collectionType: 'tvshows', href: '#/tv?topParentId=L2', hubCapable: true },
];

describe('Routen und Hilfen', () => {
  it('retroHomeRoute: nur Startseite und Hub', () => {
    expect(retroHomeRoute(route(''))).toEqual({ key: 'home', kind: 'home', lib: null });
    expect(retroHomeRoute(route('lfx=hub&lib=L1'))).toEqual({ key: 'hub:L1', kind: 'hub', lib: 'L1' });
    expect(retroHomeRoute(route('lfx=hub'))).toBeNull();
    expect(retroHomeRoute(route('lfx=new'))).toBeNull();
    expect(retroHomeRoute(route('lfx=title&id=1'))).toBeNull();
    expect(retroHomeRoute(route('tab=1'))).toBeNull();
    expect(retroHomeRoute({ path: '/movies', params: new URLSearchParams() })).toBeNull();
  });

  it('Zeilenlabels, Darstellung und Kartenvariante', () => {
    expect(rowLabel({ id: 'resume', title: 'Weiterschauen' })).toBe('Weiterschauen');
    expect(rowLabel({ id: 'nextup', title: 'Als Nächstes' })).toBe('Nächste Folgen');
    expect(rowLabel({ id: 'latest-movies', title: 'x' })).toBe('Neu eingelegt: Filme');
    expect(rowLabel({ id: 'L1-latest', title: 'x' })).toBe('Neu eingelegt');
    expect(rowLabel({ id: 'genre-Action', title: 'Action' })).toBe('Action');
    expect(displayKind({ id: 'resume', kind: 'resume' })).toBe('wide');
    expect(displayKind({ id: 'nextup', kind: 'landscape' })).toBe('wide');
    expect(displayKind({ id: 't', kind: 'top10' })).toBe('top10');
    expect(displayKind({ id: 'genre-A', kind: 'landscape' })).toBe('shelf');
    expect(variantFor('shelf', false)).toBe('spine');
    expect(variantFor('top10', false)).toBe('spine');
    expect(variantFor('shelf', true)).toBe('cover');
    expect(variantFor('wide', true)).toBe('wide');
    expect(variantFor('wide', false)).toBe('wide');
  });

  it('moreHrefFor nur mit sinnvollem Ziel', () => {
    const ctx = { hub: false, libs, lib: null };
    expect(moreHrefFor(def('latest-movies'), ctx)).toBe('#/home?lfx=hub&lib=L1');
    expect(moreHrefFor(def('latest-series'), ctx)).toBe('#/home?lfx=hub&lib=L2');
    expect(moreHrefFor(def('favorites'), ctx)).toBe('#/home?tab=1');
    expect(moreHrefFor(def('x', 'top10'), ctx)).toBe('#/home?lfx=new');
    expect(moreHrefFor(def('genre-Action'), ctx)).toBeNull();
    expect(moreHrefFor(def('L1-latest'), { hub: true, libs, lib: libs[0] })).toBe('#/home?lfx=browse&lib=L1');
  });
});

describe('Feature retro-home', () => {
  beforeEach(() => {
    setWidth(1280);
    vi.mocked(isTheme).mockImplementation((id) => id === 'retro');
    getLibraries.mockResolvedValue(libs);
    buildRowDefs.mockReset();
    buildRowDefs.mockImplementation(async ({ genreCount = 6 } = {}) => [
      def('resume', 'resume', 2),
      def('latest-movies', 'landscape', 4),
      def('top10-series', 'top10', 3),
      ...['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'].slice(0, genreCount).map((g) => def(`genre-${g}`)),
    ]);
    buildHubRowDefs.mockReset();
    buildHubRowDefs.mockImplementation(async (lib) => [def(`${lib.id}-latest`), def(`${lib.id}-toprated`, 'poster')]);
    renderHero.mockClear();
    document.documentElement.className = 'lfx-js lfx-theme-retro';
    document.body.innerHTML = '<header class="MuiAppBar-root"></header><div id="indexPage"><div id="homeTab"><div class="sections"></div></div></div>';
  });
  afterEach(() => { feature.unmount(); document.body.innerHTML = ''; document.documentElement.className = ''; setWidth(1024); });

  it('match: nur retro, Modern, richtige Routen, nicht TV', () => {
    expect(feature.match(route(''))).toBe(true);
    expect(feature.match(route('lfx=hub&lib=L1'))).toBe(true);
    expect(feature.match(route('lfx=title&id=1'))).toBe(false);
    expect(feature.match(route('tab=1'))).toBe(false);
    for (const other of ['flix', 'plus', 'prime']) {
      vi.mocked(isTheme).mockImplementation((id) => id === other);
      expect(feature.match(route(''))).toBe(false);
    }
    vi.mocked(isTheme).mockImplementation((id) => id === 'retro');
    document.documentElement.classList.add('layout-tv');
    expect(feature.match(route(''))).toBe(false);
    document.documentElement.classList.remove('layout-tv');
    document.querySelector('header').remove();
    expect(feature.match(route(''))).toBe(false);
  });

  it('Startseite: Mount, Hero, Kassetten-Regal, Top-10-Ziffern, Fußzeile, Aufräumen', async () => {
    feature.mount(route(''));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-retro-row:not(.is-loading)').length).toBe(9));
    const tab = document.getElementById('homeTab');
    expect(tab.firstElementChild.id).toBe('lfx-retro-home');
    expect(document.documentElement.classList.contains('lfx-retro-home-on')).toBe(true);
    expect(tab.querySelector('.sections')).not.toBeNull(); // nativer Container bleibt im DOM
    expect(renderHero).toHaveBeenCalledTimes(1);

    const latest = document.querySelector('[data-lfx-row="latest-movies"]');
    expect(latest.querySelector('.lfx-retro-label').textContent).toBe('Neu eingelegt: Filme');
    expect(latest.dataset.variant).toBe('spine');
    expect(latest.querySelectorAll('.lfx-retro-shelf > .lfx-retro-card--spine').length).toBe(4);
    expect(latest.querySelector('.lfx-card[data-lfx-id="latest-movies-0"] a.lfx-card__link').getAttribute('href')).toBe('#/home?lfx=title&id=latest-movies-0');
    expect(latest.querySelector('.lfx-retro-row__more').getAttribute('href')).toBe('#/home?lfx=hub&lib=L1');
    expect(latest.classList.contains('lfx-row--poster')).toBe(false);

    const resume = document.querySelector('[data-lfx-row="resume"]');
    expect(resume.querySelector('.lfx-retro-label').textContent).toBe('Weiterschauen');
    expect(resume.querySelectorAll('.lfx-retro-card--wide').length).toBe(2);

    const top = document.querySelector('[data-lfx-row="top10-series"]');
    expect([...top.querySelectorAll('.lfx-retro-rank__n')].map((n) => n.textContent)).toEqual(['1', '2', '3']);
    expect(top.querySelectorAll('.lfx-retro-rank .lfx-retro-card--spine').length).toBe(3);
    expect(document.querySelector('[data-lfx-row="genre-A"] .lfx-retro-row__more')).toBeNull();

    const footer = document.querySelector('.lfx-retro-footer');
    expect(footer.textContent).toContain('READY.');
    expect(footer.textContent).toContain(SYSTEM_LINE);

    feature.unmount();
    expect(document.getElementById('lfx-retro-home')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-retro-home-on')).toBe(false);
  });

  it('Handy: Cover-Kacheln statt Rücken, Weiterschauen bleibt wide', async () => {
    setWidth(390);
    feature.mount(route(''));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-retro-row:not(.is-loading)').length).toBe(9));
    expect(document.querySelectorAll('.lfx-retro-card--spine').length).toBe(0);
    expect(document.querySelectorAll('[data-lfx-row="latest-movies"] .lfx-retro-card--cover').length).toBe(4);
    expect(document.querySelectorAll('[data-lfx-row="resume"] .lfx-retro-card--wide').length).toBe(2);
  });

  it('Mehr-Button lädt weitere Genre-Zeilen und verschwindet am Ende', async () => {
    feature.mount(route(''));
    await vi.waitFor(() => expect(document.querySelectorAll('[data-lfx-row^="genre-"]').length).toBe(6));
    document.querySelector('.lfx-retro-more').click();
    await vi.waitFor(() => expect(document.querySelectorAll('[data-lfx-row^="genre-"]').length).toBe(10));
    document.querySelector('.lfx-retro-more').click(); // nichts Neues mehr -> Knopf verschwindet
    await vi.waitFor(() => expect(document.querySelector('.lfx-retro-more').hidden).toBe(true));
  });

  it('Hub: eigene Zeilen, Hero-Pool aus der Bibliothek; unbekannte Bibliothek lässt die native Seite stehen', async () => {
    feature.mount(route('lfx=hub&lib=L1'));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-retro-row:not(.is-loading)').length).toBe(2));
    expect(document.getElementById('lfx-retro-home').classList.contains('lfx-retro-home--hub')).toBe(true);
    expect(buildHubRowDefs).toHaveBeenCalled();
    feature.unmount();
    feature.mount(route('lfx=hub&lib=NOPE'));
    await new Promise((r) => setTimeout(r, 20));
    expect(document.getElementById('lfx-retro-home')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-retro-home-on')).toBe(false);
  });

  it('Wechsel Startseite -> Hub per update() baut neu auf', async () => {
    feature.mount(route(''));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-retro-row:not(.is-loading)').length).toBe(9));
    feature.update(route('lfx=hub&lib=L2'));
    await vi.waitFor(() => expect(document.getElementById('lfx-retro-home').classList.contains('lfx-retro-home--hub')).toBe(true));
    expect(document.querySelectorAll('#lfx-retro-home').length).toBe(1);
  });
});
