// @vitest-environment jsdom
// QA-Fixes brawl: Hausverbot erst bei freiem Türspalt, Wurftreffer auf Richards echte Position, Kassettentreffer am stehenden Spieler,
// Schildtexte passen in die Canvas.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { Scene, PerspectiveCamera, BoxGeometry, MeshBasicMaterial } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import cashier from '../src/js/store3d/modules/cashier.js';
import brawl from '../src/js/store3d/modules/brawl.js';
import throwMod from '../src/js/store3d/modules/throw.js';

let measured = [];
function mkCanvasCtx() {
  return function getContext() {
    return new Proxy({}, {
      get: (t, k) => {
        if (k === 'measureText') return (s) => { const m = { width: s.length * (parseInt(String(t.font).match(/(\d+)px/)?.[1] || 10, 10)) * 0.8 }; measured.push([t.font, s, m.width]); return m; };
        return k in t ? t[k] : () => ({ addColorStop() {} });
      },
      set: (t, k, v) => { t[k] = v; return true; },
    });
  };
}

describe('brawl QA-Fixes', () => {
  let host; let dom;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  beforeEach(() => {
    MODULES.length = 0; MODULES.push(cashier, brawl);
    HTMLCanvasElement.prototype.getContext = mkCanvasCtx();
    measured = [];
    try { sessionStorage.clear(); } catch { /* egal */ }
  });
  afterEach(() => {
    if (host) host.hook('dispose');
    host = null; if (dom) dom.remove();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    MODULES.length = 0;
    delete window.__lfxBrawl;
  });

  async function build() {
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: [] }]);
    dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    const state = { x: layout.w - 2.9, z: layout.d - 4.1, yaw: 0, pitch: 0 };
    const knock = vi.fn();
    const door = { lock: vi.fn(), unlock: vi.fn(), isLocked: () => false, onChange() {}, registerActor() {}, override() {}, open() {}, amount: () => 0 };
    const app = {
      layout,
      deps: { catalog: { items: new Map(), departments: [], highlights: [], resume: [] }, toast: vi.fn(), user: { name: 'Max' } },
      opts: { debug: true }, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene: new Scene(), camera: new PerspectiveCamera(), renderer: { domElement: canvas }, preset: { level: 'mid' } },
      player: { ...state, state, y: 0, cancelPath() {}, teleport: vi.fn(), knock, eyeY: () => 1.65, turnTo: null, moved: 0 },
      getCarried: () => null, setMode(m) { app.mode = m; }, holdview: { isOpen: false }, findSlot: () => null, take: vi.fn(), host: dom,
    };
    document.body.appendChild(dom);
    host = new ModuleHost(app);
    host.providers.set('door', door);
    const found = vi.fn();
    host.providers.set('discover', { found });
    await host.init();
    return { state, knock, door, layout, found };
  }

  it('Q2#1: Spieler im Türspalt: Tür sperrt erst, wenn er frei draußen steht; kein Sicherheitsnetz-Grudge', async () => {
    const { state, door, layout, found } = await build();
    const bw = host.providers.get('brawl');
    let t = 1; host.hook('update', 0.016, t);
    window.__lfxBrawl.force('chase');
    state.x = layout.w / 2; state.z = layout.d + 0.1; // im Spalt, außerhalb des Ladens
    t += 0.5; host.hook('update', 0.1, t);
    expect(bw.state()).toBe('banned');
    expect(door.lock).not.toHaveBeenCalled();
    expect(found).not.toHaveBeenCalled();
    for (let i = 0; i < 5; i++) { t += 0.1; host.hook('update', 0.1, t); }
    expect(bw.state()).toBe('banned');
    expect(door.unlock).not.toHaveBeenCalled();
    state.z = layout.d + 1.5; // geht weiter nach draußen
    t += 0.1; host.hook('update', 0.1, t);
    expect(door.lock).toHaveBeenCalledTimes(1);
    expect(found).toHaveBeenCalledWith('richard-ban');
    expect(bw.state()).toBe('banned');
  });

  it('Q2#3: Richards Kassette trifft den stehenden Spieler (Knock) ohne Physik-Kontaktereignis', async () => {
    const { state, knock, layout } = await build();
    let spec = null;
    host.providers.set('physics', { spawn: (s) => { spec = { ...s, pos: { ...s.pos }, remove() {} }; return spec; } });
    let t = 1; host.hook('update', 0.016, t);
    window.__lfxBrawl.force('throw');
    for (let i = 0; i < 40 && !spec; i++) { t += 0.1; host.hook('update', 0.1, t); }
    expect(spec).toBeTruthy();
    expect(knock).not.toHaveBeenCalled();
    spec.pos = { x: state.x, y: 1.4, z: state.z + 0.4 }; // prallt an der Spielerhülle ab
    t += 0.016; host.hook('update', 0.016, t);
    expect(knock).toHaveBeenCalledTimes(1);
    expect(layout.d).toBeGreaterThan(0);
  });

  it('Q2#6: Schildtext wird per measureText eingepasst (HAUSVERBOT)', async () => {
    const { state, layout } = await build();
    state.x = layout.w / 2; state.z = layout.d + 2;
    host.hook('update', 0.016, 1);
    window.__lfxBrawl.force('banned');
    host.hook('update', 0.016, 1.1);
    const last = measured.filter((m) => m[1] === 'HAUSVERBOT').pop();
    expect(last[2]).toBeLessThanOrEqual(224);
  });

  it('Q2#2/Q4#2: Wurf trifft Richard an seiner echten Position (auch vor dem Kollider)', async () => {
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: [] }]);
    const rpos = { x: layout.w - 2.9, y: 0, z: layout.d - 2.35 };
    const hitBy = vi.fn();
    const body = { pos: { x: rpos.x, y: 1.5, z: rpos.z - 0.6 }, vel: { x: 0, y: 0, z: 7.9 }, remove() {}, grounded: false };
    const provs = { brawl: { hitBy }, cashier: { richard: () => ({ pos: rpos }) }, physics: { tapeMesh: () => ({ geometry: new BoxGeometry(1, 1, 1), materials: [new MeshBasicMaterial()], size: [1, 1, 1], tex: null }), spawn: () => body } };
    let h = null;
    const ctx = {
      layout, use: (n) => provs[n], warn() {}, on: () => () => {},
      input: { onAction: (n, fn) => { if (n === 'throw') h = fn; return () => {}; } },
      items: { release: () => ({ id: 'c1', art: null, media: 'vhs' }), carried: () => null, carry: () => false, restore() {} },
      camera: new PerspectiveCamera(), player: { getPose: () => ({ x: 0, z: 0 }) },
    };
    const m = throwMod.init(ctx);
    h({ carried: true, origin: { x: 0, y: 1.6, z: 0 }, dir: { x: 0, y: 0, z: 1 } });
    m.update(0.016);
    expect(hitBy).toHaveBeenCalledWith('object', expect.any(Object));
    m.dispose();
  });
});
