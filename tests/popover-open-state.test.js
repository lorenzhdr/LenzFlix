// @vitest-environment jsdom
// Popover: html-Klasse, aria-expanded, Schließen beim Entfernen des Datensparmodus-Symbols.
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

import { openPopover, closePopover, isPopoverOpen } from '../src/js/core/popover.js';
import { closeChooser } from '../src/js/core/sheet.js';
import { destroy as destroyCover } from '../src/js/core/startcover.js';
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

const items = [{ key: 'x', label: 'Eins' }];

describe('Popover', () => {
  it('html-Klasse lfx-popover-open nur solange offen', () => {
    openPopover(document.getElementById('a'), { items });
    expect(document.documentElement.classList.contains('lfx-popover-open')).toBe(true);
    closePopover();
    expect(document.documentElement.classList.contains('lfx-popover-open')).toBe(false);
  });

  it('Anker ohne vorheriges aria-expanded bekommt beim Schließen "false"', () => {
    const a = document.getElementById('a');
    openPopover(a, { items });
    closePopover();
    expect(a.getAttribute('aria-expanded')).toBe('false');
  });

  it('unmount des Datensparmodus-Symbols schließt ein offenes Popover', () => {
    dsbtnFeature.mount();
    document.getElementById('lfx-ds-btn').click();
    expect(isPopoverOpen()).toBe(true);
    dsbtnFeature.unmount();
    expect(isPopoverOpen()).toBe(false);
    expect(document.documentElement.classList.contains('lfx-popover-open')).toBe(false);
  });
});

