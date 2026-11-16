// @vitest-environment jsdom
// Ladebild: Fokusübernahme und Neuanlage nach removeAllMounts.
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
import { show, destroy as destroyCover } from '../src/js/core/startcover.js';
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

describe('Ladebild', () => {
  const movie = { Id: 'M1', Type: 'Movie', Name: 'Film' };

  it('Ladebild übernimmt den Fokus vom verdeckten Auslöser', () => {
    document.getElementById('a').focus();
    show({ item: movie });
    expect(document.activeElement).toBe(document.getElementById('lfx-startcover'));
  });

  it('show() nach Entfernen des Knotens (removeAllMounts) legt einen neuen an', () => {
    show({ item: movie });
    removeAllMounts();
    expect(document.getElementById('lfx-startcover')).toBeNull();
    show({ item: movie });
    expect(document.getElementById('lfx-startcover')).not.toBeNull();
  });
});

