// @vitest-environment jsdom
// VIDEOTHEK LENZ (Welle 3): Esc-Vorrang der Hüllen-Overlays, exiting-Flag, Pfeiltasten, abgebrochener Pfad, Hüllen-Pose im Hochformat.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Group } from 'three';
import { DesktopControls } from '../src/js/store3d/controls/desktop.js';
import { Player } from '../src/js/store3d/controls/player.js';
import { HoldView } from '../src/js/store3d/ui/holdview.js';

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

describe('B030/B063 Esc mit offenem Hüllen-Overlay', () => {
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

describe('B062 detach bei aktivem Lock', () => {
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

describe('A105 Pfeiltaste losgelassen außerhalb von play', () => {
  it('keyup löscht die Richtung auch in hold', () => {
    key('ArrowUp');
    expect(ctl.input.fwd).toBe(1);
    mode = 'hold';
    key('ArrowUp', 'keyup');
    mode = 'play';
    expect(ctl.input.fwd).toBe(0);
  });
});

describe('A102 abgebrochener Pfad', () => {
  it('meldet onArrive(false), Ankunft meldet kein false', () => {
    const p = new Player({ colliders: [{ x0: 0.5, x1: 1, z0: -5, z1: 5 }], spawn: { x: 0, z: 0, yaw: -Math.PI / 2 } });
    const cb = vi.fn();
    p.walkTo([{ x: 3, z: 0 }], cb);
    for (let i = 0; i < 60 && p.path; i++) p.update(0.05, null);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toBe(false);
    const q = new Player({ colliders: [], spawn: { x: 0, z: 0, yaw: 0 } });
    const cb2 = vi.fn();
    q.walkTo([{ x: 0.5, z: 0 }], cb2);
    for (let i = 0; i < 80 && q.path; i++) q.update(0.05, null);
    expect(cb2).toHaveBeenCalledTimes(1);
    expect(cb2.mock.calls[0][0]).not.toBe(false);
  });
});

describe('H001 Hüllen-Pose bei schmalen Fenstern', () => {
  const top = (fov) => {
    const t = HoldView.prototype.target.call({ gripMode: () => false, camera: { aspect: 1.19, fov } });
    return (t.pos.y + t.scale) / (-t.pos.z * Math.tan((fov * Math.PI) / 360));
  };
  it('Oberkante liegt bei FOV 55 nicht höher im Bild als bei FOV 70', () => {
    expect(top(55)).toBeLessThanOrEqual(top(70) + 1e-6);
    expect(top(40)).toBeLessThanOrEqual(top(70) + 1e-6);
  });
  it('Gruppen-Stub ohne fov bleibt unverändert', () => {
    const camera = new Group();
    camera.aspect = 1;
    const t = HoldView.prototype.target.call({ gripMode: () => false, camera });
    expect(t.scale).toBe(3);
    expect(t.pos.y).toBeCloseTo(0.3);
  });
});
