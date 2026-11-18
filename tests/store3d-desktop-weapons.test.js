// @vitest-environment jsdom
// 1.18.0 Welle 6: Desktop-Eingabe der Waffen – R halten = Waffenrad, Ziffern 1–4, Mausrad, Laser per F/Linksklick halten (Loslass-Rückrufe).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DesktopControls } from '../src/js/store3d/controls/desktop.js';

let canvas;
let lockEl;
let mode;
let ctl;
let ctx;
let wheelOpen;

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
  wheelOpen = false;
  Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => lockEl });
  document.exitPointerLock = vi.fn();
  canvas.requestPointerLock = vi.fn(() => undefined);
  ctx = {
    canvas, player: { look: vi.fn() }, getMode: () => mode, onLockLost: vi.fn(), onLockChange: vi.fn(), onTake: vi.fn(), onEscape: vi.fn(),
    onZoom: vi.fn(), getZoom: () => 1, onJump: vi.fn(), onHit: vi.fn(), onThrow: vi.fn(), onCarry: vi.fn(),
    onHitUp: vi.fn(), onTakeUp: vi.fn(),
    onWheel: vi.fn(() => { wheelOpen = true; mode = 'overlay'; lockEl = null; return true; }),
    onWheelUp: vi.fn(() => { wheelOpen = false; mode = 'play'; }),
    onWeaponPick: vi.fn(), onWeaponCycle: vi.fn(),
  };
  ctl = new DesktopControls(ctx);
  ctl.attach();
});
afterEach(() => {
  ctl.detach();
  delete document.pointerLockElement;
  canvas.remove();
});

describe('Waffenrad (R halten)', () => {
  it('Drücken öffnet, Wiederholungen werden verschluckt, Loslassen schließt (auch bei offenem Rad/ohne Lock)', () => {
    const d = key('KeyR');
    expect(ctx.onWheel).toHaveBeenCalledTimes(1);
    expect(d.defaultPrevented).toBe(true);
    expect(wheelOpen).toBe(true);
    // Lock ist weg (Overlay), Modus overlay: Wiederholung darf das Rad nicht schließen
    const rep = key('KeyR', 'keydown', { repeat: true });
    expect(rep.defaultPrevented).toBe(true);
    expect(ctx.onWheel).toHaveBeenCalledTimes(1);
    expect(ctx.onWheelUp).not.toHaveBeenCalled();
    ctl.onLockChange(); // Lock-Verlust durch das Overlay löst den Loslass-Rückruf nicht aus
    expect(ctx.onWheelUp).not.toHaveBeenCalled();
    const up = key('KeyR', 'keyup');
    expect(up.defaultPrevented).toBe(true);
    expect(ctx.onWheelUp).toHaveBeenCalledTimes(1);
    expect(wheelOpen).toBe(false);
    key('KeyR', 'keyup');
    expect(ctx.onWheelUp).toHaveBeenCalledTimes(1);
  });
  it('ohne Lock/Zieh-Modus oder Modus ≠ play öffnet R nichts', () => {
    lockEl = null;
    key('KeyR');
    expect(ctx.onWheel).not.toHaveBeenCalled();
    lockEl = canvas;
    mode = 'paused';
    key('KeyR');
    expect(ctx.onWheel).not.toHaveBeenCalled();
  });
  it('lehnt der Rückruf ab (false), bleibt die Taste unverbraucht und kein Loslassen folgt', () => {
    ctx.onWheel.mockReturnValue(false);
    const e = key('KeyR');
    expect(e.defaultPrevented).toBe(false);
    key('KeyR', 'keyup');
    expect(ctx.onWheelUp).not.toHaveBeenCalled();
  });
  it('blur während R gehalten schließt das Rad', () => {
    key('KeyR');
    window.dispatchEvent(new Event('blur'));
    expect(ctx.onWheelUp).toHaveBeenCalledTimes(1);
  });
  it('detach während R gehalten schließt das Rad', () => {
    key('KeyR');
    ctl.detach();
    expect(ctx.onWheelUp).toHaveBeenCalledTimes(1);
    ctl.attach();
  });
});

describe('Ziffern und Mausrad', () => {
  it('Ziffern 1–4 wählen direkt und werden verschluckt; 5 nicht', () => {
    for (const n of [1, 2, 3, 4]) {
      const e = key('Digit' + n);
      expect(e.defaultPrevented).toBe(true);
      expect(ctx.onWeaponPick).toHaveBeenLastCalledWith(n);
      key('Digit' + n, 'keyup');
    }
    expect(ctx.onWeaponPick).toHaveBeenCalledTimes(4);
    const e = key('Digit5');
    expect(e.defaultPrevented).toBe(false);
    key('Digit1', 'keydown', { repeat: true });
    expect(ctx.onWeaponPick).toHaveBeenCalledTimes(4);
  });
  it('Ziffern außerhalb des Laufmodus bleiben unberührt', () => {
    mode = 'paused';
    const e = key('Digit1');
    expect(e.defaultPrevented).toBe(false);
    expect(ctx.onWeaponPick).not.toHaveBeenCalled();
  });
  it('Mausrad wechselt die Waffe (gedrosselt) nur im Laufmodus', () => {
    const now = vi.spyOn(performance, 'now');
    now.mockReturnValue(1000);
    const w = new WheelEvent('wheel', { deltaY: 100, cancelable: true, bubbles: true });
    canvas.dispatchEvent(w);
    expect(ctx.onWeaponCycle).toHaveBeenLastCalledWith(1);
    expect(w.defaultPrevented).toBe(true);
    now.mockReturnValue(1050);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
    expect(ctx.onWeaponCycle).toHaveBeenCalledTimes(1);
    now.mockReturnValue(1300);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
    expect(ctx.onWeaponCycle).toHaveBeenLastCalledWith(-1);
    mode = 'paused';
    now.mockReturnValue(2000);
    canvas.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, cancelable: true }));
    expect(ctx.onWeaponCycle).toHaveBeenCalledTimes(2);
    now.mockRestore();
  });
});

describe('Laser halten (Loslass-Rückrufe)', () => {
  it('F: onHit beim Drücken, onHitUp beim Loslassen; Linksklick: onTake, onTakeUp beim Loslassen', () => {
    key('KeyF');
    expect(ctx.onHit).toHaveBeenCalledTimes(1);
    expect(ctx.onHitUp).not.toHaveBeenCalled();
    key('KeyF', 'keyup');
    expect(ctx.onHitUp).toHaveBeenCalledTimes(1);
    canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, bubbles: true }));
    expect(ctx.onTake).toHaveBeenCalledWith('click');
    window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
    expect(ctx.onTakeUp).toHaveBeenCalledTimes(1);
  });
});
