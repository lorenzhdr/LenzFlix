// VIDEOTHEK LENZ · Hände vor der Kamera (nur 2D): Schlag-Schwung (Faust), getragene Hülle unten rechts, Wurf-Schwung.
// Hängt als Gruppe an der Kamera, ohne Tiefentest (wie die Halte-Ebene); in VR nie sichtbar (setVisible(false)).
import { Group, Mesh, BoxGeometry, MeshBasicMaterial, CanvasTexture, SRGBColorSpace } from 'three';

export const SWING_DUR = 0.28;
const THROW_DUR = 0.35;
const CARRY_POS = [0.24, -0.2, -0.42];
const SIDE = { vhs: 0xe2d8bd, dvd: 0x1d3f9c, box: 0xc9a227 };
const SIZE = { vhs: [0.1, 0.19, 0.03], dvd: [0.12, 0.17, 0.02], box: [0.14, 0.19, 0.05] };

const sin01 = (p) => Math.sin(Math.PI * Math.min(1, Math.max(0, p)));

export function createHands(camera) {
  const group = new Group();
  group.name = 'lfx-hands';
  const fistMat = new MeshBasicMaterial({ color: 0xe8b894, depthTest: false, transparent: true });
  const fist = new Mesh(new BoxGeometry(0.09, 0.09, 0.17), fistMat);
  fist.renderOrder = 998;
  fist.visible = false;
  group.add(fist);
  const carryGroup = new Group();
  carryGroup.position.set(...CARRY_POS);
  carryGroup.visible = false;
  group.add(carryGroup);
  camera.add(group);

  let swingT = 0;
  let throwT = 0;
  let carried = null; // { mesh, tex }
  let visible = true;

  function clearCarried() {
    if (!carried) return;
    carryGroup.remove(carried.mesh);
    carried.mesh.geometry.dispose();
    for (const m of carried.mats) m.dispose();
    if (carried.tex) carried.tex.dispose();
    carried = null;
    carryGroup.visible = false;
  }

  const api = {
    group,
    get swinging() { return swingT > 0; },
    get carrying() { return !!carried; },
    swing() { swingT = SWING_DUR; },
    throwAnim() { throwT = THROW_DUR; },
    /** spec { media: 'vhs'|'dvd'|'box', art?: Canvas } oder null (nichts in der Hand). */
    setCarried(spec) {
      clearCarried();
      if (!spec) return;
      const media = SIDE[spec.media] ? spec.media : 'dvd';
      const [w, h, d] = SIZE[media];
      const side = new MeshBasicMaterial({ color: SIDE[media], depthTest: false, transparent: true });
      let tex = null;
      if (spec.art) { tex = new CanvasTexture(spec.art); tex.colorSpace = SRGBColorSpace; }
      const front = new MeshBasicMaterial({ color: tex ? 0xffffff : 0x3a4a78, map: tex, depthTest: false, transparent: true, toneMapped: false });
      const mesh = new Mesh(new BoxGeometry(w, h, d), [side, side, side, side, front, side]);
      mesh.renderOrder = 997;
      mesh.rotation.set(-0.25, -0.45, 0.08);
      carryGroup.add(mesh);
      carried = { mesh, tex, mats: [...new Set([side, front])] };
      carryGroup.visible = true; // Sichtbarkeit insgesamt über group (Hände im Halte-Bild aus, danach wieder an)
    },
    setVisible(on) {
      visible = !!on;
      group.visible = visible;
    },
    update(dt) {
      if (!(dt > 0)) return;
      if (swingT > 0) swingT = Math.max(0, swingT - dt);
      if (throwT > 0) throwT = Math.max(0, throwT - dt);
      if (swingT > 0) {
        const p = 1 - swingT / SWING_DUR;
        fist.visible = true;
        // von rechts unten in einem Bogen nach vorn-links
        fist.position.set(0.3 - 0.36 * p, -0.32 + 0.2 * sin01(p) - 0.04 * p, -0.34 - 0.36 * sin01(p));
        fist.rotation.set(-0.3 * sin01(p), 0.6 * p, 0);
      } else fist.visible = false;
      if (carried) {
        const p = throwT > 0 ? 1 - throwT / THROW_DUR : 0;
        const k = sin01(p);
        carryGroup.position.set(CARRY_POS[0] - 0.2 * k, CARRY_POS[1] + 0.12 * k, CARRY_POS[2] - 0.45 * k);
        carryGroup.rotation.set(-0.6 * k, 0, 0);
      }
    },
    dispose() {
      clearCarried();
      fist.geometry.dispose();
      fistMat.dispose();
      camera.remove(group);
    },
  };
  return api;
}
