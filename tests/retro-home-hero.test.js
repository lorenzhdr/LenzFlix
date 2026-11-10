// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  isReady: () => true,
  getUserId: () => 'u1',
  getItems: vi.fn(async () => ({ Items: [] })),
  imageUrl: (it, { type }) => `/Items/${it.Id}/Images/${type}?tag=t`,
}));
vi.mock('../src/js/core/itemmenu.js', () => ({
  openItemMenu: vi.fn(), isMenuOpen: () => false, onItemsChanged: vi.fn(() => () => {}),
}));
const playTitle = vi.fn();
vi.mock('../src/js/features/prime/hero-play.js', () => ({
  playTitle: (...a) => playTitle(...a),
  playLabel: (it) => ({ line1: it && it.UserData && it.UserData.PlaybackPositionTicks ? 'Fortsetzen' : 'Abspielen', line2: null, progress: 0 }),
}));

import {
  renderHero, setTitleText, titleSize, dosName, fileName, pathLine, runtimeShort, metaLine, ROTATE_MS, TYPE_MS, CHANNEL_END_MS,
} from '../src/js/features/retro/home-hero.js';
import { FX_EVENT } from '../src/js/features/retro/prefs.js';

const mk = (id, extra = {}) => ({
  Id: id, Name: `Titel ${id}`, Type: 'Movie', ProductionYear: 1982, OfficialRating: 'FSK-16', RunTimeTicks: 57 * 600000000 + 60 * 600000000,
  Genres: ['Sci-Fi'], Overview: 'Beschreibung.', ImageTags: { Logo: 'l' }, BackdropImageTags: ['b'], ...extra,
});
const setWidth = (w) => Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w });
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

describe('Hero: reine Hilfen', () => {
  it('dosName / fileName / pathLine', () => {
    expect(dosName('Neon Läufer: Teil 2')).toBe('NEON_LAEUFER_TEIL_2');
    expect(dosName('Straße')).toBe('STRASSE');
    expect(dosName('A'.repeat(40)).length).toBe(22);
    expect(dosName('???')).toBe('UNBEKANNT');
    expect(fileName({ Name: 'Orbit', Type: 'Movie' })).toBe('ORBIT.MOV');
    expect(fileName({ Name: 'Dark', Type: 'Series' })).toBe('DARK.SER');
    expect(pathLine({ Type: 'Movie' })).toBe('C:\\LENZ84\\FILME>');
    expect(pathLine({ Type: 'Series' })).toBe('C:\\LENZ84\\SERIEN>');
  });
  it('Laufzeit und Metazeile', () => {
    expect(runtimeShort(117 * 600000000)).toBe('1H57');
    expect(runtimeShort(45 * 600000000)).toBe('45MIN');
    expect(runtimeShort(0)).toBe('');
    expect(metaLine(mk('a'))).toBe('1982 · FSK 16 · 1H57 · SCI-FI');
    expect(metaLine({ Type: 'Series', ProductionYear: 2019, ChildCount: 3, Genres: ['Drama'] })).toBe('2019 · 3 STAFFELN · DRAMA');
  });
});

describe('Hero: Rendering', () => {
  let slot;
  let dispose;
  beforeEach(() => {
    setWidth(1280);
    vi.useFakeTimers();
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
    document.body.innerHTML = '<section id="slot"></section>';
    slot = document.getElementById('slot');
    playTitle.mockClear();
  });
  afterEach(() => {
    if (dispose) dispose();
    dispose = null;
    vi.useRealTimers();
    setWidth(1024);
  });

  const start = async (items) => {
    dispose = renderHero(slot, { loadPool: async () => items });
    await flush();
  };

  it('tippt „TITEL.MOV“ Zeichen für Zeichen, Pfad, Meta, Zähler, Buttons', async () => {
    const names = [];
    const on = (e) => names.push(e.detail.name);
    document.addEventListener(FX_EVENT, on);
    await start([mk('a', { Name: 'Orbit' }), mk('b'), mk('c')]);
    const typed = slot.querySelector('.lfx-retro-hero__typed');
    expect(typed.textContent).toBe('');
    expect(typed.classList.contains('lfx-retro-caret')).toBe(true);
    expect(slot.querySelector('.lfx-retro-hero__path').textContent).toBe('C:\\LENZ84\\FILME>');
    expect(slot.querySelector('.lfx-retro-hero__meta').textContent).toBe('1982 · FSK 16 · 1H57 · SCI-FI');
    expect(slot.querySelector('.lfx-retro-hero__count').textContent).toBe('01/03');
    vi.advanceTimersByTime(TYPE_MS * 3 + TYPE_MS * 2);
    expect(typed.textContent.length).toBeGreaterThan(0);
    expect('ORBIT.MOV'.startsWith(typed.textContent)).toBe(true);
    vi.advanceTimersByTime(TYPE_MS * 20);
    expect(typed.textContent).toBe('ORBIT.MOV');
    expect(slot.querySelector('.lfx-retro-hero__title').getAttribute('aria-label')).toBe('Orbit');
    expect(names.filter((n) => n === 'type').length).toBeGreaterThanOrEqual(3);
    document.removeEventListener(FX_EVENT, on);
    const img = slot.querySelector('.lfx-retro-hero__img');
    expect(img.getAttribute('src')).toContain('/Images/Backdrop');
    expect(img.getAttribute('src')).not.toMatch(/api_key/);
    expect(slot.querySelector('.lfx-retro-hero__info').getAttribute('href')).toBe('#/home?lfx=title&id=a');
  });

  it('Abspielen ruft playTitle mit dem aktuellen Titel', async () => {
    const items = [mk('a'), mk('b')];
    await start(items);
    slot.querySelector('.lfx-retro-hero__play').click();
    expect(playTitle).toHaveBeenCalledWith(items[0]);
  });

  it('reduced-motion: Titel sofort, keine Rotation', async () => {
    window.matchMedia = () => ({ matches: true, addEventListener() {}, removeEventListener() {} });
    await start([mk('a', { Name: 'Orbit' }), mk('b')]);
    expect(slot.querySelector('.lfx-retro-hero__typed').textContent).toBe('ORBIT.MOV');
    vi.advanceTimersByTime(ROTATE_MS * 3);
    expect(slot.querySelector('.lfx-retro-hero__count').textContent).toBe('01/02');
  });

  it('Rotation mit Kanalwechsel; Pause bei Hover und versteckter Seite', async () => {
    await start([mk('a', { Name: 'Orbit' }), mk('b', { Name: 'Funkstille' })]);
    const hero = slot.querySelector('.lfx-retro-hero');
    vi.advanceTimersByTime(ROTATE_MS - 10);
    expect(slot.querySelector('.lfx-retro-hero__count').textContent).toBe('01/02');
    vi.advanceTimersByTime(20);
    expect(hero.classList.contains('is-changing')).toBe(true);
    vi.advanceTimersByTime(CHANNEL_END_MS + 50);
    expect(hero.classList.contains('is-changing')).toBe(false);
    expect(slot.querySelector('.lfx-retro-hero__count').textContent).toBe('02/02');
    vi.advanceTimersByTime(TYPE_MS * 20);
    expect(slot.querySelector('.lfx-retro-hero__typed').textContent).toBe('FUNKSTILLE.MOV');

    // Hover pausiert
    hero.dispatchEvent(new Event('mouseenter'));
    vi.advanceTimersByTime(ROTATE_MS * 2);
    expect(slot.querySelector('.lfx-retro-hero__count').textContent).toBe('02/02');
    hero.dispatchEvent(new Event('mouseleave'));
    vi.advanceTimersByTime(ROTATE_MS + CHANNEL_END_MS + 50);
    expect(slot.querySelector('.lfx-retro-hero__count').textContent).toBe('01/02');

    // versteckte Seite pausiert
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    vi.advanceTimersByTime(ROTATE_MS * 2);
    expect(slot.querySelector('.lfx-retro-hero__count').textContent).toBe('01/02');
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  });

  it('Pfeile wechseln den Kanal; Einzeltitel ohne Kanalwahl', async () => {
    await start([mk('a'), mk('b'), mk('c')]);
    slot.querySelector('.lfx-retro-hero__arrow--next').click();
    vi.advanceTimersByTime(400);
    expect(slot.querySelector('.lfx-retro-hero__count').textContent).toBe('02/03');
    slot.querySelector('.lfx-retro-hero__arrow--prev').click();
    slot.querySelector('.lfx-retro-hero__arrow--prev').click();
    vi.advanceTimersByTime(CHANNEL_END_MS + 100);
    expect(slot.querySelector('.lfx-retro-hero__count').textContent).toBe('03/03');
    dispose();
    dispose = null;
    await start([mk('x')]);
    expect(slot.querySelector('.lfx-retro-hero__channel').hidden).toBe(true);
  });

  it('leerer Pool blendet den Slot aus; dispose räumt alles auf (keine Timer)', async () => {
    await start([]);
    expect(slot.hidden).toBe(true);
    dispose();
    dispose = null;
    slot.hidden = false;
    await start([mk('a'), mk('b')]);
    vi.advanceTimersByTime(TYPE_MS * 3);
    dispose();
    dispose = null;
    expect(slot.children.length).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('Hero: Titelumbruch', () => {
  it('setTitleText: <wbr> nach „_“, Endung bleibt im nowrap-Segment', () => {
    const el = document.createElement('span');
    setTitleText(el, 'STERNEN_CHRONIK_NULL.SER');
    expect(el.textContent).toBe('STERNEN_CHRONIK_NULL.SER');
    expect(el.querySelectorAll('wbr').length).toBe(2);
    expect(el.querySelector('.lfx-retro-hero__seg').textContent).toBe('NULL.SER');
    setTitleText(el, 'STER');
    expect(el.querySelector('wbr')).toBeNull();
  });
  it('titleSize: Stufen nach Länge', () => {
    expect([titleSize('A.MOV'), titleSize('X'.repeat(17)), titleSize('X'.repeat(21)), titleSize('X'.repeat(25))]).toEqual([0, 1, 2, 3]);
  });
});
