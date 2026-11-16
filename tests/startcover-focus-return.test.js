// @vitest-environment jsdom
// Ladebild: Fokus kehrt beim Abbau ohne Player zum Auslöser zurück.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const themeState = vi.hoisted(() => ({ id: 'flix' }));
vi.mock('../src/js/core/theme.js', () => ({
  getTheme: () => themeState.id,
  isTheme: (id) => themeState.id === id,
  onThemeChange: () => () => {},
}));
vi.mock('../src/js/core/api.js', async (orig) => ({
  ...(await orig()),
  isReady: () => true,
  setImageScale: vi.fn(),
}));
vi.mock('../src/js/core/themepicker.js', () => ({ openThemePicker: vi.fn() }));

import { closePopover } from '../src/js/core/popover.js';
import { closeChooser } from '../src/js/core/sheet.js';
import { show, hide, destroy as destroyCover } from '../src/js/core/startcover.js';
import dsbtnFeature from '../src/js/features/dsbtn.js';
import { removeAllMounts } from '../src/js/core/dom.js';

beforeEach(() => {
  window.ApiClient = { serverAddress: () => 'http://s', getCurrentUserId: () => 'u', accessToken: () => 'secret', serverId: () => 'srv' };
  document.documentElement.className = 'lfx-js';
  document.body.innerHTML = '<button id="a">Anker</button>';
  window.matchMedia = vi.fn(() => ({ matches: false }));
  window.location.hash = '#/home';
  themeState.id = 'flix';
});
afterEach(() => {
  closePopover();
  closeChooser();
  destroyCover();
  dsbtnFeature.unmount();
  removeAllMounts();
});

describe('Ladebild Fokus-Rückgabe', () => {
  const movie = { Id: 'M1', Type: 'Movie', Name: 'Film' };

  it('hide() gibt den Fokus nach dem Abbau an den Auslöser zurück', () => {
    vi.useFakeTimers();
    const a = document.getElementById('a');
    a.focus();
    show({ item: movie });
    expect(document.activeElement).not.toBe(a);
    hide();
    vi.advanceTimersByTime(1000);
    expect(document.getElementById('lfx-startcover')).toBeNull();
    expect(document.activeElement).toBe(a);
    vi.useRealTimers();
  });

  it('zweiter show()-Aufruf behält den ersten Auslöser, wenn der Fokus schon beim Ladebild liegt', () => {
    vi.useFakeTimers();
    const a = document.getElementById('a');
    a.focus();
    show({ item: movie });
    show({ item: movie });
    hide();
    vi.advanceTimersByTime(1000);
    expect(document.activeElement).toBe(a);
    vi.useRealTimers();
  });
});
