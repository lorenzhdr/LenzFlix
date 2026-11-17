// Sendedrossel der Pose (net/pose.js): nur bei Änderung, <= 8 Hz bzw. cf.pr, Schwellen, Abschluss-Frame, kein Heartbeat.
import { describe, it, expect } from 'vitest';
import { createPose } from '../src/js/store3d/net/pose.js';
import { createFrame, W0, D0 } from '../src/js/store3d/net/frame.js';

const frame = createFrame({ w: W0, d: D0 });
const S = (o = {}) => ({ x: 5, y: 0, z: 9, yaw: 0, pitch: 0, a: 0, r: 0, ...o });

describe('createPose', () => {
  it('erste Beobachtung sendet sofort, danach nichts ohne Änderung (kein Heartbeat)', () => {
    const p = createPose({ frame });
    expect(p.update(S(), 0)).toEqual({ t: 'p', q: [500, 0, 900, 0, 0, 0, 0] });
    for (let t = 16; t < 60000; t += 16) expect(p.update(S(), t)).toBe(null);
  });
  it('Schwellen: Position <= 2 cm, yaw <= 2, pitch <= 4 gelten nicht als Änderung', () => {
    const p = createPose({ frame });
    p.update(S(), 0);
    expect(p.update(S({ x: 5.02 }), 1000)).toBe(null); // 2 cm
    expect(p.update(S({ yaw: 0.02 }), 1100)).toBe(null); // 2 cRad
    expect(p.update(S({ pitch: 0.04 }), 1200)).toBe(null); // 4 cRad
    expect(p.update(S({ x: 5.03 }), 1300)).not.toBe(null); // 3 cm
  });
  it('yaw-Abstand über den ±π-Sprung ist klein', () => {
    const p = createPose({ frame });
    p.update(S({ yaw: Math.PI - 0.005 }), 0);
    expect(p.update(S({ yaw: -Math.PI + 0.005 }), 1000)).toBe(null); // 1 cRad Unterschied
  });
  it('a/r/se-Änderung zählt', () => {
    const p = createPose({ frame });
    p.update(S(), 0);
    expect(p.update(S({ a: 1 }), 200).q[5]).toBe(1);
    expect(p.update(S({ a: 1, r: 2 }), 400).q[6]).toBe(2);
    expect(p.update(S({ a: 7, r: 1, se: [2, 300] }), 600)).toEqual({ t: 'p', q: [500, 0, 900, 0, 0, 7, 1], se: [2, 300] });
  });
  it('höchstens 8 Hz bei Dauerbewegung; cf.pr senkt die Rate', () => {
    for (const hz of [8, 4, 2]) {
      const p = createPose({ frame, rate: () => hz });
      let n = 0;
      for (let t = 0; t < 10000; t += 16) if (p.update(S({ x: 5 + t * 0.004 }), t)) n++;
      expect(n).toBeLessThanOrEqual(hz * 10 + 1);
      expect(n).toBeGreaterThanOrEqual(hz * 10 - hz);
    }
    const p = createPose({ frame, rate: () => 99 }); // über 8 wird auf 8 gedeckelt
    let n = 0;
    for (let t = 0; t < 2000; t += 16) if (p.update(S({ x: 5 + t * 0.004 }), t)) n++;
    expect(n).toBeLessThanOrEqual(17);
  });
  it('Abschluss-Frame sofort beim Stillstand, auch innerhalb des Intervalls', () => {
    const p = createPose({ frame, rate: () => 2 });
    p.update(S({ x: 5 }), 0);
    expect(p.update(S({ x: 6 }), 100)).toBe(null); // gedrosselt
    expect(p.update(S({ x: 6.5 }), 116)).toBe(null);
    const last = p.update(S({ x: 6.5 }), 132); // steht (identisch zur letzten Beobachtung)
    expect(last.q[0]).toBe(650);
    expect(p.update(S({ x: 6.5 }), 148)).toBe(null); // danach Ruhe
    expect(p.update(S({ x: 6.5 }), 5000)).toBe(null);
  });
  it('Änderung unter der Schwelle wird beim Stillstand trotzdem nachgeliefert (kein Hängenbleiben)', () => {
    const p = createPose({ frame });
    p.update(S({ x: 5 }), 0);
    expect(p.update(S({ x: 5.015 }), 1000)).toBe(null); // 1 cm Drift (unter 2 cm), Stand unterscheidet sich
    expect(p.update(S({ x: 5.015 }), 1016).q[0]).toBe(501); // Stillstand: Abschluss-Frame mit dem letzten Stand
    expect(p.update(S({ x: 5.015 }), 1032)).toBe(null);
  });
  it('reset: der nächste Aufruf sendet sofort (nach Wiederverbinden)', () => {
    const p = createPose({ frame });
    p.update(S(), 0);
    expect(p.update(S(), 100)).toBe(null);
    p.reset();
    expect(p.update(S(), 200)).not.toBe(null);
  });
  it('r wird ohne Angabe aus dem Layout bestimmt', () => {
    const p = createPose({ frame: createFrame({ w: 12.5, d: 18 }) });
    expect(p.update({ x: 5, y: 0, z: 9, yaw: 0, pitch: 0, a: 0 }, 0).q[6]).toBe(0);
  });
  it('Yaw wird gewrappt, Pitch geklemmt', () => {
    const p = createPose({ frame });
    const m = p.update(S({ yaw: 7, pitch: 3 }), 0);
    expect(m.q[3]).toBe(Math.round((7 - 2 * Math.PI) * 100));
    expect(m.q[4]).toBe(157);
  });
});
