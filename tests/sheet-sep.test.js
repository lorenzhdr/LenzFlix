// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openSheet, renderSheet, closeChooser } from '../src/js/core/sheet.js';

beforeEach(() => {
  document.body.innerHTML = '';
  window.matchMedia = vi.fn(() => ({ matches: false }));
});
afterEach(() => closeChooser());

describe('sheet Trenner', () => {
  it('rendert Trenner nicht fokussierbar, bereinigt Ränder und Doppelte', () => {
    const c = openSheet(null, 'T');
    renderSheet(c, 'T', [{ separator: true }, { label: 'A' }, { separator: true }, { separator: true }, { label: 'B' }, { separator: true }]);
    const seps = document.querySelectorAll('.lfx-sheet__sep');
    expect(seps.length).toBe(1);
    expect(seps[0].getAttribute('role')).toBe('separator');
    expect(seps[0].tagName).toBe('DIV');
    expect([...document.querySelectorAll('.lfx-sheet__item')].map((b) => b.textContent)).toEqual(['A', 'B']);
  });
});
