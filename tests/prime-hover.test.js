// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/theme.js', () => ({
  isTheme: vi.fn((id) => id === 'prime'),
  getTheme: () => 'prime',
  brandName: () => 'LENZPRIME',
  onThemeChange: () => () => {},
}));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, isReady: () => true, getItem: vi.fn() };
});
vi.mock('../src/js/core/itemmenu.js', () => ({
  openItemMenu: vi.fn(), isMenuOpen: vi.fn(() => false), onItemsChanged: vi.fn(() => () => {}),
}));
vi.mock('../src/js/core/download.js', () => ({ isChooserOpen: vi.fn(() => false), canDownload: vi.fn(), startDownload: vi.fn() }));
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn(async () => true) }));
vi.mock('../src/js/features/modal/data.js', () => ({ loadNextUp: vi.fn(async () => null), loadSeasons: vi.fn(), loadEpisodes: vi.fn() }));
vi.mock('../src/js/shared/titleactions.js', () => ({
  toggleFavorite: vi.fn(async (it) => { it.UserData = { ...(it.UserData || {}), IsFavorite: true }; return true; }),
  togglePlayed: vi.fn(async (it) => { it.UserData = { ...(it.UserData || {}), Played: true }; return true; }),
  openTitleMenu: vi.fn(async () => true),
}));
vi.mock('../src/js/shared/trend.js', async () => {
  const actual = await vi.importActual('../src/js/shared/trend.js');
  return { ...actual, getTrendInfo: vi.fn(async () => ({ available: true, rank: new Map([['m1', { rank: 3, type: 'Movie' }]]) })) };
});
vi.mock('../src/js/shared/trailer.js', () => ({ createMutedPreview: vi.fn() }));

import * as api from '../src/js/core/api.js';
import { play } from '../src/js/core/playback.js';
import { isTheme } from '../src/js/core/theme.js';
import { isMenuOpen } from '../src/js/core/itemmenu.js';
import { putItems } from '../src/js/core/itemstore.js';
import { clearCache } from '../src/js/core/cache.js';
import { createMutedPreview } from '../src/js/shared/trailer.js';
import { openTitleMenu, toggleFavorite, togglePlayed } from '../src/js/shared/titleactions.js';
import feature, { INTENT_POSTER_MS, INTENT_WIDE_MS, PREVIEW_MS, popupGeometry } from '../src/js/features/prime/hover.js';
import { createPrimeCard } from '../src/js/features/prime/card.js';

const route = (q = '') => ({ path: '/home', params: new URLSearchParams(q) });
const mk = (id, type = 'Movie', extra = {}) => ({
  Id: id, Name: `Titel ${id}`, Type: type, ImageTags: { Thumb: 't', Primary: 'p' }, Overview: 'Eine Beschreibung.',
  OfficialRating: 'FSK-16', ProductionYear: 2021, RunTimeTicks: 60 * 600000000 * 2, CommunityRating: 7.5, ...extra,
});

let wide;
let poster;
let preview;

const over = (el) => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
const tick = (ms) => vi.advanceTimersByTimeAsync(ms);

function setupDom() {
  document.documentElement.className = 'lfx-js lfx-theme-prime';
  document.body.innerHTML = '<header class="MuiAppBar-root"></header><div id="lfx-prime-home"><div class="lfx-prime-row__track"></div></div><div id="other"></div>';
  const items = [mk('m1'), mk('p1', 'Series', { ChildCount: 3 })];
  putItems(items);
  wide = createPrimeCard(items[0], { kind: 'landscape' });
  poster = createPrimeCard(items[1], { kind: 'poster' });
  document.querySelector('.lfx-prime-row__track').append(wide, poster);
}

beforeEach(() => {
  vi.useFakeTimers();
  window.matchMedia = vi.fn((q) => ({ matches: /hover:\s*hover/.test(q), addEventListener() {}, removeEventListener() {} }));
  Object.defineProperty(window, 'innerWidth', { value: 1920, configurable: true });
  vi.mocked(isTheme).mockImplementation((id) => id === 'prime');
  isMenuOpen.mockReturnValue(false);
  clearCache();
  api.getItem.mockReset();
  api.getItem.mockImplementation(async (id) => mk(id, 'Series', { LocalTrailerCount: 1, ChildCount: 3 }));
  createMutedPreview.mockReset();
  preview = { cancel: vi.fn() };
  createMutedPreview.mockReturnValue(preview);
  for (const m of [toggleFavorite, togglePlayed, openTitleMenu, play]) m.mockClear();
  setupDom();
  feature.mount(route());
});
afterEach(() => {
  feature.unmount();
  vi.useRealTimers();
  document.body.innerHTML = '';
  document.documentElement.className = '';
  delete window.matchMedia;
});

describe('prime-hover: match', () => {
  it('nur LENZPRIME, Desktop, Maus, Startseite/Hub', () => {
    expect(feature.match(route())).toBe(true);
    expect(feature.match(route('lfx=hub&lib=L1'))).toBe(true);
    expect(feature.match(route('lfx=title&id=1'))).toBe(false);
    vi.mocked(isTheme).mockImplementation((id) => id === 'plus');
    expect(feature.match(route())).toBe(false);
    vi.mocked(isTheme).mockImplementation((id) => id === 'flix');
    expect(feature.match(route())).toBe(false);
    vi.mocked(isTheme).mockImplementation((id) => id === 'prime');
    window.matchMedia = vi.fn(() => ({ matches: false }));
    expect(feature.match(route())).toBe(false); // Touch
    window.matchMedia = vi.fn(() => ({ matches: true }));
    Object.defineProperty(window, 'innerWidth', { value: 700, configurable: true });
    expect(feature.match(route())).toBe(false); // mobil
  });
});

describe('prime-hover: Geometrie', () => {
  it('popupGeometry zentriert und klemmt im Viewport', () => {
    const g = popupGeometry({ left: 500, top: 400, width: 276, height: 155 }, 1920, 927, 180);
    expect(g.width).toBe(431);
    expect(g.left).toBeCloseTo(500 + 138 - 215.5, 1);
    expect(g.top).toBeCloseTo(400 + 77.5 - 121, 0);
    expect(g.scale).toBeCloseTo(276 / 431, 3);
    const left = popupGeometry({ left: 72, top: 300, width: 276, height: 155 }, 1920, 927, 180);
    expect(left.left).toBe(12);
    expect(left.originX).toBeCloseTo(72 + 138 - 12, 1);
    const right = popupGeometry({ left: 1572, top: 300, width: 276, height: 155 }, 1920, 927, 180);
    expect(right.left).toBe(1920 - 12 - 431);
    const bottom = popupGeometry({ left: 600, top: 800, width: 276, height: 155 }, 1920, 927, 180);
    expect(bottom.top + 242 + 180).toBeLessThanOrEqual(927 - 12);
    const low = popupGeometry({ left: 600, top: 601, width: 276, height: 155 }, 2133, 967, 235);
    expect(low.top + Math.round((431 * 9) / 16) + 235).toBeLessThanOrEqual(967 - 12);
    expect(low.top).toBeGreaterThanOrEqual(72);
    const top = popupGeometry({ left: 600, top: 10, width: 276, height: 155 }, 1920, 927, 180);
    expect(top.top).toBe(72);
  });
});

describe('prime-hover: 16:9-Popup', () => {
  it('öffnet nach der Hover-Absicht, ohne Trailer, mit Infos und Knöpfen; schließt beim Verlassen', async () => {
    over(wide.querySelector('a'));
    await tick(INTENT_WIDE_MS - 10);
    expect(document.getElementById('lfx-prime-hover')).toBeNull();
    await tick(20);
    const pop = document.getElementById('lfx-prime-hover');
    expect(pop).not.toBeNull();
    expect(pop.querySelector('.lfx-prime-hc__title').textContent).toBe('Titel m1');
    expect(pop.querySelector('.lfx-prime-hc__play').textContent).toContain('Abspielen');
    expect(pop.querySelectorAll('.lfx-prime-hc__round').length).toBe(3);
    expect(pop.querySelector('.lfx-prime-hc__rank').textContent).toContain('Platz 3 der Top 10');
    expect(pop.querySelector('.lfx-prime-chip').textContent).toBe('16');
    expect(pop.querySelector('.lfx-prime-meta').textContent).toContain('2021');
    expect(pop.querySelector('.lfx-prime-hc__desc').textContent).toBe('Eine Beschreibung.');
    expect(pop.querySelector('.lfx-prime-hover__media').getAttribute('href')).toBe('#/home?lfx=title&id=m1');
    expect(createMutedPreview).not.toHaveBeenCalled();
    expect(api.getItem).not.toHaveBeenCalled();
    // Wechsel Karte -> Popup schließt nicht
    over(pop.querySelector('.lfx-prime-hc__title'));
    await tick(500);
    expect(document.getElementById('lfx-prime-hover')).not.toBeNull();
    // Verlassen
    over(document.getElementById('other'));
    await tick(200);
    expect(document.getElementById('lfx-prime-hover')).toBeNull();
  });

  it('kurzes Überstreichen öffnet nichts', async () => {
    over(wide.querySelector('a'));
    await tick(100);
    over(document.getElementById('other'));
    await tick(1000);
    expect(document.getElementById('lfx-prime-hover')).toBeNull();
  });

  it('Karten außerhalb von #lfx-prime-home bleiben unberührt', async () => {
    const outside = createPrimeCard(mk('x1'), { kind: 'landscape' });
    document.getElementById('other').append(outside);
    putItems([mk('x1')]);
    over(outside.querySelector('a'));
    await tick(1000);
    expect(document.getElementById('lfx-prime-hover')).toBeNull();
    const flix = document.createElement('div');
    flix.className = 'lfx-card';
    flix.innerHTML = '<a class="lfx-card__link"></a>';
    document.querySelector('#lfx-prime-home').append(flix);
    over(flix.firstChild);
    await tick(1000);
    expect(document.getElementById('lfx-prime-hover')).toBeNull();
  });

  it('Knöpfe: Meine Liste, Gesehen, Mehr, Abspielen', async () => {
    over(wide.querySelector('a'));
    await tick(INTENT_WIDE_MS + 20);
    const pop = document.getElementById('lfx-prime-hover');
    const [list, seen, more] = pop.querySelectorAll('.lfx-prime-hc__round');
    list.click();
    await tick(0);
    expect(toggleFavorite).toHaveBeenCalledWith(expect.objectContaining({ Id: 'm1' }));
    expect(list.getAttribute('aria-pressed')).toBe('true');
    seen.click();
    await tick(0);
    expect(togglePlayed).toHaveBeenCalled();
    expect(seen.getAttribute('aria-pressed')).toBe('true');
    more.click();
    expect(openTitleMenu).toHaveBeenCalledWith(expect.objectContaining({ Id: 'm1' }), more);
    pop.querySelector('.lfx-prime-hc__play').click();
    await tick(0);
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ Id: 'm1' }), { resume: false });
  });

  it('bleibt offen, solange das Titelmenü offen ist; Escape schließt', async () => {
    over(wide.querySelector('a'));
    await tick(INTENT_WIDE_MS + 20);
    isMenuOpen.mockReturnValue(true);
    over(document.getElementById('other'));
    await tick(1000);
    expect(document.getElementById('lfx-prime-hover')).not.toBeNull();
    isMenuOpen.mockReturnValue(false);
    await tick(400);
    expect(document.getElementById('lfx-prime-hover')).toBeNull();
    over(wide.querySelector('a'));
    await tick(INTENT_WIDE_MS + 20);
    expect(document.getElementById('lfx-prime-hover')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('lfx-prime-hover')).toBeNull();
  });

  it('unmount entfernt Popup und Listener', async () => {
    over(wide.querySelector('a'));
    await tick(INTENT_WIDE_MS + 20);
    feature.unmount();
    expect(document.getElementById('lfx-prime-hover')).toBeNull();
    over(wide.querySelector('a'));
    await tick(1000);
    expect(document.getElementById('lfx-prime-hover')).toBeNull();
    feature.mount(route()); // für afterEach
  });
});

describe('prime-hover: Poster', () => {
  it('klappt auf, lädt Trailer-Felder nach, startet nach 1,5 s die stumme Vorschau, setzt beim Verlassen zurück', async () => {
    over(poster.querySelector('a'));
    await tick(INTENT_POSTER_MS - 10);
    expect(poster.classList.contains('is-expanded')).toBe(false);
    await tick(20);
    expect(poster.classList.contains('is-expanded')).toBe(true);
    const panel = poster.querySelector('.lfx-prime-expand');
    expect(panel).not.toBeNull();
    expect(panel.querySelector('.lfx-prime-hc__play').textContent).toContain('Abspielen');
    expect(panel.querySelector('a.lfx-prime-hc__round--info').getAttribute('href')).toBe('#/home?lfx=title&id=p1');
    const fields = api.getItem.mock.calls[0][1].Fields;
    expect(fields).toContain('RemoteTrailers');
    expect(fields).toContain('LocalTrailerCount');
    expect(createMutedPreview).toHaveBeenCalledTimes(1);
    const [container, detail, opts] = createMutedPreview.mock.calls[0];
    expect(container.classList.contains('lfx-prime-expand__media')).toBe(true);
    expect(detail.LocalTrailerCount).toBe(1);
    expect(opts.delay).toBeLessThanOrEqual(PREVIEW_MS);
    expect(opts.delay).toBeGreaterThan(PREVIEW_MS - 100);
    const mute = panel.querySelector('.lfx-prime-expand__mute');
    expect(mute.hidden).toBe(true);
    const v = document.createElement('video');
    v.muted = true;
    opts.onStart(v);
    expect(mute.hidden).toBe(false);
    mute.click();
    expect(v.muted).toBe(false);
    // Verlassen: alles zurück
    over(document.getElementById('other'));
    await tick(200);
    expect(poster.classList.contains('is-expanded')).toBe(false);
    expect(poster.querySelector('.lfx-prime-expand')).toBeNull();
    expect(preview.cancel).toHaveBeenCalled();
  });

  it('Poster ohne Trailer: aufgeklappt, aber Vorschau endet still', async () => {
    createMutedPreview.mockImplementation(() => preview);
    over(poster.querySelector('a'));
    await tick(INTENT_POSTER_MS + 50);
    expect(poster.classList.contains('is-expanded')).toBe(true);
    expect(poster.querySelector('.lfx-prime-expand__mute').hidden).toBe(true);
  });

  it('Wechsel zu einem anderen Poster schließt das erste', async () => {
    const second = createPrimeCard(mk('p2', 'Series'), { kind: 'poster' });
    putItems([mk('p2', 'Series')]);
    document.querySelector('.lfx-prime-row__track').append(second);
    over(poster.querySelector('a'));
    await tick(INTENT_POSTER_MS + 50);
    over(second.querySelector('a'));
    expect(poster.classList.contains('is-expanded')).toBe(false);
    await tick(INTENT_POSTER_MS + 50);
    expect(second.classList.contains('is-expanded')).toBe(true);
    expect(poster.querySelector('.lfx-prime-expand')).toBeNull();
  });
});
