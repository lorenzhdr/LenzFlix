// 1.19.0 W6-Fix Rowdys: Feuertreppe (Höhe, Sperrflächen), Körperradius, Ausweichen am Pfosten. Reine Logik, kein Netz.
import { describe, it, expect } from 'vitest';
import { buildCity } from '../src/js/store3d/world/city.js';
import { gangEnv } from '../src/js/store3d/modules/gang.js';
import { gangAreaOk, createRowdy, stepRowdy, BODY_R, REACH_Y } from '../src/js/store3d/npc/gang-logic.js';

const W = 12.5;
const D = 18;
const city = buildCity({ w: W, d: D, door: { x0: W / 2 - 1.1, x1: W / 2 + 1.1 } });
const env = gangEnv(city);

function run(m, player, steps, dt = 0.1) {
  const ev = [];
  for (let i = 0; i < steps; i++) ev.push(...stepRowdy(m, dt, { ...env, player }));
  return ev;
}

describe('gang W6-Fix: Feuertreppe', () => {
  it('jeder Stufenblock ist Sperrfläche, die Zone ist nicht mehr begehbar, aber Ziel-Bereich', () => {
    const blocks = city.colliders.filter((c) => c.kind === 'escape');
    expect(blocks.length).toBeGreaterThan(5);
    for (const c of blocks) {
      const x = (c.x0 + c.x1) / 2; const z = (c.z0 + c.z1) / 2;
      expect(gangAreaOk(x, z, env.allowed, env.forbidden)).toBe(false);
      expect(gangAreaOk(x, z, env.playerAllowed, env.playerForbidden)).toBe(true);
    }
    for (const s of env.spots) expect(gangAreaOk(s.x, s.z, env.allowed, env.forbidden)).toBe(true);
  });

  it('Spieler oben (y > REACH_Y): kein Schlag, der Rowdy pöbelt am Rand und kommt nicht in die Stufen', () => {
    const L1 = city.colliders.find((c) => c.id === 'escapeL1');
    const px = (L1.x0 + L1.x1) / 2;
    const m = createRowdy(0, { x: px, z: -4.5 });
    const ev = run(m, { x: px, z: -0.87, y: 1.65, safe: false }, 600);
    expect(ev.filter((e) => e.type === 'strike')).toHaveLength(0);
    expect(ev.filter((e) => e.type === 'say' && e.cat === 'taunt').length).toBeGreaterThan(1);
    expect(m.z).toBeLessThan(L1.z0 - BODY_R + 1e-6);
    expect(gangAreaOk(m.x, m.z, env.allowed, env.forbidden)).toBe(true);
  });

  it('derselbe Spieler am Boden (y 0) wird weiterhin geschlagen', () => {
    const m = createRowdy(0, { x: 2, z: -4 });
    m.speed = 1.5;
    const ev = run(m, { x: 3.5, z: -3.2, y: 0, safe: false }, 300);
    expect(ev.filter((e) => e.type === 'strike').length).toBeGreaterThan(0);
    expect(REACH_Y).toBeGreaterThan(0.3);
  });
});

describe('gang W6-Fix: Körperradius und Ausweichen', () => {
  it('Kreisprüfung: Mittelpunkt neben dem Hindernis, aber innerhalb des Körperradius, ist verboten', () => {
    const f = [{ x0: 0, z0: 0, x1: 2, z1: 2, r: 0.3 }];
    const a = [{ x0: -5, z0: -5, x1: 5, z1: 5 }];
    expect(gangAreaOk(2.2, 1, a, f)).toBe(false);
    expect(gangAreaOk(2.31, 1, a, f)).toBe(true);
    expect(gangAreaOk(2.25, 2.25, a, f)).toBe(true); // Ecke: Kreis statt Quadrat
    expect(gangAreaOk(1, 1, a, f)).toBe(false);
  });

  it('alle festen Hindernisse tragen den Körperradius; Laden/Tür behalten WALL_GROW ohne r', () => {
    expect(env.forbidden.filter((f) => f.r === BODY_R).length).toBeGreaterThan(10);
    expect(env.forbidden.filter((f) => !f.r)).toHaveLength(2);
  });

  it('Rowdy bleibt beim Laufen zum Spieler in keinem Hindernis (Radius) und kommt am Pfosten vorbei', () => {
    const post = env.forbidden.find((f) => f.r && f.x1 - f.x0 < 0.2 && f.z1 - f.z0 < 0.2);
    expect(post).toBeTruthy();
    const cz = (post.z0 + post.z1) / 2;
    const m = createRowdy(0, { x: post.x0 - 2, z: cz });
    m.speed = 1.5;
    const ev = [];
    for (let i = 0; i < 300; i++) {
      ev.push(...stepRowdy(m, 0.1, { ...env, player: { x: post.x1 + 2, z: cz, y: 0, safe: false } }));
      expect(gangAreaOk(m.x, m.z, env.allowed, env.forbidden)).toBe(true);
    }
    expect(ev.filter((e) => e.type === 'strike').length).toBeGreaterThan(0);
  });
});

describe('gang W6-Fix: Dauerlauf (Ersatz für die Harness-Messung, Logik)', () => {
  it('2 min, Spieler läuft eine Runde durch Hof/Gasse: nie in Hindernissen, nie > 20 s still ohne Pöbeln/Rückzug', () => {
    const route = [[2, -3], [8, -9], [9, -3], [-1, 4], [-1, 12], [5, -7], [10.5, -0.87]];
    for (const seed of [0, 1, 2, 3]) {
      const ms = env.spots.filter((_, i) => i % 7 === seed).slice(0, 3).map((p, i) => createRowdy(i, p));
      const still = ms.map(() => ({ x: 0, z: 0, t: 0, taunted: 0 }));
      let leg = 0; let px = route[0][0]; let pz = route[0][1];
      for (let step = 0; step < 1200; step++) {
        const dt = 0.1;
        const tgt = route[leg % route.length];
        const dd = Math.hypot(tgt[0] - px, tgt[1] - pz);
        if (dd < 0.2) leg++; else { px += ((tgt[0] - px) / dd) * 1.8 * dt; pz += ((tgt[1] - pz) / dd) * 1.8 * dt; }
        ms.forEach((m, k) => {
          const ev = stepRowdy(m, dt, { ...env, player: { x: px, z: pz, y: pz > -1.5 && pz < -0.15 && px > 3.8 ? 1.65 : 0, safe: false } });
          expect(gangAreaOk(m.x, m.z, env.allowed, env.forbidden)).toBe(true);
          const s = still[k];
          if (Math.hypot(m.x - s.x, m.z - s.z) > 0.05 || ev.length || m.st === 'idle' || m.st === 'taunt' || m.st === 'threaten' || m.st === 'flee') { s.x = m.x; s.z = m.z; s.t = 0; } else s.t += dt;
          expect(s.t).toBeLessThan(20);
        });
      }
    }
  });
});
