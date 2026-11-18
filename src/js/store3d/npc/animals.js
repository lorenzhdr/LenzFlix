// VIDEOTHEK LENZ · Tier-Modelle (three): Katze (Rumpf + Schwanz = 2 Draw-Calls) und Taubenschwarm (2 InstancedMesh: Körper, Flügel).
// Zustände/Bewegung: npc/animals-logic.js.
import { Group, Mesh, MeshLambertMaterial, InstancedMesh, Matrix4, Quaternion, Vector3, Euler, Color, DoubleSide } from 'three';
import { box, merge } from '../util/geo.js';
import { sph } from '../modules/m4-geo.js';

let catMat = null;
let pigMat = null;
let wingMat = null;
const geos = [];
const keep = (g) => { geos.push(g); return g; };

/** Katze: { root, setPose(cat, dt) }. Körper blickt nach −z. */
export function createCat(fur = [0.9, 0.55, 0.2]) {
  if (!catMat) catMat = new MeshLambertMaterial({ vertexColors: true });
  const dark = fur.map((v) => v * 0.65);
  const white = [0.96, 0.94, 0.9];
  const body = keep(merge([
    box({ w: 0.15, h: 0.14, d: 0.38, x: 0, y: 0.2, z: 0.02, color: fur }),
    box({ w: 0.153, h: 0.03, d: 0.34, x: 0, y: 0.2, z: 0.02, color: dark }),
    sph(0.082, 0, 0.27, -0.2, fur, 1, 0.95, 0.95),
    box({ w: 0.04, h: 0.06, d: 0.03, x: -0.05, y: 0.35, z: -0.2, color: fur, rz: 0.2 }),
    box({ w: 0.04, h: 0.06, d: 0.03, x: 0.05, y: 0.35, z: -0.2, color: fur, rz: -0.2 }),
    box({ w: 0.02, h: 0.02, d: 0.01, x: -0.03, y: 0.285, z: -0.275, color: [0.1, 0.5, 0.2] }),
    box({ w: 0.02, h: 0.02, d: 0.01, x: 0.03, y: 0.285, z: -0.275, color: [0.1, 0.5, 0.2] }),
    box({ w: 0.025, h: 0.02, d: 0.01, x: 0, y: 0.25, z: -0.28, color: [0.9, 0.5, 0.55] }),
    box({ w: 0.12, h: 0.06, d: 0.06, x: 0, y: 0.17, z: -0.2, color: white }),
    ...[[-1, -0.13], [1, -0.13], [-1, 0.16], [1, 0.16]].map(([sx, z]) => box({ w: 0.045, h: 0.14, d: 0.05, x: sx * 0.055, y: 0.07, z, color: z < 0 ? white : fur })),
  ]));
  const tailG = keep(merge([box({ w: 0.035, h: 0.035, d: 0.3, x: 0, y: 0, z: 0.15, color: fur }), box({ w: 0.037, h: 0.037, d: 0.06, x: 0, y: 0, z: 0.3, color: dark })]));
  const root = new Group();
  root.name = 'npc-cat';
  const posture = new Group();
  const bodyMesh = new Mesh(body, catMat);
  posture.add(bodyMesh);
  posture.position.set(0, 0, 0.2); // Drehpunkt hinten
  bodyMesh.position.set(0, 0, -0.2);
  const tail = new Mesh(tailG, catMat);
  tail.position.set(0, 0.24, 0.22);
  root.add(posture, tail);
  return {
    root,
    /** cat = Logikzustand (npc/animals-logic.js createCat) */
    setPose(cat) {
      root.position.set(cat.x, cat.y, cat.z);
      root.rotation.y = cat.yaw;
      const sit = cat.state === 'sit' || cat.state === 'groom' || cat.state === 'purr';
      const run = cat.state === 'flee' || cat.state === 'chase' || cat.state === 'pounce'; // 1.18.0: Laserjagd und Sprung
      posture.rotation.x = sit ? 0.75 : run ? -0.1 : 0;
      posture.position.y = (sit ? 0 : Math.abs(Math.sin(cat.tail * 1.2)) * (run ? 0.05 : 0.012));
      if (cat.state === 'groom') posture.rotation.x += Math.sin(cat.tail * 3) * 0.12;
      if (cat.state === 'purr') posture.position.y = Math.sin(cat.tail * 9) * 0.004;
      tail.rotation.set(sit ? -0.2 : run ? -0.5 : -0.1, Math.sin(cat.tail) * (run ? 0.6 : 0.45), 0);
      tail.position.set(0, sit ? 0.12 : 0.24, 0.22);
    },
  };
}

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3();
const _w = new Matrix4();
const _wq = new Quaternion();
const _wp = new Vector3();
const _ws = new Vector3();

/** Taubenschwarm: { root, set(flock) } für n Tauben. */
export function createPigeons(n) {
  if (!pigMat) pigMat = new MeshLambertMaterial({ vertexColors: true });
  if (!wingMat) wingMat = new MeshLambertMaterial({ vertexColors: true, side: DoubleSide });
  const grey = [0.58, 0.6, 0.66];
  const body = keep(merge([
    sph(0.075, 0, 0.1, 0, grey, 0.9, 0.8, 1.4),
    sph(0.045, 0, 0.17, -0.1, [0.4, 0.5, 0.62]),
    box({ w: 0.02, h: 0.015, d: 0.04, x: 0, y: 0.17, z: -0.16, color: [0.9, 0.7, 0.3] }),
    box({ w: 0.07, h: 0.015, d: 0.12, x: 0, y: 0.105, z: 0.15, color: [0.4, 0.42, 0.48] }),
    box({ w: 0.01, h: 0.05, d: 0.01, x: -0.02, y: 0.025, z: 0, color: [0.8, 0.45, 0.4] }),
    box({ w: 0.01, h: 0.05, d: 0.01, x: 0.02, y: 0.025, z: 0, color: [0.8, 0.45, 0.4] }),
  ]));
  const wing = keep(merge([box({ w: 0.28, h: 0.012, d: 0.16, x: 0.14, y: 0, z: 0.02, color: [0.5, 0.52, 0.58] })]));
  const bodies = new InstancedMesh(body, pigMat, n);
  const wings = new InstancedMesh(wing, wingMat, n * 2);
  for (const im of [bodies, wings]) { im.frustumCulled = false; im.instanceMatrix.setUsage(35048); }
  const tint = new Color();
  for (let i = 0; i < n; i++) { const k = 0.85 + ((i * 37) % 10) / 33; tint.setRGB(k, k, k + 0.03); bodies.setColorAt(i, tint); }
  for (let i = 0; i < n * 2; i++) wings.setColorAt(i, tint.setRGB(1, 1, 1));
  const root = new Group();
  root.name = 'npc-pigeons';
  root.add(bodies, wings);
  return {
    root,
    set(flock) {
      for (let i = 0; i < flock.length; i++) {
        const p = flock[i];
        const air = p.state === 'fly' || p.state === 'land';
        const peck = p.state === 'peck' ? Math.max(0, Math.sin(p.bob)) * 0.5 : 0;
        const bob = p.state === 'walk' ? Math.sin(p.bob) * 0.015 : 0;
        _e.set(air ? -0.15 : peck, p.yaw, 0, 'YXZ');
        _q.setFromEuler(_e);
        _p.set(p.x, p.y + bob, p.z);
        _s.set(1, 1, 1);
        _m.compose(_p, _q, _s);
        bodies.setMatrixAt(i, _m);
        const ang = air ? Math.sin(p.flap) * 0.9 : 0.15;
        const span = air ? 1 : 0.35;
        for (const side of [-1, 1]) {
          _wp.set(side * 0.05, 0.12, -0.02).applyMatrix4(_m);
          _e.set(0, 0, side * ang);
          _wq.setFromEuler(_e);
          _wq.premultiply(_q);
          _ws.set(side * span, 1, 1);
          _w.compose(_wp, _wq, _ws);
          wings.setMatrixAt(i * 2 + (side < 0 ? 0 : 1), _w);
        }
      }
      bodies.instanceMatrix.needsUpdate = true;
      wings.instanceMatrix.needsUpdate = true;
    },
    setCount(c) { bodies.count = c; wings.count = c * 2; },
    dispose() { bodies.dispose(); wings.dispose(); },
  };
}

export function disposeAnimalCaches() {
  for (const g of geos) g.dispose();
  geos.length = 0;
  if (catMat) { catMat.dispose(); catMat = null; }
  if (pigMat) { pigMat.dispose(); pigMat = null; }
  if (wingMat) { wingMat.dispose(); wingMat = null; }
}
