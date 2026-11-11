// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTrackMenu } from '../src/js/live/tvmode/track-menu.js';

const TR = {
  audio: [{ index: 1, label: 'Deutsch' }, { index: 2, label: 'Englisch' }],
  subs: [{ index: 5, label: 'Deutsch UT' }],
  audioIndex: 1,
  subtitleIndex: -1,
};

function setup(tracks = TR) {
  const ctl = {
    tracks: vi.fn(() => tracks),
    setAudio: vi.fn(async () => {}),
    setSubtitle: vi.fn(async () => {}),
  };
  const trigger = document.createElement('button');
  document.body.appendChild(trigger);
  const onClose = vi.fn();
  const menu = createTrackMenu({ doc: document, ctl, trigger, onClose });
  document.body.appendChild(menu.el);
  return { ctl, trigger, menu, onClose };
}

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  document.body.innerHTML = '';
});

describe('track-menu', () => {
  it('ist zu Beginn geschlossen und listet Ton und Untertitel (inkl. Aus)', () => {
    const { menu } = setup();
    expect(menu.el.hidden).toBe(true);
    menu.open();
    expect(menu.isOpen()).toBe(true);
    const labels = [...menu.el.querySelectorAll('.lfx-tvm__menu-item')].map((b) => b.textContent.replace('✓', ''));
    expect(labels).toEqual(['Deutsch', 'Englisch', 'Aus', 'Deutsch UT']);
    const active = menu.el.querySelectorAll('.lfx-tvm__menu-item.is-active');
    expect([...active].map((b) => b.textContent.replace('✓', ''))).toEqual(['Deutsch', 'Aus']);
    expect(menu.el.querySelector('[aria-checked="true"]')).not.toBeNull();
  });

  it('Auswahl ruft setAudio/setSubtitle und schließt', () => {
    const { ctl, menu, trigger } = setup();
    menu.open();
    const items = [...menu.el.querySelectorAll('.lfx-tvm__menu-item')];
    items[1].click();
    expect(ctl.setAudio).toHaveBeenCalledWith(2);
    expect(menu.isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger);
    menu.open();
    [...menu.el.querySelectorAll('.lfx-tvm__menu-item')][3].click();
    expect(ctl.setSubtitle).toHaveBeenCalledWith(5);
    menu.open();
    [...menu.el.querySelectorAll('.lfx-tvm__menu-item')][2].click();
    expect(ctl.setSubtitle).toHaveBeenCalledWith(-1);
  });

  it('schließt bei Esc und bei Klick daneben, nicht bei Klick im Menü oder auf dem Auslöser', () => {
    const { menu, trigger, onClose } = setup();
    menu.open();
    menu.el.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    trigger.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.isOpen()).toBe(true);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(menu.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    menu.open();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.isOpen()).toBe(false);
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
  });

  it('Pfeiltasten bewegen den Fokus, erster aktiver Eintrag ist fokussiert', () => {
    const { menu } = setup();
    menu.open();
    const items = [...menu.el.querySelectorAll('.lfx-tvm__menu-item')];
    expect(document.activeElement).toBe(items[0]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(items[1]);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(items[3]);
  });

  it('öffnet nicht ohne Auswahl; hasChoice zählt Tonspuren und Untertitel', () => {
    const one = setup({ audio: [{ index: 1, label: 'A' }], subs: [], audioIndex: 1, subtitleIndex: -1 });
    expect(one.menu.hasChoice()).toBe(false);
    one.menu.open();
    expect(one.menu.isOpen()).toBe(false);
  });

  it('destroy räumt Listener und DOM auf', () => {
    const { menu } = setup();
    menu.open();
    const spy = vi.spyOn(document, 'removeEventListener');
    menu.destroy();
    expect(spy).toHaveBeenCalled();
    expect(menu.el.isConnected).toBe(false);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(menu.isOpen()).toBe(false);
  });
});
