// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DesktopControls } from '../src/js/store3d/controls/desktop.js';

let canvas;
let lockEl;
let mode;
let ctl;
let ctx;

function setLock(on) {
  lockEl = on ? canvas : null;
  document.dispatchEvent(new Event('pointerlockchange'));
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
});

describe('Pointer-Lock nach Esc', () => {
  it('requestLock sofort nach Esc-Exit wird bis unlockAt+1150 verzoegert', () => {
    setLock(true);
    vi.advanceTimersByTime(2000);
    setLock(false); // Esc
    vi.advanceTimersByTime(100);
    ctl.requestLock();
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60);
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it('ohne kuerzlichen Exit sofort', () => {
    ctl.requestLock();
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
  });

  it('detach raeumt den Timer auf', () => {
    setLock(true);
    setLock(false);
    ctl.requestLock();
    ctl.detach();
    vi.advanceTimersByTime(2000);
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
  });

  it('nicht mehr im Play-Modus: Anfrage entfaellt', () => {
    setLock(true);
    setLock(false);
    ctl.requestLock();
    mode = 'paused';
    vi.advanceTimersByTime(2000);
    expect(canvas.requestPointerLock).not.toHaveBeenCalled();
  });

  it('pointerlockerror kurz nach Exit: kein dragLook, einmaliger Retry', () => {
    setLock(true);
    setLock(false);
    vi.advanceTimersByTime(1200);
    ctl.requestLock();
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event('pointerlockerror'));
    expect(ctl.dragLook).toBe(false);
    vi.advanceTimersByTime(200);
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(2);
    document.dispatchEvent(new Event('pointerlockerror')); // Retry scheitert ebenfalls
    expect(ctl.dragLook).toBe(false);
    vi.advanceTimersByTime(3000);
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(2);
  });

  it('abgelehntes Promise + Event zaehlen als ein Fehler', async () => {
    canvas.requestPointerLock = vi.fn(() => Promise.reject(new Error('x')));
    setLock(true);
    setLock(false);
    vi.advanceTimersByTime(1200);
    ctl.requestLock();
    document.dispatchEvent(new Event('pointerlockerror'));
    await Promise.resolve();
    await Promise.resolve();
    vi.advanceTimersByTime(300);
    expect(canvas.requestPointerLock).toHaveBeenCalledTimes(2);
    expect(ctl.dragLook).toBe(false);
  });

  it('Fehler ohne kuerzlichen Exit: dragLook', () => {
    ctl.requestLock();
    document.dispatchEvent(new Event('pointerlockerror'));
    expect(ctl.dragLook).toBe(true);
  });

  it('ohne requestPointerLock: dragLook', () => {
    canvas.requestPointerLock = undefined;
    ctl.requestLock();
    expect(ctl.dragLook).toBe(true);
  });
});

describe('Zoom', () => {
  it('rechte Maustaste haelt Zoom, Loslassen setzt zurueck', () => {
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
    expect(ctx.onZoom).toHaveBeenLastCalledWith(2.6);
    window.dispatchEvent(new MouseEvent('mouseup', { button: 2 }));
    expect(ctx.onZoom).toHaveBeenLastCalledWith(1);
  });

  it('Q-Taste wird verschluckt und zoomt', () => {
    const down = new KeyboardEvent('keydown', { code: 'KeyQ', cancelable: true, bubbles: true });
    window.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
    expect(ctx.onZoom).toHaveBeenLastCalledWith(2.6);
    window.dispatchEvent(new KeyboardEvent('keyup', { code: 'KeyQ', bubbles: true }));
    expect(ctx.onZoom).toHaveBeenLastCalledWith(1);
  });

  it('nicht im Play-Modus; Blur und Kontextmenue', () => {
    mode = 'paused';
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
    expect(ctx.onZoom).not.toHaveBeenCalled();
    mode = 'play';
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 2, bubbles: true }));
    window.dispatchEvent(new Event('blur'));
    expect(ctx.onZoom).toHaveBeenLastCalledWith(1);
    const cm = new MouseEvent('contextmenu', { cancelable: true, bubbles: true });
    canvas.dispatchEvent(cm);
    expect(cm.defaultPrevented).toBe(true);
  });

  it('Maus-Empfindlichkeit wird durch den Zoom geteilt', () => {
    ctx.getZoom = () => 2;
    setLock(true);
    document.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 100, movementY: 0 }));
    expect(ctx.player.look).toHaveBeenCalledWith(-(100 * 0.0022) / 2, -0);
  });
});
