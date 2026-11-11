// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const themeState = vi.hoisted(() => ({ chosen: 'flix', listeners: new Set(), setImpl: null }));

vi.mock('../src/js/core/theme.js', () => ({
  THEMES: ['flix', 'plus', 'prime', 'store'],
  THEME_META: {
    flix: { id: 'flix', name: 'LENZFLIX', tagline: 'Klassisch', palette: ['#000', '#e50914', '#fff', '#333'] },
    plus: { id: 'plus', name: 'LENZ+', tagline: 'Magisch', palette: ['#0a1230', '#4f7bff', '#fff', '#000'] },
    prime: { id: 'prime', name: 'LENZPRIME', tagline: 'Kinoabend', palette: ['#0f171e', '#1a98ff', '#fff', '#000'] },
    store: { id: 'store', name: 'VIDEOTHEK LENZ', tagline: 'Begehbare 3D-Videothek', palette: ['#0d1330', '#ffd23f', '#ff3d7f', '#2446a8'] },
  },
  getChosenTheme: () => themeState.chosen,
  setTheme: vi.fn((id) => themeState.setImpl(id)),
  onThemeChange: (fn) => {
    themeState.listeners.add(fn);
    return () => themeState.listeners.delete(fn);
  },
}));

import { openThemePicker, closeThemePicker, isThemePickerOpen, destroyThemePicker } from '../src/js/core/themepicker.js';
import { setTheme } from '../src/js/core/theme.js';

const key = (k, opts = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
const card = (id) => document.querySelector(`.lfx-tp__card[data-theme="${id}"]`);

function mockMedia(matches) {
  window.matchMedia = vi.fn(() => ({ matches, addEventListener() {}, removeEventListener() {} }));
}

describe('themepicker', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="opener">Mehr</button>';
    themeState.chosen = 'flix';
    themeState.listeners.clear();
    themeState.setImpl = (id) => {
      themeState.chosen = id;
      return Promise.resolve();
    };
    setTheme.mockClear();
    mockMedia(false);
  });
  afterEach(() => {
    closeThemePicker();
    delete window.matchMedia;
    document.documentElement.className = '';
  });

  it('öffnet als Dialog, fokussiert die aktive Karte, schließt mit Fokus-Rückgabe', () => {
    const opener = document.getElementById('opener');
    openThemePicker({ returnFocus: opener });
    expect(isThemePickerOpen()).toBe(true);
    const mount = document.getElementById('lfx-themepicker');
    expect(mount.parentElement).toBe(document.body);
    expect(document.documentElement.classList.contains('lfx-themepicker-open')).toBe(true);
    const dlg = mount.querySelector('[role="dialog"]');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dlg.getAttribute('aria-labelledby')).textContent).toBe('Design');
    expect(mount.classList.contains('lfx-tp--sheet')).toBe(false);
    expect(document.querySelectorAll('.lfx-tp__card').length).toBe(4);
    expect(card('store').querySelector('.lfx-tp__beta').textContent).toBe('Beta');
    expect(card('store').querySelector('.lfx-tp__preview--store .lfx-tp__shopsign').textContent).toBe('VIDEOTHEK LENZ');
    expect(card('plus').querySelector('.lfx-tp__beta').textContent).toBe('Beta');
    expect(card('flix').querySelector('.lfx-tp__beta')).toBeNull();
    expect(document.activeElement).toBe(card('flix'));
    closeThemePicker();
    expect(isThemePickerOpen()).toBe(false);
    expect(document.getElementById('lfx-themepicker')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-themepicker-open')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('aktive Karte markiert (aria-pressed, Label)', () => {
    themeState.chosen = 'plus';
    openThemePicker();
    expect(card('plus').getAttribute('aria-pressed')).toBe('true');
    expect(card('flix').getAttribute('aria-pressed')).toBe('false');
    expect(card('plus').textContent).toContain('Aktiv');
    expect(document.activeElement).toBe(card('plus'));
  });

  it('Escape, Overlay-Klick und × schließen', () => {
    openThemePicker();
    key('Escape');
    expect(isThemePickerOpen()).toBe(false);
    openThemePicker();
    document.getElementById('lfx-themepicker').click();
    expect(isThemePickerOpen()).toBe(false);
    openThemePicker();
    document.querySelector('.lfx-tp__dialog').click();
    expect(isThemePickerOpen()).toBe(true);
    document.querySelector('.lfx-tp__close').click();
    expect(isThemePickerOpen()).toBe(false);
  });

  it('Fokusfalle: Tab am Ende springt an den Anfang und umgekehrt', () => {
    openThemePicker();
    const btns = [...document.querySelectorAll('.lfx-tp__dialog button')];
    const first = btns[0];
    const last = btns.at(-1);
    last.focus();
    key('Tab');
    expect(document.activeElement).toBe(first);
    first.focus();
    key('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('Klick ruft setTheme, zeigt Ladezustand, Markierung folgt, nach Erfolg schließt der Dialog', async () => {
    let resolve;
    themeState.setImpl = () => new Promise((r) => { resolve = r; });
    openThemePicker();
    card('plus').click();
    expect(setTheme).toHaveBeenCalledWith('plus', { source: 'user' });
    expect(card('plus').getAttribute('aria-busy')).toBe('true');
    expect(isThemePickerOpen()).toBe(true); // während des Ladens offen
    themeState.chosen = 'plus';
    for (const fn of themeState.listeners) fn({ theme: 'plus', previous: 'flix' });
    expect(card('plus').getAttribute('aria-pressed')).toBe('true');
    expect(card('flix').getAttribute('aria-pressed')).toBe('false');
    resolve();
    await vi.waitFor(() => expect(isThemePickerOpen()).toBe(false));
    expect(document.getElementById('lfx-themepicker')).toBeNull();
  });

  it('Fehler: Markierung bleibt bei der alten Auswahl', async () => {
    themeState.setImpl = () => Promise.reject(new Error('x'));
    openThemePicker();
    card('prime').click();
    await vi.waitFor(() => expect(card('prime').hasAttribute('aria-busy')).toBe(false));
    expect(card('prime').getAttribute('aria-pressed')).toBe('false');
    expect(card('flix').getAttribute('aria-pressed')).toBe('true');
  });

  it('Handy: Bottom-Sheet-Variante', () => {
    mockMedia(true);
    openThemePicker();
    expect(document.getElementById('lfx-themepicker').classList.contains('lfx-tp--sheet')).toBe(true);
    expect(document.querySelector('.lfx-tp__handle')).not.toBeNull();
  });

  it('Aufräumen: Listener weg, Mount weg, destroyThemePicker = close', () => {
    openThemePicker();
    expect(themeState.listeners.size).toBe(1);
    destroyThemePicker();
    expect(themeState.listeners.size).toBe(0);
    expect(document.getElementById('lfx-themepicker')).toBeNull();
    expect(() => key('Escape')).not.toThrow();
    openThemePicker();
    openThemePicker();
    expect(document.querySelectorAll('#lfx-themepicker').length).toBe(1);
  });
});
