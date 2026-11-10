// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, isReady: () => true, getItems: vi.fn() };
});
vi.mock('../src/js/core/itemmenu.js', () => ({
  openItemMenu: vi.fn(), isMenuOpen: vi.fn(() => false), onItemsChanged: vi.fn(() => () => {}),
}));
vi.mock('../src/js/core/download.js', () => ({ isChooserOpen: vi.fn(() => false), canDownload: vi.fn(), startDownload: vi.fn() }));
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn(async () => true) }));
vi.mock('../src/js/features/modal/data.js', () => ({
  loadNextUp: vi.fn(async () => null), loadSeasons: vi.fn(), loadEpisodes: vi.fn(),
}));
vi.mock('../src/js/shared/titleactions.js', () => ({
  toggleFavorite: vi.fn(), togglePlayed: vi.fn(), openTitleMenu: vi.fn(),
}));
vi.mock('../src/js/shared/trend.js', async () => {
  const actual = await vi.importActual('../src/js/shared/trend.js');
  return { ...actual, getTrendInfo: vi.fn(async () => ({ available: true, rank: new Map([['m1', { rank: 3, type: 'Movie' }]]) })) };
});
vi.mock('../src/js/shared/newcontent.js', async () => {
  const actual = await vi.importActual('../src/js/shared/newcontent.js');
  return { ...actual, getNewContentInfo: vi.fn(async () => null) };
});
vi.mock('../src/js/shared/trailer.js', () => ({ createMutedPreview: vi.fn() }));

import { play } from '../src/js/core/playback.js';
import { createMutedPreview } from '../src/js/shared/trailer.js';
import { renderHero, TRAILER_DELAY_MS } from '../src/js/features/prime/hero.js';
import { createPrimeCard, remainingText } from '../src/js/features/prime/card.js';
import { openTitleMenu } from '../src/js/shared/titleactions.js';

const mk = (id, type = 'Movie', extra = {}) => ({
  Id: id, Name: `Titel ${id}`, Type: type, ImageTags: { Logo: 'l' }, BackdropImageTags: ['b'], ...extra,
});

const setWidth = (w) => Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w });
const tick = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

let slot;
async function mount(pool) {
  slot = document.createElement('section');
  document.body.append(slot);
  const cleanup = renderHero(slot, { loadPool: async () => pool });
  await tick(0);
  return cleanup;
}

beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  document.documentElement.className = '';
  createMutedPreview.mockReset();
  createMutedPreview.mockReturnValue({ cancel: vi.fn() });
  play.mockClear();
  openTitleMenu.mockClear();
  localStorage.clear();
});
afterEach(() => {
  vi.useRealTimers();
  setWidth(1024);
});

describe('Hero am Handy', () => {
  it('startet keinen Trailer, baut Rahmen + Meta + Abspielen + Punkte', async () => {
    setWidth(390);
    const cleanup = await mount([
      mk('m1', 'Movie', { OfficialRating: 'FSK-16', ProductionYear: 2026, RunTimeTicks: 54600000000, Genres: ['Komödien'] }),
      mk('m2'),
    ]);
    await tick(TRAILER_DELAY_MS + 100);
    expect(createMutedPreview).not.toHaveBeenCalled();
    expect(slot.querySelector('.lfx-prime-hero--mobile')).not.toBeNull();
    expect(slot.querySelector('.lfx-prime-hero__frame .lfx-prime-hero__logo')).not.toBeNull();
    const below = slot.querySelector('.lfx-prime-hero__below');
    expect(below.querySelector('.lfx-prime-hero__fsk').textContent).toBe('16');
    expect(below.querySelector('.lfx-prime-hero__metatext').textContent).toBe('1 Std. 31 Min.  2026  Komödien');
    expect(below.querySelector('.lfx-prime-hero__rank').textContent).toContain('Platz 3 der Top 10');
    expect(below.querySelectorAll('.lfx-prime-hero__round').length).toBe(0);
    expect(slot.querySelectorAll('.lfx-prime-hero__dot').length).toBe(2);
    expect(slot.querySelector('.lfx-prime-hero__arrow')).toBeNull();
    expect(below.querySelector('.lfx-prime-hero__play')).not.toBeNull();
    cleanup();
    expect(slot.childElementCount).toBe(0);
  });

  it('Desktop (>= 800 px) behält den Trailer', async () => {
    setWidth(1280);
    const cleanup = await mount([mk('m1')]);
    await tick(10);
    expect(createMutedPreview).toHaveBeenCalled();
    expect(slot.querySelector('.lfx-prime-hero--mobile')).toBeNull();
    cleanup();
  });
});

describe('Karte: Fortsetzen am Handy', () => {
  it('Restzeit und Drei-Punkte-Knopf öffnen das Titelmenü', () => {
    const item = mk('e1', 'Episode', { RunTimeTicks: 600000000 * 90, UserData: { PlaybackPositionTicks: 600000000 * 22 } });
    expect(remainingText(item)).toBe('Noch 1 Std. 8 Min.');
    const card = createPrimeCard(item, { kind: 'resume' });
    expect(card.querySelector('.lfx-prime-card__remaining').textContent).toBe('Noch 1 Std. 8 Min.');
    const btn = card.querySelector('.lfx-prime-card__menu');
    btn.click();
    expect(openTitleMenu).toHaveBeenCalledWith(item, btn);
    expect(createPrimeCard(mk('p'), { kind: 'poster' }).querySelector('.lfx-prime-card__foot')).toBeNull();
  });

  it('remainingText ohne Fortschritt leer, sonst Minuten', () => {
    expect(remainingText(mk('x'))).toBe('');
    expect(remainingText({ RunTimeTicks: 600000000 * 30, UserData: { PlaybackPositionTicks: 600000000 * 11 } })).toBe('Noch 19 Min.');
  });
});
