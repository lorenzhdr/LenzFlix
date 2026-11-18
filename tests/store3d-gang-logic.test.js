import { describe, it, expect } from 'vitest';
import { spawnCount, gangAreaOk, spawnPlan, createGang, stepRowdy, hitRowdy, ROWDY_HP, STUCK_TAUNT_S, STUCK_GIVE_UP_S } from '../src/js/store3d/npc/gang-logic.js';

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

describe('npc/gang-logic 1.18.1: versperrter Weg', () => {
  // Gasse links (x 0..10), Spieler rechts davon auf dem Gehweg; eine Wand quer im Weg (x 11..12, z 0..20)
  const al = [{ x0: 0, z0: 0, x1: 10, z1: 10 }];
  const wall = { x0: 11, z0: -10, x1: 12, z1: 20 };
  it('gleitet an einer Ecke entlang, statt stehen zu bleiben', () => {
    const m = createGang(1, 1, [{ x: 5, z: 3 }]).members[0];
    // Ecke des verbotenen Rechtecks (4..6) liegt diagonal im Weg; Ziel rechts oben
    const env = { allowed: al, forbidden: [{ x0: 6, z0: 4, x1: 8, z1: 6 }], player: { x: 9, z: 7, safe: false } };
    m.st = 'approach';
    for (let i = 0; i < 60 && m.st === 'approach'; i++) stepRowdy(m, 0.1, env);
    expect(m.st).toBe('taunt');
    expect(Math.hypot(9 - m.x, 7 - m.z)).toBeLessThan(3.2);
    expect(gangAreaOk(m.x, m.z, al, env.forbidden)).toBe(true);
  });
  it('kommt nicht durch die Wand: pöbelt nach STUCK_TAUNT_S am Rand (Abstand < 9 m)', () => {
    const m = createGang(1, 1, [{ x: 9, z: 5 }]).members[0];
    const env = { allowed: al, forbidden: [wall], player: { x: 15, z: 5, safe: false } };
    const evs = [];
    for (let i = 0; i < 50; i++) evs.push(...stepRowdy(m, 0.1, env));
    expect(m.x).toBeLessThan(11);
    expect(evs.some((e) => e.type === 'say' && e.cat === 'taunt')).toBe(true);
    expect(['taunt', 'threaten', 'attack']).toContain(m.st);
  });
  it('Spieler leicht versetzt hinter der Wand: kein Pendeln um die Zielkoordinate, pöbelt nach ~3 s (dt 0,1 und 1/60)', () => {
    for (const dt of [0.1, 1 / 60]) {
      const m = createGang(1, 1, [{ x: 9, z: 5 }]).members[0];
      const env = { allowed: al, forbidden: [wall], player: { x: 15, z: 5.3, safe: false } };
      let at = -1;
      for (let t = 0; t < 6 && at < 0; t += dt) { stepRowdy(m, dt, env); if (m.st === 'taunt') at = t; }
      expect(at).toBeGreaterThan(0);
      expect(at).toBeLessThan(4);
      expect(m.x).toBeLessThan(11);
    }
  });
  it('bleibt nicht ewig im Angriff hängen: gibt nach STUCK_GIVE_UP_S auf, geht zurück, keine Schläge durch die Wand', () => {
    const m = createGang(1, 1, [{ x: 9, z: 5 }]).members[0];
    const env = { allowed: al, forbidden: [wall], player: { x: 15, z: 5, safe: false } };
    const evs = [];
    const states = [];
    for (let i = 0; i < 160; i++) { evs.push(...stepRowdy(m, 0.1, env)); states.push(m.st); }
    const firstAttack = states.indexOf('attack');
    expect(firstAttack).toBeGreaterThan(0);
    expect(states.slice(firstAttack).includes('idle')).toBe(true);
    expect(evs.some((e) => e.type === 'strike')).toBe(false);
    expect(STUCK_GIVE_UP_S).toBeGreaterThan(STUCK_TAUNT_S);
  });
  it('weit weg und versperrt (≥ 9 m): bleibt im Anlauf, pöbelt nicht ins Leere', () => {
    const m = createGang(1, 1, [{ x: 1, z: 5 }]).members[0];
    const env = { allowed: al, forbidden: [{ x0: 2, z0: -10, x1: 3, z1: 20 }], player: { x: 12, z: 5, safe: false } };
    const evs = [];
    for (let i = 0; i < 50; i++) evs.push(...stepRowdy(m, 0.1, env));
    expect(m.st).toBe('approach');
    expect(evs).toHaveLength(0);
  });
});
