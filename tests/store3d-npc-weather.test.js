// @vitest-environment jsdom
// VIDEOTHEK LENZ · Passanten folgen dem Wetter (1.19.0, Fix-Paket wx): Schirme bei Nässe-Wechsel setzen/entfernen; Tauben-Geometrien werden beim Neubau entsorgt.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { Scene, PerspectiveCamera, Group, Mesh } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import npc from '../src/js/store3d/modules/npc.js';
import { createPigeons } from '../src/js/store3d/npc/animals.js';

function mkCanvasCtx() {
  return function getContext() {
    return new Proxy({}, {
      get: (t, k) => (k in t ? t[k] : (k === 'measureText' ? () => ({ width: 10 }) : () => ({ addColorStop() {} }))),
      set: (t, k, v) => { t[k] = v; return true; },
    });
  };
}

describe('npc: Schirme folgen dem Wetter', () => {
  let host;
  let dom;
  let wx;
  let listeners;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  const realRandom = Math.random;
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = mkCanvasCtx();
    let st = 0x1badf00d;
    Math.random = () => { st = (st + 0x6D2B79F5) >>> 0; let t = st; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  });
  afterEach(() => {
    if (host) host.hook('dispose');
    host = null;
    if (dom) dom.remove();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    Math.random = realRandom;
    MODULES.length = 0;
    delete window.__lfxM4;
  });

  async function build() {
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['c1'] }]);
    const groups = { street: new Group(), yard: new Group(), palast: new Group(), palastInterior: new Group() };
    listeners = new Set();
    wx = { tod: 'day', raining: false, wet: false, hour: 14, onChange: (fn) => { listeners.add(fn); return () => listeners.delete(fn); } };
    const fakeCity = {
      name: 'fakecity',
      init(ctx) {
        for (const g of Object.values(groups)) ctx.scene.add(g);
        ctx.provide('city', { data: layout.city, groups, signals: () => ({ main: 'green', side: 'red', walkMain: false, walkSide: true }), visible: () => ({}) });
        ctx.provide('weather', wx);
        ctx.provide('discover', { found: () => true, has: () => false, list: () => [] });
        ctx.provide('sound', { play() {} });
      },
    };
    MODULES.length = 0;
    MODULES.push(fakeCity, npc);
    dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    document.body.appendChild(dom);
    const state = { x: 10, z: 20, yaw: 0, pitch: 0 };
    const camera = new PerspectiveCamera(70, 1.5, 0.05, 90);
    const app = {
      layout, deps: { catalog: { items: new Map(), departments: [], highlights: [], resume: [] }, toast: vi.fn(), user: { name: 'Max' } },
      opts: { debug: true, devFlags: { npc: true, cars: true } }, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene: new Scene(), camera, renderer: { domElement: canvas }, preset: { level: 'mid' } },
      player: { ...state, y: 0, state, cancelPath() {}, teleport: vi.fn(), knock: vi.fn(), moved: 0 },
      setMode(m) { app.mode = m; }, holdview: { isOpen: false }, findSlot: () => null, take: vi.fn(), host: dom,
    };
    host = new ModuleHost(app);
    await host.init();
  }
  const tick = (sec) => { for (let i = 0; i < sec * 10; i++) host.hook('update', 0.1, i * 0.1); };
  const walkers = () => host.ctx.use('npc').people().filter((p) => p.kind === 'walker');
  const umbrellas = () => walkers().filter((p) => { let n = 0; p.handle.root.traverse((o) => { if (o instanceof Mesh) n++; }); return n >= 2; }).length;
  const setWet = (on) => { wx.wet = on; wx.raining = on; for (const fn of [...listeners]) fn(wx); };

  it('Regen setzt nach dem Erzeugen Schirme (gestaffelt), Regenende entfernt sie wieder', async () => {
    await build();
    tick(2);
    expect(walkers().length).toBeGreaterThan(3);
    expect(umbrellas()).toBe(0);
    setWet(true);
    expect(umbrellas()).toBe(0); // gestaffelt, nicht schlagartig
    tick(8);
    const n = walkers().length;
    const u = umbrellas();
    expect(u).toBeGreaterThan(0);
    expect(u).toBeLessThanOrEqual(n);
    setWet(false);
    tick(8);
    expect(umbrellas()).toBe(0);
  });

  it('unveränderte Nässe (Wolken/Temperatur) ändert nichts; dispose löst das Abo', async () => {
    await build();
    tick(2);
    for (const fn of [...listeners]) fn(wx); // gleiche Nässe
    tick(8);
    expect(umbrellas()).toBe(0);
    expect(listeners.size).toBe(1);
    host.hook('dispose');
    expect(listeners.size).toBe(0);
    host = null;
  });
});

describe('createPigeons: dispose entsorgt die Geometrien', () => {
  it('Körper und Flügel-Geometrie werden beim dispose freigegeben (kein Leck pro Stufenwechsel)', () => {
    const a = createPigeons(4);
    const geos = a.root.children.map((m) => m.geometry);
    const disposed = [];
    for (const g of geos) g.addEventListener('dispose', () => disposed.push(g));
    a.dispose();
    expect(disposed.length).toBe(2);
    const b = createPigeons(4);
    const g2 = b.root.children.map((m) => m.geometry);
    expect(g2[0]).not.toBe(geos[0]); // frisch gebaut, kein entsorgtes Objekt wiederverwendet
    b.dispose();
  });
});
