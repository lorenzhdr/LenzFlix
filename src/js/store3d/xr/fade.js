// VIDEOTHEK LENZ · kopffeste Schwarzblende (Kugel um die Kamera) für Teleport und Kino.
import { Mesh, SphereGeometry, MeshBasicMaterial, BackSide } from 'three';

export function createFade(camera) {
  const mat = new MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, depthTest: false, depthWrite: false, side: BackSide, toneMapped: false, fog: false });
  const mesh = new Mesh(new SphereGeometry(0.3, 16, 12), mat);
  mesh.name = 'lfx-fade';
  mesh.renderOrder = 10000;
  mesh.frustumCulled = false;
  mesh.visible = false;
  camera.add(mesh);
  let alpha = 0;
  let from = 0;
  let target = 0;
  let dur = 0;
  let t = 0;
  let resolve = null;
  const apply = () => { mat.opacity = alpha; mesh.visible = alpha > 0.002; };

  const api = {
    mesh,
    get alpha() { return alpha; },
    /** Auf alpha (0..1) in ms blenden. */
    to(a, ms = 200) {
      if (resolve) { const r = resolve; resolve = null; r(); }
      target = Math.max(0, Math.min(1, a));
      from = alpha;
      dur = Math.max(0, ms) / 1000;
      t = 0;
      if (dur === 0 || from === target) { alpha = target; apply(); return Promise.resolve(); }
      return new Promise((res) => { resolve = res; });
    },
    /** Abdunkeln, fn() ausführen, aufhellen. */
    async jump(fn, { out = 180, in: inn = 220 } = {}) {
      await api.to(1, out);
      try { await fn(); } finally { await api.to(0, inn); }
    },
    update(dt) {
      if (!resolve) return;
      t += dt;
      const k = dur > 0 ? Math.min(1, t / dur) : 1;
      alpha = from + (target - from) * k;
      apply();
      if (k >= 1) { const r = resolve; resolve = null; r(); }
    },
    dispose() {
      if (resolve) { const r = resolve; resolve = null; r(); }
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mat.dispose();
    },
  };
  return api;
}
