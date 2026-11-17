// VIDEOTHEK LENZ: Player mit Höhe (controls/player.js extends Body): eyeY, teleport/settle, Kamera-Effekte, Pfadabbruch, state/pose.
import { describe, it, expect, vi } from 'vitest';
import { Player, EYE } from '../src/js/store3d/controls/player.js';
import { createColliderIndex } from '../src/js/store3d/nav/collide.js';

const box = (x0, z0, x1, z1, extra = {}) => ({ x0, z0, x1, z1, ...extra });
const layoutOf = (colliders = [], spawn = { x: 1, z: 1, yaw: 0 }) => ({ colliders, spawn });
const cam = () => ({ position: { set: vi.fn() }, rotation: { set: vi.fn() } });
const run = (p, sec, input = null, dt = 1 / 60) => { for (let t = 0; t < sec - 1e-9; t += dt) p.update(dt, input); };

describe('Player 3D', () => {
  it('state bleibt { x, z, yaw, pitch }, pose hat y', () => {
    const p = new Player(layoutOf());
    expect(Object.keys(p.state)).toEqual(['x', 'z', 'yaw', 'pitch']);
    expect(Object.keys(p.pose)).toEqual(['x', 'y', 'z', 'yaw', 'pitch', 'vy', 'grounded']);
    expect(p.pose.grounded).toBe(true);
  });

  it('eyeY: 1,65 am Boden, hebt sich im Sprung', () => {
    const p = new Player(layoutOf());
    expect(p.eyeY()).toBe(EYE);
    expect(p.jump()).toBe(true);
    let top = 0;
    for (let t = 0; t < 0.7; t += 1 / 60) { p.update(1 / 60, null); top = Math.max(top, p.eyeY()); }
    expect(top).toBeGreaterThan(EYE + 0.9);
    run(p, 2);
    expect(p.eyeY()).toBe(EYE); // nach der Landung und abgeklungenem Wippen wieder Normalhöhe
  });

  it('Landungs-Wippen: Dip nach hartem Aufprall, klingt ab, nie tiefer als -0,12', () => {
    const p = new Player(layoutOf());
    p.y = 3; p.grounded = false;
    let min = 0;
    for (let t = 0; t < 1.5; t += 1 / 60) { p.update(1 / 60, null); min = Math.min(min, p.eyeY() - EYE); }
    expect(min).toBeLessThan(-0.01);
    expect(min).toBeGreaterThanOrEqual(-0.12 - 1e-9);
    expect(p.landDip).toBe(0);
    expect(p.eyeY()).toBe(EYE);
  });

  it('reducedMotion: kein Wippen, kein Wackeln, Stoß bleibt', () => {
    const p = new Player(layoutOf(), { reducedMotion: () => true });
    p.y = 3; p.grounded = false;
    let min = 0;
    for (let t = 0; t < 1.5; t += 1 / 60) { p.update(1 / 60, null); min = Math.min(min, p.eyeY() - EYE); }
    expect(min).toBe(0);
    p.knock({ x: 1, z: 0 }, 1);
    const c = cam();
    p.applyCamera(c);
    expect(c.rotation.set).toHaveBeenLastCalledWith(p.pitch, p.yaw, 0, 'YXZ');
    expect(p.knockVx).toBeGreaterThan(0); // Spielmechanik bleibt
  });

  it('applyCamera mit Wackeln weicht ab, ohne Stoß exakt Blick; yaw/pitch des Spielers bleiben', () => {
    const p = new Player(layoutOf());
    p.yaw = 0.5; p.pitch = 0.1;
    const c = cam();
    p.applyCamera(c);
    expect(c.position.set).toHaveBeenLastCalledWith(1, EYE, 1);
    expect(c.rotation.set).toHaveBeenLastCalledWith(0.1, 0.5, 0, 'YXZ');
    p.knock({ x: 0, z: 1 }, 1);
    p.update(0.016, null);
    p.applyCamera(c);
    const last = c.rotation.set.mock.calls.at(-1);
    expect(last[3]).toBe('YXZ');
    expect(Math.abs(last[0] - 0.1) + Math.abs(last[1] - 0.5) + Math.abs(last[2])).toBeGreaterThan(0);
    expect(p.pitch).toBe(0.1);
    expect(p.yaw).toBe(0.5);
    run(p, 2);
    expect(p.shake).toBe(0);
  });

  it('teleport mit y und settle: Dachplatte, ohne y = Boden', () => {
    const roof = box(0, 0, 3, 3, { y0: 3, y1: 3.2 });
    const p = new Player(layoutOf([roof]));
    p.teleport(1, 1, 0, 0, 3.2);
    expect(p.y).toBe(3.2);
    expect(p.grounded).toBe(true);
    expect(p.tp).toBe(1);
    p.teleport(1, 1, 0, 0);
    expect(p.y).toBe(0);
    p.y = 3.1; p.vy = -4; p.grounded = false;
    p.settle();
    expect(p.y).toBe(3.2);
    expect(p.vy).toBe(0);
    expect(p.lastSafe.y).toBe(3.2);
  });

  it('Stufenglättung: Augenhöhe springt beim Hinaufsteigen nicht', () => {
    const p = new Player(layoutOf([box(2, -3, 6, 3, { y1: 0.3 })], { x: 1, z: 0, yaw: -Math.PI / 2 }));
    let prev = p.eyeY();
    let maxJump = 0;
    for (let t = 0; t < 1.5; t += 1 / 60) {
      p.update(1 / 60, { fwd: 1, strafe: 0, run: false });
      maxJump = Math.max(maxJump, Math.abs(p.eyeY() - prev));
      prev = p.eyeY();
    }
    expect(p.y).toBe(0.3);
    expect(maxJump).toBeLessThan(0.1); // statt 0,3 auf einmal
    run(p, 1);
    expect(p.eyeY()).toBeCloseTo(EYE + 0.3, 6);
  });

  it('walkTo bricht beim Sprung ab (cb(false)), Pfad weg', () => {
    const p = new Player(layoutOf());
    const cb = vi.fn();
    p.walkTo([{ x: 5, z: 1 }], cb);
    run(p, 0.2);
    expect(p.walking).toBe(true);
    p.jump();
    run(p, 0.1);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith(false);
    expect(p.walking).toBe(false);
  });

  it('knock bricht den Pfad ab (cb(false)); manuelle Eingabe bricht still ab (wie bisher)', () => {
    const p = new Player(layoutOf());
    const cb = vi.fn();
    p.walkTo([{ x: 5, z: 1 }], cb);
    p.knock({ x: 0, z: 1 });
    expect(cb).toHaveBeenCalledWith(false);
    const cb2 = vi.fn();
    p.walkTo([{ x: 5, z: 1 }], cb2);
    p.update(0.016, { fwd: 1, strafe: 0 });
    expect(cb2).not.toHaveBeenCalled();
    expect(p.walking).toBe(false);
  });

  it('Pfadfolge am Boden unverändert: Ziel wird erreicht', () => {
    const p = new Player(layoutOf());
    const cb = vi.fn();
    p.walkTo([{ x: 3, z: 1 }], cb);
    run(p, 3);
    expect(cb).toHaveBeenCalledWith();
    expect(Math.abs(p.x - 3)).toBeLessThan(0.1);
  });

  it('Eingabe null: Schwerkraft läuft trotzdem (eingefrorener Spieler fällt)', () => {
    const p = new Player(layoutOf());
    p.y = 2; p.grounded = false;
    run(p, 1, null);
    expect(p.y).toBe(0);
  });

  it('mit Raster-Hash und dynamischem Kollider (layout.cidx/dyn)', () => {
    const wall = box(3, -5, 3.3, 5);
    const car = box(-3, -5, -2.7, 5, { dynamic: true });
    const layout = { ...layoutOf([wall], { x: 1, z: 0, yaw: 0 }), cidx: createColliderIndex([wall]), dyn: new Set([car]) };
    const p = new Player(layout);
    p.yaw = -Math.PI / 2; // Blick nach +x
    run(p, 3, { fwd: 1, strafe: 0, run: true });
    expect(p.x).toBeLessThanOrEqual(3 - 0.28 + 1e-6);
    p.yaw = Math.PI / 2; // nach -x
    run(p, 4, { fwd: 1, strafe: 0, run: true });
    expect(p.x).toBeGreaterThanOrEqual(-2.7 + 0.28 - 1e-6);
  });
});
