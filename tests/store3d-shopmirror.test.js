// @vitest-environment jsdom
// Überwachungsspiegel (1.17.0): ein Mesh, Gating (mid/high live, low/XR matt), Takt, Hub, Aufräumen, Lage in der Ladenecke.
import { describe, it, expect } from 'vitest';
import { Group, Scene, PerspectiveCamera } from 'three';
import shopmirror, { domeSpot, domeGeometry, DOME_MAX_DIST } from '../src/js/store3d/modules/shopmirror.js';
import { liveHub } from '../src/js/store3d/world/mirror.js';
import { layoutOf } from './helpers-city.js';

function setup({ quality = 'high', xr = false, cam = null } = {}) {
  const L = layoutOf(80);
  const providers = new Map();
  const log = [];
  const renderer = {
    info: { autoReset: true }, shadowMap: { autoUpdate: true }, target: null,
    getRenderTarget() { return this.target; }, setRenderTarget(t) { this.target = t; },
    render(scene, c) { log.push({ autoReset: this.info.autoReset, cam: c, target: this.target }); },
  };
  const scene = new Scene();
  const camera = new PerspectiveCamera(70, 1.6, 0.05, 120);
  const sp = domeSpot(L);
  const p = cam || [L.w / 2 + 2, 1.6, L.d - 6];
  camera.position.set(...p);
  camera.lookAt(sp.pos.x, sp.pos.y, sp.pos.z);
  camera.updateMatrixWorld(true);
  const state = { quality, xr };
  const ctx = {
    layout: L, scene, camera, renderer, quality: () => state.quality, xr: { presenting: () => state.xr },
    track: (o) => o, provide: (n, impl) => { providers.set(n, impl); return () => providers.delete(n); }, use: (n) => providers.get(n),
  };
  return { ctx, L, log, state, scene, camera, renderer, providers };
}
const run = (h, sec, dt = 1 / 60) => { for (let i = 0; i < Math.round(sec / dt); i++) h.update(dt); };

describe('Modul shopmirror', () => {
  it('liefert einen leeren Provider, ein Mesh (1 Draw-Call) in der Gruppe m3-shopmirror', () => {
    const t = setup();
    const h = shopmirror.init(t.ctx);
    expect(t.providers.get('shopmirror')).toEqual({});
    const g = t.scene.getObjectByName('m3-shopmirror');
    expect(g).toBeTruthy();
    let meshes = 0;
    g.traverse((o) => { if (o.isMesh) meshes++; });
    expect(meshes).toBe(1);
    h.dispose();
    expect(t.scene.getObjectByName('m3-shopmirror')).toBeUndefined();
    expect(t.providers.has('shopmirror')).toBe(false);
  });

  it('Kuppel sitzt über der Eingangstür unter der Decke, Blickziel im Laden', () => {
    const t = setup();
    const s = domeSpot(t.L);
    expect(s.pos.x).toBeCloseTo(t.L.w / 2);
    expect(s.pos.z).toBeGreaterThan(t.L.d - 1);
    expect(s.pos.z).toBeLessThan(t.L.d);
    expect(s.pos.y).toBeGreaterThan(2.4);
    // über der Türöffnung (Tür ≤ 2,4 m hoch), Kuppelunterkante frei von der Öffnung
    expect(s.pos.y - 0.17).toBeGreaterThan(2.4);
    // liegt in keinem der Vollwand-Räume (Ab-18-Raum / Kinder-Ecke) der Nordseite
    for (const room of [t.L.adultRoom, t.L.kidsRoom]) if (room) expect(s.pos.z > room.z1 || s.pos.x < room.x0 || s.pos.x > room.x1).toBe(true);
    expect(s.pos.y).toBeLessThan(t.L.ceilH);
    expect(s.target.x).toBeGreaterThan(0);
    expect(s.target.x).toBeLessThan(t.L.w);
    expect(s.target.z).toBeGreaterThan(1);
  });

  it('Geometrie: Kuppel + Ring + Stange in einem Buffer mit aMir-Marker', () => {
    const g = domeGeometry();
    expect(g.attributes.aMir).toBeTruthy();
    expect(g.attributes.color).toBeTruthy();
    const a = g.attributes.aMir.array;
    expect(a.some((v) => v === 1)).toBe(true);
    expect(a.some((v) => v === 0)).toBe(true);
    g.dispose();
  });

  it('high: live im 20-Hz-Takt, mid: 10 Hz; Renderer-Zustand bleibt danach unverändert', () => {
    const t = setup({ quality: 'high' });
    const h = shopmirror.init(t.ctx);
    run(h, 1);
    expect(t.log.length).toBeGreaterThanOrEqual(19);
    expect(t.log.length).toBeLessThanOrEqual(21);
    expect(t.log.every((l) => l.autoReset === false)).toBe(true);
    expect(t.renderer.info.autoReset).toBe(true);
    expect(h.stats().live).toBe(true);
    // Weitwinkel ~110°, Layer 0 + 2
    const c = t.log[0].cam;
    expect(c.fov).toBe(110);
    expect(c.layers.isEnabled(2)).toBe(true);
    expect(c.layers.isEnabled(1)).toBe(false);
    expect(t.log[0].target.width).toBe(256);
    h.dispose();
    const m = setup({ quality: 'mid' });
    const h2 = shopmirror.init(m.ctx);
    run(h2, 1);
    expect(m.log.length).toBeGreaterThanOrEqual(9);
    expect(m.log.length).toBeLessThanOrEqual(11);
    h2.dispose();
  });

  it('low und XR: matt, kein Render, keine RT', () => {
    for (const o of [{ quality: 'low' }, { xr: true }]) {
      const t = setup(o);
      const h = shopmirror.init(t.ctx);
      run(h, 0.5);
      expect(t.log.length).toBe(0);
      expect(h.stats().hasTarget).toBe(false);
      expect(h.stats().live).toBe(false);
      h.dispose();
    }
  });

  it('zu weit weg oder unsichtbar (ausgeblendete Ladenhülle): kein Render', () => {
    const far = setup({ cam: [-30, 1.6, 40] });
    const h = shopmirror.init(far.ctx);
    run(h, 0.5);
    expect(far.log.length).toBe(0);
    h.dispose();
    const t = setup();
    const h2 = shopmirror.init(t.ctx);
    const shell = new Group();
    shell.add(t.scene.getObjectByName('m3-shopmirror')); // wie city.partition(): Gruppe wandert in die Ladenhülle
    t.scene.add(shell);
    shell.visible = false;
    run(h2, 0.5);
    expect(t.log.length).toBe(0);
    shell.visible = true;
    run(h2, 0.5);
    expect(t.log.length).toBeGreaterThan(0);
    h2.dispose();
    expect(DOME_MAX_DIST).toBeGreaterThanOrEqual(8);
  });

  it('teilt den Hub: ist ein anderer Spiegel deutlich näher live, rendert die Kuppel nicht', () => {
    const t = setup();
    const h = shopmirror.init(t.ctx);
    const hub = liveHub(t.renderer);
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    hub.claim('anderer', 0.5, now + 1e6); // „jetzt“ weit voraus: Besitz bleibt frisch
    run(h, 0.5);
    expect(t.log.length).toBe(0);
    h.dispose();
  });
});
