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
import { play } from '../src/js/core/playback.js';
import { onItemsChanged } from '../src/js/core/itemmenu.js';
import { confirmAction } from '../src/js/core/sheet.js';
import { toast } from '../src/js/core/toast.js';
import { clearCache, cached } from '../src/js/core/cache.js';
import modal, { openModal, closeModal } from '../src/js/features/modal.js';

const flush = () => new Promise((r) => setTimeout(r, 0));
const wait = async (fn, n = 40) => { for (let i = 0; i < n; i++) { if (fn()) return; await flush(); } };

const series = { Id: 'S1', Type: 'Series', Name: 'Serie', Overview: 'Text', ChildCount: 2, ProductionYear: 2020, Genres: ['Drama'], UserData: {} };
const other = { Id: 'S2', Type: 'Series', Name: 'Andere', ChildCount: 1, UserData: { Played: true } };
const movie = { Id: 'M1', Type: 'Movie', Name: 'Film', RunTimeTicks: 67_200_000_000, Width: 1920, ProductionYear: 2021, UserData: { PlaybackPositionTicks: 5 } };
const seasons = [{ Id: 'SE1', Name: 'Staffel 1', IndexNumber: 1 }, { Id: 'SE2', Name: 'Staffel 2', IndexNumber: 2 }];
const mkEps = (season, n) => Array.from({ length: n }, (_, i) => ({ Id: `${season}-E${i + 1}`, Type: 'Episode', Name: `Folge ${i + 1}`, IndexNumber: i + 1, SeriesId: 'S1', SeasonId: season, RunTimeTicks: 600_000_000, UserData: {} }));
const lastConfirm = () => confirmAction.mock.calls.at(-1)[0];
const deferred = () => { let res; const p = new Promise((r) => { res = r; }); return { p, res }; };
const playBtn = () => document.querySelector('.lfx-modal__play');

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

describe('Info-Fenster Welle 2', () => {
  it('B046: mehrere updated-Meldungen bauen das Info-Fenster nicht mehrfach neu auf', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    const cb = onItemsChanged.mock.calls.at(-1)[0];
    const before = api.getItem.mock.calls.length;
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 4; i++) { cb({ removed: [], updated: ['S1'] }); await vi.advanceTimersByTimeAsync(1000); }
      await vi.advanceTimersByTimeAsync(5000);
    } finally { vi.useRealTimers(); }
    expect(api.getItem.mock.calls.length - before).toBeLessThanOrEqual(1);
  });

  it('B046: offene Rückfrage überlebt einen Refresh des Titels', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    document.querySelector('.lfx-modal__round--played[data-scope="season"]').click();
    const conf = lastConfirm();
    const cb = onItemsChanged.mock.calls.at(-1)[0];
    vi.useFakeTimers();
    try { cb({ removed: [], updated: ['S1'] }); await vi.advanceTimersByTimeAsync(3000); } finally { vi.useRealTimers(); }
    api.setPlayed.mockClear();
    await conf.onConfirm();
    expect(api.setPlayed).toHaveBeenCalledWith('SE1', true);
  });

  it('L003: Scroll-Sperre auch am Desktop (body fixiert, Position wird wiederhergestellt)', async () => {
    const orig = window.matchMedia;
    window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    Object.defineProperty(window, 'scrollY', { value: 420, configurable: true });
    try {
      await openModal('M1');
      expect(document.body.style.position).toBe('fixed');
      expect(document.body.style.top).toBe('-420px');
    } finally {
      closeModal();
      await wait(() => !document.querySelector('.lfx-modal-overlay'), 100);
      Object.defineProperty(window, 'scrollY', { value: 0, configurable: true, writable: true });
      window.matchMedia = orig;
    }
    expect(document.body.style.position).toBe('');
  });

  it('B045: Titelwechsel verwirft die Staffeln der vorigen Serie', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    api.getSeasons.mockRejectedValue(new Error('x'));
    await openModal('S2');
    await wait(() => document.querySelector('.lfx-modal__title')?.textContent === 'Andere');
    api.getEpisodes.mockClear();
    playBtn().click();
    await wait(() => toast.mock.calls.length, 20);
    expect(api.getEpisodes).not.toHaveBeenCalled();
    expect(play).not.toHaveBeenCalled();
  });

  it('A040/B044: Staffelwechsel mit hängender Antwort: Gesehen-Knopf bleibt bei der angezeigten Staffel', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    const d2 = deferred();
    api.getEpisodes.mockImplementation((_s, p) => (p.SeasonId === 'SE2' ? d2.p : Promise.resolve({ Items: mkEps(p.SeasonId, 14) })));
    document.querySelector('.lfx-modal__seasonbtn').click();
    [...document.querySelectorAll('.lfx-modal__seasonopt')].find((o) => o.dataset.id === 'SE2').click();
    await flush();
    document.querySelector('.lfx-modal__round--played[data-scope="season"]').click();
    api.setPlayed.mockClear();
    await lastConfirm().onConfirm();
    expect(api.setPlayed).toHaveBeenCalledWith('SE1', true);
    expect(api.setPlayed).not.toHaveBeenCalledWith('SE2', expect.anything());
    d2.res({ Items: mkEps('SE2', 3) });
  });

  it('A040: veraltete Antwort der älteren Staffel überschreibt die neuere nicht', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    const dA = deferred();
    const dB = deferred();
    api.getSeasons.mockResolvedValue({ Items: [...seasons, { Id: 'SE3', Name: 'Staffel 3', IndexNumber: 3 }] });
    clearCache('lfx:modal:seasons:');
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    api.getEpisodes.mockImplementation((_s, p) => (p.SeasonId === 'SE2' ? dA.p : dB.p));
    clearCache('lfx:modal:eps:');
    const pick = (id) => {
      document.querySelector('.lfx-modal__seasonbtn').click();
      [...document.querySelectorAll('.lfx-modal__seasonopt')].find((o) => o.dataset.id === id).click();
    };
    pick('SE2');
    pick('SE3');
    dB.res({ Items: mkEps('SE3', 5) });
    await flush(); await flush();
    dA.res({ Items: mkEps('SE2', 3) });
    await flush(); await flush();
    expect(document.querySelectorAll('.lfx-modal__ep').length).toBe(5);
  });

  it('A041: Staffeln für die Folgenzahl werden parallel geladen', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    clearCache('lfx:modal:eps:');
    let open = 0; let maxOpen = 0;
    api.getEpisodes.mockImplementation(async (_s, p) => {
      open++; maxOpen = Math.max(maxOpen, open);
      await flush();
      open--;
      return { Items: mkEps(p.SeasonId, 2) };
    });
    document.querySelector('.lfx-modal__actions [data-scope="series"]').click();
    await wait(() => confirmAction.mock.calls.length, 60);
    expect(maxOpen).toBeGreaterThan(1);
  });

  it('B048: ohne Folgen erscheint ein Hinweis statt stillem Nichtstun', async () => {
    api.getSeasons.mockResolvedValue({ Items: [] });
    await openModal('S1');
    await wait(() => playBtn());
    await flush();
    playBtn().click();
    await wait(() => toast.mock.calls.length, 40);
    expect(toast).toHaveBeenCalledWith('Keine Folgen verfügbar');
    expect(play).not.toHaveBeenCalled();
  });

  it('B048: Film als gesehen markieren setzt das Abspielen-Label zurück', async () => {
    await openModal('M1');
    await wait(() => playBtn());
    expect(playBtn().textContent).toMatch(/Fortsetzen/);
    document.querySelector('.lfx-modal__actions .lfx-modal__round--played').click();
    await flush();
    expect(playBtn().textContent).toMatch(/Abspielen/);
  });

  it('B050: verwaister Modal-Eintrag wird beim Zurück übersprungen', async () => {
    await openModal('M1');
    modal.unmount();
    history.replaceState({ lfxModal: true }, '', location.href);
    const back = vi.spyOn(history, 'back').mockImplementation(() => {});
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(back).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(back).toHaveBeenCalledTimes(1);
    back.mockRestore();
    history.replaceState({}, '', location.href);
  });

  it('B043: frisches Öffnen nutzt keinen alten Item-Cache', async () => {
    await cached('lfx:modal:item:M1', async () => ({ ...movie, UserData: { PlaybackPositionTicks: 0 } }), 300000);
    api.getItem.mockClear();
    await openModal('M1');
    expect(api.getItem).toHaveBeenCalled();
    await wait(() => playBtn());
    expect(playBtn().textContent).toMatch(/Fortsetzen/);
  });
});
