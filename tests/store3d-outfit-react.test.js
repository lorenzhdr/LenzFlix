// @vitest-environment jsdom
// Passanten-Reaktionen aufs Outfit (1.17.0): Zeilen (npc/lines.js), hairOnly, Budget im Modul npc (Fake-Uhr über dt), Abstand, Gebrauch ohne avatar.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { Scene, PerspectiveCamera, Group } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import npc, { hairOnly } from '../src/js/store3d/modules/npc.js';
import { pickLine } from '../src/js/store3d/npc/lines.js';
import { defaultCode } from '../src/js/store3d/char/look2.js';
import { WINDOW_MS, GAP_MS, MAX_PASSERBY } from '../src/js/store3d/char/react-logic.js';

function allLines(cat) {
  const out = new Set();
  for (let i = 0; i < 64; i++) { const r = pickLine(cat, () => i / 64); if (r) out.add(r.text); }
  return out;
}
const OUTFIT = allLines('outfitNew');
const HAIR = allLines('hairNew');

describe('npc/lines: Outfit-Kategorien', () => {
  it('viele Varianten, deutsch, ohne Körper-/Hautfarbenbezug und ohne Beleidigung', () => {
    expect(OUTFIT.size).toBeGreaterThanOrEqual(12);
    expect(HAIR.size).toBeGreaterThanOrEqual(10);
    const bad = /(dick|fett|hässlich|häßlich|dumm|blöd|idiot|haut|hautfarbe|schwarz|weiß|figur|bauch|gewicht|klein|groß|schwul|behindert|scheiß)/i;
    for (const t of [...OUTFIT, ...HAIR]) expect(t).not.toMatch(bad);
  });
  it('pickLine vermeidet die vorige Zeile', () => {
    const a = pickLine('outfitNew', () => 0, -1);
    const b = pickLine('outfitNew', () => 0, a.index);
    expect(b.index).not.toBe(a.index);
  });
});

describe('hairOnly', () => {
  it('nur Frisur geändert → true; sonst false', () => {
    const a = defaultCode();
    const b = a.slice(); b[5] = 3;
    const c = a.slice(); c[6] = 9;
    const d = a.slice(); d[5] = 3; d[10] = 4;
    const e = a.slice(); e[1] = 5; // Haut zählt nicht zum Outfit
    expect(hairOnly(a, b)).toBe(true);
    expect(hairOnly(a, c)).toBe(true);
    expect(hairOnly(a, d)).toBe(false);
    expect(hairOnly(a, e)).toBe(false);
    expect(hairOnly(a, a)).toBe(false);
    expect(hairOnly(null, a)).toBe(false);
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

describe('npc: Outfit-Reaktionen', () => {
  let host;
  let dom;
  let app;
  let seen;
  let obs;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  beforeEach(() => {
    HTMLCanvasElement.prototype.getContext = mkCanvasCtx();
    let a = 12345; // deterministischer Zufall (Passanten und Zeilen)
    vi.spyOn(Math, 'random').mockImplementation(() => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; });
  });
  afterEach(() => {
    if (obs) obs.disconnect();
    if (host) host.hook('dispose');
    host = null;
    if (dom) dom.remove();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    vi.restoreAllMocks();
    MODULES.length = 0;
    delete window.__lfxStore;
  });

  async function build({ withAvatar = true } = {}) {
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: ['c1'] }]);
    const groups = { street: new Group(), yard: new Group(), palast: new Group(), palastInterior: new Group() };
    const cbs = [];
    let hash = 'h0';
    let code = defaultCode();
    const av = {
      onChange: (fn) => { cbs.push(fn); return () => cbs.splice(cbs.indexOf(fn), 1); },
      hash: () => hash,
      code: () => code.slice(),
      look: () => null,
    };
    const change = (patch, h) => { code = code.slice(); for (const [i, v] of Object.entries(patch)) code[i] = v; hash = h; for (const fn of cbs.slice()) fn({ v: 2 }, code.slice()); };
    const fake = {
      name: 'fakecity',
      init(ctx) {
        for (const g of Object.values(groups)) ctx.scene.add(g);
        ctx.provide('city', { data: layout.city, groups, signals: () => ({ main: 'green', side: 'red', walkMain: false, walkSide: true }), visible: () => ({}) });
        ctx.provide('weather', { tod: 'day', raining: false, hour: 14 });
        ctx.provide('discover', { found: () => true, has: () => false, list: () => [] });
        ctx.provide('sound', { play: () => {} });
        if (withAvatar) ctx.provide('avatar', av);
      },
    };
    MODULES.length = 0;
    MODULES.push(fake, npc);
    dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    document.body.appendChild(dom);
    const state = { x: 10, z: 20, yaw: 0, pitch: 0 };
    const camera = new PerspectiveCamera(70, 1.5, 0.05, 90);
    app = {
      layout, deps: { catalog: { items: new Map(), departments: [], highlights: [], resume: [] }, toast() {}, user: { name: 'Max' } },
      opts: { debug: true, devFlags: { npc: true, cars: true } }, phone: false, touch: false, sound: false, mode: 'play',
      engine: { scene: new Scene(), camera, renderer: { domElement: canvas }, preset: { level: 'mid' } },
      player: { ...state, y: 0, state, cancelPath() {}, teleport() {}, knock() {}, moved: 0 },
      setMode(m) { app.mode = m; }, holdview: { isOpen: false }, findSlot: () => null, take() {}, host: dom,
    };
    host = new ModuleHost(app);
    await host.init();
    window.__lfxStore = {};
    host.emit('enter');
    seen = [];
    obs = new MutationObserver((list) => {
      for (const m of list) {
        const el = m.target.nodeType === 3 ? m.target.parentNode : m.target;
        const txt = el && el.textContent;
        // eine Zuweisung von textContent erzeugt mehrere Mutationen: aufeinanderfolgende gleiche Zeilen zählen einmal (pickLine wiederholt nie direkt)
        if (txt && (OUTFIT.has(txt) || HAIR.has(txt)) && seen[seen.length - 1] !== txt) seen.push(txt);
      }
    });
    obs.observe(dom, { subtree: true, childList: true, characterData: true });
    return { change };
  }

  /** Spieler an einen Passanten setzen (nahe) und Zeit vorspulen; liefert die Zahl bisher gesehener Outfit-Zeilen. */
  const nearWalker = () => {
    const w = window.__lfxStore.m3.npc.walkers()[0];
    app.player.x = w.x + 1; app.player.z = w.z; app.player.y = 0;
    app.player.state.x = app.player.x; app.player.state.z = app.player.z;
  };
  const run = async (sec, { near = true, dt = 0.1 } = {}) => {
    for (let t = 0; t < sec; t += dt) {
      if (near) nearWalker();
      host.hook('update', dt, t);
      await Promise.resolve(); // MutationObserver-Mikrotask
    }
    await new Promise((r) => setTimeout(r, 0));
  };

  it('ohne Änderung: nie ein Outfit-Spruch', async () => {
    await build();
    await run(40);
    expect(seen.length).toBe(0);
  });

  it('nach einer Änderung: Passant in < 4 m sagt etwas aus der Outfit-Liste, höchstens 3, danach Ruhe', async () => {
    const { change } = await build();
    await run(2);
    change({ 10: 4 }, 'h1');
    await run(60);
    expect(seen.length).toBeGreaterThanOrEqual(1);
    expect(seen.length).toBeLessThanOrEqual(MAX_PASSERBY);
    for (const t of seen) expect(OUTFIT.has(t)).toBe(true);
    const before = seen.length;
    await run(WINDOW_MS / 1000 + 20); // Fenster vorbei: keine weiteren
    expect(seen.length).toBe(before);
  });

  it('nur Frisur geändert → Frisuren-Zeilen', async () => {
    const { change } = await build();
    await run(2);
    change({ 5: 7 }, 'h2');
    await run(30);
    expect(seen.length).toBeGreaterThanOrEqual(1);
    for (const t of seen) expect(HAIR.has(t)).toBe(true);
  });

  it('Passant fern (> 4 m): kein Spruch', async () => {
    const { change } = await build();
    await run(2);
    change({ 10: 4 }, 'h3');
    app.player.x = 500; app.player.z = 500; app.player.state.x = 500; app.player.state.z = 500;
    await run(30, { near: false });
    expect(seen.length).toBe(0);
  });

  it('Abstand zwischen zwei Sprüchen mindestens GAP_MS', async () => {
    const { change } = await build();
    await run(2);
    change({ 10: 4 }, 'h4');
    const times = [];
    let last = 0;
    for (let t = 0; t < 40; t += 0.1) {
      nearWalker();
      host.hook('update', 0.1, t);
      await Promise.resolve();
      if (seen.length > last) { times.push(t); last = seen.length; }
    }
    for (let i = 1; i < times.length; i++) expect((times[i] - times[i - 1]) * 1000).toBeGreaterThanOrEqual(GAP_MS - 200);
  });

  it('ohne avatar-Provider wirft nichts', async () => {
    await build({ withAvatar: false });
    await expect(run(5)).resolves.toBeUndefined();
    expect(seen.length).toBe(0);
  });
});
