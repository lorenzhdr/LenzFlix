// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/js/core/api.js', async (orig) => {
  const real = await orig();
  return {
    ...real,
    getItem: vi.fn(),
    getSeasons: vi.fn(),
    getEpisodes: vi.fn(),
    getSimilar: vi.fn(),
    getNextUp: vi.fn(),
    getItems: vi.fn(),
    setFavorite: vi.fn(async () => ({})),
    setPlayed: vi.fn(async () => {}),
  };
});
vi.mock('../src/js/core/sheet.js', () => ({ confirmAction: vi.fn() }));
vi.mock('../src/js/core/toast.js', () => ({ toast: vi.fn() }));
vi.mock('../src/js/core/itemmenu.js', () => ({
  openItemMenu: vi.fn(() => true),
  isMenuOpen: vi.fn(() => false),
  onItemsChanged: vi.fn(() => vi.fn()),
}));
vi.mock('../src/js/core/download.js', () => ({
  startDownload: vi.fn(async () => {}),
  canDownload: vi.fn(async () => false),
  isChooserOpen: vi.fn(() => false),
}));
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn(async () => true) }));
vi.mock('../src/js/core/startcover.js', () => ({ show: vi.fn(), hide: vi.fn() }));
const themeState = vi.hoisted(() => ({ id: null }));
vi.mock('../src/js/core/theme.js', () => ({
  getTheme: () => themeState.id,
  isTheme: (id) => themeState.id === id,
  brandName: () => 'LENZFLIX',
  onThemeChange: () => () => {},
}));

import * as api from '../src/js/core/api.js';
import { onItemsChanged } from '../src/js/core/itemmenu.js';
import { clearCache } from '../src/js/core/cache.js';
import modal, { openModal, closeModal } from '../src/js/features/modal.js';

const flush = () => new Promise((r) => setTimeout(r, 0));
const wait = async (fn, n = 40) => { for (let i = 0; i < n; i++) { if (fn()) return; await flush(); } };

const series = { Id: 'S1', Type: 'Series', Name: 'Serie', Overview: 'Text', ChildCount: 2, ProductionYear: 2020, Genres: ['Drama'], UserData: {} };
const other = { Id: 'S2', Type: 'Series', Name: 'Andere', ChildCount: 1, UserData: { Played: true } };
const movie = { Id: 'M1', Type: 'Movie', Name: 'Film', RunTimeTicks: 67_200_000_000, Width: 1920, ProductionYear: 2021, UserData: { PlaybackPositionTicks: 5 } };
const seasons = [{ Id: 'SE1', Name: 'Staffel 1', IndexNumber: 1 }, { Id: 'SE2', Name: 'Staffel 2', IndexNumber: 2 }];
const mkEps = (season, n) => Array.from({ length: n }, (_, i) => ({ Id: `${season}-E${i + 1}`, Type: 'Episode', Name: `Folge ${i + 1}`, IndexNumber: i + 1, SeriesId: 'S1', SeasonId: season, RunTimeTicks: 600_000_000, UserData: {} }));

function setup() {
  window.ApiClient = { serverAddress: () => 'http://s', getCurrentUserId: () => 'u', accessToken: () => 't', serverId: () => 'srv' };
  document.documentElement.className = 'lfx-js';
  document.body.innerHTML = '';
  window.location.hash = '#/home';
  api.getItem.mockImplementation(async (id) => structuredClone({ S1: series, S2: other, M1: movie }[id]));
  api.getSeasons.mockResolvedValue({ Items: seasons });
  api.getEpisodes.mockImplementation(async (_s, p) => ({ Items: mkEps(p.SeasonId, p.SeasonId === 'SE1' ? 14 : 3) }));
  api.getSimilar.mockResolvedValue({ Items: [] });
  api.getNextUp.mockResolvedValue({ Items: [] });
}

beforeEach(async () => { clearCache(); vi.clearAllMocks(); setup(); await flush(); });
afterEach(() => { modal.unmount(); document.documentElement.className = ''; });

const press = (el, key) => el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
const seasonBtn = () => document.querySelector('.lfx-modal__seasonbtn');
const similarItems = Array.from({ length: 8 }, (_, i) => ({ Id: `X${i + 1}`, Type: 'Movie', Name: `Ähnlich ${i + 1}`, UserData: {} }));

describe('Info-Fenster: Fokus und Tastatur (Welle 2)', () => {
  it('L006/A039: nach Staffelwahl liegt der Fokus auf dem neuen Staffel-Knopf', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    seasonBtn().click();
    document.querySelector('.lfx-modal__seasonopt[data-id="SE2"]').focus();
    document.querySelector('.lfx-modal__seasonopt[data-id="SE2"]').click();
    await wait(() => seasonBtn()?.textContent.includes('Staffel 2'));
    await flush();
    expect(document.activeElement).toBe(seasonBtn());
  });

  it('L007: Staffelliste per Tastatur (Öffnen fokussiert Auswahl, Pfeile, Home/End)', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    seasonBtn().focus();
    press(seasonBtn(), 'ArrowDown');
    const opts = [...document.querySelectorAll('.lfx-modal__seasonopt')];
    expect(document.querySelector('.lfx-modal__seasonlist').hidden).toBe(false);
    expect(document.activeElement).toBe(opts[0]);
    press(document.activeElement, 'ArrowDown');
    expect(document.activeElement).toBe(opts[1]);
    press(document.activeElement, 'ArrowUp');
    expect(document.activeElement).toBe(opts[0]);
    press(document.activeElement, 'End');
    expect(document.activeElement).toBe(opts[1]);
    press(document.activeElement, 'Home');
    expect(document.activeElement).toBe(opts[0]);
  });

  it('A043: „Mehr anzeigen“ per Tastatur setzt den Fokus auf die erste neue Folge', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    const btn = document.querySelector('.lfx-modal__eplist .lfx-modal__more-btn');
    btn.focus();
    btn.click();
    expect(document.activeElement).toBe(document.querySelectorAll('.lfx-modal__ep')[10]);
  });

  it('A043/A042: Karten-„Mehr anzeigen“ fokussiert die erste neue Karte; Leertaste öffnet eine Karte', async () => {
    api.getSimilar.mockResolvedValue({ Items: similarItems });
    await openModal('M1');
    await wait(() => document.querySelector('.lfx-modal__card'));
    const btn = document.querySelector('.lfx-modal__grid ~ .lfx-modal__more .lfx-modal__more-btn');
    btn.focus();
    btn.click();
    const cards = document.querySelectorAll('.lfx-modal__card');
    expect(document.activeElement).toBe(cards[6]);
    api.getItem.mockClear();
    press(cards[1], ' ');
    await flush();
    expect(api.getItem.mock.calls.some((c) => c[0] === 'X2')).toBe(true);
  });

  it('L006: Klick auf eine Ähnliche-Titel-Karte lässt den Fokus nicht auf body fallen', async () => {
    api.getSimilar.mockResolvedValue({ Items: similarItems.slice(0, 3) });
    api.getItem.mockImplementation(async (id) => structuredClone({ S1: series, S2: other, M1: movie }[id] || { Id: id, Type: 'Movie', Name: id, UserData: {} }));
    await openModal('M1');
    await wait(() => document.querySelector('.lfx-modal__card'));
    const card = document.querySelector('.lfx-modal__card');
    card.focus();
    card.click();
    await wait(() => document.querySelector('.lfx-modal__title')?.textContent === 'X1');
    await flush();
    expect(document.activeElement).not.toBe(document.body);
    expect(document.querySelector('.lfx-modal').contains(document.activeElement)).toBe(true);
  });

  it('L006: Opener (Hovercard-Knopf) verschwunden -> Fokus auf den Link der zugehörigen Karte', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div class="lfx-card" data-lfx-id="M1"><a class="lfx-card__link" href="#x">M1</a></div><button id="hc">Weitere Infos</button>');
    const hc = document.getElementById('hc');
    hc.focus();
    await openModal('M1');
    await wait(() => document.querySelector('.lfx-modal__play'));
    hc.remove();
    closeModal();
    await wait(() => !document.querySelector('.lfx-modal-overlay'), 100);
    expect(document.activeElement).toBe(document.querySelector('.lfx-card__link'));
  });

  it('B047: gelöschte Folge kehrt nach „Mehr anzeigen“ nicht zurück', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    const cb = onItemsChanged.mock.calls.at(-1)[0];
    cb({ removed: ['SE1-E2'], updated: [] });
    expect(document.querySelector('.lfx-modal__ep[data-id="SE1-E2"]')).toBeNull();
    document.querySelector('.lfx-modal__eplist .lfx-modal__more-btn').click();
    expect(document.querySelector('.lfx-modal__ep[data-id="SE1-E2"]')).toBeNull();
    expect(document.querySelectorAll('.lfx-modal__ep').length).toBe(13);
  });

  it('L005: Thumb als Hero zeigt kein zusätzliches Logo', async () => {
    const boys = { Id: 'B1', Type: 'Series', Name: 'Boys', ImageTags: { Thumb: 't1', Logo: 'l1' }, BackdropImageTags: [], UserData: {} };
    api.getItem.mockImplementation(async (id) => structuredClone(id === 'B1' ? boys : movie));
    await openModal('B1');
    await wait(() => document.querySelector('.lfx-modal__hero-img'));
    expect(document.querySelector('.lfx-modal__hero-img').src).toContain('/Thumb');
    expect(document.querySelector('.lfx-modal__logo')).toBeNull();
    expect(document.querySelector('.lfx-modal__title').classList.contains('lfx-sr')).toBe(true);
  });

  it('L005: mit Backdrop bleibt das Logo', async () => {
    const x = { Id: 'B2', Type: 'Movie', Name: 'X', ImageTags: { Thumb: 't1', Logo: 'l1' }, BackdropImageTags: ['b1'], UserData: {} };
    api.getItem.mockImplementation(async () => structuredClone(x));
    await openModal('B2');
    await wait(() => document.querySelector('.lfx-modal__hero-img'));
    expect(document.querySelector('.lfx-modal__hero-img').src).toContain('/Backdrop');
    expect(document.querySelector('.lfx-modal__logo')).not.toBeNull();
  });
});
