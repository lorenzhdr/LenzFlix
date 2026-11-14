// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openPopover, closePopover, isPopoverOpen } from '../src/js/core/popover.js';

const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('popover', () => {
  let anchor;
  let onClick;
  beforeEach(() => {
    document.body.innerHTML = '<button id="a">Profil</button><p id="out">außen</p>';
    anchor = document.getElementById('a');
    onClick = vi.fn();
  });
  afterEach(() => closePopover());

  const open = (extra = {}) =>
    openPopover(anchor, {
      label: 'Profil',
      items: [
        { key: 'a', label: 'Eins', href: '#/x', className: 'foo' },
        { key: 'b', label: 'Zwei', onClick },
        { key: 'c', label: 'Versteckt', hidden: true },
        { key: 'd', label: 'Drei', onClick },
      ],
      ...extra,
    });

  it('badge: Pille nach dem Label, zugänglicher Name mit Badge', () => {
    const { el } = openPopover(anchor, { label: 'Profil', items: [{ key: 'd', label: 'Design Einstellungen', badge: 'Beta', onClick }, { key: 'e', label: 'Ohne' }] });
    const [withBadge, without] = el.querySelectorAll('[role="menuitem"]');
    expect(withBadge.querySelector('.lfx-popover__label').textContent).toBe('Design Einstellungen');
    const pill = withBadge.querySelector('.lfx-beta');
    expect(pill.textContent).toBe('Beta');
    expect(pill.getAttribute('aria-hidden')).toBe('true');
    expect(withBadge.getAttribute('aria-label')).toBe('Design Einstellungen (Beta)');
    expect(without.querySelector('.lfx-beta')).toBeNull();
    expect(without.hasAttribute('aria-label')).toBe(false);
  });

  it('rendert Menü mit Einträgen, setzt aria-expanded, fokussiert den ersten', () => {
    const { el } = open();
    expect(el.id).toBe('lfx-popover');
    expect(el.getAttribute('role')).toBe('menu');
    expect(el.getAttribute('aria-label')).toBe('Profil');
    const items = el.querySelectorAll('[role="menuitem"]');
    expect(items.length).toBe(3);
    expect(items[0].tagName).toBe('A');
    expect(items[0].classList.contains('foo')).toBe(true);
    expect(items[1].tagName).toBe('BUTTON');
    expect(anchor.getAttribute('aria-expanded')).toBe('true');
    expect(isPopoverOpen()).toBe(true);
    expect(document.activeElement).toBe(items[0]);
  });

  it('Pfeiltasten, Home/End mit Umlauf', () => {
    const { el } = open();
    const items = [...el.querySelectorAll('[role="menuitem"]')];
    key('ArrowDown');
    expect(document.activeElement).toBe(items[1]);
    key('End');
    expect(document.activeElement).toBe(items[2]);
    key('ArrowDown');
    expect(document.activeElement).toBe(items[0]);
    key('ArrowUp');
    expect(document.activeElement).toBe(items[2]);
    key('Home');
    expect(document.activeElement).toBe(items[0]);
  });

  it('Escape schließt und fokussiert den Anker; Tab schließt', () => {
    open();
    key('Escape');
    expect(isPopoverOpen()).toBe(false);
    expect(document.getElementById('lfx-popover')).toBeNull();
    expect(anchor.hasAttribute('aria-expanded')).toBe(false);
    expect(document.activeElement).toBe(anchor);
    open();
    key('Tab');
    expect(isPopoverOpen()).toBe(false);
  });

  it('Klick außerhalb schließt, Klick im Menü nicht, Eintrag schließt und führt aus', () => {
    const { el } = open();
    el.click();
    expect(isPopoverOpen()).toBe(true);
    document.getElementById('out').click();
    expect(isPopoverOpen()).toBe(false);
    const p = open();
    p.el.querySelectorAll('[role="menuitem"]')[1].click();
    expect(isPopoverOpen()).toBe(false);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Singleton, Resize schließt, close() aus dem Rückgabewert', () => {
    open();
    const second = open();
    expect(document.querySelectorAll('#lfx-popover').length).toBe(1);
    window.dispatchEvent(new Event('resize'));
    expect(isPopoverOpen()).toBe(false);
    const third = open();
    third.close();
    expect(isPopoverOpen()).toBe(false);
    expect(second.el.isConnected).toBe(false);
  });

  it('Position: unter dem Anker, im Viewport', () => {
    anchor.getBoundingClientRect = () => ({ left: 10, right: 60, top: 0, bottom: 30, width: 50, height: 30 });
    const { el } = open({ align: 'start' });
    expect(el.style.top).toBe('38px');
    expect(el.style.left).toBe('10px');
  });

  it('switch: Button mit role=menuitemcheckbox, Klick schließt nicht, schaltet aria-checked, ruft onToggle', () => {
    const onToggle = vi.fn();
    const { el } = openPopover(anchor, { label: 'Profil', items: [{ key: 'a', label: 'Eins', onClick }, { key: 'ds', label: 'Datensparmodus', switch: true, checked: false, onToggle }] });
    const sw = el.querySelector('[role="menuitemcheckbox"]');
    expect(sw.tagName).toBe('BUTTON');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sw.querySelector('.lfx-switch[aria-hidden="true"] > .lfx-switch__knob')).not.toBeNull();
    expect(sw.querySelector('.lfx-popover__label').textContent).toBe('Datensparmodus');
    sw.click();
    expect(isPopoverOpen()).toBe(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(sw.classList.contains('is-on')).toBe(true);
    expect(onToggle).toHaveBeenLastCalledWith(true);
    sw.click();
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(onToggle).toHaveBeenLastCalledWith(false);
    expect(isPopoverOpen()).toBe(true);
  });

  it('switch: watch aktualisiert den Zustand von außen und meldet sich nach dem Schließen ab', () => {
    let push;
    const off = vi.fn();
    const { el } = openPopover(anchor, { items: [{ key: 'ds', label: 'X', switch: true, checked: false, watch: (cb) => { push = cb; return off; } }] });
    const sw = el.querySelector('[role="menuitemcheckbox"]');
    push(true);
    expect(sw.getAttribute('aria-checked')).toBe('true');
    closePopover();
    push(false);
    expect(off).toHaveBeenCalledTimes(1);
  });

  it('note: nicht fokussierbar, nicht in der Pfeiltasten-Liste, erster Fokus auf dem ersten interaktiven Knoten', () => {
    const { el } = openPopover(anchor, { items: [{ note: true, key: 'n', label: 'Hinweis' }, { key: 'a', label: 'Eins' }, { key: 'b', label: 'Zwei' }] });
    const note = el.querySelector('.lfx-popover__note');
    expect(note.textContent).toBe('Hinweis');
    expect(note.getAttribute('role')).toBe('none');
    expect(note.tabIndex).toBe(-1);
    const [a, b] = el.querySelectorAll('[role="menuitem"]');
    expect(document.activeElement).toBe(a);
    key('ArrowUp');
    expect(document.activeElement).toBe(b);
    key('ArrowDown');
    expect(document.activeElement).toBe(a);
    key('Home');
    expect(document.activeElement).toBe(a);
    expect(document.activeElement).not.toBe(note);
  });
});
