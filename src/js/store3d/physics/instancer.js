// VIDEOTHEK LENZ · Physik: Instanzierte Darstellung (three). Pro Art ein InstancedMesh, Instanzen sind Körper-Plätze;
// versteckt = Skalierung 0. frustumCulled aus (bewegte Instanzen, kleine Szene).
import { InstancedMesh, Matrix4, Quaternion, Vector3 } from 'three';

const _m = new Matrix4();
const _p = new Vector3();
const _q = new Quaternion();
const _s = new Vector3(1, 1, 1);
const _z = new Vector3(0, 0, 0);

export function createInstancer(group, shapes, baseMat, standeeMat, counts) {
  const sets = new Map();
  for (const [kind, n] of Object.entries(counts)) {
    if (!(n > 0)) continue;
    const mesh = new InstancedMesh(shapes.geometry(kind), kind === 'standee' ? standeeMat() : baseMat, n);
    mesh.name = `lfx-props-${kind}`;
    mesh.frustumCulled = false;
    _m.compose(_z, _q.identity(), _z);
    for (let i = 0; i < n; i++) mesh.setMatrixAt(i, _m);
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
    sets.set(kind, { mesh, next: 0, n, dirty: false });
  }
  return {
    sets,
    /** Platz für eine Instanz der Art (oder -1). */
    alloc(kind) { const s = sets.get(kind); if (!s || s.next >= s.n) return -1; return s.next++; },
    set(kind, idx, pos, q, visible) {
      const s = sets.get(kind);
      if (!s || idx < 0) return;
      _p.set(pos.x, pos.y, pos.z);
      _q.set(q.x, q.y, q.z, q.w);
      _m.compose(_p, _q, visible ? _s : _z);
      s.mesh.setMatrixAt(idx, _m);
      s.dirty = true;
    },
    flush() { for (const s of sets.values()) if (s.dirty) { s.mesh.instanceMatrix.needsUpdate = true; s.dirty = false; } },
    dispose() { for (const s of sets.values()) { s.mesh.removeFromParent(); s.mesh.dispose(); } sets.clear(); },
  };
}
