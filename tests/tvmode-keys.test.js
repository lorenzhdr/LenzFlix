// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createKeys } from '../src/js/live/tvmode/keys.js';

let root;
let ctl;
let fullscreen;
let k;
let blocked;
let previews;

const press = (key, target = document.body, init = {}) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
  target.dispatchEvent(e);
  return e;
};

beforeEach(() => {
  document.body.innerHTML = '<div id="x"><button id="b"></button></div><div id="out"><input id="i"><button id="ob"></button></div>';
  root = document.getElementById('x');
  ctl = { state: vi.fn(() => ({ on: true })), zap: vi.fn(), tune: vi.fn(), toggleMute: vi.fn() };
  fullscreen = { toggle: vi.fn() };
  blocked = false;
  previews = [];
  k = createKeys({ doc: document, root, ctl, fullscreen, blocked: () => blocked, onPreview: (t) => previews.push(t), toast: vi.fn() });
});
afterEach(() => k.destroy());

describe('keys', () => {
  it('Pfeile und Bild-Tasten zappen und verhindern das Scrollen', () => {
    expect(press('ArrowUp').defaultPrevented).toBe(true);
    press('PageUp');
    press('ArrowDown');
    press('PageDown');
    expect(ctl.zap.mock.calls.map((c) => c[0])).toEqual([1, 1, -1, -1]);
  });

  it('Ziffern: 5 sofort, 1 und 2 wählt Sender 12 mit Vorschau', () => {
    press('5');
    expect(ctl.tune).toHaveBeenCalledWith(5, { immediate: true });
    press('1');
    expect(previews).toEqual(['1_']);
    press('2');
    expect(ctl.tune).toHaveBeenLastCalledWith(12, { immediate: true });
    expect(previews).toEqual(['1_', null]);
  });

  it('M schaltet stumm, F Vollbild', () => {
    press('m');
    press('F');
    expect(ctl.toggleMute).toHaveBeenCalled();
    expect(fullscreen.toggle).toHaveBeenCalled();
  });

  it('Fokus im Root geht, Fokus außerhalb nicht', () => {
    press('ArrowUp', document.getElementById('b'));
    expect(ctl.zap).toHaveBeenCalledTimes(1);
    const e = press('ArrowUp', document.getElementById('ob'));
    expect(ctl.zap).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(false);
  });

  it('Eingabefelder, Modifier und Sperre blockieren', () => {
    press('ArrowUp', document.getElementById('i'));
    press('ArrowUp', document.body, { ctrlKey: true });
    blocked = true;
    const e = press('ArrowUp');
    expect(ctl.zap).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(false);
  });

  it('Fremde Tasten bleiben unberührt; ausgeschaltet greift nichts', () => {
    expect(press('a').defaultPrevented).toBe(false);
    expect(press('Enter').defaultPrevented).toBe(false);
    ctl.state.mockReturnValue({ on: false });
    expect(press('ArrowUp').defaultPrevented).toBe(false);
    expect(ctl.zap).not.toHaveBeenCalled();
  });

  it('destroy entfernt den Listener', () => {
    k.destroy();
    press('ArrowUp');
    expect(ctl.zap).not.toHaveBeenCalled();
  });
});
