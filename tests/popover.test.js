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
});
