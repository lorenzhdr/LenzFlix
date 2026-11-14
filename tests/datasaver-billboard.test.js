// @vitest-environment jsdom
// Datensparmodus im flix-Billboard: kein Trailer, Pool <= 5, Einschalten baut ein laufendes Video ab.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ds = vi.hoisted(() => ({ on: false, subs: new Set() }));
vi.mock('../src/js/core/datasaver.js', () => ({
  isDataSaver: () => ds.on,
  onDataSaverChange: (cb) => { ds.subs.add(cb); return () => ds.subs.delete(cb); },
}));
const setSaver = (v) => { ds.on = v; [...ds.subs].forEach((cb) => cb(v)); };

const items = (prefix, n, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({
    Id: `${prefix}${i}`, Name: `${prefix}${i}`, Type: 'Movie',
    ImageTags: { Logo: 'l', Primary: 'p' }, BackdropImageTags: ['b'], ...extra,
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
import { saverPool, SAVER_POOL } from '../src/js/features/billboard/format.js';
import { render, ROTATE_MS } from '../src/js/features/billboard.js';
import { clearCache } from '../src/js/core/cache.js';

describe('saverPool', () => {
  const pool = [...'abcdefgh'].map((Id) => ({ Id }));
  it('kürzt auf die ersten 5, kopiert kurze Pools', () => {
    expect(saverPool(pool).map((i) => i.Id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(SAVER_POOL).toBe(5);
    const short = pool.slice(0, 3);
    expect(saverPool(short)).toEqual(short);
    expect(saverPool(short)).not.toBe(short);
    expect(saverPool(null)).toEqual([]);
  });
  it('behält den aktuellen Titel (ersetzt den letzten Platz)', () => {
    expect(saverPool(pool, 'g').map((i) => i.Id)).toEqual(['a', 'b', 'c', 'd', 'g']);
    expect(saverPool(pool, 'b').map((i) => i.Id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('billboard im Datensparmodus', () => {
  let slot;
  const video = () => slot.querySelector('.lfx-bb__video');
  const dots = () => slot.querySelectorAll('.lfx-bb__dotbtn').length;
  const flush = async () => { await vi.advanceTimersByTimeAsync(0); };
  beforeEach(() => {
    ds.on = false;
    ds.subs.clear();
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
    api.getItems.mockImplementation(async (p) => ({
      Items: (p.SortBy === 'Random' ? items('r', 8) : items('n', 6)).map((it) => ({ ...it, LocalTrailerCount: 1 })),
    }));
    window.ApiClient = { serverAddress: () => 'http://x', getCurrentUserId: () => 'u', accessToken: () => 't' };
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  it('Standard (aus): 12 Titel und Trailer', async () => {
    const cleanup = render(slot);
    await flush();
    expect(dots()).toBe(12);
    slot.querySelector('.lfx-bb__img').dispatchEvent(new Event('load'));
    document.dispatchEvent(new Event('lfx:rows-ready'));
    await vi.advanceTimersByTimeAsync(0);
    expect(video()).not.toBeNull();
    cleanup();
  });

  it('an: höchstens 5 Titel (3 zufällige + 2 neue), kein Trailer, data-lfx-tr bleibt nicht auf wait', async () => {
    ds.on = true;
    const cleanup = render(slot);
    await flush();
    expect(dots()).toBe(5);
    expect(slot.dataset.lfxTr).toBeUndefined();
    slot.querySelector('.lfx-bb__img').dispatchEvent(new Event('load'));
    document.dispatchEvent(new Event('lfx:rows-ready'));
    await vi.advanceTimersByTimeAsync(ROTATE_MS - 1);
    expect(loadLocalTrailer).not.toHaveBeenCalled();
    expect(video()).toBeNull();
    // Rotation läuft trotz Trailer-Titel (kein Warten auf einen Trailer)
    await vi.advanceTimersByTimeAsync(2);
    expect(slot.querySelector('.lfx-bb__dotbtn.is-active')).toBe(slot.querySelectorAll('.lfx-bb__dotbtn')[1]);
    cleanup();
  });

  it('Einschalten baut ein laufendes Video ab (src leer, load, entfernt), Cover bleibt, Pool wird gekürzt, Rotation geht weiter', async () => {
    const cleanup = render(slot);
    await flush();
    slot.querySelector('.lfx-bb__img').dispatchEvent(new Event('load'));
    document.dispatchEvent(new Event('lfx:rows-ready'));
    await vi.advanceTimersByTimeAsync(0);
    const v = video();
    expect(v).not.toBeNull();
    v.dispatchEvent(new Event('playing'));
    expect(slot.querySelector('.lfx-bb').classList.contains('is-trailer')).toBe(true);
    HTMLMediaElement.prototype.load.mockClear();
    setSaver(true);
    expect(video()).toBeNull();
    expect(v.hasAttribute('src')).toBe(false);
    expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
    expect(slot.querySelector('.lfx-bb').classList.contains('is-trailer')).toBe(false);
    expect(slot.querySelector('.lfx-bb__pic')).not.toBeNull();
    expect(slot.dataset.lfxTr).toBeUndefined();
    expect(dots()).toBe(5);
    await vi.advanceTimersByTimeAsync(ROTATE_MS + 100);
    expect(slot.querySelector('.lfx-bb__dotbtn.is-active')).toBe(slot.querySelectorAll('.lfx-bb__dotbtn')[1]);
    cleanup();
    expect(ds.subs.size).toBe(0); // Abo abgemeldet
  });

  it('Einschalten, während der Trailer-Abruf noch läuft: danach kein Video', async () => {
    let release;
    loadLocalTrailer.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const cleanup = render(slot);
    await flush();
    slot.querySelector('.lfx-bb__img').dispatchEvent(new Event('load'));
    document.dispatchEvent(new Event('lfx:rows-ready'));
    await vi.advanceTimersByTimeAsync(0);
    setSaver(true);
    release({ Id: 'tr1' });
    await vi.advanceTimersByTimeAsync(0);
    expect(video()).toBeNull();
    expect(slot.dataset.lfxTr).toBeUndefined();
    cleanup();
  });
});
