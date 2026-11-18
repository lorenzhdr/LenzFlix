// VIDEOTHEK LENZ · Mehrspieler 1.18.0: Laserpunkte der Mitspieler (Zeiger `lz`). Ein gemeinsames Mesh für alle (höchstens MAX Punkte,
// 1 Draw-Call, nur sichtbar solange mindestens ein Laser an ist); ab `mid` zusätzlich ein dünner Strahl (2. InstancedMesh, 1 Draw-Call),
// bei `low` nur der Punkt. Ein Laser ohne neue Meldung erlischt nach EXPIRE_S. Keine Timer: update(dt, origin) kommt von peers.tick.
//   createPeerLasers(ctx) → { set(c, on, point), drop(c), update(dt, originOf(c) → {x,y,z}|null), active() → n, clear(), dispose() }
import { InstancedMesh, SphereGeometry, BoxGeometry, MeshBasicMaterial, Object3D, Vector3 } from 'three';

export const MAX_LASERS = 4;
export const EXPIRE_S = 6;
const COLOR = 0xff2a2a;

export function createPeerLasers(ctx) {
  const lasers = new Map(); // c → { x, y, z, left }
  let dots = null;
  let beams = null;
  let disposed = false;
  const dummy = new Object3D();
  const tmp = new Vector3();

  function ensure() {
    if (dots || disposed || !ctx.scene) return;
    const g = new SphereGeometry(0.045, 6, 4);
    const m = new MeshBasicMaterial({ color: COLOR, fog: false, depthWrite: false });
    dots = new InstancedMesh(g, m, MAX_LASERS);
    dots.frustumCulled = false;
    dots.count = 0;
    dots.visible = false;
    ctx.scene.add(dots);
  }
  function ensureBeams() {
    if (beams || disposed || !ctx.scene) return;
    const g = new BoxGeometry(0.01, 0.01, 1);
    const m = new MeshBasicMaterial({ color: COLOR, fog: false, transparent: true, opacity: 0.55, depthWrite: false });
    beams = new InstancedMesh(g, m, MAX_LASERS);
    beams.frustumCulled = false;
    beams.count = 0;
    beams.visible = false;
    ctx.scene.add(beams);
  }
  function free(mesh) {
    if (!mesh) return;
    if (mesh.parent) mesh.parent.remove(mesh);
    try { mesh.geometry.dispose(); mesh.material.dispose(); if (mesh.dispose) mesh.dispose(); } catch { /* egal */ }
  }

  return {
    set(c, on, point) {
      if (disposed) return;
      if (!on || !point || !Number.isFinite(point.x)) { lasers.delete(c); return; }
      if (!lasers.has(c) && lasers.size >= MAX_LASERS) return;
      lasers.set(c, { x: point.x, y: point.y, z: point.z, left: EXPIRE_S });
    },
    drop(c) { lasers.delete(c); },
    active: () => lasers.size,
    update(dt, originOf) {
      if (disposed) return;
      for (const [c, l] of [...lasers]) { l.left -= dt; if (l.left <= 0) lasers.delete(c); }
      if (!lasers.size) {
        if (dots) { dots.count = 0; dots.visible = false; }
        if (beams) { beams.count = 0; beams.visible = false; }
        return;
      }
      ensure();
      const low = (ctx.quality ? ctx.quality() : 'mid') === 'low';
      if (!low) ensureBeams();
      if (!dots) return;
      let n = 0;
      let nb = 0;
      for (const [c, l] of lasers) {
        dummy.position.set(l.x, l.y, l.z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        dots.setMatrixAt(n++, dummy.matrix);
        if (!low && beams) {
          const o = typeof originOf === 'function' ? originOf(c) : null;
          if (o) {
            tmp.set(l.x - o.x, l.y - o.y, l.z - o.z);
            const len = tmp.length();
            if (len > 0.05) {
              dummy.position.set((l.x + o.x) / 2, (l.y + o.y) / 2, (l.z + o.z) / 2);
              dummy.lookAt(l.x, l.y, l.z);
              dummy.scale.set(1, 1, len);
              dummy.updateMatrix();
              beams.setMatrixAt(nb++, dummy.matrix);
            }
          }
        }
      }
      dots.count = n;
      dots.instanceMatrix.needsUpdate = true;
      dots.visible = n > 0;
      if (beams) {
        beams.count = low ? 0 : nb;
        beams.instanceMatrix.needsUpdate = true;
        beams.visible = !low && nb > 0;
      }
    },
    clear() {
      lasers.clear();
      if (dots) { dots.count = 0; dots.visible = false; }
      if (beams) { beams.count = 0; beams.visible = false; }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      lasers.clear();
      free(dots);
      free(beams);
      dots = null;
      beams = null;
    },
  };
}
