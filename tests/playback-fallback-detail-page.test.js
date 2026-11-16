// @vitest-environment jsdom
// Wiedergabe-Rückfall über die Detailseite: nur die richtige, neue Seite wird geklickt.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const themeState = vi.hoisted(() => ({ id: 'flix' }));
vi.mock('../src/js/core/theme.js', () => ({
  getTheme: () => themeState.id,
  isTheme: (id) => themeState.id === id,
  onThemeChange: () => () => {},
}));
vi.mock('../src/js/core/api.js', async (orig) => ({
  ...(await orig()),
  isReady: () => true,
  setImageScale: vi.fn(),
}));
vi.mock('../src/js/core/themepicker.js', () => ({ openThemePicker: vi.fn() }));

import { closePopover } from '../src/js/core/popover.js';
import { closeChooser } from '../src/js/core/sheet.js';
import { destroy as destroyCover } from '../src/js/core/startcover.js';
import { play } from '../src/js/core/playback.js';
import dsbtnFeature from '../src/js/features/dsbtn.js';
import { removeAllMounts } from '../src/js/core/dom.js';

beforeEach(() => {
  window.ApiClient = { serverAddress: () => 'http://s', getCurrentUserId: () => 'u', accessToken: () => 'secret', serverId: () => 'srv' };
  document.documentElement.className = 'lfx-js';
  document.body.innerHTML = '<button id="a">Anker</button>';
  window.matchMedia = vi.fn(() => ({ matches: false }));
  window.location.hash = '#/home';
  themeState.id = 'flix';
});
afterEach(() => {
  closePopover();
  closeChooser();
  destroyCover();
  dsbtnFeature.unmount();
  removeAllMounts();
});

describe('Wiedergabe-Rückfall', () => {
  it('Navigation auf anderen Titel bricht ab, kein Klick auf dessen Play-Knopf', async () => {
    const p = play({ Id: 'B', Type: 'Movie' }, { timeoutMs: 2000 });
    window.location.hash = '#/details?id=C&serverId=srv';
    document.body.insertAdjacentHTML('beforeend', '<div class="itemDetailPage"><div class="mainDetailButtons"><button class="btnPlay"></button></div></div>');
    const spy = vi.fn();
    document.querySelector('.btnPlay').addEventListener('click', spy);
    expect(await p).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
  it('bereits vorhandene (alte) Detailseite wird nicht geklickt, neue Seite schon', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div class="itemDetailPage" id="old"><div class="mainDetailButtons"><button class="btnPlay"></button></div></div>');
    const oldSpy = vi.fn();
    document.querySelector('#old .btnPlay').addEventListener('click', oldSpy);
    const p = play({ Id: 'B', Type: 'Movie' }, { timeoutMs: 2000 });
    await new Promise((r) => setTimeout(r, 400));
    expect(oldSpy).not.toHaveBeenCalled();
    document.body.insertAdjacentHTML('beforeend', '<div class="itemDetailPage" id="new"><div class="mainDetailButtons"><button class="btnPlay"></button></div></div>');
    const newSpy = vi.fn();
    document.querySelector('#new .btnPlay').addEventListener('click', newSpy);
    expect(await p).toBe(true);
    expect(newSpy).toHaveBeenCalledTimes(1);
    expect(oldSpy).not.toHaveBeenCalled();
  });
  it('Seite des gleichen Titels schon offen (Hash gleich) wird sofort geklickt', async () => {
    window.location.hash = '#/details?id=B&serverId=srv';
    document.body.insertAdjacentHTML('beforeend', '<div class="itemDetailPage"><div class="mainDetailButtons"><button class="btnPlay"></button></div></div>');
    const spy = vi.fn();
    document.querySelector('.btnPlay').addEventListener('click', spy);
    expect(await play({ Id: 'B', Type: 'Movie' }, { timeoutMs: 2000 })).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('alte Seite ohne viewshow wird nach der Karenz geklickt (Seitenwiederverwendung)', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div class="itemDetailPage"><div class="mainDetailButtons"><button class="btnPlay"></button></div></div>');
    const spy = vi.fn();
    document.querySelector('.btnPlay').addEventListener('click', spy);
    const p = play({ Id: 'B', Type: 'Movie' }, { timeoutMs: 2000 });
    await new Promise((r) => setTimeout(r, 400));
    expect(spy).not.toHaveBeenCalled();
    expect(await p).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

