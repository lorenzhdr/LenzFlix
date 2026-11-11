// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import tv from '../src/js/store3d/modules/tv.js';

function fake2d() {
  const g = {
    createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }),
    createLinearGradient: () => ({ addColorStop() {} }),
    createRadialGradient: () => ({ addColorStop() {} }),
    measureText: () => ({ width: 10 }),
  };
  return new Proxy(g, { get: (t, k) => (k in t ? t[k] : (k === 'canvas' ? null : () => {})), set: () => true });
}

function setup({ presenting = true } = {}) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => fake2d());
  let xr = presenting;
  let overlay = null;
  const listeners = new Map();
  const ia = [];
  const calls = { jump: [], freeze: [], panels: [], teleport: [], added: [], removed: [], play: [] };
  const ctx = {
    layout: { zones: { tv: { rect: { x0: 0, z0: 0, x1: 6, z1: 6 } } }, adultRoom: null },
    scene: { add() {} },
    track: (o) => o,
    addCollider: (r) => { calls.added.push(r); return r; },
    removeCollider: (r) => calls.removed.push(r),
    addInteractable: (o) => { ia.push(o); return () => {}; },
    catalog: { items: new Map(), highlights: [{ Id: 'h1', Name: 'Film', BackdropImageTags: ['t'] }] },
    deps: { imageUrl: () => 'blob:x', play: (it, o) => calls.play.push([it.Id, o]), toast() {} },
    quality: () => 'mid',
    provide: () => () => {},
    use: () => null,
    camera: { fov: 70, aspect: 1.7, matrixWorld: { elements: new Array(16).fill(0) } },
    player: {
      getPose: () => ({ x: 1, z: 2, yaw: 0.5, pitch: 0 }),
      freeze: (on) => calls.freeze.push(on),
      teleport: (...a) => calls.teleport.push(a),
      camera: { flyTo: vi.fn(() => Promise.resolve(false)), release: vi.fn() },
    },
    overlay: {
      open: vi.fn((el, o) => { overlay = o; }),
      isOpen: () => !!overlay,
      close: () => { const o = overlay; overlay = null; if (o && o.onClose) o.onClose(); },
    },
    xr: {
      presenting: () => xr,
      jumpTo: vi.fn((x, z, o) => { calls.jump.push([x, z, o]); return Promise.resolve(true); }),
      panel: { open: vi.fn((spec) => { overlay = { onClose: spec.onClose }; const h = { open: true, update: vi.fn(), close: () => { overlay = null; } }; calls.panels.push({ spec, h }); return h; }) },
    },
    on: (ev, fn) => { const l = listeners.get(ev) || []; l.push(fn); listeners.set(ev, l); return () => {}; },
  };
  return { ctx, ia, calls, emit: (ev, ...a) => (listeners.get(ev) || []).forEach((f) => f(...a)), setXr: (v) => { xr = v; } };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const sofa = (ia) => ia.find((i) => i.label === 'Sofa');

beforeEach(() => { vi.restoreAllMocks(); });

describe('Couch in VR: Sitz-Ablauf', () => {
  it('Hinsetzen: freeze, jumpTo mit Blick zum Fernseher, Knopfleiste als Panel (low), kein flyTo/Overlay-DOM', async () => {
    const S = setup();
    const h = tv.init(S.ctx);
    sofa(S.ia).onUse();
    expect(S.calls.freeze).toContain(true);
    expect(S.ctx.xr.jumpTo).toHaveBeenCalledTimes(1);
    const [, , o] = S.calls.jump[0];
    expect(Number.isFinite(o.face.x) && Number.isFinite(o.face.z)).toBe(true);
    expect(S.ctx.player.camera.flyTo).not.toHaveBeenCalled();
    expect(S.ctx.overlay.open).not.toHaveBeenCalled();
    await tick();
    expect(S.calls.panels).toHaveLength(1);
    const spec = S.calls.panels[0].spec;
    expect(spec.anchor).toBe('low');
    expect(spec.buttons.map((b) => b.label)).toContain('Aufstehen');
    h.dispose();
  });

  it('Aufstehen über Panel-Knopf: freeze false, Panel zu, Blende vor das Sofa, Sofa-Kollision zurück', async () => {
    const S = setup();
    const h = tv.init(S.ctx);
    sofa(S.ia).onUse();
    await tick();
    const spec = S.calls.panels[0].spec;
    spec.buttons.find((b) => b.label === 'Aufstehen').onSelect();
    await tick();
    expect(S.calls.freeze.at(-1)).toBe(false);
    expect(S.ctx.overlay.isOpen()).toBe(false);
    expect(S.calls.jump).toHaveLength(2); // Hinsetzen + Platz vor dem Sofa
    expect(S.calls.removed).toHaveLength(1);
    expect(S.calls.added).toHaveLength(4); // 3 Möbel + Sofa wieder
    expect(S.ctx.player.camera.flyTo).not.toHaveBeenCalled();
    h.dispose();
  });

  it('B/Y (onClose des Panels) = Aufstehen', async () => {
    const S = setup();
    const h = tv.init(S.ctx);
    sofa(S.ia).onUse();
    await tick();
    S.ctx.overlay.close();
    await tick();
    expect(S.calls.freeze.at(-1)).toBe(false);
    h.dispose();
  });

  it('„Diesen Film ansehen“: aufstehen, dann deps.play ohne Fortsetzen', async () => {
    const S = setup();
    const h = tv.init(S.ctx);
    sofa(S.ia).onUse();
    await tick();
    S.calls.panels[0].spec.buttons.find((b) => b.label === 'Diesen Film ansehen').onSelect();
    await tick();
    expect(S.calls.play).toEqual([['h1', { resume: false }]]);
    expect(S.calls.freeze.at(-1)).toBe(false);
    h.dispose();
  });

  it('Sitzung endet im Sitzen: sauber aufstehen, zurück an die 2D-Pose', async () => {
    const S = setup();
    const h = tv.init(S.ctx);
    sofa(S.ia).onUse();
    await tick();
    S.setXr(false);
    S.emit('xr', false);
    await tick();
    expect(S.calls.freeze.at(-1)).toBe(false);
    expect(S.calls.teleport).toEqual([[1, 2, 0.5, 0]]);
    expect(S.ctx.overlay.isOpen()).toBe(false);
    h.dispose();
  });

  it('onSuspend (z. B. Kino betreten) steht sofort auf', async () => {
    const S = setup();
    const h = tv.init(S.ctx);
    sofa(S.ia).onUse();
    await tick();
    h.onSuspend();
    await tick();
    expect(S.calls.freeze.at(-1)).toBe(false);
    h.dispose();
  });

  it('Suspend noch während der Blende: kein Panel mehr, trotzdem aufgestanden', async () => {
    const S = setup();
    const h = tv.init(S.ctx);
    sofa(S.ia).onUse();
    h.onSuspend();
    await tick();
    expect(S.calls.panels).toHaveLength(0);
    expect(S.calls.freeze.at(-1)).toBe(false);
    h.dispose();
  });
});

describe('Couch in 2D bleibt unverändert', () => {
  it('Hinsetzen: Overlay-DOM + flyTo, kein jumpTo/Panel', () => {
    const S = setup({ presenting: false });
    const h = tv.init(S.ctx);
    sofa(S.ia).onUse();
    expect(S.ctx.overlay.open).toHaveBeenCalledTimes(1);
    expect(S.ctx.player.camera.flyTo).toHaveBeenCalledTimes(1);
    expect(S.ctx.xr.jumpTo).not.toHaveBeenCalled();
    expect(S.ctx.xr.panel.open).not.toHaveBeenCalled();
    expect(S.calls.removed).toHaveLength(0);
    h.dispose();
  });
});
