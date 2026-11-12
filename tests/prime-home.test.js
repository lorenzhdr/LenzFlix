// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

vi.mock('../src/js/core/theme.js', () => ({
  isTheme: vi.fn((id) => id === 'prime'),
  getTheme: () => 'prime',
  brandName: () => 'LENZPRIME',
  onThemeChange: () => () => {},
}));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, isReady: () => true };
});
vi.mock('../src/js/core/itemmenu.js', () => ({
  openItemMenu: vi.fn(), isMenuOpen: () => false, onItemsChanged: vi.fn(() => () => {}),
}));
vi.mock('../src/js/core/themepicker.js', () => ({ openThemePicker: vi.fn() }));
vi.mock('../src/js/core/stats.js', () => ({ statsHref: vi.fn(() => '/stats?theme=prime'), STATS_LABEL: 'Meine Statistik' }));
vi.mock('../src/js/shared/libraries.js', () => ({ getLibraries: vi.fn() }));
vi.mock('../src/js/shared/hub.js', () => ({ buildHubRowDefs: vi.fn(), getHubHeroPool: vi.fn(async () => []) }));
vi.mock('../src/js/features/rows/sources.js', () => ({ buildRowDefs: vi.fn(), peekRowDefs: vi.fn(() => undefined) }));
vi.mock('../src/js/shared/newcontent.js', () => ({
  getNewContentInfo: vi.fn(async () => ({ bySeries: new Map(), newMovieIds: new Set(['m1']), newSeriesIds: new Set() })),
  newBadge: (it, info) => (it.Type === 'Movie' && info && info.newMovieIds.has(it.Id) ? 'NEUER FILM' : null),
}));
vi.mock('../src/js/shared/trend.js', async () => {
  const actual = await vi.importActual('../src/js/shared/trend.js');
  return { ...actual, getTrendInfo: vi.fn(async () => ({ available: false, rank: new Map() })) };
});
vi.mock('../src/js/features/prime/hero.js', () => ({
  renderHero: vi.fn(() => vi.fn()),
  fetchHomePool: vi.fn(async () => []),
}));

import feature, { moreHrefFor } from '../src/js/features/prime/home.js';
import { pickPosterId } from '../src/js/features/prime/home-rows.js';
import { primeHomeRoute } from '../src/js/features/prime/home-route.js';
import { createPrimeCard } from '../src/js/features/prime/card.js';
import { isTheme } from '../src/js/core/theme.js';
import { getLibraries } from '../src/js/shared/libraries.js';
import { buildHubRowDefs } from '../src/js/shared/hub.js';
import { buildRowDefs } from '../src/js/features/rows/sources.js';
import { renderHero } from '../src/js/features/prime/hero.js';
import { openThemePicker } from '../src/js/core/themepicker.js';

const route = (q) => ({ path: '/home', params: new URLSearchParams(q) });
const mk = (id, type = 'Movie', extra = {}) => ({
  Id: id, Name: id, Type: type, ImageTags: { Thumb: 't', Primary: 'p' }, DateCreated: '2020-01-01T00:00:00Z', ...extra,
});
const def = (id, kind = 'landscape', n = 3, extra = {}) => ({
  id, title: `Zeile ${id}`, kind, load: async () => Array.from({ length: n }, (_, i) => mk(i === 0 && id === 'latest-movies' ? 'm1' : `${id}-${i}`)), ...extra,
});

const libs = [
  { id: 'L1', name: 'Filme', collectionType: 'movies', href: '#/movies?topParentId=L1', hubCapable: true },
  { id: 'L2', name: 'Serien', collectionType: 'tvshows', href: '#/tv?topParentId=L2', hubCapable: true },
];

describe('Routen und Hilfen', () => {
  it('primeHomeRoute', () => {
    expect(primeHomeRoute(route(''))).toEqual({ key: 'home', kind: 'home', lib: null });
    expect(primeHomeRoute(route('lfx=hub&lib=L1'))).toEqual({ key: 'hub:L1', kind: 'hub', lib: 'L1' });
    expect(primeHomeRoute(route('lfx=hub'))).toBeNull();
    expect(primeHomeRoute(route('lfx=new'))).toBeNull();
    expect(primeHomeRoute(route('tab=1'))).toBeNull();
    expect(primeHomeRoute({ path: '/movies', params: new URLSearchParams() })).toBeNull();
  });

  it('pickPosterId: Startseite und Hub', () => {
    const home = [def('resume', 'resume'), def('nextup'), def('latest-movies'), def('toprated')];
    expect(pickPosterId(home, false)).toBe('latest-movies');
    expect(pickPosterId([def('resume', 'resume'), def('nextup'), def('genre-X')], false)).toBe('genre-X');
    expect(pickPosterId([def('a', 'landscape'), def('b', 'poster'), def('c', 'poster')], true)).toBe('b');
    expect(pickPosterId([def('a')], true)).toBeNull();
  });

  it('moreHrefFor nur mit sinnvollem Ziel', () => {
    const ctx = { hub: false, libs, lib: null };
    expect(moreHrefFor(def('latest-movies'), ctx)).toBe('#/home?lfx=hub&lib=L1');
    expect(moreHrefFor(def('latest-series'), ctx)).toBe('#/home?lfx=hub&lib=L2');
    expect(moreHrefFor(def('favorites'), ctx)).toBe('#/home?tab=1');
    expect(moreHrefFor(def('x', 'top10'), ctx)).toBe('#/home?lfx=new');
    expect(moreHrefFor(def('genre-Action'), ctx)).toBeNull();
    expect(moreHrefFor(def('L1-latest'), { hub: true, libs, lib: libs[0] })).toBe('#/movies?topParentId=L1');
    expect(moreHrefFor(def('L1-genre-g1'), { hub: true, libs, lib: libs[0] })).toBeNull();
  });
});

describe('Karte', () => {
  it('Kartenvertrag, Badge, Fortschritt und Rangziffer', () => {
    const card = createPrimeCard(mk('e1', 'Episode', { SeriesName: 'Serie', RunTimeTicks: 1000, UserData: { PlaybackPositionTicks: 250 } }), { kind: 'resume', badge: 'IM TREND' });
    expect(card.classList.contains('lfx-card')).toBe(true);
    expect(card.dataset.lfxId).toBe('e1');
    expect(card.dataset.lfxType).toBe('Episode');
    expect(card.querySelector('.lfx-card__link .lfx-card__img')).not.toBeNull();
    expect(card.querySelector('.lfx-prime-badge').textContent).toBe('IM TREND');
    expect(card.querySelector('.lfx-prime-card__bar').style.width).toBe('25%');
    const top = createPrimeCard(mk('t1'), { kind: 'top10', rank: 10 });
    expect(top.querySelector('.lfx-prime-card__rank--wide').textContent).toBe('10');
    expect(top.classList.contains('lfx-card--top10')).toBe(false);
    const poster = createPrimeCard(mk('p1'), { kind: 'poster' });
    expect(poster.classList.contains('lfx-prime-card--poster')).toBe(true);
    expect(poster.querySelector('.lfx-card__img').src).toContain('/Images/Primary');
  });
});

describe('Feature prime-home', () => {
  beforeEach(() => {
    vi.mocked(isTheme).mockImplementation((id) => id === 'prime');
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
    document.documentElement.className = 'lfx-js lfx-theme-prime';
    document.body.innerHTML = '<header class="MuiAppBar-root"></header><div id="indexPage"><div id="homeTab"><div class="sections"></div></div></div>';
  });
  afterEach(() => { feature.unmount(); document.body.innerHTML = ''; document.documentElement.className = ''; });

  it('match: nur LENZPRIME, Modern, richtige Routen', () => {
    expect(feature.match(route(''))).toBe(true);
    expect(feature.match(route('lfx=hub&lib=L1'))).toBe(true);
    expect(feature.match(route('lfx=title&id=1'))).toBe(false);
    expect(feature.match(route('tab=1'))).toBe(false);
    vi.mocked(isTheme).mockImplementation((id) => id === 'flix');
    expect(feature.match(route(''))).toBe(false);
    vi.mocked(isTheme).mockImplementation((id) => id === 'plus');
    expect(feature.match(route(''))).toBe(false);
    vi.mocked(isTheme).mockImplementation((id) => id === 'prime');
    document.documentElement.classList.add('layout-tv');
    expect(feature.match(route(''))).toBe(false);
    document.documentElement.classList.remove('layout-tv');
    document.querySelector('header').remove();
    expect(feature.match(route(''))).toBe(false);
  });

  it('Startseite: Mount, Hero, Zeilen, Poster, Badge, Fußzeile, Aufräumen', async () => {
    feature.mount(route(''));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-prime-row:not(.is-loading)').length).toBe(9));
    const tab = document.getElementById('homeTab');
    expect(tab.firstElementChild.id).toBe('lfx-prime-home');
    expect(document.documentElement.classList.contains('lfx-prime-home-on')).toBe(true);
    expect(tab.querySelector('.sections')).not.toBeNull(); // nativer Container bleibt im DOM
    expect(renderHero).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[data-lfx-row="latest-movies"]').classList.contains('lfx-prime-row--poster')).toBe(true);
    expect(document.querySelector('[data-lfx-row="resume"]').classList.contains('lfx-prime-row--resume')).toBe(true);
    expect(document.querySelector('[data-lfx-row="top10-series"] .lfx-prime-card__rank').textContent).toBe('1');
    // Badge über cardBadge (NEUER FILM aus getNewContentInfo)
    expect(document.querySelector('[data-lfx-id="m1"] .lfx-prime-badge').textContent).toBe('NEUER FILM');
    expect(document.querySelector('[data-lfx-row="latest-movies"] .lfx-prime-row__more').getAttribute('href')).toBe('#/home?lfx=hub&lib=L1');
    expect(document.querySelector('[data-lfx-row="genre-A"] .lfx-prime-row__more')).toBeNull();
    expect(document.querySelector('.lfx-prime-footer__link[href="/stats?theme=prime"]').textContent).toBe('Meine Statistik');
    document.querySelector('button.lfx-prime-footer__link').click();
    expect(openThemePicker).toHaveBeenCalled();
    expect(document.querySelector('.lfx-prime-footer').textContent).toContain('LENZPRIME für Jellyfin');
    feature.unmount();
    expect(document.getElementById('lfx-prime-home')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-prime-home-on')).toBe(false);
  });

  it('Mehr-Button lädt weitere Genre-Zeilen und verschwindet am Ende', async () => {
    feature.mount(route(''));
    await vi.waitFor(() => expect(document.querySelectorAll('[data-lfx-row^="genre-"]').length).toBe(6));
    const more = document.querySelector('.lfx-prime-more');
    expect(more.hidden).toBe(false);
    more.click();
    await vi.waitFor(() => expect(document.querySelectorAll('[data-lfx-row^="genre-"]').length).toBe(10));
    expect(more.hidden).toBe(false);
    more.click();
    await vi.waitFor(() => expect(more.hidden).toBe(true));
    expect(document.querySelectorAll('[data-lfx-row^="genre-"]').length).toBe(10);
  });

  it('Hub: Poster-Zeile aus den Hub-Defs; update() wechselt zwischen Startseite und Hub', async () => {
    feature.mount(route('lfx=hub&lib=L1'));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-prime-row:not(.is-loading)').length).toBe(2));
    expect(document.getElementById('lfx-prime-home').classList.contains('lfx-prime-home--hub')).toBe(true);
    expect(document.querySelector('[data-lfx-row="L1-toprated"]').classList.contains('lfx-prime-row--poster')).toBe(true);
    expect(document.querySelector('.lfx-prime-more').hidden).toBe(true); // keine Genre-Zeilen im Mock
    feature.update(route(''));
    await vi.waitFor(() => expect(document.querySelector('#lfx-prime-home.lfx-prime-home--home')).not.toBeNull());
    await vi.waitFor(() => expect(document.querySelector('[data-lfx-row="latest-movies"]')).not.toBeNull());
    expect(document.querySelectorAll('#lfx-prime-home').length).toBe(1);
    // gleiche Route erneut: kein Neuaufbau
    renderHero.mockClear();
    feature.update(route(''));
    expect(renderHero).not.toHaveBeenCalled();
  });

  it('Hub mit unbekannter Bibliothek: nichts gemountet, native Seite bleibt', async () => {
    feature.mount(route('lfx=hub&lib=XX'));
    await new Promise((r) => setTimeout(r, 50));
    expect(document.getElementById('lfx-prime-home')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-prime-home-on')).toBe(false);
  });

  it('CSS blendet die nativen Sektionen über die eigene Klasse aus', () => {
    const css = fs.readFileSync('src/css/themes/prime/hero.css', 'utf8');
    expect(css).toMatch(/lfx-prime-home-on #indexPage #homeTab > \.sections/);
  });
});
