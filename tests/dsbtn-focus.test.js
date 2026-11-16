// @vitest-environment jsdom
// A022: Nach „Ausschalten“ per Tastatur darf der Fokus nicht auf <body> fallen.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  getUserId: () => 'u1',
  isReady: () => true,
  setImageScale: vi.fn(),
}));
vi.mock('../src/js/core/theme.js', () => ({
  isTheme: (id) => id === 'flix',
  getTheme: () => 'flix',
  onThemeChange: () => () => {},
}));

import { createDataSaverButton } from '../src/js/shared/dsbtn.js';
import { closePopover } from '../src/js/core/popover.js';
import { setDataSaver, syncDataSaver, destroyDataSaver, isDataSaverOn } from '../src/js/core/datasaver.js';

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = '';
  document.body.innerHTML = '<header><button id="tv">TV</button></header>';
  syncDataSaver();
});
afterEach(() => {
  closePopover();
  destroyDataSaver();
  document.body.innerHTML = '';
});

describe('dsbtn: Fokus nach „Ausschalten“', () => {
  it('Fokus landet auf einem sichtbaren Nachbarn der Kopfleiste statt auf <body>', () => {
    const btn = createDataSaverButton();
    document.querySelector('header').append(btn);
    setDataSaver(true);
    btn.focus();
    btn.click();
    const off = document.querySelector('.lfx-popover [data-key="ds-off"]');
    off.focus();
    off.click(); // Popover schließt, das fokussierte Element verschwindet
    off.remove();
    expect(isDataSaverOn()).toBe(false);
    expect(document.activeElement).toBe(document.getElementById('tv'));
  });
});
