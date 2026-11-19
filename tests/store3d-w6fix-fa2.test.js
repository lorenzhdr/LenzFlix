// @vitest-environment jsdom
// 1.19.0 W6-Fix fa2: Ultra-Licht (Schild-Halo, Wandwäsche, Pools auf Schnee, Nebel, reduzierte Bewegung), Kontaktschatten (Peers, Bodenhöhe),
// Niederschlag (Zeitbasis, ruhiger bei reduzierter Bewegung, forceSinglePass), Atemwölkchen nur draußen und bei sichtbarer Elternkette. Kein Netzwerk.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { Scene, PerspectiveCamera, Mesh, ShaderMaterial, Points, Group } from 'three';
import {
  neonSources, poolSources, buildNeon, buildPools, buildShadows, poolSnowFactor, neonFogFactor, airShadowScale,
} from '../src/js/store3d/world/build-ultra-light.js';
import { calmFor } from '../src/js/store3d/weather/precip-logic.js';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import precip from '../src/js/store3d/modules/precip.js';
import daytime from '../src/js/store3d/modules/daytime.js';
import weatherfx from '../src/js/store3d/modules/weatherfx.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import { layoutOf, fakeCanvas } from './helpers-city.js';

const realGetContext = HTMLCanvasElement.prototype.getContext;
const realMM = window.matchMedia;
function mq(reduced) {
  const ls = new Set();
  const o = {
    matches: reduced,
    addEventListener: (_t, fn) => ls.add(fn),
    removeEventListener: (_t, fn) => ls.delete(fn),
    set(v) { o.matches = v; for (const fn of [...ls]) fn({ matches: v }); },
    size: () => ls.size,
  };
  return o;
}
function mkCanvasCtx() {
  return function getContext() {
    return new Proxy({}, {
      get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))),
      set: (t, k, v) => { t[k] = v; return true; },
    });
  };
}
beforeEach(() => { HTMLCanvasElement.prototype.getContext = () => fakeCanvas().getContext(); });
afterEach(() => { HTMLCanvasElement.prototype.getContext = realGetContext; window.matchMedia = realMM; });

describe('reine Kurven', () => {
  it('Pools auf Schnee: 1 ohne Decke, 0,4 bei voller Decke, robust gegen Unsinn', () => {
    expect(poolSnowFactor(0)).toBe(1);
    expect(poolSnowFactor(1)).toBeCloseTo(0.4, 5);
    expect(poolSnowFactor(0.5)).toBeCloseTo(0.7, 5);
    expect(poolSnowFactor(7)).toBeCloseTo(0.4, 5);
    expect(poolSnowFactor(undefined)).toBe(1);
  });
  it('Halo im Nebel gedämpft', () => {
    expect(neonFogFactor(0)).toBe(1);
    expect(neonFogFactor(1)).toBeCloseTo(0.45, 5);
    expect(neonFogFactor(NaN)).toBe(1);
  });
  it('Schatten in der Luft: voll am Boden/Stufe, kleiner beim Sprung, weg ab 1,5 m', () => {
    expect(airShadowScale(0)).toBe(1);
    expect(airShadowScale(0.05)).toBe(1);
    const a = airShadowScale(0.5);
    const b = airShadowScale(1.0);
    expect(a).toBeLessThan(1);
    expect(b).toBeLessThan(a);
    expect(b).toBeGreaterThan(0.4);
    expect(airShadowScale(1.5)).toBe(0);
    expect(airShadowScale(3)).toBe(0);
  });
  it('calmFor: ruhiger bei reduzierter Bewegung, nie abgeschaltet', () => {
    const n = calmFor(false);
    const r = calmFor(true);
    expect(n).toEqual({ fall: 1, wind: 1, len: 1, sway: 1 });
    expect(r.fall).toBeGreaterThan(0);
    expect(r.fall).toBeLessThan(1);
    expect(r.len).toBeLessThan(1);
    expect(r.sway).toBe(0);
  });
});

describe('Wandwäsche und Halo am Schild', () => {
  it('Wandwäsche der Schilder liegt unterhalb der Schild-Unterkante', () => {
    const L = layoutOf(40);
    const p = poolSources(L);
    const signs = neonSources(L).filter((s) => s.id !== 'canopy');
    const withTop = p.wall.filter((q) => Number.isFinite(q.top));
    expect(withTop.length).toBe(signs.length);
    for (const q of withTop) {
      expect(q.y + q.h / 2).toBeLessThanOrEqual(q.top + 1e-9);
      expect(q.h).toBeGreaterThan(0.5);
    }
    for (const s of signs) {
      const q = withTop.find((w) => Math.abs(w.x - (s.x + Math.sin(s.yaw) * 0.05)) < 1e-6 && Math.abs(w.z - (s.z + Math.cos(s.yaw) * 0.05)) < 1e-6);
      expect(q, s.id).toBeTruthy();
      expect(q.y + q.h / 2).toBeLessThanOrEqual(s.y - s.h / 2 + 1e-9);
    }
  });
  it('Neon: Text-Schilder tragen die Schildfläche im Attribut aR, Markise/Ampeln nicht', () => {
    const L = layoutOf(40);
    const ctx = { layout: L, use: () => undefined };
    const neon = buildNeon(ctx);
    const aR = neon.mesh.geometry.attributes.aR;
    expect(aR.count).toBe(neon.mesh.geometry.attributes.position.count);
    const srcs = neonSources(L);
    srcs.forEach((s, i) => {
      const rx = aR.getX(i * 4);
      if (s.id === 'canopy') expect(rx).toBe(0);
      else { expect(rx).toBeGreaterThan(0); expect(rx).toBeLessThan(0.5); expect(aR.getY(i * 4)).toBeGreaterThan(0); }
    });
    for (let v = srcs.length * 4; v < aR.count; v++) expect(aR.getX(v)).toBe(0);
    
    neon.dispose();
  });
  it('Pools: forceSinglePass, weniger Deckkraft bei Schneedecke', () => {
    const L = layoutOf(40);
    const state = { cover: 0 };
    const ctx = { layout: L, use: (n) => (n === 'weather' ? { tod: 'night', raining: false, get cover() { return state.cover; } } : undefined) };
    const pools = buildPools(ctx);
    expect(pools.mesh.material.forceSinglePass).toBe(true);
    pools.update(1);
    const open = pools.mesh.material.opacity;
    state.cover = 1;
    for (let i = 0; i < 40; i++) pools.update(0.1);
    expect(pools.mesh.material.opacity).toBeLessThan(open * 0.5);
    expect(pools.mesh.material.opacity).toBeGreaterThan(open * 0.3);
    pools.dispose();
  });
});

describe('Neon: reduzierte Bewegung und Zeitbasis', () => {
  it('uFlick 0 bei reduzierter Bewegung, live umschaltbar, Aufräumen entfernt den Listener', () => {
    const m = mq(true);
    window.matchMedia = () => m;
    const neon = buildNeon({ layout: layoutOf(40), use: () => undefined });
    expect(neon.mesh.material.uniforms.uFlick.value).toBe(0);
    m.set(false);
    expect(neon.mesh.material.uniforms.uFlick.value).toBe(1);
    m.set(true);
    expect(neon.mesh.material.uniforms.uFlick.value).toBe(0);
    expect(m.size()).toBe(1);
    neon.dispose();
    expect(m.size()).toBe(0);
  });
  it('uTime zählt ab dem ersten Update (nicht Seitenlaufzeit)', () => {
    window.matchMedia = () => mq(false);
    const neon = buildNeon({ layout: layoutOf(40), use: () => undefined });
    neon.update(0.016, 200000);
    expect(neon.mesh.material.uniforms.uTime.value).toBe(0);
    neon.update(0.016, 200012.5);
    expect(neon.mesh.material.uniforms.uTime.value).toBeCloseTo(12.5, 6);
    neon.dispose();
  });
  it('Halo im Nebel schwächer', () => {
    window.matchMedia = () => mq(false);
    const mk = (fog) => {
      const n = buildNeon({ layout: layoutOf(40), use: (k) => (k === 'weather' ? { tod: 'night', raining: false, fog } : undefined) });
      n.update(0.016, 1);
      const v = n.mesh.material.uniforms.uStrength.value;
      n.dispose();
      return v;
    };
    expect(mk(1)).toBeCloseTo(mk(0) * 0.45, 5);
  });
});

describe('Kontaktschatten', () => {
  function shadows(extra = {}) {
    const L = layoutOf(40);
    const base = { weather: { tod: 'day', raining: false }, city: { visible: () => ({ street: true, shopShell: true }) }, ...extra.providers };
    const x = L.w / 2;
    const z = L.d + 4;
    const ctx = { layout: L, camera: { position: { x, y: 1.6, z } }, use: (n) => base[n] };
    const sh = buildShadows(ctx);
    sh.update(0.016);
    const arr = sh.mesh.instanceMatrix.array;
    const list = () => Array.from({ length: sh.mesh.count }, (_, i) => ({ x: arr[i * 16 + 12], y: arr[i * 16 + 13], z: arr[i * 16 + 14], sx: arr[i * 16] }));
    return { sh, x, z, list, base, update: () => { sh.update(0.016); sh.update(0.016); } };
  }
  const near = (l, x, z) => l.filter((q) => Math.hypot(q.x - x, q.z - z) < 0.06);
  it('Mitspieler: genau ein Schatten (Peer in npc.people() wird übersprungen)', () => {
    const t0 = shadows();
    const x = t0.x + 3;
    const z = t0.z + 2;
    const peerP = { kind: 'peer', x, z, handle: { root: { position: { y: 0 }, visible: true, parent: null } } };
    const walkP = { kind: 'walker', x: x + 5, z, handle: { root: { position: { y: 0 }, visible: true, parent: null } } };
    const t = shadows({ providers: { npc: { people: () => [peerP, walkP] }, net: { peerPositions: () => [{ x, y: 0, z }] } } });
    const l = t.list();
    expect(near(l, x, z).length).toBe(1);
    expect(near(l, x + 5, z).length).toBe(1);
  });
  it('Sprung: der Blob bleibt am Boden und schrumpft, hoch oben fehlt er', () => {
    let py = 0;
    const t0 = shadows();
    const x = t0.x + 3;
    const z = t0.z + 2;
    const t = shadows({ providers: { net: { peerPositions: () => [{ x, y: py, z }] } } });
    let q = near(t.list(), x, z)[0];
    expect(q.y).toBeCloseTo(0.03, 5);
    const full = q.sx;
    py = 0.9;
    t.update();
    q = near(t.list(), x, z)[0];
    expect(q.y).toBeCloseTo(0.03, 5);
    expect(q.sx).toBeLessThan(full);
    py = 1.8;
    t.update();
    expect(near(t.list(), x, z).length).toBe(0);
  });
  it('Passant auf einer Standfläche: Blob auf der Fläche, nicht am Boden', () => {
    const L = layoutOf(40);
    const surf = L.colliders.find((c) => Number.isFinite(c.y1) && c.top !== false && c.y1 > 0.3 && c.y1 < 1.5);
    if (!surf) return; // Layout ohne niedrige Standfläche: nichts zu prüfen
    const x = (surf.x0 + surf.x1) / 2;
    const z = (surf.z0 + surf.z1) / 2;
    const base = { weather: { tod: 'day', raining: false }, city: { visible: () => ({ street: true, shopShell: true }) }, net: { peerPositions: () => [{ x, y: surf.y1, z }] } };
    const sh = buildShadows({ layout: L, camera: { position: { x, y: 1.6, z } }, use: (n) => base[n] });
    sh.update(0.016);
    const arr = sh.mesh.instanceMatrix.array;
    let found = null;
    for (let i = 0; i < sh.mesh.count; i++) if (Math.hypot(arr[i * 16 + 12] - x, arr[i * 16 + 14] - z) < 0.06 && arr[i * 16] > 0) found = arr[i * 16 + 13];
    expect(found).not.toBeNull();
    expect(found).toBeGreaterThan(surf.y1 - 0.2);
  });
});

function layoutOne() { return buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: [] }]); }

async function hostWith(modules, { reduced = false, level = 'high', weather } = {}) {
  window.matchMedia = () => mq(reduced);
  HTMLCanvasElement.prototype.getContext = mkCanvasCtx();
  MODULES.length = 0;
  MODULES.push(...modules);
  const layout = layoutOne();
  const dom = document.createElement('div');
  const canvas = document.createElement('canvas');
  dom.appendChild(canvas);
  document.body.appendChild(dom);
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  camera.position.set(layout.w / 2, 1.65, layout.d + 3);
  const state = { x: layout.w / 2, z: layout.d + 3, yaw: 0, pitch: 0 };
  const app = {
    layout, deps: weather ? { weather } : {}, opts: { debug: true }, phone: false, touch: false, sound: false, mode: 'play',
    engine: { scene, camera, renderer: { domElement: canvas, toneMappingExposure: 1 }, get preset() { return { level }; } },
    player: { x: state.x, z: state.z, y: 0, state, eyeY: () => 1.65 },
    getCarried: () => null, setMode() {}, holdview: { isOpen: false }, findSlot: () => null, take() {}, host: dom,
  };
  const host = new ModuleHost(app);
  await host.init();
  await new Promise((r) => setTimeout(r, 0));
  return { host, scene, camera, layout, dom };
}
function cleanup(h) { h.host.hook('dispose'); h.dom.remove(); MODULES.length = 0; delete window.__lfxM4; }

describe('Niederschlag', () => {
  it('uTime ab Modulstart', async () => {
    const h = await hostWith([precip]);
    const pr = h.host.providers.get('precip');
    let m = null;
    h.scene.traverse((o) => { if (o instanceof Mesh && o.material instanceof ShaderMaterial) m = o; });
    
    pr.setWeather({ kind: 'rain', i: 1 });
    h.host.providers.set('areas', { current: () => 'street' });
    h.host.hook('update', 0.016, 300000);
    expect(m.material.uniforms.uTime.value).toBe(0);
    h.host.hook('update', 0.016, 300007.25);
    expect(m.material.uniforms.uTime.value).toBeCloseTo(7.25, 6);
    cleanup(h);
  });
  it('reduzierte Bewegung: langsamer, kürzere Streifen, kein Pendeln (Schnee); nicht abgeschaltet, live umschaltbar', async () => {
    const run = async (reduced) => {
      const h = await hostWith([precip], { reduced });
      const pr = h.host.providers.get('precip');
      h.host.providers.set('areas', { current: () => 'street' });
      let m = null;
      h.scene.traverse((o) => { if (o instanceof Mesh && o.material instanceof ShaderMaterial) m = o; });
      pr.setWeather({ kind: 'rain', i: 1 });
      h.host.hook('update', 0.016, 1);
      const U = m.material.uniforms;
      const rain = { fall: U.uFall.value.y, len: U.uLen.value, visible: m.visible };
      pr.setWeather({ kind: 'snow', i: 1 });
      for (let k = 0; k < 120; k++) h.host.hook('update', 0.25, 2 + k * 0.25);
      const snow = { sway: U.uSway.value, visible: m.visible };
      cleanup(h);
      return { rain, snow };
    };
    const n = await run(false);
    const r = await run(true);
    expect(r.rain.visible).toBe(true);
    expect(r.snow.visible).toBe(true);
    expect(r.rain.fall).toBeLessThan(n.rain.fall);
    expect(r.rain.len).toBeLessThan(n.rain.len);
    expect(n.snow.sway).toBe(1);
    expect(r.snow.sway).toBe(0);
  });
});

describe('Atemwölkchen nur draußen und bei sichtbarer Elternkette', () => {
  const real = (o) => ({ k: 'clear', i: 0, sd: 0, fog: 0, t: -3, day: 1, ts: 1, stale: 0, ...o });
  const fig = (x, z, parent = null) => ({ disposed: false, root: { visible: true, parent, position: { y: 0 }, rotation: { y: 0 } }, faceWorld(o) { return o.set(x, 1.6, z); } });
  async function active(people, area = 'street') {
    const h = await hostWith([precip, daytime, weatherfx], { weather: () => Promise.resolve(real({})) });
    h.host.providers.set('areas', { current: () => area });
    h.host.providers.set('npc', { people: () => people });
    h.camera.position.set(h.layout.w / 2, 1.65, h.layout.d + 3);
    for (let i = 0; i < 12; i++) h.host.hook('update', 0.1, i * 0.1);
    let pts = null;
    h.scene.traverse((o) => { if (o instanceof Points && o.geometry.attributes.aPh) pts = o; });
    const act = Array.from(pts.geometry.attributes.aPh.array).filter((p) => p >= 0).length;
    cleanup(h);
    return act;
  }
  it('draußen atmen sie, im Laden nicht, mit unsichtbarer Eltern-Gruppe nicht', async () => {
    const L = layoutOne();
    const outX = L.w / 2;
    const outZ = L.d + 5;
    const out = { kind: 'walker', handle: fig(outX, outZ), x: outX, z: outZ };
    expect(await active([out])).toBe(1);
    const inside = { kind: 'walker', handle: fig(L.w / 2, L.d - 2), x: L.w / 2, z: L.d - 2 };
    expect(await active([inside])).toBe(0);
    const parent = new Group();
    parent.visible = false;
    const hidden = { kind: 'walker', handle: fig(outX, outZ, parent), x: outX, z: outZ };
    expect(await active([hidden])).toBe(0);
  });
});
