// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const getItem = vi.fn();
vi.mock('../src/js/core/api.js', () => ({
  getAuth: () => ({ serverId: 'srv', address: 'http://x', token: 't', userId: 'u' }),
  getItem: (...a) => getItem(...a),
}));

import {
  openItemMenu,
  closeItemMenu,
  isMenuOpen,
  onItemsChanged,
  computeMenuPosition,
  startItemWatch,
  stopItemWatch,
} from '../src/js/core/itemmenu.js';

const item = { Id: 'i1', Type: 'Episode', MediaType: 'Video', ServerId: 'S1' };

function setupContainer() {
  document.body.innerHTML = '<div class="itemsContainer"><div class="card"></div></div>';
  return document.querySelector('.itemsContainer');
}
const flush = () => Promise.resolve().then(() => Promise.resolve());
function addDialog(withSheet = true) {
  const c = document.createElement('div');
  c.className = 'dialogContainer';
  if (withSheet) {
    c.innerHTML =
      '<div class="dialog actionSheet"><button class="actionSheetMenuItem" data-id="download">D</button><button class="actionSheetMenuItem" data-id="delete">Del</button></div>';
  }
  document.body.append(c);
  return c;
}

beforeEach(() => {
  vi.useFakeTimers();
  getItem.mockReset();
  document.body.innerHTML = '';
  document.documentElement.className = '';
  window.ApiClient = {};
});
afterEach(() => {
  closeItemMenu();
  vi.useRealTimers();
});

describe('openItemMenu', () => {
  it('baut Proxy mit Pflichtklassen/Attributen im Wrapper und klickt', () => {
    const container = setupContainer();
    let seen = null;
    container.addEventListener('click', (e) => {
      const t = e.target.closest('.itemAction');
      seen = t && { cls: t.className, ...t.dataset, wrap: t.parentNode.className };
    });
    expect(openItemMenu(item, { x: 10, y: 20 })).toBe(true);
    expect(seen.cls).toBe('lfx-proxy itemAction');
    expect(seen).toMatchObject({ action: 'menu', id: 'i1', serverid: 'S1', type: 'Episode', isfolder: 'false', mediatype: 'Video' });
    expect(seen.wrap).toBe('lfx-proxywrap itemsContainer');
    const wrap = container.querySelector('.lfx-proxywrap');
    expect(wrap.style.display).toBe('none');
    expect(isMenuOpen()).toBe(true);
  });

  it('Ordner-Typen: isfolder true; serverid-Fallback', () => {
    const container = setupContainer();
    let d = null;
    container.addEventListener('click', (e) => (d = { ...e.target.closest('.itemAction').dataset }));
    openItemMenu({ Id: 's', Type: 'Series' }, { x: 0, y: 0 });
    expect(d).toMatchObject({ isfolder: 'true', serverid: 'srv', mediatype: '' });
  });

  it('Geschwister-Proxys in Reihenfolge, Klick trifft den richtigen', () => {
    const container = setupContainer();
    const sib = [
      { Id: 'a', Type: 'Episode' },
      { Id: 'b', Type: 'Episode' },
      { Id: 'c', Type: 'Episode' },
    ];
    let clicked = null;
    container.addEventListener('click', (e) => (clicked = e.target.closest('.itemAction').dataset.id));
    openItemMenu(sib[1], { x: 0, y: 0 }, { siblings: sib });
    expect([...container.querySelectorAll('.lfx-proxy')].map((e) => e.dataset.id)).toEqual(['a', 'b', 'c']);
    expect(clicked).toBe('b');
  });

  it('setzt Marker-Klasse und Variablen', () => {
    setupContainer();
    openItemMenu(item, { x: 500, y: 100 });
    const root = document.documentElement;
    expect(root.classList.contains('lfx-menu-open')).toBe(true);
    expect(root.style.getPropertyValue('--lfx-menu-x')).toMatch(/px$/);
    expect(root.style.getPropertyValue('--lfx-menu-y')).toMatch(/px$/);
  });

  it('ohne Container: false und Toast', () => {
    expect(openItemMenu(item, { x: 0, y: 0 })).toBe(false);
    expect(document.querySelector('.lfx-toast__msg').textContent).toBe('Menü hier nicht verfügbar');
    expect(isMenuOpen()).toBe(false);
  });
});

describe('Sitzungsende', () => {
  it('fokussiert ersten erlaubten Eintrag und räumt Marker beim Entfernen des Sheets', async () => {
    setupContainer();
    openItemMenu(item, { x: 0, y: 0 });
    const d = addDialog();
    await flush();
    expect(document.activeElement.getAttribute('data-id')).toBe('delete');
    d.remove();
    await flush();
    expect(document.documentElement.classList.contains('lfx-menu-open')).toBe(false);
    expect(document.documentElement.style.getPropertyValue('--lfx-menu-x')).toBe('');
    expect(isMenuOpen()).toBe(true);
  });

  it('endet nicht beim ersten Entfernen, wenn binnen 800 ms ein Folgedialog erscheint', async () => {
    setupContainer();
    const onClose = vi.fn();
    openItemMenu(item, { x: 0, y: 0 }, { onClose });
    const d = addDialog();
    await flush();
    d.remove();
    await flush();
    vi.advanceTimersByTime(500);
    addDialog(false);
    await flush();
    vi.advanceTimersByTime(2000);
    expect(isMenuOpen()).toBe(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('endet nach 800 ms ohne Dialog, mit command', async () => {
    const container = setupContainer();
    const onClose = vi.fn();
    getItem.mockRejectedValue(new Error('LenzFlix API: HTTP 404 für x'));
    openItemMenu(item, { x: 0, y: 0 }, { onClose });
    const d = addDialog();
    await flush();
    d.querySelector('[data-id="delete"]').click();
    d.remove();
    await flush();
    vi.advanceTimersByTime(799);
    expect(isMenuOpen()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isMenuOpen()).toBe(false);
    expect(container.querySelector('.lfx-proxywrap')).toBeNull();
    expect(onClose).toHaveBeenCalledWith({ command: 'delete' });
  });

  it('4-s-Timeout, wenn kein Dialog erscheint', () => {
    const container = setupContainer();
    const onClose = vi.fn();
    openItemMenu(item, { x: 0, y: 0 }, { onClose });
    vi.advanceTimersByTime(3999);
    expect(isMenuOpen()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(isMenuOpen()).toBe(false);
    expect(container.querySelector('.lfx-proxywrap')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-menu-open')).toBe(false);
    expect(onClose).toHaveBeenCalledWith({ command: null });
  });

  it('Fokus geht zurück auf den Anker-Button', () => {
    setupContainer();
    const btn = document.createElement('button');
    document.body.append(btn);
    openItemMenu(item, btn);
    vi.advanceTimersByTime(4000);
    expect(document.activeElement).toBe(btn);
  });

  it('delete + getItem wirft: onItemsChanged meldet removed (+ Toast Gelöscht)', async () => {
    setupContainer();
    getItem.mockRejectedValue(new Error('LenzFlix API: HTTP 404 für /x'));
    const fn = vi.fn();
    onItemsChanged(fn);
    openItemMenu(item, { x: 0, y: 0 });
    const d = addDialog();
    await flush();
    d.querySelector('[data-id="delete"]').click();
    d.remove();
    await flush();
    await vi.advanceTimersByTimeAsync(800);
    expect(fn).toHaveBeenCalledWith({ removed: ['i1'], updated: [] });
    expect(document.querySelector('.lfx-toast__msg').textContent).toBe('Gelöscht');
    await vi.advanceTimersByTimeAsync(10000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('refresh: updated und Wiederholungen nach 1/3/8 s', async () => {
    setupContainer();
    getItem.mockResolvedValue({ Id: 'i1' });
    const fn = vi.fn();
    onItemsChanged(fn);
    openItemMenu(item, { x: 0, y: 0 });
    const d = addDialog();
    await flush();
    const entry = d.querySelector('[data-id="delete"]');
    entry.setAttribute('data-id', 'refresh');
    entry.click();
    d.remove();
    await flush();
    await vi.advanceTimersByTimeAsync(800);
    expect(fn).toHaveBeenCalledWith({ removed: [], updated: ['i1'] });
    await vi.advanceTimersByTimeAsync(9000);
    expect(getItem).toHaveBeenCalledTimes(4);
  });

  it('closeItemMenu räumt alles auf, ohne Nachladen', async () => {
    const container = setupContainer();
    const onClose = vi.fn();
    openItemMenu(item, { x: 0, y: 0 }, { onClose });
    closeItemMenu();
    expect(isMenuOpen()).toBe(false);
    expect(container.querySelector('.lfx-proxywrap')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-menu-open')).toBe(false);
    await vi.advanceTimersByTimeAsync(10000);
    expect(onClose).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
  });
});

describe('computeMenuPosition', () => {
  const vp = { w: 1000, h: 800 };
  const menu = { w: 300, h: 320 };
  it('unter dem Anker, rechte Kanten bündig', () => {
    const p = computeMenuPosition({ left: 600, right: 640, top: 100, bottom: 140 }, vp, menu);
    expect(p.x).toBe(340);
    expect(p.y).toBeGreaterThanOrEqual(140);
    expect(p.y).toBeLessThan(150);
  });
  it('über dem Anker, wenn unten kein Platz', () => {
    const p = computeMenuPosition({ left: 600, right: 640, top: 700, bottom: 740 }, vp, menu);
    expect(p.y + menu.h).toBeLessThanOrEqual(700);
  });
  it('klemmt am Viewport (8 px)', () => {
    expect(computeMenuPosition({ left: 0, right: 10, top: 0, bottom: 10 }, vp, menu).x).toBe(8);
    expect(computeMenuPosition({ left: 990, right: 1200, top: 0, bottom: 10 }, vp, menu).x).toBe(692);
  });
  it('Punkt-Anker', () => {
    const p = computeMenuPosition({ left: 500, right: 500, top: 300, bottom: 300 }, vp, menu);
    expect(p.x).toBe(500);
  });
});

describe('startItemWatch', () => {
  it('abonniert LibraryChanged, emittiert, meldet ab', () => {
    const unsub = vi.fn();
    let cb = null;
    window.ApiClient = {
      subscribe: vi.fn((types, fn) => {
        cb = fn;
        return unsub;
      }),
    };
    const fn = vi.fn();
    const off = onItemsChanged(fn);
    startItemWatch();
    startItemWatch();
    expect(window.ApiClient.subscribe).toHaveBeenCalledTimes(1);
    expect(window.ApiClient.subscribe.mock.calls[0][0]).toEqual(['LibraryChanged']);
    cb({ Data: { ItemsRemoved: ['a'], ItemsUpdated: ['b'] } });
    expect(fn).toHaveBeenCalledWith({ removed: ['a'], updated: ['b'] });
    cb({ Data: { ItemsAdded: ['z'] } });
    expect(fn).toHaveBeenCalledTimes(1);
    stopItemWatch();
    expect(unsub).toHaveBeenCalled();
    off();
  });

  it('ohne subscribe: kein Fehler', () => {
    window.ApiClient = {};
    expect(() => {
      startItemWatch();
      stopItemWatch();
    }).not.toThrow();
  });
});

function touch(target, type, x, y) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const list = [{ clientX: x, clientY: y, identifier: 0 }];
  e.touches = type === 'touchend' || type === 'touchcancel' ? [] : list;
  e.changedTouches = list;
  target.dispatchEvent(e);
  return e;
}
/** Abwaertsgeste mit Fake-Timern (Date.now + setTimeout muessen gefakt sein). */
function swipeDown(target, to = 200) {
  touch(target, 'touchstart', 50, 10);
  vi.advanceTimersByTime(100);
  touch(target, 'touchmove', 50, to / 2);
  vi.advanceTimersByTime(100);
  touch(target, 'touchmove', 50, to);
  touch(target, 'touchend', 50, to);
}

describe('Wischgeste am Action-Sheet', () => {
  let backSpy;
  beforeEach(() => {
    backSpy = vi.spyOn(history, 'back').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    delete window.matchMedia;
  });

  async function openWithSheet() {
    setupContainer();
    openItemMenu(item, { x: 0, y: 0 });
    const d = addDialog();
    await flush();
    return { d, sheet: d.querySelector('.dialog.actionSheet') };
  }

  it('Touch/schmal: Abwaertsgeste ruft history.back genau einmal', async () => {
    window.matchMedia = vi.fn((q) => ({ matches: !/reduced-motion/.test(q) }));
    const { sheet } = await openWithSheet();
    swipeDown(sheet);
    expect(sheet.classList.contains('lfx-dragging')).toBe(true);
    expect(backSpy).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(backSpy).toHaveBeenCalledTimes(1);
    swipeDown(sheet);
    vi.advanceTimersByTime(500);
    expect(backSpy).toHaveBeenCalledTimes(1);
  });

  it('Desktop (matchMedia false): nichts gebunden', async () => {
    window.matchMedia = vi.fn(() => ({ matches: false }));
    const { sheet } = await openWithSheet();
    swipeDown(sheet);
    vi.advanceTimersByTime(500);
    expect(sheet.classList.contains('lfx-dragging')).toBe(false);
    expect(sheet.style.transform).toBe('');
    expect(backSpy).not.toHaveBeenCalled();
  });

  it('Cleanup: nach Sitzungsende keine Drag-Klasse/Transform, Geste wirkungslos', async () => {
    window.matchMedia = vi.fn((q) => ({ matches: !/reduced-motion/.test(q) }));
    const { d, sheet } = await openWithSheet();
    touch(sheet, 'touchstart', 50, 10);
    touch(sheet, 'touchmove', 50, 60);
    expect(sheet.classList.contains('lfx-dragging')).toBe(true);
    d.remove();
    await flush();
    vi.advanceTimersByTime(800);
    expect(isMenuOpen()).toBe(false);
    expect(sheet.classList.contains('lfx-dragging')).toBe(false);
    expect(sheet.style.transform).toBe('');
    swipeDown(sheet);
    vi.advanceTimersByTime(500);
    expect(sheet.classList.contains('lfx-dragging')).toBe(false);
    expect(backSpy).not.toHaveBeenCalled();
  });
});
