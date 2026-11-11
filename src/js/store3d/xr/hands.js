// VIDEOTHEK LENZ · Darstellung von Controllern und Händen (prozedural, ohne fremde Modelle) und Handgelenk-Knopf für das Menü.
import { Group, Mesh, CapsuleGeometry, SphereGeometry, CylinderGeometry, MeshBasicMaterial, Vector3, Quaternion } from 'three';

const _p = new Vector3();
const _n = new Vector3();
const _h = new Vector3();
const _q = new Quaternion();

/** Visuals je Eingabequelle: Kapsel am Grip (Controller) und Punkt am Zielstrahl-Ursprung (Hand). Rückgabe: dispose(). */
export function attachVisuals(rec) {
  const geos = [];
  const mats = [];
  const mk = (geo, color, opacity = 1) => {
    const mat = new MeshBasicMaterial({ color, transparent: opacity < 1, opacity, toneMapped: false, fog: false });
    geos.push(geo); mats.push(mat);
    return new Mesh(geo, mat);
  };
  // Controller: abgerundete Kapsel entlang der Griffrichtung
  const cap = mk(new CapsuleGeometry(0.018, 0.1, 4, 10), 0x2a3478);
  cap.rotation.x = Math.PI / 2;
  cap.position.set(0, 0, 0.02);
  cap.name = 'lfx-xr-controller';
  rec.grip.add(cap);
  // Hand: kleiner Punkt am Strahl-Ursprung
  const dot = mk(new SphereGeometry(0.007, 12, 8), 0xffe9a0, 0.9);
  dot.name = 'lfx-xr-handdot';
  dot.visible = false;
  rec.ray.add(dot);
  return {
    cap,
    dot,
    /** isHand → Punkt statt Kapsel. */
    setKind(isHand) { cap.visible = !isHand; dot.visible = !!isHand; },
    dispose() {
      cap.removeFromParent();
      dot.removeFromParent();
      for (const g of geos) g.dispose();
      for (const m of mats) m.dispose();
    },
  };
}

/**
 * Handgelenk-Knopf: kleiner runder Knopf am linken Controller bzw. Handgelenk (Kind des Rigs, Pose rig-lokal).
 * Sichtbar, wenn die Innenseite zum Kopf zeigt.
 */
export class WristButton {
  constructor(rig) {
    this.rig = rig;
    this.group = new Group();
    this.group.name = 'lfx-xr-wrist';
    this.group.visible = false;
    this.mats = [];
    this.geos = [];
    const base = this.part(new CylinderGeometry(0.026, 0.026, 0.008, 28), 0xffd23f);
    const core = this.part(new CylinderGeometry(0.015, 0.015, 0.01, 28), 0x0d1330);
    core.position.y = 0.002;
    this.group.add(base, core);
    this.radius = 0.05; // großzügige Trefferfläche
    this.visible = false;
    rig.add(this.group);
  }

  part(geo, color) {
    const mat = new MeshBasicMaterial({ color, toneMapped: false, fog: false });
    this.geos.push(geo); this.mats.push(mat);
    return new Mesh(geo, mat);
  }

  /**
   * rec = Eingabequelle der linken Seite oder null; headLocal = Kopfposition im Rig-Raum.
   * Controller: Knopf auf der Oberseite hinter dem Griff, Hand: auf der Handflächenseite des Handgelenks.
   */
  update(rec, headPos) {
    const g = this.group;
    let show = false;
    if (rec && rec.source && rec.ray.visible) {
      if (rec.source.hand) {
        const joint = rec.handGroup && rec.handGroup.joints ? rec.handGroup.joints.wrist : null;
        if (joint && joint.visible) {
          _q.copy(joint.quaternion);
          _n.set(0, -1, 0).applyQuaternion(_q); // Handflächenseite
          _p.copy(joint.position).addScaledVector(_n, 0.03);
          show = true;
        }
      } else if (rec.grip.visible) {
        _q.copy(rec.grip.quaternion);
        _n.set(0, 1, 0).applyQuaternion(_q);
        _p.set(0, 0.035, 0.09).applyQuaternion(_q).add(rec.grip.position);
        show = true;
      }
    }
    if (show) {
      _h.copy(headPos).sub(_p).normalize();
      show = _n.dot(_h) > 0.35;
    }
    this.visible = show;
    g.visible = show;
    if (show) {
      g.position.copy(_p);
      g.quaternion.setFromUnitVectors(_h.set(0, 1, 0), _n);
    }
  }

  /** Strahl (Welt) gegen die Kugel um den Knopf; Treffer → Abstand t, sonst null. */
  hit(o, d, maxDist = 3) {
    if (!this.visible) return null;
    this.group.getWorldPosition(_p);
    const cx = _p.x - o.x;
    const cy = _p.y - o.y;
    const cz = _p.z - o.z;
    const t = cx * d.x + cy * d.y + cz * d.z;
    if (t < 0 || t > maxDist) return null;
    const dist2 = cx * cx + cy * cy + cz * cz - t * t;
    return dist2 <= this.radius * this.radius ? t : null;
  }

  dispose() {
    this.group.removeFromParent();
    for (const g of this.geos) g.dispose();
    for (const m of this.mats) m.dispose();
  }
}
