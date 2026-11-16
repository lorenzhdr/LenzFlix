// @vitest-environment jsdom
// Desktop-Steuerung: später erteilter Pointer-Lock außerhalb von play.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DesktopControls } from '../src/js/store3d/controls/desktop.js';

describe('später erteilter Pointer-Lock außerhalb von play', () => {
  let canvas; let lockEl; let mode; let ctl;
  beforeEach(() => {
    canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    lockEl = null; mode = 'overlay';
    Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockEl });
    document.exitPointerLock = vi.fn();
    canvas.requestPointerLock = vi.fn();
    ctl = new DesktopControls({ canvas, player: { look: vi.fn() }, getMode: () => mode, onLockLost: vi.fn(), onLockChange: vi.fn(), onTake: vi.fn(), onEscape: vi.fn(), onZoom: vi.fn(), getZoom: () => 1 });
    ctl.attach();
  });
  afterEach(() => { ctl.detach(); delete document.pointerLockElement; canvas.remove(); });
  it('Lock im Modus overlay wird sofort wieder freigegeben', () => {
    lockEl = canvas;
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(document.exitPointerLock).toHaveBeenCalledTimes(1);
  });
  it('Lock im Modus play bleibt bestehen', () => {
    mode = 'play';
    lockEl = canvas;
    document.dispatchEvent(new Event('pointerlockchange'));
    expect(document.exitPointerLock).not.toHaveBeenCalled();
  });
});

