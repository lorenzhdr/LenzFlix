// VIDEOTHEK LENZ: Höhen-Kollision (nav/collide.js): colliderBlocks, resolveCircle3, groundHeight, ceilingY, findMantle.
import { describe, it, expect } from 'vitest';
import { resolveCircle } from '../src/js/store3d/nav/path.js';
import {
  STEP_H, BODY_H, MANTLE_H, GRAV, JUMP_V, COYOTE, JUMP_BUF,
  colliderBlocks, navBlocks, resolveCircle3, groundHeight, ceilingY, findMantle,
} from '../src/js/store3d/nav/collide.js';

const box = (x0, z0, x1, z1, extra = {}) => ({ x0, z0, x1, z1, ...extra });

describe('Konstanten (Orchestrator-Entscheidung 1)', () => {
  it('Werte', () => {
    expect([STEP_H, BODY_H, MANTLE_H, GRAV, JUMP_V, COYOTE, JUMP_BUF]).toEqual([0.35, 1.7, 1.3, 20, 6.3, 0.10, 0.12]);
    expect((JUMP_V * JUMP_V) / (2 * GRAV)).toBeCloseTo(0.99, 2);
  });
});

describe('colliderBlocks', () => {
  it('Stufenhöhe genau 0,35: Oberkante 0,35 blockiert nicht, 0,36 schon', () => {
    expect(colliderBlocks(box(0, 0, 1, 1, { y1: 0.35 }), 0)).toBe(false);
    expect(colliderBlocks(box(0, 0, 1, 1, { y1: 0.36 }), 0)).toBe(true);
  });
  it('Kopffreiheit: Unterkante unter feet + 1,7 blockiert, darüber nicht', () => {
    expect(colliderBlocks(box(0, 0, 1, 1, { y0: 1.69, y1: 3 }), 0)).toBe(true);
    expect(colliderBlocks(box(0, 0, 1, 1, { y0: 1.71, y1: 3 }), 0)).toBe(false);
    expect(colliderBlocks(box(0, 0, 1, 1, { y0: 3, y1: 3.2 }), 0)).toBe(false); // Dachplatte
  });
  it('fehlende Höhe = 0..Infinity blockiert immer', () => {
    expect(colliderBlocks(box(0, 0, 1, 1), 0)).toBe(true);
    expect(colliderBlocks(box(0, 0, 1, 1), 5)).toBe(true);
  });
  it('navBlocks: Boden-Hindernis ja; Dach, niedrige Stufe, dynamisch nein', () => {
    expect(navBlocks(box(0, 0, 1, 1))).toBe(true);
    expect(navBlocks(box(0, 0, 1, 1, { y1: 0.5 }))).toBe(true);
    expect(navBlocks(box(0, 0, 1, 1, { y1: 0.3 }))).toBe(false);
    expect(navBlocks(box(0, 0, 1, 1, { y0: 3, y1: 3.2 }))).toBe(false);
    expect(navBlocks(box(0, 0, 1, 1, { dynamic: true }))).toBe(false);
  });
});

describe('resolveCircle3', () => {
  it('ohne Höhen identisch zu resolveCircle (Rückwärtskompatibilität)', () => {
    const rects = [box(0, 0, 2, 2), box(3, 0, 4, 5), box(-1, 3, 2, 3.5)];
    for (const [x, z] of [[2.1, 1], [1, 1], [3.2, 4], [0.5, 3.4], [2.5, 1.5], [10, 10]]) {
      const a = resolveCircle(x, z, 0.28, rects);
      const b = resolveCircle3(x, z, 0.28, rects, 0);
      expect(b.x).toBeCloseTo(a.x, 9);
      expect(b.z).toBeCloseTo(a.z, 9);
      expect(b.hit).toBe(a.hit);
    }
  });
  it('Bank (y1 0,5) blockiert am Boden, auf 0,5 nicht', () => {
    const bank = [box(0, 0, 2, 1, { y1: 0.5 })];
    expect(resolveCircle3(1, 1.1, 0.28, bank, 0).hit).toBe(true);
    expect(resolveCircle3(1, 1.1, 0.28, bank, 0.5).hit).toBe(false);
  });
  it('Dachplatte (y0 3) blockiert am Boden nicht', () => {
    const roof = [box(0, 0, 5, 5, { y0: 3, y1: 3.2 })];
    expect(resolveCircle3(2, 2, 0.28, roof, 0).hit).toBe(false);
  });
  it('mantle: erster Kollider mit y1 in (STEP_H, MANTLE_H] und top !== false', () => {
    const ok = [box(0, 0, 2, 1, { y1: 1.0 })];
    expect(resolveCircle3(1, 1.1, 0.28, ok, 0).mantle).toBe(ok[0]);
    expect(resolveCircle3(1, 1.1, 0.28, [box(0, 0, 2, 1, { y1: 1.4 })], 0).mantle).toBe(null);
    expect(resolveCircle3(1, 1.1, 0.28, [box(0, 0, 2, 1, { y1: 1.0, top: false })], 0).mantle).toBe(null);
    expect(resolveCircle3(1, 1.1, 0.28, [box(0, 0, 2, 1)], 0).mantle).toBe(null); // Wand
  });
  it('nimmt Index und dyn als Quelle', () => {
    const w = box(0, 0, 1, 1);
    const calls = [];
    const idx = { query: (a, b, c, d, cb) => { calls.push([a, b, c, d]); cb(w); } };
    expect(resolveCircle3(1.1, 0.5, 0.28, { index: idx }, 0).hit).toBe(true);
    expect(calls.length).toBeGreaterThan(0);
    const car = box(5, 5, 7, 6, { dynamic: true });
    expect(resolveCircle3(5.5, 6.1, 0.28, { index: { query() {} }, dyn: new Set([car]) }, 0).hit).toBe(true);
  });
});

describe('groundHeight', () => {
  it('Stufe 0,3 begehbar, 0,4 nicht', () => {
    expect(groundHeight(1, 1, 0.28, 0, [box(0, 0, 2, 2, { y1: 0.3 })]).y).toBe(0.3);
    expect(groundHeight(1, 1, 0.28, 0, [box(0, 0, 2, 2, { y1: 0.4 })]).y).toBe(0);
  });
  it('top false und unendliche Höhe zählen nicht', () => {
    expect(groundHeight(1, 1, 0.28, 0, [box(0, 0, 2, 2, { y1: 0.3, top: false })]).y).toBe(0);
    expect(groundHeight(1, 1, 0.28, 0, [box(0, 0, 2, 2)]).y).toBe(0);
  });
  it('höchste erreichbare Oberkante und Rechteck; Dach von oben', () => {
    const lo = box(0, 0, 2, 2, { y1: 0.2 });
    const hi = box(0, 0, 2, 2, { y1: 0.3 });
    const r = groundHeight(1, 1, 0.28, 0, [lo, hi]);
    expect(r.y).toBe(0.3);
    expect(r.rect).toBe(hi);
    const roof = box(0, 0, 5, 5, { y0: 3, y1: 3.2 });
    expect(groundHeight(2, 2, 0.28, 3.2, [roof]).y).toBe(3.2);
    expect(groundHeight(2, 2, 0.28, 5, [roof]).y).toBe(3.2); // fallend: Dach darunter
    expect(groundHeight(2, 2, 0.28, 0, [roof]).y).toBe(0);
  });
  it('Fußkreis muss das Rechteck schneiden', () => {
    expect(groundHeight(2.2, 1, 0.28, 0, [box(0, 0, 2, 2, { y1: 0.3 })]).y).toBe(0); // 0,2 daneben > FOOT_R
    expect(groundHeight(2.1, 1, 0.28, 0, [box(0, 0, 2, 2, { y1: 0.3 })]).y).toBe(0.3);
  });
});

describe('ceilingY', () => {
  it('niedrigste Unterkante über dem Kopf, sonst Infinity', () => {
    const roof = box(0, 0, 5, 5, { y0: 1.8, y1: 2 });
    expect(ceilingY(2, 2, 0.28, 0, [roof])).toBe(1.8);
    expect(ceilingY(2, 2, 0.28, 0, [box(0, 0, 5, 5, { y0: 3, y1: 3.2 })])).toBe(Infinity);
    expect(ceilingY(9, 9, 0.28, 0, [roof])).toBe(Infinity);
    expect(ceilingY(2, 2, 0.28, 0, [box(0, 0, 5, 5, { y0: 0.2, y1: 0.3 })])).toBe(Infinity); // unter Stufenhöhe: Boden, keine Decke
  });
});

describe('findMantle', () => {
  const wall = (y1) => [box(0, 0, 4, 1, { y1 })];
  it('1,2 m ok (Zielpunkt hinter der Kante), 1,4 nicht', () => {
    const m = findMantle(2, 1.28, 0.28, 0, -1, 0, wall(1.2));
    expect(m).not.toBe(null);
    expect(m.y1).toBe(1.2);
    expect(m.z).toBeLessThan(1);
    expect(m.z).toBeGreaterThan(0);
    expect(findMantle(2, 1.28, 0.28, 0, -1, 0, wall(1.4))).toBe(null);
  });
  it('Zielpunkt blockiert (Wand dahinter) oder Decke zu niedrig -> null', () => {
    const blocked = [...wall(1.2), box(-1, -1, 5, 0.5)];
    expect(findMantle(2, 1.28, 0.28, 0, -1, 0, blocked)).toBe(null);
    const low = [...wall(1.2), box(0, 0, 4, 1, { y0: 2.4, y1: 2.6 })];
    expect(findMantle(2, 1.28, 0.28, 0, -1, 0, low)).toBe(null);
  });
  it('schmales Rechteck (< 2r): Mitte; ohne Kante in Richtung null', () => {
    const post = [box(1.9, 0, 2.1, 0.2, { y1: 1.0 })];
    const m = findMantle(2, 0.48, 0.28, 0, -1, 0, post);
    expect(m && m.x).toBeCloseTo(2, 6);
    expect(findMantle(2, 5, 0.28, 0, -1, 0, wall(1.2))).toBe(null);
    expect(findMantle(2, 1.28, 0.28, 0, 0, 0, wall(1.2))).toBe(null);
  });
});
