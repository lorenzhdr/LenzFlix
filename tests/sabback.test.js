// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let theme = 'flix';
let width = 1200;
let tv = false;
vi.mock('../src/js/core/api.js', () => ({ isReady: () => true }));
vi.mock('../src/js/core/theme.js', () => ({ getTheme: () => theme, isTheme: (id) => id === theme }));
vi.mock('../src/js/core/layout.js', () => ({
  isTv: () => tv,
  isNarrow: () => width < 800,
  isNavCompact: () => width < 900,
}));

import sab, { goBack } from '../src/js/features/sabback.js';
import { parseHash } from '../src/js/core/router.js';
import { removeAllMounts } from '../src/js/core/dom.js';

const route = (h) => parseHash(h);
const root = document.documentElement;

beforeEach(() => {
  theme = 'flix';
  width = 1200;
  tv = false;
  root.className = 'lfx-js lfx-standalone';
  document.body.innerHTML = '';
});
afterEach(() => {
  sab.unmount();
  removeAllMounts();
  vi.restoreAllMocks();
});

describe('sabback match', () => {
  it('nur in Standalone', () => {
    root.classList.remove('lfx-standalone');
    expect(sab.match(route('#/details?id=1'))).toBe(false);
  });
  it('nicht auf der Startseite, aber auf Unterseiten', () => {
    expect(sab.match(route('#/home'))).toBe(false);
    expect(sab.match(route('#/'))).toBe(false);
    expect(sab.match(route('#/home?lfx=series'))).toBe(true);
    expect(sab.match(route('#/details?id=1'))).toBe(true);
    expect(sab.match(route('#/home?tab=1'))).toBe(true);
  });
  it('nie im Player, TV, TV-Modus, Anmeldung', () => {
    expect(sab.match(route('#/video'))).toBe(false);
    document.body.innerHTML = '<div id="videoOsdPage"></div>';
    expect(sab.match(route('#/details?id=1'))).toBe(false);
    document.body.innerHTML = '';
    expect(sab.match(route('#/home?lfx=tv'))).toBe(false);
    expect(sab.match(route('#/login.html'))).toBe(false);
    tv = true;
    expect(sab.match(route('#/details?id=1'))).toBe(false);
  });
  it('flix: ab 900 px', () => {
    width = 899;
    expect(sab.match(route('#/details?id=1'))).toBe(false);
    width = 900;
    expect(sab.match(route('#/details?id=1'))).toBe(true);
  });
  it('plus/prime: ab 800 px', () => {
    for (const t of ['plus', 'prime']) {
      theme = t;
      width = 799;
      expect(sab.match(route('#/details?id=1'))).toBe(false);
      width = 800;
      expect(sab.match(route('#/details?id=1'))).toBe(true);
    }
  });
  it('retro: immer; store: nie', () => {
    theme = 'retro';
    width = 390;
    expect(sab.match(route('#/details?id=1'))).toBe(true);
    theme = 'store';
    width = 1400;
    expect(sab.match(route('#/details?id=1'))).toBe(false);
  });
});

describe('sabback mount und Klick', () => {
  it('legt Knopf mit aria-label an und räumt auf', () => {
    sab.mount();
    const b = document.getElementById('lfx-sab-back');
    expect(b.getAttribute('aria-label')).toBe('Zurück');
    sab.unmount();
    expect(document.getElementById('lfx-sab-back')).toBeNull();
    expect(root.classList.contains('lfx-sab-on')).toBe(false); // Klasse entfällt (kein CSS nutzte sie)
  });
  it('Klick: history.back() bei Verlauf', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(3);
    sab.mount();
    document.getElementById('lfx-sab-back').click();
    expect(back).toHaveBeenCalledTimes(1);
  });
  it('Klick ohne Verlauf: #/home', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    vi.spyOn(window.history, 'length', 'get').mockReturnValue(1);
    window.location.hash = '#/details?id=1';
    goBack();
    expect(back).not.toHaveBeenCalled();
    expect(window.location.hash).toBe('#/home');
  });
  it('Verlaufsindex 0: back() ohne Hash-Wechsel → nach 450 ms Rückfall #/home', () => {
    vi.useFakeTimers();
    try {
      const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
      vi.spyOn(window.history, 'length', 'get').mockReturnValue(3);
      window.location.hash = '#/details?id=1';
      goBack();
      expect(back).toHaveBeenCalledTimes(1);
      expect(window.location.hash).toBe('#/details?id=1');
      vi.advanceTimersByTime(500);
      expect(window.location.hash).toBe('#/home');
    } finally { vi.useRealTimers(); }
  });
  it('back() mit Hash-Wechsel: kein Rückfall', () => {
    vi.useFakeTimers();
    try {
      vi.spyOn(window.history, 'back').mockImplementation(() => { window.location.hash = '#/movies'; });
      vi.spyOn(window.history, 'length', 'get').mockReturnValue(3);
      window.location.hash = '#/details?id=1';
      goBack();
      vi.advanceTimersByTime(500);
      expect(window.location.hash).toBe('#/movies');
    } finally { vi.useRealTimers(); }
  });
});
