// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { Scene, Group } from 'three';
import { layoutOf } from './helpers-city.js';

vi.mock('../src/js/store3d/world/textures.js', async () => {
  const { fakeCanvas } = await import('./helpers-city.js');
  const { Texture } = await import('three');
  return { makeCanvas: (w, h) => fakeCanvas(w, h), toTexture: () => new Texture(), FONT: 'sans-serif' };
});

const { default: doorModule, OPEN_SPEED, CLOSE_SPEED } = await import('../src/js/store3d/modules/door.js');
const { shared } = await import('../src/js/store3d/modules/m4-util.js');

function leaf(name) {
  const g = new Group();
  g.name = name;
  const frame = new Group();
  frame.name = 'lfx-door-frame';
  frame.material = { color: { setRGB: vi.fn() } };
  g.add(frame);
  return g;
}

function setup() {
  const L = layoutOf(80);
  const scene = new Scene();
  scene.add(leaf('lfx-door-left'), leaf('lfx-door-right'));
  const out = { tinted: [], tod: 'day', rain: false, setPalette: vi.fn() };
  shared(scene, 'outdoor', () => out);
  const pose = { x: L.w / 2, z: L.d - 3, y: 0, yaw: 0, pitch: 0 };
  const listeners = new Map();
  const providers = new Map();
  const colliders = [];
  const teleports = [];
  const sound = { play: vi.fn() };
  const ctx = {
    scene, layout: L, opts: {},
    player: { getPose: () => ({ ...pose }), teleport: (...a) => teleports.push(a) },
    addCollider: vi.fn((r) => { colliders.push(r); return r; }),
    removeCollider: vi.fn((r) => { const i = colliders.indexOf(r); if (i >= 0) colliders.splice(i, 1); }),
    track: (o) => o,
    provide: (n, p) => providers.set(n, p),
    use: (n) => (n === 'sound' ? sound : providers.get(n)),
    on: (ev, fn) => { const l = listeners.get(ev) || []; l.push(fn); listeners.set(ev, l); return () => {}; },
  };
  const h = doorModule.init(ctx);
  return { L, scene, out, pose, ctx, h, door: providers.get('door'), sound, colliders, teleports, emit: (ev, ...a) => (listeners.get(ev) || []).forEach((f) => f(...a)) };
}
const run = (h, sec, dt = 0.05) => { for (let t = 0; t < sec; t += dt) h.update(dt); };

describe('Modul door', () => {
  it('Tür öffnet sich, wenn der Spieler nah ist, und schließt sich langsamer wieder', () => {
    const s = setup();
    run(s.h, 1);
    expect(s.door.amount()).toBe(0);
    s.pose.z = s.L.d + 0.5;
    run(s.h, 0.1);
    expect(s.door.amount()).toBeGreaterThan(0);
    run(s.h, 1 / OPEN_SPEED + 0.1);
    expect(s.door.amount()).toBe(1);
    expect(s.scene.getObjectByName('lfx-door-left').rotation.y).toBeLessThan(-1.4);
    expect(s.scene.getObjectByName('lfx-door-right').rotation.y).toBeGreaterThan(1.4);
    s.pose.z = s.L.d - 4;
    run(s.h, 0.3);
    expect(s.door.amount()).toBeGreaterThan(0.3); // Schließen dauert länger als Öffnen (nach 0,3 s erst knapp halb zu)
    run(s.h, 1 / CLOSE_SPEED + 0.2);
    expect(s.door.amount()).toBe(0);
    expect(OPEN_SPEED).toBeGreaterThan(CLOSE_SPEED);
  });

  it('Spawn im Laden (z = D - 1,4) öffnet die Tür nicht', () => {
    const s = setup();
    s.pose.z = s.L.spawn.z;
    s.pose.x = s.L.spawn.x;
    run(s.h, 1);
    expect(s.door.amount()).toBe(0);
  });

  it('override setzt die Öffnung direkt, null übergibt an die Automatik', () => {
    const s = setup();
    s.door.override(0.5);
    expect(s.door.amount()).toBe(0.5);
    expect(s.scene.getObjectByName('lfx-door-left').rotation.y).toBeCloseTo(-0.725);
    run(s.h, 1);
    expect(s.door.amount()).toBe(0.5); // Automatik ruht
    s.door.override(null);
    run(s.h, 3);
    expect(s.door.amount()).toBe(0);
  });

  it('registrierte Akteure öffnen die Tür', () => {
    const s = setup();
    const off = s.door.registerActor(() => ({ x: s.L.w / 2, z: s.L.d + 1 }));
    run(s.h, 1);
    expect(s.door.amount()).toBe(1);
    off();
    run(s.h, 3);
    expect(s.door.amount()).toBe(0);
  });

  it('lock fügt doorBlock hinzu und schließt die Tür; unlock entfernt ihn wieder', () => {
    const s = setup();
    s.pose.z = s.L.d + 0.5;
    run(s.h, 1);
    const changes = [];
    s.door.onChange((v) => changes.push(v));
    s.door.lock(0);
    expect(s.door.isLocked()).toBe(true);
    expect(s.colliders).toContain(s.L.doorBlock);
    run(s.h, 3);
    expect(s.door.amount()).toBe(0);
    s.door.unlock();
    expect(s.door.isLocked()).toBe(false);
    expect(s.colliders).not.toContain(s.L.doorBlock);
    expect(changes).toEqual([true, false]);
  });

  it('lock(sec) läuft von selbst ab', () => {
    const s = setup();
    s.door.lock(2);
    run(s.h, 1.5);
    expect(s.door.isLocked()).toBe(true);
    run(s.h, 1);
    expect(s.door.isLocked()).toBe(false);
    expect(s.colliders).toHaveLength(0);
  });

  it('Türglocke nur von außen nach innen', () => {
    const s = setup();
    s.pose.z = s.L.d + 1.5;
    s.pose.x = s.L.w / 2;
    s.h.update(0.05);
    s.pose.z = s.L.d + 0.1; // drin
    s.h.update(0.05);
    expect(s.sound.play).toHaveBeenCalledTimes(1);
    expect(s.sound.play).toHaveBeenCalledWith('doorbell');
    s.pose.z = s.L.d + 1.5; // wieder raus: keine Glocke
    s.h.update(0.05);
    s.h.update(0.05);
    expect(s.sound.play).toHaveBeenCalledTimes(1);
  });

  it('keine Glocke während des Intros (override aktiv)', () => {
    const s = setup();
    s.door.override(0);
    s.pose.z = s.L.d + 1.5;
    s.h.update(0.05);
    s.pose.z = s.L.d + 0.1;
    s.h.update(0.05);
    expect(s.sound.play).not.toHaveBeenCalled();
  });

  it('VR: Spalt wird gesperrt, Spieler draußen kehrt in den Laden zurück', () => {
    const s = setup();
    s.pose.z = s.L.d + 5;
    s.emit('xr', true);
    expect(s.colliders).toContain(s.L.doorBlock);
    expect(s.teleports).toHaveLength(1);
    expect(s.teleports[0].slice(0, 2)).toEqual([s.L.spawn.x, s.L.spawn.z]);
    s.emit('xr', false);
    expect(s.colliders).not.toContain(s.L.doorBlock);
  });

  it('Türflügel-Materialien werden getönt geführt und bei dispose zurückgegeben', () => {
    const s = setup();
    expect(s.out.tinted).toHaveLength(2);
    s.door.override(1);
    s.h.dispose();
    expect(s.out.tinted).toHaveLength(0);
    expect(s.scene.getObjectByName('lfx-door-left').rotation.y).toBe(0);
  });
});
