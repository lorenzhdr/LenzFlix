// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { Scene, Group, PerspectiveCamera } from 'three';
import { layoutOf } from './helpers-city.js';

vi.mock('../src/js/store3d/world/textures.js', async () => {
  const { fakeCanvas } = await import('./helpers-city.js');
  const { Texture } = await import('three');
  return { makeCanvas: (w, h) => fakeCanvas(w, h), toTexture: () => new Texture(), FONT: 'sans-serif' };
});

const { getOutdoor } = await import('../src/js/store3d/modules/outdoor.js');
const { default: cityModule } = await import('../src/js/store3d/modules/city.js');

function world() {
  const L = layoutOf(120);
  L.facade = L.facade || { door: L.door, windows: [] };
  const scene = new Scene();
  const rig = new Group();
  rig.name = 'lfx-rig';
  scene.add(rig);
  const providers = new Map();
  const ctx = {
    scene, layout: L, opts: { skipIntro: true }, isPhone: false, isTouch: false, camera: new PerspectiveCamera(),
    quality: () => 'low', renderer: { domElement: document.createElement('canvas') },
    player: { getPose: () => ({ x: L.spawn.x, z: L.spawn.z, y: 0, yaw: 0, pitch: 0 }), teleport() {}, freeze() {}, camera: { flyTo: vi.fn(), release: vi.fn() } },
    track: (o) => o, provide: (n, v) => providers.set(n, v), use: (n) => providers.get(n), on: () => () => {},
    addCollider: () => {}, removeCollider: () => {},
  };
  return { L, scene, ctx };
}

describe('Stadt-Layout: Anker für andere Pakete', () => {
  const L = layoutOf(80);
  const c = L.city;
  it('Palast-Schaukästen, Neonschild, Korb, Graffiti, Verkäuferin, Litfaßsäule', () => {
    expect(c.palast.posterSlots).toHaveLength(4);
    for (const s of c.palast.posterSlots) {
      expect(s.yaw).toBeCloseTo(Math.PI);
      expect(s.x - s.w / 2 > c.palast.rect.x0 && s.x + s.w / 2 < c.palast.rect.x1).toBe(true);
      expect(s.x + s.w / 2 < c.palast.doorX0 || s.x - s.w / 2 > c.palast.doorX1).toBe(true); // Türöffnung bleibt frei
    }
    expect(c.yard.hoop).toMatchObject({ y: 3.05 });
    expect(c.yard.hoop.x).toBeGreaterThan(c.yard.x0);
    expect(c.yard.hoop.x).toBeLessThan(c.yard.x1);
    expect(c.yard.graffiti.w).toBeGreaterThan(2);
    expect(c.kiosk.vendor).toMatchObject({ yaw: Math.PI });
    expect(c.litfass.slot.r).toBeGreaterThan(0.3);
  });
  it('Läden mit Namen sitzen vor einem Haus, Texte ohne Fremdmarken', () => {
    expect(c.shopFronts.length).toBeGreaterThanOrEqual(5);
    for (const s of c.shopFronts) {
      const b = c.buildings.find((q) => q.id === s.id);
      expect(s.x - s.w / 2).toBeGreaterThanOrEqual(b.x0 - 1e-6);
      expect(s.x + s.w / 2).toBeLessThanOrEqual(b.x1 + 1e-6);
      expect(s.text.length).toBeGreaterThan(5);
    }
  });
  it('neue Hindernisse stehen nicht in der Ladentür-Zone und nicht auf dem Spawn', () => {
    for (const id of ['litfass', 'bikerack', 'kioskTable', 'hoopMast', 'palletA', 'palletB']) {
      const q = c.colliders.find((k) => k.id === id);
      expect(q, id).toBeTruthy();
      for (const sp of Object.values(c.spawns)) expect(sp.x >= q.x0 - 0.3 && sp.x <= q.x1 + 0.3 && sp.z >= q.z0 - 0.3 && sp.z <= q.z1 + 0.3, `${id} auf Spawn`).toBe(false);
    }
  });
});

describe('Stadt-Dekor (Meshes)', () => {
  it('baut Dekor-Meshes, Lauflicht bewegt sich, Tageszeit färbt, dispose räumt auf', () => {
    const w = world();
    const h = cityModule.init(w.ctx);
    const out = getOutdoor(w.ctx);
    const names = new Set();
    w.scene.traverse((o) => { if (o.name) names.add(o.name); });
    for (const n of ['city-shopsigns', 'city-shopglass', 'city-bulbs', 'city-halos', 'city-decor', 'city-yard-decor', 'city-palast-decor', 'city-litfass', 'city-ped-lamps']) expect(names.has(n), n).toBe(true);
    const bulbs = w.scene.getObjectByName('city-bulbs');
    const o0 = bulbs.material.map.offset.x;
    h.update(0.2);
    expect(bulbs.material.map.offset.x).not.toBe(o0);
    out.setPalette('night', false);
    expect(bulbs.material.opacity).toBe(1);
    expect(w.scene.getObjectByName('city-halos').visible).toBe(true);
    out.setPalette('day', false);
    expect(w.scene.getObjectByName('city-halos').visible).toBe(false);
    // Fußgänger-Ampel: grün, wenn Haupt rot
    const ped = w.scene.getObjectByName('city-ped-lamps');
    const col = ped.geometry.attributes.color;
    out.city.setSignals({ main: 'red', side: 'green', walkMain: true, walkSide: false });
    const first = w.L.city.signals.findIndex((s) => s.signal === 'main');
    const base = first * 32 + 24 + 4; // grüne Lampe
    expect(col.getY(base)).toBeGreaterThan(0.9);
    h.dispose();
    expect(w.scene.getObjectByName('city-bulbs')).toBeUndefined();
  });
});
