import { describe, it, expect } from 'vitest';
import { standSurfaces, REACH_H, JUMP_H } from '../src/js/store3d/world/city.js';
import { STEP_H, MANTLE_H } from '../src/js/store3d/nav/collide.js';
import { layoutOf } from './helpers-city.js';

// Erreichbarkeit der Standflächen: Kante-zu-Kante-Graph. Aufstieg <= STEP_H zu Fuß, <= JUMP_H + MANTLE_H (abzüglich Rand) per
// Sprung + Hochziehen; Abstieg immer. Horizontal müssen sich die Flächen auf 0,45 m nähern. Der Boden (y = 0) berührt alles.
const MARGIN = 0.1;
function gap(a, b) {
  const dx = Math.max(a.x0 - b.x1, b.x0 - a.x1, 0);
  const dz = Math.max(a.z0 - b.z1, b.z0 - a.z1, 0);
  return Math.hypot(dx, dz);
}
function reach(surfaces, { maxRise, skip = () => false }) {
  const ground = { id: 'ground', y: 0 };
  const nodes = surfaces.filter((s) => !skip(s));
  const seen = new Set([ground]);
  const queue = [ground];
  for (let h = 0; h < queue.length; h++) {
    const a = queue[h];
    for (const b of nodes) {
      if (seen.has(b)) continue;
      if (b.y - a.y > maxRise) continue;
      if (b.y0 > a.y + STEP_H + 1e-6) continue; // schwebende Fläche (Dach über dem Laden): nur von der Höhe aus betretbar
      if (a !== ground && gap(a, b) > 0.45) continue;
      seen.add(b);
      queue.push(b);
    }
  }
  return seen;
}

describe('Erreichbarkeit der Standflächen (Sprung ca. 1 m, Hochziehen 1,3 m)', () => {
  const L = layoutOf(200);
  const surfaces = standSurfaces(L);
  const byId = (id) => surfaces.find((s) => s.id === id);

  it('Konstanten: Reichweite aus dem Stand liegt zwischen 2 und 2,5 m', () => {
    expect(REACH_H).toBeGreaterThan(2.0);
    expect(REACH_H).toBeLessThan(2.5);
    expect(JUMP_H + MANTLE_H).toBeCloseTo(REACH_H);
  });

  it('Feuertreppe: das Dach ist zu Fuß (nur Stufen <= STEP_H) vom Boden aus erreichbar', () => {
    const r = reach(surfaces, { maxRise: STEP_H });
    expect(r.has(byId('escapeL1'))).toBe(true);
    expect(r.has(byId('escapeL2'))).toBe(true);
    expect(r.has(byId('roof'))).toBe(true);
  });

  it('Dach ohne Feuertreppe: vom Boden nicht erreichbar', () => {
    const r = reach(surfaces, { maxRise: REACH_H - MARGIN, skip: (s) => s.kind === 'escape' });
    expect(r.has(byId('roof'))).toBe(false);
    expect(r.has(byId('escapeL2'))).toBe(false);
  });

  it('Hof: die Kistentreppe führt auf den Container (2,6 m), direkt vom Boden geht es nicht', () => {
    const noHelp = (s) => ['crateA', 'crateB', 'crateC', 'carCabin', 'carHood', 'carTrunk'].includes(s.id);
    expect(reach(surfaces, { maxRise: REACH_H - MARGIN, skip: noHelp }).has(byId('container'))).toBe(false);
    expect(reach(surfaces, { maxRise: REACH_H - MARGIN }).has(byId('container'))).toBe(true);
    expect(byId('container').y).toBeGreaterThan(REACH_H);
  });

  it('Auto: das Autodach (1,42 m) ist erreichbar', () => {
    expect(reach(surfaces, { maxRise: REACH_H - MARGIN }).has(byId('carCabin'))).toBe(true);
    expect(byId('carCabin').y).toBeLessThan(REACH_H);
  });

  it('Treppenstufen steigen höchstens STEP_H', () => {
    const steps = ['escapeA4', 'escapeA3', 'escapeA2', 'escapeA1', 'escapeL1', 'escapeB1', 'escapeB2', 'escapeB3', 'escapeB4', 'escapeL2'].map(byId);
    for (let i = 1; i < steps.length; i++) expect(Math.abs(steps[i].y - steps[i - 1].y)).toBeLessThanOrEqual(STEP_H);
    expect(steps[0].y).toBeLessThanOrEqual(STEP_H);
  });
});
