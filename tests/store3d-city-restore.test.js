import { describe, it, expect } from 'vitest';
import { resolveRestore } from '../src/js/store3d/world/city.js';
import { isFree, makeNavGrid } from '../src/js/store3d/nav/path.js';
import { layoutOf } from './helpers-city.js';

describe('resolveRestore (rein)', () => {
  const L = layoutOf(200);
  const sp = L.city.spawns;

  it('Pose im Laden bleibt (freie Zelle), y = 0', () => {
    const r = resolveRestore(L, { x: L.spawn.x, z: L.spawn.z - 2, yaw: 1, pitch: 0.2 });
    expect(r).toEqual({ x: L.spawn.x, z: L.spawn.z - 2, y: 0, yaw: 1, pitch: 0.2 });
  });

  it('Pose draußen auf der Straße bleibt erhalten', () => {
    const r = resolveRestore(L, { x: sp.street.x, z: sp.street.z, yaw: 0, pitch: 0 });
    expect(r.x).toBeCloseTo(sp.street.x);
    expect(r.z).toBeCloseTo(sp.street.z);
  });

  it('Pose in der Wand wird auf den nächsten freien Punkt geschoben', () => {
    const r = resolveRestore(L, { x: L.w / 2 - 1.5, z: L.d + 0.05, yaw: 0, pitch: 0 });
    expect(isFree(L.nav, r.x, r.z)).toBe(true);
    expect(Math.hypot(r.x - (L.w / 2 - 1.5), r.z - (L.d + 0.05))).toBeLessThan(4.1);
  });

  it('Pose außerhalb der Weltgrenzen wird geklemmt und frei gesetzt', () => {
    const r = resolveRestore(L, { x: 9999, z: -9999, yaw: 0, pitch: 0 });
    expect(r.x).toBeLessThanOrEqual(L.bounds.x1);
    expect(r.z).toBeGreaterThanOrEqual(L.bounds.z0);
    expect(r.y).toBe(0);
    expect(isFree(L.nav, r.x, r.z)).toBe(true);
  });

  it('Pose auf dem Dach (y = 3,3) behält die Höhe', () => {
    const r = resolveRestore(L, { x: sp.roof.x, z: sp.roof.z, yaw: 0, pitch: 0, y: 3.3 });
    expect(r.y).toBeCloseTo(3.3, 2);
    expect(r.x).toBeCloseTo(sp.roof.x, 1);
  });

  it('unbekannte Höhe (keine Standfläche) fällt auf den Boden', () => {
    const r = resolveRestore(L, { x: sp.street.x, z: sp.street.z, yaw: 0, pitch: 0, y: 5 });
    expect(r.y).toBe(0);
    expect(isFree(L.nav, r.x, r.z)).toBe(true);
  });

  it('winzige Höhe (<= 0,25) zählt als Boden', () => {
    expect(resolveRestore(L, { x: sp.street.x, z: sp.street.z, yaw: 0, pitch: 0, y: 0.2 }).y).toBe(0);
  });

  it('Feuertreppe: y = Oberkante des Podests bleibt', () => {
    const q = L.colliders.find((c) => c.id === 'escapeL1');
    const r = resolveRestore(L, { x: (q.x0 + q.x1) / 2, z: (q.z0 + q.z1) / 2, yaw: 0, pitch: 0, y: 1.65 });
    expect(r.y).toBeCloseTo(1.65, 2);
  });

  it('NaN oder fehlende Koordinaten -> Laden-Spawn; fehlende Blickrichtung -> 0', () => {
    const a = resolveRestore(L, { x: NaN, z: 1, yaw: 0, pitch: 0 });
    expect(a).toMatchObject({ x: sp.shop.x, z: sp.shop.z, y: 0 });
    expect(resolveRestore(L, null)).toMatchObject({ x: sp.shop.x, z: sp.shop.z });
    const b = resolveRestore(L, { x: sp.street.x, z: sp.street.z });
    expect(b.yaw).toBe(0);
    expect(b.pitch).toBe(0);
  });

  it('Layout ohne city (Test-Layout): Rückfall auf das Raster', () => {
    const colliders = [{ x0: 2, z0: 2, x1: 3, z1: 3, kind: 'shelf' }];
    const nav = makeNavGrid({ x0: 0, z0: 0, x1: 10, z1: 10 }, colliders, 0.32, 0.25);
    const lay = { w: 10, d: 10, nav, colliders, spawn: { x: 5, z: 9, yaw: 0 } };
    const r = resolveRestore(lay, { x: 2.5, z: 2.5, yaw: 1, pitch: 0 });
    expect(isFree(nav, r.x, r.z)).toBe(true);
    expect(resolveRestore(lay, { x: NaN, z: 0 })).toMatchObject({ x: 5, z: 9 });
    expect(resolveRestore(lay, { x: 5, z: 5, yaw: 0, pitch: 0, y: 3.3 }).y).toBe(0);
  });
});
