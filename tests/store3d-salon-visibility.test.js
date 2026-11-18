// @vitest-environment jsdom
// modules/city.js: die Gruppe salonInterior ist nur im Salon und kurz vor der Salontür sichtbar (1.17.0).
import { describe, it, expect, vi } from 'vitest';
import { Scene, Group, PerspectiveCamera } from 'three';
import { layoutOf } from './helpers-city.js';

vi.mock('../src/js/store3d/world/textures.js', async () => {
  const { fakeCanvas } = await import('./helpers-city.js');
  const { Texture } = await import('three');
  return { makeCanvas: (w, h) => fakeCanvas(w, h), toTexture: () => new Texture(), FONT: 'sans-serif' };
});

const { default: cityModule } = await import('../src/js/store3d/modules/city.js');

function world() {
  const L = layoutOf(80);
  L.facade = L.facade || { door: L.door, windows: [] };
  const scene = new Scene();
  const rig = new Group();
  rig.name = 'lfx-rig';
  scene.add(rig);
  const providers = new Map();
  let pose = { x: L.spawn.x, z: L.spawn.z, y: 0, yaw: 0, pitch: 0 };
  const ctx = {
    scene, layout: L, opts: { skipIntro: true }, isPhone: false, isTouch: false, camera: new PerspectiveCamera(),
    quality: () => 'low', renderer: { domElement: document.createElement('canvas') },
    player: { getPose: () => pose, teleport() {}, freeze() {}, camera: { flyTo: vi.fn(), release: vi.fn() } },
    track: (o) => o, provide: (n, v) => providers.set(n, v), use: (n) => providers.get(n), on: () => () => {},
    addCollider: () => {}, removeCollider: () => {},
  };
  return { L, ctx, providers, setPose: (p) => { pose = { ...pose, ...p }; } };
}

describe('city: salonInterior-Sichtbarkeit', () => {
  it('Anfangswert unsichtbar im Laden, sichtbar im Salon und kurz vor der Tür, wieder aus an der Ladentür', () => {
    const w = world();
    const h = cityModule.init(w.ctx);
    const city = w.providers.get('city');
    const g = city.groups.salonInterior;
    expect(city.visible().salonInterior).toBe(false);
    h.update(0.2);
    expect(g.visible).toBe(false);
    const sz = w.L.city.frame.sz;
    w.setPose({ x: -18, z: sz + 3 });
    h.update(0.2);
    expect(city.visible().salonInterior).toBe(true);
    expect(g.visible).toBe(true);
    w.setPose({ x: -18, z: sz - 6 });
    h.update(0.2);
    expect(g.visible).toBe(true);
    w.setPose({ x: w.L.w / 2, z: w.L.d + 1.6 });
    h.update(0.2);
    expect(g.visible).toBe(false);
    h.dispose();
  });
});
