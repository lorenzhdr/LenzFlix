// VIDEOTHEK LENZ: Bewegungs-/Interaktions-Fixes (Dach über dem Kopf, top:false nicht überspringbar, Sichtlinie, Zonenspalt).
import { describe, it, expect } from 'vitest';
import { Body } from '../src/js/store3d/controls/body.js';
import { pickBoxes, wallOccluders } from '../src/js/store3d/controls/pick.js';
import { areaAt } from '../src/js/store3d/world/city.js';
import { layoutOf } from './helpers-city.js';

const box = (x0, z0, x1, z1, extra = {}) => ({ x0, z0, x1, z1, ...extra });

describe('Dach über dem Kopf schiebt nie seitlich', () => {
  it('Sprung vom Tresen mit Laufrichtung bleibt unter dem Dach', () => {
    const src = [box(0, 0, 8, 8, { y1: 1.05 }), box(-1, -1, 9, 9, { y0: 3.0, y1: 3.3, kind: 'roof' })];
    const b = new Body({ src, x: 4, z: 4 });
    b.y = 1.05; b.grounded = true;
    b.jump();
    let maxDist = 0;
    for (let i = 0; i < 90; i++) {
      b.step(1 / 60, { tx: 3, tz: 0, manual: true, dirx: 1, dirz: 0 });
      maxDist = Math.max(maxDist, Math.hypot(b.x - 4, b.z - 4));
    }
    expect(b.x).toBeLessThan(8.5);
    expect(maxDist).toBeLessThan(5);
  });
});

describe('top:false ist nicht überspringbar', () => {
  it('Sprung gegen niedriges top:false-Objekt wird blockiert', () => {
    const src = [box(2, -1, 2.5, 1, { y1: 1.25, top: false })];
    const b = new Body({ src, x: 1.3, z: 0 });
    b.vx = 3;
    b.jump();
    for (let i = 0; i < 120; i++) b.step(1 / 60, { tx: 3, tz: 0, manual: true, dirx: 1, dirz: 0 });
    expect(b.x).toBeLessThan(2 - 0.28 + 0.01);
  });
  it('niedrige Kanten (<= Stufenhöhe) bleiben begehbar', () => {
    const src = [box(2, -1, 2.5, 1, { y1: 0.2, top: false })];
    const b = new Body({ src, x: 0, z: 0 });
    for (let i = 0; i < 120; i++) b.step(1 / 60, { tx: 3, tz: 0, manual: true, dirx: 1, dirz: 0 });
    expect(b.x).toBeGreaterThan(2.6);
  });
});

describe('Sichtlinie für Interaktionen', () => {
  const ia = { box: { min: { x: 0, y: 0.5, z: 0 }, max: { x: 1, y: 1.5, z: 0.3 } } };
  const wall = box(-5, -0.12, 5, 0, { kind: 'wall' });
  const occ = wallOccluders([wall, box(0, 1, 1, 2, { y1: 1, kind: 'shelf' }), box(0, 0, 1, 1, { y0: 3, y1: 4, kind: 'roof' })]);
  it('nur hohe Bodenkollider blockieren', () => { expect(occ).toEqual([wall]); });
  it('von draußen durch die Wand: nicht anvisierbar, von innen schon', () => {
    expect(pickBoxes([ia], { x: 0.5, y: 1, z: -2 }, { x: 0, y: 0, z: 1 }, 3)).not.toBeNull();
    expect(pickBoxes([ia], { x: 0.5, y: 1, z: -2 }, { x: 0, y: 0, z: 1 }, 3, occ)).toBeNull();
    expect(pickBoxes([ia], { x: 0.5, y: 1, z: 2 }, { x: 0, y: 0, z: -1 }, 3, occ)).not.toBeNull();
  });
});

describe('Sichtlinie: Requisiten verdecken ihre eigene Box nicht', () => {
  it('Sofa-Kollider (kind prop, hoch) umschließt die Box, bleibt anvisierbar', () => {
    const ia = { box: { min: { x: 6.32, y: 0.2, z: 2.65 }, max: { x: 7.22, y: 1.2, z: 4.55 } } };
    const sofa = box(6.3, 2.55, 7.24, 4.65, { kind: 'prop', y1: 3 });
    const occ = wallOccluders([sofa]);
    expect(occ).toEqual([]);
    expect(pickBoxes([ia], { x: 5, y: 1, z: 3.6 }, { x: 1, y: 0, z: 0 }, 3, occ)).not.toBeNull();
  });
});

describe('Zonen ohne Spalt zwischen Foyer und Saal', () => {
  it('Palast-Foyer und Saal grenzen lückenlos aneinander', () => {
    const L = layoutOf(200);
    const p = L.city.palast;
    for (let z = p.foyer.z0 + 0.1; z < p.hall.z0 + 0.5; z += 0.05) {
      expect(areaAt(L, (p.hall.x0 + p.hall.x1) / 2, z)).not.toBe('outside');
    }
  });
});

describe('Fahrradständer an der Hauswand', () => {
  it('ist auch beim Rennsprung (Scheitel ~1 m) nicht überspringbar', () => {
    const q = (layoutOf(200).colliders || []).find((c) => c.id === 'bikerack');
    expect(q).toBeTruthy();
    expect(q.y1).toBeGreaterThanOrEqual(1.4);
  });
});
