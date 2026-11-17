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

describe('Physik-Kern: Mehrspieler (1.16.0)', () => {
  const events = (w) => { const l = []; w.on((e) => l.push(e)); return l; };

  it('Ereignisse spawn, hold, reset, remove; impulse meldet touch vor der Wirkung', () => {
    const w = createWorld({ src: [] });
    const ev = events(w);
    const b = ball(w);
    expect(ev.map((e) => e.type)).toEqual(['spawn']);
    expect(ev[0].body).toBe(b);
    w.setHeld(b, true);
    w.setHeld(b, false);
    expect(ev.filter((e) => e.type === 'hold').map((e) => e.on)).toEqual([true, false]);
    let velAtTouch = null;
    w.on((e) => { if (e.type === 'touch') velAtTouch = b.vel.x; });
    b.vel.x = 0;
    w.impulse(b, { x: 3, y: 0, z: 0 });
    expect(velAtTouch).toBe(0); // vor der Geschwindigkeitsänderung
    expect(ev.some((e) => e.type === 'touch' && e.by === 'impulse')).toBe(true);
    w.setHome(b, 1, 2, 3);
    w.reset(b);
    expect(ev.some((e) => e.type === 'reset' && e.body === b)).toBe(true);
    w.remove(b);
    expect(ev[ev.length - 1].type).toBe('remove');
  });

  it('Spieler schiebt Körper: touch (by player) höchstens alle 0,1 s je Körper, auch ohne Hörer unverändertes Verhalten', () => {
    const run1 = (listen) => {
      const w = createWorld({ src: [] });
      const b = ball(w, { pos: { x: 0.3, y: 0.12, z: 0 }, sleeping: true });
      const ev = listen ? events(w) : [];
      for (let i = 0; i < 30; i++) { w.setPlayer({ x: -0.2 + i * 0.01, z: 0, y: 0, vx: 2, vz: 0 }); w.step(DT); }
      return { x: b.pos.x, vx: b.vel.x, touches: ev.filter((e) => e.type === 'touch' && e.by === 'player').length };
    };
    const a = run1(true);
    const c = run1(false);
    expect(a.x).toBeCloseTo(c.x, 8);
    expect(a.vx).toBeCloseTo(c.vx, 8);
    expect(a.touches).toBeGreaterThanOrEqual(1);
    expect(a.touches).toBeLessThanOrEqual(6); // 0,5 s Lauf = höchstens ~5 Meldungen
  });

  it('netRemote: wird nicht simuliert (fällt nicht, schläft nicht), Kugel rollt aus der übernommenen Geschwindigkeit; applyRemote bewegt ihn', () => {
    const w = createWorld({ src: [] });
    const b = ball(w, { pos: { x: 0, y: 3, z: 0 }, netRemote: true });
    run(w, 1);
    expect(b.pos.y).toBe(3);
    expect(b.vel.y).toBe(0);
    w.applyRemote([{ i: b.id, p: [1, 3, 1], v: [2, 0, 0], y: 0, t: 0, s: 0 }]);
    const roll = b.rollZ;
    run(w, 0.5);
    expect(b.pos.x).toBe(1);
    expect(b.rollZ).toBeLessThan(roll); // rollt (rollZ -= vx/r*h)
    expect(b.sleeping).toBe(false);
    expect(w.awakeCount()).toBe(0); // fremdgesteuert zählt nicht zu den simulierten
  });

  it('netRemote: keine Körperpaare, nicht in enforceMax; setRemote(false) simuliert vom letzten Stand an weiter', () => {
    const w = createWorld({ src: [], maxActive: 1 });
    const r = ball(w, { pos: { x: 0, y: 0.12, z: 0 }, netRemote: true });
    const a = ball(w, { pos: { x: 0.05, y: 0.12, z: 0 }, vel: { x: 1, y: 0, z: 0 } });
    run(w, 0.2);
    expect(r.pos.x).toBe(0); // vom Paar nicht verschoben
    expect(r.vel.x).toBe(0);
    expect(a.sleeping).toBe(false); // maxActive 1: der Fremde zählt nicht mit
    w.setRemote(r, false);
    r.pos.y = 2;
    run(w, 0.3);
    expect(r.pos.y).toBeLessThan(2); // fällt wieder
    w.setRemote(r, true);
    const y = r.pos.y;
    run(w, 0.3);
    expect(r.pos.y).toBe(y);
  });

  it('playerPush auf Fremdgesteuertes: touch, bleibt der Körper fremd, wird er nicht verschoben; Anspruch (setRemote false) lässt ihn schieben', () => {
    const mk = () => { const w = createWorld({ src: [] }); const b = ball(w, { pos: { x: 0.3, y: 0.12, z: 0 }, netRemote: true, sleeping: true }); return { w, b }; };
    const a = mk();
    let touched = 0;
    a.w.on((e) => { if (e.type === 'touch') touched++; });
    a.w.setPlayer({ x: 0.05, z: 0, y: 0, vx: 3, vz: 0 });
    a.w.step(DT);
    expect(touched).toBe(1);
    expect(a.b.vel.x).toBe(0);
    expect(a.b.pos.x).toBe(0.3);
    const c = mk();
    c.w.on((e) => { if (e.type === 'touch') c.w.setRemote(c.b, false); });
    c.w.setPlayer({ x: 0.05, z: 0, y: 0, vx: 3, vz: 0 });
    c.w.step(DT);
    expect(c.b.netRemote).toBe(false);
    expect(c.b.vel.x).toBeGreaterThan(0);
  });

  it('applyRemote: tip 0 stellt die Höhe wieder her; tipping wird beendet; Schlaf/Ruhe übernommen', () => {
    const w = createWorld({ src: [] });
    const b = w.spawn({ kind: 'bin', pos: { x: 0, y: 0.475, z: 0 } });
    w.applyRemote([{ i: b.id, p: [0, 0.3, 0], v: [0, 0, 0], y: 0.5, t: 1.57, ax: 1, az: 0, s: 1 }]);
    expect(b.hy).toBeCloseTo(b.lieHy, 2);
    expect(b.sleeping).toBe(true);
    w.applyRemote([{ i: b.id, p: [0, 0.475, 0], v: [0, 0, 0], y: 0, t: 0, s: 1 }]);
    expect(b.hy).toBe(b.hy0);
    expect(b.tipping).toBe(false);
  });

  it('ohne netRemote und Hörer bleibt der Kern bitgleich (spawn ohne Flag = lokal)', () => {
    const w = createWorld({ src: [] });
    const b = ball(w);
    expect(b.netRemote).toBe(false);
    expect(b.touchCd).toBe(0);
  });
});
