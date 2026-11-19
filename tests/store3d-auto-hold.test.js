// @vitest-environment jsdom
// Automatik-Haken (1.19.0 hitch3): extendSettle, holdAuto im Renderer (Fake), holdAuto in der Hülle (busy + 8-s-Grenze).
import { describe, it, expect, vi, beforeEach } from 'vitest';

let loopFn = null;
vi.mock('three', async (orig) => {
  const m = await orig();
  class FakeRenderer {
    constructor() {
      this.xr = { isPresenting: false, addEventListener() {}, removeEventListener() {} };
      this.shadowMap = {};
      this.info = {};
      this.domElement = { addEventListener() {}, removeEventListener() {} };
    }
    setPixelRatio() {} setSize() {} setClearColor() {} render() {} dispose() {} forceContextLoss() {}
    setAnimationLoop(fn) { loopFn = fn; }
  }
  return { ...m, WebGLRenderer: FakeRenderer };
});

import { AutoQuality } from '../src/js/store3d/engine/quality.js';
import { createEngine } from '../src/js/store3d/engine/renderer.js';
import { StoreApp } from '../src/js/store3d/store.js';

describe('AutoQuality.extendSettle', () => {
  it('verlängert nur nach oben, nie verkürzend', () => {
    const q = new AutoQuality('mid');
    q.extendSettle(0.5);
    expect(q.settleLeft).toBe(0.5);
    q.reset();
    expect(q.settleLeft).toBe(1.5);
    q.extendSettle(0.5);
    expect(q.settleLeft).toBe(1.5);
  });

  it('gehaltene Fenster zählen nicht: langsames Fenster unter Hold senkt nicht, ohne Hold schon', () => {
    const mk = () => { const q = new AutoQuality('high'); q.lastUp = 0; q.fpsAtUp = 90; return q; };
    const a = mk(); let now = 1000; let ch = null;
    for (let i = 0; i < 400 && !ch; i++) { now += 20; a.extendSettle(0.5); ch = a.sample(0.02, now); }
    expect(ch).toBe(null);
    const b = mk(); now = 1000; ch = null;
    for (let i = 0; i < 400 && !ch; i++) { now += 20; ch = b.sample(0.02, now); }
    expect(ch).toBe('mid');
  });
});

describe('createEngine holdAuto', () => {
  beforeEach(() => { loopFn = null; });
  function mk(holdAuto) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const eng = createEngine({ host, level: 'high', auto: true, phone: false, maxLevel: 'ultra', holdAuto });
    eng.start(() => {});
    return eng;
  }
  function drive(frames, dtMs) {
    let t = 1000;
    for (let i = 0; i < frames; i++) { t += dtMs; loopFn(t); }
  }
  it('ohne Haken senkt eine langsame Phase die Stufe', () => {
    const eng = mk(undefined);
    drive(300, 30); // ~33 fps
    expect(eng.preset.level).not.toBe('high');
  });
  it('mit Haken true bleibt die Stufe, nach false greift die Automatik', () => {
    let hold = true;
    const eng = mk(() => hold);
    drive(300, 30);
    expect(eng.preset.level).toBe('high');
    hold = false;
    drive(300, 30);
    expect(eng.preset.level).not.toBe('high');
  });
});

describe('StoreApp.holdAuto', () => {
  const app = (o) => Object.assign(Object.create(StoreApp.prototype), { ultraOk: true, warmDraw: { busy: () => true }, lastLevelAt: performance.now(), ...o });
  it('true nur bei ultraOk, warmDraw busy und Stufenwechsel <= 8 s her', () => {
    expect(app({}).holdAuto()).toBe(true);
    expect(app({ ultraOk: false }).holdAuto()).toBe(false);
    expect(app({ warmDraw: null }).holdAuto()).toBe(false);
    expect(app({ warmDraw: { busy: () => false } }).holdAuto()).toBe(false);
    expect(app({ lastLevelAt: null }).holdAuto()).toBe(false);
    expect(app({ lastLevelAt: performance.now() - 8500 }).holdAuto()).toBe(false);
    expect(app({ lastLevelAt: performance.now() - 7000 }).holdAuto()).toBe(true);
  });
  it('applyPreset setzt den Stufenwechsel-Zeitpunkt nur bei geänderter Stufe', () => {
    const a = app({ lastLevelAt: null, appliedLevel: 'mid', covers: null, tex: null, lights: null, pause: null, mods: null });
    a.applyPreset({ level: 'mid' });
    expect(a.lastLevelAt).toBe(null);
    a.applyPreset({ level: 'high' });
    expect(a.lastLevelAt).toBeGreaterThan(0);
    expect(a.appliedLevel).toBe('high');
  });
});
