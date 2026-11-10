// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const tv = { value: false };
vi.mock('../src/js/core/layout.js', () => ({ isTv: () => tv.value, isMobile: () => false, isModern: () => true }));
vi.mock('../src/js/core/itemmenu.js', () => ({
  openItemMenu: vi.fn(),
  isMenuOpen: vi.fn(() => false),
  startItemWatch: vi.fn(),
  stopItemWatch: vi.fn(),
}));

import * as menu from '../src/js/core/itemmenu.js';
import { putItems, clearItemStore } from '../src/js/core/itemstore.js';
import feature from '../src/js/features/contextmenu.js';

const route = { path: '/home' };

function ctx(target, init = {}) {
  const ev = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 50, ...init });
  target.dispatchEvent(ev);
  return ev;
}

function touch(type, target, x = 10, y = 10) {
  const ev = new Event(type, { bubbles: true, cancelable: true });
  const t = { clientX: x, clientY: y };
  ev.touches = type === 'touchend' || type === 'touchcancel' ? [] : [t];
  target.dispatchEvent(ev);
  return ev;
}

describe('contextmenu', () => {
  let card;
  let native;
  let ep1;
  let ep2;
  let list;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    tv.value = false;
    clearItemStore();
    document.body.innerHTML = '';
    card = document.createElement('div');
    card.className = 'lfx-card';
    card.dataset.lfxId = 'm1';
    card.dataset.lfxType = 'Movie';
    card.innerHTML = '<a class="lfx-card__link"></a>';
    native = document.createElement('div');
    native.className = 'card';
    native.dataset.id = 'n1';
    list = document.createElement('div');
    ep1 = document.createElement('div');
    ep1.className = 'lfx-modal__ep';
    ep1.dataset.lfxId = 'e1';
    ep2 = ep1.cloneNode();
    ep2.dataset.lfxId = 'e2';
    const other = document.createElement('span');
    list.append(ep1, other, ep2);
    document.body.append(card, native, list);
    feature.mount(route);
  });
  afterEach(() => {
    feature.unmount();
    vi.useRealTimers();
  });

  it('match: nicht auf TV und nicht auf Player-/Login-Routen', () => {
    expect(feature.match(route)).toBe(true);
    expect(feature.match({ path: '/video' })).toBe(false);
    expect(feature.match({ path: '/login' })).toBe(false);
    tv.value = true;
    expect(feature.match(route)).toBe(false);
  });

  it('mount startet den Item-Watch', () => {
    expect(menu.startItemWatch).toHaveBeenCalledTimes(1);
  });

  it('Rechtsklick auf .lfx-card öffnet das Menü mit Store-Item und Punkt-Anker', () => {
    const item = { Id: 'm1', Type: 'Movie', Name: 'Film' };
    putItems([item]);
    const ev = ctx(card.querySelector('a'));
    expect(ev.defaultPrevented).toBe(true);
    expect(menu.openItemMenu).toHaveBeenCalledWith(item, { x: 40, y: 50 }, {});
  });

  it('ohne Store-Eintrag: Minimal-Item', () => {
    ctx(card);
    expect(menu.openItemMenu.mock.calls[0][0]).toEqual({ Id: 'm1', Type: 'Movie' });
  });

  it('native Karte und andere Elemente: kein Eingriff', () => {
    expect(ctx(native).defaultPrevented).toBe(false);
    expect(ctx(document.body).defaultPrevented).toBe(false);
    expect(menu.openItemMenu).not.toHaveBeenCalled();
  });

  it('Shift lässt das Browser-Menü durch', () => {
    expect(ctx(card, { shiftKey: true }).defaultPrevented).toBe(false);
    expect(menu.openItemMenu).not.toHaveBeenCalled();
  });

  it('Episodenzeile übergibt siblings in DOM-Reihenfolge', () => {
    putItems([{ Id: 'e2', Type: 'Episode', Name: 'Zwei' }]);
    ctx(ep2);
    const [item, anchor, opts] = menu.openItemMenu.mock.calls[0];
    expect(item.Id).toBe('e2');
    expect(anchor).toEqual({ x: 40, y: 50 });
    expect(opts.siblings.map((s) => s.Id)).toEqual(['e1', 'e2']);
    expect(opts.siblings[0]).toEqual({ Id: 'e1', Type: 'Episode' });
    expect(opts.siblings[1].Name).toBe('Zwei');
  });

  it('Long-Press nach 500 ms öffnet mit Touch-Punkt', () => {
    touch('touchstart', card, 12, 34);
    vi.advanceTimersByTime(499);
    expect(menu.openItemMenu).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(menu.openItemMenu).toHaveBeenCalledTimes(1);
    expect(menu.openItemMenu.mock.calls[0][1]).toEqual({ x: 12, y: 34 });
  });

  it('Bewegung > 10 px, Tap, zweiter Finger und Scroll brechen ab', () => {
    touch('touchstart', card, 0, 0);
    touch('touchmove', card, 11, 0);
    vi.advanceTimersByTime(600);
    touch('touchstart', card, 0, 0);
    touch('touchmove', card, 5, 5);
    touch('touchend', card);
    vi.advanceTimersByTime(600);
    touch('touchstart', card, 0, 0);
    const second = new Event('touchstart', { bubbles: true });
    second.touches = [{ clientX: 0, clientY: 0 }, { clientX: 1, clientY: 1 }];
    card.dispatchEvent(second);
    vi.advanceTimersByTime(600);
    touch('touchstart', card, 0, 0);
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(600);
    expect(menu.openItemMenu).not.toHaveBeenCalled();
  });

  it('Klick nach dem Long-Press wird geschluckt, danach nicht mehr', () => {
    const seen = vi.fn();
    document.addEventListener('click', seen, true);
    touch('touchstart', card);
    vi.advanceTimersByTime(500);
    touch('touchend', card);
    const click = new MouseEvent('click', { bubbles: true, cancelable: true });
    card.dispatchEvent(click);
    expect(click.defaultPrevented).toBe(true);
    expect(seen).not.toHaveBeenCalled();
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(seen).toHaveBeenCalledTimes(1);
    document.removeEventListener('click', seen, true);
  });

  it('Klick nach Ablauf des Fensters wird nicht geschluckt', () => {
    const seen = vi.fn();
    document.addEventListener('click', seen, true);
    touch('touchstart', card);
    vi.advanceTimersByTime(500);
    touch('touchend', card);
    vi.advanceTimersByTime(800);
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(seen).toHaveBeenCalledTimes(1);
    document.removeEventListener('click', seen, true);
  });

  it('kurzer Tap: Klick bleibt unberührt', () => {
    const seen = vi.fn();
    document.addEventListener('click', seen, true);
    touch('touchstart', card);
    vi.advanceTimersByTime(100);
    touch('touchend', card);
    card.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    expect(seen).toHaveBeenCalledTimes(1);
    document.removeEventListener('click', seen, true);
  });

  it('Android: contextmenu direkt nach Long-Press öffnet nicht doppelt', () => {
    touch('touchstart', card);
    vi.advanceTimersByTime(500);
    const ev = ctx(card);
    expect(ev.defaultPrevented).toBe(true);
    expect(menu.openItemMenu).toHaveBeenCalledTimes(1);
  });

  it('unmount entfernt alles und stoppt den Watch', () => {
    touch('touchstart', card);
    feature.unmount();
    expect(menu.stopItemWatch).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(600);
    const ev = ctx(card);
    expect(ev.defaultPrevented).toBe(false);
    expect(menu.openItemMenu).not.toHaveBeenCalled();
    feature.mount(route);
  });
});
