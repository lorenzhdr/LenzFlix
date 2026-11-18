// @vitest-environment jsdom
// VR-Sitzung: Qualität „Automatisch“ nach VR, Panel-Versatz im Sichtfeld, VR-Knopf nur im Laufmodus.
import { describe, it, expect, vi } from 'vitest';
import { Object3D, Group } from 'three';

vi.mock('../src/js/store3d/world/textures.js', () => {
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  return { FONT: 'x', makeCanvas: (w, h) => ({ width: w, height: h, getContext: () => ctx }) };
});
vi.mock('../src/js/store3d/covers/loader.js', () => ({ loadBitmap: async () => null, closeBitmap() {} }));
vi.mock('../src/js/store3d/xr/fade.js', () => ({ createFade: () => ({ dispose() {} }) }));

const { XrMode } = await import('../src/js/store3d/xr/mode.js');
const { StoreApp } = await import('../src/js/store3d/store.js');
const { HoldView } = await import('../src/js/store3d/ui/holdview.js');

describe('Qualität auto nach VR', () => {
  it('stellt nach dem Sitzungsende die vorher automatisch gewählte Stufe wieder her', () => {
    const engine = {
      preset: { level: 'low' }, budget: false,
      setXrBudget(on) { this.budget = on; this.setLevel(this.preset.level); },
      setLevel(l) { this.preset = { level: this.budget && l === 'high' ? 'mid' : l }; return this.preset; },
      setZoom() {}, setFoveation() {}, rig: null, camera: {},
    };
    const app = {
      engine, qualitySetting: 'auto', opts: { vr: {} }, mode: 'play', player: { cancelPath() {}, vx: 0, vz: 0, moved: 0 },
      clearAim() {}, setMode() {}, syncUi() {}, suspended: true, disposed: false, mods: null,
      setQuality(q) {
        this.qualitySetting = q;
        engine.setLevel(q === 'auto' ? engine.preset.level : q);
      },
    };
    const m = Object.create(XrMode.prototype);
    Object.assign(m, { app, afterEnd: [], bubbles: new Set(), panels: new Set(), cinema: { active: false }, session: { exit() {} }, disposed: false, input: {}, loco: {}, setupXr() {}, report() {}, closePanels() {}, teardownXr() {} });
    m.onSessionStart({ floor: true });
    expect(engine.preset.level).toBe('mid');
    m.onSessionEnd();
    expect(app.qualitySetting).toBe('auto');
    expect(engine.preset.level).toBe('low');
  });
});

describe('Hüllen-Panel im Sichtfeld', () => {
  it('äußere Panelkante liegt innerhalb von ±41,6° (Emulator-FOV)', () => {
    const panels = [];
    const hv = new HoldView({
      host: document.createElement('div'), camera: Object.assign(new Group(), { aspect: 1.6 }),
      items: new Map([['m1', { Id: 'm1', Name: 'Film', Type: 'Movie', lfx: { media: 'dvd' } }]]),
      layout: null, covers: null, shelves: { setHidden() {}, faceViews: [] },
      deps: { imageUrl: () => '', getItem: async () => null, toast() {}, play: async () => {}, getSeasons: async () => [], getEpisodes: async () => [] },
      notify() {}, onClosed() {},
      openPanel: (spec) => { const h = { spec, mesh: new Object3D(), update() {}, close() {} }; panels.push(h); return h; },
    });
    hv.open('m1', null, true, { xr: true, anchor: new Object3D(), hand: 'right' });
    const s = panels[0].spec;
    const { x, z } = s.anchor.offset;
    const w = s.width || 0.55;
    const deg = (r) => (r * 180) / Math.PI;
    const outer = deg(Math.atan2(Math.abs(x), z)) + deg(Math.atan2(w / 2, Math.hypot(x, z)));
    expect(outer).toBeLessThan(41.6);
    hv.dispose(true);
  });
});

describe('VR-Knopf nur im Laufmodus', () => {
  it('syncUi zeigt „In VR betreten“ im Haltemodus nicht (Halte-Ebene fängt das Tippen)', () => {
    const calls = [];
    const hud = { setCross() {}, showPrompt() {}, showMenuBtn() {}, showViewBtn() {}, showVr: (v) => calls.push(v), setHint() {} };
    const xr = { supported: true, presenting: false };
    const app = Object.create(StoreApp.prototype);
    Object.assign(app, { hud, xr, ready: true, suspended: false, aim: null, mode: 'play' });
    app.syncUi();
    app.mode = 'hold';
    app.syncUi();
    expect(calls).toEqual([true, false]);
  });
});
