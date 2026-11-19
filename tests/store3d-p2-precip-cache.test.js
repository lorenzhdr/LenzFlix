// @vitest-environment jsdom
// W7 p2: precip liest presetFor nicht pro Frame (Dichte nur bei onQuality neu), Zeichenmenge folgt trotzdem der Stufe.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Scene, PerspectiveCamera, Mesh, ShaderMaterial } from 'three';

const counter = vi.hoisted(() => ({ n: 0 }));
vi.mock('../src/js/store3d/engine/quality.js', async (orig) => {
  const m = await orig();
  return { ...m, presetFor: (...a) => { counter.n += 1; return m.presetFor(...a); } };
});

import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import precip from '../src/js/store3d/modules/precip.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import { presetFor } from '../src/js/store3d/engine/quality.js';
import { countFor } from '../src/js/store3d/weather/precip-logic.js';

function mkCanvasCtx() {
  return function getContext() {
    return new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))), set: (t, k, v) => { t[k] = v; return true; } });
  };
}

describe('precip: Preset-Dichte gecacht', () => {
  let host; let dom;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  afterEach(() => { if (host) host.hook('dispose'); host = null; if (dom) dom.remove(); HTMLCanvasElement.prototype.getContext = realGetContext; MODULES.length = 0; delete window.__lfxM4; });

  it('presetFor wird in update nie gerufen; onQuality aktualisiert die Dichte', async () => {
    MODULES.length = 0; MODULES.push(precip);
    HTMLCanvasElement.prototype.getContext = mkCanvasCtx();
    let level = 'low';
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: [] }]);
    dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas); document.body.appendChild(dom);
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    camera.position.set(layout.w / 2, 1.65, layout.d + 3);
    const state = { x: layout.w / 2, z: layout.d + 3, yaw: 0, pitch: 0 };
    const app = {
      layout, deps: {}, opts: { debug: true }, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene, camera, renderer: { domElement: canvas, toneMappingExposure: 1 }, get preset() { return { level }; } },
      player: { x: state.x, z: state.z, y: 0, state, eyeY: () => 1.65 },
      getCarried: () => null, setMode() {}, holdview: { isOpen: false }, findSlot: () => null, take() {}, host: dom,
    };
    host = new ModuleHost(app);
    await host.init();
    host.providers.set('areas', { current: () => 'street' });
    const pr = host.providers.get('precip');
    pr.setWeather({ kind: 'rain', i: 1 });
    let mesh = null;
    scene.traverse((o) => { if (o instanceof Mesh && o.material instanceof ShaderMaterial) mesh = o; });
    for (let i = 0; i < 5; i++) host.hook('update', 0.1, 1 + i * 0.5); // erster Frame bestimmt "near"
    expect(mesh.visible).toBe(true);
    const base = counter.n;
    for (let i = 0; i < 120; i++) host.hook('update', 0.016, 5 + i * 0.016);
    expect(counter.n).toBe(base); // kein presetFor pro Frame
    expect(mesh.geometry.drawRange.count / 6).toBe(countFor(presetFor('low', false).precip, 1));
    level = 'high';
    host.hook('onQuality', 'high');
    host.hook('update', 0.016, 9);
    expect(mesh.geometry.drawRange.count / 6).toBe(countFor(presetFor('high', false).precip, 1));
    expect(mesh.geometry.drawRange.count / 6).toBeGreaterThan(countFor(presetFor('low', false).precip, 1));
  });
});
