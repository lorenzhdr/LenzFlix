// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { Scene, Group, Mesh, PerspectiveCamera } from 'three';
import { layoutOf } from './helpers-city.js';

vi.mock('../src/js/store3d/world/textures.js', async () => {
  const { fakeCanvas } = await import('./helpers-city.js');
  const { Texture } = await import('three');
  return { makeCanvas: (w, h) => fakeCanvas(w, h), toTexture: () => new Texture(), FONT: 'sans-serif' };
});

const { getOutdoor } = await import('../src/js/store3d/modules/outdoor.js');
const { default: cityModule, fogRange } = await import('../src/js/store3d/modules/city.js');
const { default: introModule } = await import('../src/js/store3d/modules/intro.js');
const { buildFacade } = await import('../src/js/store3d/world/build-facade.js');
const { presetFor } = await import('../src/js/store3d/engine/quality.js');

function world(opts = {}, pose = {}) {
  const L = layoutOf(120);
  L.facade = L.facade || { door: L.door, windows: [] };
  const scene = new Scene();
  const room = new Group();
  room.name = 'room';
  const shelves = new Group();
  shelves.name = 'shelves';
  const m3 = new Group();
  m3.name = 'm3-showcase';
  const rig = new Group();
  rig.name = 'lfx-rig';
  scene.add(room, shelves, m3, rig);
  const p = { x: L.spawn.x, z: L.spawn.z, y: 0, yaw: 0, pitch: 0, ...pose };
  const listeners = new Map();
  const providers = new Map();
  const tracked = [];
  const ctx = {
    scene, layout: L, opts, isPhone: false, isTouch: false, camera: new PerspectiveCamera(),
    quality: () => 'low', renderer: { domElement: document.createElement('canvas') },
    player: { getPose: () => ({ ...p }), teleport() {}, freeze() {}, camera: { flyTo: vi.fn(() => Promise.resolve(true)), release: vi.fn() } },
    track: (o) => { tracked.push(o); return o; },
    provide: (n, v) => providers.set(n, v),
    use: (n) => providers.get(n),
    on: (ev, fn) => { const l = listeners.get(ev) || []; l.push(fn); listeners.set(ev, l); return () => {}; },
    addCollider: () => {}, removeCollider: () => {},
  };
  const emit = (ev, ...a) => (listeners.get(ev) || []).forEach((f) => f(...a));
  return { L, scene, ctx, p, providers, tracked, room, shelves, m3, emit };
}

describe('Modul city: Fassade, Stadt, Nebel, Partition', () => {
  it('Fassade existiert mit skipIntro und hat keinen Rollladen', () => {
    const w = world({ skipIntro: true });
    cityModule.init(w.ctx);
    const out = getOutdoor(w.ctx);
    expect(out.facade).toBeTruthy();
    expect(out.facade.shutter).toBeNull();
    expect(out.facade.group.parent).toBe(out.group);
  });

  it('Fassade mit Rollladen, wenn ein Intro folgt; dropShutter entfernt ihn, die Fassade bleibt', () => {
    const w = world({});
    cityModule.init(w.ctx);
    const out = getOutdoor(w.ctx);
    expect(out.facade.shutter).toBeTruthy();
    out.facade.setShutter(0.5);
    expect(out.facade.openAmount).toBe(0.5);
    out.facade.dropShutter();
    expect(out.facade.shutter).toBeNull();
    expect(out.facade.group.parent).toBe(out.group);
    expect(out.facade.openAmount).toBe(1);
  });

  it('setzt dauerhaften Nebel (Ende vor der Himmelskuppel), Himmel und Boden sind nebelfrei', () => {
    const w = world({ skipIntro: true });
    cityModule.init(w.ctx);
    expect(w.scene.fog).toBeTruthy();
    expect(w.scene.fog.far).toBeLessThan(60);
    const out = getOutdoor(w.ctx);
    const noFog = [];
    out.group.traverse((o) => { if (o.isMesh && o.material && o.material.fog === false) noFog.push(o); });
    expect(noFog.length).toBeGreaterThanOrEqual(2);
  });

  it('fogRange: Innenraum-Diagonale bleibt unberührt, Ende < 60', () => {
    const r = fogRange(presetFor('low'), { w: 24, d: 40 });
    expect(r.near).toBeGreaterThanOrEqual(Math.hypot(24, 40) - 0.5); // Diagonale 46,6 m: Nebel erst dahinter (Deckel far - 8)
    expect(r.far).toBeLessThan(60);
    expect(r.near).toBeLessThan(r.far);
    const small = fogRange(presetFor('high'), { w: 12.5, d: 18 });
    expect(small.near).toBe(38);
  });

  it('statische Außenwelt: wenige Meshes (Draw-Call-Näherung <= 45)', () => {
    const w = world({ skipIntro: true });
    cityModule.init(w.ctx);
    const out = getOutdoor(w.ctx);
    let meshes = 0;
    out.group.traverse((o) => { if (o.isMesh) meshes++; });
    expect(meshes).toBeLessThanOrEqual(45);
    expect(meshes).toBeGreaterThan(10);
  });

  it('Partition: Laden-Hülle und Regale in eigene Gruppen, Sichtbarkeit folgt dem Bereich', () => {
    const w = world({ skipIntro: true });
    const h = cityModule.init(w.ctx);
    const city = w.providers.get('city');
    city.partition();
    const shell = w.scene.getObjectByName('city-shopshell');
    const shelves = w.scene.getObjectByName('city-shelves');
    expect(shell.children.map((c) => c.name).sort()).toEqual(['m3-showcase', 'room']);
    expect(shelves.children.map((c) => c.name)).toEqual(['shelves']);
    expect(w.scene.getObjectByName('lfx-rig').parent).toBe(w.scene);
    expect(w.providers.get('areas').current()).toBe('shop');
    expect(shell.visible && shelves.visible).toBe(true);

    const sp = w.L.city.spawns;
    Object.assign(w.p, { x: sp.yard.x, z: sp.yard.z });
    h.update(0.2);
    expect(w.providers.get('areas').current()).toBe('yard');
    expect(shell.visible).toBe(false);
    expect(shelves.visible).toBe(false);
    expect(city.groups.yard.visible).toBe(true);
    expect(city.groups.palastInterior.visible).toBe(false);

    Object.assign(w.p, { x: sp.palast.x, z: sp.palast.z });
    h.update(0.2);
    expect(w.providers.get('areas').current()).toBe('palastFoyer');
    expect(city.groups.street.visible).toBe(true);
    expect(city.groups.yard.visible).toBe(false);
  });

  it('Bereichswechsel melden an Zuhörer (neu, alt)', () => {
    const w = world({ skipIntro: true });
    const h = cityModule.init(w.ctx);
    const seen = [];
    w.providers.get('areas').on((a, prev) => seen.push([a, prev]));
    Object.assign(w.p, { x: w.L.city.spawns.street.x, z: w.L.city.spawns.street.z });
    h.update(0.2);
    expect(seen).toEqual([['street', 'shop']]);
  });

  it('VR: alles sichtbar', () => {
    const w = world({ skipIntro: true });
    const h = cityModule.init(w.ctx);
    w.providers.get('city').partition();
    Object.assign(w.p, { x: w.L.city.spawns.yard.x, z: w.L.city.spawns.yard.z });
    h.update(0.2);
    expect(w.scene.getObjectByName('city-shopshell').visible).toBe(false);
    w.emit('xr', true);
    expect(w.scene.getObjectByName('city-shopshell').visible).toBe(true);
    expect(w.scene.getObjectByName('city-shelves').visible).toBe(true);
    expect(w.providers.get('city').groups.yard.visible).toBe(true);
    w.emit('xr', false);
    expect(w.scene.getObjectByName('city-shopshell').visible).toBe(false);
  });

  it('dispose setzt den Nebel zurück', () => {
    const w = world({ skipIntro: true });
    const h = cityModule.init(w.ctx);
    h.dispose();
    expect(w.scene.fog).toBeNull();
  });
});

describe('Intro mit dauerhafter Fassade', () => {
  it('Kamera beginnt höchstens bei D + 9,4 (auch im Hochformat), Tür gehört dem Modul door', () => {
    const w = world({});
    w.ctx.camera.aspect = 0.5;
    const override = vi.fn();
    w.providers.set('door', { override });
    cityModule.init(w.ctx);
    introModule.init(w.ctx);
    const z = w.ctx.player.camera.flyTo.mock.calls[0][0].z;
    expect(z).toBeLessThanOrEqual(w.L.d + 9.4 + 1e-9);
    expect(override).toHaveBeenCalledWith(0);
  });

  it('Ende des Intros: Rollladen weg, Fassade und Tür-Automatik bleiben', () => {
    const w = world({});
    const override = vi.fn();
    w.providers.set('door', { override });
    cityModule.init(w.ctx);
    const h = introModule.init(w.ctx);
    const out = getOutdoor(w.ctx);
    const facade = out.facade;
    const disposeSpy = vi.spyOn(facade, 'dispose');
    h.onSuspend(); // beendet das Intro sofort
    expect(facade.shutter).toBeNull();
    expect(disposeSpy).not.toHaveBeenCalled();
    expect(out.facade).toBe(facade);
    expect(facade.group.parent).toBe(out.group);
    expect(override).toHaveBeenLastCalledWith(null);
  });

  it('ohne Intro (skipIntro) liefert das Modul einen leeren Provider', async () => {
    const w = world({ skipIntro: true });
    cityModule.init(w.ctx);
    const h = introModule.init(w.ctx);
    expect(h).toEqual({});
    await expect(w.providers.get('intro').run()).resolves.toBeUndefined();
  });
});

describe('buildFacade', () => {
  it('flackert nur mit Rollladen-unabhängigem Schild; Meshes hängen am Außenbereich', () => {
    const w = world({ skipIntro: true });
    const out = getOutdoor(w.ctx);
    const f = buildFacade(out, { shutter: true });
    f.flicker(0.1);
    f.flicker(5);
    expect(f.signMat.color.r).toBe(1);
    let n = 0;
    f.group.traverse((o) => { if (o instanceof Mesh) n++; });
    expect(n).toBeGreaterThanOrEqual(5);
    f.dispose();
    expect(f.group.parent).toBeNull();
  });
});
