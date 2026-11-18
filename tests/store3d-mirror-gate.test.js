// @vitest-environment jsdom
// Spiegel (1.17.0): Gating (Abstand, Zuwendung, Bildausschnitt, Qualität, XR, Bühne), Takt, Hub (höchstens einer live),
// Umschaltung von info.autoReset / shadowMap.autoUpdate, Ebenen der Spiegelkamera, schiefe Near-Ebene.
import { describe, it, expect } from 'vitest';
import { Group, Scene, PerspectiveCamera, Vector3 } from 'three';
import { mirrorGate, mirrorHz, createMirror, liveHub, renderToTarget, MIRROR_RT, LAYER_EGO, LAYER_MIRROR } from '../src/js/store3d/world/mirror.js';

function fakeRenderer() {
  const r = {
    info: { autoReset: true }, shadowMap: { autoUpdate: true }, target: null, log: [],
    getRenderTarget() { return this.target; },
    setRenderTarget(t) { this.target = t; },
    render(scene, cam) {
      this.log.push({
        autoReset: this.info.autoReset, shadow: this.shadowMap.autoUpdate, target: this.target, cam,
        mirrorVisible: scene.getObjectByName('mirror-m') ? scene.getObjectByName('mirror-m').visible : undefined,
      });
    },
  };
  return r;
}

function setup({ quality = 'high', xr = false, store = true, cam = [0, 1.5, 5], look = [0, 1.5, 0], parent = null, maxDist } = {}) {
  const renderer = fakeRenderer();
  const scene = new Scene();
  const camera = new PerspectiveCamera(70, 1.6, 0.05, 120);
  camera.position.set(...cam);
  camera.lookAt(...look);
  camera.updateMatrixWorld(true);
  const state = { quality, xr, store };
  const ctx = { renderer, scene, camera, quality: () => state.quality, xr: { presenting: () => state.xr }, stage: { isStore: () => state.store } };
  const holder = parent || new Group();
  scene.add(holder);
  let t = 1000;
  const mirror = createMirror(ctx, { id: 'm', x: 0, y: 1.5, z: 0, yaw: 0, w: 3, h: 1.5, parent: holder, now: () => t, maxDist });
  return { renderer, scene, camera, state, ctx, mirror, holder, now: () => t, advance: (ms) => { t += ms; } };
}
const run = (s, seconds, dt = 1 / 60) => { const n = Math.round(seconds / dt); for (let i = 0; i < n; i++) { s.advance(dt * 1000); s.mirror.update(dt); } };

describe('Spiegel: reine Funktionen', () => {
  it('mirrorHz: low 0, mid 10, high 20', () => {
    expect([mirrorHz('low'), mirrorHz('mid'), mirrorHz('high'), mirrorHz('x')]).toEqual([0, 10, 20, 0]);
  });

  it('mirrorGate: nur zugewandt, sichtbar, < 8 m, nicht XR, nicht low, Laden-Szene', () => {
    const ok = { quality: 'mid', xr: false, store: true, visible: true, facing: true, dist: 4 };
    expect(mirrorGate(ok)).toBe(true);
    expect(mirrorGate({ ...ok, quality: 'low' })).toBe(false);
    expect(mirrorGate({ ...ok, xr: true })).toBe(false);
    expect(mirrorGate({ ...ok, store: false })).toBe(false);
    expect(mirrorGate({ ...ok, visible: false })).toBe(false);
    expect(mirrorGate({ ...ok, facing: false })).toBe(false);
    expect(mirrorGate({ ...ok, dist: 8 })).toBe(false);
    expect(mirrorGate({ ...ok, dist: 7.9 })).toBe(true);
    expect(mirrorGate({ ...ok, dist: 12, maxDist: 14 })).toBe(true);
    expect(mirrorGate({ ...ok, dist: NaN })).toBe(false);
    expect(mirrorGate(null)).toBe(false);
  });

  it('Hub: der nächste Spiegel gewinnt, ein veralteter Besitzer verliert', () => {
    const key = {};
    const h = liveHub(key);
    expect(liveHub(key)).toBe(h);
    expect(h.claim('a', 3, 0)).toBe(true);
    expect(h.claim('b', 3.2, 10)).toBe(false);
    expect(h.claim('b', 1.5, 20)).toBe(true); // deutlich näher
    expect(h.owner()).toBe('b');
    expect(h.claim('a', 3, 30)).toBe(false);
    expect(h.claim('a', 3, 1000)).toBe(true); // b war > 600 ms still
    h.release('a');
    expect(h.owner()).toBe(null);
  });
});

describe('Spiegel: Render', () => {
  it('rendert live im Takt (high 20 Hz, mid 10 Hz) und nur mit RT 256² ohne MSAA', () => {
    const s = setup({ quality: 'high' });
    run(s, 1);
    const high = s.renderer.log.length;
    expect(high).toBeGreaterThanOrEqual(19);
    expect(high).toBeLessThanOrEqual(21);
    const s2 = setup({ quality: 'mid' });
    run(s2, 1);
    expect(s2.renderer.log.length).toBeGreaterThanOrEqual(9);
    expect(s2.renderer.log.length).toBeLessThanOrEqual(11);
    const rt = s.renderer.log[0].target;
    expect(rt.width).toBe(MIRROR_RT);
    expect(rt.height).toBe(MIRROR_RT);
    expect(rt.samples).toBe(0);
    expect(MIRROR_RT).toBe(256);
    expect(s.mirror.isLive()).toBe(true);
    s.mirror.dispose();
    s2.mirror.dispose();
  });

  it('info.autoReset und shadowMap.autoUpdate sind nur während des Renders aus und danach wieder an', () => {
    const s = setup();
    run(s, 0.2);
    expect(s.renderer.log.length).toBeGreaterThan(0);
    for (const l of s.renderer.log) { expect(l.autoReset).toBe(false); expect(l.shadow).toBe(false); }
    expect(s.renderer.info.autoReset).toBe(true);
    expect(s.renderer.shadowMap.autoUpdate).toBe(true);
    expect(s.renderer.target).toBe(null);
  });

  it('renderToTarget stellt den Zustand auch bei einem Fehler im Render wieder her', () => {
    const r = fakeRenderer();
    r.info.autoReset = true;
    const prev = {};
    r.target = prev;
    r.render = () => { throw new Error('boom'); };
    const o = new Group();
    expect(() => renderToTarget(r, new Scene(), new PerspectiveCamera(), {}, [o])).toThrow('boom');
    expect(r.info.autoReset).toBe(true);
    expect(r.shadowMap.autoUpdate).toBe(true);
    expect(r.target).toBe(prev);
    expect(o.visible).toBe(true);
  });

  it('der Spiegel selbst ist beim Render unsichtbar und danach wieder sichtbar', () => {
    const s = setup();
    run(s, 0.2);
    expect(s.renderer.log[0].mirrorVisible).toBe(false);
    expect(s.mirror.mesh.visible).toBe(true);
  });

  it('Spiegelkamera: gespiegelte Position, Layer 0 + 2 (nie 1), schiefe Near-Ebene', () => {
    const s = setup({ cam: [1, 1.5, 5] });
    run(s, 0.2);
    const c = s.renderer.log[0].cam;
    expect(c.position.x).toBeCloseTo(1);
    expect(c.position.z).toBeCloseTo(-5);
    expect(c.layers.isEnabled(0)).toBe(true);
    expect(c.layers.isEnabled(LAYER_MIRROR)).toBe(true);
    expect(c.layers.isEnabled(LAYER_EGO)).toBe(false);
    expect(c.far).toBeLessThanOrEqual(120);
    for (const v of c.projectionMatrix.elements) expect(Number.isFinite(v)).toBe(true);
    // Hauptkamera ist nicht verändert
    expect(s.camera.position.z).toBe(5);
  });

  it('kein Render: abgewandt (Kamera hinter dem Spiegel), zu weit, außerhalb des Bildes, unsichtbare Gruppe', () => {
    const behind = setup({ cam: [0, 1.5, -5], look: [0, 1.5, 0] });
    run(behind, 0.5);
    expect(behind.renderer.log.length).toBe(0);
    const far = setup({ cam: [0, 1.5, 12] });
    run(far, 0.5);
    expect(far.renderer.log.length).toBe(0);
    const away = setup({ cam: [0, 1.5, 5], look: [0, 1.5, 20] });
    run(away, 0.5);
    expect(away.renderer.log.length).toBe(0);
    const hidden = setup();
    hidden.holder.visible = false;
    run(hidden, 0.5);
    expect(hidden.renderer.log.length).toBe(0);
    const farOk = setup({ cam: [0, 1.5, 12], maxDist: 14 });
    run(farOk, 0.5);
    expect(farOk.renderer.log.length).toBeGreaterThan(0);
  });

  it('low, XR und fremde Bühne: matt, nie ein Render, keine RT angelegt', () => {
    for (const o of [{ quality: 'low' }, { xr: true }, { store: false }]) {
      const s = setup(o);
      run(s, 0.5);
      expect(s.renderer.log.length).toBe(0);
      expect(s.mirror.stats().hasTarget).toBe(false);
      expect(s.mirror.isLive()).toBe(false);
    }
  });

  it('Qualitätswechsel auf low schaltet auf matt zurück', () => {
    const s = setup({ quality: 'high' });
    run(s, 0.3);
    expect(s.mirror.isLive()).toBe(true);
    s.state.quality = 'low';
    run(s, 0.1);
    expect(s.mirror.isLive()).toBe(false);
  });

  it('höchstens ein Spiegel gleichzeitig live', () => {
    const s = setup();
    const parent = s.holder;
    const m2 = createMirror(s.ctx, { id: 'n', x: 0.2, y: 1.5, z: 0, yaw: 0, w: 3, h: 1.5, parent, now: s.now });
    // beide sind sichtbar, zugewandt und nah: nur einer rendert
    for (let i = 0; i < 30; i++) { s.advance(16); s.mirror.update(1 / 20); m2.update(1 / 20); }
    expect(s.mirror.stats().renders).toBeGreaterThan(0);
    expect(m2.stats().renders).toBe(0);
  });

  it('setSuppressed schaltet einen Spiegel ab', () => {
    const s = setup();
    run(s, 0.2);
    const n = s.renderer.log.length;
    s.mirror.setSuppressed(true);
    run(s, 0.3);
    expect(s.renderer.log.length).toBe(n);
    expect(s.mirror.isLive()).toBe(false);
    s.mirror.setSuppressed(false);
    run(s, 0.3);
    expect(s.renderer.log.length).toBeGreaterThan(n);
  });

  it('dispose räumt das Mesh und die RT ab', () => {
    const s = setup();
    run(s, 0.2);
    const rt = s.renderer.log[0].target;
    let disposed = false;
    rt.addEventListener('dispose', () => { disposed = true; });
    s.mirror.dispose();
    expect(disposed).toBe(true);
    expect(s.holder.children.length).toBe(0);
    void Vector3;
  });
});
