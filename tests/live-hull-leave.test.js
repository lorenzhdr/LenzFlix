// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const st = vi.hoisted(() => ({ theme: 'live', prev: 'flix', listeners: new Set(), setImpl: null }));

vi.mock('../src/js/core/theme.js', () => ({
  getPreviousTheme: () => st.prev,
  getTheme: () => st.theme,
  isTheme: (id) => st.theme === id,
  onThemeChange: (fn) => {
    st.listeners.add(fn);
    return () => st.listeners.delete(fn);
  },
  setTheme: vi.fn((id, o) => st.setImpl(id, o)),
}));
vi.mock('../src/js/core/api.js', () => ({ getAuth: () => ({ serverId: 'srv 1' }), isReady: () => true }));
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false }));

import { leaveToLibrary, targetHash } from '../src/js/features/live/leave.js';
import guard from '../src/js/features/live/guard.js';
import { setTheme } from '../src/js/core/theme.js';
import { parseHash } from '../src/js/core/router.js';

/** Setzt das Design und feuert onThemeChange wie core/theme.js. */
function applyTheme(id) {
  const previous = st.theme;
  st.theme = id;
  for (const fn of [...st.listeners]) fn({ theme: id, previous });
}

beforeEach(() => {
  st.theme = 'live';
  st.prev = 'flix';
  st.listeners.clear();
  st.setImpl = async (id) => { applyTheme(id); };
  setTheme.mockClear();
  window.location.hash = '#/home';
});
afterEach(() => {
  vi.useRealTimers();
});

describe('targetHash', () => {
  it('je Zieldesign', () => {
    expect(targetHash('flix', 'm1')).toBe('#/details?id=m1&serverId=srv%201');
    expect(targetHash('flix', 'e1', { seriesId: 's1' })).toBe('#/details?id=e1&serverId=srv%201'); // Folge direkt
    expect(targetHash('plus', 'e1', { seriesId: 's1' })).toBe('#/home?lfx=title&id=e1'); // Folge direkt
    expect(targetHash('prime', 'e1', { seriesId: 's1' })).toBe('#/home?lfx=title&id=s1');
    expect(targetHash('retro', 'e1', { seriesId: 's1' })).toBe('#/home?lfx=title&id=s1');
    expect(targetHash('store', 'e1', { seriesId: 's1' })).toBe('#/home?lfx=title&id=s1');
    expect(targetHash('store', 'm1')).toBe('#/home?lfx=title&id=m1');
    expect(targetHash('prime', null)).toBe('#/home');
    expect(targetHash('flix', null)).toBe('#/home');
  });
});

describe('leaveToLibrary', () => {
  it.each([
    ['flix', 'm1', {}, '#/details?id=m1&serverId=srv%201'],
    ['plus', 'm1', {}, '#/home?lfx=title&id=m1'],
    ['prime', 'e1', { type: 'Episode', seriesId: 's1' }, '#/home?lfx=title&id=s1'],
    ['retro', 'e1', { type: 'Episode', seriesId: 's1' }, '#/home?lfx=title&id=s1'],
    ['store', 'e1', { type: 'Episode', seriesId: 's1' }, '#/home?lfx=title&id=s1'],
    ['store', 'm1', { type: 'Movie' }, '#/home?lfx=title&id=m1'],
  ])('Zieldesign %s: Titel %s', async (prev, id, meta, hash) => {
    st.prev = prev;
    expect(await leaveToLibrary(id, meta)).toBe(true);
    expect(setTheme).toHaveBeenCalledWith(prev, { source: 'user' });
    expect(window.location.hash).toBe(hash);
  });

  it('ohne Titel: #/home', async () => {
    st.prev = 'prime';
    window.location.hash = '#/mypreferencesmenu';
    await leaveToLibrary(null);
    expect(window.location.hash).toBe('#/home');
    expect(st.theme).toBe('prime');
  });

  it('navigiert erst nach dem Design-Wechsel', async () => {
    st.prev = 'plus';
    let release;
    st.setImpl = (id) => new Promise((resolve) => { release = () => { applyTheme(id); resolve(); }; });
    const p = leaveToLibrary('m1', {});
    await Promise.resolve();
    await Promise.resolve();
    expect(window.location.hash).toBe('#/home'); // noch nicht navigiert
    expect(st.theme).toBe('live');
    release();
    await p;
    expect(window.location.hash).toBe('#/home?lfx=title&id=m1');
    expect(st.theme).toBe('plus');
  });

  it('wartet, bis getTheme() dem Ziel entspricht (setTheme meldet früher zurück)', async () => {
    st.prev = 'prime';
    st.setImpl = async (id) => { setTimeout(() => applyTheme(id), 20); };
    const p = leaveToLibrary('m1', {});
    await new Promise((r) => setTimeout(r, 5));
    expect(window.location.hash).toBe('#/home');
    expect(await p).toBe(true);
    expect(window.location.hash).toBe('#/home?lfx=title&id=m1');
  });

  it('Wächter leitet nach dem Wechsel nicht zurück auf #/home', async () => {
    st.prev = 'flix';
    const target = parseHash('#/details?id=m1&serverId=srv%201');
    expect(guard.match(target)).toBe(true); // vor dem Wechsel: Mediathek-Route wird umgeleitet
    await leaveToLibrary('m1', {});
    expect(st.theme).toBe('flix');
    expect(guard.match(parseHash(window.location.hash))).toBe(false);
  });

  it('Wechsel scheitert: keine Navigation, false', async () => {
    vi.useFakeTimers();
    st.prev = 'plus';
    st.setImpl = async () => {}; // Design bleibt live
    const p = leaveToLibrary('m1', {});
    await vi.advanceTimersByTimeAsync(3100);
    expect(await p).toBe(false);
    expect(window.location.hash).toBe('#/home');
    expect(st.listeners.size).toBe(0); // Listener aufgeräumt
  });

  it('setTheme wirft: keine Navigation', async () => {
    st.setImpl = async () => { throw new Error('kaputt'); };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await leaveToLibrary('m1', {})).toBe(false);
    expect(window.location.hash).toBe('#/home');
    warn.mockRestore();
  });
});
