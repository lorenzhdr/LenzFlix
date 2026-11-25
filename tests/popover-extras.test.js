// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { openPopover, closePopover, isPopoverOpen, tidyItems } from '../src/js/core/popover.js';

const key = (k) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));

describe('tidyItems', () => {
  it('entfernt falsy, hidden und überzählige Trenner', () => {
    const sep = { separator: true };
    const r = tidyItems([sep, null, { key: 'a' }, sep, sep, { key: 'h', hidden: true }, sep, { key: 'b' }, sep, undefined]);
    expect(r.map((x) => x.key || 'sep')).toEqual(['a', 'sep', 'b']);
    expect(tidyItems([sep, sep])).toEqual([]);
    expect(tidyItems(null)).toEqual([]);
  });
});

describe('popover Trenner, Kopf, expand, focus, onClosed', () => {
  let anchor;
  beforeEach(() => {
    document.body.innerHTML = '<button id="a">P</button><p id="out">x</p>';
    anchor = document.getElementById('a');
  });
  afterEach(() => closePopover());

  it('Trenner und Kopf werden gerendert, sind nicht fokussierbar und werden von Pfeiltasten übersprungen', () => {
    const { el } = openPopover(anchor, {
      items: [
        { head: true, label: 'Anna', imageUrl: 'http://x/i.png' },
        { key: 'a', label: 'Eins' },
        { separator: true },
        { key: 'b', label: 'Zwei' },
        { separator: true },
      ],
    });
    const head = el.querySelector('.lfx-popover__head');
    expect(head.getAttribute('role')).toBe('none');
    expect(head.querySelector('.lfx-popover__avatar img').getAttribute('src')).toBe('http://x/i.png');
    expect(head.querySelector('img').getAttribute('alt')).toBe('');
    expect(head.querySelector('.lfx-popover__name').textContent).toBe('Anna');
    const seps = el.querySelectorAll('.lfx-popover__sep');
    expect(seps.length).toBe(1);
    expect(seps[0].getAttribute('role')).toBe('separator');
    const [a, b] = el.querySelectorAll('[role="menuitem"]');
    expect(document.activeElement).toBe(a);
    key('ArrowDown');
    expect(document.activeElement).toBe(b);
    key('ArrowDown');
    expect(document.activeElement).toBe(a);
    key('ArrowUp');
    expect(document.activeElement).toBe(b);
  });

  it('Kopf ohne Bild zeigt die Initiale', () => {
    const { el } = openPopover(anchor, { items: [{ head: true, label: 'berta' }, { key: 'a', label: 'x' }] });
    expect(el.querySelector('.lfx-popover__avatar img')).toBeNull();
    expect(el.querySelector('.lfx-popover__avatar').textContent).toBe('B');
  });

  it('expand:false lässt aria-expanded unangetastet', () => {
    anchor.setAttribute('aria-expanded', 'maybe');
    openPopover(anchor, { items: [{ key: 'a', label: 'x' }], expand: false });
    expect(anchor.getAttribute('aria-expanded')).toBe('maybe');
    closePopover();
    expect(anchor.getAttribute('aria-expanded')).toBe('maybe');
    const b = document.createElement('button');
    openPopover(b, { items: [{ key: 'a', label: 'x' }], expand: false });
    closePopover();
    expect(b.hasAttribute('aria-expanded')).toBe(false);
  });

  it('focus:false setzt keinen Anfangsfokus', () => {
    anchor.focus();
    openPopover(anchor, { items: [{ key: 'a', label: 'x' }], focus: false });
    expect(document.activeElement).toBe(anchor);
  });

  it('focus:false: Pfeile/Tab gehören der Seite, solange der Fokus woanders liegt; Esc schließt trotzdem', () => {
    const other = document.createElement('button');
    document.body.appendChild(other);
    other.focus();
    const { el } = openPopover(anchor, { items: [{ key: 'a', label: 'x' }, { key: 'b', label: 'y' }], focus: false });
    const down = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true });
    window.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(false);
    expect(document.activeElement).toBe(other);
    key('Tab');
    expect(isPopoverOpen()).toBe(true);
    // Fokus auf dem Anker: Pfeile führen ins Menü
    anchor.focus();
    key('ArrowDown');
    expect(document.activeElement).toBe(el.querySelector('[role="menuitem"]'));
    key('Escape');
    expect(isPopoverOpen()).toBe(false);
  });

  it('focus:true (Standard): Pfeile wirken wie bisher auch bei Fokus außerhalb', () => {
    const other = document.createElement('button');
    document.body.appendChild(other);
    const { el } = openPopover(anchor, { items: [{ key: 'a', label: 'x' }, { key: 'b', label: 'y' }] });
    other.focus();
    key('ArrowDown');
    expect(el.contains(document.activeElement)).toBe(true);
  });

  it('onClosed genau einmal je Schließweg', () => {
    const items = [{ key: 'a', label: 'x', onClick: vi.fn() }];
    const run = (name, fn) => {
      const onClosed = vi.fn();
      openPopover(anchor, { items, onClosed });
      expect(onClosed).not.toHaveBeenCalled();
      fn();
      closePopover();
      expect(onClosed, name).toHaveBeenCalledTimes(1);
      expect(isPopoverOpen()).toBe(false);
    };
    run('closePopover', () => closePopover());
    run('Esc', () => key('Escape'));
    run('Tab', () => key('Tab'));
    run('Außenklick', () => document.getElementById('out').click());
    run('Resize', () => window.dispatchEvent(new Event('resize')));
    run('Scroll', () => document.dispatchEvent(new Event('scroll')));
    run('Item-Klick', () => document.querySelector('[role="menuitem"]').click());
    const first = vi.fn();
    const p = openPopover(anchor, { items, onClosed: first });
    const second = vi.fn();
    openPopover(anchor, { items, onClosed: second });
    expect(first).toHaveBeenCalledTimes(1);
    p.close();
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it('Ausnahme in onClosed wird abgefangen', () => {
    openPopover(anchor, { items: [{ key: 'a', label: 'x' }], onClosed: () => { throw new Error('boom'); } });
    expect(() => closePopover()).not.toThrow();
  });
});
