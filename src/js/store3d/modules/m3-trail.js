// VIDEOTHEK LENZ · M3: leuchtende Spur am Boden (animierte additive Pfeile, ein InstancedMesh = ein Draw-Call) + Hüllen-Markierung.
import { InstancedMesh, PlaneGeometry, MeshBasicMaterial, AdditiveBlending, Object3D, InstancedBufferAttribute } from 'three';
import { findPath } from '../nav/path.js';
import { trailPoints } from './m3-util.js';
import { canvasTexture } from './m3-gfx.js';

const SPACING = 0.7;
const MAX_AGE = 90; // Sekunden
const NEAR = 0.9; // Pfeile näher als das am Spieler verlöschen
const TAIL = 5; // Länge der Leuchtwelle in Pfeilen

function chevron(g, w, h) {
  g.clearRect(0, 0, w, h);
  g.translate(w / 2, h / 2);
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.shadowColor = '#ffb347';
  g.shadowBlur = 10;
  g.strokeStyle = '#ffe9a0';
  g.lineWidth = 8;
  for (const dy of [-8, 12]) {
    g.beginPath();
    g.moveTo(-17, dy + 10);
    g.lineTo(0, dy - 8);
    g.lineTo(17, dy + 10);
    g.stroke();
  }
}

export function createTrail(ctx) {
  const geo = ctx.track(new PlaneGeometry(0.36, 0.36));
  const mat = ctx.track(new MeshBasicMaterial({
    map: canvasTexture(ctx, 64, 64, chevron), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false,
  }));
  let mesh = null;
  let pts = [];
  let id = null;
  let age = 0;
  let acc = 0;
  let offTake = null;

  function stop() {
    if (mesh) {
      mesh.removeFromParent();
      mesh.dispose();
      mesh = null;
    }
    if (id) ctx.items.highlight(id, false);
    if (offTake) { offTake(); offTake = null; }
    id = null;
    pts = [];
  }

  /** Spur zur Hülle `itemId`. → { slot } oder null (nicht im Laden / kein Weg). */
  function start(itemId) {
    stop();
    const slot = ctx.items.slotOf(itemId);
    if (!slot) return null;
    const pose = ctx.player.getPose();
    const path = findPath(ctx.layout.nav, { x: pose.x, z: pose.z }, { x: slot.stand.x, z: slot.stand.z });
    if (!path) return null;
    pts = trailPoints({ x: pose.x, z: pose.z }, path, SPACING);
    if (!pts.length) pts = [{ x: slot.stand.x, z: slot.stand.z, a: slot.stand.yaw }];
    const n = pts.length;
    mesh = new InstancedMesh(geo, mat, n);
    mesh.frustumCulled = false;
    mesh.renderOrder = 6;
    const d = new Object3D();
    d.rotation.order = 'YXZ';
    for (let i = 0; i < n; i++) {
      d.position.set(pts[i].x, 0.035, pts[i].z);
      d.rotation.set(-Math.PI / 2, pts[i].a, 0);
      d.updateMatrix();
      mesh.setMatrixAt(i, d.matrix);
    }
    mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(n * 3).fill(0.5), 3);
    ctx.scene.add(mesh);
    id = itemId;
    age = 0;
    acc = 1;
    ctx.items.highlight(itemId, true);
    offTake = ctx.on('take', (tid) => { if (tid === itemId) stop(); });
    return { slot };
  }

  function update(dt, t) {
    if (!mesh) return;
    age += dt;
    if (age > MAX_AGE) { stop(); return; }
    acc += dt;
    if (acc < (ctx.quality() === 'low' ? 0.12 : 0.033)) return;
    acc = 0;
    const p = ctx.player.getPose();
    const n = pts.length;
    const cyc = n + TAIL + 3;
    const head = (t * 5) % cyc;
    const arr = mesh.instanceColor.array;
    for (let i = 0; i < n; i++) {
      let d = head - i;
      if (d < 0) d += cyc;
      const wave = d < TAIL ? 1 - d / TAIL : 0;
      let v = 0.28 + 0.72 * wave;
      const near = Math.hypot(pts[i].x - p.x, pts[i].z - p.z) < NEAR && i < n - 1;
      if (near) v = 0;
      arr[i * 3] = v; arr[i * 3 + 1] = v; arr[i * 3 + 2] = v;
    }
    mesh.instanceColor.needsUpdate = true;
  }

  return { start, stop, update, get active() { return !!mesh; }, get points() { return pts; }, dispose: stop };
}
