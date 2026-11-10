// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { registerFeature, resetRouter } from '../src/js/core/router.js';
import { isModern, isTv, isMobile, initLayout, destroyLayout } from '../src/js/core/layout.js';

const root = document.documentElement;
beforeEach(() => {
  destroyLayout();
  root.className = '';
  document.body.innerHTML = '';
});

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('layout', () => {
  it('isModern über MuiAppBar-Header', () => {
    expect(isModern()).toBe(false);
    document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
    expect(isModern()).toBe(true);
  });

  it('isTv / isMobile', () => {
    root.classList.add('layout-tv');
    expect(isTv()).toBe(true);
    root.className = 'layout-mobile';
    expect(isMobile()).toBe(true);
  });

  it('setzt Klassen und reagiert auf html-class-Änderungen', async () => {
    document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
    initLayout();
    expect(root.classList.contains('lfx-js')).toBe(true);
    expect(root.classList.contains('lfx-modern')).toBe(true);
    expect(root.classList.contains('lfx-tv')).toBe(false);
    root.classList.add('layout-tv');
    await tick();
    expect(root.classList.contains('lfx-tv')).toBe(true);
    destroyLayout();
    expect(root.classList.contains('lfx-js')).toBe(false);
  });

  it('Resize über den Breakpoint wertet Features neu aus (entprellt), destroy entfernt Listener', () => {
    vi.useFakeTimers();
    const setW = (w) => Object.defineProperty(window, 'innerWidth', { configurable: true, value: w });
    try {
      const update = vi.fn();
      registerFeature({ name: 't', match: () => true, mount: () => {}, unmount: () => {}, update });
      setW(1200);
      initLayout();
      // Resize ohne Wechsel: kein Re-Eval
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(250);
      expect(update).not.toHaveBeenCalled();
      // Wechsel auf mobil: mehrere Events -> genau ein Re-Eval nach der Ruhezeit
      setW(500);
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(100);
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(150);
      expect(update).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(update).toHaveBeenCalledTimes(1);
      // destroy: Listener weg
      destroyLayout();
      setW(1200);
      window.dispatchEvent(new Event('resize'));
      vi.advanceTimersByTime(300);
      expect(update).toHaveBeenCalledTimes(1);
    } finally {
      resetRouter();
      vi.useRealTimers();
      setW(1024);
    }
  });

describe('layout: Design-Klassen', () => {
  it('destroyLayout entfernt alle lfx-theme-* Klassen inkl. lfx-theme-loading', () => {
    root.classList.add('lfx-theme-plus', 'lfx-theme-loading', 'lfx-theme-flix', 'andere');
    destroyLayout();
    expect(root.className).toBe('andere');
  });
});
});
