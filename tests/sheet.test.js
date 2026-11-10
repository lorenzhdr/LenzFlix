// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { confirmAction, openSheet, renderSheet, isChooserOpen, closeChooser, isCurrent, getSheet } from '../src/js/core/sheet.js';

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.className = '';
  window.matchMedia = vi.fn(() => ({ matches: false }));
});
afterEach(() => closeChooser());

const buttons = () => [...document.querySelectorAll('.lfx-sheet__item')];

describe('confirmAction', () => {
  it('Bestätigen ruft onConfirm einmal und schließt zuerst', () => {
    let openAtCall = null;
    const onConfirm = vi.fn(() => { openAtCall = isChooserOpen(); });
    confirmAction({ title: 'Wirklich?', confirmLabel: 'Ja', onConfirm });
    expect(isChooserOpen()).toBe(true);
    expect(document.documentElement.classList.contains('lfx-sheet-open')).toBe(true);
    expect(buttons().map((b) => b.textContent)).toEqual(['Ja', 'Abbrechen']);
    buttons()[0].click();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(openAtCall).toBe(false);
    expect(isChooserOpen()).toBe(false);
    expect(document.documentElement.classList.contains('lfx-sheet-open')).toBe(false);
  });

  it('Abbrechen ruft onConfirm nicht', () => {
    const onConfirm = vi.fn();
    confirmAction({ title: 'T', confirmLabel: 'Ja', onConfirm });
    buttons()[1].click();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(isChooserOpen()).toBe(false);
  });

  it('Escape schließt ohne Bestätigung', () => {
    const onConfirm = vi.fn();
    confirmAction({ title: 'T', confirmLabel: 'Ja', onConfirm });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true }));
    expect(isChooserOpen()).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('nur ein Sheet gleichzeitig', () => {
    const a = openSheet(null, 'A');
    const b = confirmAction({ title: 'B', confirmLabel: 'Ja', onConfirm: () => {} });
    expect(document.querySelectorAll('.lfx-sheet').length).toBe(1);
    expect(isCurrent(a)).toBe(false);
    expect(isCurrent(b)).toBe(true);
    expect(getSheet()).toBe(b);
  });
});

describe('renderSheet badge', () => {
  it('rendert Beta-Pille und zugänglichen Namen nur bei badge', () => {
    const c = openSheet(null, 'Mehr');
    renderSheet(c, 'Mehr', [{ label: 'Design Einstellungen', badge: 'Beta' }, { label: 'Abmelden' }]);
    const [a, b] = buttons();
    expect(a.querySelector('.lfx-beta').textContent).toBe('Beta');
    expect(a.querySelector('.lfx-beta').getAttribute('aria-hidden')).toBe('true');
    expect(a.getAttribute('aria-label')).toBe('Design Einstellungen (Beta)');
    expect(b.querySelector('.lfx-beta')).toBeNull();
    expect(b.hasAttribute('aria-label')).toBe(false);
    expect(b.textContent).toBe('Abmelden');
  });
});
