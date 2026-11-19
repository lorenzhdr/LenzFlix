// @vitest-environment jsdom
// Warm-Zeichnen (engine/warm.js createWarmDraw, 1.19.0): Zustand exakt zurück, Häppchen, Dedupe, Stufen-/XR-Sperre, Abbruch.
import { describe, it, expect, vi } from 'vitest';
import { createWarmDraw, warmKey, WARM_LAYER } from '../src/js/store3d/engine/warm.js';

const BIT = 1 << WARM_LAYER;
let uid = 0;
function obj(name, { visible = true, mat = 'm' + ++uid, light = false, mesh = true, attrs = ['position'] } = {}) {
  const o = { name, visible, layers: { mask: 1 }, frustumCulled: true, children: [], isLight: light, isMesh: mesh && !light };
  if (o.isMesh) { o.material = { uuid: mat }; o.geometry = { attributes: Object.fromEntries(attrs.map((a) => [a, 1])) }; }
  return o;
}
function setup(over = {}) {
  const scene = obj('scene', { mesh: false });
  const grp = obj('grp', { mesh: false });
  const lamp = obj('lamp', { light: true });
  const a = obj('a'); const b = obj('b'); const same = obj('same', { mat: b.material.uuid });
  const hid = obj('hid', { visible: false });
  grp.children.push(a, b, same, hid);
  scene.children.push(grp, lamp);
  const camera = { layers: { mask: 3 } };
  const calls = [];
  const renderer = {
    info: { autoReset: true }, shadowMap: { autoUpdate: true }, rt: null,
    getRenderTarget() { return this.rt; }, setRenderTarget(t) { this.rt = t; },
    render: vi.fn(function (s, c) {
      calls.push({ rt: this.rt, camMask: c.layers.mask, auto: this.info.autoReset, shadow: this.shadowMap.autoUpdate, a: a.layers.mask, aCull: a.frustumCulled, lamp: lamp.layers.mask });
    }),
  };
  const state = { level: 'high', xr: false, can: true, boost: false, t: 0 };
  const rtObj = { dispose: vi.fn() };
  const ctx = {
    renderer, camera, scene: () => scene, makeRt: vi.fn(() => rtObj), level: () => state.level, xr: () => state.xr, canDraw: () => state.can,
    boost: () => state.boost, now: () => (state.t += 1), ...over,
  };
  return { scene, a, b, same, hid, lamp, camera, renderer, calls, state, ctx, rtObj };
}

describe('createWarmDraw', () => {
  it('Dedupe: gleiche Material-/Attribut-Schlüssel nur einmal, unsichtbare nie; Ziel-Target dann Hauptbild', () => {
    const s = setup();
    const w = createWarmDraw(s.ctx);
    w.step();
    expect(w.state().done).toBe(true);
    expect(w.state().keys).toBe(2); // a, b (same teilt den Schlüssel mit b), hid unsichtbar
    expect(s.ctx.makeRt).toHaveBeenCalledWith(16);
    expect(s.calls.length % 2).toBe(0);
    expect(s.calls[0].rt).toBe(s.rtObj);
    expect(s.calls[1].rt).toBe(null);
    expect(warmKey(s.b)).toBe(warmKey(s.same));
  });

  it('Zustand während des Zeichnens: Hilfsebene, Culling aus, autoReset/autoUpdate aus; danach exakt wie vorher', () => {
    const s = setup();
    const w = createWarmDraw(s.ctx);
    w.step();
    const c = s.calls[0];
    expect(c.camMask).toBe(BIT);
    expect(c.a & BIT).toBe(BIT);
    expect(c.aCull).toBe(false);
    expect(c.lamp & BIT).toBe(BIT);
    expect(c.auto).toBe(false);
    expect(c.shadow).toBe(false);
    expect(s.camera.layers.mask).toBe(3);
    expect(s.a.layers.mask).toBe(1);
    expect(s.a.frustumCulled).toBe(true);
    expect(s.lamp.layers.mask).toBe(1);
    expect(s.renderer.info.autoReset).toBe(true);
    expect(s.renderer.shadowMap.autoUpdate).toBe(true);
    expect(s.renderer.rt).toBe(null);
    expect(s.hid.visible).toBe(false);
  });

  it('Fehler im Render: Zustand wird trotzdem zurückgesetzt, danach Ruhe', () => {
    const s = setup();
    s.renderer.render = vi.fn(() => { throw new Error('boom'); });
    const w = createWarmDraw(s.ctx);
    w.step();
    expect(w.state().failed).toBe(true);
    expect(s.camera.layers.mask).toBe(3);
    expect(s.a.layers.mask).toBe(1);
    expect(s.renderer.info.autoReset).toBe(true);
    const n = s.renderer.render.mock.calls.length;
    w.step();
    expect(s.renderer.render.mock.calls.length).toBe(n);
  });

  it('Häppchen-Budget: bei knappem Budget verteilt sich die Arbeit auf mehrere Schritte', () => {
    const s = setup({ budgetMs: 1 });
    for (let i = 0; i < 6; i++) s.scene.children[0].children.push(obj('x' + i));
    const w = createWarmDraw(s.ctx); // now() zählt je Aufruf +1 ms: jedes Häppchen sprengt das Budget
    w.step();
    expect(w.state().done).toBe(false);
    expect(w.state().pending).toBeGreaterThan(0);
    let n = 0;
    while (!w.state().done && n++ < 50) w.step();
    expect(w.state().done).toBe(true);
    expect(w.state().keys).toBe(8);
    expect(w.state().chunks).toBeGreaterThan(2);
  });

  it('Häppchengröße: im Spiel höchstens 2 Vertreter je Pass, im Boost mehr; wächst nicht bei neuen Programmen', () => {
    const run = (boost, progs) => {
      const s = setup({ budgetMs: 1e6, boostMs: 1e6 });
      for (let i = 0; i < 30; i++) s.scene.children[0].children.push(obj('x' + i));
      s.state.boost = boost;
      const counts = [];
      let n = 0;
      s.renderer.info.programs = [];
      s.renderer.render = vi.fn(() => {
        let c = 0;
        const walk = (o) => { if ((o.layers.mask & BIT) && o.isMesh) c++; o.children.forEach(walk); };
        walk(s.scene);
        counts.push(c);
        if (progs && s.renderer.info.programs.length < 1000) s.renderer.info.programs.push(n++);
      });
      createWarmDraw(s.ctx).step();
      return Math.max(...counts);
    };
    expect(run(false, false)).toBeLessThanOrEqual(2);
    expect(run(true, false)).toBeGreaterThan(2);
    expect(run(true, true)).toBeLessThanOrEqual(2); // jedes Häppchen erzeugt ein neues Programm: bleibt bei 1-2
  });

  it('Boost nutzt das größere Budget (mehr in einem Schritt)', () => {
    const mk = (boost) => {
      const s = setup({ budgetMs: 4, boostMs: 400 });
      for (let i = 0; i < 10; i++) s.scene.children[0].children.push(obj('x' + i));
      s.state.boost = boost;
      const w = createWarmDraw(s.ctx);
      w.step();
      return w.state().pending;
    };
    expect(mk(true)).toBeLessThan(mk(false));
  });

  it('nur high/ultra, nie in XR, nicht ohne canDraw, nicht bei fehlenden Schatten', () => {
    for (const patch of [{ level: 'low' }, { level: 'mid' }, { xr: true }, { can: false }]) {
      const s = setup();
      Object.assign(s.state, patch);
      const w = createWarmDraw(s.ctx);
      w.step();
      expect(s.renderer.render).not.toHaveBeenCalled();
    }
    const s = setup({ shadowsReady: () => false });
    createWarmDraw(s.ctx).step();
    expect(s.renderer.render).not.toHaveBeenCalled();
    const u = setup();
    u.state.level = 'ultra';
    createWarmDraw(u.ctx).step();
    expect(u.renderer.render).toHaveBeenCalled();
  });

  it('Stufenwechsel: nur Neues wird nachgeholt', () => {
    const s = setup();
    const w = createWarmDraw(s.ctx);
    w.step();
    const n = s.renderer.render.mock.calls.length;
    s.state.level = 'ultra';
    s.hid.visible = true; // erst auf Ultra sichtbar
    w.step();
    expect(w.state().keys).toBe(3);
    expect(s.renderer.render.mock.calls.length).toBe(n + 2);
    s.state.level = 'high';
    w.step();
    expect(s.renderer.render.mock.calls.length).toBe(n + 2);
  });

  it('Wurzelgruppen (ctx.roots): nach Bereich ausgeblendete Gruppe wird vorgewärmt, Sichtbarkeit danach exakt wie vorher', () => {
    const s = setup();
    const room = obj('room', { mesh: false, visible: false });
    const wall = obj('wall');
    room.children.push(wall);
    s.scene.children.push(room);
    const seen = [];
    s.renderer.render = vi.fn(() => { seen.push(room.visible); });
    const w = createWarmDraw({ ...s.ctx, roots: () => [room] });
    w.step();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.some((v) => v === true)).toBe(true);
    expect(room.visible).toBe(false);
    expect(w.state().keys).toBe(3);
    // ohne roots bleibt die ausgeblendete Gruppe unberührt
    const s2 = setup();
    const room2 = obj('room', { mesh: false, visible: false });
    room2.children.push(obj('wall'));
    s2.scene.children.push(room2);
    const w2 = createWarmDraw(s2.ctx);
    w2.step();
    expect(w2.state().keys).toBe(2);
  });

  it('busy: vor dem ersten Durchlauf und bei offener Warteschlange wahr, danach falsch; low/XR/dispose nie', () => {
    const s = setup({ budgetMs: 1 });
    for (let i = 0; i < 4; i++) s.scene.children[0].children.push(obj('x' + i));
    const w = createWarmDraw(s.ctx);
    expect(w.busy()).toBe(true);
    w.step();
    expect(w.busy()).toBe(true); // Budget knapp: Rest offen
    let n = 0;
    while (w.busy() && n++ < 50) w.step();
    expect(w.state().done).toBe(true);
    expect(w.busy()).toBe(false);
    s.state.level = 'low';
    expect(w.busy()).toBe(false);
    const x = setup();
    const w2 = createWarmDraw(x.ctx);
    x.state.xr = true;
    expect(w2.busy()).toBe(false);
    x.state.xr = false;
    w2.dispose();
    expect(w2.busy()).toBe(false);
  });

  it('dispose: Target freigeben, danach kein Zeichnen mehr', () => {
    const s = setup();
    const w = createWarmDraw(s.ctx);
    w.step();
    const n = s.renderer.render.mock.calls.length;
    w.dispose();
    expect(s.rtObj.dispose).toHaveBeenCalled();
    s.state.level = 'ultra';
    s.hid.visible = true;
    w.step();
    expect(s.renderer.render.mock.calls.length).toBe(n);
  });

  it('Memo: unveränderte Szene baut beim Rescan keine Schlüssel neu; Materialtausch/Geometrie/Flag → neuer Vertreter', () => {
    const s = setup({ rescanMs: 10 });
    const w = createWarmDraw(s.ctx);
    w.step();
    const built = w.state().keyBuilds;
    expect(built).toBeGreaterThan(0);
    s.state.t += 100;
    w.step(); // Rescan, nichts geändert
    expect(w.state().keyBuilds).toBe(built);
    expect(w.state().scanMs).toBeGreaterThanOrEqual(0);
    s.a.material = { uuid: 'neu-a' };
    s.state.t += 100;
    w.step();
    expect(w.state().keyBuilds).toBe(built + 1);
    expect(w.state().keys).toBe(3);
    s.b.receiveShadow = true;
    s.state.t += 100;
    w.step();
    expect(w.state().keyBuilds).toBeGreaterThanOrEqual(built + 2);
    s.same.material = [{ uuid: 'x1' }, { uuid: 'x2' }];
    s.state.t += 100;
    w.step();
    const b2 = w.state().keyBuilds;
    s.state.t += 100;
    w.step();
    expect(w.state().keyBuilds).toBe(b2); // Material-Array unverändert: Memo greift
  });
});

describe('StoreApp Gerätesperre (ultraOk)', () => {
  it('ultraOk false: stepWarmDraw legt nichts an, warmHold hält nie, auch auf high', async () => {
    const { StoreApp } = await import('../src/js/store3d/store.js');
    const self = { engine: { preset: { level: 'high' }, renderer: {}, camera: {} }, disposed: false, suspended: false, ultraOk: false, warmDraw: null };
    StoreApp.prototype.stepWarmDraw.call(self);
    expect(self.warmDraw).toBe(null);
    const busy = { busy: () => true };
    expect(StoreApp.prototype.warmHold.call({ ultraOk: false, warmDraw: busy }, 0)).toBe(false);
    expect(StoreApp.prototype.warmHold.call({ ultraOk: true, warmDraw: busy }, 0)).toBe(true);
  });
});
