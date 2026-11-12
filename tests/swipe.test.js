// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { attachSwipeClose } from '../src/js/core/swipe.js';

function touch(target, type, x, y, count = 1) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  const list = Array.from({ length: count }, (_, i) => ({ clientX: x + i * 10, clientY: y, identifier: i }));
  e.touches = type === 'touchend' || type === 'touchcancel' ? [] : list;
  e.changedTouches = list;
  target.dispatchEvent(e);
  return e;
}

describe('attachSwipeClose', () => {
  let el, list, onClose, detach;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    el = document.createElement('div');
    list = document.createElement('div');
    el.appendChild(list);
    document.body.appendChild(el);
    onClose = vi.fn();
  });

  afterEach(() => {
    if (detach) detach();
    detach = null;
    el.remove();
    vi.useRealTimers();
  });

  const attach = (o = {}) => {
    detach = attachSwipeClose(el, { onClose, reducedMotion: () => false, ...o });
    return detach;
  };

  function drag(target, y0, y1, ms = 400, x = 50) {
    touch(target, 'touchstart', x, y0);
    vi.advanceTimersByTime(ms / 2);
    touch(target, 'touchmove', x, (y0 + y1) / 2);
    vi.advanceTimersByTime(ms / 2);
    const mv = touch(target, 'touchmove', x, y1);
    touch(target, 'touchend', x, y1);
    return mv;
  }

  it('schliesst bei grossem Zug', () => {
    attach();
    const mv = drag(el, 10, 200);
    expect(mv.defaultPrevented).toBe(true);
    expect(el.classList.contains('lfx-dragging')).toBe(true);
    expect(el.style.transform).toBe('translateY(100%)');
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(250);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('federt bei kleinem Zug zurueck', () => {
    attach();
    drag(el, 10, 40, 600);
    expect(onClose).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(onClose).not.toHaveBeenCalled();
    expect(el.style.transform).toBe('');
    expect(el.style.transition).toBe('');
    expect(el.classList.contains('lfx-dragging')).toBe(false);
  });

  it('schliesst bei schneller kurzer Geste', () => {
    attach();
    drag(el, 10, 60, 40);
    vi.advanceTimersByTime(250);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignoriert horizontale Gesten', () => {
    attach();
    touch(el, 'touchstart', 10, 10);
    const mv = touch(el, 'touchmove', 200, 20);
    touch(el, 'touchmove', 300, 150);
    touch(el, 'touchend', 300, 150);
    expect(mv.defaultPrevented).toBe(false);
    expect(el.classList.contains('lfx-dragging')).toBe(false);
    vi.advanceTimersByTime(300);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignoriert Gesten nach oben', () => {
    attach();
    touch(el, 'touchstart', 10, 100);
    const mv = touch(el, 'touchmove', 10, 50);
    touch(el, 'touchmove', 10, 300);
    touch(el, 'touchend', 10, 300);
    expect(mv.defaultPrevented).toBe(false);
    vi.advanceTimersByTime(300);
    expect(onClose).not.toHaveBeenCalled();
    expect(el.style.transform).toBe('');
  });

  it('verhindert Start in gescrollter Liste, erlaubt aber die handleZone', () => {
    attach({ handleZone: 32 });
    Object.defineProperty(list, 'scrollTop', { value: 50, configurable: true });
    drag(list, 100, 300);
    vi.advanceTimersByTime(300);
    expect(onClose).not.toHaveBeenCalled();
    expect(el.classList.contains('lfx-dragging')).toBe(false);

    drag(list, 10, 300);
    vi.advanceTimersByTime(300);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('canStart=false verhindert den Start', () => {
    attach({ canStart: () => false });
    const mv = drag(el, 10, 300);
    vi.advanceTimersByTime(300);
    expect(mv.defaultPrevented).toBe(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('detach entfernt Listener, Klasse und Styles', () => {
    const d = attach();
    touch(el, 'touchstart', 10, 10);
    touch(el, 'touchmove', 10, 60);
    expect(el.classList.contains('lfx-dragging')).toBe(true);
    d();
    expect(el.classList.contains('lfx-dragging')).toBe(false);
    expect(el.style.transform).toBe('');
    expect(el.style.transition).toBe('');
    const e = touch(el, 'touchmove', 10, 120);
    expect(e.defaultPrevented).toBe(false);
    expect(() => d()).not.toThrow();
  });

  it('detach bricht den Schliess-Timer ab', () => {
    const d = attach();
    drag(el, 10, 200);
    d();
    vi.advanceTimersByTime(500);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('reducedMotion ruft onClose sofort', () => {
    attach({ reducedMotion: () => true });
    drag(el, 10, 200);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ignoriert Mehrfinger-Gesten', () => {
    attach();
    touch(el, 'touchstart', 10, 10, 2);
    const mv = touch(el, 'touchmove', 10, 200, 2);
    touch(el, 'touchend', 10, 200);
    expect(mv.defaultPrevented).toBe(false);
    vi.advanceTimersByTime(300);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ignoriert touchstart waehrend der Schliess-Animation', () => {
    attach();
    drag(el, 10, 200);
    const t0 = el.style.transform;
    touch(el, 'touchstart', 10, 10);
    const mv = touch(el, 'touchmove', 10, 100);
    expect(mv.defaultPrevented).toBe(false);
    expect(el.style.transform).toBe(t0);
  });

  it('setzt backdrop-opacity beim Ziehen und beim Zurueckfedern', () => {
    const bd = document.createElement('div');
    attach({ backdrop: bd });
    touch(el, 'touchstart', 10, 10);
    touch(el, 'touchmove', 10, 60);
    expect(Number(bd.style.opacity)).toBeLessThan(1);
    touch(el, 'touchend', 10, 60);
    vi.advanceTimersByTime(300);
    expect(bd.style.opacity).toBe('');
  });

  it('holdBackdrop: beim Schliessen wird der Hintergrund nicht aufgedeckt (Opacity bleibt)', () => {
    const bd = document.createElement('div');
    attach({ backdrop: bd, holdBackdrop: true });
    drag(el, 10, 200);
    expect(Number(bd.style.opacity)).toBeGreaterThan(0.3);
    expect(bd.style.opacity).not.toBe('0.3');
  });
});
