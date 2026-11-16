// @vitest-environment jsdom
// Desktop-Steuerung: Esc-Vorrang der Hüllen-Overlays, exiting-Flag nach detach, Pfeiltasten außerhalb von play.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DesktopControls } from '../src/js/store3d/controls/desktop.js';

let canvas;
let lockEl;
let mode;
let ctl;
let ctx;

function key(code, type = 'keydown', target = document.body) {
  const e = new KeyboardEvent(type, { code, bubbles: true, cancelable: true });
  target.dispatchEvent(e);
  return e;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(10000);
  canvas = document.createElement('canvas');
  document.body.appendChild(canvas);
  lockEl = null;
  mode = 'play';
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockEl });
  document.exitPointerLock = vi.fn();
  canvas.requestPointerLock = vi.fn(() => undefined);
  ctx = {
    canvas, player: { look: vi.fn() }, getMode: () => mode, onLockLost: vi.fn(), onLockChange: vi.fn(), onTake: vi.fn(), onEscape: vi.fn(),
    onZoom: vi.fn(), getZoom: () => 1,
  };
  ctl = new DesktopControls(ctx);
  ctl.attach();
});
afterEach(() => {
  ctl.detach();
  vi.useRealTimers();
  delete document.pointerLockElement;
  canvas.remove();
  document.documentElement.classList.remove('lfx-themepicker-open', 'lfx-popover-open');
});

describe('Esc mit offenem Hüllen-Overlay', () => {
  it.each(['lfx-themepicker-open', 'lfx-popover-open'])('%s: Esc im Pause-Menü setzt nicht fort', (cls) => {
    mode = 'paused';
    document.documentElement.classList.add(cls);
    key('Escape');
    expect(ctx.onEscape).not.toHaveBeenCalled();
  });
  it('ohne Overlay bleibt Esc im Pause-Menü wirksam', () => {
    mode = 'paused';
    key('Escape');
    expect(ctx.onEscape).toHaveBeenCalledTimes(1);
  });
});

describe('detach bei aktivem Lock', () => {
  it('exiting bleibt nach detach/attach nicht hängen', () => {
    lockEl = canvas;
    ctl.detach();
    expect(ctl.exiting).toBe(false);
    ctl.attach();
    lockEl = canvas;
    document.dispatchEvent(new Event('pointerlockchange'));
    vi.advanceTimersByTime(2000);
    lockEl = null;
    document.dispatchEvent(new Event('pointerlockchange')); // Esc
    expect(ctx.onLockLost).toHaveBeenCalledTimes(1);
  });
});

describe('Pfeiltaste losgelassen außerhalb von play', () => {
  it('keyup löscht die Richtung auch in hold', () => {
    key('ArrowUp');
    expect(ctl.input.fwd).toBe(1);
    mode = 'hold';
    key('ArrowUp', 'keyup');
    mode = 'play';
    expect(ctl.input.fwd).toBe(0);
  });
});

