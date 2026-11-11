import { describe, it, expect } from 'vitest';
import { Group, PerspectiveCamera, Vector3, Euler, Quaternion } from 'three';
import { headLocal, headWorld, placeRig, turnAboutHead, seatedOffset } from '../src/js/store3d/xr/rig.js';

function camAt(x, y, z, yaw, pitch = 0) {
  const c = new PerspectiveCamera();
  c.position.set(x, y, z);
  c.quaternion.setFromEuler(new Euler(pitch, yaw, 0, 'YXZ'));
  return c;
}

/** Welt-Kopfpose über echte three-Matrizen: Rig → Kamera-Kind. */
function worldHead(rig, cam) {
  const child = new PerspectiveCamera();
  child.position.copy(cam.position);
  child.quaternion.copy(cam.quaternion);
  rig.add(child);
  rig.updateMatrixWorld(true);
  const p = child.getWorldPosition(new Vector3());
  const q = child.getWorldQuaternion(new Quaternion());
  const e = new Euler().setFromQuaternion(q, 'YXZ');
  rig.remove(child);
  return { x: p.x, y: p.y, z: p.z, yaw: e.y };
}

const angEq = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) < 1e-6;

describe('xr/rig', () => {
  it('headLocal liest Position, Yaw und Pitch der XR-Kamera', () => {
    const h = headLocal(camAt(0.3, 1.5, -0.2, 0.7, -0.2));
    expect(h.x).toBeCloseTo(0.3);
    expect(h.y).toBeCloseTo(1.5);
    expect(h.z).toBeCloseTo(-0.2);
    expect(h.yaw).toBeCloseTo(0.7);
    expect(h.pitch).toBeCloseTo(-0.2);
  });

  it('placeRig: Kopf liegt in Welt auf Zielposition und -Yaw (geprüft über three-Matrizen)', () => {
    for (const [hx, hz, hyaw, ty] of [[0.4, -0.3, 0.9, 2.1], [0, 0, 0, 0], [-1, 0.5, -2.5, 1], [0.2, 0.2, 3, -3]]) {
      const cam = camAt(hx, 1.6, hz, hyaw);
      const rig = new Group();
      placeRig(rig, { x: 5, z: -7, yaw: ty }, headLocal(cam), { y: 0.1 });
      const w = worldHead(rig, cam);
      expect(w.x).toBeCloseTo(5, 5);
      expect(w.z).toBeCloseTo(-7, 5);
      expect(angEq(w.yaw, ty)).toBe(true);
      expect(w.y).toBeCloseTo(1.7, 5);
    }
  });

  it('turnAboutHead dreht um den Kopf: Position bleibt, Yaw ändert sich um dYaw', () => {
    const cam = camAt(0.5, 1.6, 0.3, 0.4);
    const head = headLocal(cam);
    const rig = new Group();
    placeRig(rig, { x: 2, z: 3, yaw: 1 }, head, { y: 0 });
    const before = worldHead(rig, cam);
    turnAboutHead(rig, head, Math.PI / 4);
    const after = worldHead(rig, cam);
    expect(after.x).toBeCloseTo(before.x, 5);
    expect(after.z).toBeCloseTo(before.z, 5);
    expect(angEq(after.yaw, before.yaw + Math.PI / 4)).toBe(true);
    const w = headWorld(rig, head);
    expect(w.x).toBeCloseTo(after.x, 5);
    expect(w.z).toBeCloseTo(after.z, 5);
    expect(angEq(w.yaw, after.yaw)).toBe(true);
  });

  it('seatedOffset: Augenhöhe minus gemessene Kopfhöhe', () => {
    expect(seatedOffset(1.2)).toBeCloseTo(0.45);
    expect(seatedOffset(1.2, 1.5)).toBeCloseTo(0.3);
    expect(seatedOffset(NaN)).toBeCloseTo(1.65);
  });
});
