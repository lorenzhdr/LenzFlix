// VIDEOTHEK LENZ · Wurf-Pool der NPC (1.18.0): EIN InstancedMesh für alle Bonbons und Popcorn-Körner (1 Draw-Call, nur solange etwas fliegt).
// createThrowPool(scene, rand) → { launch(kind, from, to) → bool, update(dt, player, onArrive(p, hit)), active(), dispose(), mesh }
import { InstancedMesh, IcosahedronGeometry, MeshLambertMaterial, Matrix4, Color, Quaternion, Vector3, Euler } from 'three';
import { createThrow, stepThrow, THROW, THROW_COLORS } from './throw-logic.js';

const _m = new Matrix4();
const _q = new Quaternion();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
const _e = new Euler();
const _c = new Color();

export function createThrowPool(scene, rand = Math.random) {
  const geo = new IcosahedronGeometry(0.05, 0);
  const mat = new MeshLambertMaterial({ color: 0xffffff });
  const mesh = new InstancedMesh(geo, mat, THROW.max);
  mesh.name = 'npc-throwpool';
  mesh.count = 0;
  mesh.visible = false;
  mesh.frustumCulled = false;
  scene.add(mesh);
  let list = [];
  let disposed = false;
  function write() {
    mesh.count = list.length;
    mesh.visible = list.length > 0;
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      _e.set(p.spin, p.spin * 0.7, 0);
      _q.setFromEuler(_e);
      _p.set(p.x, p.y, p.z);
      _m.compose(_p, _q, _s);
      mesh.setMatrixAt(i, _m);
      const cols = THROW_COLORS[p.kind] || THROW_COLORS.popcorn;
      const c = cols[p.color % cols.length];
      _c.setRGB(c[0], c[1], c[2]);
      mesh.setColorAt(i, _c);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }
  return {
    mesh,
    active: () => list.length,
    launch(kind, from, to) {
      if (disposed || list.length >= THROW.max) return false;
      const p = createThrow(kind, from, to);
      p.color = Math.floor(rand() * 3);
      list.push(p);
      write();
      return true;
    },
    /** onArrive(p, hit) je angekommenem Geschoss. */
    update(dt, player, onArrive) {
      if (disposed || !list.length) return;
      const keep = [];
      for (const p of list) {
        const r = stepThrow(p, dt, player);
        if (r.arrived) { try { if (onArrive) onArrive(p, r.hit); } catch { /* egal */ } } else keep.push(p);
      }
      list = keep;
      write();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      list = [];
      if (mesh.parent) mesh.parent.remove(mesh);
      geo.dispose();
      mat.dispose();
      mesh.dispose();
    },
  };
}
