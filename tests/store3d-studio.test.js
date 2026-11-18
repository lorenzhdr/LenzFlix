// @vitest-environment jsdom
// Foto-Studio (1.17.0): eigene Szene, wenige Draw-Calls, Kamera-Posen, Porträt 256×256 (Renderer gemockt – jsdom hat kein WebGL).
import { describe, it, expect, afterEach, vi } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { createStudio, PORTRAIT_SIZE, PORTRAIT_CACHE_MAX, STUDIO_FOCUS } from '../src/js/store3d/char/studio.js';
import { disposeFigureCaches } from '../src/js/store3d/npc/figure.js';

const look = (n = 0, over = {}) => ({
  v: 2, skin: [0.9, 0.7, 0.55], height: 1, build: 1, shape: 'straight', hairStyle: 'short', hair: [0.2, 0.1, 0.1], eyes: 'dot', brows: 'none', beard: 'none',
  top: { cut: 'tee', color: [(n % 256) / 255, Math.floor(n / 256) / 255, 0.5], pattern: 'plain', color2: [1, 1, 1] },
  bottom: { cut: 'jeans', color: [0.1, 0.2, 0.3], pattern: 'plain', color2: [1, 1, 0] },
  shoes: { model: 'sneaker', color: [0.1, 0.1, 0.1], sole: [1, 1, 1] }, glasses: 'none', hat: { id: 'none', color: [1, 0, 0] }, bag: { id: 'none', color: [0, 0, 1] },
  handItem: null, ...over,
});
const mockRenderer = () => {
  const rt0 = { fake: true };
  const r = {
    cur: rt0,
    rt0,
    getRenderTarget: vi.fn(() => r.cur),
    setRenderTarget: vi.fn((t) => { r.cur = t; }),
    render: vi.fn(),
    readRenderTargetPixels: vi.fn((rt, x, y, w, h, buf) => { buf.fill(200); }),
  };
  return r;
};
const drawCalls = (scene) => { let n = 0; scene.traverse((o) => { if ((o.isMesh || o.isSkinnedMesh) && o.visible) n++; }); return n; };

afterEach(() => disposeFigureCaches());

describe('Studio: Szene', () => {
  it('baut eine eigene Szene ohne Nebel mit wenigen Draw-Calls und zwei Lichtern', () => {
    const s = createStudio();
    s.figure(look(1));
    expect(s.scene.fog).toBeNull();
    expect(drawCalls(s.scene)).toBeLessThanOrEqual(8);
    let lights = 0;
    s.scene.traverse((o) => { if (o.isLight) lights++; });
    expect(lights).toBe(2);
    let skinned = 0;
    s.scene.traverse((o) => { if (o.isSkinnedMesh) skinned++; });
    expect(skinned).toBe(1);
    s.dispose();
  });

  it('figure()/setLook() tauschen nur den Look (gleiche Figur, Position 0,0,0), rotate/setYaw drehen', () => {
    const s = createStudio();
    const f = s.figure(look(1));
    expect(f.root.position.toArray()).toEqual([0, 0, 0]);
    const bones = f.mesh.skeleton.bones.slice();
    s.setLook(look(2, { hairStyle: 'afro' }));
    expect(s.figure(look(3))).toBe(f);
    expect(f.mesh.skeleton.bones.every((b, i) => b === bones[i])).toBe(true);
    s.rotate(0.5);
    s.rotate(0.25);
    expect(f.root.rotation.y).toBeCloseTo(0.75);
    s.setYaw(-1);
    expect(s.getYaw()).toBe(-1);
    expect(f.root.rotation.y).toBe(-1);
    s.update(0.05);
    s.dispose();
  });

  it('cameraPose: gültige Posen für alle Fokusse, Gesicht näher als Körper, Hut hebt die Haar-Pose', () => {
    const s = createStudio();
    s.figure(look(1));
    const dist = (p) => Math.hypot(p.pos[0] - p.look[0], p.pos[1] - p.look[1], p.pos[2] - p.look[2]);
    for (const f of [...STUDIO_FOCUS, 'unbekannt']) {
      const p = s.cameraPose(f);
      expect(p.pos).toHaveLength(3);
      expect(p.look).toHaveLength(3);
      expect([...p.pos, ...p.look].every(Number.isFinite)).toBe(true);
      expect(p.pos[2]).toBeLessThan(0); // Kamera steht vor der Figur (−z)
    }
    expect(dist(s.cameraPose('face'))).toBeLessThan(dist(s.cameraPose('body')));
    expect(dist(s.cameraPose('shoes'))).toBeLessThan(dist(s.cameraPose('extras')));
    const h0 = s.cameraPose('hair').look[1];
    s.setLook(look(1, { hat: { id: 'crown', color: [1, 0.8, 0.2] } }));
    expect(s.cameraPose('hair').look[1]).toBeGreaterThan(h0 - 1e-9);
    s.dispose();
  });

  it('cameraPose(focus, {aspect, fov, free}): Ganzkörper von vorn, mit ~10 % Rand in der freien Fläche, für Quer- und Hochformat', () => {
    const s = createStudio();
    s.figure(look(1, { hat: { id: 'crown', color: [1, 0.8, 0.2] } }));
    const top = s.figure(look(1)).topY;
    const cases = [
      { aspect: 16 / 9, fov: 70, free: { x0: 0.38, x1: 1, y0: 0, y1: 1 } },
      { aspect: 16 / 9, fov: 40, free: { x0: 0.38, x1: 1, y0: 0, y1: 1 } },
      { aspect: 0.54, fov: 70, free: { x0: 0, x1: 1, y0: 0, y1: 0.42 } },
      { aspect: 0.54, fov: 40, free: { x0: 0, x1: 1, y0: 0, y1: 0.42 } },
      { aspect: 1, fov: 30, free: null },
    ];
    const ndc = (pose, o, x, y) => {
      const cam = new PerspectiveCamera(o.fov, o.aspect, 0.05, 50);
      cam.position.set(...pose.pos);
      cam.lookAt(...pose.look);
      cam.updateMatrixWorld(true);
      return new Vector3(x, y, 0).project(cam);
    };
    for (const o of cases) {
      const fr = { x0: 0, x1: 1, y0: 0, y1: 1, ...(o.free || {}) };
      const pose = s.cameraPose('body', o);
      expect(pose.pos[2]).toBeLessThan(0); // von vorn: Kamera auf der −z-Seite
      expect(pose.look[2]).toBeGreaterThan(pose.pos[2]); // Blick nach +z
      const hi = ndc(pose, o, 0, s.figure(look(1)).topY);
      const lo = ndc(pose, o, 0, 0);
      // NDC (y oben) → Bildanteil von oben
      const fy = (v) => (1 - v.y) / 2;
      const fx = (v) => (v.x + 1) / 2;
      const h = fr.y1 - fr.y0;
      expect(fy(hi) - fr.y0).toBeGreaterThan(0.05 * h); // Kopf (inkl. Frisur) nicht angeschnitten
      expect(fy(hi) - fr.y0).toBeLessThan(0.2 * h);
      expect(fr.y1 - fy(lo)).toBeGreaterThan(0.05 * h); // Schuhe + Boden sichtbar
      expect(fr.y1 - fy(lo)).toBeLessThan(0.2 * h);
      expect(fx(hi)).toBeGreaterThan(fr.x0);
      expect(fx(hi)).toBeLessThan(fr.x1);
      expect(Math.abs(fx(hi) - (fr.x0 + fr.x1) / 2)).toBeLessThan(0.04); // mittig in der freien Fläche
    }
    expect(top).toBeGreaterThan(1.6);
    // Kopfbereiche enthalten Hut/Krone komplett (Oberkante = topY der Figur mit Hut)
    const hatTop = s.figure(look(1, { hat: { id: 'crown', color: [1, 0.8, 0.2] } })).topY;
    for (const focus of ['hair', 'face', 'extras']) {
      const o = cases[0];
      const pose = s.cameraPose(focus, o);
      const hi = ndc(pose, o, 0, hatTop);
      expect(hi.y).toBeLessThan(1);
      expect(hi.y).toBeGreaterThan(0.6);
    }
    // 'top' zeigt den ganzen Kopf (inkl. Hut), topY() meldet die Oberkante des gezeigten Looks
    expect(s.topY()).toBeCloseTo(hatTop);
    {
      const o = cases[0];
      const hi = ndc(s.cameraPose('top', o), o, 0, hatTop);
      expect(hi.y).toBeLessThan(0.97);
      expect(hi.y).toBeGreaterThan(0.6);
    }
    // Aufruf ohne opts bleibt kompatibel (30°, zentriert)
    expect(s.cameraPose('body').pos[0]).toBeCloseTo(0);
    s.dispose();
  });

  it('cameraPose ohne Figur liefert Standardposen', () => {
    const s = createStudio();
    expect(s.cameraPose('body').pos).toHaveLength(3);
    s.dispose();
  });
});

describe('Studio: Porträt', () => {
  it('liefert 256×256-Canvas, rendert in ein RenderTarget und stellt Renderer + Figur wieder her', () => {
    const s = createStudio();
    const fig = s.figure(look(1));
    const r = mockRenderer();
    const c = s.portrait(r, look(2));
    expect(c.width).toBe(PORTRAIT_SIZE);
    expect(c.height).toBe(256);
    expect(r.render).toHaveBeenCalledTimes(1);
    expect(r.readRenderTargetPixels).toHaveBeenCalledTimes(1);
    const rtArg = r.readRenderTargetPixels.mock.calls[0];
    expect(rtArg[3]).toBe(256);
    expect(rtArg[4]).toBe(256);
    expect(rtArg[5]).toBeInstanceOf(Uint8Array);
    expect(r.cur).toBe(r.rt0); // Renderziel zurückgesetzt
    expect(fig.root.visible).toBe(true);
    // temporäre Figur wieder aus der Szene
    let skinned = 0;
    s.scene.traverse((o) => { if (o.isSkinnedMesh) skinned++; });
    expect(skinned).toBe(1);
    s.dispose();
  });

  it('cached nach Look-Schlüssel (Höhe/Statur egal), höchstens 16 Einträge', () => {
    const s = createStudio();
    const r = mockRenderer();
    const a = s.portrait(r, look(1));
    expect(s.portrait(r, look(1, { height: 1.1, build: 1.2 }))).toBe(a);
    expect(r.render).toHaveBeenCalledTimes(1);
    for (let i = 2; i < 30; i++) s.portrait(r, look(i));
    expect(s.portraitCacheSize()).toBe(PORTRAIT_CACHE_MAX);
    expect(s.portraitCacheSize()).toBe(16);
    s.dispose();
  });

  it('stellt das Renderziel auch bei Renderfehler wieder her', () => {
    const s = createStudio();
    const r = mockRenderer();
    r.render.mockImplementation(() => { throw new Error('boom'); });
    expect(() => s.portrait(r, look(1))).toThrow('boom');
    expect(r.cur).toBe(r.rt0);
    expect(s.portraitCacheSize()).toBe(0);
    s.dispose();
  });

  it('ohne Renderer/Look: null; nach dispose: null', () => {
    const s = createStudio();
    expect(s.portrait(null, look(1))).toBeNull();
    s.dispose();
    expect(s.portrait(mockRenderer(), look(1))).toBeNull();
    expect(s.figure(look(1))).toBeNull();
  });
});
