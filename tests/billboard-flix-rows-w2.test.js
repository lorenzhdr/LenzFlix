// @vitest-environment jsdom
// Billboard (flix): Fokus, Trailer-Sperren (Bewegung reduzieren, Hintergrund-PiP, Datensparmodus), Modal/Tab, Pool-Schrumpfen.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const ds = vi.hoisted(() => ({ on: false, subs: new Set() }));
vi.mock('../src/js/core/datasaver.js', () => ({
  isDataSaver: () => ds.on,
  onDataSaverChange: (cb) => { ds.subs.add(cb); return () => ds.subs.delete(cb); },
  onDataSaverPartsChange: () => () => {},
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
const im = vi.hoisted(() => ({ changed: null }));
vi.mock('../src/js/core/itemmenu.js', () => ({
  openItemMenu: vi.fn(),
  isMenuOpen: vi.fn(() => false),
  onItemsChanged: vi.fn((cb) => { im.changed = cb; return () => {}; }),
}));

import * as api from '../src/js/core/api.js';
import { loadLocalTrailer } from '../src/js/shared/trailer.js';
import { putItems } from '../src/js/core/itemstore.js';
import { render, ROTATE_MS } from '../src/js/features/billboard.js';
import { ROWS_READY_EVENT } from '../src/js/features/rows.js';
import { clearCache } from '../src/js/core/cache.js';

let slot;
let cleanup;
const title = () => slot.querySelector('.lfx-bb__logo')?.getAttribute('alt');

async function boot(extra = {}, n = 3) {
  api.getItems.mockImplementation(async (p) => ({ Items: p.SortBy === 'Random' ? items('r', n, extra) : items('n', n, extra) }));
  cleanup = render(slot);
  await vi.advanceTimersByTimeAsync(0);
}
/** Titelbild gilt als geladen, Zeilen als fertig. */
async function ready() {
  slot.querySelector('.lfx-bb__img').dispatchEvent(new Event('load'));
  document.dispatchEvent(new Event(ROWS_READY_EVENT));
  await vi.advanceTimersByTimeAsync(0);
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0.999);
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() => Promise.resolve());
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
  sessionStorage.clear();
  document.body.innerHTML = '<section id="s"></section>';
  document.documentElement.className = '';
  slot = document.getElementById('s');
  ds.on = false;
  ds.subs.clear();
  window.matchMedia = undefined;
  clearCache();
  loadLocalTrailer.mockClear();
  api.getItems.mockReset();
  window.ApiClient = { serverAddress: () => 'http://x', getCurrentUserId: () => 'u', accessToken: () => 't' };
});
afterEach(() => {
  if (cleanup) cleanup();
  cleanup = null;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('A035 Tastaturfokus hält die Rotation an', () => {
  it('rotiert nicht weg, solange ein Button Tastaturfokus hat', async () => {
    await boot();
    expect(title()).toBe('r0');
    const btn = slot.querySelector('.lfx-bb__btn--play');
    btn.focus();
    await vi.advanceTimersByTimeAsync(ROTATE_MS + 500);
    expect(title()).toBe('r0');
    expect(btn.isConnected).toBe(true);
    expect(document.activeElement).toBe(btn);
  });
});

describe('A033 Fokus nach Titel-Update', () => {
  it('Fokus bleibt auf dem gleichartigen neuen Button', async () => {
    await boot();
    const old = slot.querySelector('.lfx-bb__btn--info');
    old.focus();
    putItems([{ Id: 'r0', Name: 'r0', Type: 'Movie', UserData: { Played: true } }]);
    im.changed({ updated: ['r0'] });
    const now = slot.querySelector('.lfx-bb__btn--info');
    expect(now).not.toBe(old);
    expect(document.activeElement).toBe(now);
  });
});

describe('B042 Pool schrumpft auf 1', () => {
  it('alter Rotations-Timer blendet dieselbe Folie nicht neu über', async () => {
    await boot({}, 2);
    const ids = [...slot.querySelectorAll('.lfx-bb__dotbtn')].map((b) => b.getAttribute('aria-label').split(': ')[1]);
    expect(ids.length).toBeGreaterThan(1);
    im.changed({ removed: ids.slice(1) });
    const pic = slot.querySelector('.lfx-bb__pic');
    await vi.advanceTimersByTimeAsync(ROTATE_MS + 3000);
    expect(slot.querySelectorAll('.lfx-bb__pic').length).toBe(1);
    expect(slot.querySelector('.lfx-bb__pic')).toBe(pic);
  });
});

describe('B038 Bewegung reduzieren', () => {
  it('kein Auto-Trailer, data-lfx-tr bleibt leer', async () => {
    window.matchMedia = () => ({ matches: true });
    await boot({ LocalTrailerCount: 1 });
    expect(slot.dataset.lfxTr).toBeUndefined();
    await ready();
    await vi.advanceTimersByTimeAsync(1000);
    expect(loadLocalTrailer).not.toHaveBeenCalled();
    expect(slot.dataset.lfxTr).toBeUndefined();
  });
});

describe('B040 TV-Modus im Hintergrund-PiP', () => {
  it('Trailer startet nicht, solange das Hintergrund-PiP läuft, danach schon', async () => {
    const bg = document.createElement('div');
    bg.id = 'lfx-tvm-bg';
    bg.append(document.createElement('video'));
    document.body.append(bg);
    document.documentElement.classList.add('lfx-tvm-bgplay');
    await boot({ LocalTrailerCount: 1 });
    await ready();
    expect(loadLocalTrailer).not.toHaveBeenCalled();
    expect(slot.dataset.lfxTr).toBeUndefined();
    document.documentElement.classList.remove('lfx-tvm-bgplay');
    await vi.advanceTimersByTimeAsync(0);
    expect(loadLocalTrailer).toHaveBeenCalledTimes(1);
  });
});

describe('A031 Datensparmodus wieder aus', () => {
  it('startet den Trailer der aktuellen Folie nach dem Ausschalten', async () => {
    ds.on = true;
    await boot({ LocalTrailerCount: 1 });
    await ready();
    expect(loadLocalTrailer).not.toHaveBeenCalled();
    setSaver(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(loadLocalTrailer).toHaveBeenCalledTimes(1);
  });
});

describe('A034 Trailer hinter Info-Fenster', () => {
  it('pausiert bei lfx-modal-open und setzt danach fort', async () => {
    await boot({ LocalTrailerCount: 1 });
    await ready();
    const v = slot.querySelector('.lfx-bb__video');
    expect(v).toBeTruthy();
    v.dispatchEvent(new Event('canplaythrough'));
    await vi.advanceTimersByTimeAsync(3100);
    v.dispatchEvent(new Event('playing'));
    Object.defineProperty(v, 'paused', { value: false, configurable: true });
    const pause = HTMLMediaElement.prototype.pause;
    pause.mockClear();
    document.documentElement.classList.add('lfx-modal-open');
    await vi.advanceTimersByTimeAsync(0);
    expect(pause).toHaveBeenCalled();
    Object.defineProperty(v, 'paused', { value: true, configurable: true });
    const play = HTMLMediaElement.prototype.play;
    play.mockClear();
    document.documentElement.classList.remove('lfx-modal-open');
    await vi.advanceTimersByTimeAsync(0);
    expect(play).toHaveBeenCalled();
  });
});
