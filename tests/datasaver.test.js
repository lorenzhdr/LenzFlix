// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const t = vi.hoisted(() => ({ theme: 'flix', listeners: new Set() }));
vi.mock('../src/js/core/theme.js', () => ({
  getTheme: () => t.theme,
  isTheme: (id) => t.theme === id,
  onThemeChange: (fn) => {
    t.listeners.add(fn);
    return () => t.listeners.delete(fn);
  },
}));

import {
  isDataSaverOn, isDataSaver, dataSaverAvailable, setDataSaver, toggleDataSaver, onDataSaverChange,
  syncDataSaver, destroyDataSaver, DATASAVER_CLASS, DATASAVER_EVENT,
} from '../src/js/core/datasaver.js';
import { imageUrlFor } from '../src/js/core/api.js';

let uid;
const setUid = (v) => {
  uid = v;
  window.ApiClient = { getCurrentUserId: () => uid, serverAddress: () => 'http://srv', accessToken: () => 'tok', serverId: () => 'sid' };
};
const setTheme = (id) => {
  t.theme = id;
  for (const fn of [...t.listeners]) fn(id);
};
const cls = () => document.documentElement.classList.contains(DATASAVER_CLASS);

beforeEach(() => {
  window.localStorage.clear();
  t.theme = 'flix';
  setUid('u1');
  destroyDataSaver();
});
afterEach(() => {
  destroyDataSaver();
  delete window.ApiClient;
});

describe('datasaver (Kern)', () => {
  it('Standard aus', () => {
    syncDataSaver();
    expect(isDataSaverOn()).toBe(false);
    expect(isDataSaver()).toBe(false);
    expect(cls()).toBe(false);
  });

  it('Wert pro Nutzer gespeichert', () => {
    setDataSaver(true);
    expect(window.localStorage.getItem('lfx.datasaver.u1')).toBe('1');
    setUid('u2');
    expect(isDataSaverOn()).toBe(false);
    setUid('u1');
    expect(isDataSaverOn()).toBe(true);
    expect(toggleDataSaver()).toBe(false);
    expect(window.localStorage.getItem('lfx.datasaver.u1')).toBe('0');
  });

  it('aktiv nur bei flix/plus/prime', () => {
    syncDataSaver();
    setDataSaver(true);
    for (const id of ['flix', 'plus', 'prime']) {
      setTheme(id);
      expect(dataSaverAvailable()).toBe(true);
      expect(isDataSaver()).toBe(true);
      expect(cls()).toBe(true);
    }
    for (const id of ['retro', 'store', 'live']) {
      setTheme(id);
      expect(dataSaverAvailable()).toBe(false);
      expect(isDataSaver()).toBe(false);
      expect(cls()).toBe(false);
      expect(isDataSaverOn()).toBe(true); // Wert bleibt gespeichert
    }
  });

  it('Klasse und Event nur bei echter Änderung von „aktiv“', () => {
    syncDataSaver();
    const seen = vi.fn();
    const off = onDataSaverChange(seen);
    setDataSaver(true);
    setDataSaver(true);
    expect(seen.mock.calls).toEqual([[true]]);
    expect(cls()).toBe(true);
    setDataSaver(false);
    setDataSaver(false);
    expect(seen.mock.calls).toEqual([[true], [false]]);
    expect(cls()).toBe(false);
    off();
    setDataSaver(true);
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it('Event trägt detail.active', () => {
    syncDataSaver();
    const fn = vi.fn();
    window.addEventListener(DATASAVER_EVENT, fn);
    setDataSaver(true);
    window.removeEventListener(DATASAVER_EVENT, fn);
    expect(fn.mock.calls[0][0].detail).toEqual({ active: true });
  });

  it('Design-Wechsel auf retro deaktiviert (Event, Klasse, Skala), Rückkehr aktiviert wieder', () => {
    syncDataSaver();
    setDataSaver(true);
    expect(imageUrlFor('x', { maxWidth: 300 })).toContain('maxWidth=200');
    const seen = vi.fn();
    onDataSaverChange(seen);
    setTheme('retro');
    expect(seen).toHaveBeenLastCalledWith(false);
    expect(cls()).toBe(false);
    expect(imageUrlFor('x', { maxWidth: 300 })).toContain('maxWidth=300');
    setTheme('plus');
    expect(seen).toHaveBeenLastCalledWith(true);
    expect(cls()).toBe(true);
  });

  it('Nutzer-Id kommt spät: erst anon, dann gespeicherter Wert 1 aktiviert den Modus', () => {
    window.localStorage.setItem('lfx.datasaver.u9', '1');
    setUid(null);
    syncDataSaver();
    expect(isDataSaver()).toBe(false);
    expect(cls()).toBe(false);
    const seen = vi.fn();
    onDataSaverChange(seen);
    setUid('u9');
    syncDataSaver();
    expect(seen).toHaveBeenCalledWith(true);
    expect(cls()).toBe(true);
    expect(imageUrlFor('x', { maxWidth: 400, maxHeight: 100 })).toMatch(/maxWidth=267.*maxHeight=67|maxHeight=67.*maxWidth=267/);
    // idempotent: kein zweites Event
    syncDataSaver();
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('destroy entfernt Klasse, Skala und Design-Abo; Wert bleibt', () => {
    syncDataSaver();
    setDataSaver(true);
    expect(t.listeners.size).toBe(1);
    destroyDataSaver();
    expect(cls()).toBe(false);
    expect(t.listeners.size).toBe(0);
    expect(imageUrlFor('x', { maxWidth: 300 })).toContain('maxWidth=300');
    expect(isDataSaverOn()).toBe(true);
  });
});
