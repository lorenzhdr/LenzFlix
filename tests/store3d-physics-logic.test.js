import { describe, it, expect } from 'vitest';
import { pickInCone } from '../src/js/store3d/physics/cone.js';
import { resolveHoop, createHoopTracker } from '../src/js/store3d/physics/hoop.js';
import { createThrownTape, throwVelocity, RETURN_AFTER } from '../src/js/store3d/physics/throwlife.js';
import { shouldReset, pyramidDown, displaced } from '../src/js/store3d/physics/home.js';
import { createWorld, DT } from '../src/js/store3d/physics/world.js';
import { dimsOf, KINDS } from '../src/js/store3d/physics/kinds.js';

const body = (x, y, z, over = {}) => ({ pos: { x, y, z }, hy: 0.12, r: 0.12, ...over });

describe('Kegel-Treffer', () => {
  const q = { x: 0, z: 0, dx: 0, dz: -1, y: 0, range: 1.6, deg: 25 };
  it('trifft Dinge am Boden (Höhenband ab den Füßen) im Kegel und wählt das nächste', () => {
    const near = body(0.1, 0.12, -1.0);
    const far = body(0, 0.12, -1.5);
    expect(pickInCone([far, near], q).body).toBe(near);
  });
  it('verfehlt außerhalb von Winkel, Reichweite und Höhenband', () => {
    expect(pickInCone([body(1.2, 0.12, -1.0)], q)).toBeNull();
    expect(pickInCone([body(0, 0.12, -2.5)], q)).toBeNull();
    expect(pickInCone([body(0, 5, -1)], q)).toBeNull();
    expect(pickInCone([body(0, 0.12, 1)], q)).toBeNull();
    expect(pickInCone([body(0, 0.12, -1, { held: true })], q)).toBeNull();
  });
  it('Körper direkt am Spieler zählen immer', () => {
    expect(pickInCone([body(0.05, 0.12, 0.05, { r: 0.2 })], q)).not.toBeNull();
  });
});

describe('Basketballkorb', () => {
  const hoop = { x: 0, y: 3.05, z: 0, r: 0.3 };
  it('zählt Durchwurf von oben, nicht von unten oder daneben', () => {
    const t = createHoopTracker(hoop);
    expect(t.feed(1, { x: 0.05, y: 3.2, z: 0 }, { x: 0.05, y: 2.9, z: 0 })).toBe(true);
    expect(t.feed(1, { x: 0, y: 3.2, z: 0 }, { x: 0, y: 2.9, z: 0 })).toBe(false);
    expect(t.feed(2, { x: 0, y: 2.9, z: 0 }, { x: 0, y: 3.2, z: 0 })).toBe(false);
    expect(t.feed(3, { x: 0.8, y: 3.2, z: 0 }, { x: 0.8, y: 2.9, z: 0 })).toBe(false);
    expect(t.state.hits).toBe(1);
  });
  it('Serie: Fehlwurf setzt zurück, drei Treffer in Folge werden gezählt', () => {
    const score = [];
    const t = createHoopTracker(hoop, { onScore: (s) => score.push(s.streak) });
    for (let id = 1; id <= 3; id++) { t.shot(id); t.feed(id, { x: 0, y: 3.2, z: 0 }, { x: 0, y: 2.9, z: 0 }); t.landed(id); }
    expect(score).toEqual([1, 2, 3]);
    t.shot(9);
    t.landed(9);
    expect(t.state.streak).toBe(0);
    expect(t.state.best).toBe(3);
  });
  it('echter Ball aus der Physik fällt durch den Ring', () => {
    const w = createWorld({ src: [] });
    const t = createHoopTracker(hoop);
    const b = w.spawn({ kind: 'basketball', pos: { x: 0, y: 4, z: 0.02 }, vel: { x: 0, y: 1, z: 0 } });
    let ok = false;
    for (let i = 0; i < 120 && !ok; i++) { const p = { ...b.pos }; w.step(DT); ok = t.feed(b.id, p, b.pos, b.r); }
    expect(ok).toBe(true);
  });
  it('Korb-Anker: tolerant gelesen, sonst Rückfall im Hof', () => {
    expect(resolveHoop({ hoop: { ring: { x: 1, y: 3, z: 2, r: 0.25 } } })).toMatchObject({ x: 1, y: 3, z: 2, r: 0.25, fallback: false });
    expect(resolveHoop({ hoop: { x: 4, z: 5 } })).toMatchObject({ x: 4, z: 5, fallback: false });
    const fb = resolveHoop({ x0: -3, z0: -11, x1: 20, z1: -0.5 });
    expect(fb.fallback).toBe(true);
    expect(fb.x).toBeLessThan(20);
    expect(resolveHoop(null)).toBeNull();
  });
});

describe('Wurf-Lebenszyklus der Hülle', () => {
  it('Flug, Landung, nach 6 s zurück ins Regal', () => {
    const t = createThrownTape('a');
    expect(t.update(1, false)).toBeNull();
    expect(t.pickup()).toBe(false);
    t.update(0.1, true);
    expect(t.state.phase).toBe('landed');
    expect(t.update(RETURN_AFTER - 0.5, true)).toBeNull();
    expect(t.update(1, true)).toBe('restore');
    expect(t.update(1, true)).toBeNull();
  });
  it('Aufheben nach der Landung beendet den Zyklus ohne Rückgabe', () => {
    const t = createThrownTape('a');
    t.update(0.1, true);
    expect(t.pickup()).toBe(true);
    expect(t.update(10, true)).toBeNull();
    expect(t.cancel()).toBe(false);
  });
  it('Abwurf ~9 m/s nach vorn und oben', () => {
    const v = throwVelocity({ x: 0, y: 0, z: -1 });
    expect(Math.hypot(v.x, v.y, v.z)).toBeCloseTo(9, 5);
    expect(v.y).toBeGreaterThan(0);
    expect(v.z).toBeLessThan(0);
  });
});

describe('Rücksetzen und Pyramide', () => {
  const home = { x: 0, y: 0.1, z: 0, yaw: 0 };
  const sleepy = (over) => ({ home, held: false, sleeping: true, restT: 130, tipA: 0, pos: { x: 3, y: 0.1, z: 0 }, ...over });
  const hidden = { inView: () => false };
  it('nur nach Ruhezeit, verschoben und außerhalb des Blickfelds', () => {
    expect(shouldReset(sleepy(), hidden)).toBe(true);
    expect(shouldReset(sleepy({ restT: 60 }), hidden)).toBe(false);
    expect(shouldReset(sleepy(), { inView: () => true })).toBe(false);
    expect(shouldReset(sleepy({ pos: { x: 0.05, y: 0.1, z: 0 } }), hidden)).toBe(false);
    expect(shouldReset(sleepy({ held: true }), hidden)).toBe(false);
    expect(displaced(sleepy({ pos: { ...home }, tipA: 1 }))).toBe(true);
  });
  it('Pyramide gilt erst als umgeworfen, wenn alle Dosen bewegt sind und ruhen', () => {
    const can = (moved, sleeping = true) => ({ sleeping, home, tipA: 0, pos: { x: moved ? 1 : 0, y: 0.1, z: 0 } });
    expect(pyramidDown([can(true), can(true), can(false)])).toBe(false);
    expect(pyramidDown([can(true), can(true, false)])).toBe(false);
    expect(pyramidDown([can(true), can(true)])).toBe(true);
    expect(pyramidDown([])).toBe(false);
  });
});

describe('Objektarten', () => {
  it('Maße: Kugel Radius, Quader halbe Kantenlängen, überschreibbar', () => {
    expect(dimsOf({ kind: 'soccer' })).toMatchObject({ shape: 'sphere', r: 0.11, hy: 0.11 });
    expect(dimsOf({ kind: 'crate' })).toMatchObject({ shape: 'box', hx: 0.25, hy: 0.15 });
    expect(dimsOf({ shape: 'sphere', radius: 0.5 }).r).toBe(0.5);
    expect(KINDS.can.throwable && KINDS.cone.throwable).toBe(true);
    expect(KINDS.bin.throwable).toBeFalsy();
  });
});
