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
import { confirmAction } from '../src/js/core/sheet.js';
import { clearCache } from '../src/js/core/cache.js';
import modal, { openModal } from '../src/js/features/modal.js';

const flush = () => new Promise((r) => setTimeout(r, 0));
const wait = async (fn, n = 40) => { for (let i = 0; i < n; i++) { if (fn()) return; await flush(); } };

const series = { Id: 'S1', Type: 'Series', Name: 'Serie', Overview: 'Text', ChildCount: 2, ProductionYear: 2020, Genres: ['Drama'], UserData: {} };
const other = { Id: 'S2', Type: 'Series', Name: 'Andere', ChildCount: 1, UserData: { Played: true } };
const movie = { Id: 'M1', Type: 'Movie', Name: 'Film', RunTimeTicks: 67_200_000_000, Width: 1920, ProductionYear: 2021, UserData: { PlaybackPositionTicks: 5 } };
const seasons = [{ Id: 'SE1', Name: 'Staffel 1', IndexNumber: 1 }, { Id: 'SE2', Name: 'Staffel 2', IndexNumber: 2 }];
const mkEps = (season, n) => Array.from({ length: n }, (_, i) => ({ Id: `${season}-E${i + 1}`, Type: 'Episode', Name: `Folge ${i + 1}`, IndexNumber: i + 1, SeriesId: 'S1', SeasonId: season, RunTimeTicks: 600_000_000, UserData: {} }));
const lastConfirm = () => confirmAction.mock.calls.at(-1)[0];
const deferred = () => { let res; const p = new Promise((r) => { res = r; }); return { p, res }; };

const played = new Set();

function setup() {
  window.ApiClient = { serverAddress: () => 'http://s', getCurrentUserId: () => 'u', accessToken: () => 't', serverId: () => 'srv' };
  document.documentElement.className = 'lfx-js';
  document.body.innerHTML = '';
  window.location.hash = '#/home';
  played.clear();
  api.getItem.mockImplementation(async (id) => structuredClone({ S1: series, S2: other, M1: movie }[id]));
  api.getSeasons.mockResolvedValue({ Items: seasons });
  api.getEpisodes.mockImplementation(async (_s, p) => ({
    Items: mkEps(p.SeasonId, p.SeasonId === 'SE1' ? 4 : 3).map((e) => ({ ...e, UserData: { Played: played.has(e.Id) } })),
  }));
  api.setPlayed.mockImplementation(async (id) => { played.add(id); });
  api.getSimilar.mockResolvedValue({ Items: [] });
  api.getNextUp.mockResolvedValue({ Items: [] });
}

beforeEach(async () => { clearCache(); vi.clearAllMocks(); setup(); await flush(); });
afterEach(() => { modal.unmount(); document.documentElement.className = ''; });

describe('Info-Fenster: Sammel-Gesehen nach Bestätigung', () => {
  it('Refresh während der Rückfrage: Folgenzeilen zeigen danach den neuen Gesehen-Stand', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    document.querySelector('.lfx-modal__round--played[data-scope="season"]').click();
    const conf = lastConfirm();
    const cb = onItemsChanged.mock.calls.at(-1)[0];
    vi.useFakeTimers();
    try { cb({ removed: [], updated: ['S1'] }); await vi.advanceTimersByTimeAsync(3000); } finally { vi.useRealTimers(); }
    await wait(() => document.querySelector('.lfx-modal__ep'));
    await conf.onConfirm();
    await flush();
    expect(document.querySelectorAll('.lfx-modal__ep.is-played').length).toBe(4);
  });

  it('Staffelwechsel während bulkPlayed: danach bleibt die gewählte Staffel sichtbar', async () => {
    await openModal('S1');
    await wait(() => document.querySelector('.lfx-modal__ep'));
    const d2 = deferred();
    api.getEpisodes.mockImplementation((_s, p) => (p.SeasonId === 'SE2' ? d2.p : Promise.resolve({
      Items: mkEps(p.SeasonId, 4).map((e) => ({ ...e, UserData: { Played: played.has(e.Id) } })),
    })));
    document.querySelector('.lfx-modal__seasonbtn').click();
    [...document.querySelectorAll('.lfx-modal__seasonopt')].find((o) => o.dataset.id === 'SE2').click();
    await flush();
    document.querySelector('.lfx-modal__round--played[data-scope="season"]').click();
    await lastConfirm().onConfirm();
    d2.res({ Items: mkEps('SE2', 3) });
    await flush(); await flush();
    expect(document.querySelector('.lfx-modal__ep').dataset.id).toBe('SE2-E1');
  });
});
