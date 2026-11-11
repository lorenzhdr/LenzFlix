// @vitest-environment jsdom
// VIDEOTHEK LENZ: Hinweis „Handy quer drehen“ im Hochformat (Banner, wegtippbar, nur im Laufmodus).
import { describe, it, expect } from 'vitest';
import { createRotateHint, isPortrait, ROTATE_TEXT } from '../src/js/store3d/ui/rotate.js';

function fakeWin(portrait) {
  const listeners = new Set();
  const winL = {};
  const mq = {
    get matches() { return state.portrait; },
    addEventListener: (t, fn) => listeners.add(fn),
    removeEventListener: (t, fn) => listeners.delete(fn),
  };
  const state = { portrait };
  return {
    state,
    listeners,
    winL,
    matchMedia: () => mq,
    addEventListener: (t, fn) => { winL[t] = fn; },
    removeEventListener: (t) => { delete winL[t]; },
    turn(p) { state.portrait = p; for (const fn of listeners) fn(); },
  };
}

function make(portrait = true, mode = 'play') {
  document.body.innerHTML = '';
  const host = document.createElement('div');
  document.body.appendChild(host);
  const win = fakeWin(portrait);
  const st = { mode };
  const r = createRotateHint(host, { getMode: () => st.mode, win });
  return { host, win, st, r, el: host.querySelector('.lfx-store-rotate') };
}

describe('Hochformat-Hinweis', () => {
  it('zeigt im Hochformat im Laufmodus den Text, im Querformat nicht', () => {
    const { r, el, win } = make(true);
    expect(el.textContent).toContain(ROTATE_TEXT);
    expect(r.visible).toBe(true);
    win.turn(false);
    expect(r.visible).toBe(false);
    win.turn(true);
    expect(r.visible).toBe(true);
  });

  it('ist außerhalb des Laufmodus (Laden, Pause, Hülle) ausgeblendet', () => {
    const { r, st } = make(true, 'boot');
    expect(r.visible).toBe(false);
    st.mode = 'play';
    r.update();
    expect(r.visible).toBe(true);
    st.mode = 'paused';
    r.update();
    expect(r.visible).toBe(false);
  });

  it('✕ schließt ihn für diesen Besuch, auch nach erneutem Drehen', () => {
    const { r, el, win } = make(true);
    el.querySelector('.lfx-store-rotate-close').click();
    expect(r.visible).toBe(false);
    expect(r.dismissed).toBe(true);
    win.turn(false);
    win.turn(true);
    expect(r.visible).toBe(false);
  });

  it('destroy entfernt Element und Listener', () => {
    const { r, host, win } = make(true);
    r.destroy();
    expect(host.querySelector('.lfx-store-rotate')).toBeNull();
    expect(win.listeners.size).toBe(0);
    expect(Object.keys(win.winL)).toHaveLength(0);
  });

  it('isPortrait: Fallback über Fensterseiten ohne matchMedia', () => {
    expect(isPortrait({ innerWidth: 390, innerHeight: 844 })).toBe(true);
    expect(isPortrait({ innerWidth: 844, innerHeight: 390 })).toBe(false);
  });
});
