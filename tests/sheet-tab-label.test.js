// @vitest-environment jsdom
// Sheet: Shift+Tab im Container, aria-label folgt dem Titel.
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
import { openSheet, renderSheet, closeChooser } from '../src/js/core/sheet.js';
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

const tab = (shiftKey) => {
  const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
  window.dispatchEvent(e);
  return e;
};

describe('Sheet', () => {
  it('Shift+Tab auf dem Container springt zum letzten Eintrag', () => {
    const c = openSheet(null, 'T');
    renderSheet(c, 'T', [{ label: 'A', onClick: () => {} }, { label: 'B', onClick: () => {} }]);
    c.sheet.focus();
    expect(document.activeElement).toBe(c.sheet);
    const e = tab(true);
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement.textContent).toBe('B');
  });

  it('aria-label folgt dem sichtbaren Titel nach renderSheet', () => {
    const c = openSheet(null, 'Download');
    renderSheet(c, '12 Episoden herunterladen?', [{ label: 'Ja', onClick: () => {} }]);
    expect(c.sheet.getAttribute('aria-label')).toBe('12 Episoden herunterladen?');
  });
});

