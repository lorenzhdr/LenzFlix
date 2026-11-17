// @vitest-environment jsdom
// VIDEOTHEK LENZ: Desktop-Aktionstasten Leertaste (springen), F (schlagen), G (werfen), M (mitnehmen im Halte-Bild).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DesktopControls } from '../src/js/store3d/controls/desktop.js';

let canvas;
let lockEl;
let mode;
let ctl;
let ctx;

const key = (code, type = 'keydown', extra = {}) => {
  const e = new KeyboardEvent(type, { code, bubbles: true, cancelable: true, ...extra });
  window.dispatchEvent(e);
  return e;
};

beforeEach(() => {
  canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  lockEl = canvas;
  mode = 'play';
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockEl });
  document.exitPointerLock = vi.fn();
  canvas.requestPointerLock = vi.fn(() => undefined);
  ctx = {
    canvas, player: { look: vi.fn() }, getMode: () => mode, onLockLost: vi.fn(), onLockChange: vi.fn(), onTake: vi.fn(), onEscape: vi.fn(),
    onZoom: vi.fn(), getZoom: () => 1, onJump: vi.fn(), onHit: vi.fn(), onThrow: vi.fn(), onCarry: vi.fn(),
  };
  ctl = new DesktopControls(ctx);
  ctl.attach();
});
afterEach(() => {
  ctl.detach();
  delete document.pointerLockElement;
  canvas.remove();
});

describe('Aktionstasten', () => {
  it('Space/F/G lösen bei Pointer-Lock aus und verschlucken die Taste', () => {
    for (const [code, fn] of [['Space', 'onJump'], ['KeyF', 'onHit'], ['KeyG', 'onThrow']]) {
      const e = key(code);
      expect(ctx[fn], code).toHaveBeenCalledTimes(1);
      expect(e.defaultPrevented, code).toBe(true);
      key(code, 'keyup');
    }
  });
  it('mit dragLook (Fallback ohne Lock) ebenfalls', () => {
    lockEl = null;
    ctl.dragLook = true;
    key('Space');
    expect(ctx.onJump).toHaveBeenCalledTimes(1);
  });
  it('ohne Lock und ohne dragLook: keine Aktion (die Taste wird im Spielmodus trotzdem verschluckt)', () => {
    lockEl = null;
    const e = key('KeyF');
    expect(ctx.onHit).not.toHaveBeenCalled();
    expect(e.defaultPrevented).toBe(true);
  });
  it('Modus ≠ play: keine Aktion und die Taste bleibt unverschluckt (Leertaste in Menüs)', () => {
    for (const m of ['paused', 'hold', 'overlay']) {
      mode = m;
      const e = key('Space');
      expect(ctx.onJump).not.toHaveBeenCalled();
      expect(e.defaultPrevented, m).toBe(false);
    }
  });
  it('repeat wird ignoriert', () => {
    key('Space', 'keydown', { repeat: true });
    expect(ctx.onJump).not.toHaveBeenCalled();
    key('Space');
    key('Space', 'keydown', { repeat: true });
    expect(ctx.onJump).toHaveBeenCalledTimes(1);
  });
  it('Relock-Taste (Lock verloren, Re-Lock scharf) führt die Aktion nicht zusätzlich aus', () => {
    lockEl = null;
    ctl.relockArmed = true;
    ctl.attached = true;
    key('Space');
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
    expect(ctx.onJump).not.toHaveBeenCalled();
  });
  it('ohne ctx-Callbacks (alte Tests) wird nichts verschluckt', () => {
    ctl.detach();
    ctx.onJump = undefined;
    ctl = new DesktopControls(ctx);
    ctl.attach();
    expect(key('Space').defaultPrevented).toBe(false);
  });
  it('E und Klick melden die Quelle an onTake', () => {
    key('KeyE');
    expect(ctx.onTake).toHaveBeenLastCalledWith('key');
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    expect(ctx.onTake).toHaveBeenLastCalledWith('click');
  });
  it('M nimmt im Halte-Bild mit, sonst nicht', () => {
    mode = 'hold';
    const e = key('KeyM');
    expect(ctx.onCarry).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
    mode = 'play';
    key('KeyM');
    expect(ctx.onCarry).toHaveBeenCalledTimes(1);
  });
  it('Tippen in Textfeldern löst nichts aus', () => {
    const input = document.createElement('input');
    document.body.appendChild(input);
    const e = new KeyboardEvent('keydown', { code: 'Space', bubbles: true, cancelable: true });
    input.dispatchEvent(e);
    expect(ctx.onJump).not.toHaveBeenCalled();
    input.remove();
  });
});

describe('Mehrspieler-Tasten Enter/T', () => {
  it('ohne Verbraucher (Rückruf fehlt) bleiben Enter und T unberührt', () => {
    for (const code of ['Enter', 'NumpadEnter', 'KeyT']) {
      const e = key(code);
      expect(e.defaultPrevented, code).toBe(false);
      key(code, 'keyup');
    }
  });
  it('Rückruf liefert false: Taste bleibt unberührt', () => {
    ctx.onChat = vi.fn(() => false);
    ctx.onEmote = vi.fn(() => false);
    const e = key('Enter');
    const t = key('KeyT');
    expect(ctx.onChat).toHaveBeenCalledTimes(1);
    expect(ctx.onEmote).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(false);
    expect(t.defaultPrevented).toBe(false);
  });
  it('Rückruf liefert true: Taste (inkl. Wiederholung und keyup) wird verbraucht, nur einmal ausgelöst', () => {
    ctx.onChat = vi.fn(() => true);
    ctx.onEmote = vi.fn(() => true);
    const down = key('Enter');
    const rep = key('Enter', 'keydown', { repeat: true });
    const up = key('Enter', 'keyup');
    expect(ctx.onChat).toHaveBeenCalledTimes(1);
    expect(down.defaultPrevented && rep.defaultPrevented && up.defaultPrevented).toBe(true);
    expect(key('KeyT').defaultPrevented).toBe(true);
    expect(ctx.onEmote).toHaveBeenCalledTimes(1);
  });
  it('nur im Modus play: im Overlay/Sitzen (Kino-Leiste) wird nichts ausgelöst oder verbraucht', () => {
    ctx.onChat = vi.fn(() => true);
    ctx.onEmote = vi.fn(() => true);
    mode = 'overlay';
    expect(key('Enter').defaultPrevented).toBe(false);
    expect(key('KeyT').defaultPrevented).toBe(false);
    expect(ctx.onChat).not.toHaveBeenCalled();
    expect(ctx.onEmote).not.toHaveBeenCalled();
  });
  it('ohne Pointer-Lock und ohne dragLook: nicht ausgelöst', () => {
    ctx.onChat = vi.fn(() => true);
    lockEl = null;
    expect(key('Enter').defaultPrevented).toBe(false);
    expect(ctx.onChat).not.toHaveBeenCalled();
  });
  it('Tippen in Textfeldern bleibt unberührt', () => {
    ctx.onChat = vi.fn(() => true);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent('keydown', { code: 'Enter', bubbles: true, cancelable: true }));
    expect(ctx.onChat).not.toHaveBeenCalled();
    input.remove();
  });
});
