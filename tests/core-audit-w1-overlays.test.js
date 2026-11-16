// @vitest-environment jsdom
// Regressionen Audit w1/core-2: Popover (B032, A005, B031), Sheet (A007, B033), Ladebild (A015, A017), Wiedergabe-Rückfall (A010).
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

import { openPopover, closePopover, isPopoverOpen } from '../src/js/core/popover.js';
import { openSheet, renderSheet, closeChooser } from '../src/js/core/sheet.js';
import { show, destroy as destroyCover } from '../src/js/core/startcover.js';
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

const items = [{ key: 'x', label: 'Eins' }];
const tab = (shiftKey) => {
  const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
  window.dispatchEvent(e);
  return e;
};

describe('Popover', () => {
  it('B032: html-Klasse lfx-popover-open nur solange offen', () => {
    openPopover(document.getElementById('a'), { items });
    expect(document.documentElement.classList.contains('lfx-popover-open')).toBe(true);
    closePopover();
    expect(document.documentElement.classList.contains('lfx-popover-open')).toBe(false);
  });

  it('A005: Anker ohne vorheriges aria-expanded bekommt beim Schließen "false"', () => {
    const a = document.getElementById('a');
    openPopover(a, { items });
    closePopover();
    expect(a.getAttribute('aria-expanded')).toBe('false');
  });

  it('B031: unmount des Datensparmodus-Symbols schließt ein offenes Popover', () => {
    dsbtnFeature.mount();
    document.getElementById('lfx-ds-btn').click();
    expect(isPopoverOpen()).toBe(true);
    dsbtnFeature.unmount();
    expect(isPopoverOpen()).toBe(false);
    expect(document.documentElement.classList.contains('lfx-popover-open')).toBe(false);
  });
});

describe('Sheet', () => {
  it('A007: Shift+Tab auf dem Container springt zum letzten Eintrag', () => {
    const c = openSheet(null, 'T');
    renderSheet(c, 'T', [{ label: 'A', onClick: () => {} }, { label: 'B', onClick: () => {} }]);
    c.sheet.focus();
    expect(document.activeElement).toBe(c.sheet);
    const e = tab(true);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement.textContent).toBe('B');
  });

  it('B033: aria-label folgt dem sichtbaren Titel nach renderSheet', () => {
    const c = openSheet(null, 'Download');
    renderSheet(c, '12 Episoden herunterladen?', [{ label: 'Ja', onClick: () => {} }]);
    expect(c.sheet.getAttribute('aria-label')).toBe('12 Episoden herunterladen?');
  });
});

describe('Ladebild', () => {
  const movie = { Id: 'M1', Type: 'Movie', Name: 'Film' };

  it('A015: Ladebild übernimmt den Fokus vom verdeckten Auslöser', () => {
    document.getElementById('a').focus();
    show({ item: movie });
    expect(document.activeElement).toBe(document.getElementById('lfx-startcover'));
  });

  it('A017: show() nach Entfernen des Knotens (removeAllMounts) legt einen neuen an', () => {
    show({ item: movie });
    removeAllMounts();
    expect(document.getElementById('lfx-startcover')).toBeNull();
    show({ item: movie });
    expect(document.getElementById('lfx-startcover')).not.toBeNull();
  });
});

describe('Wiedergabe-Rückfall', () => {
  it('A010: Navigation auf anderen Titel bricht ab, kein Klick auf dessen Play-Knopf', async () => {
    const p = play({ Id: 'B', Type: 'Movie' }, { timeoutMs: 2000 });
    window.location.hash = '#/details?id=C&serverId=srv';
    document.body.insertAdjacentHTML('beforeend', '<div class="itemDetailPage"><div class="mainDetailButtons"><button class="btnPlay"></button></div></div>');
    const spy = vi.fn();
    document.querySelector('.btnPlay').addEventListener('click', spy);
    expect(await p).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });
  it('A010b: bereits vorhandene (alte) Detailseite wird nicht geklickt, neue Seite schon', async () => {
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
  it('A010c: Seite des gleichen Titels schon offen (Hash gleich) wird sofort geklickt', async () => {
    window.location.hash = '#/details?id=B&serverId=srv';
    document.body.insertAdjacentHTML('beforeend', '<div class="itemDetailPage"><div class="mainDetailButtons"><button class="btnPlay"></button></div></div>');
    const spy = vi.fn();
    document.querySelector('.btnPlay').addEventListener('click', spy);
    expect(await play({ Id: 'B', Type: 'Movie' }, { timeoutMs: 2000 })).toBe(true);
    expect(spy).toHaveBeenCalledTimes(1);
  });
  it('A010d: alte Seite ohne viewshow wird nach der Karenz geklickt (Seitenwiederverwendung)', async () => {
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
