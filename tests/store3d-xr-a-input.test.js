import { describe, it, expect } from 'vitest';
import { readPad, deadzone, emptyPad, DEADZONE } from '../src/js/store3d/xr/input.js';

const pad = (b = {}, axes = [0, 0, 0, 0]) => ({
  buttons: Array.from({ length: 6 }, (_, i) => ({ value: b[i] || 0, pressed: (b[i] || 0) >= 0.5 })),
  axes,
});

describe('xr/input', () => {
  it('Totzone: unter 0,15 null, darüber umskaliert', () => {
    expect(DEADZONE).toBe(0.15);
    expect(deadzone(0.1)).toBe(0);
    expect(deadzone(-0.15)).toBe(0);
    expect(deadzone(1)).toBe(1);
    expect(deadzone(-1)).toBe(-1);
    expect(deadzone(0.575)).toBeCloseTo(0.5, 5);
    expect(deadzone(NaN)).toBe(0);
  });

  it('liest Sticks aus axes[2]/[3] (oben = negativ) mit Totzone', () => {
    const r = readPad(pad({}, [0.9, 0.9, 0.5, -1]));
    expect(r.stick.x).toBeCloseTo(deadzone(0.5), 5);
    expect(r.stick.y).toBe(-1);
    expect(readPad(pad({}, [0, 0, 0.1, 0.05])).stick).toEqual({ x: 0, y: 0 });
  });

  it('Knöpfe: Trigger, Grip, Stick-Klick, A, B', () => {
    const r = readPad(pad({ 0: 1, 1: 0.7, 3: 1, 4: 1, 5: 1 }));
    expect(r.trigger).toBe(1);
    expect(r.grip).toBeCloseTo(0.7);
    expect(r.stickClick).toBe(true);
    expect(r.a).toBe(true);
    expect(r.b).toBe(true);
  });

  it('Flanken: Down einmal, Up beim Loslassen', () => {
    let p = readPad(pad({}), null);
    expect(p.edges.triggerDown).toBe(false);
    p = readPad(pad({ 0: 1 }), p);
    expect(p.edges.triggerDown).toBe(true);
    p = readPad(pad({ 0: 1 }), p);
    expect(p.edges.triggerDown).toBe(false);
    p = readPad(pad({ 0: 0 }), p);
    expect(p.edges.triggerUp).toBe(true);
    p = readPad(pad({ 1: 1, 3: 1, 4: 1, 5: 1 }), p);
    expect(p.edges).toMatchObject({ gripDown: true, stickClickDown: true, aDown: true, bDown: true });
    p = readPad(pad({ 3: 1, 5: 1 }), p);
    expect(p.edges).toMatchObject({ gripUp: true, gripDown: false, bDown: false, stickClickDown: false });
  });

  it('robust gegen fehlende Knöpfe und Achsen (Hände)', () => {
    const hand = { buttons: [{ value: 1, pressed: true }], axes: [] };
    const r = readPad(hand, null);
    expect(r.trigger).toBe(1);
    expect(r.stick).toEqual({ x: 0, y: 0 });
    expect(r.grip).toBe(0);
    expect(r.b).toBe(false);
    expect(readPad(null, null).stick).toEqual({ x: 0, y: 0 });
    expect(readPad({}, emptyPad()).trigger).toBe(0);
  });
});
