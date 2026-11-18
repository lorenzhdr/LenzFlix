import { describe, it, expect } from 'vitest';
import { rayHitsHead, createLaserDwell, stepLaser } from '../src/js/store3d/npc/laser-logic.js';

describe('npc/laser-logic', () => {
  it('Strahl-Kopfkugel', () => {
    const o = { x: 0, y: 1.6, z: 0 };
    expect(rayHitsHead(o, { x: 0, y: 0, z: -1 }, { x: 0, y: 1.6, z: -5 })).toBe(true);
    expect(rayHitsHead(o, { x: 0, y: 0, z: -1 }, { x: 1, y: 1.6, z: -5 })).toBe(false);
    expect(rayHitsHead(o, { x: 0, y: 0, z: -1 }, { x: 0, y: 1.6, z: -20 })).toBe(false);
    expect(rayHitsHead(o, { x: 0, y: 0, z: -1 }, { x: 0, y: 1.6, z: 5 })).toBe(false);
  });
  it('Person: nach 0,5 s einmal blind 2 s, Reset beim Abwenden', () => {
    const s = createLaserDwell();
    expect(stepLaser(s, 0.3, 'person', true)).toEqual([]);
    expect(stepLaser(s, 0.3, 'person', true)).toEqual([{ type: 'blind', ms: 2000 }]);
    expect(stepLaser(s, 0.3, 'person', true)).toEqual([]);
    stepLaser(s, 0.1, 'person', false);
    expect(stepLaser(s, 0.6, 'person', true)).toEqual([{ type: 'blind', ms: 2000 }]);
  });
  it('Richard: Treffer; Fahrer: bremsen; Tauben: sofort einmal; Katze: Punkt jagen', () => {
    expect(stepLaser(createLaserDwell(), 0.6, 'richard', true)).toEqual([{ type: 'hit', kind: 'richard' }]);
    expect(stepLaser(createLaserDwell(), 0.6, 'driver', true)).toEqual([{ type: 'brake', decel: 9, honk: 2.5 }]);
    const p = createLaserDwell();
    expect(stepLaser(p, 0.05, 'pigeon', true)).toEqual([{ type: 'flush' }]);
    expect(stepLaser(p, 0.05, 'pigeon', true)).toEqual([]);
    expect(stepLaser(createLaserDwell(), 0.05, 'cat', true, { x: 1, z: 2 })).toEqual([{ type: 'chase', x: 1, z: 2 }]);
  });
});
