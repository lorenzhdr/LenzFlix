// @vitest-environment jsdom
// VIDEOTHEK LENZ · Popcorn-Partikel (1.19.0): three kopiert das Array von Float32BufferAttribute, update() schrieb ins Original,
// die Partikel blieben am Weltursprung. Jetzt behält das Attribut das eigene Array.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { Scene, PerspectiveCamera, Points } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import snack from '../src/js/store3d/modules/snack.js';

function mkCanvasCtx() {
  return function getContext() {
    return new Proxy({}, {
      get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))),
      set: (t, k, v) => { t[k] = v; return true; },
    });
  };
}

describe('snack: Popcorn-Partikel', () => {
  let host;
  let dom;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  beforeEach(() => { MODULES.length = 0; MODULES.push(snack); HTMLCanvasElement.prototype.getContext = mkCanvasCtx(); });
  afterEach(() => {
    if (host) host.hook('dispose');
    host = null;
    if (dom) dom.remove();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    MODULES.length = 0;
    delete window.__lfxM4;
  });

  async function build() {
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: [] }]);
    dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    document.body.appendChild(dom);
    const scene = new Scene();
    const state = { x: 1.5, z: layout.d - 2.05, yaw: 0, pitch: 0 };
    const app = {
      layout, deps: { toast() {} }, opts: {}, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene, camera: new PerspectiveCamera(), renderer: { domElement: canvas, toneMappingExposure: 1 }, preset: { level: 'mid' } },
      player: { x: state.x, z: state.z, y: 0, state, eyeY: () => 1.65 },
      getCarried: () => null, setMode() {}, holdview: { isOpen: false }, findSlot: () => null, take() {}, host: dom,
    };
    host = new ModuleHost(app);
    await host.init();
    let pts = null;
    scene.traverse((o) => { if (o instanceof Points && o.geometry.attributes.position.count <= 16) pts = o; });
    return { pts, layout };
  }

  it('das Attribut hält das beschriebene Array: Partikel liegen nahe der Maschine, nicht am Ursprung', async () => {
    const { pts, layout } = await build();
    expect(pts).toBeTruthy();
    const a = pts.geometry.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
      expect(a[i + 1], 'y').toBeGreaterThan(1.0);
      expect(a[i], 'x').toBeGreaterThan(0.1);
      expect(a[i], 'x').toBeLessThan(0.5);
      expect(Math.abs(a[i + 2] - (layout.d - 2.05)), 'z').toBeLessThan(0.2);
    }
  });

  it('update schreibt in dasselbe Attribut-Array (ändert sich über die Zeit)', async () => {
    const { pts } = await build();
    const a = pts.geometry.attributes.position.array;
    const before = Array.from(a);
    host.hook('update', 0.016, 1.0); // Prüfung der Nähe
    host.hook('update', 0.016, 2.3);
    expect(pts.geometry.attributes.position.array).toBe(a);
    expect(Array.from(a)).not.toEqual(before);
  });
});
