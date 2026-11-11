// VIDEOTHEK LENZ · M4 Außenbereich (gemeinsam von daytime.js und intro.js genutzt, einmal je Szene):
// Himmelskuppel + Sterne + Mond, Gehweg, Straße, gegenüberliegende Häuserzeile mit Fenstern, Straßenlaternen.
// Die Fassade (Verkleidung mit Öffnungen, Leuchtschild, Öffnungszeiten, Rollladen) entsteht nur auf Anfrage (addFacade, Intro).
// Alles Basic-Material (unbeleuchtet), per Palette getönt; zusammengeführte Geometrien (≈ 11 Draw-Calls, beim Blick nach innen größtenteils verdeckt).
import {
  Group, Mesh, Points, MeshBasicMaterial, PointsMaterial, SphereGeometry, CircleGeometry, BufferGeometry, Float32BufferAttribute,
  AdditiveBlending, BackSide, DoubleSide, PlaneGeometry,
} from 'three';
import { box, quad, flatRect, merge, hex, rng, disposeTree } from '../util/geo.js';
import { makeCanvas, toTexture, FONT } from '../world/textures.js';
import { shared, skyPalette, timeOfDay, lerp } from './m4-util.js';

const PI = Math.PI;
const FAR_R = 60;
const WALL_OUT = 0.12; // Außenkante der Südwand (WALL_T)

function glowCanvas() {
  const c = makeCanvas(64, 64);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return c;
}

function slabCanvas() {
  const c = makeCanvas(128, 128);
  const x = c.getContext('2d');
  x.fillStyle = '#9a9da6'; x.fillRect(0, 0, 128, 128);
  const r = rng(77);
  for (let i = 0; i < 160; i++) { x.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},0.05)`; x.fillRect(r() * 128, r() * 128, 3, 3); }
  x.strokeStyle = 'rgba(40,44,60,0.55)'; x.lineWidth = 3;
  x.strokeRect(1.5, 1.5, 125, 125);
  return c;
}

function asphaltCanvas() {
  const c = makeCanvas(128, 128);
  const x = c.getContext('2d');
  x.fillStyle = '#3b3e48'; x.fillRect(0, 0, 128, 128);
  const r = rng(91);
  for (let i = 0; i < 380; i++) { x.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},0.07)`; x.fillRect(r() * 128, r() * 128, 2, 2); }
  return c;
}

function moonCanvas() {
  const c = makeCanvas(128, 128);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(64, 64, 18, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,248,220,0.55)'); g.addColorStop(1, 'rgba(255,248,220,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  x.fillStyle = '#fff6d8'; x.beginPath(); x.arc(64, 64, 17, 0, PI * 2); x.fill();
  x.fillStyle = 'rgba(190,175,140,0.5)';
  x.beginPath(); x.arc(58, 60, 4, 0, PI * 2); x.arc(70, 69, 3, 0, PI * 2); x.fill();
  return c;
}

function shutterCanvas() {
  const c = makeCanvas(64, 128);
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    const y = i * 16;
    x.fillStyle = '#7f8b98'; x.fillRect(0, y, 64, 16);
    x.fillStyle = '#a7b2bf'; x.fillRect(0, y, 64, 4);
    x.fillStyle = '#566170'; x.fillRect(0, y + 12, 64, 4);
  }
  return c;
}

function signCanvas() {
  const c = makeCanvas(1024, 256);
  const x = c.getContext('2d');
  x.fillStyle = '#0b0f2c'; x.fillRect(0, 0, 1024, 256);
  x.strokeStyle = '#ff3d7f'; x.lineWidth = 8; x.shadowColor = '#ff3d7f'; x.shadowBlur = 18;
  x.beginPath(); x.roundRect ? x.roundRect(14, 14, 996, 228, 28) : x.rect(14, 14, 996, 228); x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  let px = 118;
  x.font = `bold ${px}px ${FONT}`;
  while (x.measureText('VIDEOTHEK LENZ').width > 900 && px > 40) { px -= 4; x.font = `bold ${px}px ${FONT}`; }
  x.shadowColor = '#35e6ff'; x.shadowBlur = 36; x.fillStyle = '#35e6ff';
  x.fillText('VIDEOTHEK LENZ', 512, 108);
  x.shadowBlur = 14; x.fillStyle = '#d9fbff';
  x.fillText('VIDEOTHEK LENZ', 512, 108);
  x.font = `bold 46px ${FONT}`;
  x.shadowColor = '#ffd23f'; x.shadowBlur = 22; x.fillStyle = '#ffd23f';
  x.fillText('Verleih & Verkauf', 512, 200);
  return c;
}

function hoursCanvas() {
  const c = makeCanvas(160, 240);
  const x = c.getContext('2d');
  x.fillStyle = '#f3ead2'; x.fillRect(0, 0, 160, 240);
  x.fillStyle = '#12163a'; x.fillRect(0, 0, 160, 36);
  x.fillStyle = '#ffd23f'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `bold 17px ${FONT}`; x.fillText('ÖFFNUNGSZEITEN', 80, 19);
  x.fillStyle = '#222';
  x.font = `bold 20px ${FONT}`;
  const rows = [['Mo – Fr', '10 – 22 Uhr'], ['Samstag', '10 – 23 Uhr'], ['Sonntag', '13 – 20 Uhr']];
  rows.forEach(([a, b], i) => { x.fillText(a, 80, 74 + i * 52); x.font = `16px ${FONT}`; x.fillText(b, 80, 96 + i * 52); x.font = `bold 20px ${FONT}`; });
  x.fillStyle = '#b3261e'; x.font = `bold 13px ${FONT}`; x.fillText('Kassetten zurück bis 18 Uhr', 80, 226);
  return c;
}

/** Fenstergitter-Spezifikationen: nach innen (−z) oder außen (+z) gerichtet. */
function windowGrid(out, x0, x1, y0, floors, z, facing, rand, { w = 0.9, h = 1.3, gap = 1.75, floorH = 2.7 } = {}) {
  const n = Math.max(1, Math.floor((x1 - x0 - 0.6) / gap));
  const pad = (x1 - x0 - n * gap) / 2 + gap / 2;
  for (let f = 0; f < floors; f++) {
    for (let i = 0; i < n; i++) {
      out.push({ x: x0 + pad + i * gap, y: y0 + f * floorH + floorH / 2, z, w, h, ry: facing < 0 ? PI : 0, lit: rand() });
    }
  }
}

function buildWindowSet(specs) {
  if (!specs.length) return null;
  const geo = merge(specs.map((s) => quad({ w: s.w, h: s.h, x: s.x, y: s.y, z: s.z, ry: s.ry })));
  const mat = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
  const mesh = new Mesh(geo, mat);
  mesh.matrixAutoUpdate = false;
  const attr = geo.attributes.color;
  const WARM = [1, 0.8, 0.46];
  const COOL = [0.6, 0.8, 1];
  return {
    mesh,
    recolor(tod, rain) {
      const litP = tod === 'night' ? 0.55 : tod === 'dusk' ? 0.4 : 0.06;
      specs.forEach((s, i) => {
        let c;
        if (s.lit < litP) c = s.lit < litP * 0.7 ? WARM : COOL;
        else if (tod === 'night') c = [0.05, 0.07, 0.15];
        else if (tod === 'dusk') c = [0.28, 0.3, 0.45];
        else c = rain ? [0.42, 0.5, 0.6] : [0.45, 0.62, 0.8];
        for (let k = 0; k < 4; k++) attr.setXYZ(i * 4 + k, c[0], c[1], c[2]);
      });
      attr.needsUpdate = true;
    },
  };
}

/** Wand entlang x mit Öffnungen (Pfeiler/Brüstung/Sturz als Quader) – Außenverkleidung. */
function claddingParts(list, x0, x1, zc, t, h, openings, color) {
  const part = (a, b, ya, yb) => {
    if (b - a < 0.005 || yb - ya < 0.005) return;
    list.push(box({ w: b - a, h: yb - ya, d: t, x: (a + b) / 2, y: (ya + yb) / 2, z: zc, color }));
  };
  let cur = x0;
  for (const o of [...openings].sort((a, b) => a.x0 - b.x0)) {
    part(cur, o.x0, 0, h);
    part(o.x0, o.x1, 0, o.y0);
    part(o.x0, o.x1, o.y1, h);
    cur = o.x1;
  }
  part(cur, x1, 0, h);
}

function buildOutdoor(ctx) {
  const L = ctx.layout;
  const W = L.w;
  const D = L.d;
  const rand = rng(Math.round(W * 100 + D * 10) + 5);
  const group = new Group();
  group.name = 'm4-outdoor';
  ctx.scene.add(group);
  ctx.track(group);

  // Alte Nachtkulisse und Straßenfläche (benannt in world/build-room.js) ausblenden: ersetzt durch diese Szene.
  for (const n of ['lfx-backdrop', 'lfx-street']) { const o = ctx.scene.getObjectByName(n); if (o) o.visible = false; }

  const textures = [];
  const T = (c, o) => { const t = toTexture(c, { aniso: 2, ...o }); textures.push(t); return t; };
  const tinted = []; // { mat, base:[r,g,b] }
  const tint = (mat, base = [1, 1, 1]) => { tinted.push({ mat, base }); return mat; };
  const windowSets = [];
  const out = { group, tod: 'day', rain: false, pal: null, windowSets, tinted, L, textures };

  // --- Himmel (folgt der Kamera) ---
  const skyRoot = new Group();
  group.add(skyRoot);
  const skyGeo = new SphereGeometry(FAR_R, 20, 10, 0, PI * 2, 0, PI / 2);
  skyGeo.setAttribute('color', new Float32BufferAttribute(new Float32Array(skyGeo.attributes.position.count * 3), 3));
  const sky = new Mesh(skyGeo, new MeshBasicMaterial({ vertexColors: true, side: BackSide, depthWrite: false }));
  sky.renderOrder = 10;
  sky.frustumCulled = false;
  const groundGeo = new CircleGeometry(FAR_R, 24);
  groundGeo.rotateX(-PI / 2);
  groundGeo.setAttribute('color', new Float32BufferAttribute(new Float32Array(groundGeo.attributes.position.count * 3), 3));
  const ground = new Mesh(groundGeo, new MeshBasicMaterial({ vertexColors: true, depthWrite: false }));
  ground.renderOrder = -10; // zuerst zeichnen, ohne Tiefe: alles andere (Boden, Gehweg) liegt davor
  ground.position.y = -0.05;
  ground.frustumCulled = false;
  const starPos = [];
  for (let i = 0; i < 420; i++) {
    const a = rand() * PI * 2;
    const e = 0.08 + rand() * 0.9;
    const r = FAR_R * 0.96;
    starPos.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
  }
  const starGeo = new BufferGeometry();
  starGeo.setAttribute('position', new Float32BufferAttribute(starPos, 3));
  const stars = new Points(starGeo, new PointsMaterial({ color: 0xffffff, size: 2.8, sizeAttenuation: false, transparent: true, depthWrite: false }));
  stars.frustumCulled = false;
  stars.renderOrder = 11;
  const moon = new Mesh(new PlaneGeometry(13, 13), new MeshBasicMaterial({ map: T(moonCanvas()), transparent: true, depthWrite: false, blending: AdditiveBlending }));
  moon.position.set(-9, 17, FAR_R * 0.8);
  moon.rotation.y = PI; // Fläche zeigt zum Laden (−z)
  moon.renderOrder = 11;
  moon.frustumCulled = false;
  skyRoot.add(sky, ground, stars, moon);

  // --- Gehweg + Straße ---
  const walkMap = T(slabCanvas(), { repeat: true });
  const roadMap = T(asphaltCanvas(), { repeat: true });
  const zW0 = D + WALL_OUT;
  const zWalk0 = D; // Gehweg beginnt an der Innenkante der Wand (kein Spalt unter der Tür)
  const zCurb = D + 2.6;
  const zRoad1 = D + 8.5;
  const zBuild = D + 10.7;
  const X0 = -32;
  const X1 = W + 32;
  const walkGeo = merge([
    flatRect(X0, zWalk0, X1, zCurb, { y: 0.002, tile: 1.4, roomW: 1, roomD: 1 }),
    flatRect(X0, zRoad1, X1, zBuild, { y: 0.002, tile: 1.4, roomW: 1, roomD: 1 }),
  ]);
  group.add(new Mesh(walkGeo, tint(new MeshBasicMaterial({ map: walkMap, vertexColors: true }))));
  group.children[group.children.length - 1].matrixAutoUpdate = false;
  const roadGeo = flatRect(X0, zCurb + 0.15, X1, zRoad1, { y: -0.01, tile: 2.2, roomW: 1, roomD: 1 });
  group.add(new Mesh(roadGeo, tint(new MeshBasicMaterial({ map: roadMap, vertexColors: true }))));
  const detail = [];
  detail.push(box({ w: X1 - X0, h: 0.14, d: 0.16, x: (X0 + X1) / 2, y: 0.07, z: zCurb + 0.04, color: [0.62, 0.62, 0.66] }));
  detail.push(box({ w: X1 - X0, h: 0.14, d: 0.16, x: (X0 + X1) / 2, y: 0.07, z: zRoad1 + 0.04, color: [0.62, 0.62, 0.66] }));
  for (let x = X0 + 1; x < X1; x += 3.2) detail.push(box({ w: 1.5, h: 0.01, d: 0.14, x, y: 0.0, z: (zCurb + zRoad1) / 2, color: [0.92, 0.88, 0.62] }));
  group.add(new Mesh(merge(detail), tint(new MeshBasicMaterial({ vertexColors: true }))));

  // --- Gegenüber: Häuserzeile mit Fenstern ---
  const bld = [];
  const winSpecs = [];
  const PALETTE = [[0.55, 0.28, 0.24], [0.62, 0.5, 0.36], [0.38, 0.42, 0.52], [0.5, 0.36, 0.4], [0.42, 0.5, 0.42], [0.6, 0.55, 0.5]];
  for (let x = X0; x < X1 - 2;) {
    const w = 5.5 + rand() * 4;
    const h = 4.2 + rand() * 3.6; // niedrig genug, damit man vom Fenster Himmel und Sterne sieht
    const wx = Math.min(w, X1 - x);
    const col = PALETTE[Math.floor(rand() * PALETTE.length)];
    bld.push(box({ w: wx, h, d: 5, x: x + wx / 2, y: h / 2, z: zBuild + 2.5, color: col }));
    bld.push(box({ w: wx + 0.3, h: 0.35, d: 5.3, x: x + wx / 2, y: h + 0.1, z: zBuild + 2.5, color: [col[0] * 0.6, col[1] * 0.6, col[2] * 0.6] })); // Dachkante
    windowGrid(winSpecs, x, x + wx, 0.9, Math.floor((h - 1.2) / 2.7), zBuild - 0.02, -1, rand);
    x += wx + 0.0;
  }
  group.add(new Mesh(merge(bld), tint(new MeshBasicMaterial({ vertexColors: true }))));
  group.children[group.children.length - 1].matrixAutoUpdate = false;
  const farWin = buildWindowSet(winSpecs);
  if (farWin) { group.add(farWin.mesh); windowSets.push(farWin); }

  // --- Straßenlaternen (Masten + Leuchtkörper) und Lichtglanz (additiv) ---
  const lampXs = [];
  for (const wd of (L.facade && L.facade.windows) || []) lampXs.push((wd.x0 + wd.x1) / 2);
  if (!lampXs.length) lampXs.push(W * 0.3, W * 0.7);
  lampXs.push(-4.5, W + 4.5);
  const lz = D + 2.45;
  const poles = [];
  const glows = [];
  for (const x of lampXs) {
    poles.push(box({ w: 0.1, h: 4.2, d: 0.1, x, y: 2.1, z: lz, color: [0.18, 0.2, 0.24] }));
    poles.push(box({ w: 0.1, h: 0.08, d: 0.7, x, y: 4.2, z: lz - 0.3, color: [0.18, 0.2, 0.24] }));
    poles.push(box({ w: 0.34, h: 0.12, d: 0.34, x, y: 4.14, z: lz - 0.62, color: [1, 0.92, 0.7] }));
    glows.push(quad({ w: 2.6, h: 2.6, x, y: 4.1, z: lz - 0.62, ry: PI, color: [1, 0.84, 0.55] }));
    glows.push(quad({ w: 5.2, h: 3.6, x, y: 0.012, z: lz - 0.2, rx: -PI / 2, color: [1, 0.78, 0.45] }));
  }
  for (const wd of (L.facade && L.facade.windows) || []) {
    glows.push(quad({ w: (wd.x1 - wd.x0) * 1.15, h: 2.4, x: (wd.x0 + wd.x1) / 2, y: 0.011, z: zW0 + 1.0, rx: -PI / 2, color: [1, 0.86, 0.6] }));
  }
  if (L.facade && L.facade.door) {
    const d = L.facade.door;
    glows.push(quad({ w: d.w * 1.6, h: 2.8, x: (d.x0 + d.x1) / 2, y: 0.011, z: zW0 + 1.2, rx: -PI / 2, color: [1, 0.86, 0.6] }));
  }
  group.add(new Mesh(merge(poles), tint(new MeshBasicMaterial({ vertexColors: true }), [1, 1, 1])));
  const glowMat = new MeshBasicMaterial({ map: T(glowCanvas()), vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, opacity: 0 });
  const glowMesh = new Mesh(merge(glows), glowMat);
  glowMesh.renderOrder = 7;
  glowMesh.visible = false;
  group.add(glowMesh);

  // --- Palette ---
  out.setPalette = (tod, rain) => {
    out.tod = tod; out.rain = !!rain;
    const pal = skyPalette(tod, rain);
    out.pal = pal;
    const pos = skyGeo.attributes.position;
    const col = skyGeo.attributes.color;
    const [zen, mid, hor] = pal.sky;
    for (let i = 0; i < pos.count; i++) {
      const t = Math.min(1, Math.max(0, pos.getY(i) / FAR_R));
      const a = t < 0.35 ? hor : mid;
      const b = t < 0.35 ? mid : zen;
      const k = t < 0.35 ? t / 0.35 : (t - 0.35) / 0.65;
      col.setXYZ(i, lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
    }
    col.needsUpdate = true;
    const gp = groundGeo.attributes.position;
    const gc = groundGeo.attributes.color;
    const street = [pal.shade[0] * 0.24, pal.shade[1] * 0.25, pal.shade[2] * 0.28];
    for (let i = 0; i < gp.count; i++) {
      const k = Math.min(1, Math.hypot(gp.getX(i), gp.getZ(i)) / FAR_R);
      gc.setXYZ(i, lerp(street[0], hor[0], k * k), lerp(street[1], hor[1], k * k), lerp(street[2], hor[2], k * k));
    }
    gc.needsUpdate = true;
    for (const t of tinted) t.mat.color.setRGB(t.base[0] * pal.shade[0], t.base[1] * pal.shade[1], t.base[2] * pal.shade[2]);
    stars.visible = pal.stars > 0.01;
    stars.material.opacity = pal.stars;
    moon.visible = tod === 'night' && !rain;
    for (const w of windowSets) w.recolor(tod, rain);
    glowMesh.visible = tod !== 'day';
    glowMat.opacity = tod === 'night' ? (rain ? 0.5 : 0.62) : 0.3;
  };
  out.follow = (cam) => { skyRoot.position.set(cam.position.x, 0, cam.position.z); };
  out.addWindows = (specs) => {
    const ws = buildWindowSet(specs);
    if (!ws) return null;
    ws.recolor(out.tod, out.rain);
    windowSets.push(ws);
    return ws;
  };
  out.setPalette(timeOfDay(), false);
  return out;
}

/** Gemeinsamen Außenbereich holen (legt ihn beim ersten Aufruf an). */
export function getOutdoor(ctx) {
  return shared(ctx.scene, 'outdoor', () => buildOutdoor(ctx));
}

/**
 * Fassade von außen (nur fürs Intro): Verkleidung mit Öffnungen, Nachbarhäuser, Leuchtschild, Öffnungszeiten, Rollladen.
 * Rückgabe: { shutter(open 0..1), flicker(t), dispose() }.
 */
export function addFacade(ctx, out) {
  const L = out.L;
  const W = L.w;
  const D = L.d;
  const rand = rng(4711);
  const group = new Group();
  group.name = 'm4-facade';
  out.group.add(group);
  const door = L.facade.door;
  const windows = L.facade.windows || [];
  const z0 = D + WALL_OUT + 0.05;
  const front = z0 + 0.04; // Außenfläche der Verkleidung
  const openings = [{ x0: door.x0, x1: door.x1, y0: 0, y1: 2.4 }, ...windows.map((w) => ({ x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1 }))];
  const parts = [];
  const TEAL = hex('#1c4f5e');
  claddingParts(parts, -WALL_OUT, W + WALL_OUT, z0, 0.08, 2.85, openings, TEAL);
  const NAVY = hex('#10153a');
  parts.push(box({ w: W + 2 * WALL_OUT, h: 2.35, d: 0.08, x: W / 2, y: 4.0, z: z0, color: NAVY }));
  for (const [y, c] of [[5.12, [1, 0.24, 0.5]], [2.9, [1, 0.82, 0.25]]]) parts.push(box({ w: W + 2 * WALL_OUT + 0.1, h: 0.07, d: 0.12, x: W / 2, y, z: z0 + 0.02, color: c }));
  // Nachbarhäuser links/rechts
  const winSpecs = [];
  const NB = [[-26, -13, '#a4573f', 7.4], [-13, -WALL_OUT, '#c9a56a', 6.4], [W + WALL_OUT, W + 13, '#7c8aa8', 7.0], [W + 13, W + 26, '#b8826a', 8.0]];
  for (const [a, b, c, h] of NB) {
    const col = hex(c).map((v) => v * 0.9);
    parts.push(box({ w: b - a, h, d: 0.08, x: (a + b) / 2, y: h / 2, z: z0, color: col }));
    parts.push(box({ w: b - a + 0.2, h: 0.3, d: 0.3, x: (a + b) / 2, y: h + 0.05, z: z0 + 0.06, color: col.map((v) => v * 0.65) }));
    parts.push(box({ w: 1.1, h: 2.2, d: 0.1, x: a + (b - a) * 0.25, y: 1.1, z: z0 + 0.04, color: [0.14, 0.15, 0.2] })); // Haustür
    windowGrid(winSpecs, a + 1.6, b, 1.3, Math.floor((h - 1.4) / 2.7), front + 0.01, 1, rand);
  }
  const mat = new MeshBasicMaterial({ vertexColors: true });
  const cladding = new Mesh(merge(parts), mat);
  cladding.matrixAutoUpdate = false;
  out.tinted.push({ mat, base: [1, 1, 1] });
  group.add(cladding);
  const ws = out.addWindows(winSpecs);
  if (ws) group.add(ws.mesh);

  // Leuchtschild + Öffnungszeiten (selbstleuchtend, nicht getönt)
  const signTex = toTexture(signCanvas(), { aniso: 4 });
  const signMat = new MeshBasicMaterial({ map: signTex, toneMapped: false });
  const sign = new Mesh(new PlaneGeometry(Math.min(W - 1.4, 7.4), Math.min(W - 1.4, 7.4) / 4), signMat);
  sign.position.set(W / 2, 4.0, front + 0.012);
  group.add(sign);
  const hoursMat = new MeshBasicMaterial({ map: toTexture(hoursCanvas(), { aniso: 4 }) });
  out.tinted.push({ mat: hoursMat, base: [1, 1, 1] });
  const hours = new Mesh(new PlaneGeometry(0.5, 0.75), hoursMat);
  hours.position.set(door.x1 + 0.36, 1.5, front + 0.012);
  group.add(hours);

  // Rollladen: Lamellen-Textur, Oberkante fest, beim Hochfahren schrumpft die Höhe (Textur skaliert mit)
  const SH = 2.62;
  const SW = W - 0.5;
  const shTex = toTexture(shutterCanvas(), { repeat: true, aniso: 2, mips: false });
  const R = SH / 0.56;
  shTex.repeat.set(SW / 1.0, R);
  const shGeo = new PlaneGeometry(SW, SH);
  shGeo.translate(0, -SH / 2, 0);
  const shMat = new MeshBasicMaterial({ map: shTex });
  out.tinted.push({ mat: shMat, base: [1, 1, 1] });
  const shutter = new Mesh(shGeo, shMat);
  shutter.position.set(W / 2, SH, front + 0.1);
  group.add(shutter);
  const casing = new Mesh(box({ w: W - 0.2, h: 0.3, d: 0.28, x: 0, y: 0, z: 0, color: [0.36, 0.4, 0.46] }), new MeshBasicMaterial({ vertexColors: true }));
  casing.position.set(W / 2, SH + 0.14, front + 0.1);
  out.tinted.push({ mat: casing.material, base: [1, 1, 1] });
  group.add(casing);
  out.setPalette(out.tod, out.rain);

  let openAmt = 0;
  return {
    group, shutter, signMat,
    /** 0 = zu, 1 = oben (komplett eingerollt, unsichtbar). */
    setShutter(v) {
      openAmt = Math.min(1, Math.max(0, v));
      const s = Math.max(0.0001, 1 - openAmt);
      shutter.visible = openAmt < 0.995;
      shutter.scale.y = s;
      shTex.repeat.y = R * s;
      shTex.offset.y = R * (1 - s);
    },
    get openAmount() { return openAmt; },
    /** Neon-Flackern beim Einschalten (t in Sekunden seit Start). */
    flicker(t) {
      const k = t < 0.9 ? (Math.sin(t * 61) > 0.1 && Math.sin(t * 23) > -0.3 ? 1 : 0.25) : 1;
      signMat.color.setScalar(k);
    },
    dispose() {
      group.removeFromParent();
      disposeTree(group);
      signTex.dispose();
      shTex.dispose();
      for (const t of [mat, hoursMat, shMat, casing.material]) { const i = out.tinted.findIndex((q) => q.mat === t); if (i >= 0) out.tinted.splice(i, 1); }
      if (ws) { const i = out.windowSets.indexOf(ws); if (i >= 0) out.windowSets.splice(i, 1); }
    },
  };
}
