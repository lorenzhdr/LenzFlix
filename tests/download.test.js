// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const getUser = vi.fn();
const getSeasons = vi.fn();
const getEpisodes = vi.fn();
vi.mock('../src/js/core/api.js', () => ({
  getAuth: () => ({ address: 'http://srv', token: 'TOK', userId: 'u', serverId: 's' }),
  getUser: (...a) => getUser(...a),
  getSeasons: (...a) => getSeasons(...a),
  getEpisodes: (...a) => getEpisodes(...a),
  getItem: vi.fn(),
}));

import {
  canDownload,
  downloadUrl,
  downloadItem,
  downloadMany,
  cancelDownloads,
  startDownload,
  openDownloadChooser,
  isChooserOpen,
  closeChooser,
} from '../src/js/core/download.js';

const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
};

let clicked;
const origClick = HTMLAnchorElement.prototype.click;
beforeEach(() => {
  vi.useFakeTimers();
  document.body.innerHTML = '';
  document.documentElement.className = '';
  clicked = [];
  window.ApiClient = { getItemDownloadUrl: (id) => `http://srv/Items/${id}/Download?api_key=SECRET` };
  window.matchMedia = vi.fn(() => ({ matches: false }));
  HTMLAnchorElement.prototype.click = function () {
    clicked.push({ href: this.getAttribute('href'), download: this.hasAttribute('download') });
  };
  getUser.mockReset().mockResolvedValue({ Policy: { EnableContentDownloading: true } });
  getSeasons.mockReset();
  getEpisodes.mockReset();
});
afterEach(() => {
  cancelDownloads();
  closeChooser();
  HTMLAnchorElement.prototype.click = origClick;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('canDownload', () => {
  it('Matrix', async () => {
    expect(await canDownload({ Type: 'Movie' })).toBe(true);
    expect(await canDownload({ Type: 'Movie', CanDownload: false })).toBe(false);
    expect(await canDownload({ Type: 'Series', CanDownload: false })).toBe(true);
    expect(await canDownload({ Type: 'Season' })).toBe(true);
    expect(await canDownload({ Type: 'BoxSet', IsFolder: true })).toBe(false);
    expect(await canDownload({ Type: 'Folder', IsFolder: true })).toBe(false);
    getUser.mockResolvedValue({ Policy: { EnableContentDownloading: false } });
    expect(await canDownload({ Type: 'Movie' })).toBe(false);
    expect(await canDownload({ Type: 'Series' })).toBe(false);
    getUser.mockResolvedValue(null);
    expect(await canDownload({ Type: 'Movie' })).toBe(false);
  });
});

describe('downloadUrl / downloadItem', () => {
  it('Fallback ohne getItemDownloadUrl', () => {
    window.ApiClient = {};
    expect(downloadUrl('x')).toBe('http://srv/Items/x/Download?api_key=TOK');
  });

  it('klickt Anker mit URL, entfernt ihn, loggt nichts', async () => {
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    await downloadItem({ Id: 'm1' });
    expect(clicked).toEqual([{ href: 'http://srv/Items/m1/Download?api_key=SECRET', download: true }]);
    expect(document.querySelector('a')).toBeNull();
    expect(document.querySelector('.lfx-toast__msg').textContent).toBe('Download gestartet');
    spies.forEach((s) => expect(s).not.toHaveBeenCalled());
  });
});

describe('downloadMany', () => {
  it('nacheinander im Abstand von 1 s', async () => {
    const p = downloadMany([{ Id: 'a' }, { Id: 'b' }, { Id: 'c' }]);
    expect(document.querySelector('.lfx-toast__msg').textContent).toBe('3 Downloads gestartet');
    expect(clicked).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(999);
    expect(clicked).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(clicked).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1000);
    expect(clicked).toHaveLength(3);
    await p;
  });

  it('cancelDownloads bricht ab', async () => {
    const p = downloadMany([{ Id: 'a' }, { Id: 'b' }]);
    cancelDownloads();
    await p;
    await vi.advanceTimersByTimeAsync(5000);
    expect(clicked).toHaveLength(1);
  });

  it('Touch: Hinweistext', () => {
    window.matchMedia = vi.fn(() => ({ matches: true }));
    downloadMany([{ Id: 'a' }, { Id: 'b' }]);
    expect(document.querySelector('.lfx-toast__msg').textContent).toBe(
      '2 Downloads gestartet – falls blockiert, bitte Episoden einzeln laden',
    );
  });
});

describe('Chooser', () => {
  const series = { Id: 'ser', Type: 'Series' };
  const seasons = {
    Items: [
      { Id: 's1', Name: 'Staffel 1' },
      { Id: 's2', Name: 'Staffel 2' },
    ],
  };
  const eps = {
    Items: [
      { Id: 'e1', SeasonId: 's1' },
      { Id: 'e2', SeasonId: 's1' },
      { Id: 'e3', SeasonId: 's2' },
      { Id: 'e4', SeasonId: 's2', CanDownload: false },
      { Id: 'e5', SeasonId: 's2', LocationType: 'Virtual' },
    ],
  };

  it('startDownload: Einzeltitel lädt direkt', async () => {
    await startDownload({ Id: 'm', Type: 'Movie' });
    expect(clicked).toHaveLength(1);
    expect(isChooserOpen()).toBe(false);
  });

  it('Einträge, Bestätigung, Download', async () => {
    getSeasons.mockResolvedValue(seasons);
    getEpisodes.mockResolvedValue(eps);
    const anchor = document.createElement('button');
    document.body.append(anchor);
    const pending = startDownload(series, anchor);
    await flush();
    await pending;
    expect(isChooserOpen()).toBe(true);
    const sheet = document.querySelector('#lfx-sheet.lfx-sheet-overlay > .lfx-sheet');
    expect(sheet.getAttribute('role')).toBe('dialog');
    expect(sheet.getAttribute('aria-modal')).toBe('true');
    expect(sheet.style.getPropertyValue('--lfx-sheet-x')).toMatch(/px$/);
    expect(document.documentElement.classList.contains('lfx-sheet-open')).toBe(true);
    const labels = [...sheet.querySelectorAll('.lfx-sheet__list button.lfx-sheet__item')].map((b) => b.textContent);
    expect(labels).toEqual(['Ganze Serie (3 Episoden)', 'Staffel 1 (2 Episoden)', 'Staffel 2 (1 Episode)']);
    expect(document.activeElement).toBe(sheet.querySelector('.lfx-sheet__item'));
    sheet.querySelectorAll('.lfx-sheet__item')[0].click();
    expect(sheet.querySelector('.lfx-sheet__title').textContent).toBe('3 Episoden herunterladen?');
    const primary = sheet.querySelector('.lfx-sheet__item--primary');
    expect(primary.textContent).toBe('Herunterladen');
    primary.click();
    expect(isChooserOpen()).toBe(false);
    expect(document.getElementById('lfx-sheet')).toBeNull();
    expect(clicked).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(clicked).toHaveLength(3);
  });

  it('Season geht direkt zur Bestätigung', async () => {
    getEpisodes.mockResolvedValue({ Items: [{ Id: 'e1' }, { Id: 'e2' }] });
    await openDownloadChooser({ Id: 's1', Type: 'Season', SeriesId: 'ser' });
    expect(document.querySelector('.lfx-sheet__title').textContent).toBe('2 Episoden herunterladen?');
    expect(getEpisodes).toHaveBeenCalledWith('ser', expect.objectContaining({ seasonId: 's1' }));
  });

  it('Escape schließt (ohne Weitergabe) und gibt Fokus zurück', async () => {
    getSeasons.mockResolvedValue(seasons);
    getEpisodes.mockResolvedValue(eps);
    const anchor = document.createElement('button');
    document.body.append(anchor);
    const other = vi.fn();
    document.addEventListener('keydown', other);
    await openDownloadChooser(series, anchor);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(isChooserOpen()).toBe(false);
    expect(other).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(anchor);
    expect(document.documentElement.classList.contains('lfx-sheet-open')).toBe(false);
    document.removeEventListener('keydown', other);
  });

  it('Klick auf Overlay schließt; Tab-Falle', async () => {
    getSeasons.mockResolvedValue(seasons);
    getEpisodes.mockResolvedValue(eps);
    await openDownloadChooser(series, null);
    const btns = [...document.querySelectorAll('.lfx-sheet__item')];
    btns[btns.length - 1].focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    document.activeElement.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(btns[0]);
    document.getElementById('lfx-sheet').click();
    expect(isChooserOpen()).toBe(false);
  });

  it('keine Episoden: Toast', async () => {
    getSeasons.mockResolvedValue(seasons);
    getEpisodes.mockResolvedValue({ Items: [{ Id: 'x', CanDownload: false }] });
    await openDownloadChooser(series, null);
    expect(isChooserOpen()).toBe(false);
    expect(document.querySelector('.lfx-toast__msg').textContent).toBe('Keine herunterladbaren Episoden');
  });
});
