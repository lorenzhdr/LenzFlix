// @vitest-environment jsdom
// Ultra-Licht (1.19.0): Registrierung der Keys, Sichtbarkeit nur auf ultra, ein Mesh je Element, Instanz-Begrenzung, dispose, Nacht > Tag.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Group } from 'three';
import { createUltra } from '../src/js/store3d/engine/ultra.js';
import ultraLight from '../src/js/store3d/modules/ultra-light.js';
import {
  neonStrength, poolStrength, shadowOpacity, neonSources, poolSources, staticShadows, buildNeon, buildPools, buildShadows, SHADOW_DYN_MAX,
} from '../src/js/store3d/world/build-ultra-light.js';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { layoutOf, fakeCanvas } from './helpers-city.js';

const realGetContext = HTMLCanvasElement.prototype.getContext;
beforeEach(() => { HTMLCanvasElement.prototype.getContext = () => fakeCanvas().getContext(); });
afterEach(() => { HTMLCanvasElement.prototype.getContext = realGetContext; });

function make(level = 'ultra', providers = {}) {
  const L = layoutOf(40);
  const state = { level, tod: 'night', raining: false };
  const scene = new Group();
  const street = new Group();
  scene.add(street);
  const base = {
    weather: { get tod() { return state.tod; }, get raining() { return state.raining; } },
    city: { groups: { street }, signals: () => ({ main: 'green', side: 'red' }), visible: () => ({ street: true, shopShell: true }) },
    ...providers,
  };
  const ctx = {
    scene, layout: L, opts: { ultraOk: true }, isPhone: false, camera: { position: { x: L.w / 2, y: 1.6, z: L.d + 3 } },
    quality: () => state.level, use: (n) => base[n],
  };
  const jobs = [];
  const u = createUltra(ctx, { schedule: (fn) => { const j = { fn, cancel() {} }; jobs.push(j); return j; } });
  base.ultra = u.api;
  const flush = () => { while (jobs.length) jobs.shift().fn(1000); };
  return { L, ctx, state, scene, street, u, flush, base };
}

describe('Kurven', () => {
  it('nachts stärker als tags', () => {
    expect(neonStrength('night', false)).toBeGreaterThan(neonStrength('day', false));
    expect(neonStrength('dusk', false)).toBeGreaterThan(neonStrength('day', false));
    expect(poolStrength('night')).toBeGreaterThan(poolStrength('dusk'));
    expect(poolStrength('day')).toBe(0);
    expect(shadowOpacity('day', false)).toBeGreaterThan(shadowOpacity('night', false));
  });
});

describe('Quellen', () => {
  it('Neon: Ladenschild, Palast, Kiosk, Läden; Pools: Laternen, Fenster', () => {
    const { L } = make();
    const ids = neonSources(L).map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining(['shop', 'palast', 'kiosk', 'canopy']));
    const p = poolSources(L);
    expect(p.floor.length).toBeGreaterThan(L.city.lights.length);
    expect(p.wall.length).toBeGreaterThan(0);
    for (const q of [...p.floor, ...p.wall]) expect(Number.isFinite(q.x + q.z)).toBe(true);
  });
  it('statische Schatten gedeckelt und endlich', () => {
    const { L } = make();
    const s = staticShadows(L, [{ x0: 0, z0: 0, x1: 4, z1: 2 }]);
    expect(s.length).toBeGreaterThan(5);
    expect(s.length).toBeLessThanOrEqual(96);
    expect(s.every((q) => q.sx > 0 && q.sz > 0 && Number.isFinite(q.x + q.z))).toBe(true);
  });
});

describe('Modul ultra-light', () => {
  it('ist in der Registry', () => { expect(MODULES).toContain(ultraLight); });
  it('registriert neon, pools, shadows; unsichtbar unter high, sichtbar unter ultra', () => {
    const t = make('high');
    ultraLight.init(t.ctx);
    expect(t.u.api.keys()).toEqual(['neon', 'pools', 'shadows']);
    t.flush();
    const list = t.u.api.list();
    expect(list.every((e) => e.built && !e.visible)).toBe(true);
    t.state.level = 'ultra';
    t.u.onQuality('ultra');
    expect(t.u.api.list().every((e) => e.visible)).toBe(true);
  });
  it('ohne Straßengruppe nur shadows', () => {
    const t = make('ultra');
    t.base.city = undefined;
    ultraLight.init(t.ctx);
    expect(t.u.api.keys()).toEqual(['shadows']);
  });
  it('ohne Provider ultra: kein Fehler', () => {
    const t = make('ultra');
    t.base.ultra = undefined;
    expect(() => ultraLight.init(t.ctx)).not.toThrow();
  });
});

describe('Bauer', () => {
  it('neon: ein Mesh, Stärke nachts > tags, Ampel-Gain, dispose', () => {
    const t = make();
    const n = buildNeon(t.ctx);
    expect(n.object.children.length).toBe(1);
    n.update(0.016, 1);
    const night = n.mesh.material.uniforms.uStrength.value;
    t.state.tod = 'day';
    for (let i = 0; i < 200; i++) n.update(0.1, 1 + i);
    expect(n.mesh.material.uniforms.uStrength.value).toBeLessThan(night);
    const gains = n.mesh.geometry.attributes.aA;
    const vals = new Set();
    for (let i = 0; i < gains.count; i++) vals.add(Math.round(gains.getX(i) * 100));
    expect(vals.has(100) && vals.has(6)).toBe(true);
    const g = vi.spyOn(n.mesh.geometry, 'dispose');
    const m = vi.spyOn(n.mesh.material, 'dispose');
    const tx = vi.spyOn(n.mesh.material.uniforms.map.value, 'dispose');
    n.dispose();
    expect(g).toHaveBeenCalled(); expect(m).toHaveBeenCalled(); expect(tx).toHaveBeenCalled();
  });
  it('pools: ein Mesh, tags unsichtbar, nachts sichtbar, dispose', () => {
    const t = make();
    const p = buildPools(t.ctx);
    expect(p.object.children.length).toBe(1);
    p.update(0.016);
    expect(p.mesh.visible).toBe(true);
    const night = p.mesh.material.opacity;
    t.state.tod = 'day';
    for (let i = 0; i < 100; i++) p.update(0.1);
    expect(p.mesh.visible).toBe(false);
    expect(night).toBeGreaterThan(p.mesh.material.opacity);
    const tx = vi.spyOn(p.mesh.material.map, 'dispose');
    p.dispose();
    expect(tx).toHaveBeenCalled();
  });
  it('shadows: ein InstancedMesh, Instanzen begrenzt, Provider-Quellen, Gruppen-Sichtbarkeit, dispose', () => {
    const people = Array.from({ length: 200 }, (_, i) => ({ x: 3 + (i % 10) * 0.5, z: 3 + Math.floor(i / 10) * 0.2, handle: { root: { position: { y: 0 }, visible: true, parent: null } } }));
    const t = make('ultra', {
      npc: { people: () => people },
      traffic: { parked: () => [], cars: () => [{ lane: 'mainE', x: 5, z: 5, state: 'drive' }, { lane: 'mainE', x: 6, z: 5, state: 'away' }] },
      net: { peerPositions: () => [{ x: 4, y: 0, z: 4 }, { x: Infinity, y: 0, z: 0 }] },
      selfview: { mode: () => 'ego', figure: () => null },
    });
    const s = buildShadows(t.ctx);
    expect(s.object.children.length).toBe(1);
    expect(s.mesh.isInstancedMesh).toBe(true);
    t.ctx.camera.position = { x: 5, y: 1.6, z: 5 };
    s.update(0.016);
    expect(s.mesh.count).toBeLessThanOrEqual(s.staticCount + SHADOW_DYN_MAX);
    expect(s.mesh.count).toBeGreaterThan(s.staticCount);
    const full = s.mesh.count;
    t.base.city.visible = () => ({ street: false, shopShell: false });
    s.update(0.016); s.update(0.016);
    expect(s.mesh.count).toBe(SHADOW_DYN_MAX);
    expect(full).toBe(s.staticCount + SHADOW_DYN_MAX);
    const tx = vi.spyOn(s.mesh.material.map, 'dispose');
    s.dispose();
    expect(tx).toHaveBeenCalled();
  });
});
