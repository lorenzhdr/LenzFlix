// VIDEOTHEK LENZ · LENZ PALAST: Saal (three). Ränge, Stufen, Sitzreihen (instanziert), Vorhang, Bühnenwand, Wandlichter, Streulicht.
// Liefert das `saal`-Handle für PalastCinema.attachSaal (cinema/palast.js). Alles in einer Gruppe, dispose räumt vollständig auf.
import {
  Group, Mesh, InstancedMesh, MeshBasicMaterial, Matrix4, AdditiveBlending, DoubleSide, Color,
} from 'three';
import { box, quad, merge, hex, disposeTree } from '../util/geo.js';

const lin = (c) => c.map((v) => v ** 2.2); // Scheitelfarben sind linear, hex() liefert sRGB-Werte
const RED = lin(hex('#8a1a36'));
const RED_D = lin(hex('#5a0f24'));
const CARPET = [0.03, 0.012, 0.04];
const CARPET2 = [0.045, 0.016, 0.055];
const WALL = [0.12, 0.1, 0.17];
const GOLD = [0.6, 0.38, 0.08];
const DARK = [0.025, 0.02, 0.035];

function chairGeo() {
  return merge([
    box({ w: 0.5, h: 0.1, d: 0.46, y: 0.42, color: RED }),
    box({ w: 0.5, h: 0.55, d: 0.08, y: 0.74, z: -0.2, color: RED_D }),
    box({ w: 0.06, h: 0.3, d: 0.42, x: -0.27, y: 0.55, color: DARK }),
    box({ w: 0.06, h: 0.3, d: 0.42, x: 0.27, y: 0.55, color: DARK }),
    box({ w: 0.12, h: 0.38, d: 0.12, y: 0.19, color: DARK }),
  ]);
}

/** Falten: schmale Streifen mit wechselnder Helligkeit; Ursprung am äußeren Rand (dir 1 = nach +x, -1 = nach -x). */
function curtainGeo(w, h, dir) {
  const n = Math.max(4, Math.round(w / 0.45));
  const list = [];
  for (let i = 0; i < n; i++) {
    const sh = i % 2 ? 0.78 : 1;
    list.push(box({ w: w / n + 0.01, h, d: 0.14 + (i % 2 ? 0.08 : 0), x: dir * ((i + 0.5) * (w / n)), y: h / 2, color: [RED[0] * sh, RED[1] * sh, RED[2] * sh] }));
  }
  return merge(list);
}

/** Saal bauen. plan = buildPlan(p), p = layout.city.palast. Rückgabe: saal-Handle (attachSaal) + root, update(dt), diag(), dispose(). */
export function buildHall(plan, p) {
  const root = new Group();
  root.name = 'palast-hall';
  const hall = p.hall;
  const cx = plan.cx;

  const solid = new MeshBasicMaterial({ vertexColors: true });
  const solids = [];
  plan.steps.forEach((s, k) => solids.push(box({ w: s.x1 - s.x0, h: s.y, d: s.z1 - s.z0, x: (s.x0 + s.x1) / 2, y: s.y / 2, z: (s.z0 + s.z1) / 2, color: k % 2 ? CARPET : CARPET2 })));
  plan.platforms.forEach((q) => solids.push(box({ w: q.x1 - q.x0, h: q.y, d: q.z1 - q.z0, x: (q.x0 + q.x1) / 2, y: q.y / 2, z: (q.z0 + q.z1) / 2, color: q.row % 2 ? CARPET : CARPET2 })));
  solids.push(box({ w: hall.x1 - hall.x0, h: 0.02, d: 4, x: cx, y: 0.012, z: (plan.aisle.z + hall.z1) / 2 - 0.5, color: [0.05, 0.004, 0.016] })); // Läufer vor der ersten Reihe
  const wallLen = hall.z1 - hall.z0;
  const pillarZ = [];
  for (let k = 0; k * 3 < wallLen - 1; k++) pillarZ.push(hall.z0 + 1.5 + k * 3);
  for (const z of pillarZ) {
    for (const [x, sx] of [[hall.x0, 1], [hall.x1, -1]]) solids.push(box({ w: 0.2, h: hall.ceil - 0.6, d: 0.5, x: x + sx * 0.1, y: (hall.ceil - 0.6) / 2 + 0.3, z, color: WALL }));
  }
  solids.push(box({ w: hall.x1 - hall.x0 - 0.5, h: hall.ceil, d: 0.08, x: cx, y: hall.ceil / 2, z: hall.z1 - 0.06, color: [0.03, 0.03, 0.05] })); // Bühnenwand
  solids.push(box({ w: 13.2, h: 0.35, d: 0.3, x: cx, y: hall.ceil - 0.25, z: plan.curtain.z - 0.1, color: RED_D })); // Querbehang
  solids.push(box({ w: 13.4, h: 0.18, d: 0.5, x: cx, y: 0.09, z: plan.curtain.z + 0.1, color: [0.05, 0.03, 0.02] })); // Bühnenkante
  const solidMesh = new Mesh(merge(solids), solid);
  solidMesh.name = 'palast-hall-solid';
  root.add(solidMesh);

  const geo = chairGeo();
  const chairs = new InstancedMesh(geo, solid, Math.max(1, plan.seats.length));
  chairs.name = 'palast-hall-seats';
  chairs.frustumCulled = false;
  const m = new Matrix4();
  plan.seats.forEach((s, i) => { m.makeTranslation(s.x, s.base, s.z); chairs.setMatrixAt(i, m); });
  chairs.count = plan.seats.length;
  chairs.instanceMatrix.needsUpdate = true;
  root.add(chairs);

  const cu = plan.curtain;
  const curtainMat = new MeshBasicMaterial({ vertexColors: true });
  const curH = cu.y1 - cu.y0;
  const left = new Mesh(curtainGeo(cu.halfW, curH, 1), curtainMat);
  const right = new Mesh(curtainGeo(cu.halfW, curH, -1), curtainMat);
  left.position.set(cu.x - cu.halfW, cu.y0, cu.z);
  right.position.set(cu.x + cu.halfW, cu.y0, cu.z);
  left.name = 'palast-curtain-l';
  right.name = 'palast-curtain-r';
  root.add(left, right);

  const glowMat = new MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, opacity: 1 });
  const glows = [];
  for (const z of pillarZ) {
    glows.push(quad({ w: 0.35, h: 0.5, x: hall.x0 + 0.22, y: 2.6, z, ry: Math.PI / 2, color: [0.16, 0.08, 0.02] }));
    glows.push(quad({ w: 0.35, h: 0.5, x: hall.x1 - 0.22, y: 2.6, z, ry: -Math.PI / 2, color: [0.16, 0.08, 0.02] }));
  }
  for (const d of p.hallDoors) glows.push(quad({ w: 0.7, h: 0.22, x: (d.x0 + d.x1) / 2, y: 2.55, z: hall.z0 + 0.02, ry: Math.PI, color: [0.02, 0.4, 0.12] }));
  glows.push(box({ w: 13.4, h: 0.03, d: 0.06, x: cx, y: 0.21, z: cu.z - 0.16, color: GOLD }));
  const glowMesh = new Mesh(merge(glows), glowMat);
  glowMesh.name = 'palast-hall-glow';
  glowMesh.renderOrder = 6;
  root.add(glowMesh);

  const spillMat = new MeshBasicMaterial({ color: 0x000000, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
  const spillMesh = new Mesh(merge([
    quad({ w: hall.x1 - hall.x0 - 1, h: 3.4, x: cx, y: 0.03, z: (plan.aisle.z + cu.z) / 2, rx: -Math.PI / 2 }),
    quad({ w: 6, h: 3, x: hall.x0 + 0.1, y: 3.6, z: hall.z1 - 3.5, ry: Math.PI / 2 }),
    quad({ w: 6, h: 3, x: hall.x1 - 0.1, y: 3.6, z: hall.z1 - 3.5, ry: -Math.PI / 2 }),
  ]), spillMat);
  spillMesh.name = 'palast-hall-spill';
  spillMesh.renderOrder = 6;
  spillMesh.visible = false;
  root.add(spillMesh);

  // Leinwand-Anker: PalastCinema hängt die Leinwand-Gruppe hinein; lokales +z zeigt zum Publikum (Welt -z)
  const anchor = new Group();
  anchor.name = 'palast-screen-anchor';
  anchor.position.set(plan.screen.x, 0, plan.screen.z);
  anchor.rotation.y = plan.screen.yaw;
  root.add(anchor);

  const cur = { k: 0, target: 0 }; // 0 zu, 1 offen
  const applyCurtain = () => { const sx = 1 - 0.84 * cur.k; left.scale.x = sx; right.scale.x = sx; };
  applyCurtain();
  const lightK = { v: 1 };
  const setLight = (k) => {
    const v = Math.max(0, Math.min(1, Number.isFinite(k) ? k : 1));
    lightK.v = v;
    solid.color.setScalar(0.16 + 0.84 * v);
    curtainMat.color.setScalar(0.3 + 0.7 * v);
    glowMat.opacity = 0.25 + 0.75 * v;
  };
  setLight(1);
  const spillC = new Color(0, 0, 0);
  let spillK = 0;

  const saal = {
    root,
    anchor,
    screenOpts: { ...plan.screen.opts },
    seats: plan.seats.map((s) => ({ id: s.id, x: s.x, y: s.y, z: s.z, yaw: s.yaw })),
    aisle: { ...plan.aisle },
    bounds: { ...plan.bounds },
    curtain(open, instant) { cur.target = open ? 1 : 0; if (instant) { cur.k = cur.target; applyCurtain(); } },
    light: setLight,
    spill(c, k) {
      spillC.setRGB(Math.min(1, (c && c.r) || 0), Math.min(1, (c && c.g) || 0), Math.min(1, (c && c.b) || 0));
      spillK = k || 0;
      spillMat.color.copy(spillC).multiplyScalar(0.2 * spillK);
      spillMesh.visible = spillK > 0.01;
    },
    /** Pro Frame (Modul): Vorhang fährt in ca. 2 s. */
    update(dt) {
      if (cur.k === cur.target) return;
      const step = Math.max(0, dt) / 2.2;
      cur.k = cur.target > cur.k ? Math.min(cur.target, cur.k + step) : Math.max(cur.target, cur.k - step);
      applyCurtain();
    },
    diag: () => ({ curtain: cur.k, light: lightK.v, spill: spillK }),
    dispose() {
      geo.dispose();
      chairs.dispose();
      disposeTree(root);
      root.removeFromParent();
    },
  };
  return saal;
}
