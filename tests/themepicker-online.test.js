// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const online = vi.hoisted(() => ({ fn: null }));
vi.mock('../src/js/core/online.js', () => ({ fetchOnline: (s) => online.fn(s) }));
vi.mock('../src/js/core/api.js', () => ({ isReady: () => false, getUserId: () => 'u1', getItems: async () => ({ Items: [] }), imageUrlFor: () => '' }));
vi.mock('../src/js/core/charts.js', () => ({ getCharts: () => Promise.resolve(null) }));
vi.mock('../src/js/core/theme.js', () => ({
  THEMES: ['flix', 'store'],
  THEME_META: {
    flix: { id: 'flix', name: 'LENZFLIX', tagline: 'Klassisch', palette: [] },
    store: { id: 'store', name: 'VIDEOTHEK LENZ', tagline: 'Begehbare 3D-Videothek', palette: [] },
  },
  getChosenTheme: () => 'flix',
  getTheme: () => 'flix',
  getThemeState: () => 'active',
  setTheme: vi.fn(() => Promise.resolve()),
  onThemeChange: () => () => {},
}));

import { openThemePicker, closeThemePicker } from '../src/js/core/themepicker.js';

const store = () => document.querySelector('.lfx-tp__card[data-theme="store"]');
const pill = () => document.querySelector('.lfx-tp__online');
const flush = async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); };

describe('Online-Pille im Design-Menü', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.matchMedia = vi.fn(() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    vi.useFakeTimers();
  });
  afterEach(() => {
    closeThemePicker();
    vi.useRealTimers();
  });

  it('zeigt bei 3 „3 online“ mit aria-label, nur an der Kachel store', async () => {
    online.fn = vi.fn(async () => 3);
    openThemePicker();
    await flush();
    expect(pill().textContent).toBe('3 online');
    expect(pill().getAttribute('aria-label')).toBe('3 Personen gerade in der Videothek');
    expect(store().contains(pill())).toBe(true);
    expect(document.querySelectorAll('.lfx-tp__online')).toHaveLength(1);
    expect(store().getAttribute('aria-label')).toContain('3 Personen gerade in der Videothek');
  });

  it('Singular bei 1', async () => {
    online.fn = vi.fn(async () => 1);
    openThemePicker();
    await flush();
    expect(pill().getAttribute('aria-label')).toBe('1 Person gerade in der Videothek');
  });

  it.each([[0], [null]])('kein Badge bei %s', async (v) => {
    online.fn = vi.fn(async () => v);
    openThemePicker();
    await flush();
    expect(pill()).toBeNull();
  });

  it('kein Badge bei Fehler im Abruf', async () => {
    online.fn = vi.fn(async () => { throw new Error('x'); });
    openThemePicker();
    await flush();
    expect(pill()).toBeNull();
  });

  it('aktualisiert alle 30 s und entfernt das Badge bei 0', async () => {
    const seq = [2, 0];
    online.fn = vi.fn(async () => seq.shift() ?? 0);
    openThemePicker();
    await flush();
    expect(pill().textContent).toBe('2 online');
    await vi.advanceTimersByTimeAsync(30000);
    await flush();
    expect(online.fn).toHaveBeenCalledTimes(2);
    expect(pill()).toBeNull();
  });

  it('Schließen bricht Abruf ab, stoppt das Intervall und schreibt nichts mehr', async () => {
    let resolve;
    let sig;
    online.fn = vi.fn((s) => { sig = s; return new Promise((r) => { resolve = r; }); });
    openThemePicker();
    const card = store();
    closeThemePicker();
    expect(sig.aborted).toBe(true);
    resolve(5);
    await flush();
    expect(card.querySelector('.lfx-tp__online')).toBeNull();
    await vi.advanceTimersByTimeAsync(120000);
    expect(online.fn).toHaveBeenCalledTimes(1);
  });

  it('Online-Punkt nutzt eigene Klasse, plus-Vorschau-Punkte bleiben unberührt', async () => {
    online.fn = vi.fn(() => Promise.resolve(3));
    openThemePicker();
    await flush();
    expect(pill().querySelector('.lfx-tp__online-dot')).not.toBeNull();
    expect(pill().querySelector('.lfx-tp__dot')).toBeNull();
    const css = readFileSync(resolve(fileURLToPath(import.meta.url), '../../src/css/js-ui/themepicker.css'), 'utf8');
    for (const m of css.matchAll(/([^{}]*)\{[^{}]*(?:lfx-tp-online-pulse|box-shadow: 0 0 6px var\(--lfx-green\))[^{}]*\}/g)) {
      expect(m[1]).not.toContain('.lfx-tp__dot');
    }
  });
});
