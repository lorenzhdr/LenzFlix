import { describe, it, expect, vi, afterEach } from 'vitest';
import { PerspectiveCamera } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { buildLayout, rebuildNav } from '../src/js/store3d/world/layout.js';
import { pickBoxes } from '../src/js/store3d/controls/pick.js';
import { isFree, findPath } from '../src/js/store3d/nav/path.js';

const depts = [
  { id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['a', 'b'] },
  { id: 'genre-x', label: 'X', kind: 'genre', color: '#0f0', itemIds: Array.from({ length: 80 }, (_, i) => `g${i}`) },
];

function fakeApp() {
  const layout = buildLayout(depts);
  return {
    layout, deps: { catalog: {} }, opts: {}, phone: false, touch: false, sound: false,
    engine: { scene: {}, camera: new PerspectiveCamera(), renderer: {}, preset: { level: 'mid' } },
    player: { x: layout.spawn.x, z: layout.spawn.z, yaw: 0, pitch: 0, state: {}, cancelPath() {}, turnTo: null, moved: 0 },
  };
}

afterEach(() => { MODULES.length = 0; });

describe('store3d modules', () => {
  it('Registry ist ein Array', () => {
    expect(Array.isArray(MODULES)).toBe(true);
  });

  it('rebuildNav berücksichtigt neue Kollider', () => {
    const lay = buildLayout(depts);
    const p = { x: lay.spawn.x, z: lay.spawn.z - 3 };
    expect(isFree(lay.nav, p.x, p.z)).toBe(true);
    lay.colliders.push({ x0: p.x - 1, z0: p.z - 1, x1: p.x + 1, z1: p.z + 1, kind: 'prop' });
    rebuildNav(lay);
    expect(isFree(lay.nav, p.x, p.z)).toBe(false);
  });

  it('Zonen haben Rechtecke ohne Regal-Überlappung', () => {
    const lay = buildLayout(depts);
    const shelves = lay.colliders.filter((c) => c.kind === 'shelf');
    for (const id of ['register', 'cashier', 'reserve', 'returns', 'snack', 'tv', 'staff', 'window', 'window2', 'entrance']) {
      const r = lay.zones[id].rect;
      expect(r, id).toBeTruthy();
      for (const s of shelves) expect(r.x0 < s.x1 && r.x1 > s.x0 && r.z0 < s.z1 && r.z1 > s.z0, `${id}`).toBe(false);
    }
    const reg = lay.zones.register.rect;
    expect((reg.x1 - reg.x0) * (reg.z1 - reg.z0)).toBeGreaterThan(5);
  });

  it('pickBoxes trifft die nächste aktive Box', () => {
    const near = { box: { min: { x: -1, y: 0, z: -3 }, max: { x: 1, y: 2, z: -2 } } };
    const far = { box: { min: { x: -1, y: 0, z: -6 }, max: { x: 1, y: 2, z: -5 } } };
    const off = { box: near.box, enabled: () => false };
    const hit = pickBoxes([far, near], { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 9);
    expect(hit.ia).toBe(near);
    expect(pickBoxes([off], { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 9)).toBeNull();
    expect(pickBoxes([near], { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, 1)).toBeNull();
  });

  it('ModuleHost: Init-Reihenfolge, Fehler töten nichts, Hooks, Events, Provider, Collider', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const order = [];
    const update = vi.fn();
    const dispose = vi.fn();
    let ctx;
    MODULES.push(
      { name: 'kaputt', init() { throw new Error('boom'); } },
      { name: 'gut', async init(c) { ctx = c; order.push('gut'); return { update, dispose }; } },
      { name: 'zweit', init() { order.push('zweit'); } },
    );
    const app = fakeApp();
    const host = new ModuleHost(app);
    const prog = vi.fn();
    await host.init(prog);
    expect(order).toEqual(['gut', 'zweit']);
    expect(warn).toHaveBeenCalled();
    expect(prog).toHaveBeenLastCalledWith(1);

    host.hook('update', 0.1, 1);
    expect(update).toHaveBeenCalledWith(0.1, 1);

    const fn = vi.fn();
    const off = ctx.on('zone', fn);
    host.emit('zone', 'tv');
    off();
    host.emit('zone', 'snack');
    expect(fn).toHaveBeenCalledTimes(1);

    const impl = { open() {} };
    const rm = ctx.provide('terminal', impl);
    expect(ctx.use('terminal')).toBe(impl);
    rm();
    expect(ctx.use('terminal')).toBeUndefined();

    const sp = app.layout.spawn;
    const rect = { x0: sp.x - 0.5, z0: sp.z - 3, x1: sp.x + 0.5, z1: sp.z - 2 };
    ctx.addCollider(rect);
    host.flushNav();
    expect(isFree(app.layout.nav, sp.x, sp.z - 2.5)).toBe(false);
    ctx.removeCollider(rect);
    host.flushNav();
    expect(isFree(app.layout.nav, sp.x, sp.z - 2.5)).toBe(true);
    expect(findPath(app.layout.nav, sp, app.layout.register)).not.toBeNull();

    const rmIa = ctx.addInteractable({ box: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } }, label: 'x', onUse() {} });
    expect(host.interactables.length).toBe(1);
    rmIa();
    expect(host.interactables.length).toBe(0);

    const tracked = { dispose: vi.fn() };
    ctx.track(tracked);
    host.dispose();
    expect(dispose).toHaveBeenCalled();
    expect(tracked.dispose).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('Kamera-Flug löst auf und release() gibt frei', async () => {
    const app = fakeApp();
    const host = new ModuleHost(app);
    const p = host.ctx.player.camera.flyTo({ x: 1, y: 2, z: 3 }, { x: 0, y: 1, z: 0 }, 100);
    expect(host.locked).toBe(true);
    for (let i = 0; i < 20; i++) host.cameraStep(0.02);
    expect(await p).toBe(true);
    expect(app.engine.camera.position.x).toBeCloseTo(1, 5);
    host.ctx.player.camera.release();
    expect(host.locked).toBe(false);
    host.dispose();
  });
});
