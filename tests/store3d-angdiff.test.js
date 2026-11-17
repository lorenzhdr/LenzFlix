// angDiff: gemeinsame kürzeste Winkeldifferenz im 3D-Bundle (vorher sieben lokale Kopien).
import { describe, it, expect } from 'vitest';
import { angDiff } from '../src/js/store3d/modules/m4-util.js';

describe('angDiff', () => {
  it('liefert die kürzeste Differenz b - a in [-PI, PI]', () => {
    expect(angDiff(0, 1)).toBeCloseTo(1);
    expect(angDiff(1, 0)).toBeCloseTo(-1);
    expect(angDiff(0.1, Math.PI * 2 - 0.1)).toBeCloseTo(-0.2);
    expect(angDiff(Math.PI * 2 - 0.1, 0.1)).toBeCloseTo(0.2);
    expect(Math.abs(angDiff(0, Math.PI * 7))).toBeCloseTo(Math.PI, 5);
    expect(angDiff(0, Math.PI * 20 + 0.5)).toBeCloseTo(0.5);
  });
});
