// @vitest-environment jsdom
// A001: watch-Anmeldungen von Schaltern werden beim Schließen von Popover/Sheet sofort abgemeldet.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { openPopover, closePopover } from '../src/js/core/popover.js';
import { openSheet, renderSheet, closeChooser } from '../src/js/core/sheet.js';

afterEach(() => {
  closePopover();
  closeChooser();
  document.body.innerHTML = '';
});

describe('Schalter: watch-Abmeldung beim Schließen (A001)', () => {
  it('Popover: geschlossenes Menü meldet sich ohne weitere Meldung ab', () => {
    document.body.innerHTML = '<button id="a">x</button>';
    const anchor = document.getElementById('a');
    const subs = new Set();
    const watch = (cb) => { subs.add(cb); return () => subs.delete(cb); };
    for (let i = 0; i < 5; i++) {
      openPopover(anchor, { items: [{ key: 'ds', label: 'X', switch: true, checked: false, watch }] });
      closePopover();
    }
    expect(subs.size).toBe(0);
  });

  it('Popover: offenes Menü bleibt angemeldet und folgt Änderungen', () => {
    document.body.innerHTML = '<button id="a">x</button>';
    const subs = new Set();
    let push;
    const watch = (cb) => { push = cb; subs.add(cb); return () => subs.delete(cb); };
    const { el } = openPopover(document.getElementById('a'), { items: [{ key: 'ds', label: 'X', switch: true, checked: false, watch }] });
    expect(subs.size).toBe(1);
    push(true);
    expect(el.querySelector('[role="menuitemcheckbox"]').getAttribute('aria-checked')).toBe('true');
  });

  it('Sheet: schließen und Neuzeichnen melden ab', () => {
    const subs = new Set();
    const watch = (cb) => { subs.add(cb); return () => subs.delete(cb); };
    const c = openSheet(null, 'Test');
    renderSheet(c, 'Test', [{ label: 'DS', switch: true, checked: false, watch }]);
    expect(subs.size).toBe(1);
    renderSheet(c, 'Test', [{ label: 'DS', switch: true, checked: false, watch }]);
    expect(subs.size).toBe(1); // alter Schalter abgemeldet, neuer angemeldet
    closeChooser();
    expect(subs.size).toBe(0);
  });

  it('off wird nur einmal gerufen', () => {
    document.body.innerHTML = '<button id="a">x</button>';
    const off = vi.fn();
    let push;
    openPopover(document.getElementById('a'), { items: [{ key: 'ds', label: 'X', switch: true, checked: false, watch: (cb) => { push = cb; return off; } }] });
    closePopover();
    push(true);
    expect(off).toHaveBeenCalledTimes(1);
  });
});
