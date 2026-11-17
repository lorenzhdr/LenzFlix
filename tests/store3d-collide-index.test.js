// VIDEOTHEK LENZ: Raster-Hash (createColliderIndex) und Nav-Raster mit Höhen.
import { describe, it, expect } from 'vitest';
import { createColliderIndex, resolveCircle3, navBlocks } from '../src/js/store3d/nav/collide.js';
import { makeNavGrid, isFree } from '../src/js/store3d/nav/path.js';

const box = (x0, z0, x1, z1, extra = {}) => ({ x0, z0, x1, z1, ...extra });
const hits = (idx, x0, z0, x1, z1) => { const out = []; idx.query(x0, z0, x1, z1, (q) => out.push(q)); return out; };

describe('createColliderIndex', () => {
  it('add / remove / update / size', () => {
    const a = box(0, 0, 1, 1);
    const idx = createColliderIndex([a]);
    expect(idx.size).toBe(1);
    expect(hits(idx, 0, 0, 1, 1)).toEqual([a]);
    expect(idx.add(a)).toBe(false); // doppelt
    expect(idx.remove(a)).toBe(true);
    expect(idx.size).toBe(0);
    expect(hits(idx, 0, 0, 1, 1)).toEqual([]);
    expect(idx.remove(a)).toBe(false);
    idx.add(a);
    a.x0 = 40; a.x1 = 41; // verschoben
    idx.update(a);
    expect(hits(idx, 0, 0, 1, 1)).toEqual([]);
    expect(hits(idx, 40, 0, 41, 1)).toEqual([a]);
  });
  it('Dedupe: großer Kollider über viele Zellen genau einmal', () => {
    const wall = box(0, 0, 50, 0.3);
    const idx = createColliderIndex([wall], 4);
    expect(hits(idx, -5, -5, 60, 5)).toEqual([wall]);
  });
  it('Abfrage über Zellgrenzen (negative Koordinaten, Kante bei 4)', () => {
    const a = box(3.9, 3.9, 4.1, 4.1);
    const b = box(-3, -3, -2, -2);
    const idx = createColliderIndex([a, b], 4);
    expect(hits(idx, 4.05, 4.05, 4.2, 4.2)).toContain(a);
    expect(hits(idx, 3.8, 3.8, 3.95, 3.95)).toContain(a);
    expect(hits(idx, -2.5, -2.5, -2.4, -2.4)).toEqual([b]);
  });
  it('dynamische Kollider kommen nie in den Hash', () => {
    const idx = createColliderIndex([]);
    expect(idx.add(box(0, 0, 1, 1, { dynamic: true }))).toBe(false);
    expect(idx.size).toBe(0);
  });
  it('rebuild ersetzt den Inhalt', () => {
    const idx = createColliderIndex([box(0, 0, 1, 1)]);
    idx.rebuild([box(10, 10, 11, 11)]);
    expect(idx.size).toBe(1);
    expect(hits(idx, 0, 0, 1, 1)).toEqual([]);
  });
  it('600 Kollider: Abfrage prüft unter 25 Kandidaten', () => {
    const list = [];
    for (let i = 0; i < 600; i++) list.push(box((i % 30) * 3, Math.floor(i / 30) * 3, (i % 30) * 3 + 1, Math.floor(i / 30) * 3 + 1));
    const idx = createColliderIndex(list, 4);
    let n = 0;
    idx.query(40, 30, 41, 31, () => { n++; });
    expect(n).toBeLessThan(25);
    expect(n).toBeGreaterThan(0);
  });
  it('resolveCircle3 über Index = linear', () => {
    const list = [box(0, 0, 2, 2), box(5, 5, 6, 6)];
    const idx = createColliderIndex(list);
    for (const [x, z] of [[2.1, 1], [5.5, 6.1], [9, 9]]) {
      const a = resolveCircle3(x, z, 0.28, list, 0);
      const b = resolveCircle3(x, z, 0.28, { index: idx, dyn: new Set() }, 0);
      expect([b.x, b.z, b.hit]).toEqual([a.x, a.z, a.hit]);
    }
  });
});

describe('makeNavGrid mit Höhen', () => {
  const bounds = { x0: 0, z0: 0, x1: 10, z1: 10 };
  it('ignoriert Dächer, niedrige Stufen und dynamische Kollider; Bank und Wand blockieren', () => {
    const rects = [
      box(1, 1, 2, 2, { y0: 3, y1: 3.2 }),
      box(3, 1, 4, 2, { y1: 0.3 }),
      box(5, 1, 6, 2, { dynamic: true }),
      box(7, 1, 8, 2, { y1: 0.5 }),
      box(1, 5, 2, 6),
    ];
    const g = makeNavGrid(bounds, rects, 0.32, 0.25);
    expect(isFree(g, 1.5, 1.5)).toBe(true);
    expect(isFree(g, 3.5, 1.5)).toBe(true);
    expect(isFree(g, 5.5, 1.5)).toBe(true);
    expect(isFree(g, 7.5, 1.5)).toBe(false);
    expect(isFree(g, 1.5, 5.5)).toBe(false);
    expect(rects.filter(navBlocks).length).toBe(2);
  });
});
