// @vitest-environment jsdom
// H023: Breitenwechsel bei offenem Picker schaltet Dialog <-> Bottom-Sheet um. H028: Fokus kehrt auch ohne returnFocus zurück.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ isReady: () => false, getUserId: () => 'u1', getItems: vi.fn(), imageUrlFor: () => null }));
vi.mock('../src/js/core/charts.js', () => ({ getCharts: () => Promise.resolve(null) }));
vi.mock('../src/js/core/theme.js', () => ({
  THEMES: ['flix', 'plus'],
  THEME_META: {
    flix: { id: 'flix', name: 'LENZFLIX', tagline: 'Klassisch', palette: ['#000', '#e50914', '#fff', '#333'] },
    plus: { id: 'plus', name: 'LENZ+', tagline: 'Magisch', palette: ['#0a1230', '#4f7bff', '#fff', '#000'] },
  },
  getChosenTheme: () => 'flix',
  getTheme: () => 'flix',
  getThemeState: () => 'active',
  setTheme: vi.fn(() => Promise.resolve()),
  onThemeChange: () => () => {},
}));

import { openThemePicker, closeThemePicker } from '../src/js/core/themepicker.js';

let narrow;
let listeners;
function setNarrow(v) {
  narrow = v;
  for (const l of [...listeners]) l({ matches: v });
}

beforeEach(() => {
  document.body.innerHTML = '<button id="opener">Design</button>';
  narrow = false;
  listeners = new Set();
  window.matchMedia = vi.fn(() => ({
    get matches() { return narrow; },
    addEventListener: (t, fn) => { if (t === 'change') listeners.add(fn); },
    removeEventListener: (t, fn) => { if (t === 'change') listeners.delete(fn); },
  }));
});
afterEach(() => {
  closeThemePicker();
  delete window.matchMedia;
  document.documentElement.className = '';
});

describe('Picker: Breitenwechsel (H023)', () => {
  it('Desktop -> schmal: Sheet-Klasse, Wisch-Schließen; zurück: wieder Dialog', () => {
    openThemePicker({});
    const mount = document.getElementById('lfx-themepicker');
    expect(mount.classList.contains('lfx-tp--sheet')).toBe(false);
    setNarrow(true);
    expect(mount.classList.contains('lfx-tp--sheet')).toBe(true);
    setNarrow(false);
    expect(mount.classList.contains('lfx-tp--sheet')).toBe(false);
  });

  it('Schließen meldet den Listener ab', () => {
    openThemePicker({});
    expect(listeners.size).toBe(1);
    closeThemePicker();
    expect(listeners.size).toBe(0);
  });
});

describe('Picker: Fokus-Rückgabe (H028)', () => {
  it('ohne returnFocus kehrt der Fokus zum vorher fokussierten Element zurück', () => {
    const opener = document.getElementById('opener');
    opener.focus();
    openThemePicker({});
    expect(document.activeElement).not.toBe(opener);
    closeThemePicker();
    expect(document.activeElement).toBe(opener);
  });

  it('ohne vorherigen Fokus bleibt es beim Body, kein Fehler', () => {
    openThemePicker({});
    closeThemePicker();
    expect(document.activeElement).toBe(document.body);
  });
});
