// @vitest-environment jsdom
// Billboard: ctx.pool (eigene Datenquelle/Schlüssel/firstKey), Teile des Datensparmodus. Ohne ctx = Startseite.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ds = vi.hoisted(() => ({ parts: {}, all: false, subs: new Set(), psubs: new Set() }));
vi.mock('../src/js/core/datasaver.js', () => ({
  isDataSaver: (part) => ds.all && (!part || ds.parts[part] !== false),
  onDataSaverChange: (cb) => { ds.subs.add(cb); return () => ds.subs.delete(cb); },
  onDataSaverPartsChange: (cb) => { ds.psubs.add(cb); return () => ds.psubs.delete(cb); },
}));
const mkItems = (prefix, n) => Array.from({ length: n }, (_, i) => ({
  Id: `${prefix}${i}`, Name: `${prefix}${i}`, Type: 'Movie', LocalTrailerCount: 1,
  ImageTags: { Logo: 'l', Primary: 'p' }, BackdropImageTags: ['b'],
}));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, getItems: vi.fn(), getJson: vi.fn(async () => []), getUserId: () => 'u' };
});
vi.mock('../src/js/shared/trailer.js', () => ({
  loadLocalTrailer: vi.fn(async () => ({ Id: 'tr1' })),
  trailerUrl: (id) => `http://x/Videos/${id}/stream.mp4`,
}));
vi.mock('../src/js/features/modal.js', () => ({ openModal: vi.fn() }));
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn() }));
vi.mock('../src/js/core/download.js', () => ({ canDownload: vi.fn(async () => false), startDownload: vi.fn(), isChooserOpen: vi.fn(() => false) }));
vi.mock('../src/js/core/itemmenu.js', () => ({ openItemMenu: vi.fn(), isMenuOpen: vi.fn(() => false), onItemsChanged: vi.fn(() => () => {}) }));

import * as api from '../src/js/core/api.js';
import { loadLocalTrailer } from '../src/js/shared/trailer.js';
import { render } from '../src/js/features/billboard.js';
import { clearCache, peekCached } from '../src/js/core/cache.js';

describe('billboard ctx', () => {
  let slot;
  const flush = async () => { await vi.advanceTimersByTimeAsync(0); };
  const dots = () => slot.querySelectorAll('.lfx-bb__dotbtn').length;
  const ready = async () => {
    slot.querySelector('.lfx-bb__img').dispatchEvent(new Event('load'));
    document.dispatchEvent(new Event('lfx:rows-ready'));
    await vi.advanceTimersByTimeAsync(0);
  };
  beforeEach(() => {
    ds.all = false; ds.parts = {}; ds.subs.clear(); ds.psubs.clear();
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
    sessionStorage.clear();
    document.body.innerHTML = '<section id="s"></section>';
    document.documentElement.className = '';
    slot = document.getElementById('s');
    clearCache();
    loadLocalTrailer.mockClear();
    api.getItems.mockReset();
    api.getItems.mockImplementation(async (p) => ({ Items: p.SortBy === 'Random' ? mkItems('r', 8) : mkItems('n', 6) }));
    window.ApiClient = { serverAddress: () => 'http://x', getCurrentUserId: () => 'u', accessToken: () => 't' };
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('ohne ctx.pool: Startseiten-Pool (getItems) und Rotationsschlüssel lfx-bb-first', async () => {
    const off = render(slot);
    await flush();
    expect(api.getItems).toHaveBeenCalledTimes(2);
    expect(dots()).toBe(12);
    expect(sessionStorage.getItem('lfx-bb-first')).toBeTruthy();
    off();
  });

  it('ctx ohne pool ({root}) verhält sich wie die Startseite', async () => {
    const off = render(slot, { root: document.body });
    await flush();
    expect(api.getItems).toHaveBeenCalledTimes(2);
    off();
  });

  it('ctx.pool: fetch, key und firstKey ersetzen die Startseite', async () => {
    const fetch = vi.fn(async () => mkItems('lib', 4));
    const pool = { key: 'lib:movies:billboard', fetch, firstKey: 'lfx-bb-first:movies' };
    const off = render(slot, { pool });
    await flush();
    expect(api.getItems).not.toHaveBeenCalled();
    expect(fetch).toHaveBeenCalledWith({ avoidFirstId: null });
    expect(dots()).toBe(4);
    expect(sessionStorage.getItem('lfx-bb-first:movies')).toBe('lib0');
    expect(sessionStorage.getItem('lfx-bb-first')).toBeNull();
    expect(peekCached('lib:movies:billboard')).toHaveLength(4);
    off();
    const off2 = render(slot, { pool });
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(dots()).toBe(4);
    off2();
  });

  it('ctx.pool: gespeicherter erster Titel wird als avoidFirstId übergeben; key als Getter', async () => {
    sessionStorage.setItem('fk', 'old');
    const fetch = vi.fn(async () => mkItems('lib', 3));
    const off = render(slot, { pool: { key: () => 'k2', fetch, firstKey: 'fk' } });
    await flush();
    expect(fetch).toHaveBeenCalledWith({ avoidFirstId: 'old' });
    expect(sessionStorage.getItem('fk')).toBe('lib0');
    expect(peekCached('k2')).toHaveLength(3);
    off();
  });

  it('ctx.pool leer: Slot versteckt, leerer Cache-Eintrag wird verworfen', async () => {
    const off = render(slot, { pool: { key: 'empty', fetch: async () => [] } });
    await flush();
    expect(slot.hidden).toBe(true);
    expect(peekCached('empty')).toBeUndefined();
    off();
  });

  describe('Teile des Datensparmodus', () => {
    it('Modus an, Teil trailer aus: Trailer läuft, Pool bleibt 5', async () => {
      ds.all = true; ds.parts = { trailer: false };
      const off = render(slot);
      await flush();
      expect(dots()).toBe(5);
      await ready();
      expect(loadLocalTrailer).toHaveBeenCalled();
      off();
    });

    it('Modus an, Teil hero aus: 12 Titel, aber kein Trailer', async () => {
      ds.all = true; ds.parts = { hero: false };
      const off = render(slot);
      await flush();
      expect(dots()).toBe(12);
      await ready();
      expect(loadLocalTrailer).not.toHaveBeenCalled();
      off();
    });

    it('Teile-Event: trailer einschalten baut das Video ab, hero einschalten kürzt den Pool', async () => {
      const off = render(slot);
      await flush();
      await ready();
      expect(slot.querySelector('.lfx-bb__video')).not.toBeNull();
      ds.all = true; ds.parts = { trailer: true, hero: false };
      ds.psubs.forEach((cb) => cb());
      expect(slot.querySelector('.lfx-bb__video')).toBeNull();
      expect(dots()).toBe(12);
      ds.parts = { trailer: true, hero: true };
      ds.psubs.forEach((cb) => cb());
      expect(dots()).toBe(5);
      off();
      expect(ds.psubs.size).toBe(0);
    });
  });
});
