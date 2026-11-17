import { describe, it, expect } from 'vitest';
import { buildCity, cityFrame, T, JUMP_H, REACH_H, standSurfaces } from '../src/js/store3d/world/city.js';
import { colliderBlocks, groundHeight } from '../src/js/store3d/nav/collide.js';
import { overlap, layoutOf } from './helpers-city.js';

const SIZES = [];
for (const w of [12.5, 16, 24]) for (const d of [18, 26, 40]) SIZES.push([w, d]);
const doorOf = (W) => ({ x0: W / 2 - 1.1, x1: W / 2 + 1.1 });
const make = (W, D) => buildCity({ w: W, d: D, door: doorOf(W) });

describe('buildCity (rein)', () => {
  for (const [W, D] of SIZES) {
    describe(`W=${W} D=${D}`, () => {
      const c = make(W, D);

      it('ist deterministisch und JSON-sicher (kein Infinity/NaN, keine Funktionen)', () => {
        const a = JSON.stringify(c);
        expect(JSON.stringify(make(W, D))).toBe(a);
        const bad = [];
        const scan = (v, path) => {
          if (typeof v === 'number' && !Number.isFinite(v)) bad.push(path);
          else if (typeof v === 'function') bad.push(path);
          else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) scan(x, `${path}.${k}`);
        };
        scan(c, 'city');
        expect(bad).toEqual([]);
        expect(JSON.parse(a).colliders.length).toBe(c.colliders.length);
      });

      it('Gebäude, Palast-Wände und Straßenmöbel überlappen sich nicht', () => {
        const solid = c.colliders.filter((q) => q.kind === 'building' || (q.kind === 'wall' && q.id.startsWith('palast')) || q.kind === 'hut' || q.kind === 'kioskcounter');
        for (let i = 0; i < solid.length; i++) for (let j = i + 1; j < solid.length; j++) {
          if (solid[i].id.startsWith('palast') && solid[j].id.startsWith('palast')) continue; // Palast-Wandstücke stoßen absichtlich zusammen
          expect(overlap(solid[i], solid[j]), `${solid[i].id}/${solid[j].id}`).toBe(false);
        }
        const things = c.colliders.filter((q) => ['bench', 'phone', 'busstop', 'mailbox', 'hydrant', 'bin', 'bollard', 'pole'].includes(q.kind));
        for (const f of things) for (const b of solid) expect(overlap(f, b), `${f.id}/${b.id}`).toBe(false);
      });

      it('Palast-Breite geklemmt, Palast liegt zwischen den Südhäusern', () => {
        expect(c.frame.PW).toBeGreaterThanOrEqual(20);
        expect(c.frame.PW).toBeLessThanOrEqual(28);
        expect(c.frame.px1).toBeLessThanOrEqual(W + 11.6);
        expect(c.palast.rect.z1).toBeLessThan(c.frame.ZW1);
      });

      it('Spawns stehen in keinem Kollider (Dach nur auf der Plattform)', () => {
        for (const [id, s] of Object.entries(c.spawns)) {
          expect(s.x).toBeGreaterThan(c.bounds.x0);
          expect(s.x).toBeLessThan(c.bounds.x1);
          const y = s.y || 0;
          for (const q of c.colliders) {
            if (q.kind === 'door') continue;
            const inside = s.x > q.x0 && s.x < q.x1 && s.z > q.z0 && s.z < q.z1;
            if (inside) expect(colliderBlocks(q, y), `${id} in ${q.id}`).toBe(false);
          }
        }
        const r = c.spawns.roof;
        const g = groundHeight(r.x, r.z, 0.28, r.y, c.colliders);
        expect(g.y).toBeCloseTo(r.y, 2);
      });

      it('Zonen liegen in den Weltgrenzen und haben x/z/yaw/label (Debug-Liste)', () => {
        for (const z of Object.values(c.zones)) {
          expect(z.rect.x0, z.id).toBeGreaterThanOrEqual(c.bounds.x0);
          expect(z.rect.x1, z.id).toBeLessThanOrEqual(c.bounds.x1);
          expect(z.rect.z0, z.id).toBeGreaterThanOrEqual(c.bounds.z0);
          expect(z.rect.z1, z.id).toBeLessThanOrEqual(c.bounds.z1);
          expect(Number.isFinite(z.x) && Number.isFinite(z.z) && Number.isFinite(z.yaw), z.id).toBe(true);
          expect(typeof z.label).toBe('string');
        }
        for (const id of ['store', 'street', 'theft', 'doorway', 'roof', 'yard', 'alley', 'escape', 'kiosk', 'palastHall', 'palastFoyer']) expect(c.zones[id], id).toBeTruthy();
      });

      it('Kollider: y0 >= 0, y1 > y0, Dach und Brüstung schweben', () => {
        for (const q of c.colliders) {
          expect(q.y0 === undefined || q.y0 >= 0, q.id).toBe(true);
          if (q.y1 !== undefined) expect(q.y1, q.id).toBeGreaterThan(q.y0 || 0);
          expect(q.x1 > q.x0 && q.z1 > q.z0, q.id).toBe(true);
        }
        expect(c.colliders.find((q) => q.id === 'roof').y0).toBeGreaterThan(2);
        expect(c.colliders.find((q) => q.id === 'parapetN1').top).toBe(false);
      });

      it('Fußwege, Entdeckungs- und Requisitenplätze liegen in den Weltgrenzen', () => {
        for (const p of c.sidewalkPaths) for (const q of p.pts) expect(q.x > c.bounds.x0 && q.x < c.bounds.x1 && q.z > c.bounds.z0 && q.z < c.bounds.z1, p.id).toBe(true);
        for (const p of c.sidewalkPaths) expect(p.waits.length, p.id).toBe(p.pts.length - 1);
        for (const s of [...c.discoverSlots, ...c.propSlots]) expect(s.x > c.bounds.x0 && s.x < c.bounds.x1, s.id).toBe(true);
      });
    });
  }

  it('Rahmen: Palast-Tür gegenüber der Ladentür, Gehwege/Fahrbahn wie draußen vor 1.15.0', () => {
    const f = cityFrame(12.5, 18);
    expect(f.curbZ).toBeCloseTo(20.6);
    expect(f.roadZ0).toBeCloseTo(20.75);
    expect(f.roadZ1).toBeCloseTo(26.5);
    expect(f.sz).toBeCloseTo(28.7);
    const c = make(12.5, 18);
    expect((c.palast.doorX0 + c.palast.doorX1) / 2).toBeCloseTo(12.5 / 2);
  });

  it('Konstanten stammen aus nav/collide.js (Sprunghöhe ≈ 1 m)', () => {
    expect(JUMP_H).toBeGreaterThan(0.95);
    expect(JUMP_H).toBeLessThan(1.05);
    expect(REACH_H).toBeGreaterThan(2.2);
    expect(T).toBe(0.12);
  });

  it('standSurfaces: Oberseiten endlicher, begehbarer Kollider bis 3,5 m', () => {
    const L = layoutOf(80);
    const s = standSurfaces(L);
    expect(s.some((q) => q.id === 'roof' && Math.abs(q.y - 3.3) < 1e-9)).toBe(true);
    expect(s.every((q) => q.y <= 3.5 && q.y > 0)).toBe(true);
    expect(s.some((q) => q.kind === 'parapet')).toBe(false); // top:false
    expect(s.some((q) => q.kind === 'shelf')).toBe(false);
  });
});
