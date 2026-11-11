import { describe, it, expect } from 'vitest';
import { Player } from '../src/js/store3d/controls/player.js';
import { createLoco, stepLoco, SNAP_ANGLE } from '../src/js/store3d/xr/locomotion.js';
import { vignetteTarget } from '../src/js/store3d/xr/vignette.js';

const P = (x = 0, y = 0, click = false) => ({ stick: { x, y }, edges: { stickClickDown: click } });

describe('xr/locomotion', () => {
  it('linker Stick: oben = vorwärts, rechts = Strafe, scale = Auslenkung', () => {
    const st = createLoco();
    const r = stepLoco(st, { left: P(0, -1), dt: 0.016 });
    expect(r.fwd).toBe(1);
    expect(r.strafe).toBe(0);
    expect(r.scale).toBe(1);
    const h = stepLoco(st, { left: P(0.5, 0), dt: 0.016 });
    expect(h.strafe).toBe(0.5);
    expect(h.scale).toBe(0.5);
    const n = stepLoco(st, { left: P(0, 0), dt: 0.016 });
    expect(n.fwd).toBe(0);
  });

  it('Richtung folgt dem Kopf-Yaw (Player.update)', () => {
    const layout = { colliders: [], spawn: { x: 0, z: 0, yaw: 0 } };
    const p = new Player(layout);
    p.yaw = Math.PI / 2; // Blick nach −x
    const r = stepLoco(createLoco(), { left: P(0, -1), dt: 0.1 });
    for (let i = 0; i < 30; i++) p.update(0.05, r);
    expect(p.x).toBeLessThan(-1);
    expect(Math.abs(p.z)).toBeLessThan(0.01);
  });

  it('Rennen: Stick-Klick schaltet um, Stick in der Mitte beendet', () => {
    const st = createLoco();
    expect(stepLoco(st, { left: P(0, -1), dt: 0.016 }).run).toBe(false);
    expect(stepLoco(st, { left: P(0, -1, true), dt: 0.016 }).run).toBe(true);
    expect(stepLoco(st, { left: P(0, -1), dt: 0.016 }).run).toBe(true);
    expect(stepLoco(st, { left: P(0, -1, true), dt: 0.016 }).run).toBe(false);
    stepLoco(st, { left: P(0, -1, true), dt: 0.016 });
    expect(st.running).toBe(true);
    expect(stepLoco(st, { left: P(0, 0), dt: 0.016 }).run).toBe(false);
  });

  it('Snap: ±45° einmal, Re-Arm unter 0,3', () => {
    const st = createLoco();
    expect(stepLoco(st, { right: P(1, 0), dt: 0.016 }).turn).toBeCloseTo(-SNAP_ANGLE);
    expect(stepLoco(st, { right: P(1, 0), dt: 0.016 }).turn).toBe(0);
    expect(stepLoco(st, { right: P(0.5, 0), dt: 0.016 }).turn).toBe(0); // noch nicht wieder scharf
    expect(stepLoco(st, { right: P(0.5, 0), dt: 0.016 }).turn).toBe(0);
    stepLoco(st, { right: P(0.1, 0), dt: 0.016 });
    expect(stepLoco(st, { right: P(-1, 0), dt: 0.016 }).turn).toBeCloseTo(SNAP_ANGLE);
    expect(stepLoco(st, { right: P(0.6, 0), dt: 0.016 }).turn).toBe(0); // unter 0,7 löst nicht aus
  });

  it('weich: 90°/s mal Auslenkung', () => {
    const st = createLoco();
    const r = stepLoco(st, { right: P(1, 0), dt: 0.5, turnMode: 'smooth' });
    expect(r.turn).toBeCloseTo(-Math.PI / 4);
    const h = stepLoco(st, { right: P(-0.5, 0), dt: 1, turnMode: 'smooth' });
    expect(h.turn).toBeCloseTo(Math.PI / 4);
  });

  it('gesperrt: kein Gehen und kein Rennen, Drehen bleibt', () => {
    const st = createLoco();
    const r = stepLoco(st, { left: P(0, -1, true), right: P(1, 0), dt: 0.016, locked: true });
    expect(r.fwd).toBe(0);
    expect(r.strafe).toBe(0);
    expect(r.run).toBe(false);
    expect(r.turn).toBeCloseTo(-SNAP_ANGLE);
  });

  it('blockierter Stick (Panel scrollen) wirkt wie Mitte', () => {
    const st = createLoco();
    expect(stepLoco(st, { left: P(0, -1), dt: 0.016, blockLeft: true }).fwd).toBe(0);
    expect(stepLoco(st, { right: P(1, 0), dt: 0.016, blockRight: true }).turn).toBe(0);
  });

  it('Vignette-Stärke steigt mit Geschwindigkeit und Drehrate', () => {
    expect(vignetteTarget(0, 0)).toBe(0);
    expect(vignetteTarget(2.2, 0)).toBeGreaterThan(0.3);
    expect(vignetteTarget(4, Math.PI)).toBeLessThanOrEqual(0.85);
    expect(vignetteTarget(1, 0)).toBeLessThan(vignetteTarget(2, 0));
  });
});
