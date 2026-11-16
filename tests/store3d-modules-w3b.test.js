// @vitest-environment jsdom
// Welle 3 (store3d): A128 Compose-Queue, B067 Hänger-Wertung, A106-A108 Richard, A114 Musik-Aufholen, A111/A112/A115 Kassen-PC.
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { Scene, PerspectiveCamera } from 'three';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import cashier from '../src/js/store3d/modules/cashier.js';
import terminal from '../src/js/store3d/modules/terminal.js';
import sound from '../src/js/store3d/modules/sound.js';
import { AutoQuality } from '../src/js/store3d/engine/quality.js';
import { CoverManager } from '../src/js/store3d/covers/manager.js';

describe('A128 cancelLoad verwirft wartenden full-Compose-Job', () => {
  it('composeQueue enthält danach keinen full-Job der Seite mehr', () => {
    const m = new CoverManager({ faceViews: [], items: new Map(), deps: {}, preset: { level: 'mid', atlas: 1024 } });
    const f = { loading: { ac: new AbortController(), bitmaps: new Map(), pending: 0, hi: false } };
    const other = { loading: null };
    m.composeQueue = [{ f, kind: 'full' }, { f: other, kind: 'full' }];
    m.cancelLoad(f);
    expect(m.composeQueue).toEqual([{ f: other, kind: 'full' }]);
  });
});

describe('B067 Hänger zählen in der Qualitätsautomatik', () => {
  it('Dauerruckeln mit 300-ms-Frames senkt die Stufe', () => {
    const q = new AutoQuality('mid');
    let changed = null;
    let now = 0;
    for (let i = 0; i < 20 && !changed; i++) { now += 300; changed = q.sample(0.3, now); }
    expect(changed).toBe('low');
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

describe('Richard und Kassen-PC', () => {
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

  it('A106 nach der Begrüßung spricht Richard bei take nach mehr als 20 s wieder', async () => {
    await build();
    const bubble = dom.querySelector('.lfx-store-bubble');
    host.emit('enter');
    host.hook('update', 1.2, 1.5);
    expect(bubble.hidden).toBe(false);
    for (let t = 2.5; t <= 10; t += 1) host.hook('update', 1, t);
    expect(bubble.hidden).toBe(true);
    for (let t = 11; t <= 30; t += 1) host.hook('update', 1, t);
    host.emit('take', 'c1');
    expect(bubble.hidden).toBe(false);
  });

  it('A107/A108 Richard-Dialog hat role=dialog und behält per Tastatur den Fokus', async () => {
    await build();
    window.__lfxM4.tip();
    const el = dom.querySelector('.lfx-store-dialog');
    expect(el.getAttribute('role')).toBe('dialog');
    expect(el.getAttribute('aria-label')).toBe('Richard – Kasse');
    const btn = el.querySelector('.lfx-store-tip-btn');
    btn.focus();
    btn.click(); // Antwort wählen: Knopfzeile wird neu aufgebaut
    expect(el.contains(document.activeElement)).toBe(true);
    expect(document.activeElement.tagName).toBe('BUTTON');
  });

  it('A111/A112/A115 Kassen-PC: keine option-Zeilen mit Buttons, Hilfe-Schalter und Status', async () => {
    await build();
    host.ctx.use('terminal').open('titel');
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    const root = dom.querySelector('.lfx-store-term');
    expect(root.querySelector('[role=option]')).toBeNull();
    expect(root.querySelector('.lfx-store-term-row button')).not.toBeNull();
    expect(root.querySelector('.lfx-store-term-row').getAttribute('aria-current')).toBe('true');
    expect(root.querySelector('.lfx-store-term-status').getAttribute('role')).toBe('status');
    const helpBtn = [...root.querySelectorAll('.lfx-store-term-key')].find((b) => b.textContent.startsWith('F1'));
    expect(helpBtn.getAttribute('aria-expanded')).toBe('false');
    expect(root.querySelector('#' + helpBtn.getAttribute('aria-controls'))).not.toBeNull();
    helpBtn.click();
    expect(helpBtn.getAttribute('aria-expanded')).toBe('true');
    root.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true }));
    expect(helpBtn.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('A114 Lounge-Musik holt verpasste Schritte auf', () => {
  it('nach langer Pause werden nicht alle verpassten Schritte eingeplant', () => {
    let oscs = 0;
    const node = () => new Proxy(function fake() {}, {
      get: (t, k) => {
        if (k === 'then') return undefined;
        if (k === 'gain' || k === 'frequency' || k === 'detune' || k === 'delayTime' || k === 'Q') return node();
        return () => node();
      },
      set: () => true,
    });
    class FakeAC {
      constructor() { this.state = 'running'; this.currentTime = 1; this.sampleRate = 4; this.destination = node(); FakeAC.inst = this; }
      createOscillator() { oscs++; return node(); }
      createGain() { return node(); }
      createBiquadFilter() { return node(); }
      createDelay() { return node(); }
      createBufferSource() { return node(); }
      createBuffer() { return { getChannelData: () => new Float32Array(8) }; }
      suspend() { return Promise.resolve(); }
      resume() { return Promise.resolve(); }
      close() {}
    }
    window.AudioContext = FakeAC;
    const handlers = {};
    const ctx = {
      opts: {}, use: () => null, soundOn: () => true, layout: { adultRoom: null, kidsRoom: null }, player: { getPose: () => ({ x: 0, z: 0 }) },
      on: (n, fn) => { handlers[n] = fn; return () => {}; }, provide: () => {}, deps: {},
    };
    const mod = sound.init(ctx);
    handlers.enter();
    mod.update(0.016, 0);
    const before = oscs;
    FakeAC.inst.currentTime = 600; // 10 min versteckter Tab
    mod.update(0.016, 1);
    
    expect(oscs - before).toBeLessThan(40);
    mod.dispose();
    delete window.AudioContext;
  });
});
