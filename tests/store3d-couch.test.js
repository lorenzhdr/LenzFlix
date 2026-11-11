import { describe, it, expect } from 'vitest';
import { fitDistance, pickCandidates, SCREEN_W, SCREEN_H } from '../src/js/store3d/modules/couch-util.js';

const halfH = (d, fov) => d * Math.tan((fov * Math.PI) / 360);

describe('Couch: Kameraabstand', () => {
  it('Querformat: Höhe füllt ~90 % der Bildhöhe, Breite passt', () => {
    const fov = 70;
    const a = 16 / 9;
    const d = fitDistance(fov, a);
    const hh = halfH(d, fov);
    expect(SCREEN_H / (2 * hh)).toBeCloseTo(0.9, 2);
    expect(SCREEN_W / (2 * hh * a)).toBeLessThanOrEqual(0.92);
  });
  it('Hochformat: Breite füllt ~92 % der Bildbreite, Höhe passt', () => {
    const a = 0.46;
    const fov = (2 * Math.atan(Math.tan((32 * Math.PI) / 180) / a)) * (180 / Math.PI);
    const d = fitDistance(fov, a);
    const hh = halfH(d, fov);
    expect(SCREEN_W / (2 * hh * a)).toBeCloseTo(0.92, 2);
    expect(SCREEN_H / (2 * hh)).toBeLessThanOrEqual(0.9);
  });
  it('schneidet nie ab und fällt bei Müll auf Standardwerte zurück', () => {
    for (const [f, a] of [[70, 1.2], [70, 2.4], [90, 0.6], [40, 1]]) {
      const hh = halfH(fitDistance(f, a), f);
      expect(SCREEN_H / (2 * hh)).toBeLessThanOrEqual(0.9 + 1e-9);
      expect(SCREEN_W / (2 * hh * a)).toBeLessThanOrEqual(0.92 + 1e-9);
    }
    expect(fitDistance(NaN, 0)).toBeGreaterThan(0.2);
  });
});

describe('Couch: Trailer-Kandidaten', () => {
  const mk = (n) => Array.from({ length: n }, (_, i) => ({ Id: `i${i}`, Name: `T${i}` }));
  it('Highlights zuerst, ohne Ab-18, ohne Duplikate, höchstens 12', () => {
    const all = mk(40);
    const items = new Map(all.map((i) => [i.Id, i]));
    const adult = new Set(['i1', 'i5', 'i20']);
    const out = pickCandidates({ highlights: [all[0], all[1], all[0], all[2]], items, adult, max: 12, rand: Math.random });
    expect(out).toHaveLength(12);
    expect(out.slice(0, 2).map((i) => i.Id)).toEqual(['i0', 'i2']);
    expect(new Set(out.map((i) => i.Id)).size).toBe(12);
    expect(out.some((i) => adult.has(i.Id))).toBe(false);
  });
  it('kommt mit kleinen/fehlenden Katalogen zurecht', () => {
    expect(pickCandidates({})).toEqual([]);
    expect(pickCandidates({ highlights: mk(3), items: new Map() })).toHaveLength(3);
  });
});
