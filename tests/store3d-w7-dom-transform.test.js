// @vitest-environment jsdom
// 1.19.0 W7: DOM-Transform der Sprechblase wird nur bei Änderung > 0,5 px geschrieben.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { Scene, PerspectiveCamera } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import cashier from '../src/js/store3d/modules/cashier.js';
import terminal from '../src/js/store3d/modules/terminal.js';

function mkCanvasCtx() {
  return function getContext() {
    return new Proxy({}, {
      get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))),
      set: (t, k, v) => { t[k] = v; return true; },
    });
  };
}

describe('Kassen-Sprechblase: Transform nur bei Änderung', () => {
  let host;
  let dom;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  beforeEach(() => { MODULES.length = 0; MODULES.push(cashier, terminal); HTMLCanvasElement.prototype.getContext = mkCanvasCtx(); });
  afterEach(() => {
    if (host) host.hook('dispose');
    host = null;
    if (dom) dom.remove();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    MODULES.length = 0;
    delete window.__lfxM4;
  });

  async function build() {
    const items = new Map([['c1', { Id: 'c1', Name: 'Titel', Genres: ['Comedy'], Type: 'Movie', lfx: { media: 'vhs' } }]]);
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['c1'] }]);
    dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    const state = { x: layout.w - 5, z: layout.d - 5, yaw: 0, pitch: 0 };
    const app = {
      layout,
      deps: { catalog: { items, departments: [], highlights: [], resume: [] }, toast: vi.fn(), user: { name: 'Max' }, search: vi.fn(() => Promise.resolve([{ Id: 'c1', Name: 'Titel', Type: 'Movie' }])), play: vi.fn() },
      opts: { debug: true }, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene: new Scene(), camera: new PerspectiveCamera(), renderer: { domElement: canvas }, preset: { level: 'mid' } },
      player: { ...state, state, cancelPath() {}, teleport: vi.fn(), turnTo: null, moved: 0 },
      setMode(m) { app.mode = m; }, holdview: { isOpen: false }, findSlot: () => null, take: vi.fn(), host: dom,
    };
    document.body.appendChild(dom);
    host = new ModuleHost(app);
    await host.init();
    return app;
  }

  it('schreibt style.transform nicht je Frame, wenn die Position gleich bleibt', async () => {
    const app = await build();
    const cam = app.engine.camera;
    cam.position.set(app.layout.w - 2.9, 1.6, app.layout.d - 6);
    cam.lookAt(app.layout.w - 2.9, 1.6, app.layout.d - 2.35);
    cam.updateMatrixWorld(true);
    const bubble = dom.querySelector('.lfx-store-bubble');
    let writes = 0;
    let val = '';
    Object.defineProperty(bubble.style, 'transform', { get: () => val, set: (v) => { writes++; val = v; }, configurable: true });
    host.emit('enter');
    host.hook('update', 1.2, 1.5);
    expect(bubble.hidden).toBe(false);
    const first = writes;
    expect(first).toBeGreaterThan(0);
    for (let i = 0; i < 20; i++) host.hook('update', 0.016, 1.52 + i * 0.016);
    expect(writes).toBe(first);
    // Kamera deutlich verschoben: neuer Wert
    cam.position.x -= 1.5;
    cam.updateMatrixWorld(true);
    host.hook('update', 0.016, 2);
    expect(writes).toBeGreaterThan(first);
  });
});
