// VIDEOTHEK LENZ · Stadt-Dekor (three): Ladenschilder, Fensterbänke, Regenrinnen, Klingelschilder, Litfaßsäule, Fahrplan,
// Palast-Außenfassade (Glühbirnen-Lauflicht, Neon-Halo, Schaukasten-Rahmen), Kiosk-Markise, Hinterhof (Korb, Wäscheleine,
// Graffiti-Wand, Paletten), Dach (Lüftung, Antenne), Fußgänger-Ampeln. Alles pro Material zusammengeführt (wenige Draw-Calls),
// Basic-Material ohne Licht. Tageszeit über `out.hooks` (Fenster, Glühbirnen, Halos), Lauflicht und Flackern über update(dt).
import {
  Mesh, MeshBasicMaterial, CylinderGeometry, TorusGeometry, Float32BufferAttribute, AdditiveBlending, DoubleSide, RepeatWrapping,
} from 'three';
import { box, quad, merge } from '../util/geo.js';
import { makeCanvas, FONT } from './textures.js';
import { glowCanvas } from '../modules/outdoor.js';
import { seeded } from '../modules/m4-util.js';

const PI = Math.PI;
const B = (x0, z0, x1, z1, y0, y1, color) => box({ w: x1 - x0, h: y1 - y0, d: z1 - z0, x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, color });
const paint = (g, c) => {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2]; }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
};
const cyl = (r, h, x, y, z, color, seg = 10) => { const g = new CylinderGeometry(r, r, h, seg, 1); g.translate(x, y, z); return paint(g, color); };
const reducedMotion = () => { try { return !!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return false; } };

const TILE_W = 512;
const TILE_H = 128;
const FAHRPLAN = { x: 0, y: 512, w: 340, h: 500 };

/** Schildatlas 1024x1024: oben 8 Ladenschilder (2 Spalten x 4), unten der Haltestellen-Fahrplan. */
function decorAtlas(fronts) {
  const c = makeCanvas(1024, 1024);
  const x = c.getContext('2d');
  x.fillStyle = '#0b0f2c'; x.fillRect(0, 0, 1024, 1024);
  fronts.forEach((s, i) => {
    const ox = (i % 2) * TILE_W;
    const oy = Math.floor(i / 2) * TILE_H;
    x.save();
    x.translate(ox, oy);
    x.fillStyle = '#10142e'; x.fillRect(0, 0, TILE_W, TILE_H);
    x.strokeStyle = s.color; x.lineWidth = 5; x.shadowColor = s.color; x.shadowBlur = 10;
    x.strokeRect(8, 8, TILE_W - 16, TILE_H - 16);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    let px = 56;
    x.font = `bold ${px}px ${FONT}`;
    while (x.measureText(s.text).width > TILE_W - 50 && px > 16) { px -= 2; x.font = `bold ${px}px ${FONT}`; }
    x.shadowBlur = 16; x.fillStyle = s.color;
    x.fillText(s.text, TILE_W / 2, TILE_H / 2 + 3);
    x.shadowBlur = 0; x.fillStyle = '#ffffff'; x.globalAlpha = 0.5;
    x.fillText(s.text, TILE_W / 2, TILE_H / 2 + 3);
    x.restore();
  });
  // Fahrplan mit Haltestellen-Witz
  x.save();
  x.translate(FAHRPLAN.x, FAHRPLAN.y);
  x.fillStyle = '#f4f1e6'; x.fillRect(0, 0, FAHRPLAN.w, FAHRPLAN.h);
  x.fillStyle = '#1f6f4a'; x.fillRect(0, 0, FAHRPLAN.w, 70);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `bold 34px ${FONT}`;
  x.fillText('HALTESTELLE', FAHRPLAN.w / 2, 36);
  x.fillStyle = '#222'; x.textAlign = 'left'; x.font = `bold 26px ${FONT}`;
  const lines = ['Linie 7 nach Irgendwo', '', 'Abfahrt:  bald', 'Ankunft:  auch bald', 'Verspätung:  ja', 'Nächster Bus:  gestern', '', 'Bitte nicht', 'auf den Bus warten,', 'er kommt von allein.'];
  lines.forEach((l, i) => x.fillText(l, 16, 112 + i * 36));
  x.strokeStyle = '#1f6f4a'; x.lineWidth = 6; x.strokeRect(3, 3, FAHRPLAN.w - 6, FAHRPLAN.h - 6);
  x.restore();
  return c;
}

/** Litfaßsäule: bunte Plakate (prozedural, ohne fremde Marken). */
function posterCanvas() {
  const c = makeCanvas(512, 256);
  const x = c.getContext('2d');
  const r = seeded(31);
  x.fillStyle = '#d8d2c4'; x.fillRect(0, 0, 512, 256);
  const PAL = ['#ff5d8f', '#35e6ff', '#ffd23f', '#7be07a', '#b48cff', '#ff9a3c'];
  const TXT = ['KINO-NACHT', 'LENZ PALAST', 'FLOHMARKT', 'KEIN BILD', 'HEUTE LIVE', 'KATZEN SUCHEN HEIM', 'AUSVERKAUF', 'TANZ IM HOF'];
  for (let i = 0; i < 8; i++) {
    const px = i * 64 + 2;
    const col = PAL[Math.floor(r() * PAL.length)];
    x.fillStyle = col; x.fillRect(px, 6 + r() * 14, 60, 150 + r() * 80);
    x.fillStyle = 'rgba(0,0,0,0.75)'; x.save(); x.translate(px + 34, 130); x.rotate(-PI / 2); x.font = `bold 20px ${FONT}`; x.textAlign = 'center';
    x.fillText(TXT[i], 0, 0); x.restore();
    x.fillStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.arc(px + 30, 40 + r() * 20, 12 + r() * 8, 0, PI * 2); x.fill();
  }
  return c;
}

/** Glühbirnen-Lauflicht: 3 Birnen je Periode (Phase wandert über den UV-Versatz). */
function bulbCanvas() {
  const c = makeCanvas(96, 32);
  const x = c.getContext('2d');
  x.clearRect(0, 0, 96, 32);
  for (let i = 0; i < 3; i++) {
    const g = x.createRadialGradient(16 + i * 32, 16, 0, 16 + i * 32, 16, 15);
    const a = i === 0 ? 1 : 0.28;
    g.addColorStop(0, `rgba(255,248,210,${a})`);
    g.addColorStop(0.35, `rgba(255,200,90,${a * 0.9})`);
    g.addColorStop(1, 'rgba(255,150,40,0)');
    x.fillStyle = g; x.fillRect(i * 32, 0, 32, 32);
  }
  return c;
}

const SHOP_GLASS = { day: [0.16, 0.22, 0.3], dusk: [0.5, 0.38, 0.28], night: [0.8, 0.55, 0.28] };

/**
 * Baut das Stadt-Dekor. Rückgabe { setSignals(sig), update(dt), dispose() }.
 * `G` = { street, palast, yard } (Szenengruppen), `winSpecs` = Fensterliste der Fassaden (für Bänke und Rahmen).
 */
export function buildCityDecor(out, city, layout, G, winSpecs) {
  const f = city.frame;
  const { W, D, sz } = f;
  const rand = seeded(Math.round(W * 100 + D * 10) + 13);
  const flat = out.tint(new MeshBasicMaterial({ vertexColors: true }));
  const mats = [];
  const meshes = [];
  const put = (group, geos, mat, name, order) => {
    const geo = merge(geos);
    if (!geo) return null;
    const m = new Mesh(geo, mat);
    m.name = name;
    m.matrixAutoUpdate = false;
    if (order) m.renderOrder = order;
    group.add(m);
    meshes.push(m);
    return m;
  };
  const GREY = [0.3, 0.32, 0.36];
  const st = []; // Straße (flat)
  const yd = []; // Hof/Dach (flat)
  const pl = []; // Palast (flat)

  // --- Fensterbänke und Regenrinnen an den Fassaden ---
  for (const w of winSpecs || []) {
    const face = w.ry === 0 ? 1 : -1;
    st.push(box({ w: w.w + 0.24, h: 0.07, d: 0.16, x: w.x, y: w.y - w.h / 2 - 0.04, z: w.z + face * 0.06, color: [0.78, 0.76, 0.72] }));
    st.push(box({ w: w.w + 0.14, h: 0.06, d: 0.07, x: w.x, y: w.y + w.h / 2 + 0.04, z: w.z + face * 0.03, color: [0.7, 0.68, 0.64] }));
  }
  for (const b of city.buildings) {
    if (!b.front || b.x1 - b.x0 < 3) continue;
    const face = b.front === 'S' ? 1 : -1;
    const zf = b.front === 'S' ? b.z1 : b.z0;
    const gx0 = b.x0;
    const gx1 = b.x1;
    st.push(box({ w: gx1 - gx0, h: 0.1, d: 0.14, x: (gx0 + gx1) / 2, y: b.h - 0.25, z: zf + face * 0.1, color: [0.25, 0.27, 0.3] })); // Regenrinne
    st.push(box({ w: 0.1, h: b.h - 0.3, d: 0.1, x: gx1 - 0.35, y: (b.h - 0.3) / 2, z: zf + face * 0.1, color: [0.25, 0.27, 0.3] })); // Fallrohr
    // Haustür: Rahmen, Stufe, Klingelschild (drei Knöpfe)
    const dx = b.x0 + (b.x1 - b.x0) * 0.25;
    st.push(box({ w: 1.3, h: 0.12, d: 0.14, x: dx, y: 2.26, z: zf + face * 0.07, color: [0.8, 0.78, 0.7] }));
    st.push(box({ w: 1.4, h: 0.08, d: 0.3, x: dx, y: 0.04, z: zf + face * 0.17, color: [0.62, 0.62, 0.66] }));
    st.push(box({ w: 0.2, h: 0.34, d: 0.04, x: dx + 0.85, y: 1.35, z: zf + face * 0.03, color: [0.75, 0.72, 0.5] }));
    for (let k = 0; k < 3; k++) st.push(box({ w: 0.05, h: 0.05, d: 0.03, x: dx + 0.85, y: 1.25 + k * 0.1, z: zf + face * 0.06, color: [0.15, 0.15, 0.18] }));
  }

  // --- Ladenschilder: Atlas + Markise + Schaufenster (Farbe nach Tageszeit) ---
  const fronts = city.shopFronts || [];
  const atlasTex = out.T(decorAtlas(fronts), { aniso: 4 });
  const shopMat = new MeshBasicMaterial({ map: atlasTex });
  mats.push(shopMat);
  const signGeos = [];
  const glassGeos = [];
  const glassSpec = [];
  fronts.forEach((s, i) => {
    const face = s.yaw === 0 ? 1 : -1;
    const h = s.w / 4;
    const u0 = (i % 2) * 0.5;
    const v1 = 1 - (Math.floor(i / 2) * TILE_H) / 1024;
    signGeos.push(quad({ w: s.w, h, x: s.x, y: s.y, z: s.z + face * 0.106, ry: s.yaw, uv: [u0, v1 - TILE_H / 1024, u0 + 0.5, v1] }));
    st.push(box({ w: s.w + 0.2, h: h + 0.16, d: 0.12, x: s.x, y: s.y, z: s.z + face * 0.04, color: [0.1, 0.11, 0.16] })); // Schildkasten
    // gestreifte Markise (flach geneigt)
    const n = Math.max(4, Math.round(s.w / 0.5));
    for (let k = 0; k < n; k++) {
      const wx = s.w / n;
      st.push(box({ w: wx, h: 0.06, d: 1.0, x: s.x - s.w / 2 + wx * (k + 0.5), y: 2.62, z: s.z + face * 0.5, rx: face * -0.18, color: k % 2 ? [0.95, 0.95, 0.92] : s.awning }));
    }
    const gw = s.w - 1.0;
    glassGeos.push(quad({ w: gw, h: 1.5, x: s.x + 0.2, y: 1.15, z: s.z + face * 0.015, ry: s.yaw }));
    glassSpec.push({ lit: rand() < 0.8 });
    for (const m of [-1, 0, 1]) st.push(box({ w: 0.06, h: 1.5, d: 0.05, x: s.x + 0.2 + (m * gw) / 3.2, y: 1.15, z: s.z + face * 0.035, color: [0.16, 0.16, 0.2] })); // Sprossen
    st.push(box({ w: gw + 0.16, h: 0.08, d: 0.06, x: s.x + 0.2, y: 0.36, z: s.z + face * 0.03, color: [0.2, 0.2, 0.24] }));
    st.push(box({ w: gw + 0.16, h: 0.08, d: 0.06, x: s.x + 0.2, y: 1.94, z: s.z + face * 0.03, color: [0.2, 0.2, 0.24] }));
  });
  put(G.street, signGeos, shopMat, 'city-shopsigns');
  let glassMesh = null;
  if (glassGeos.length) {
    const gm = new MeshBasicMaterial({ vertexColors: true });
    mats.push(gm);
    glassMesh = put(G.street, glassGeos, gm, 'city-shopglass');
  }
  const setGlass = (tod) => {
    if (!glassMesh) return;
    const base = SHOP_GLASS[tod] || SHOP_GLASS.day;
    const attr = glassMesh.geometry.attributes.color;
    glassSpec.forEach((g, i) => {
      const c = tod === 'day' || g.lit ? base : [0.07, 0.08, 0.12];
      for (let v = 0; v < 4; v++) attr.setXYZ(i * 4 + v, c[0], c[1], c[2]);
    });
    attr.needsUpdate = true;
  };

  // --- Haltestelle: Fahrplan + Dach ---
  const bs = city.fixtures.find((q) => q.id === 'busstop');
  if (bs) {
    const bx = (bs.x0 + bs.x1) / 2;
    const fpU0 = FAHRPLAN.x / 1024;
    const fpV1 = 1 - FAHRPLAN.y / 1024;
    const fp = quad({ w: 0.8, h: 1.18, x: bx + 0.8, y: 1.45, z: bs.z0 - 0.02, ry: PI, uv: [fpU0, fpV1 - FAHRPLAN.h / 1024, fpU0 + FAHRPLAN.w / 1024, fpV1] });
    put(G.street, [fp], shopMat, 'city-fahrplan');
    st.push(box({ w: bs.x1 - bs.x0 + 0.6, h: 0.1, d: 1.6, x: bx, y: 2.5, z: bs.z0 - 0.5, color: [0.2, 0.42, 0.5] })); // Wetterdach
    st.push(box({ w: 0.08, h: 2.5, d: 0.08, x: bs.x0 + 0.1, y: 1.25, z: bs.z0 - 1.25, color: GREY }));
    st.push(box({ w: 0.08, h: 2.5, d: 0.08, x: bs.x1 - 0.1, y: 1.25, z: bs.z0 - 1.25, color: GREY }));
  }

  // --- Briefkasten-Details, Mülleimer-Deckel, Fahrradständer ---
  const rack = city.fixtures.find((q) => q.id === 'bikerack');
  if (rack) {
    const cx = (rack.x0 + rack.x1) / 2;
    const cz = (rack.z0 + rack.z1) / 2;
    for (let k = -3; k <= 3; k++) {
      st.push(box({ w: 0.04, h: 0.8, d: 0.04, x: cx + k * 0.24, y: 0.4, z: cz - 0.12, color: GREY }));
      st.push(box({ w: 0.04, h: 0.8, d: 0.04, x: cx + k * 0.24, y: 0.4, z: cz + 0.12, color: GREY }));
      st.push(box({ w: 0.05, h: 0.04, d: 0.28, x: cx + k * 0.24, y: 0.8, z: cz, color: GREY }));
    }
    // ein einsames Fahrrad (flach, comic)
    st.push(box({ w: 0.9, h: 0.04, d: 0.05, x: cx + 0.1, y: 0.5, z: cz, color: [0.85, 0.25, 0.25] }));
    st.push(box({ w: 0.04, h: 0.5, d: 0.04, x: cx + 0.45, y: 0.55, z: cz, color: [0.85, 0.25, 0.25] }));
    st.push(box({ w: 0.44, h: 0.44, d: 0.04, x: cx - 0.35, y: 0.24, z: cz, color: [0.12, 0.12, 0.14] }));
    st.push(box({ w: 0.44, h: 0.44, d: 0.04, x: cx + 0.55, y: 0.24, z: cz, color: [0.12, 0.12, 0.14] }));
  }
  for (const q of city.fixtures) {
    if (q.kind === 'bin') st.push(box({ w: q.x1 - q.x0 + 0.06, h: 0.07, d: q.z1 - q.z0 + 0.06, x: (q.x0 + q.x1) / 2, y: q.y1 + 0.03, z: (q.z0 + q.z1) / 2, color: [0.15, 0.2, 0.18] }));
    if (q.kind === 'mailbox') st.push(box({ w: 0.3, h: 0.04, d: 0.04, x: (q.x0 + q.x1) / 2, y: 0.9, z: q.z0 - 0.01, color: [0.1, 0.1, 0.1] })); // Briefschlitz
  }

  // --- Litfaßsäule (Plakat-Mantel mit eigener Textur) ---
  const lf = city.litfass;
  if (lf) {
    const tex = out.T(posterCanvas(), { repeat: true, aniso: 2 });
    tex.wrapS = RepeatWrapping;
    const body = new CylinderGeometry(lf.r, lf.r, 1.6, 16, 1, true);
    body.translate(lf.x, lf.slot.y, lf.z);
    const lm = new MeshBasicMaterial({ map: tex, side: DoubleSide });
    mats.push(lm);
    const lfMesh = new Mesh(body, lm);
    lfMesh.name = 'city-litfass';
    lfMesh.matrixAutoUpdate = false;
    G.street.add(lfMesh);
    meshes.push(lfMesh);
    st.push(cyl(lf.r + 0.04, 0.7, lf.x, 0.35, lf.z, [0.18, 0.24, 0.2], 16));
    st.push(cyl(lf.r + 0.06, 0.12, lf.x, lf.slot.y + 0.86, lf.z, [0.18, 0.24, 0.2], 16));
    st.push(cyl(lf.r * 0.7, 0.4, lf.x, lf.slot.y + 1.12, lf.z, [0.82, 0.72, 0.28], 16));
  }

  // --- Palast außen: Schaukasten-Rahmen, Türrahmen, Kassen-Fensterchen ---
  const p = city.palast;
  for (const s of p.posterSlots || []) {
    st.push(box({ w: s.w + 0.16, h: s.h + 0.16, d: 0.1, x: s.x, y: s.y, z: s.z - 0.0, color: [0.12, 0.1, 0.16] }));
    pl.push(box({ w: s.w, h: s.h, d: 0.05, x: s.x, y: s.y, z: s.z - 0.04, color: [0.06, 0.05, 0.09] })); // leere Fläche (Anker, B hängt Plakate davor)
    pl.push(box({ w: s.w + 0.28, h: 0.07, d: 0.14, x: s.x, y: s.y + s.h / 2 + 0.1, z: s.z - 0.02, color: [1, 0.78, 0.3] }));
  }
  pl.push(box({ w: 0.12, h: 3.2, d: 0.14, x: p.doorX0 - 0.06, y: 1.6, z: p.rect.z0 - 0.04, color: [0.9, 0.7, 0.25] }));
  pl.push(box({ w: 0.12, h: 3.2, d: 0.14, x: p.doorX1 + 0.06, y: 1.6, z: p.rect.z0 - 0.04, color: [0.9, 0.7, 0.25] }));
  pl.push(box({ w: 3.4, h: 0.1, d: 0.3, x: (p.doorX0 + p.doorX1) / 2, y: 0.05, z: p.rect.z0 - 0.15, color: [0.5, 0.1, 0.25] })); // roter Teppich-Vorleger
  put(G.palast, pl, flat, 'city-palast-decor');

  // Glühbirnenrahmen (Lauflicht per UV-Versatz) um Vordach und Neonschild
  const bulbTex = out.T(bulbCanvas(), { repeat: true });
  bulbTex.wrapS = RepeatWrapping;
  bulbTex.wrapT = RepeatWrapping;
  const bulbMat = new MeshBasicMaterial({ map: bulbTex, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, opacity: 0.3, fog: false });
  mats.push(bulbMat);
  const c = p.canopy;
  const ps = p.sign;
  const strips = [];
  const strip = (len, x, y, z, rz) => strips.push(quad({ w: len, h: 0.3, x, y, z, ry: PI, rz, uv: [0, 0, len / 0.9, 1] }));
  const zc = c.z0 - 0.02;
  strip(c.x1 - c.x0, (c.x0 + c.x1) / 2, c.y + 0.09, zc, 0);
  const sh = ps.w / 4;
  const sz0 = sz - 0.02;
  strip(ps.w + 0.5, ps.x, ps.y + sh / 2 + 0.2, sz0, 0);
  strip(ps.w + 0.5, ps.x, ps.y - sh / 2 - 0.2, sz0, 0);
  strip(sh + 0.4, ps.x - ps.w / 2 - 0.25, ps.y, sz0, PI / 2);
  strip(sh + 0.4, ps.x + ps.w / 2 + 0.25, ps.y, sz0, PI / 2);
  const bulbMesh = put(G.palast, strips, bulbMat, 'city-bulbs', 8);

  // Halos (additiv): Neonschild, Kiosk, Feuertreppen-Lampe
  const glowTex = out.T(glowCanvas());
  const haloMat = new MeshBasicMaterial({ map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, opacity: 0, fog: false });
  mats.push(haloMat);
  const halos = [
    quad({ w: ps.w * 1.5, h: sh * 3.2, x: ps.x, y: ps.y, z: sz - 0.1, ry: PI, color: [1, 0.35, 0.65] }),
    quad({ w: 3.2, h: 2.2, x: W + 10, y: 2.3, z: D - 0.2, color: [1, 0.4, 0.8] }),
    quad({ w: 2.6, h: 2.6, x: city.escape.fx - 0.4, y: 3.5, z: -1.0, color: [1, 0.85, 0.5] }),
  ];
  const haloMesh = put(G.street, halos, haloMat, 'city-halos', 7);

  // --- Kiosk: Markise, Auslage, Stehtisch ---
  const k = city.kiosk;
  const aw = k.awning;
  const nA = 8;
  for (let i = 0; i < nA; i++) {
    const wx = (aw.x1 - aw.x0) / nA;
    st.push(box({ w: wx, h: 0.06, d: aw.z1 - aw.z0, x: aw.x0 + wx * (i + 0.5), y: (aw.y0 + aw.y1) / 2, z: (aw.z0 + aw.z1) / 2, rx: 0.2, color: i % 2 ? [0.96, 0.96, 0.9] : [0.92, 0.25, 0.4] }));
    st.push(box({ w: wx, h: 0.14, d: 0.04, x: aw.x0 + wx * (i + 0.5), y: aw.y0 - 0.07, z: aw.z1, color: i % 2 ? [0.96, 0.96, 0.9] : [0.92, 0.25, 0.4] })); // Volant
  }
  const cn = k.counter;
  const GOODS = [[0.95, 0.3, 0.3], [0.3, 0.8, 0.5], [0.95, 0.8, 0.2], [0.35, 0.55, 0.95], [0.9, 0.5, 0.8], [0.95, 0.6, 0.2]];
  for (let i = 0; i < 6; i++) st.push(box({ w: 0.22, h: 0.18, d: 0.14, x: cn.x0 + 0.3 + i * 0.28, y: cn.h + 0.09, z: (cn.z0 + cn.z1) / 2, color: GOODS[i] }));
  for (let i = 0; i < 4; i++) st.push(box({ w: 0.18, h: 0.3, d: 0.1, x: k.hut.x0 - 0.05, y: 1.2 + i * 0.34, z: k.hut.z1 + 0.35 - i * 0.02, color: GOODS[(i + 2) % 6] })); // Zeitschriftenständer-Flecken
  const tb = k.table;
  st.push(box({ w: 0.55, h: 0.05, d: 0.55, x: (tb.x0 + tb.x1) / 2, y: tb.h, z: (tb.z0 + tb.z1) / 2, color: [0.85, 0.82, 0.74] }));
  st.push(box({ w: 0.06, h: tb.h, d: 0.06, x: (tb.x0 + tb.x1) / 2, y: tb.h / 2, z: (tb.z0 + tb.z1) / 2, color: GREY }));
  st.push(box({ w: 0.2, h: 0.03, d: 0.2, x: (tb.x0 + tb.x1) / 2 + 0.05, y: tb.h + 0.04, z: (tb.z0 + tb.z1) / 2, color: [0.96, 0.7, 0.2] })); // Pappteller mit Wurst

  // --- Hinterhof: Basketballkorb (Mast, Brett, Ring), Wäscheleine, Graffiti-Wand, Paletten ---
  const hp = city.yard.hoop;
  const board = hp.board;
  yd.push(box({ w: 0.14, h: 3.9, d: 0.14, x: hp.mast.x, y: 1.95, z: hp.mast.z, color: [0.25, 0.27, 0.32] }));
  yd.push(box({ w: 0.5, h: 0.06, d: 0.1, x: (hp.mast.x + board.x) / 2, y: 3.4, z: hp.z, color: [0.25, 0.27, 0.32] })); // Arm
  yd.push(box({ w: 0.06, h: board.h, d: board.w, x: board.x, y: board.y, z: hp.z, color: [0.92, 0.94, 0.97] }));
  yd.push(box({ w: 0.07, h: 0.5, d: 0.6, x: board.x - 0.01, y: board.y - 0.1, z: hp.z, color: [0.9, 0.3, 0.2] })); // Zielquadrat
  const ring = new TorusGeometry(hp.ringR, 0.018, 6, 14);
  ring.rotateX(PI / 2);
  ring.translate(hp.x, hp.y, hp.z);
  yd.push(paint(ring, [1, 0.45, 0.1]));
  const net = new CylinderGeometry(hp.ringR, hp.ringR * 0.6, 0.38, 8, 1, true);
  net.translate(hp.x, hp.y - 0.19, hp.z);
  yd.push(paint(net, [0.95, 0.95, 0.95]));
  const ln = city.yard.laundry;
  yd.push(box({ w: ln.x1 - ln.x0, h: 0.015, d: 0.015, x: (ln.x0 + ln.x1) / 2, y: ln.y, z: ln.z, color: [0.9, 0.9, 0.9] }));
  yd.push(box({ w: 0.08, h: 2.3, d: 0.08, x: ln.x0, y: 1.15, z: ln.z, color: GREY }));
  yd.push(box({ w: 0.08, h: 2.3, d: 0.08, x: ln.x1, y: 1.15, z: ln.z, color: GREY }));
  const CLOTH = [[0.9, 0.3, 0.3], [0.95, 0.9, 0.4], [0.4, 0.7, 0.95], [0.95, 0.95, 0.95], [0.6, 0.9, 0.5], [0.9, 0.5, 0.85]];
  for (let i = 0; i < 6; i++) yd.push(box({ w: 0.34 + (i % 3) * 0.08, h: 0.4 + (i % 2) * 0.18, d: 0.02, x: ln.x0 + 0.5 + i * ((ln.x1 - ln.x0 - 1) / 5), y: ln.y - 0.22 - (i % 2) * 0.09, z: ln.z, color: CLOTH[i] }));
  const gr = city.yard.graffiti;
  yd.push(box({ w: gr.w + 0.2, h: gr.h + 0.2, d: 0.04, x: gr.x, y: gr.y, z: gr.z + 0.015, color: [0.5, 0.48, 0.45] }));
  yd.push(box({ w: gr.w, h: gr.h, d: 0.04, x: gr.x, y: gr.y, z: gr.z + 0.03, color: [0.86, 0.84, 0.78] })); // helle, leere Fläche
  for (const q of city.colliders) {
    if (q.kind !== 'pallet') continue;
    for (let i = 0; i < 3; i++) yd.push(box({ w: q.x1 - q.x0, h: 0.06, d: 0.16, x: (q.x0 + q.x1) / 2, y: 0.03 + i * 0.1, z: q.z0 + 0.08 + i * ((q.z1 - q.z0 - 0.16) / 2), color: [0.6, 0.45, 0.28] }));
    yd.push(B(q.x0, q.z0, q.x1, q.z1, 0.22, 0.28, [0.55, 0.4, 0.24]));
  }

  // --- Feuertreppe: Warnstreifen an den Kanten, Lampe; Dach: Lüftung, Antenne, Schüssel ---
  const e = city.escape;
  const FX = e.fx;
  yd.push(box({ w: 2.2, h: 0.04, d: 0.08, x: FX, y: 1.67, z: -1.58, color: [0.95, 0.8, 0.1] }));
  yd.push(box({ w: 1.1, h: 0.04, d: 0.08, x: FX - 3.09, y: 3.32, z: -1.58, color: [0.95, 0.8, 0.1] }));
  yd.push(box({ w: 0.1, h: 0.1, d: 0.1, x: FX - 0.4, y: 3.5, z: -0.5, color: [1, 0.9, 0.6] }));
  for (const r of city.roofProps || []) {
    if (r.kind === 'vent') {
      yd.push(B(r.x - r.w / 2, r.z - r.d / 2, r.x + r.w / 2, r.z + r.d / 2, 3.3, 3.3 + r.h, [0.55, 0.57, 0.6]));
      yd.push(B(r.x - r.w / 2 - 0.05, r.z - r.d / 2 - 0.05, r.x + r.w / 2 + 0.05, r.z + r.d / 2 + 0.05, 3.3 + r.h, 3.3 + r.h + 0.06, [0.4, 0.42, 0.46]));
      for (let i = 0; i < 4; i++) yd.push(box({ w: r.w * 0.8, h: 0.03, d: 0.02, x: r.x, y: 3.3 + 0.2 + i * 0.12, z: r.z + r.d / 2 + 0.01, color: [0.25, 0.26, 0.3] }));
    } else if (r.kind === 'mast') {
      yd.push(box({ w: 0.06, h: r.h, d: 0.06, x: r.x, y: 3.3 + r.h / 2, z: r.z, color: [0.55, 0.57, 0.6] }));
      for (let i = 0; i < 3; i++) yd.push(box({ w: 0.9 - i * 0.2, h: 0.04, d: 0.04, x: r.x, y: 3.3 + 1.6 + i * 0.35, z: r.z, color: [0.55, 0.57, 0.6] }));
      yd.push(box({ w: 0.7, h: 0.7, d: 0.05, x: r.x + 1.2, y: 3.3 + 1.0, z: r.z + 0.2, ry: 0.5, rx: -0.4, color: [0.85, 0.85, 0.88] }));
      yd.push(box({ w: 0.05, h: 0.9, d: 0.05, x: r.x + 1.2, y: 3.3 + 0.45, z: r.z + 0.2, color: GREY }));
    }
  }

  put(G.street, st, flat, 'city-decor');
  put(G.yard, yd, flat, 'city-yard-decor');

  // --- Fußgänger-Ampeln (rot/grün je Mast, folgen signalAt) ---
  const pedGeos = [];
  const FACE = { mainE: PI, mainW: 0, sideS: -PI / 2, sideN: PI / 2 };
  for (const s of city.signals) {
    const ry = FACE[s.id];
    const nx = Math.sin(ry) * 0.04;
    const nz = Math.cos(ry) * 0.04;
    const px = s.x + Math.sin(ry) * 0.075;
    const pz = s.z + Math.cos(ry) * 0.075;
    pedGeos.push(box({ w: 0.16, h: 0.34, d: 0.05, x: s.x + nx, y: 2.3, z: s.z + nz, ry, color: [0.08, 0.08, 0.1] }));
    for (const y of [2.4, 2.22]) pedGeos.push(quad({ w: 0.1, h: 0.1, x: px + Math.sin(ry) * 0.02, y, z: pz + Math.cos(ry) * 0.02, ry, color: [0.1, 0.1, 0.1] }));
  }
  const pedGeo = merge(pedGeos);
  const pedMesh = new Mesh(pedGeo, new MeshBasicMaterial({ vertexColors: true, toneMapped: false }));
  pedMesh.name = 'city-ped-lamps';
  pedMesh.matrixAutoUpdate = false;
  G.street.add(pedMesh);
  meshes.push(pedMesh);
  mats.push(pedMesh.material);
  // Je Mast: 1 Box (24 Vertices) + 2 Quads (4 Vertices) → Farbindex je Quad
  const BOXV = 24;
  const PER = BOXV + 8;
  let lastPed = '';
  function setSignals(sig) {
    const key = `${sig.walkMain}|${sig.walkSide}`;
    if (key === lastPed) return;
    lastPed = key;
    const attr = pedGeo.attributes.color;
    // Reihenfolge der gemergten Geometrien: je Mast Box, Quad (rot, y 2.4), Quad (grün, y 2.22)
    city.signals.forEach((s, i) => {
      const walk = s.signal === 'main' ? sig.walkMain : sig.walkSide;
      const base = i * PER + BOXV;
      const red = walk ? [0.14, 0.05, 0.05] : [1, 0.12, 0.1];
      const grn = walk ? [0.15, 1, 0.4] : [0.05, 0.14, 0.07];
      for (let v = 0; v < 4; v++) { attr.setXYZ(base + v, red[0], red[1], red[2]); attr.setXYZ(base + 4 + v, grn[0], grn[1], grn[2]); }
    });
    attr.needsUpdate = true;
  }

  // --- Tageszeit ---
  out.hooks.push((tod, rain) => {
    bulbMat.opacity = tod === 'night' ? 1 : tod === 'dusk' ? 0.8 : 0.3;
    haloMesh.visible = tod !== 'day';
    haloMat.opacity = tod === 'night' ? (rain ? 0.55 : 0.7) : 0.35;
    shopMat.color.setScalar(tod === 'day' ? 0.8 : 1);
    setGlass(tod);
  });
  setGlass(out.tod);

  // --- Animation: Lauflicht 6 Schritte/s, Neon-Flackern nur bei Nacht ---
  let t = 0;
  const calm = reducedMotion();
  void bulbMesh;
  return {
    setSignals,
    update(dt) {
      t += dt;
      bulbTex.offset.x = -Math.floor((t * 6) % 3) / 3;
      if (!calm && out.tod === 'night') {
        const dip = ((Math.sin(Math.floor(t * 7) * 12.9898) * 43758.5453) % 1 + 1) % 1 > 0.965;
        haloMat.opacity = (out.rain ? 0.55 : 0.7) * (dip ? 0.45 : 1);
      }
    },
    dispose() {
      for (const m of meshes) { m.removeFromParent(); if (m.geometry) m.geometry.dispose(); }
      for (const m of mats) m.dispose();
      flat.dispose();
      const i = out.tinted.findIndex((q) => q.mat === flat);
      if (i >= 0) out.tinted.splice(i, 1);
    },
  };
}
