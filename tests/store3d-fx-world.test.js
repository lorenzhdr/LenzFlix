// @vitest-environment jsdom
// VIDEOTHEK LENZ · Fix QA (world): Korbbrett-Kollider, Kiosk-Luke, Hof-Graffiti aus dem Layout, Draw-Call-Culling, Nachthimmel.
import { describe, it, expect, vi } from 'vitest';
import { layoutOf } from './helpers-city.js';
import { createWorld, DT } from '../src/js/store3d/physics/world.js';
import { skyPalette } from '../src/js/store3d/modules/m4-util.js';

vi.mock('../src/js/store3d/world/textures.js', async () => {
  const { fakeCanvas } = await import('./helpers-city.js');
  const { Texture } = await import('three');
  return { makeCanvas: (w, h) => fakeCanvas(w, h), toTexture: () => new Texture(), FONT: 'sans-serif' };
});

const { hutShell } = await import('../src/js/store3d/world/build-city.js');
const { frontOpenings, shelfRange, SHELF_FAR_LOW } = await import('../src/js/store3d/modules/city.js');
const { buildGraffiti } = await import('../src/js/store3d/discover/scene.js');

const L = layoutOf(80);
const c = L.city;
const run = (w, sec) => { for (let i = 0; i < Math.round(sec / DT); i++) w.step(DT); };

describe('Korbbrett (Q4#5)', () => {
  it('hat einen Höhen-Kollider, unter dem man durchgehen kann', () => {
    const q = c.colliders.find((k) => k.id === 'hoopBoard');
    expect(q).toBeTruthy();
    expect(q.y0).toBeGreaterThan(2);
    expect(q.top).toBe(false);
    expect(q.x1 - q.x0).toBeLessThan(0.2);
    expect(q.x0).toBeGreaterThan(c.yard.hoop.x + c.yard.hoop.ringR); // hinter dem Ring
  });
  it('ein Ball in Bretthöhe prallt am Brett ab statt hindurchzufliegen', () => {
    const q = c.colliders.find((k) => k.id === 'hoopBoard');
    const w = createWorld({ src: c.colliders.filter((k) => k.id === 'hoopBoard') });
    const y = (q.y0 + q.y1) / 2;
    const b = w.spawn({ kind: 'basketball', pos: { x: q.x0 - 1, y, z: (q.z0 + q.z1) / 2 }, vel: { x: 6, y: 0.5, z: 0 } });
    run(w, 0.8);
    expect(b.pos.x).toBeLessThan(q.x0);
    expect(b.vel.x).toBeLessThan(0);
  });
});

describe('Kiosk-Häuschen (Q4#1)', () => {
  it('Hülle hat eine offene Luke zur Straße, der Kollider bleibt voll', () => {
    const h = c.colliders.find((k) => k.id === 'kioskHut');
    expect(h.y1).toBeGreaterThan(2);
    const parts = hutShell(h);
    for (const g of parts) g.computeBoundingBox();
    const front = parts.filter((g) => g.boundingBox.max.z > h.z1 - 0.02 && g.boundingBox.min.z > h.z0 + 0.2 && g.boundingBox.max.x - g.boundingBox.min.x > 1);
    expect(front.length).toBe(2); // unter und über der Luke
    for (const g of front) expect(g.boundingBox.max.y <= 1.0 + 1e-6 || g.boundingBox.min.y >= 2.0 - 1e-6).toBe(true);
    // Verkäuferin steht hinter der Luke, im Raum der Hülle
    const v = c.kiosk.vendor;
    expect(v.z).toBeGreaterThan(h.z0 + 0.1);
    expect(v.z).toBeLessThan(h.z1 - 0.1);
  });
});

describe('Hof-Graffiti (Q4#4)', () => {
  it('buildGraffiti dreht per yaw: 0 = zur Hofseite (+z)', () => {
    const g0 = buildGraffiti({ x: 0, y: 1, z: 0 }, 2, 1, 0);
    expect(g0.rotation.y).toBe(0);
    expect(buildGraffiti({ x: 0, y: 1, z: 0 }, 2, 1).rotation.y).toBeCloseTo(Math.PI);
  });
  it('die vorbereitete Fläche liegt an der Hofwand und blickt in den Hof', () => {
    const g = c.yard.graffiti;
    expect(g.z).toBe(c.yard.z0);
    expect(g.x - g.w / 2).toBeGreaterThan(c.yard.x0);
  });
});

describe('Draw-Call-Culling (Q4#7, Q5#4)', () => {
  it('Öffnungen der Ladenfront: Tür + Schaufenster, an der Frontebene', () => {
    const o = frontOpenings(L);
    expect(o.length).toBeGreaterThanOrEqual(1);
    for (const b of o) { expect(b.min.z).toBeLessThan(L.d); expect(b.max.z).toBeGreaterThan(L.d); }
    expect(frontOpenings({ d: 5 })).toEqual([]);
  });
  it('Regalreichweite von draußen: low kürzer als sonst', () => {
    expect(shelfRange('low')).toBeLessThan(shelfRange('mid'));
    expect(SHELF_FAR_LOW).toBeGreaterThan(8);
  });
});

describe('Nachthimmel (Q5#8)', () => {
  it('ist bei Nacht am Horizont dunkel', () => {
    const lum = (c3) => 0.3 * c3[0] + 0.59 * c3[1] + 0.11 * c3[2];
    const n = skyPalette('night', false).sky;
    for (const col of n) expect(lum(col)).toBeLessThan(0.16);
    expect(lum(n[2])).toBeLessThan(lum(skyPalette('dusk', false).sky[2]));
  });
});
