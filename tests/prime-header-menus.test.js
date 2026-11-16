// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { openMenus } from '../src/js/features/prime/header-menus.js';

function setup() {
  document.body.innerHTML = '<div id="w"><button id="b" aria-expanded="false"></button><div id="f" hidden></div></div><a id="out" href="#">x</a>';
  const wrap = document.getElementById('w');
  const button = document.getElementById('b');
  const flyout = document.getElementById('f');
  const menu = openMenus({ wrap, button, flyout, load: async () => ({ libraries: [], collections: [] }) });
  return { wrap, button, flyout, menu };
}

describe('LENZPRIME Raster-Flyout', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('schließt bei Fokusverlust ohne relatedTarget (Tab in die Adressleiste), wenn nicht festgesetzt', () => {
    const { wrap, menu } = setup();
    menu.open();
    expect(menu.isOpen()).toBe(true);
    wrap.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    expect(menu.isOpen()).toBe(false);
  });

  it('bleibt bei Fokusverlust ohne relatedTarget offen, wenn per Klick festgesetzt', () => {
    const { wrap, button, menu } = setup();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(menu.isOpen()).toBe(true);
    wrap.dispatchEvent(new FocusEvent('focusout', { bubbles: true, relatedTarget: null }));
    expect(menu.isOpen()).toBe(true);
    menu.destroy();
  });

  it('destroy() entfernt die Klick-Listener von Knopf und Flyout', () => {
    const { button, flyout, menu } = setup();
    menu.destroy();
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(menu.isOpen()).toBe(false);
    expect(flyout.hidden).toBe(true);
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
