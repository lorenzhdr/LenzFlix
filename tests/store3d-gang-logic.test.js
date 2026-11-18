import { describe, it, expect } from 'vitest';
import { spawnCount, gangAreaOk, spawnPlan, createGang, stepRowdy, hitRowdy, ROWDY_HP } from '../src/js/store3d/npc/gang-logic.js';

const allowed = [{ x0: 0, z0: 0, x1: 10, z1: 10 }];
const forbidden = [{ x0: 4, z0: 4, x1: 6, z1: 6 }];
const spots = [{ x: 1, z: 1 }, { x: 2, z: 8 }, { x: 8, z: 2 }, { x: 9, z: 9 }];

describe('npc/gang-logic', () => {
  it('Spawn-Regel', () => {
    for (let s = 0; s < 50; s++) {
      expect([2, 3]).toContain(spawnCount('night', s));
      expect([0, 1]).toContain(spawnCount('day', s));
    }
    expect(spawnCount('day', 5)).toBe(spawnCount('day', 5));
    let day = 0; for (let s = 0; s < 500; s++) day += spawnCount('day', s);
    expect(day).toBeLessThan(200);
  });
  it('Bereich: Zone, 6 m in die Straße, nie verboten', () => {
    expect(gangAreaOk(1, 1, allowed, forbidden)).toBe(true);
    expect(gangAreaOk(15, 5, allowed, forbidden)).toBe(true);
    expect(gangAreaOk(16.5, 5, allowed, forbidden)).toBe(false);
    expect(gangAreaOk(5, 5, allowed, forbidden)).toBe(false);
  });
  it('Spawn-Plan deterministisch, ohne Doppelte', () => {
    const a = spawnPlan(3, 3, spots);
    expect(a).toEqual(spawnPlan(3, 3, spots));
    expect(new Set(a).size).toBe(3);
  });
  it('Ablauf: idle → approach → taunt → threaten → attack → Schlag', () => {
    const g = createGang(1, 1, [{ x: 1, z: 1 }]);
    const m = g.members[0];
    const env = { allowed, forbidden, player: { x: 8, z: 1, safe: false } };
    const seen = new Set();
    const evs = [];
    for (let i = 0; i < 400; i++) { seen.add(m.st); evs.push(...stepRowdy(m, 0.1, env)); }
    for (const s of ['approach', 'taunt', 'threaten', 'attack']) expect(seen.has(s)).toBe(true);
    expect(evs.some((e) => e.type === 'say' && e.cat === 'taunt')).toBe(true);
    expect(evs.some((e) => e.type === 'strike')).toBe(true);
    expect(gangAreaOk(m.x, m.z, allowed, forbidden)).toBe(true);
  });
  it('geschützter Spieler: Rowdy lässt ab', () => {
    const m = createGang(1, 1, [{ x: 1, z: 1 }]).members[0];
    m.st = 'attack';
    stepRowdy(m, 0.1, { allowed, forbidden, player: { x: 2, z: 1, safe: true } });
    expect(m.st).toBe('idle');
  });
  it('niedrige hp → Flucht mit Ereignis gang-flee, hp 0 → beaten', () => {
    const m = createGang(1, 1, [{ x: 1, z: 1 }]).members[0];
    m.st = 'attack';
    expect(hitRowdy(m, ROWDY_HP * 0.8)).toEqual([{ type: 'gang-flee', i: 0 }]);
    expect(m.st).toBe('flee');
    const n = createGang(1, 1, [{ x: 1, z: 1 }]).members[0];
    expect(hitRowdy(n, 999)).toEqual([{ type: 'beaten', i: 0 }]);
  });
});
