// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../src/js/core/api.js', async (orig) => {
  const real = await orig();
  return {
    ...real,
    getViews: vi.fn(async () => ({ Items: [{ Id: 'm1', Name: 'Filme', CollectionType: 'movies' }] })),
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
vi.mock('../src/js/core/theme.js', () => ({
  getTheme: () => 'flix',
  isTheme: () => true,
  brandName: () => 'LENZFLIX',
  onThemeChange: () => () => {},
}));
vi.mock('../src/js/core/themepicker.js', () => ({ openThemePicker: vi.fn() }));
vi.mock('../src/js/features/library/sources.js', () => ({ getLibraryGenres: vi.fn() }));

import * as api from '../src/js/core/api.js';
import { confirmAction } from '../src/js/core/sheet.js';
import { clearCache } from '../src/js/core/cache.js';
import modal, { openModal, closeModal } from '../src/js/features/modal.js';
import mobilenav from '../src/js/features/mobilenav.js';
import { parseHash } from '../src/js/core/router.js';
import { getLibraryGenres } from '../src/js/features/library/sources.js';

const flush = () => new Promise((r) => setTimeout(r, 0));
const wait = async (fn, ms = 2000) => { const end = Date.now() + ms; while (Date.now() < end) { if (fn()) return; await new Promise((r) => setTimeout(r, 5)); } fn(); };

const series = { Id: 'S1', Type: 'Series', Name: 'Serie', Overview: 'Text', ChildCount: 2, UserData: {} };
const movie = { Id: 'M1', Type: 'Movie', Name: 'Film', UserData: {} };
const seasons = [{ Id: 'SE1', Name: 'Staffel 1', IndexNumber: 1 }, { Id: 'SE2', Name: 'Staffel 2', IndexNumber: 2 }];
const mkEps = (season, n) => Array.from({ length: n }, (_, i) => ({ Id: `${season}-E${i + 1}`, Type: 'Episode', Name: `Folge ${i + 1}`, IndexNumber: i + 1, SeriesId: 'S1', SeasonId: season, RunTimeTicks: 600_000_000, UserData: {} }));

beforeEach(async () => {
  clearCache(); vi.clearAllMocks();
  window.ApiClient = { serverAddress: () => 'http://s', getCurrentUserId: () => 'u', accessToken: () => 't', serverId: () => 'srv' };
  document.documentElement.className = 'lfx-js';
  document.body.innerHTML = '';
  window.location.hash = '#/home';
  api.getItem.mockImplementation(async (id) => structuredClone({ S1: series, M1: movie }[id]));
  api.getSeasons.mockResolvedValue({ Items: seasons });
  api.getEpisodes.mockImplementation(async (_s, p) => ({ Items: mkEps(p.SeasonId, 4) }));
  api.getSimilar.mockResolvedValue({ Items: [] });
  api.getNextUp.mockResolvedValue({ Items: [] });
  await flush();
});
afterEach(() => { modal.unmount(); mobilenav.unmount(); document.documentElement.className = ''; vi.restoreAllMocks(); });

describe('Fokusrückgabe nach dem Info-Fenster', () => {
  const openFrom = async (focusVisible) => {
    document.body.insertAdjacentHTML('beforeend', '<div class="lfx-card" data-lfx-id="M1"><a class="lfx-card__link" href="#x">M1</a></div>');
    const link = document.querySelector('.lfx-card__link');
    link.focus();
    const orig = Element.prototype.matches;
    const spy = vi.spyOn(Element.prototype, 'matches').mockImplementation(function (q) { return q === ':focus-visible' ? focusVisible : orig.call(this, q); });
    await openModal('M1', { opener: link });
    await wait(() => document.querySelector('.lfx-modal__play'));
    spy.mockRestore();
    closeModal();
    await wait(() => !document.querySelector('.lfx-modal-overlay'));
    return link;
  };
  it('nach Mausbedienung bekommt der verbundene Opener keinen Fokus', async () => {
    const link = await openFrom(false);
    expect(document.activeElement).not.toBe(link);
  });
  it('nach Tastaturbedienung bekommt der Opener den Fokus zurück', async () => {
    const link = await openFrom(true);
    expect(document.activeElement).toBe(link);
  });
});

describe('offene Staffelliste', () => {
  it('Neuzeichnen durch Sammel-Gesehen ersetzt eine offene Staffelliste nicht', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    document.querySelector('.lfx-modal__round--played[data-scope="season"]').click();
    const conf = confirmAction.mock.calls.at(-1)[0];
    document.querySelector('.lfx-modal__seasonbtn').click();
    const list = document.querySelector('.lfx-modal__seasonlist');
    expect(list.hidden).toBe(false);
    await conf.onConfirm();
    await new Promise((r) => setTimeout(r, 450));
    expect(document.querySelector('.lfx-modal__seasonlist')).toBe(list);
    expect(list.hidden).toBe(false);
    // nach dem Schließen wird nachgezeichnet
    document.querySelector('.lfx-modal__seasonbtn').click();
    await wait(() => document.querySelector('.lfx-modal__seasonlist') !== list);
    expect(document.querySelector('.lfx-modal__seasonlist')).not.toBe(list);
  });
});

describe('Handy-Genreliste behält den Fokus beim Nachladen', () => {
  it('Fokus bleibt in der offenen Liste', async () => {
    document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
    document.documentElement.className = 'layout-mobile';
    window.innerWidth = 390;
    let res;
    getLibraryGenres.mockRejectedValueOnce(new Error('netz')).mockImplementation(() => new Promise((r) => { res = r; }));
    mobilenav.mount(parseHash('#/home?lfx=movies'));
    await vi.waitFor(() => expect(getLibraryGenres).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    document.querySelector('.lfx-mnav__pill--genre').click();
    await vi.waitFor(() => expect(getLibraryGenres).toHaveBeenCalledTimes(2));
    expect(document.activeElement.classList.contains('lfx-mnav-cats__link')).toBe(true);
    res([{ id: 'g1', name: 'Krimi' }]);
    await flush(); await flush();
    expect(document.activeElement.classList.contains('lfx-mnav-cats__link')).toBe(true);
    expect(document.querySelectorAll('.lfx-mnav-cats__link').length).toBe(2);
  });
});
