// @vitest-environment jsdom
// TV-Modul: Trailersuche stoppt nach onSuspend, Lautstärke wird angesagt.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import tv from '../src/js/store3d/modules/tv.js';

const tick = () => new Promise((r) => setTimeout(r, 0));

function fake2d() {
  const g = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 10 }),
  };
  return new Proxy(g, { get: (t, k) => (k in t ? t[k] : (k === 'canvas' ? null : () => {})), set: () => true });
}

function tvSetup(deps) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fake2d());
  let overlay = null;
  const ia = [];
  const els = [];
  const ctx = {
    layout: { zones: { tv: { rect: { x0: 0, z0: 0, x1: 6, z1: 6 } } }, adultRoom: null },
    scene: { add() {} }, track: (o) => o, addCollider: (r) => r, removeCollider: () => {},
    addInteractable: (o) => { ia.push(o); return () => {}; },
    catalog: { items: new Map(), highlights: ['a', 'b', 'c', 'd'].map((i) => ({ Id: i, Name: i, BackdropImageTags: ['t'] })) },
    deps: { imageUrl: () => 'blob:x', play() {}, toast() {}, ...deps },
    quality: () => 'mid', provide: () => () => {}, use: () => null,
    camera: { fov: 70, aspect: 1.7, matrixWorld: { elements: new Array(16).fill(0) } },
    player: {
      getPose: () => ({ x: 1, z: 2, yaw: 0.5, pitch: 0 }), freeze() {}, teleport() {},
      camera: { flyTo: vi.fn(() => Promise.resolve(false)), release: vi.fn() },
    },
    overlay: {
      open: vi.fn((el, o) => { els.push(el); overlay = o; }), isOpen: () => !!overlay,
      close: () => { const o = overlay; overlay = null; if (o && o.onClose) o.onClose(); },
    },
    xr: { presenting: () => false },
    on: () => () => {},
  };
  return { ctx, ia, els };
}

describe('TV-Trailersuche stoppt nach onSuspend', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it('keine weiteren getItem-Aufrufe nach suspend', async () => {
    let release;
    const getItem = vi.fn((id) => (getItem.mock.calls.length === 1 ? new Promise((r) => { release = () => r({ Id: id, LocalTrailerCount: 0 }); }) : Promise.resolve({ Id: id, LocalTrailerCount: 0 })));
    const S = tvSetup({ getItem, loadTrailer: vi.fn(() => Promise.resolve(null)) });
    const h = tv.init(S.ctx);
    S.ia.find((i) => i.label === 'Sofa').onUse();
    await tick();
    expect(getItem).toHaveBeenCalledTimes(1);
    h.onSuspend();
    release();
    await tick(); await tick();
    expect(getItem).toHaveBeenCalledTimes(1);
    h.dispose();
  });
});

describe('Lautstärke wird angesagt', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  it('role=status in der Couch-Leiste zeigt die Lautstärke', async () => {
    const S = tvSetup({});
    const h = tv.init(S.ctx);
    S.ia.find((i) => i.label === 'Sofa').onUse();
    await tick();
    const root = S.els[0];
    const status = root.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    const up = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Lauter');
    up.click();
    expect(status.textContent).toMatch(/^Lautstärke \d+ %$/);
    h.dispose();
  });
});

