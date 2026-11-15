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
  isDataSaver, setDataSaver, syncDataSaver, destroyDataSaver, getDataSaverParts, setDataSaverPart,
  resetDataSaverParts, onDataSaverPartsChange, DATASAVER_PARTS, DATASAVER_PART_LABELS, FLASH_CLASS,
} from '../src/js/core/datasaver.js';
import { imageUrlFor } from '../src/js/core/api.js';

beforeEach(() => {
  vi.useFakeTimers();
  window.localStorage.clear();
  t.theme = 'flix';
  window.ApiClient = { getCurrentUserId: () => 'u1', serverAddress: () => 'http://srv', accessToken: () => 'tok', serverId: () => 'sid' };
  destroyDataSaver();
});
afterEach(() => {
  destroyDataSaver();
  delete window.ApiClient;
  vi.useRealTimers();
});

describe('Datensparmodus: Teilschalter', () => {
  it('Labels für alle Teile, Standard alle an', () => {
    for (const p of DATASAVER_PARTS) expect(typeof DATASAVER_PART_LABELS[p]).toBe('string');
    syncDataSaver();
    setDataSaver(true);
    for (const p of DATASAVER_PARTS) expect(isDataSaver(p)).toBe(true);
    expect(isDataSaver('unbekannt')).toBe(true);
  });

  it('abgeschalteter Teil: nur dieser Teil false, Gesamtschalter bleibt', () => {
    syncDataSaver();
    setDataSaver(true);
    setDataSaverPart('trailer', false);
    expect(isDataSaver('trailer')).toBe(false);
    expect(isDataSaver('hero')).toBe(true);
    expect(isDataSaver()).toBe(true);
    expect(getDataSaverParts().trailer).toBe(false);
    expect(JSON.parse(window.localStorage.getItem('lfx.datasaver.parts.u1'))).toEqual(['trailer']);
    setDataSaverPart('trailer', true);
    expect(window.localStorage.getItem('lfx.datasaver.parts.u1')).toBeNull();
  });

  it('Teil images steuert die Bild-Skala; Event und Abmelden', () => {
    syncDataSaver();
    setDataSaver(true);
    expect(imageUrlFor('x', { maxWidth: 300 })).toContain('maxWidth=200');
    const cb = vi.fn();
    const off = onDataSaverPartsChange(cb);
    setDataSaverPart('images', false);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0].images).toBe(false);
    expect(imageUrlFor('x', { maxWidth: 300 })).toContain('maxWidth=300');
    off();
    resetDataSaverParts();
    expect(cb).toHaveBeenCalledTimes(1);
    expect(imageUrlFor('x', { maxWidth: 300 })).toContain('maxWidth=200');
  });

  it('kaputtes JSON und unbekannte Teile werden ignoriert', () => {
    window.localStorage.setItem('lfx.datasaver.parts.u1', '{kaputt');
    syncDataSaver();
    setDataSaver(true);
    expect(isDataSaver('hero')).toBe(true);
    window.localStorage.setItem('lfx.datasaver.parts.u1', '["hero","xyz"]');
    expect(isDataSaver('hero')).toBe(false);
  });

  it('Aufleuchten nur beim Einschalten, 1200 ms', () => {
    syncDataSaver();
    expect(document.documentElement.classList.contains(FLASH_CLASS)).toBe(false);
    setDataSaver(true);
    expect(document.documentElement.classList.contains(FLASH_CLASS)).toBe(true);
    vi.advanceTimersByTime(1201);
    expect(document.documentElement.classList.contains(FLASH_CLASS)).toBe(false);
    setDataSaver(false);
    expect(document.documentElement.classList.contains(FLASH_CLASS)).toBe(false);
  });
});
