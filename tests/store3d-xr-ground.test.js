// VIDEOTHEK LENZ: VR folgt der Bodenhöhe (xr/mode.js groundY, locomote, resolveCircle3); ohne XR-Session ändert sich nichts.
import { describe, it, expect } from 'vitest';
import { Object3D, Quaternion } from 'three';
import { XrMode } from '../src/js/store3d/xr/mode.js';
import { Player } from '../src/js/store3d/controls/player.js';
import { createLoco } from '../src/js/store3d/xr/locomotion.js';
import { StoreApp } from '../src/js/store3d/store.js';

const box = (x0, z0, x1, z1, extra = {}) => ({ x0, z0, x1, z1, ...extra });

function mk(colliders = []) {
  const layout = { colliders, spawn: { x: 5, z: 5, yaw: 0 } };
  const player = new Player(layout);
  const rig = new Object3D();
  const head = { position: { x: 0, y: 1.6, z: 0 }, quaternion: new Quaternion() };
  const app = {
    player, layout,
    engine: { rig, renderer: { xr: { getCamera: () => head } } },
    opts: { vr: {} }, mods: { locked: false },
  };
  const xr = Object.assign(Object.create(XrMode.prototype), {
    app, fade: null, input: { fwd: 0, strafe: 0, run: false, scale: 1 }, loco: createLoco(), cinema: { active: false }, pointer: null,
    placed: false, lastTp: 0, rigY: 0, groundY: 0, floor: true, speed: 0, turnRate: 0, lastX: 0, lastZ: 0,
    pollInput() {}, recFor: () => null, afterPlace() {}, isFading: () => false,
  });
  return { xr, player, rig, app };
}
const tick = (xr, dt = 1 / 72, n = 1) => { for (let i = 0; i < n; i++) xr.beforeTick(dt, 0, {}); };

describe('VR: Rig folgt der Bodenhöhe', () => {
  it('beim Platzieren: Rig-Höhe = rigY + Spielerhöhe', () => {
    const { xr, player, rig } = mk([box(0, 0, 20, 20, { y0: 3, y1: 3.2 })]);
    player.teleport(5, 5, 0, 0, 3.2);
    tick(xr);
    expect(xr.groundY).toBe(3.2);
    expect(rig.position.y).toBeCloseTo(3.2, 9);
  });
  it('weich: Zeitkonstante 0,12 s', () => {
    const { xr, player, rig } = mk();
    tick(xr); // platziert bei y = 0
    player.stepVertical = () => {}; // Höhe fest vorgeben (sonst fiele der Spieler zurück)
    player.y = 1; // Spieler steht plötzlich 1 m höher (z. B. Stufe, < 1,5 m)
    tick(xr, 0.12);
    expect(xr.groundY).toBeCloseTo(1 - Math.exp(-1), 4);
    expect(rig.position.y).toBeCloseTo(xr.groundY, 9);
    tick(xr, 0.12, 40);
    expect(xr.groundY).toBeCloseTo(1, 3);
  });
  it('Sprung über 1,5 m: sofort', () => {
    const { xr, player, rig } = mk();
    tick(xr);
    player.stepVertical = () => {};
    player.y = 3.2;
    tick(xr, 1 / 72);
    expect(xr.groundY).toBe(3.2);
    expect(rig.position.y).toBeCloseTo(3.2, 9);
  });
  it('Teleport (Zähler tp) setzt die Höhe neu', () => {
    const { xr, player } = mk([box(0, 0, 20, 20, { y0: 3, y1: 3.2 })]);
    tick(xr);
    expect(xr.groundY).toBe(0);
    player.teleport(6, 6, 0, 0, 3.2);
    tick(xr);
    expect(xr.groundY).toBe(3.2);
  });
});

describe('VR: locomote und Kollision', () => {
  it('im Stand: Schwerkraft/Bodenfolgen über stepVertical (ein Schritt pro Frame)', () => {
    const { xr, player } = mk();
    tick(xr);
    player.y = 2; player.grounded = false;
    for (let i = 0; i < 200; i++) tick(xr, 1 / 72);
    expect(player.y).toBe(0);
    expect(player.grounded).toBe(true);
  });
  it('mit Stick wird nicht doppelt gefallen (update enthält den vertikalen Schritt)', () => {
    const a = mk();
    const b = mk();
    for (const t of [a, b]) { t.player.y = 5; t.player.grounded = false; }
    a.xr.input.fwd = 1;
    a.xr.locomote(0.05);
    b.xr.locomote(0.05); // ohne Stick: stepVertical
    expect(a.player.y).toBeCloseTo(b.player.y, 9);
  });
  it('Kopf im Hindernis: auf Bodenhöhe wird herausgeschoben, auf der Bank (Füße darüber) nicht', () => {
    const wall = box(0, 0, 1, 1);
    const bench = box(0, 0, 1, 1, { y1: 0.6 });
    const t1 = mk([wall]);
    tick(t1.xr);
    t1.rig.position.set(0.5, 0, 0.5);
    tick(t1.xr);
    const outside = t1.player.x < -0.27 || t1.player.x > 1.27 || t1.player.z < -0.27 || t1.player.z > 1.27;
    expect(outside).toBe(true);
    const t2 = mk([bench]);
    t2.player.teleport(0.5, 0.5, 0, 0, 0.6);
    tick(t2.xr);
    t2.rig.position.set(0.5, 0.6, 0.5);
    tick(t2.xr);
    expect(t2.player.x).toBeCloseTo(0.5, 6);
    expect(t2.player.y).toBe(0.6);
  });
});

describe('Ohne XR-Session bleibt 2D unberührt', () => {
  it('doJump und doHit tun in VR nichts; ohne VR springt der Spieler', () => {
    let jumped = 0;
    const mods = { locked: false, action: () => false, emit() {} };
    const mkApp = (xr) => Object.assign(Object.create(StoreApp.prototype), {
      mode: 'play', disposed: false, xr, mods, aim: null, carried: null,
      player: { jump: () => { jumped++; return true; }, swing() {} }, hands: null,
    });
    expect(mkApp({ presenting: true }).doJump()).toBe(false);
    expect(mkApp({ presenting: true }).doHit()).toBe(false);
    expect(jumped).toBe(0);
    expect(mkApp({ presenting: false }).doJump()).toBe(true);
    expect(mkApp(null).doJump()).toBe(true);
    expect(jumped).toBe(2);
  });
  it('Player ohne Höhen-Kollider: y bleibt 0 und die Position ist identisch zur alten 2D-Bewegung', () => {
    const p = new Player({ colliders: [box(3, -9, 4, 9)], spawn: { x: 0, z: 0, yaw: -Math.PI / 2 } });
    for (let i = 0; i < 180; i++) p.update(1 / 60, { fwd: 1, strafe: 0, run: true });
    expect(p.y).toBe(0);
    expect(p.x).toBeCloseTo(3 - 0.28, 6);
  });
});
