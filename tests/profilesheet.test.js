// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { openProfileSheet, closeProfileSheet, isProfileSheetOpen } from '../src/js/shared/profilesheet.js';

const P = 'lfx-x-sheet';
const flush = () => new Promise((r) => setTimeout(r, 0));
const base = () => ({
  id: 'lfx-x-sheetid',
  prefix: P,
  openClass: 'lfx-x-open',
  label: 'Profil',
  load: async () => ({
    chip: { name: 'Anna', imageUrl: null },
    sections: [
      { items: [{ key: 'a', label: 'Eins', href: '#/a' }, { separator: true }, { key: 'b', label: 'Zwei', onClick: vi.fn() }, { separator: true }] },
      { title: 'Leer', items: [] },
      { title: 'Titel', items: [{ key: 'c', label: 'Drei', href: '#/c' }] },
    ],
  }),
});

beforeEach(() => {
  document.body.innerHTML = '<button id="rf">r</button>';
  document.documentElement.className = '';
});
afterEach(() => closeProfileSheet({ restoreFocus: false }));

describe('profilesheet', () => {
  it('rendert Klassen aus dem Präfix, a für href, Trenner, Chip', async () => {
    openProfileSheet(base());
    expect(isProfileSheetOpen()).toBe(true);
    expect(document.documentElement.classList.contains('lfx-x-open')).toBe(true);
    await flush();
    const root = document.getElementById('lfx-x-sheetid');
    expect(root.classList.contains(`${P}-overlay`)).toBe(true);
    const dlg = root.querySelector(`.${P}`);
    expect(dlg.getAttribute('role')).toBe('dialog');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(dlg.getAttribute('aria-label')).toBe('Profil');
    expect(root.querySelector(`.${P}__grip`)).not.toBeNull();
    expect(root.querySelector(`.${P}__name`).textContent).toBe('Anna');
    expect(root.querySelector(`.${P}__avatar`).textContent).toBe('A');
    const items = [...root.querySelectorAll(`.${P}__item`)];
    expect(items.map((i) => i.tagName)).toEqual(['A', 'BUTTON', 'A']);
    expect(items[0].getAttribute('href')).toBe('#/a');
    expect(root.querySelectorAll(`.${P}__section`).length).toBe(2);
    expect(root.querySelectorAll(`.${P}__head`)[0].textContent).toBe('Titel');
    const sep = root.querySelectorAll(`.${P}__sep`);
    expect(sep.length).toBe(1);
    expect(sep[0].getAttribute('role')).toBe('separator');
  });

  it('Eintrag schließt und ruft onClick; Esc schließt und gibt Fokus zurück', async () => {
    const rf = document.getElementById('rf');
    const cfg = base();
    const onClick = vi.fn();
    cfg.load = async () => ({ chip: { name: '', imageUrl: null }, sections: [{ items: [{ key: 'b', label: 'Zwei', onClick }] }] });
    openProfileSheet({ ...cfg, returnFocus: rf });
    await flush();
    document.querySelector(`.${P}__item`).click();
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(isProfileSheetOpen()).toBe(false);
    expect(document.documentElement.classList.contains('lfx-x-open')).toBe(false);

    openProfileSheet({ ...cfg, returnFocus: rf });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(isProfileSheetOpen()).toBe(false);
    expect(document.activeElement).toBe(rf);
  });

  it('close() aus dem Rückgabewert, hashchange schließt, spätes load nach Schließen rendert nichts', async () => {
    const h = openProfileSheet(base());
    h.close();
    expect(isProfileSheetOpen()).toBe(false);
    await flush();
    expect(document.querySelector(`.${P}__item`)).toBeNull();
    openProfileSheet(base());
    window.dispatchEvent(new Event('hashchange'));
    expect(isProfileSheetOpen()).toBe(false);
  });
});
