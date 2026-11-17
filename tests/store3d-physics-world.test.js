import { describe, it, expect } from 'vitest';
import { createWorld, orientationOf, queryColliders, DT } from '../src/js/store3d/physics/world.js';
import { createColliderIndex } from '../src/js/store3d/nav/collide.js';

const run = (w, sec) => { for (let i = 0; i < Math.round(sec / DT); i++) w.step(DT); };
const ball = (w, over = {}) => w.spawn({ kind: 'basketball', pos: { x: 0, y: 2, z: 0 }, ...over });

describe('Physik-Kern', () => {
  it('fällt, prallt ab und kommt zur Ruhe (schläft)', () => {
    const w = createWorld({ src: [] });
    const b = ball(w);
    let minY = Infinity;
    let bounced = false;
    let prevVy = 0;
    for (let i = 0; i < 60 * 8; i++) {
      w.step(DT);
      minY = Math.min(minY, b.pos.y);
      if (prevVy < 0 && b.vel.y > 0) bounced = true;
      prevVy = b.vel.y;
    }
    expect(bounced).toBe(true);
    expect(minY).toBeGreaterThanOrEqual(0.12 - 1e-6);
    expect(b.sleeping).toBe(true);
    expect(b.pos.y).toBeCloseTo(0.12, 2);
  });

  it('Akkumulator ist deterministisch: gleiche Zeit in anderen Häppchen = gleiches Ergebnis', () => {
    const a = createWorld({ src: [] });
    const c = createWorld({ src: [] });
    const ba = ball(a, { vel: { x: 2, y: 3, z: 1 } });
    const bc = ball(c, { vel: { x: 2, y: 3, z: 1 } });
    for (let i = 0; i < 60; i++) a.step(1 / 60);
    for (let i = 0; i < 20; i++) c.step(1 / 20);
    expect(bc.pos.x).toBeCloseTo(ba.pos.x, 5);
    expect(bc.pos.y).toBeCloseTo(ba.pos.y, 5);
    expect(a.step(0.5)).toBeLessThanOrEqual(6);
  });

  it('landet auf einem Höhen-Kollider (Kiste)', () => {
    const crate = { x0: -1, z0: -1, x1: 1, z1: 1, y1: 1.1 };
    const w = createWorld({ src: createColliderIndex([crate]) });
    const b = ball(w, { pos: { x: 0, y: 3, z: 0 } });
    run(w, 4);
    expect(b.pos.y).toBeCloseTo(1.1 + 0.12, 2);
    expect(b.sleeping).toBe(true);
  });

  it('prallt an einer Wand ab, überrollt niedrige Kanten', () => {
    const wall = { x0: 1, z0: -5, x1: 1.2, z1: 5, y1: 2 };
    const w = createWorld({ src: [wall] });
    const b = ball(w, { pos: { x: 0, y: 0.5, z: 0 }, vel: { x: 6, y: 0, z: 0 } });
    run(w, 0.6);
    expect(b.vel.x).toBeLessThan(0);
    expect(b.pos.x).toBeLessThan(1);
    const w2 = createWorld({ src: [{ x0: 1, z0: -5, x1: 1.2, z1: 5, y1: 0.1 }] });
    const c = w2.spawn({ kind: 'basketball', pos: { x: 0, y: 0.12, z: 0 }, vel: { x: 4, y: 0, z: 0 } });
    run(w2, 1);
    expect(c.pos.x).toBeGreaterThan(1.3);
  });

  it('dünne Wand wird bei hoher Geschwindigkeit nicht durchtunnelt', () => {
    const wall = { x0: 2, z0: -5, x1: 2.08, z1: 5, y1: 3 };
    const w = createWorld({ src: [wall] });
    const b = ball(w, { pos: { x: 0, y: 1, z: 0 }, vel: { x: 16, y: 0, z: 0 } });
    run(w, 0.5);
    expect(b.pos.x).toBeLessThan(2);
  });

  it('Decke stoppt einen Wurf nach oben', () => {
    const w = createWorld({ src: [{ x0: -5, z0: -5, x1: 5, z1: 5, y0: 3, y1: 3.3 }] });
    const b = ball(w, { pos: { x: 0, y: 1.5, z: 0 }, vel: { x: 0, y: 12, z: 0 } });
    let max = 0;
    for (let i = 0; i < 90; i++) { w.step(DT); max = Math.max(max, b.pos.y); }
    expect(max).toBeLessThanOrEqual(3 - 0.12 + 1e-6);
  });

  it('Kugel-Kugel: Impuls wird übertragen, ruhende Kugel wacht auf', () => {
    const w = createWorld({ src: [] });
    const a = w.spawn({ kind: 'basketball', pos: { x: 0, y: 0.12, z: 0 }, vel: { x: 4, y: 0, z: 0 } });
    const c = w.spawn({ kind: 'basketball', pos: { x: 1, y: 0.12, z: 0 }, sleeping: true });
    run(w, 0.5);
    expect(c.sleeping).toBe(false);
    expect(c.pos.x).toBeGreaterThan(1.2);
    expect(a.vel.x).toBeLessThan(c.vel.x + 1e-6);
  });

  it('Dosen stapeln und die obere fällt, wenn die untere weggeschoben wird', () => {
    const w = createWorld({ src: [] });
    const lo = w.spawn({ kind: 'can', pos: { x: 0, y: 0.06, z: 0 }, sleeping: true });
    const up = w.spawn({ kind: 'can', pos: { x: 0, y: 0.182, z: 0 }, sleeping: true });
    run(w, 1);
    expect(up.sleeping).toBe(true);
    expect(up.pos.y).toBeGreaterThan(0.17);
    w.impulse(lo, { x: 3, y: 0, z: 0 });
    expect(up.sleeping).toBe(false);
    run(w, 1.5);
    expect(up.pos.y).toBeCloseTo(0.06, 1);
  });

  it('Spieler schubst Objekte an', () => {
    const w = createWorld({ src: [] });
    const b = w.spawn({ kind: 'soccer', pos: { x: 0.4, y: 0.11, z: 0 }, sleeping: true });
    for (let i = 0; i < 30; i++) { w.setPlayer({ x: i * 2.5 * DT, z: 0, y: 0, vx: 2.5, vz: 0 }); w.step(DT); }
    expect(b.sleeping).toBe(false);
    expect(b.pos.x).toBeGreaterThan(0.6);
  });

  it('Mülltonne kippt bei starkem Stoß um und liegt danach niedriger', () => {
    const w = createWorld({ src: [] });
    const bin = w.spawn({ kind: 'bin', pos: { x: 0, y: 0.475, z: 0 }, sleeping: true });
    w.impulse(bin, { x: 3, y: 0, z: 0 });
    run(w, 2);
    expect(bin.tipA).toBeCloseTo(Math.PI / 2, 2);
    expect(bin.hy).toBeCloseTo(0.3, 2);
    expect(bin.pos.y).toBeCloseTo(0.3, 1);
    const q = orientationOf(bin);
    expect(Math.hypot(q.x, q.y, q.z, q.w)).toBeCloseTo(1, 5);
  });

  it('maxActive begrenzt wache Körper am Boden', () => {
    const w = createWorld({ src: [], maxActive: 3 });
    for (let i = 0; i < 8; i++) w.spawn({ kind: 'cone', pos: { x: i, y: 0.225, z: 0 }, vel: { x: 0.5, y: 0, z: 0 } });
    run(w, 0.3);
    expect(w.awakeCount()).toBeLessThanOrEqual(3);
  });

  it('spawn gibt immer einen Körper; ttl entfernt; reset setzt zurück', () => {
    const w = createWorld({ src: [] });
    const b = w.spawn({ kind: 'unbekannt', shape: 'sphere', radius: 0.2, pos: { x: 1, y: 1, z: 1 }, ttl: 0.2 });
    expect(b.id).toBeGreaterThan(0);
    expect(w.count()).toBe(1);
    run(w, 0.5);
    expect(w.count()).toBe(0);
    const c = w.spawn({ kind: 'soccer', pos: { x: 2, y: 0.11, z: 2 } });
    w.setHome(c, 2, 0.11, 2);
    c.pos.x = 9;
    expect(w.reset(c)).toBe(true);
    expect(c.pos.x).toBe(2);
    expect(c.sleeping).toBe(true);
  });

  it('onHit meldet die Wand', () => {
    const w = createWorld({ src: [{ x0: 1, z0: -5, x1: 1.2, z1: 5, y1: 2 }] });
    const hits = [];
    w.spawn({ kind: 'basketball', pos: { x: 0, y: 0.5, z: 0 }, vel: { x: 7, y: 0, z: 0 }, onHit: (i) => hits.push(i) });
    run(w, 0.5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].speed).toBeGreaterThan(1);
    expect(hits[0].player).toBe(false);
  });

  it('queryColliders versteht Array, Index und { index, dyn }', () => {
    const q = { x0: 0, z0: 0, x1: 1, z1: 1, y1: 1 };
    const dyn = { x0: 5, z0: 5, x1: 6, z1: 6, dynamic: true };
    const seen = [];
    queryColliders({ index: createColliderIndex([q]), dyn: new Set([dyn]) }, -1, -1, 2, 2, (c) => seen.push(c));
    expect(seen).toContain(q);
    expect(seen).toContain(dyn);
  });

  it('Netzzustand: Snapshot ist JSON-tauglich und übernimmt Position', () => {
    const a = createWorld({ src: [] });
    const c = createWorld({ src: [] });
    const ba = a.spawn({ kind: 'soccer', pos: { x: 1.234, y: 2, z: 3 }, vel: { x: 1, y: 0, z: 0 } });
    const bc = c.spawn({ kind: 'soccer', pos: { x: 0, y: 0, z: 0 } });
    expect(bc.id).toBe(ba.id);
    run(a, 0.2);
    const snap = JSON.parse(JSON.stringify(a.snapshot(true)));
    expect(snap[0]).toMatchObject({ i: ba.id, k: 'soccer' });
    expect(c.applyRemote(snap)).toBe(1);
    expect(bc.pos.x).toBeCloseTo(ba.pos.x, 1);
    expect(bc.pos.y).toBeCloseTo(ba.pos.y, 1);
  });
});
