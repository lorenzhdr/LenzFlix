// Außenansicht (1.17.0): Kamera hinter dem Auge, Kollision der Strecke, Einfahren/Ausfahren, Ausblenden der Figur.
import { describe, it, expect } from 'vitest';
import { solveTpCam, signBoxes, smoothFrac, hideBody, forward, BACK, UP, EXTEND_T, HIDE_DIST } from '../src/js/store3d/char/tpcam.js';
import { createColliderIndex } from '../src/js/store3d/nav/collide.js';

const eye = { x: 10, y: 1.65, z: 10 };
const dist = (r) => Math.hypot(r.x - eye.x, r.y - eye.y, r.z - eye.z);

describe('forward', () => {
  it('yaw 0 blickt nach -z, pitch>0 nach oben', () => {
    const f = forward(0, 0);
    expect([f.x, f.y, f.z].map((v) => Math.round(v * 1e6) / 1e6)).toEqual([-0, 0, -1].map((v) => Math.round(v * 1e6) / 1e6));
    expect(forward(0, 0.5).y).toBeGreaterThan(0);
  });
});

describe('solveTpCam', () => {
  it('freie Strecke: 2,4 m hinter und 0,3 m über dem Auge', () => {
    const r = solveTpCam([], eye, 0, 0, 0);
    expect(r.hit).toBe(false);
    expect(r.frac).toBe(1);
    expect(r.x).toBeCloseTo(10, 5);
    expect(r.z).toBeCloseTo(10 + BACK, 5); // hinter dem Spieler = +z bei yaw 0
    expect(r.y).toBeCloseTo(1.65 + UP, 5);
  });
  it('folgt yaw (Blick nach links → Kamera rechts hinter dem Auge)', () => {
    const r = solveTpCam([], eye, Math.PI / 2, 0, 0); // blickt nach -x
    expect(r.x).toBeCloseTo(10 + BACK, 5);
    expect(r.z).toBeCloseTo(10, 5);
  });
  it('Wand dazwischen: Kamera wird eingezogen (vor der Wand, mit Puffer)', () => {
    const wall = { x0: 8, z0: 11.2, x1: 12, z1: 11.6, y1: 3 };
    const r = solveTpCam([wall], eye, 0, 0, 0);
    expect(r.hit).toBe(true);
    expect(r.frac).toBeLessThan(0.6);
    expect(r.z).toBeLessThan(11.2); // vor der Wand
    expect(dist(r)).toBeLessThan(BACK - 0.5);
  });
  it('gleiche Wand über den Index (layout.cidx)', () => {
    const wall = { x0: 8, z0: 11.2, x1: 12, z1: 11.6, y1: 3 };
    const idx = createColliderIndex([wall]);
    const a = solveTpCam(idx, eye, 0, 0, 0);
    const b = solveTpCam([wall], eye, 0, 0, 0);
    expect(a.frac).toBeCloseTo(b.frac, 6);
  });
  it('Höhen: niedriger Kollider unter der Strecke und dynamische Kollider blockieren nicht', () => {
    const low = { x0: 8, z0: 11.2, x1: 12, z1: 11.6, y1: 0.3 };
    expect(solveTpCam([low], eye, 0, 0, 0).hit).toBe(false);
    const dyn = { x0: 8, z0: 11.2, x1: 12, z1: 11.6, y1: 3, dynamic: true };
    expect(solveTpCam([dyn], eye, 0, 0, 0).hit).toBe(false);
  });
  it('seitlich vorbei: kein Treffer', () => {
    const wall = { x0: 20, z0: 11.2, x1: 24, z1: 11.6, y1: 3 };
    expect(solveTpCam([wall], eye, 0, 0, 0).hit).toBe(false);
  });
  it('Auge im Kollider: Strecke geschlossen (frac 0), nie NaN', () => {
    const box = { x0: 9, z0: 9, x1: 11, z1: 11, y1: 3 };
    const r = solveTpCam([box], eye, 0, 0, 0);
    expect(r.frac).toBe(0);
    expect(Number.isFinite(r.x)).toBe(true);
  });
  it('Blick steil nach oben: Kamera bleibt über dem Boden', () => {
    const r = solveTpCam([], eye, 0, 1.4, 0);
    expect(r.y).toBeGreaterThanOrEqual(0.12 - 1e-9);
  });
  it('Decke über der Kamera begrenzt die Höhe', () => {
    const roof = { x0: 0, z0: 0, x1: 30, z1: 30, y0: 2.2, y1: 2.4 }; // Dach/Decke
    const r = solveTpCam([roof], eye, 0, -0.9, 0); // Blick nach unten → Kamera steigt
    expect(r.y).toBeLessThanOrEqual(2.2);
  });
});

describe('smoothFrac / hideBody', () => {
  it('einziehen sofort, ausfahren in EXTEND_T s', () => {
    expect(smoothFrac(1, 0.3, 0.016)).toBe(0.3);
    expect(smoothFrac(0.3, 1, EXTEND_T / 2)).toBeCloseTo(0.8, 6);
    expect(smoothFrac(0, 1, EXTEND_T)).toBeCloseTo(1, 6);
    expect(smoothFrac(0.9, 1, 1)).toBe(1);
    expect(smoothFrac(NaN, 0.7, 0.1)).toBe(0.7);
  });
  it('unter 0,7 m ausblenden (mit Hysterese)', () => {
    expect(hideBody(HIDE_DIST - 0.01)).toBe(true);
    expect(hideBody(HIDE_DIST + 0.01)).toBe(false);
    expect(hideBody(HIDE_DIST + 0.05, true)).toBe(true);
    expect(hideBody(HIDE_DIST + 0.2, true)).toBe(false);
  });
});

describe('Schilder als Hindernisse und Schulterblick', () => {
  it('signBoxes: hängendes Schild (yaw 0), Wandschild entlang z (yaw ±π/2), Ladenschild samt Markise', () => {
    const b = signBoxes({
      signs: [{ x: 5, z: 3, y: 2.4, w: 2, yaw: 0, kind: 'hang' }, { x: 0.03, z: 8, y: 2.5, w: 1.6, yaw: Math.PI / 2, kind: 'wall' }],
      city: { signs: [{ x: 20, z: 30, y: 3, w: 3, yaw: Math.PI }], shopFronts: [{ x: -9, z: 22.8, y: 3.5, w: 5, yaw: 0 }] },
    });
    expect(b).toHaveLength(5);
    expect(b[0].x1 - b[0].x0).toBeGreaterThan(2);
    expect(b[0].z1 - b[0].z0).toBeLessThan(0.3);
    expect(b[1].z1 - b[1].z0).toBeGreaterThan(1.6);
    expect(b[1].x1 - b[1].x0).toBeLessThan(0.3);
    expect(b[4].y0).toBeLessThan(2.7); // Markise
    expect(signBoxes(null)).toEqual([]);
  });

  it('Kamera stoppt vor einem Neonschild hinter dem Auge', () => {
    const extra = signBoxes({ signs: [{ x: 10, z: 12, y: 1.9, w: 2, yaw: 0, kind: 'hang' }] });
    const free = solveTpCam([], eye, 0, 0, 0);
    expect(free.hit).toBe(false);
    const r = solveTpCam([], eye, 0, 0, 0, { extra });
    expect(r.hit).toBe(true);
    expect(r.z).toBeLessThan(12 - 0.05);
    expect(r.frac).toBeLessThan(1);
  });

  it('eingezogen: Schulterblick (lift > 0), frei: lift 0', () => {
    const wall = [{ x0: 0, z0: 10.5, x1: 20, z1: 12, y0: 0, y1: 4 }];
    const r = solveTpCam(wall, eye, 0, 0, 0);
    expect(r.hit).toBe(true);
    expect(r.lift).toBeGreaterThan(0);
    expect(solveTpCam([], eye, 0, 0, 0).lift).toBe(0);
  });
});
