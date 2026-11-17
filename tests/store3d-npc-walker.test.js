import { describe, it, expect } from 'vitest';
import { buildGraph } from '../src/js/store3d/npc/pathgraph.js';
import { createWalker, stepWalker, hitWalker, pickInCone, walkerCount, canGo, yawOf } from '../src/js/store3d/npc/walker-logic.js';
import { seeded } from '../src/js/store3d/modules/m4-util.js';

// Gehweg (z=0) mit Querung nach Süden (x=10, z 0..6, wartet auf 'main')
const paths = [
  { id: 'walk', pts: [{ x: 0, z: 0 }, { x: 20, z: 0 }], waits: [null] },
  { id: 'cross', pts: [{ x: 10, z: 0 }, { x: 10, z: 6 }], waits: ['main'] },
];
const g = buildGraph(paths);
const run = (w, secs, env, dt = 0.05) => { for (let t = 0; t < secs; t += dt) stepWalker(w, dt, env); };
const envOf = (o = {}) => ({ graph: g, rand: seeded(3), signal: { walkMain: false, walkSide: false }, player: null, roadMid: 3, ...o });
const walkEdge = g.edges.findIndex((e) => e.path === 'walk' && e.ax === 0);

describe('Passanten-Zustandsautomat', () => {
  it('folgt dem Pfad und bleibt auf den Kanten', () => {
    const w = createWalker(g, seeded(1), { edge: walkEdge, dir: 1, s: 0 });
    run(w, 5, envOf({ signal: { walkMain: true } }));
    expect(w.x).toBeGreaterThan(2);
    expect(Math.abs(w.z)).toBeLessThan(1.2);
  });

  it('wartet vor dem Zebra bei Rot und geht bei Grün los', () => {
    const ci = g.edges.findIndex((e) => e.wait === 'main');
    const e = g.edges[ci];
    const w = createWalker(g, seeded(2), { edge: ci, dir: 1, s: 0 });
    const env = envOf();
    run(w, 4, env);
    expect(w.state).toBe('wait');
    expect(w.anim).toBe('idle');
    expect(Math.abs(w.z - e.az)).toBeLessThan(0.05);
    const z0 = w.z;
    env.signal = { walkMain: true, walkSide: false };
    run(w, 1, env);
    expect(w.state).toBe('walk');
    expect(w.z).toBeGreaterThan(z0 + 0.3);
  });

  it('canGo wertet die Bedingungen', () => {
    expect(canGo(null, {})).toBe(true);
    expect(canGo('main', { signal: { walkMain: false } })).toBe(false);
    expect(canGo('side', { signal: { walkSide: true } })).toBe(true);
    expect(canGo('mid', { zebraClear: () => false }, {})).toBe(false);
    expect(canGo('mid', {}, {})).toBe(true);
  });

  it('weicht dem Spieler seitlich aus', () => {
    const w = createWalker(g, seeded(5), { edge: walkEdge, dir: 1, s: 2 });
    w.laneOff = 0; w.lateral = 0;
    run(w, 1.2, envOf({ signal: { walkMain: true }, player: { x: w.x + 1.6, z: 0.05, speed: 0 } }));
    expect(Math.abs(w.lateral)).toBeGreaterThan(0.4);
  });

  it('Anrempeln im Lauf: taumelt, Spruch und Stoß-Ereignis, danach Abkühlzeit', () => {
    const w = createWalker(g, seeded(6), { edge: walkEdge, dir: 1, s: 5 });
    w.speakCool = 0;
    const evs = stepWalker(w, 0.05, envOf({ signal: { walkMain: true }, player: { x: w.x + 0.3, z: w.z, speed: 6 } }));
    expect(evs.some((e) => e.type === 'bump')).toBe(true);
    expect(evs.some((e) => e.type === 'say' && e.cat === 'rammed')).toBe(true);
    expect(w.state).toBe('stagger');
    expect(w.bumpCool).toBeGreaterThan(0);
  });

  it('Treffer: stagger, dann eilig weg (flee), Spruch aus bumped/flee', () => {
    const w = createWalker(g, seeded(8), { edge: walkEdge, dir: 1, s: 3 });
    const ev = hitWalker(w, { x: 1, z: 0 }, seeded(1));
    expect(ev.type).toBe('say');
    expect(['bumped', 'flee']).toContain(ev.cat);
    expect(w.state).toBe('stagger');
    const env = envOf({ signal: { walkMain: true, walkSide: true } });
    run(w, 1.3, env);
    expect(w.state).toBe('flee');
    expect(w.rush).toBeGreaterThan(1.5);
    run(w, 8, env);
    expect(w.state).not.toBe('flee');
  });

  it('Kegel-Treffer: ±25°, 1,6 m, nächste Person gewinnt', () => {
    const people = [{ x: 1.2, z: 0 }, { x: 0.8, z: 0.2 }, { x: 0, z: 1.2 }, { x: 3, z: 0 }, { x: 1.4, z: 1.2 }];
    expect(pickInCone(people, { x: 0, z: 0 }, { x: 1, z: 0 }, 1.6, 25).index).toBe(1);
    expect(pickInCone([{ x: 0, z: 1.2 }], { x: 0, z: 0 }, { x: 1, z: 0 })).toBeNull();
    expect(pickInCone([{ x: 3, z: 0 }], { x: 0, z: 0 }, { x: 1, z: 0 })).toBeNull();
    expect(pickInCone([{ x: 1, z: 0 }], { x: 0, z: 0 }, { x: 0, z: 0 })).toBeNull();
  });

  it('Anzahl nach Qualität, nachts weniger, bei Regen etwas weniger', () => {
    expect(walkerCount(8, 'day', false)).toBe(8);
    expect(walkerCount(8, 'night', false)).toBeLessThan(8);
    expect(walkerCount(8, 'day', true)).toBeLessThan(8);
    expect(walkerCount(0, 'day', false)).toBe(0);
  });

  it('Blickrichtung: yaw 0 = −z', () => {
    expect(yawOf(0, -1)).toBeCloseTo(0, 6);
    expect(yawOf(-1, 0)).toBeCloseTo(Math.PI / 2, 6);
  });

  it('Sackgasse am Türweg: kurze Pause, dann Umkehr', () => {
    const gg = buildGraph([{ id: 'shopDoor', pts: [{ x: 0, z: 0 }, { x: 0, z: 3 }], waits: [null] }]);
    const w = createWalker(gg, seeded(1), { edge: 0, dir: 1, s: 2.8 });
    const env = { graph: gg, rand: seeded(2), signal: {}, player: null, roadMid: 0 };
    let n = 0;
    while (w.state !== 'browse' && n++ < 200) stepWalker(w, 0.05, env);
    expect(w.state).toBe('browse');
    n = 0;
    while (w.state === 'browse' && n++ < 400) stepWalker(w, 0.05, env);
    expect(w.state).toBe('walk');
    expect(w.dir).toBe(-1);
  });
});
