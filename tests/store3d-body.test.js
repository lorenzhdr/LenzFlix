// VIDEOTHEK LENZ: kinematischer Körper (controls/body.js): Sprung, Coyote, Sprungpuffer, Stufen, Fallen, Hochziehen, Stoß, Netzzustand.
import { describe, it, expect, vi } from 'vitest';
import { Body, ANIM, NET_DELAY_MS } from '../src/js/store3d/controls/body.js';

const box = (x0, z0, x1, z1, extra = {}) => ({ x0, z0, x1, z1, ...extra });
const DT = 1 / 60;

/** Schritte mit festem dt; fn(body, t) pro Schritt, bricht bei Rückgabe true ab. Rückgabe: vergangene Zeit. */
function run(b, seconds, intent, dt = DT, fn) {
  let t = 0;
  while (t < seconds - 1e-9) {
    b.step(dt, intent);
    t += dt;
    if (fn && fn(b, t) === true) break;
  }
  return t;
}
const walk = (tx, tz) => ({ tx, tz, manual: true, path: false, dirx: Math.sign(tx), dirz: Math.sign(tz) });

describe('Sprung', () => {
  it('Sprunghöhe 0,99 ± 0,05 m, Hangzeit 0,63 ± 0,05 s', () => {
    const b = new Body({ src: [] });
    expect(b.jump()).toBe(true);
    let max = 0;
    let air = 0;
    let left = false;
    run(b, 2, null, DT, (bd) => {
      max = Math.max(max, bd.y);
      if (!bd.grounded) { air += DT; left = true; }
      return left && bd.grounded;
    });
    expect(max).toBeGreaterThan(0.94);
    expect(max).toBeLessThan(1.04);
    expect(air).toBeGreaterThan(0.58);
    expect(air).toBeLessThan(0.68);
    expect(b.y).toBe(0);
    expect(b.grounded).toBe(true);
  });
  it('onJump und onLand (impact ≈ Absprunggeschwindigkeit)', () => {
    const b = new Body({ src: [] });
    const onJump = vi.fn();
    const onLand = vi.fn();
    b.onJump = onJump; b.onLand = onLand;
    b.jump();
    run(b, 1);
    expect(onJump).toHaveBeenCalledTimes(1);
    expect(onLand).toHaveBeenCalledTimes(1);
    expect(onLand.mock.calls[0][0].impact).toBeGreaterThan(5.5);
    expect(onLand.mock.calls[0][0].impact).toBeLessThan(7);
  });
  it('kein Sprung in der Luft ohne Coyote (kein Doppelsprung)', () => {
    const b = new Body({ src: [] });
    b.jump();
    run(b, 0.3);
    const vy = b.vy;
    expect(b.jump()).toBe(false);
    b.step(DT);
    expect(b.vy).toBeLessThan(vy); // nur Schwerkraft
  });
  it('Coyote: 0,08 s nach der Kante springt, 0,12 s nicht', () => {
    const mk = () => {
      const b = new Body({ src: [box(0, 0, 2, 2, { y1: 1 })], x: 1.9, z: 1, y: 1 });
      b.settle();
      expect(b.y).toBe(1);

      run(b, 1, walk(2, 0), 0.01, () => !b.grounded); // bis die Kante verlassen ist
      expect(b.grounded).toBe(false);
      return b;
    };
    const a = mk();
    run(a, 0.08, null, 0.01);
    expect(a.jump()).toBe(true);
    a.step(0.01);
    expect(a.vy).toBeGreaterThan(5);
    const c = mk();
    run(c, 0.12, null, 0.01);
    expect(c.jump()).toBe(false);
    c.step(0.01);
    expect(c.vy).toBeLessThan(0);
  });
  it('Sprungpuffer: Wunsch 0,09 s vor der Landung wird ausgeführt, 0,17 s davor verfällt', () => {
    const mk = () => { const b = new Body({ src: [] }); b.y = 0.5; b.grounded = false; return b; }; // Fall aus 0,5 m: Landung nach ≈ 0,224 s
    const a = mk();
    run(a, 0.13, null, 0.01);
    a.jump();
    let jumped = false;
    run(a, 0.5, null, 0.01, (bd) => { if (bd.vy > 5) jumped = true; return jumped; });
    expect(jumped).toBe(true);
    const c = mk();
    run(c, 0.05, null, 0.01);
    c.jump();
    run(c, 0.5, null, 0.01);
    expect(c.vy).toBe(0);
    expect(c.grounded).toBe(true);
  });
});

describe('Stufen, Dach, Abgrund', () => {
  it('Stufe 0,3 hinauf und hinab ohne Sprung', () => {
    const b = new Body({ src: [box(1, -1, 3, 1, { y1: 0.3 })], x: 0, z: 0 });
    run(b, 1.1, walk(2, 0), 0.01);
    expect(b.x).toBeGreaterThan(1.5);
    expect(b.x).toBeLessThan(3);
    expect(b.y).toBe(0.3);
    expect(b.grounded).toBe(true);
    run(b, 1.2, walk(2, 0), 0.01);
    expect(b.x).toBeGreaterThan(3.3);
    expect(b.y).toBe(0);
    expect(b.grounded).toBe(true);
  });
  it('Stufe 0,5 (Bank) blockiert am Boden', () => {
    const b = new Body({ src: [box(1, -1, 3, 1, { y1: 0.5 })], x: 0, z: 0 });
    run(b, 1.5, walk(2, 0), 0.01);
    expect(b.x).toBeLessThanOrEqual(1 - 0.28 + 1e-6);
    expect(b.y).toBe(0);
  });
  it('Fallen vom Dach und Landung mit Aufprall', () => {
    const roof = box(0, 0, 2, 2, { y0: 3, y1: 3.2 });
    const b = new Body({ src: [roof], x: 1.8, z: 1, y: 3.2 });
    b.settle();
    expect(b.y).toBe(3.2);
    const onLand = vi.fn();
    b.onLand = onLand;
    run(b, 3, walk(2, 0), 0.01, () => onLand.mock.calls.length > 0);
    expect(onLand).toHaveBeenCalledTimes(1);
    expect(onLand.mock.calls[0][0].impact).toBeGreaterThan(9);
    expect(b.y).toBe(0);
    expect(b.grounded).toBe(true);
  });
  it('Kopfstoß unter niedriger Decke beendet den Aufstieg', () => {
    const b = new Body({ src: [box(-5, -5, 5, 5, { y0: 2.2, y1: 2.4 })] });
    b.jump();
    let max = 0;
    run(b, 1, null, 0.01, (bd) => { max = Math.max(max, bd.y); });
    expect(max).toBeLessThanOrEqual(2.2 - 1.7 + 1e-6);
    expect(b.y).toBe(0);
  });
  it('Abgrund (y < -6): zurück zur letzten sicheren Stelle', () => {
    const b = new Body({ src: [], x: 1, z: 1, spawn: { x: 1, z: 1 } });
    run(b, 1.2, walk(2, 0), 0.01);
    const safe = { ...b.lastSafe };
    expect(safe.x).toBeGreaterThan(1.5); // alle 0,5 s nachgeführt
    b.y = -7; b.grounded = false; b.vy = -10;
    b.step(0.01);
    expect(b.y).toBe(0);
    expect(b.grounded).toBe(true);
    expect(b.x).toBeCloseTo(safe.x, 6);
    expect(b.vx).toBe(0);
  });
});

describe('Hochziehen (Mantle)', () => {
  it('Sprung gegen 1,0-m-Kante: Hochziehen in 0,28 s, danach grounded auf der Oberkante', () => {
    const wall = box(0, 0, 4, 1, { y1: 1.0 });
    const b = new Body({ src: [wall], x: 2, z: 1.3 });
    const onMantle = vi.fn();
    b.onMantle = onMantle;
    const it = { tx: 0, tz: -2, manual: true, path: false, dirx: 0, dirz: -1 };
    b.jump();
    let start = -1;
    let end = -1;
    let t = 0;
    for (let i = 0; i < 200; i++) {
      b.step(0.01, it);
      t += 0.01;
      if (start < 0 && b.mantle) start = t;
      if (start >= 0 && !b.mantle) { end = t; break; }
    }
    expect(start).toBeGreaterThan(0);
    expect(onMantle).toHaveBeenCalledTimes(1);
    expect(end - start).toBeGreaterThan(0.25);
    expect(end - start).toBeLessThan(0.32);
    expect(b.grounded).toBe(true);
    expect(b.y).toBe(1.0);
    expect(b.z).toBeLessThan(1);
    expect(b.vy).toBe(0);
  });
  it('Autodach 1,5 m: nur per Sprung + Hochziehen erreichbar (nie nur durch Gehen)', () => {
    const roof = box(0, 0, 4, 1, { y1: 1.5 });
    const it = { tx: 0, tz: -2, manual: true, path: false, dirx: 0, dirz: -1 };
    const walkOnly = new Body({ src: [roof], x: 2, z: 1.3 });
    run(walkOnly, 1, it, 0.01);
    expect(walkOnly.y).toBe(0);
    const b = new Body({ src: [roof], x: 2, z: 1.3 });
    b.jump();
    run(b, 1, it, 0.01, (bd) => bd.grounded && bd.y > 0.5);
    expect(b.y).toBe(1.5);
    expect(b.grounded).toBe(true);
  });
  it('Reichweite: Sprung + Hochziehen bis ca. 2,3 m (Scheitel 1,0 + MANTLE_H 1,3), 2,5 m nicht', () => {
    const tryWall = (y1) => {
      const b = new Body({ src: [box(0, 0, 4, 1, { y1 })], x: 2, z: 1.3 });
      b.jump();
      run(b, 1.2, { tx: 0, tz: -2, manual: true, path: false, dirx: 0, dirz: -1 }, 0.01, (bd) => bd.grounded && bd.y > 0.5);
      return b.y;
    };
    expect(tryWall(2.2)).toBe(2.2);
    expect(tryWall(2.5)).toBe(0);
  });
  it('ohne Eingabe in Richtung der Kante kein Hochziehen', () => {
    const b = new Body({ src: [box(0, 0, 4, 1, { y1: 1.0 })], x: 2, z: 1.3 });
    b.jump();
    let mantled = false;
    run(b, 1, null, 0.01, (bd) => { if (bd.mantle) mantled = true; });
    expect(mantled).toBe(false);
  });
});

describe('Substeps', () => {
  it('dt 0,1: Rennen durch eine dünne Wand tunnelt nicht', () => {
    const b = new Body({ src: [box(1, -5, 1.1, 5)], x: 0, z: 0 });
    run(b, 1.5, walk(4, 0), 0.1);
    expect(b.x).toBeLessThanOrEqual(1 - 0.28 + 1e-6);
  });
  it('dt 0: kein Absturz, nichts bewegt sich', () => {
    const b = new Body({ src: [], x: 1, z: 2 });
    b.step(0, walk(2, 0));
    expect([b.x, b.z, b.y]).toEqual([1, 2, 0]);
  });
});

describe('knock', () => {
  it('Impuls 4 m/s * Stärke, klingt ab, bricht den Pfad ab, setzt Wackeln', () => {
    const b = new Body({ src: [], x: 0, z: 0 });
    const abort = vi.spyOn(b, 'abortPath');
    b.knock({ x: 3, z: 0 }, 2);
    expect(abort).toHaveBeenCalled();
    expect(b.knockVx).toBeCloseTo(8, 6);
    expect(b.knockVz).toBeCloseTo(0, 6);
    expect(b.shake).toBeCloseTo(0.08, 6);
    expect(b.animCode()).toBe(ANIM.KNOCK);
    run(b, 0.3, null, 0.01);
    expect(b.x).toBeGreaterThan(0.5);
    run(b, 3, null, 0.01);
    expect(b.knockVx).toBe(0);
    expect(b.vx).toBe(0);
    const x = b.x;
    run(b, 0.5, null, 0.01);
    expect(b.x).toBe(x);
  });
  it('up hebt vom Boden ab', () => {
    const b = new Body({ src: [] });
    b.knock({ x: 0, z: 1, up: 4 });
    expect(b.grounded).toBe(false);
    b.step(0.01);
    expect(b.y).toBeGreaterThan(0);
  });
});

describe('Netzzustand', () => {
  it('getNetState: Format und Rundung', () => {
    const b = new Body({ src: [], x: 1.23456, z: -2.98765, y: 0, yaw: 1.23456, spawn: { x: 0, z: 0 } });
    b.pitch = -0.4567;
    b.heldId = 'abc';
    const s = b.getNetState();
    expect(Object.keys(s)).toEqual(['x', 'y', 'z', 'yaw', 'pitch', 'vx', 'vy', 'vz', 'a', 'h']);
    expect(s).toMatchObject({ x: 1.235, y: 0, z: -2.988, yaw: 1.23, pitch: -0.46, a: 0, h: 'abc' });
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    b.heldId = null;
    expect(b.getNetState().h).toBe(null);
  });
  it('Animationscodes: steht, geht, rennt, Luft, Mantle, Schlag', () => {
    const b = new Body({ src: [] });
    expect(b.animCode()).toBe(0);
    run(b, 0.5, walk(2.2, 0), 0.01);
    expect(b.animCode()).toBe(ANIM.WALK);
    run(b, 0.7, walk(4, 0), 0.01);
    expect(b.animCode()).toBe(ANIM.RUN);
    b.grounded = false;
    expect(b.animCode()).toBe(ANIM.AIR);
    b.grounded = true;
    b.swing();
    expect(b.animCode()).toBe(ANIM.HIT);
    b.mantle = { t: 0 };
    expect(b.animCode()).toBe(ANIM.MANTLE);
  });
  it('applyRemote: erster Stand setzt sofort, danach Interpolation mit 100 ms Verzögerung', () => {
    const b = new Body({ src: [] });
    b.applyRemote({ x: 0, y: 0, z: 0, yaw: 0, pitch: 0, a: 0, h: null }, 1000);
    expect(b.remote).toBe(true);
    b.applyRemote({ x: 2, y: 1, z: 0, yaw: 1, pitch: 0, a: 1, h: 'q' }, 1100);
    expect(b.heldId).toBe('q');
    // Renderzeit startet bei 1000 - 100 = 900 → vor dem ersten Eintrag: Stand 0
    b.step(0.1);
    expect(b.x).toBeCloseTo(0, 6);
    // Renderzeit 1000 = erster Eintrag; nach weiteren 50 ms halb zum zweiten
    b.step(0.05);
    expect(b.x).toBeCloseTo(1, 1);
    expect(b.y).toBeCloseTo(0.5, 1);
    expect(b.yaw).toBeCloseTo(0.5, 1);
    b.step(1);
    expect(b.x).toBeCloseTo(2, 6);
    expect(NET_DELAY_MS).toBe(100);
  });
  it('applyRemote: Winkel über angDiff (kurzer Weg über ±π)', () => {
    const b = new Body({ src: [] });
    b.applyRemote({ x: 0, z: 0, yaw: 3, a: 0 }, 0);
    b.applyRemote({ x: 0, z: 0, yaw: -3, a: 0 }, 200);
    b.step(0.2 + 0.1); // Renderzeit 100 + 100 - ... = Mitte
    expect(Math.abs(Math.abs(b.yaw) - Math.PI)).toBeLessThan(0.2);
  });
  it('applyRemote: Abstand > 3 m springt sofort; Puffer höchstens 8 Einträge; Remote-Körper hat keine Physik', () => {
    const b = new Body({ src: [box(0, 0, 1, 1)] });
    b.applyRemote({ x: 0, z: 0, a: 0 }, 0);
    b.applyRemote({ x: 10, z: 0, a: 0 }, 50);
    expect(b.x).toBe(10);
    for (let i = 0; i < 20; i++) b.applyRemote({ x: 10 + i * 0.01, z: 0, a: 0 }, 100 + i * 50);
    expect(b.netBuf.length).toBeLessThanOrEqual(8);
    b.y = 5;
    b.step(0.5);
    expect(b.y).toBe(0); // setNet legt y aus dem Paket (0) fest; keine Schwerkraft, keine Kollision
    b.applyRemote({ x: 0.5, z: 0.5, a: 0 }, 5000);
    b.step(0.5);
    expect(b.x).toBeGreaterThan(-5); // kollidiert nicht mit dem Rechteck
  });
});
