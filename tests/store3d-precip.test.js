// @vitest-environment jsdom
// VIDEOTHEK LENZ · Niederschlag (1.19.0): reine Logik (weather/precip-logic.js) und Modul precip.js (1 Mesh, ShaderMaterial, keine Kopie-Arrays).
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { Scene, PerspectiveCamera, Mesh, ShaderMaterial } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import precip from '../src/js/store3d/modules/precip.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import { presetFor } from '../src/js/store3d/engine/quality.js';
import {
  HALF, Y_BELOW, Y_ABOVE, MAX_BOXES, normalizeWeather, countFor, stepBlend, yRange, inBoxes, shelterBoxes, packBoxes,
} from '../src/js/store3d/weather/precip-logic.js';

describe('precip-logic', () => {
  it('Dichte: low > 0 und je Stufe monoton (Desktop und Handy)', () => {
    for (const phone of [false, true]) {
      const n = ['low', 'mid', 'high'].map((l) => presetFor(l, phone).precip);
      expect(n[0]).toBeGreaterThan(0);
      expect(n[0]).toBeLessThan(n[1]);
      expect(n[1]).toBeLessThan(n[2]);
    }
  });

  it('countFor: 0 ohne Niederschlag, steigt mit i, nie über dem Maximum, bei i > 0 mindestens 1', () => {
    expect(countFor(900, 0)).toBe(0);
    expect(countFor(0, 1)).toBe(0);
    expect(countFor(900, 1)).toBe(900);
    expect(countFor(900, 5)).toBe(900);
    expect(countFor(900, 0.3)).toBeLessThan(countFor(900, 0.6));
    expect(countFor(900, 0.6)).toBeLessThan(countFor(900, 1));
    expect(countFor(900, 0.001)).toBeGreaterThanOrEqual(1);
  });

  it('normalizeWeather: gültige Art, i geklemmt, Rest = nichts', () => {
    expect(normalizeWeather({ kind: 'rain', i: 0.6 })).toEqual({ kind: 'rain', i: 0.6 });
    expect(normalizeWeather({ kind: 'snow', i: 3 })).toEqual({ kind: 'snow', i: 1 });
    expect(normalizeWeather({ kind: 'hagel', i: 1 })).toEqual({ kind: null, i: 0 });
    expect(normalizeWeather({ kind: 'rain', i: 0 })).toEqual({ kind: null, i: 0 });
    expect(normalizeWeather(null)).toEqual({ kind: null, i: 0 });
  });

  it('stepBlend: gleiche Art blendet in ~15 s, Artwechsel erst aus, dann ein', () => {
    const st = { kind: 'rain', a: 0 };
    const want = { kind: 'rain', i: 1 };
    for (let t = 0; t < 7.5; t += 0.5) stepBlend(st, want, 0.5);
    expect(st.a).toBeGreaterThan(0.4);
    expect(st.a).toBeLessThan(0.6);
    for (let t = 0; t < 8; t += 0.5) stepBlend(st, want, 0.5);
    expect(st.a).toBe(1);
    const snow = { kind: 'snow', i: 0.5 };
    stepBlend(st, snow, 1);
    expect(st.kind).toBe('rain'); // erst abblenden
    for (let k = 0; k < 40; k++) stepBlend(st, snow, 1);
    expect(st.kind).toBe('snow');
    expect(st.a).toBe(0.5);
    const none = { kind: null, i: 0 };
    for (let k = 0; k < 40; k++) stepBlend(st, none, 1);
    expect(st.a).toBe(0);
  });

  it('yRange folgt der Kamerahöhe (auch auf dem Dach)', () => {
    const g = yRange(1.65);
    expect(g.lo).toBeCloseTo(1.65 - Y_BELOW);
    expect(g.hi).toBeCloseTo(1.65 + Y_ABOVE);
    const r = yRange(8);
    expect(r.lo).toBeCloseTo(8 - Y_BELOW);
    expect(r.span).toBe(Y_BELOW + Y_ABOVE);
    expect(HALF).toBe(12);
  });

  it('Schutzboxen: Laden, Palast, Salon, Vordach, Kiosk; höchstens MAX_BOXES; Dach darüber bleibt ungeschützt', () => {
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: [] }]);
    const boxes = shelterBoxes(layout);
    expect(boxes.length).toBeGreaterThanOrEqual(5);
    expect(boxes.length).toBeLessThanOrEqual(MAX_BOXES);
    expect(inBoxes(boxes, layout.w / 2, 1.5, layout.d / 2)).toBe(true); // im Laden
    expect(inBoxes(boxes, layout.w / 2, 3.5, layout.d / 2)).toBe(false); // auf dem Dach
    expect(inBoxes(boxes, layout.w / 2, 1.5, layout.d + 4)).toBe(false); // Straße
    const c = layout.city.palast.canopy;
    expect(inBoxes(boxes, (c.x0 + c.x1) / 2, 2, (c.z0 + c.z1) / 2)).toBe(true); // unter dem Vordach
    expect(inBoxes(boxes, (c.x0 + c.x1) / 2, c.y + 0.5, (c.z0 + c.z1) / 2)).toBe(false);
    const k = layout.city.kiosk.hut;
    expect(inBoxes(boxes, (k.x0 + k.x1) / 2, 1, (k.z0 + k.z1) / 2)).toBe(true);
    const sa = layout.city.zones.salon.rect;
    expect(inBoxes(boxes, (sa.x0 + sa.x1) / 2, 1, (sa.z0 + sa.z1) / 2)).toBe(true);
    const p = packBoxes(boxes);
    expect(p.xz.length).toBe(MAX_BOXES * 4);
    expect(p.y.length).toBe(MAX_BOXES);
    expect(shelterBoxes(null)).toEqual([]);
  });
});

function mkCanvasCtx() {
  return function getContext() {
    return new Proxy({}, {
      get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))),
      set: (t, k, v) => { t[k] = v; return true; },
    });
  };
}

describe('Modul precip', () => {
  let host;
  let dom;
  let level = 'mid';
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  beforeEach(() => { MODULES.length = 0; MODULES.push(precip); HTMLCanvasElement.prototype.getContext = mkCanvasCtx(); level = 'mid'; });
  afterEach(() => {
    if (host) host.hook('dispose');
    host = null;
    if (dom) dom.remove();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    MODULES.length = 0;
    delete window.__lfxM4;
  });

  async function build({ phone = false } = {}) {
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: [] }]);
    dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    document.body.appendChild(dom);
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    camera.position.set(layout.w / 2, 1.65, layout.d + 3);
    const state = { x: layout.w / 2, z: layout.d + 3, yaw: 0, pitch: 0 };
    const app = {
      layout, deps: {}, opts: { debug: true }, phone, touch: false, sound: false, mode: 'play',
      engine: { scene, camera, renderer: { domElement: canvas, toneMappingExposure: 1 }, get preset() { return { level }; } },
      player: { x: state.x, z: state.z, y: 0, state, eyeY: () => 1.65 },
      getCarried: () => null, setMode() {}, holdview: { isOpen: false }, findSlot: () => null, take() {}, host: dom,
    };
    host = new ModuleHost(app);
    await host.init();
    const meshes = [];
    scene.traverse((o) => { if (o instanceof Mesh && o.material instanceof ShaderMaterial) meshes.push(o); });
    return { scene, camera, meshes, pr: host.providers.get('precip'), layout };
  }

  it('genau ein Mesh mit ShaderMaterial (1 Draw-Call), Provider precip vorhanden, ohne Wetter unsichtbar', async () => {
    const { meshes, pr } = await build();
    expect(meshes.length).toBe(1);
    expect(typeof pr.setWeather).toBe('function');
    expect(meshes[0].visible).toBe(false);
  });

  it('Uniforms vorhanden, Schutzboxen gepackt, Geometrie mit eigenen Seed-Daten', async () => {
    const { meshes } = await build();
    const m = meshes[0];
    for (const k of ['uTime', 'uCam', 'uHalf', 'uWind', 'uLen', 'uWidth', 'uKind', 'uAlpha', 'uBoxA', 'uBoxY']) expect(m.material.uniforms[k], k).toBeTruthy();
    expect(m.material.uniforms.uBoxA.value.length).toBe(MAX_BOXES);
    expect(m.material.uniforms.uBoxY.value.length).toBe(MAX_BOXES);
    expect(m.material.uniforms.uBoxA.value[0].z).toBeGreaterThan(0); // Laden
    const seed = m.geometry.attributes.aSeed;
    const maxN = Math.max(...['low', 'mid', 'high'].map((l) => presetFor(l, false).precip));
    expect(seed.count).toBe(maxN * 4);
    expect(m.geometry.index.count).toBe(maxN * 6);
    expect(m.material.transparent).toBe(true);
    expect(m.material.depthWrite).toBe(false);
    let nz = 0;
    for (let i = 0; i < 400; i++) if (seed.array[i * 4] > 0) nz++;
    expect(nz).toBeGreaterThan(300); // Zufallswerte verteilt, nicht alle 0
  });

  it('Regen: erster Wert gilt sofort, Zahl nach Preset, auch auf low; ohne Wetter blendet es aus', async () => {
    const { meshes, pr } = await build();
    const m = meshes[0];
    level = 'low';
    host.hook('onQuality', 'low');
    pr.setWeather({ kind: 'rain', i: 1 });
    host.hook('update', 0.016, 1);
    expect(m.visible).toBe(true);
    expect(m.geometry.drawRange.count / 6).toBe(presetFor('low', false).precip);
    pr.setWeather({ kind: null, i: 0 });
    for (let k = 0; k < 80; k++) host.hook('update', 0.25, 2 + k * 0.25); // 20 s (dt je Bild auf 0,25 s geklemmt)
    expect(m.visible).toBe(false);
  });

  it('Kamera folgt: uCam stammt aus der Kamera; Schnee setzt uKind = 1', async () => {
    const { meshes, pr, camera } = await build();
    const m = meshes[0];
    pr.setWeather({ kind: 'snow', i: 0.5 });
    camera.position.set(3, 9, 40);
    camera.updateMatrixWorld(true);
    host.hook('update', 0.016, 1);
    expect(m.material.uniforms.uCam.value.y).toBeCloseTo(9);
    expect(m.material.uniforms.uKind.value).toBe(1);
    expect(m.visible).toBe(true);
  });

  it('Suspend blendet aus, Resume zeigt wieder', async () => {
    const { meshes, pr } = await build();
    pr.setWeather({ kind: 'rain', i: 0.6 });
    host.hook('update', 0.016, 1);
    expect(meshes[0].visible).toBe(true);
    host.hook('onSuspend');
    expect(meshes[0].visible).toBe(false);
    host.hook('onResume');
    host.hook('update', 0.016, 2);
    expect(meshes[0].visible).toBe(true);
  });

  it('Handy <= Desktop in der Menge', async () => {
    const d = await build();
    const dn = d.meshes[0].geometry.index.count;
    host.hook('dispose'); host = null; dom.remove();
    const p = await build({ phone: true });
    expect(p.meshes[0].geometry.index.count).toBeLessThanOrEqual(dn);
  });
});

describe('daytime + precip: weather.onChange und Provider-Kopplung', () => {
  let host;
  let dom;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  afterEach(() => {
    if (host) host.hook('dispose');
    host = null;
    if (dom) dom.remove();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    MODULES.length = 0;
    delete window.__lfxM4;
  });

  it('setRaining meldet per onChange, speist precip, Abmeldung wirkt', async () => {
    const daytime = (await import('../src/js/store3d/modules/daytime.js')).default;
    MODULES.length = 0;
    MODULES.push(precip, daytime);
    HTMLCanvasElement.prototype.getContext = mkCanvasCtx();
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: [] }]);
    dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    document.body.appendChild(dom);
    const camera = new PerspectiveCamera();
    camera.position.set(layout.w / 2, 1.65, layout.d + 3);
    const state = { x: layout.w / 2, z: layout.d + 3, yaw: 0, pitch: 0 };
    const app = {
      layout, deps: {}, opts: { debug: true }, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene: new Scene(), camera, renderer: { domElement: canvas, toneMappingExposure: 1 }, preset: { level: 'mid' } },
      player: { x: state.x, z: state.z, y: 0, state, eyeY: () => 1.65 },
      getCarried: () => null, setMode() {}, holdview: { isOpen: false }, findSlot: () => null, take() {}, host: dom,
    };
    host = new ModuleHost(app);
    await host.init();
    const w = host.providers.get('weather');
    const pr = host.providers.get('precip');
    const calls = [];
    const off = w.onChange((x) => calls.push(x.raining));
    const base = w.raining; // lokaler Zufall: beide Richtungen prüfen
    const rainWant = { kind: 'rain', i: 0.6 };
    const noneWant = { kind: null, i: 0 };
    w.setRaining(!base);
    expect(calls).toEqual([!base]);
    expect(pr.current().want).toEqual(!base ? rainWant : noneWant);
    w.setRaining(base);
    expect(calls).toEqual([!base, base]);
    expect(pr.current().want).toEqual(base ? rainWant : noneWant);
    off();
    w.setRaining(!base);
    expect(calls.length).toBe(2);
    expect(w.precip).toEqual(!base ? rainWant : noneWant);
  });
});
