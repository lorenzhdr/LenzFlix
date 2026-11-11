// VIDEOTHEK LENZ · VR-Rig: Kopfpose lesen und das Rig so setzen, dass der Kopf auf der Spielerpose liegt (rein, ohne Renderer).
import { Euler } from 'three';

const _e = new Euler(0, 0, 0, 'YXZ');

/** Kopf im Rig-Raum (XR-Kamera, Eltern = Rig): { x, y, z, yaw, pitch }. */
export function headLocal(cameraXr) {
  _e.setFromQuaternion(cameraXr.quaternion, 'YXZ');
  return { x: cameraXr.position.x, y: cameraXr.position.y, z: cameraXr.position.z, yaw: _e.y, pitch: _e.x };
}

/** Kopfposition (x, z) und -Yaw in Weltkoordinaten bei gegebener Rig-Pose (Rig nur um y gedreht). */
export function headWorld(rig, head) {
  const ry = rig.rotation.y;
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  return { x: rig.position.x + head.x * c + head.z * s, z: rig.position.z - head.x * s + head.z * c, yaw: ry + head.yaw };
}

/** Rig so setzen, dass Kopf-Weltposition (x, z) und Kopf-Yaw dem Ziel entsprechen; y = Rig-Höhe. */
export function placeRig(rig, target, head, { y = 0 } = {}) {
  const ry = target.yaw - head.yaw;
  const c = Math.cos(ry);
  const s = Math.sin(ry);
  rig.rotation.set(0, ry, 0);
  rig.position.set(target.x - (head.x * c + head.z * s), y, target.z - (-head.x * s + head.z * c));
  return rig;
}

/** Rig um den Kopf drehen (Snap/weich): die Kopf-Weltposition bleibt, der Yaw ändert sich um dYaw. */
export function turnAboutHead(rig, head, dYaw) {
  const w = headWorld(rig, head);
  return placeRig(rig, { x: w.x, z: w.z, yaw: w.yaw + dYaw }, head, { y: rig.position.y });
}

/** Rig-Höhe für Sitzen: Augenhöhe der Videothek minus gemessene Kopfhöhe. */
export function seatedOffset(headY, eye = 1.65) {
  return eye - (Number.isFinite(headY) ? headY : 0);
}
