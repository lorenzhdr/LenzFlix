import { describe, it, expect } from 'vitest';
import { makeNavGrid, findPath, isFree, lineClear, resolveCircle, smoothPath, nearestFree } from '../src/js/store3d/nav/path.js';
import { AutoQuality, presetFor } from '../src/js/store3d/engine/quality.js';

const bounds = { x0: 0, z0: 0, x1: 10, z1: 10 };

describe('store3d path', () => {
  it('findet einen geraden Weg ohne Hindernis', () => {
    const nav = makeNavGrid(bounds, []);
    const p = findPath(nav, { x: 1, z: 1 }, { x: 9, z: 9 });
    expect(p).toEqual([{ x: 9, z: 9 }]);
  });

  it('umgeht eine Wand mit Lücke und endet am Ziel', () => {
    const nav = makeNavGrid(bounds, [{ x0: 0, z0: 4.8, x1: 8, z1: 5.2 }]);
    const p = findPath(nav, { x: 1, z: 1 }, { x: 1, z: 9 });
    expect(p).not.toBeNull();
    expect(p.length).toBeGreaterThan(1);
    expect(p[p.length - 1]).toEqual({ x: 1, z: 9 });
    let prev = { x: 1, z: 1 };
    for (const q of p) {
      expect(lineClear(nav, prev, q)).toBe(true);
      prev = q;
    }
  });

  it('gibt null zurück, wenn das Ziel abgeschnitten ist', () => {
    const nav = makeNavGrid(bounds, [{ x0: 0, z0: 4.8, x1: 10, z1: 5.2 }]);
    expect(findPath(nav, { x: 1, z: 1 }, { x: 1, z: 9 })).toBeNull();
  });

  it('zieht blockierte Ziele auf die nächste freie Zelle', () => {
    const nav = makeNavGrid(bounds, [{ x0: 4, z0: 4, x1: 6, z1: 6 }]);
    expect(isFree(nav, 5, 5)).toBe(false);
    const f = nearestFree(nav, 5, 5);
    expect(isFree(nav, f.x, f.z)).toBe(true);
    const p = findPath(nav, { x: 1, z: 1 }, { x: 5, z: 5 });
    expect(p).not.toBeNull();
    expect(isFree(nav, p[p.length - 1].x, p[p.length - 1].z)).toBe(true);
  });

  it('smoothPath kürzt per Sichtlinie', () => {
    const nav = makeNavGrid(bounds, []);
    const pts = [{ x: 1, z: 1 }, { x: 2, z: 1 }, { x: 3, z: 2 }, { x: 5, z: 5 }];
    expect(smoothPath(nav, pts)).toEqual([pts[0], pts[3]]);
  });

  it('resolveCircle gleitet an Wänden', () => {
    const rects = [{ x0: 5, z0: 0, x1: 6, z1: 10 }];
    const r = resolveCircle(4.8, 3, 0.3, rects);
    expect(r.hit).toBe(true);
    expect(r.x).toBeCloseTo(4.7, 5);
    expect(r.z).toBeCloseTo(3, 5);
    expect(resolveCircle(2, 3, 0.3, rects).hit).toBe(false);
    // Mittelpunkt im Rechteck wird hinausgeschoben
    const inside = resolveCircle(5.2, 3, 0.3, rects);
    expect(inside.x).toBeLessThanOrEqual(4.7 + 1e-6);
  });
});

describe('store3d quality', () => {
  it('Presets pro Stufe, Handy gedeckelt', () => {
    expect(presetFor('high', false).shadows).toBe(true);
    expect(presetFor('mid', false).shadows).toBe(false);
    expect(presetFor('high', true).pixelRatio).toBeLessThanOrEqual(2);
    expect(presetFor('low', true).maxAtlases).toBeLessThanOrEqual(presetFor('high', false).maxAtlases);
  });

  it('Automatik: stufenweise runter bei < 40 fps, hoch nach stabil > 58 fps', () => {
    const aq = new AutoQuality('high');
    let t = 0;
    const run = (fps, seconds) => {
      let last = null;
      const dt = 1 / fps;
      for (let s = 0; s < seconds * fps; s++) {
        t += dt * 1000;
        const r = aq.sample(dt, t);
        if (r) last = r;
      }
      return last;
    };
    expect(run(30, 2.5)).toBe('mid');
    expect(aq.level).toBe('mid');
    expect(run(60, 2.2)).toBeNull();
    expect(run(60, 12)).toBe('high');
  });
});
