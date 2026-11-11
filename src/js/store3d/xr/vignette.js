// VIDEOTHEK LENZ · Komfort-Vignette: kopffester Ring (Kind der Kamera), wird bei Geh-/Drehgeschwindigkeit sichtbar.
import { Mesh, RingGeometry, MeshBasicMaterial, Float32BufferAttribute } from 'three';

/** Zielstärke 0..0.85 aus Gehgeschwindigkeit (m/s) und Drehrate (rad/s). Rein. */
export function vignetteTarget(speed, turnRate) {
  const s = Math.min(1, Math.max(0, (Number(speed) || 0) / 2.2));
  const t = Math.min(1, Math.max(0, Math.abs(Number(turnRate) || 0) / (Math.PI / 2)));
  return Math.min(0.85, s * 0.6 + t * 0.6);
}

export function createVignette(camera) {
  const inner = 0.07;
  const outer = 0.45;
  const geo = new RingGeometry(inner, outer, 48, 1);
  // Verlauf: innen durchsichtig, außen deckend (Vertex-Alpha)
  const pos = geo.getAttribute('position');
  const cols = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    const r = Math.hypot(pos.getX(i), pos.getY(i));
    const a = Math.min(1, Math.max(0, (r - inner) / (outer - inner)));
    cols[i * 4] = 0; cols[i * 4 + 1] = 0; cols[i * 4 + 2] = 0; cols[i * 4 + 3] = a * a;
  }
  geo.setAttribute('color', new Float32BufferAttribute(cols, 4));
  const mat = new MeshBasicMaterial({ color: 0xffffff, vertexColors: true, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false, fog: false });
  const mesh = new Mesh(geo, mat);
  mesh.name = 'lfx-vignette';
  mesh.renderOrder = 9990; // knapp unter der Schwarzblende (10000)
  mesh.frustumCulled = false;
  mesh.visible = false;
  mesh.position.set(0, 0, -0.14);
  camera.add(mesh);
  let cur = 0;
  return {
    mesh,
    get strength() { return cur; },
    /** on = Option aus; speed in m/s, turnRate in rad/s. */
    update(dt, on, speed, turnRate) {
      const target = on ? vignetteTarget(speed, turnRate) : 0;
      const k = Math.min(1, dt * (target > cur ? 8 : 3));
      cur += (target - cur) * k;
      if (cur < 0.004) cur = 0;
      mat.opacity = cur;
      mesh.visible = cur > 0;
    },
    dispose() {
      mesh.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
}
