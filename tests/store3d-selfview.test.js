// @vitest-environment jsdom
// Modul selfview (1.17.0): Ansicht-Modi, Auto-Ego (Overlay, Modul-Kamera, Bühne, VR), Ebenen, reserve, Ego-Beine, Vorschau, Animation, Persistenz.
import { describe, it, expect, vi } from 'vitest';
import { Scene, PerspectiveCamera, Group, Mesh, BoxGeometry, MeshBasicMaterial, Vector3 } from 'three';
import selfview from '../src/js/store3d/modules/selfview.js';

const LAYER = (o) => { let m = -1; o.traverse((c) => { if (c.isMesh || c === o) m = c.layers.mask; }); return m; };
const bit = (n) => 1 << n;

function fakeFigure(look, parent) {
  const root = new Group();
  const mesh = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  root.add(mesh);
  parent.add(root);
  const h = {
    root, mesh, look, ego: false, anims: [], disposed: false,
    setLook: vi.fn((l) => { h.look = l; }),
    setEgo: vi.fn((on) => { h.ego = on; }),
    setAnim: vi.fn((n, o) => { h.anims.push([n, o]); }),
    dispose: vi.fn(() => { h.disposed = true; if (root.parent) root.parent.remove(root); }),
  };
  return h;
}

function setup({ look = { v: 2, id: 'A' }, profile = undefined, withAvatar = true, wall = null } = {}) {
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  const providers = new Map();
  const figures = [];
  const reserves = [];
  const state = { overlay: false, xr: false, studio: false };
  const pose = { x: 10, y: 0, z: 10, yaw: 0, pitch: 0 };
  const net = { a: 0, vx: 0, vz: 0 };
  let rig = null;
  const avCbs = { change: [], preview: [] };
  const av = {
    look: () => look,
    onChange: (fn) => { avCbs.change.push(fn); return () => { avCbs.change.splice(avCbs.change.indexOf(fn), 1); }; },
    onPreview: (fn) => { avCbs.preview.push(fn); return () => { avCbs.preview.splice(avCbs.preview.indexOf(fn), 1); }; },
  };
  if (withAvatar) providers.set('avatar', av);
  providers.set('npc', {
    figure: (o) => { const f = fakeFigure(o.look, o.parent); figures.push(f); return f; },
    reserve: (n, k) => { reserves.push([n, k]); return n; },
  });
  const store = profile || { set: undefined };
  const prof = {
    get: () => ({ v: 1, fig: { act: 0, slots: [null, null, null] }, set: store.set }),
    update: vi.fn((fn) => { const d = { set: store.set }; fn(d); store.set = d.set; }),
    onRemote: vi.fn(() => () => {}),
  };
  const toast = vi.fn();
  const ctx = {
    scene, camera, layout: { cidx: null, colliders: wall ? [wall] : [] }, opts: {}, deps: { profile: prof, toast },
    provide: (n, impl) => { providers.set(n, impl); return () => providers.delete(n); },
    use: (n) => providers.get(n),
    on: () => () => {},
    overlay: { isOpen: () => state.overlay },
    xr: { presenting: () => state.xr },
    stage: { isStore: () => !state.studio },
    player: {
      getPose: () => ({ ...pose }), getNet: () => ({ ...net }), eyeY: () => pose.y + 1.65, isGrounded: () => true,
      camera: { setRig: (fn) => { rig = fn; } },
    },
  };
  const mod = selfview.init(ctx);
  const sv = ctx.use('selfview');
  let camBusy = false;
  /** Ein Frame wie in store.js: Modul-update, dann (ohne Modul-Kamera) das Rig. */
  const frame = (dt = 0.016) => {
    mod.update(dt);
    camera.position.set(pose.x, pose.y + 1.65, pose.z);
    return camBusy ? false : rig && rig(camera, dt);
  };
  const frames = (n, dt) => { for (let i = 0; i < n; i++) frame(dt); };
  return { scene, camera, ctx, mod, sv, pose, net, state, figures, reserves, prof, toast, store, av, avCbs, frame, frames, getRig: () => rig, setCamBusy: (b) => { camBusy = b; } };
}

describe('selfview: Grundzustand', () => {
  it('Ego ist Standard, ohne Look kein Körper', () => {
    const t = setup({ look: null });
    t.frames(3);
    expect(t.sv.mode()).toBe('ego');
    expect(t.sv.figure()).toBeNull();
    expect(t.figures.length).toBe(0);
    t.sv.toggle();
    t.frames(3);
    expect(t.sv.mode()).toBe('ego'); // ohne Figur keine Außenansicht
  });
  it('ohne Provider (npc/avatar/profile) wirft nichts', () => {
    const t = setup();
    t.ctx.deps.profile = null;
    expect(() => { t.frames(2); t.sv.toggle(); t.frames(2); }).not.toThrow();
  });
  it('Layer 1 der Hauptkamera aktiv; dispose löst Rig und Layer', () => {
    const t = setup();
    expect(t.camera.layers.isEnabled(1)).toBe(true);
    expect(t.getRig()).toBeTypeOf('function');
    t.frames(2);
    t.mod.dispose();
    expect(t.camera.layers.isEnabled(1)).toBe(false);
    expect(t.getRig()).toBeNull();
    expect(t.figures[0].disposed).toBe(true);
    expect(t.ctx.use('selfview')).toBeUndefined();
  });
});

describe('selfview: Figur und Ebenen', () => {
  it('Figur hängt an der Szene; Ego: volle Figur auf Layer 2, reserve 0', () => {
    const t = setup();
    t.frames(3);
    const f = t.sv.figure();
    expect(f).toBe(t.figures[0]);
    expect(f.root.parent).toBe(t.scene);
    expect(LAYER(f.root)).toBe(bit(2));
    expect(t.reserves.at(-1)).toEqual([0, 'self']);
    expect(f.root.position.toArray()).toEqual([10, 0, 10]);
  });
  it('Außenansicht: volle Figur auf Layer 0, reserve(2, self), Blob-Schatten in der Szene', () => {
    const t = setup();
    t.frames(3);
    t.sv.toggle();
    t.frames(2);
    expect(t.sv.mode()).toBe('third');
    expect(LAYER(t.sv.figure().root)).toBe(bit(0));
    expect(t.reserves.at(-1)).toEqual([2, 'self']);
    const blob = t.scene.children.find((c) => c.isMesh && c.material.transparent);
    expect(blob).toBeTruthy();
    expect(blob.visible).toBe(true);
    expect(blob.position.y).toBeCloseTo(0.03, 5);
    t.sv.toggle();
    t.frames(2);
    expect(t.sv.mode()).toBe('ego');
    expect(LAYER(t.sv.figure().root)).toBe(bit(2));
    expect(t.reserves.at(-1)).toEqual([0, 'self']);
    expect(blob.visible).toBe(false);
  });
  it('Ego-Beine: erst beim Blick nach unten (Layer 1, setEgo), sonst unsichtbar (0 Draw-Calls)', () => {
    const t = setup();
    t.frames(3);
    expect(t.figures.length).toBe(1); // kein Ego-Körper beim Geradeausblick
    t.pose.pitch = -0.9;
    t.frames(2);
    expect(t.figures.length).toBe(2);
    const ego = t.figures[1];
    expect(ego.setEgo).toHaveBeenCalledWith(true);
    expect(LAYER(ego.root)).toBe(bit(1));
    expect(ego.root.visible).toBe(true);
    t.pose.pitch = -0.45; // Hysterese: bleibt sichtbar
    t.frames(1);
    expect(ego.root.visible).toBe(true);
    t.pose.pitch = 0;
    t.frames(1);
    expect(ego.root.visible).toBe(false);
  });
  it('Ego-Körper nie in der Außenansicht oder bei Modul-Kamera', () => {
    const t = setup();
    t.frames(2);
    t.pose.pitch = -0.9;
    t.frames(2);
    const ego = t.figures[1];
    expect(ego.root.visible).toBe(true);
    t.setCamBusy(true);
    t.frames(3);
    expect(ego.root.visible).toBe(false);
    expect(t.sv.figure().root.visible).toBe(true); // volle Figur (Layer 2) läuft weiter
  });
});

describe('selfview: Auto-Ego', () => {
  async function third(t) {
    t.frames(3);
    t.sv.toggle();
    t.frames(2);
    expect(t.sv.mode()).toBe('third');
  }
  it('Overlay offen → Ego, danach zurück zur Wahl', async () => {
    const t = setup();
    await third(t);
    t.state.overlay = true;
    t.frames(2);
    expect(t.sv.mode()).toBe('ego');
    expect(t.reserves.at(-1)).toEqual([0, 'self']);
    t.state.overlay = false;
    t.frames(2);
    expect(t.sv.mode()).toBe('third');
  });
  it('Modul-Kamera (Rig lief nicht) → Ego, danach zurück', async () => {
    const t = setup();
    await third(t);
    t.setCamBusy(true);
    t.frames(3);
    expect(t.sv.mode()).toBe('ego');
    t.setCamBusy(false);
    t.frames(3);
    expect(t.sv.mode()).toBe('third');
  });
  it('VR → Ego, Figur unsichtbar, Schalten ohne Wirkung', async () => {
    const t = setup();
    await third(t);
    t.state.xr = true;
    t.frames(2);
    expect(t.sv.mode()).toBe('ego');
    expect(t.sv.figure().root.visible).toBe(false);
    t.sv.toggle();
    t.frames(2);
    expect(t.sv.mode()).toBe('ego');
    t.state.xr = false;
    t.frames(30); // Kamera fährt wieder aus, dann ist die Figur zu sehen
    expect(t.sv.mode()).toBe('third');
    expect(t.sv.figure().root.visible).toBe(true);
  });
  it('andere Bühne (Studio) → Ego', async () => {
    const t = setup();
    await third(t);
    t.state.studio = true;
    t.frames(2);
    expect(t.sv.mode()).toBe('ego');
  });
});

describe('selfview: Kamera-Rig', () => {
  it('Außenansicht: Kamera hinter dem Auge, fährt in ~0,25 s aus, Rig meldet true', () => {
    const t = setup();
    t.frames(3);
    t.sv.toggle();
    t.mod.update(0.016);
    const ok = t.getRig()(t.camera, 0.016);
    expect(ok).toBe(true);
    expect(t.camera.position.z - 11.65).toBeLessThan(0); // noch fast am Auge (z 10)
    for (let i = 0; i < 20; i++) t.frame(0.016);
    expect(t.camera.position.z).toBeCloseTo(12.4, 2);
    expect(t.camera.position.y).toBeCloseTo(1.95, 2);
  });
  it('Wand hinter dem Spieler: Kamera eingezogen, unter 0,7 m ohne eigene Figur', () => {
    const t = setup({ wall: { x0: 0, z0: 10.5, x1: 20, z1: 11, y1: 3 } });
    t.frames(3);
    t.sv.toggle();
    t.frames(30);
    expect(t.camera.position.z).toBeLessThan(10.5);
    const d = t.camera.position.distanceTo(new Vector3(10, 1.65, 10));
    expect(d).toBeLessThan(0.7);
    expect(t.sv.figure().root.visible).toBe(false);
  });
  it('eye(): Ego = Kamera, Außenansicht = Auge der Figur (nicht die Kamera)', () => {
    const t = setup();
    t.frames(3);
    t.camera.position.set(1, 2, 3);
    expect(t.sv.eye(new Vector3()).toArray()).toEqual([1, 2, 3]);
    t.sv.toggle();
    t.frames(30);
    expect(t.sv.eye(new Vector3()).toArray()).toEqual([10, 1.65, 10]);
  });
});

describe('selfview: Persistenz', () => {
  it('Wahl wird in set.cam gespeichert, beim Start gelesen', () => {
    const t = setup();
    t.frames(3);
    t.sv.toggle();
    expect(t.store.set.cam).toBe('third');
    expect(t.toast).toHaveBeenCalled();
    t.sv.setMode('ego');
    expect(t.store.set.cam).toBe('ego');
    t.sv.setMode('quatsch');
    expect(t.store.set.cam).toBe('ego');
    const t2 = setup({ profile: { set: { cam: 'third', t: 1 } } });
    t2.frames(4);
    expect(t2.sv.mode()).toBe('third');
  });
});

describe('selfview: Look, Vorschau, Animation', () => {
  it('avatar.onChange → setLook; onPreview zeigt Vorschau und kehrt bei null zurück', () => {
    const t = setup();
    t.frames(3);
    const f = t.sv.figure();
    const b = { v: 2, id: 'B' };
    t.avCbs.change.forEach((fn) => fn(b, [2]));
    expect(f.setLook).toHaveBeenLastCalledWith(b);
    const prev = { v: 2, id: 'P' };
    t.avCbs.preview.forEach((fn) => fn(prev));
    expect(f.setLook).toHaveBeenLastCalledWith(prev);
    t.avCbs.preview.forEach((fn) => fn(null));
    expect(f.setLook).toHaveBeenLastCalledWith(b);
  });
  it('Animation aus dem Körperzustand: Gehen, Rennen; Sitzen per playAnim bis Loslaufen', () => {
    const t = setup();
    t.frames(2);
    t.net.a = 1; t.net.vx = 2;
    t.frames(1);
    const f = t.sv.figure();
    expect(f.anims.at(-1)[0]).toBe('walk');
    t.net.a = 2; t.net.vx = 5;
    t.frames(1);
    expect(f.anims.at(-1)[0]).toBe('run');
    t.net.a = 0; t.net.vx = 0;
    t.frames(1);
    expect(f.anims.at(-1)[0]).toBe('idle');
    t.sv.playAnim('sit');
    t.frames(2);
    expect(f.anims.at(-1)[0]).toBe('sit');
    t.net.a = 1; t.net.vx = 2;
    t.frames(1);
    expect(f.anims.at(-1)[0]).toBe('walk'); // Loslaufen beendet das Sitzen
    t.sv.playAnim('sit');
    t.frames(1);
    t.sv.playAnim(null);
    t.net.a = 0; t.net.vx = 0;
    t.frames(1);
    expect(f.anims.at(-1)[0]).toBe('idle');
  });
  it('Einmal-Animation (wave) wird nicht sofort überschrieben', () => {
    const t = setup();
    t.frames(2);
    const f = t.sv.figure();
    f.anims.length = 0;
    t.sv.playAnim('wave');
    t.frames(5);
    expect(f.anims.filter((a) => a[0] === 'idle').length).toBe(0);
    expect(f.anims.some((a) => a[0] === 'wave')).toBe(true);
  });
});
