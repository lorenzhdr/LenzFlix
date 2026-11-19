// @vitest-environment jsdom
// VIDEOTHEK LENZ · Wetter-Extras (1.19.0): Thermometer, Atemwölkchen, Blitz/Donner-Planung, nasse Straße (Logik), Winterkleidung. Kein Netzwerk.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Scene, PerspectiveCamera, Points, AdditiveBlending } from 'three';
import {
  hash01, lightningGap, flashAt, FLASH_LEN, thunderPlan, lightningOn, lightningVisual, boltVisible, breathOn, breathPhase, BREATH_MAX, thermoText, wetLevel, wetGlow, WET_DRY_S,
} from '../src/js/store3d/weather/fx-logic.js';
import { MODULES } from '../src/js/store3d/modules/index.js';
import { ModuleHost } from '../src/js/store3d/modules/runtime.js';
import precip from '../src/js/store3d/modules/precip.js';
import daytime from '../src/js/store3d/modules/daytime.js';
import weatherfx from '../src/js/store3d/modules/weatherfx.js';
import { wetSources } from '../src/js/store3d/modules/ultra-wet.js';
import { buildLayout } from '../src/js/store3d/world/layout.js';

describe('fx-logic (rein)', () => {
  it('Blitzabstand 8 … 25 s, deterministisch', () => {
    for (let n = 0; n < 200; n++) {
      const g = lightningGap(12345, n);
      expect(g).toBeGreaterThanOrEqual(8);
      expect(g).toBeLessThanOrEqual(25);
      expect(lightningGap(12345, n)).toBe(g);
    }
    expect(lightningGap(1, 0)).not.toBe(lightningGap(2, 0));
    expect(hash01(7)).toBe(hash01(7));
  });
  it('Blitzkurve: doppeltes Aufflackern, dann aus', () => {
    expect(flashAt(-1)).toBe(0);
    expect(flashAt(0.01)).toBe(1);
    expect(flashAt(0.1)).toBeLessThan(0.3); // Lücke zwischen den Blitzen
    expect(flashAt(0.15)).toBeGreaterThan(0.5); // zweites Aufflackern
    expect(flashAt(FLASH_LEN)).toBe(0);
    expect(flashAt(5)).toBe(0);
    expect(flashAt(NaN)).toBe(0);
  });
  it('Donner: 0,5 … 4 s verzögert, leiser bei Abstand, deterministisch', () => {
    for (let n = 0; n < 100; n++) {
      const p = thunderPlan(99, n);
      expect(p.delay).toBeGreaterThanOrEqual(0.5);
      expect(p.delay).toBeLessThanOrEqual(4);
      expect(p.gain).toBeGreaterThan(0.1);
      expect(p.gain).toBeLessThanOrEqual(1);
      expect(thunderPlan(99, n)).toEqual(p);
    }
    const a = thunderPlan(5, 1); const b = thunderPlan(5, 2);
    expect(a.dist > b.dist).toBe(a.gain < b.gain);
  });
  it('Blitze nur bei Gewitter und ohne reduzierte Bewegung; Strahl ab mid', () => {
    expect(lightningOn({ storm: true }, false)).toBe(true);
    expect(lightningOn({ storm: true }, true)).toBe(true);
    expect(lightningVisual(true)).toBe(false);
    expect(lightningVisual(false)).toBe(true);
    expect(lightningOn({ storm: false }, false)).toBe(false);
    expect(lightningOn(null, false)).toBe(false);
    expect(boltVisible('low')).toBe(false);
    expect(boltVisible('mid')).toBe(true);
    expect(boltVisible('ultra')).toBe(true);
  });
  it('Atem nur bei t <= 0 und Stufe >= high', () => {
    expect(breathOn(0, 'high')).toBe(true);
    expect(breathOn(-5, 'ultra')).toBe(true);
    expect(breathOn(1, 'high')).toBe(false);
    expect(breathOn(-5, 'mid')).toBe(false);
    expect(breathOn(-5, 'low')).toBe(false);
    expect(breathOn(null, 'high')).toBe(false);
    expect(BREATH_MAX).toBe(8);
  });
  it('Atemrhythmus 3 … 4 s je Figur, Phase 0..1', () => {
    for (let i = 0; i < 8; i++) {
      let prev = breathPhase(0, i);
      let wraps = 0;
      for (let t = 0.05; t < 40; t += 0.05) { const p = breathPhase(t, i); expect(p).toBeGreaterThanOrEqual(0); expect(p).toBeLessThan(1); if (p < prev) wraps++; prev = p; }
      expect(wraps).toBeGreaterThanOrEqual(10); // 40 s / 4 s
      expect(wraps).toBeLessThanOrEqual(14); // 40 s / 3 s
    }
  });
  it('Thermometer-Text: ganzzahlig, echtes Minus, null ohne Wert', () => {
    expect(thermoText(3)).toBe('3 °C');
    expect(thermoText(-4)).toBe('-4 °C');
    expect(thermoText(0)).toBe('0 °C');
    expect(thermoText(2.6)).toBe('3 °C');
    expect(thermoText(null)).toBeNull();
    expect(thermoText(NaN)).toBeNull();
  });
  it('nasse Straße: Regen nach i, Restnässe 10 min, Schnee nie', () => {
    expect(wetLevel({ raining: true, i: 1 }, 0)).toBe(1);
    expect(wetLevel({ raining: true, i: 0.3 }, 0)).toBeLessThan(wetLevel({ raining: true, i: 1 }, 0));
    expect(wetLevel({ raining: false }, null)).toBe(0);
    expect(wetLevel({ raining: false }, 0)).toBeGreaterThan(0.3);
    expect(wetLevel({ raining: false }, WET_DRY_S / 2)).toBeLessThan(wetLevel({ raining: false }, 0));
    expect(wetLevel({ raining: false }, WET_DRY_S)).toBe(0);
    expect(wetLevel({ raining: false, snowing: true }, 10)).toBe(0);
    // Regen auf liegendem Schnee: nass, von der Schneedecke geschmälert; Schneefall bleibt 0
    expect(wetLevel({ raining: true, i: 1, cover: 0.8 }, 0)).toBeCloseTo(0.2, 5);
    expect(wetLevel({ raining: true, i: 1, cover: 0.8 }, 0)).toBeGreaterThan(0);
    expect(wetLevel({ raining: true, i: 1, cover: 0.8 }, 0)).toBeLessThan(wetLevel({ raining: true, i: 1, cover: 0.1 }, 0));
    expect(wetLevel({ raining: true, i: 1, cover: 1 }, 0)).toBe(0);
    expect(wetLevel({ raining: false, cover: 0.5 }, 0)).toBeCloseTo(0.225, 5);
    expect(wetLevel({ raining: false, snowing: true, cover: 0.5 }, 0)).toBe(0);
    expect(wetGlow('night')).toBeGreaterThan(wetGlow('day'));
  });
  it('Spiegelquellen aus dem Layout (Laternen, Fenster, Tür, Palast, Kiosk)', () => {
    const L = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: [] }]);
    const s = wetSources(L);
    expect(s.length).toBeGreaterThanOrEqual((L.city.lights || []).length + 2);
    for (const q of s) expect(Number.isFinite(q.x) && Number.isFinite(q.z) && q.len > 0).toBe(true);
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

describe('Modul weatherfx', () => {
  let host;
  let dom;
  const realGetContext = HTMLCanvasElement.prototype.getContext;
  const realMM = window.matchMedia;
  afterEach(() => {
    if (host) host.hook('dispose');
    host = null;
    if (dom) dom.remove();
    HTMLCanvasElement.prototype.getContext = realGetContext;
    window.matchMedia = realMM;
    MODULES.length = 0;
    delete window.__lfxM4;
  });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  async function build({ weather, opts = {}, level = 'high', reduced = false, sound = false, rend = {}, qs } = {}) {
    window.matchMedia = (q) => ({ matches: reduced && q.includes('reduce'), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
    MODULES.length = 0;
    MODULES.push(precip, daytime, weatherfx);
    HTMLCanvasElement.prototype.getContext = mkCanvasCtx();
    const layout = buildLayout([{ id: 'new', label: 'Neuheiten', kind: 'new', color: '#f00', itemIds: [] }]);
    dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    document.body.appendChild(dom);
    const scene = new Scene();
    const camera = new PerspectiveCamera();
    camera.position.set(layout.w / 2, 1.65, layout.d + 3);
    const state = { x: layout.w / 2, z: layout.d + 3, yaw: 0, pitch: 0 };
    const app = {
      layout, deps: weather ? { weather } : {}, opts: { debug: true, ...opts }, qualitySetting: qs, phone: false, touch: false, sound, mode: 'play',
      engine: { scene, camera, renderer: { domElement: canvas, toneMappingExposure: 1, ...rend }, get preset() { return { level }; } },
      player: { x: state.x, z: state.z, y: 0, state, eyeY: () => 1.65 },
      getCarried: () => null, setMode() {}, holdview: { isOpen: false }, findSlot: () => null, take() {}, host: dom,
    };
    host = new ModuleHost(app);
    await host.init();
    await flush();
    return { scene, camera, layout, w: host.providers.get('weather') };
  }
  const real = (o) => ({ k: 'clear', i: 0, sd: 0, fog: 0, t: 5, day: 1, ts: 1, stale: 0, ...o });
  const thermoOf = (scene) => scene.getObjectByName('wx-thermo');

  it('Thermometer nur bei echtem Wetter; ohne Quelle oder bei ?rain=1 unsichtbar', async () => {
    const a = await build({ weather: () => Promise.resolve(real({ t: -3 })) });
    expect(thermoOf(a.scene).visible).toBe(true);
    host.hook('dispose'); host = null; dom.remove();
    const b = await build({});
    expect(thermoOf(b.scene).visible).toBe(false);
    host.hook('dispose'); host = null; dom.remove();
    const c = await build({ opts: { rain: true } });
    expect(thermoOf(c.scene).visible).toBe(false);
    host.hook('dispose'); host = null; dom.remove();
    const d = await build({ weather: () => Promise.resolve(null) });
    expect(thermoOf(d.scene).visible).toBe(false);
  });

  it('Thermometer zeichnet nur bei geänderter Temperatur neu (neue Textur)', async () => {
    let v = real({ t: 4 });
    const { scene } = await build({ weather: () => Promise.resolve(v) });
    const t = thermoOf(scene);
    const tex1 = t.material.map;
    expect(tex1).toBeTruthy();
    for (let i = 0; i < 20; i++) host.hook('update', 0.05, i * 0.05);
    expect(t.material.map).toBe(tex1);
    v = real({ t: 4 }); // gleicher Wert nach erneutem Abruf (15 min aktive Zeit)
    host.hook('update', 901, 100);
    await flush();
    expect(t.material.map).toBe(tex1);
    v = real({ t: -1 });
    host.hook('update', 901, 1100);
    await flush();
    expect(t.material.map).not.toBe(tex1);
    expect(t.visible).toBe(true);
  });

  it('Atemwölkchen: nur bei Frost und high/ultra, höchstens 8 Figuren', async () => {
    const mkFig = (x) => ({ disposed: false, root: { visible: true, rotation: { y: 0 } }, faceWorld(o) { return o.set(x, 1.6, 40); } });
    const figs = Array.from({ length: 12 }, (_, i) => ({ kind: 'walker', handle: mkFig(40 + i * 0.3), x: 40 + i * 0.3, z: 40 }));
    const run = async (level, temp) => {
      const { scene, camera } = await build({ weather: () => Promise.resolve(real({ t: temp })), level });
      host.providers.set('areas', { current: () => 'street' });
      host.providers.set('npc', { people: () => figs });
      camera.position.set(40, 1.65, 43);
      for (let i = 0; i < 12; i++) host.hook('update', 0.1, i * 0.1);
      let pts = null;
      scene.traverse((o) => { if (o instanceof Points && o.geometry.attributes.aPh) pts = o; });
      const act = pts ? Array.from(pts.geometry.attributes.aPh.array).filter((p) => p >= 0).length : -1;
      const vis = pts ? pts.visible : null;
      host.hook('dispose'); host = null; dom.remove();
      return { act, vis };
    };
    const hi = await run('high', -2);
    expect(hi.vis).toBe(true);
    expect(hi.act).toBe(8);
    expect((await run('ultra', 0)).vis).toBe(true);
    expect((await run('mid', -2)).vis).toBe(false);
    expect((await run('low', -2)).vis).toBe(false);
    expect((await run('high', 2)).vis).toBe(false);
  });

  it('Atem nutzt die Weltposition der Figur (P12): lokale Höhe in einer Eltern-Gruppe verschiebt den Bereich nicht', async () => {
    const mk = (localY, wx, wz) => ({ disposed: false, root: { visible: true, rotation: { y: 0 }, position: { y: localY }, getWorldPosition(o) { return o.set(wx, 0, wz); } }, faceWorld(o) { return o.set(wx, 1.6, wz); } });
    const { scene, camera, layout } = await build({ weather: () => Promise.resolve(real({ t: -2 })), level: 'high' });
    const inShop = { kind: 'walker', handle: mk(5, layout.w / 2, layout.d - 2), x: layout.w / 2, z: layout.d - 2 }; // Laden: lokal y=5 (Eltern-Gruppe), Welt y=0
    const onStreet = { kind: 'walker', handle: mk(0, layout.w / 2, layout.d + 2), x: layout.w / 2, z: layout.d + 2 };
    host.providers.set('areas', { current: () => 'street' });
    host.providers.set('npc', { people: () => [inShop, onStreet] });
    camera.position.set(layout.w / 2, 1.65, layout.d + 3);
    for (let i = 0; i < 12; i++) host.hook('update', 0.1, i * 0.1);
    let pts = null;
    scene.traverse((o) => { if (o instanceof Points && o.geometry.attributes.aPh) pts = o; });
    const act = Array.from(pts.geometry.attributes.aPh.array).filter((p) => p >= 0).length;
    expect(act).toBe(1); // nur die Figur auf der Straße; die im Laden bleibt ohne Wölkchen
  });

  describe('Vorwärmen nur, was die Stufe zeichnet (P5/P6)', () => {
    afterEach(() => { vi.useRealTimers(); });
    const kind = (o) => {
      if (o.isPoints) return 'breath';
      if (o.name === 'wx-thermo') return 'thermo';
      const m = o.material;
      if (m && typeof m.customProgramCacheKey === 'function' && m.customProgramCacheKey() === 'lfx-drops-trail') return 'drops';
      if (m && m.blending === AdditiveBlending) return 'bolt';
      return 'precip';
    };
    async function warmed(level, { weather, steps = 3 } = {}) {
      vi.useFakeTimers();
      const compiled = [];
      const rend = { compile: (o) => { compiled.push(kind(o)); }, initTexture: vi.fn() };
      const p = build({ weather, level, rend });
      await vi.advanceTimersByTimeAsync(50);
      const r = await p;
      for (let i = 0; i < steps; i++) await vi.advanceTimersByTimeAsync(3000);
      return { compiled, r, rend };
    }
    it('low: Niederschlag, Scheibentropfen und Thermometer (mit Map); weder Blitz noch Atem', async () => {
      const { compiled } = await warmed('low', { weather: () => Promise.resolve(real({ t: -3 })) });
      expect([...compiled].sort()).toEqual(['drops', 'precip', 'thermo']);
    });
    it('mid: zusätzlich der Blitz, aber kein Atem', async () => {
      const { compiled } = await warmed('mid', { weather: () => Promise.resolve(real({ t: -3 })) });
      expect([...compiled].sort()).toEqual(['bolt', 'drops', 'precip', 'thermo']);
    });
    it('high: alles; jedes Objekt genau einmal', async () => {
      const { compiled } = await warmed('high', { weather: () => Promise.resolve(real({ t: -3 })) });
      expect([...compiled].sort()).toEqual(['bolt', 'breath', 'drops', 'precip', 'thermo']);
    });
    it('Thermometer ohne Map (kein echtes Wetter) wird nicht vorgewärmt', async () => {
      const { compiled } = await warmed('high', {});
      expect(compiled).not.toContain('thermo');
      expect(compiled).toContain('breath');
    });
    it('Stufenwechsel low → high wärmt Blitz und Atem nach, ohne etwas doppelt zu kompilieren', async () => {
      const t = await warmed('low', { weather: () => Promise.resolve(real({ t: -3 })) });
      expect(t.compiled).not.toContain('breath');
      host.hook('onQuality', 'high');
      await vi.advanceTimersByTimeAsync(500);
      expect([...t.compiled].sort()).toEqual(['bolt', 'breath', 'drops', 'precip', 'thermo']);
      host.hook('onQuality', 'high');
      await vi.advanceTimersByTimeAsync(500);
      expect(t.compiled.length).toBe(5);
    });
    it('Hülle meldet die gewählte Einstellung an die Ultra-Registry (P9): fest high baut nicht vor, auto schon', async () => {
      for (const [qs, expected] of [['high', 0], ['auto', 1]]) {
        vi.useFakeTimers();
        const p = build({ level: 'high', qs, opts: { ultraOk: true } });
        await vi.advanceTimersByTimeAsync(50);
        await p;
        expect(host.ctx.qualitySetting()).toBe(qs);
        const built = vi.fn(() => ({ object: new Points() }));
        host.providers.get('ultra').register('probe', built);
        await vi.advanceTimersByTimeAsync(500);
        expect(built).toHaveBeenCalledTimes(expected);
        host.hook('dispose'); host = null; dom.remove();
        vi.useRealTimers();
      }
    });
    it('Scheibentropfen: beide Texturen werden mit hochgeladen (Programm lfx-drops-trail)', async () => {
      const t = await warmed('mid', {});
      expect(t.compiled).toContain('drops');
      expect(t.rend.initTexture).toHaveBeenCalled();
    });
  });

  it('Winterkleidung per npc.setWinterAll mit Hysterese (nur wenn der Provider sie kennt)', async () => {
    let temp = 2;
    const { w } = await build({ weather: () => Promise.resolve(real({ t: temp })) });
    const calls = [];
    host.providers.set('npc', { setWinterAll: (on) => calls.push(on) });
    host.hook('update', 0.5, 1); // npc-Provider kam später: wird nachgezogen
    expect(calls).toEqual([true]);
    temp = 5;
    host.hook('update', 901, 1000); await flush();
    expect(w.temp).toBe(5);
    expect(calls).toEqual([true]); // 5 °C: Zustand bleibt (Hysterese)
    temp = 7;
    host.hook('update', 901, 2000); await flush();
    expect(calls).toEqual([true, false]);
    // ohne setWinterAll: kein Fehler
    host.providers.set('npc', {});
    temp = 0;
    host.hook('update', 901, 3000); await flush();
  });

  it('Gewitter: Blitze alle 8 … 25 s, Donner nur bei Ton, ohne reduzierte Bewegung', async () => {
    const run = async ({ reduced, sound }) => {
      const { w } = await build({ opts: { dev: { wx: 'storm' } }, reduced, sound, level: 'mid' });
      const flashes = [];
      w.flash = vi.fn((k) => flashes.push(k));
      const thunder = vi.fn(() => true);
      host.providers.set('sound', { thunder });
      host.providers.set('areas', { current: () => 'street' });
      let first = null;
      for (let t = 0; t < 60; t += 0.05) { host.hook('update', 0.05, t); if (first === null && flashes.some((k) => k > 0)) first = t; }
      const res = { max: Math.max(0, ...flashes), thunder: thunder.mock.calls.length, first, calls: thunder.mock.calls };
      host.hook('dispose'); host = null; dom.remove();
      return res;
    };
    const on = await run({ reduced: false, sound: true });
    expect(on.max).toBeGreaterThan(0.5);
    expect(on.first).toBeGreaterThanOrEqual(8);
    expect(on.first).toBeLessThanOrEqual(25.5);
    expect(on.thunder).toBeGreaterThanOrEqual(2);
    for (const [d, g] of on.calls) { expect(d).toBeGreaterThanOrEqual(0.5); expect(d).toBeLessThanOrEqual(4.1); expect(g).toBeGreaterThan(0); }
    const mute = await run({ reduced: false, sound: false });
    expect(mute.max).toBeGreaterThan(0.5);
    expect(mute.thunder).toBe(0);
    const red = await run({ reduced: true, sound: true });
    expect(red.max).toBe(0); // keine Flacker-Exposure
    expect(red.thunder).toBeGreaterThanOrEqual(2); // Donner bleibt
  });

  it('kein Gewitter bei normalem Regen', async () => {
    const { w } = await build({ opts: { dev: { wx: 'rain' } } });
    const flash = vi.fn();
    w.flash = flash;
    for (let t = 0; t < 40; t += 0.1) host.hook('update', 0.1, t);
    expect(flash).not.toHaveBeenCalled();
  });
});
