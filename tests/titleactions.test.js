// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  setFavorite: vi.fn(async () => ({})),
  setPlayed: vi.fn(async () => {}),
  getAuth: () => ({ address: 'http://srv', userId: 'u1', token: 't', serverId: 's' }),
  buildUrl: (p, q) => `http://srv${p}${q ? `?${new URLSearchParams(q)}` : ''}`,
}));
vi.mock('../src/js/core/sheet.js', () => ({ confirmAction: vi.fn() }));
vi.mock('../src/js/core/toast.js', () => ({ toast: vi.fn() }));
vi.mock('../src/js/core/download.js', () => ({ startDownload: vi.fn(async () => {}) }));
vi.mock('../src/js/core/itemmenu.js', () => ({ openItemMenu: vi.fn(() => true) }));
vi.mock('../src/js/features/modal/data.js', () => ({
  loadSeasons: vi.fn(async () => [{ Id: 'SE1' }]),
  loadEpisodes: vi.fn(async () => [
    { Id: 'E1', UserData: { Played: false } },
    { Id: 'E2', UserData: { Played: true } },
  ]),
  setLike: vi.fn(async () => {}),
}));

import * as api from '../src/js/core/api.js';
import { confirmAction } from '../src/js/core/sheet.js';
import { toast } from '../src/js/core/toast.js';
import { startDownload } from '../src/js/core/download.js';
import { openItemMenu } from '../src/js/core/itemmenu.js';
import * as data from '../src/js/features/modal/data.js';
import { getStoredItem } from '../src/js/core/itemstore.js';
import { togglePlayed, toggleFavorite, setLike, startDownloadFor, openTitleMenu } from '../src/js/shared/titleactions.js';

beforeEach(() => {
  vi.clearAllMocks();
  api.setPlayed.mockResolvedValue();
  api.setFavorite.mockResolvedValue({});
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));
});

describe('togglePlayed', () => {
  it('Film: setzt Gesehen, setzt Fortschritt zurück, Cache-Store aktualisiert', async () => {
    const it1 = { Id: 'M1', Type: 'Movie', UserData: { Played: false, PlaybackPositionTicks: 5, PlayedPercentage: 10 } };
    expect(await togglePlayed(it1)).toBe(true);
    expect(api.setPlayed).toHaveBeenCalledWith('M1', true);
    expect(it1.UserData.PlaybackPositionTicks).toBe(0);
    expect(it1.UserData.PlayedPercentage).toBeUndefined();
    expect(getStoredItem('M1')).toBe(it1);
  });

  it('Fehler: Rollback, Toast, alter Zustand', async () => {
    api.setPlayed.mockRejectedValue(new Error('x'));
    const it1 = { Id: 'M1', Type: 'Movie', UserData: { Played: true } };
    expect(await togglePlayed(it1)).toBe(true);
    expect(it1.UserData.Played).toBe(true);
    expect(toast).toHaveBeenCalledWith('Konnte nicht gespeichert werden');
  });

  it('Serie: Bestätigung, Bulk inkl. Nachziehen einzelner Folgen', async () => {
    confirmAction.mockImplementation(({ onConfirm }) => { onConfirm(); return undefined; });
    const s = { Id: 'S1', Type: 'Series', UserData: { Played: false } };
    expect(await togglePlayed(s, { anchorEl: document.body })).toBe(true);
    expect(confirmAction.mock.calls[0][0].title).toBe('2 Folgen als gesehen markieren?');
    expect(api.setPlayed).toHaveBeenCalledWith('S1', true);
    expect(api.setPlayed).toHaveBeenCalledWith('E1', true); // E2 war schon gesehen
    expect(api.setPlayed).not.toHaveBeenCalledWith('E2', true);
    expect(s.UserData.Played).toBe(true);
    expect(toast).toHaveBeenCalledWith('Serie als gesehen markiert');
  });

  it('Serie: Abbruch im Dialog lässt Zustand unverändert', async () => {
    confirmAction.mockImplementation(() => {
      const overlay = document.createElement('div');
      document.body.append(overlay);
      queueMicrotask(() => overlay.remove());
      return { overlay };
    });
    const s = { Id: 'S1', Type: 'Series', UserData: { Played: false } };
    expect(await togglePlayed(s)).toBe(false);
    expect(api.setPlayed).not.toHaveBeenCalled();
  });

  it('Staffel: nicht alle gesehen -> als gesehen markieren', async () => {
    confirmAction.mockImplementation(({ onConfirm }) => { onConfirm(); });
    const se = { Id: 'SE1', Type: 'Season', SeriesId: 'S1', UserData: {} };
    expect(await togglePlayed(se)).toBe(true);
    expect(data.loadEpisodes).toHaveBeenCalledWith('S1', 'SE1');
    expect(api.setPlayed).toHaveBeenCalledWith('SE1', true);
  });
});

describe('toggleFavorite', () => {
  it('schaltet um und Rollback bei Fehler', async () => {
    const it1 = { Id: 'M1', UserData: {} };
    expect(await toggleFavorite(it1)).toBe(true);
    expect(api.setFavorite).toHaveBeenCalledWith('M1', true);
    api.setFavorite.mockRejectedValue(new Error('x'));
    expect(await toggleFavorite(it1)).toBe(true);
    expect(it1.UserData.IsFavorite).toBe(true);
  });
});

describe('setLike', () => {
  it('Like ueber modal/data, Entfernen, Dislike per POST likes=false', async () => {
    const it1 = { Id: 'M1', UserData: {} };
    expect(await setLike(it1, true)).toBe(true);
    expect(data.setLike).toHaveBeenCalledWith('M1', true);
    expect(await setLike(it1, null)).toBeNull();
    expect(data.setLike).toHaveBeenLastCalledWith('M1', false);
    expect(await setLike(it1, false)).toBe(false);
    const [url, init] = fetch.mock.calls[0];
    expect(url).toContain('/Users/u1/Items/M1/Rating?likes=false');
    expect(init.method).toBe('POST');
    expect(it1.UserData.Likes).toBe(false);
  });

  it('Fehler: alter Wert', async () => {
    data.setLike.mockRejectedValueOnce(new Error('x'));
    const it1 = { Id: 'M1', UserData: { Likes: false } };
    expect(await setLike(it1, true)).toBe(false);
    expect(it1.UserData.Likes).toBe(false);
  });
});

describe('Download und Menü', () => {
  it('startDownloadFor / openTitleMenu delegieren', async () => {
    const a = document.createElement('button');
    const it1 = { Id: 'M1' };
    expect(await startDownloadFor(it1, { anchorEl: a })).toBe(true);
    expect(startDownload).toHaveBeenCalledWith(it1, a);
    startDownload.mockRejectedValueOnce(new Error('x'));
    expect(await startDownloadFor(it1)).toBe(false);
    expect(await openTitleMenu(it1, a)).toBe(true);
    expect(openItemMenu).toHaveBeenCalledWith(it1, a);
  });
});
