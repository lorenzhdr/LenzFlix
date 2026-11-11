// @vitest-environment jsdom
// M3: Panel-Platzierung (Freiraum, Winkelbreite, Kopf-Folgen, Knopfzeilen) und Ausrichtung der Hülle in der Hand.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Scene, PerspectiveCamera, Object3D, Group, Vector3 } from 'three';
import { layoutPanel, openPanel, rayClearance } from '../src/js/store3d/xr/panel.js';

vi.mock('../src/js/store3d/world/textures.js', () => {
  const ctx = new Proxy({}, { get: (t, k) => (k === 'measureText' ? () => ({ width: 10 }) : k === 'createLinearGradient' ? () => ({ addColorStop() {} }) : () => {}), set: () => true });
  return { FONT: 'x', makeCanvas: (w, h) => ({ width: w, height: h, getContext: () => ctx }) };
});
vi.mock('../src/js/store3d/covers/loader.js', () => ({ loadBitmap: async () => null, closeBitmap() {} }));

const { HoldView } = await import('../src/js/store3d/ui/holdview.js');

afterEach(() => vi.restoreAllMocks());
const setup = () => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  const scene = new Scene();
  const camera = new PerspectiveCamera();
  scene.add(camera);
  camera.position.set(0, 1.65, 0);
  camera.updateMatrixWorld(true);
  return { scene, camera };
};

describe('rayClearance', () => {
  const rects = [{ x0: -1, z0: -2, x1: 1, z1: -1.5 }];
  it('freie Strecke bis zum Rechteck, sonst maxDist', () => {
    expect(rayClearance(rects, 0, 0, 0, -1, 5)).toBeCloseTo(1.5);
    expect(rayClearance(rects, 0, 0, 0, 1, 5)).toBe(5);
    expect(rayClearance(rects, 3, 0, 0, -1, 5)).toBe(5);
    expect(rayClearance(rects, 0, 0, 0, -1, 1)).toBe(1);
    expect(rayClearance(null, 0, 0, 0, -1, 2)).toBe(2);
  });
});

describe('openPanel: front mit Freiraum', () => {
  it('rückt heran (min. 0,5 m) und schrumpft proportional', () => {
    const { scene, camera } = setup();
    const h = openPanel({ text: 'a' }, { scene, camera, clearance: () => 0.9 });
    expect(h.mesh.position.z).toBeCloseTo(-0.75, 2);
    expect(h.mesh.scale.x).toBeCloseTo(0.75 / 1.1, 3);
    h.close();
    const g = openPanel({ text: 'a' }, { scene, camera, clearance: () => 0.2 });
    expect(g.mesh.position.z).toBeCloseTo(-0.5, 2);
    g.close();
    const f = openPanel({ text: 'a' }, { scene, camera, clearance: (x, z, dx, dz, max) => max });
    expect(f.mesh.position.z).toBeCloseTo(-1.1, 2);
    expect(f.mesh.scale.x).toBe(1);
    f.close();
  });

  it('low: breites Panel bleibt unter ~55° Winkelbreite', () => {
    const { scene, camera } = setup();
    const h = openPanel({ text: 'a', width: 1.2 }, { scene, camera, anchor: 'low' });
    const d = Math.hypot(h.mesh.position.x, h.mesh.position.z);
    expect((2 * Math.atan(0.6 / d) * 180) / Math.PI).toBeLessThanOrEqual(55.01);
    expect(h.mesh.position.y).toBeCloseTo(1.25, 2);
    h.close();
  });
});

describe('openPanel: Kopf-Folgen', () => {
  it('Ziel bleibt bei kleiner Drehung stehen, springt bei > 35° bzw. > 0,6 m', () => {
    const { scene, camera } = setup();
    const h = openPanel({ text: 'a', width: 0.55 }, { scene, camera, anchor: { head: true, offset: { x: -0.3, y: -0.15, z: 0.65 }, follow: true } });
    expect(h.mesh.position.x).toBeCloseTo(-0.3, 3);
    expect(h.mesh.position.z).toBeCloseTo(-0.65, 3);
    expect(h.mesh.position.y).toBeCloseTo(1.5, 3);
    const p0 = h.mesh.position.clone();
    camera.rotation.set(0, 0.3, 0);
    camera.updateMatrixWorld(true);
    for (let i = 0; i < 60; i++) h.tick(0.1);
    expect(h.mesh.position.distanceTo(p0)).toBeLessThan(1e-3);
    camera.rotation.set(0, 0.9, 0);
    camera.updateMatrixWorld(true);
    for (let i = 0; i < 60; i++) h.tick(0.1);
    expect(h.mesh.position.distanceTo(p0)).toBeGreaterThan(0.3);
    const p1 = h.mesh.position.clone();
    camera.position.set(0, 1.65, 0.9);
    camera.updateMatrixWorld(true);
    for (let i = 0; i < 60; i++) h.tick(0.1);
    expect(h.mesh.position.distanceTo(p1)).toBeGreaterThan(0.5);
    h.close();
  });
});

describe('layoutPanel: Knopfzeilen', () => {
  it('b.row legt Zeilen fest; Treffer-Index bleibt der Knopfindex', () => {
    const L = layoutPanel({ buttons: [{ label: 'a', row: 1 }, { label: 'b', row: 1 }, { label: 'c', row: 2 }] }, 950);
    const hs = L.hits.filter((x) => x.kind === 'button');
    expect(hs.map((x) => x.ref)).toEqual([0, 1, 2]);
    expect(hs[0].y).toBe(hs[1].y);
    expect(hs[2].y).toBeGreaterThan(hs[0].y);
    expect(hs[2].w).toBeCloseTo(950 - 72);
  });
});

describe('HoldView: Hülle zum Gesicht', () => {
  const mk = (kind, hand) => {
    const camera = new Group();
    camera.aspect = 1.6;
    const anchor = new Object3D();
    if (kind) anchor.userData.lfxHold = kind;
    const hv = new HoldView({
      host: document.body, camera, deps: { imageUrl: () => '', getItem: async () => null }, items: new Map(), shelves: { setHidden() {} },
      notify() {}, onClosed() {}, openPanel: () => ({ close() {}, update() {}, mesh: new Object3D() }),
    });
    hv.open('x', null, true, { xr: true, anchor, hand });
    hv.update(0.016);
    return hv;
  };
  it('Grip: Vorderseite zeigt nach +y des Grips (zum Gesicht), nicht nach +z', () => {
    const hv = mk('grip', 'right');
    const n = new Vector3(0, 0, 1).applyQuaternion(hv.group.quaternion);
    expect(n.y).toBeGreaterThan(0.85);
    expect(n.x).toBeLessThan(0);
    hv.dispose(true);
    const hl = mk('grip', 'left');
    expect(new Vector3(0, 0, 1).applyQuaternion(hl.group.quaternion).x).toBeGreaterThan(0);
    hl.dispose(true);
  });
  it('Ohne Markierung (Kamera-Ersatz): unverändert +z', () => {
    const hv = mk(undefined, 'right');
    expect(new Vector3(0, 0, 1).applyQuaternion(hv.group.quaternion).z).toBeCloseTo(1, 5);
    hv.dispose(true);
  });
});
