// VIDEOTHEK LENZ · Stadt als Meshes (three): aus den reinen Daten von world/city.js (buildCity). Schlicht und prozedural, pro Material
// zusammengeführt (je Region ein Mesh, handytauglich). Materialien: Basic mit Vertexfarben und Tönung über `out.tint` (kein Licht).
// Gruppen (Namen für die Szenen-Partition, siehe modules/city.js): city-street (immer), city-palast (Hülle, immer),
// city-yard (Hof, Gasse, Feuertreppe, Dach), city-palast-interior (leer, Innenausbau Welle 2).
import {
  Group, Mesh, MeshBasicMaterial, AdditiveBlending, DoubleSide,
} from 'three';
import { box, quad, flatRect, merge } from '../util/geo.js';
import { makeCanvas, FONT } from './textures.js';
import { glowCanvas, windowGrid } from '../modules/outdoor.js';
import { seeded } from '../modules/m4-util.js';

const PI = Math.PI;
const T = 0.12;

const KIND_COLOR = {
  bench: [0.45, 0.3, 0.18], phone: [0.75, 0.1, 0.15], busstop: [0.3, 0.5, 0.6], mailbox: [0.9, 0.75, 0.1], hydrant: [0.8, 0.15, 0.1],
  bin: [0.25, 0.35, 0.3], bollard: [0.8, 0.8, 0.82], crate: [0.55, 0.4, 0.22], container: [0.15, 0.35, 0.5], car: [0.6, 0.1, 0.12],
  barrel: [0.2, 0.35, 0.55], hut: [0.2, 0.45, 0.5], kioskcounter: [0.7, 0.55, 0.3], escape: [0.28, 0.3, 0.34], post: [0.7, 0.7, 0.2],
  parapet: [0.5, 0.45, 0.4],
};
const STREET_KINDS = new Set(['bench', 'phone', 'busstop', 'mailbox', 'hydrant', 'bin', 'bollard', 'hut', 'kioskcounter', 'post']);

function slabCanvas() {
  const c = makeCanvas(128, 128);
  const x = c.getContext('2d');
  x.fillStyle = '#9a9da6'; x.fillRect(0, 0, 128, 128);
  const r = seeded(77);
  for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},0.05)`; x.fillRect(r() * 128, r() * 128, 3, 3); }
  x.strokeStyle = 'rgba(40,44,60,0.55)'; x.lineWidth = 3;
  x.strokeRect(1.5, 1.5, 125, 125);
  return c;
}

function asphaltCanvas() {
  const c = makeCanvas(128, 128);
  const x = c.getContext('2d');
  x.fillStyle = '#3b3e48'; x.fillRect(0, 0, 128, 128);
  const r = seeded(91);
  for (let i = 0; i < 380; i++) { x.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},0.07)`; x.fillRect(r() * 128, r() * 128, 2, 2); }
  return c;
}

const TILE_W = 512;
const TILE_H = 128;

function signAtlas(signs) {
  const c = makeCanvas(1024, 512);
  const x = c.getContext('2d');
  x.fillStyle = '#0b0f2c'; x.fillRect(0, 0, 1024, 512);
  signs.forEach((s, i) => {
    const ox = (i % 2) * TILE_W;
    const oy = Math.floor(i / 2) * TILE_H;
    x.save();
    x.translate(ox, oy);
    x.fillStyle = '#0b0f2c'; x.fillRect(0, 0, TILE_W, TILE_H);
    x.strokeStyle = s.color; x.lineWidth = 5; x.shadowColor = s.color; x.shadowBlur = 12;
    x.strokeRect(8, 8, TILE_W - 16, TILE_H - 16);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    let px = 74;
    x.font = `bold ${px}px ${FONT}`;
    while (x.measureText(s.text).width > TILE_W - 56 && px > 20) { px -= 3; x.font = `bold ${px}px ${FONT}`; }
    x.shadowBlur = 20; x.fillStyle = s.color;
    x.fillText(s.text, TILE_W / 2, TILE_H / 2 + 3);
    x.shadowBlur = 6; x.fillStyle = '#ffffff'; x.globalAlpha = 0.55;
    x.fillText(s.text, TILE_W / 2, TILE_H / 2 + 3);
    x.restore();
  });
  return c;
}

const B = (x0, z0, x1, z1, y0, y1, color) => box({ w: x1 - x0, h: y1 - y0, d: z1 - z0, x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, color });
const shadeOf = (c, k) => [c[0] * k, c[1] * k, c[2] * k];

/**
 * Baut die Stadt-Meshes. `out` = getOutdoor, `city` = buildCity-Ergebnis, `layout` = Laden-Layout.
 * Rückgabe { root, groups:{street,palast,yard,palastInterior}, setSignals(s), dispose() }.
 */
export function buildCityMeshes(out, city, layout) {
  const f = city.frame;
  const { W, D, fz, roadZ0, roadZ1, sz, xc0, xc1, XW0, XW1, zSN, zSS } = f;
  const rand = seeded(Math.round(W * 100 + D * 10) + 9);
  const root = new Group();
  root.name = 'city-root';
  out.group.add(root);
  const mk = (name) => { const g = new Group(); g.name = name; root.add(g); return g; };
  const street = mk('city-street');
  const palastG = mk('city-palast');
  const yard = mk('city-yard');
  const palastInterior = mk('city-palast-interior');

  const flat = out.tint(new MeshBasicMaterial({ vertexColors: true }));
  const walkMat = out.tint(new MeshBasicMaterial({ map: out.T(slabCanvas(), { repeat: true }), vertexColors: true }));
  const roadMat = out.tint(new MeshBasicMaterial({ map: out.T(asphaltCanvas(), { repeat: true }), vertexColors: true }));
  const put = (group, geos, mat, name) => {
    const geo = merge(geos);
    if (!geo) return null;
    const m = new Mesh(geo, mat);
    m.name = name;
    m.matrixAutoUpdate = false;
    group.add(m);
    return m;
  };

  // --- Boden ---
  const wk = (x0, z0, x1, z1, y = 0.002) => flatRect(x0, z0, x1, z1, { y, tile: 1.4, roomW: 1, roomD: 1 });
  const aL = xc0 - 2.4;
  const aR = xc1 + 2.4;
  const walk = [
    wk(XW0, D, aL, roadZ0), wk(aR, D, XW1, roadZ0), wk(XW0, roadZ1, aL, sz), wk(aR, roadZ1, XW1, sz),
    wk(aL, zSN, xc0, roadZ0), wk(xc1, zSN, aR, roadZ0), wk(aL, roadZ1, xc0, zSS), wk(xc1, roadZ1, aR, zSS),
    wk(W + 8.4, D - 2.0, W + 11.6, D), // Kiosk-Tasche
    wk(-3.4, -T, -T, D), // Gasse
  ];
  put(street, walk, walkMat, 'city-walk');
  const road = [flatRect(XW0, roadZ0, XW1, roadZ1, { y: -0.01, tile: 2.2 }), flatRect(xc0, zSN, xc1, roadZ0, { y: -0.01, tile: 2.2 }), flatRect(xc0, roadZ1, xc1, zSS, { y: -0.01, tile: 2.2 })];
  put(street, road, roadMat, 'city-road');

  // Markierungen, Bordsteine, Zebrastreifen
  const mk2 = [];
  const CURB = [0.62, 0.62, 0.66];
  for (const [a, b] of [[XW0, aL], [aR, XW1]]) {
    mk2.push(B(a, roadZ0 - 0.16, b, roadZ0, 0, 0.14, CURB));
    mk2.push(B(a, roadZ1, b, roadZ1 + 0.16, 0, 0.14, CURB));
  }
  const DASH = [0.92, 0.88, 0.62];
  for (let x = XW0 + 1; x < XW1; x += 3.2) { if (x > xc0 - 1.5 && x < xc1 + 0.5) continue; mk2.push(B(x, f.roadMid - 0.07, x + 1.5, f.roadMid + 0.07, 0, 0.012, DASH)); }
  for (let z = zSN + 1; z < zSS; z += 3.2) { if (z > roadZ0 - 1.5 && z < roadZ1 + 0.5) continue; mk2.push(B((xc0 + xc1) / 2 - 0.07, z, (xc0 + xc1) / 2 + 0.07, z + 1.5, 0, 0.012, DASH)); }
  const WHITE = [0.93, 0.93, 0.95];
  for (const zb of city.zebras) {
    const lx = zb.x1 - zb.x0;
    const lz = zb.z1 - zb.z0;
    if (lz >= lx) for (let z = zb.z0 + 0.3; z + 0.4 <= zb.z1; z += 0.8) mk2.push(B(zb.x0, z, zb.x1, z + 0.4, 0, 0.014, WHITE));
    else for (let x = zb.x0 + 0.3; x + 0.4 <= zb.x1; x += 0.8) mk2.push(B(x, zb.z0, x + 0.4, zb.z1, 0, 0.014, WHITE));
  }
  put(street, mk2, flat, 'city-marks');

  // --- Gebäude je Region ---
  const byRegion = {};
  const winSpecs = [];
  const DARK = [0.14, 0.15, 0.2];
  for (const b of city.buildings) {
    const list = byRegion[b.region] || (byRegion[b.region] = []);
    const w = b.x1 - b.x0;
    const d = b.z1 - b.z0;
    list.push(B(b.x0, b.z0, b.x1, b.z1, 0, b.h, b.color));
    list.push(box({ w: w + 0.3, h: 0.35, d: d + 0.3, x: (b.x0 + b.x1) / 2, y: b.h + 0.1, z: (b.z0 + b.z1) / 2, color: shadeOf(b.color, 0.6) })); // Dachkante
    if (b.front && w > 3) {
      const z = b.front === 'S' ? b.z1 + 0.01 : b.z0 - 0.01;
      windowGrid(winSpecs, b.x0 + 1.2, b.x1 - 0.2, 1.3, Math.floor((b.h - 1.4) / 2.7), z, b.front === 'S' ? 1 : -1, rand);
      list.push(box({ w: 1.1, h: 2.2, d: 0.1, x: b.x0 + w * 0.25, y: 1.1, z: b.front === 'S' ? b.z1 + 0.02 : b.z0 - 0.02, color: DARK })); // Haustür
    }
  }
  for (const [key, list] of Object.entries(byRegion)) put(key === 'Y' ? yard : street, list, flat, `city-bld-${key}`);
  const ws = out.addWindows(winSpecs);
  if (ws) { ws.mesh.name = 'city-windows'; street.add(ws.mesh); }

  // --- Palast-Hülle ---
  const p = city.palast;
  const PC = [0.2, 0.18, 0.32];
  const pl = [];
  const r = p.rect;
  const ph = p.h;
  pl.push(B(r.x0, r.z0, p.doorX0, r.z0 + p.wall, 0, ph, PC), B(p.doorX1, r.z0, r.x1, r.z0 + p.wall, 0, ph, PC), B(p.doorX0, r.z0, p.doorX1, r.z0 + p.wall, 3.2, ph, PC));
  pl.push(B(r.x0, r.z0, r.x0 + p.wall, r.z1, 0, ph, shadeOf(PC, 0.8)), B(r.x1 - p.wall, r.z0, r.x1, r.z1, 0, ph, shadeOf(PC, 0.8)), B(r.x0, r.z1 - p.wall, r.x1, r.z1, 0, ph, shadeOf(PC, 0.8)));
  pl.push(B(r.x0, r.z0, r.x1, r.z1, ph, ph + 0.25, shadeOf(PC, 0.6))); // Dach
  pl.push(B(p.foyer.x0, p.foyer.z0, p.foyer.x1, p.foyer.z1, p.foyer.ceil, p.foyer.ceil + 0.2, [0.12, 0.1, 0.18])); // Foyer-Decke (Platzhalter)
  pl.push(B(p.hall.x0, p.hall.z0, p.hall.x1, p.hall.z1, p.hall.ceil, p.hall.ceil + 0.2, [0.07, 0.06, 0.1])); // Saal-Decke (Platzhalter)
  const pz = p.foyer.z1;
  const hd0 = p.hallDoors[0];
  const hd1 = p.hallDoors[1];
  for (const [a, b2] of [[p.foyer.x0, hd0.x0], [hd0.x1, hd1.x0], [hd1.x1, p.foyer.x1]]) pl.push(B(a, pz, b2, pz + 0.25, 0, p.hall.ceil, [0.16, 0.14, 0.24]));
  pl.push(B(p.foyer.x0, p.foyer.z0, p.hall.x1, p.hall.z1, 0.0, 0.012, [0.1, 0.09, 0.14])); // Boden (dunkel, Platzhalter)
  const c = p.canopy;
  pl.push(B(c.x0, c.z0, c.x1, c.z1, c.y, c.y + 0.18, [0.85, 0.2, 0.45]), B(c.x0, c.z0, c.x1, c.z1, c.y - 0.04, c.y, [1, 0.88, 0.55])); // Vordach + Leuchtleiste
  pl.push(B(r.x0 - 0.1, r.z0 - 0.1, r.x1 + 0.1, r.z0 + 0.12, ph - 0.25, ph, [1, 0.24, 0.5])); // Dachrand-Streifen
  put(palastG, pl, flat, 'city-palast-shell');

  // --- Hof, Dach, Feuertreppe, Straßenmöbel (aus den Kollidern) ---
  const yardGeos = [flatRect(-3.4, -11.0, W + 8.4, -T, { y: 0.002, tile: 1.4 })];
  put(yard, yardGeos, walkMat, 'city-yard-floor');
  const yg = [];
  const sg = [];
  for (const q of city.colliders) {
    if (!Number.isFinite(q.y1) || !KIND_COLOR[q.kind]) continue;
    const y0 = q.y0 || 0;
    const geo = B(q.x0, q.z0, q.x1, q.z1, y0, q.y1, KIND_COLOR[q.kind]);
    (STREET_KINDS.has(q.kind) ? sg : yg).push(geo);
  }
  // Dachfläche (Oberseite grau) und Außenhaut des Ladens zu Gasse und Hof
  yg.push(B(-T - 0.03, -T - 0.03, W + T, D + T, 3.0, 3.3, [0.32, 0.32, 0.36]));
  yg.push(B(-T - 0.03, -T - 0.03, W + T, -T, 0, 3.0, [0.55, 0.3, 0.26]));
  yg.push(B(-T - 0.03, -T, -T, D, 0, 3.0, [0.58, 0.34, 0.28]));
  put(yard, yg, flat, 'city-yard-props');

  // Absperrungen an den Straßenenden (rot-weiß) und dunkle Tunnelwände dahinter
  const gates = [];
  const bar = (x0, z0, x1, z1) => { gates.push(B(x0, z0, x1, z1, 0, 0.8, [0.85, 0.18, 0.18]), B(x0, z0, x1, z1, 0.8, 1.05, [0.95, 0.95, 0.95])); };
  bar(XW0, fz, XW0 + 0.4, sz);
  bar(XW1 - 0.4, fz, XW1, sz);
  bar(xc0 - 2.4, zSN, xc1 + 2.4, zSN + 0.4);
  bar(xc0 - 2.4, zSS - 0.4, xc1 + 2.4, zSS);
  const TUN = [0.05, 0.06, 0.09];
  gates.push(B(XW0 - 9, fz, XW0, sz, 0, 6, TUN), B(XW1, fz, XW1 + 9, sz, 0, 6, TUN));
  put(street, gates, flat, 'city-gates');
  if (sg.length) put(street, sg, flat, 'city-street-props');

  // --- Laternen, Glanz ---
  const poles = [];
  const glows = [];
  const POLE = [0.18, 0.2, 0.24];
  for (const l of city.lights) {
    poles.push(box({ w: 0.1, h: l.h, d: 0.1, x: l.x, y: l.h / 2, z: l.z, color: POLE }));
    poles.push(box({ w: 0.1, h: 0.08, d: Math.abs(l.armDz) * 1.1, x: l.x, y: l.h, z: l.z + l.armDz * 0.48, color: POLE }));
    poles.push(box({ w: 0.34, h: 0.12, d: 0.34, x: l.x, y: l.h - 0.06, z: l.z + l.armDz, color: [1, 0.92, 0.7] }));
    glows.push(quad({ w: 2.6, h: 2.6, x: l.x, y: l.h - 0.1, z: l.z + l.armDz, ry: PI, color: [1, 0.84, 0.55] }));
    glows.push(quad({ w: 5.2, h: 3.6, x: l.x, y: 0.014, z: l.z + l.armDz * 0.3, rx: -PI / 2, color: [1, 0.78, 0.45] }));
  }
  const zW0 = D + T;
  for (const wd of layout.facade.windows || []) glows.push(quad({ w: (wd.x1 - wd.x0) * 1.15, h: 2.4, x: (wd.x0 + wd.x1) / 2, y: 0.014, z: zW0 + 1.0, rx: -PI / 2, color: [1, 0.86, 0.6] }));
  const dr = layout.facade.door;
  glows.push(quad({ w: dr.w * 1.6, h: 2.8, x: (dr.x0 + dr.x1) / 2, y: 0.014, z: zW0 + 1.2, rx: -PI / 2, color: [1, 0.86, 0.6] }));
  glows.push(quad({ w: 8, h: 4, x: W / 2, y: 0.014, z: sz - 1.2, rx: -PI / 2, color: [1, 0.7, 0.8] })); // Palast-Vordach
  glows.push(quad({ w: 3.4, h: 3, x: W + 10, y: 0.014, z: D + 1.2, rx: -PI / 2, color: [1, 0.7, 0.9] })); // Kiosk
  put(street, poles, flat, 'city-lamps');
  const glowMat = new MeshBasicMaterial({ map: out.T(glowCanvas()), vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, opacity: 0, fog: false });
  const glowMesh = put(street, glows, glowMat, 'city-glow');
  glowMesh.renderOrder = 7;
  glowMesh.visible = false;
  out.hooks.push((tod, rain) => { glowMesh.visible = tod !== 'day'; glowMat.opacity = tod === 'night' ? (rain ? 0.5 : 0.62) : 0.3; });

  // --- Ampelmasten (Lampen werden pro Phase umgefärbt) ---
  const sigBody = [];
  const lampGeos = [];
  const LAMP_YS = [3.0, 2.84, 2.68]; // rot, gelb, grün
  const FACE = { mainE: -PI / 2, mainW: PI / 2, sideS: PI, sideN: 0 };
  city.signals.forEach((s) => {
    sigBody.push(box({ w: 0.08, h: 3.2, d: 0.08, x: s.x, y: 1.6, z: s.z, color: POLE }));
    sigBody.push(box({ w: 0.26, h: 0.62, d: 0.26, x: s.x, y: 2.84, z: s.z, color: [0.08, 0.08, 0.1] }));
    const ry = FACE[s.id];
    const nx = Math.sin(ry) * 0.14;
    const nz = Math.cos(ry) * 0.14;
    for (const y of LAMP_YS) lampGeos.push(quad({ w: 0.15, h: 0.15, x: s.x + nx, y, z: s.z + nz, ry, color: [0.1, 0.1, 0.1] }));
  });
  put(street, sigBody, flat, 'city-signal-poles');
  const lampGeo = merge(lampGeos);
  const lampMesh = new Mesh(lampGeo, new MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  lampMesh.name = 'city-signal-lamps';
  lampMesh.matrixAutoUpdate = false;
  street.add(lampMesh);
  const COLORS = { red: [1, 0.12, 0.1], yellow: [1, 0.78, 0.1], green: [0.12, 1, 0.3] };
  const OFF = [0.12, 0.1, 0.1];
  let lastSig = '';
  function setSignals(sig) {
    const key = `${sig.main}|${sig.side}`;
    if (key === lastSig) return;
    lastSig = key;
    const attr = lampGeo.attributes.color;
    city.signals.forEach((s, i) => {
      const phase = s.signal === 'main' ? sig.main : sig.side;
      ['red', 'yellow', 'green'].forEach((name, k) => {
        const col = phase === name ? COLORS[name] : OFF;
        for (let v = 0; v < 4; v++) attr.setXYZ((i * 3 + k) * 4 + v, col[0], col[1], col[2]);
      });
    });
    attr.needsUpdate = true;
  }

  // --- Schilder (erfundene Namen) ---
  const atlasTex = out.T(signAtlas(city.signs), { aniso: 4 });
  const signMat = new MeshBasicMaterial({ map: atlasTex, toneMapped: false });
  const signGeos = city.signs.map((s, i) => {
    const h = s.w / 4;
    const u0 = (i % 2) * 0.5;
    const v1 = 1 - (Math.floor(i / 2) * TILE_H) / 512;
    return quad({ w: s.w, h, x: s.x, y: s.y, z: s.z, ry: s.yaw, uv: [u0, v1 - TILE_H / 512, u0 + 0.5, v1] });
  });
  put(street, signGeos, signMat, 'city-signs');

  return {
    root, groups: { street, palast: palastG, yard, palastInterior }, setSignals,
    dispose() { root.removeFromParent(); },
  };
}
