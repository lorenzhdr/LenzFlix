// VIDEOTHEK LENZ · Innenraum des Friseursalons „FRISEUR HAARSCHARF“ (1.17.0): Fliesenboden, Friseurstuhl, Spiegelrahmen, Waschbecken,
// Föhnhaube, Theke, Kleiderstange mit Klamotten, Umkleide mit Vorhang, Deckenlampen, Plakate mit erfundenen Frisuren-Namen.
// Alles aus den Ankern `layout.city.salon` (world/city.js), unbeleuchtet (Vertexfarben, Formschatten) wie der Palast-Innenausbau.
// Meshes: 1 Festkörper (Boden + Möbel), 1 Plakate, 1 Vorhang = 3 Draw-Calls; die Spiegelflächen legt modules/salon.js an (mirror.js).
// Rückgabe enthält die Möbel-Kollider als Daten (der Aufrufer registriert sie per ctx.addCollider) und die Blick-/Standpunkte.
import { Group, Mesh, MeshBasicMaterial, DoubleSide } from 'three';
import { box, quad, merge } from '../util/geo.js';

/** Form-Schatten je Fläche [+x, −x, +y, −y, +z, −z]. */
const SH = [0.86, 0.78, 1, 0.55, 0.92, 0.8];
const WOOD = [0.5, 0.34, 0.2];
const CHROME = [0.78, 0.8, 0.84];
const CREAM = [0.94, 0.9, 0.8];
const RED = [0.72, 0.14, 0.18];
const LAMP = [1, 0.95, 0.82];

/** Namen der erfundenen Frisuren auf den Plakaten (Reihenfolge = Atlas-Zellen 0..3). */
export const POSTER_NAMES = ['DER SCHWUNG', 'VOLUMEN 88', 'WILDE WELLE', 'DER KURZE'];
/** Plakatfarben (Hintergrund, Schrift) je Zelle, für den Atlas und den Ersatz ohne Textur. */
const POSTER_COLORS = [['#e2547c', '#fff4d6'], ['#2f9ea0', '#fff4d6'], ['#f0a030', '#3a1a2a'], ['#5a4aa8', '#ffe8a0']];

const bx = (x0, y0, z0, x1, y1, z1, color, shade = SH) => box({
  w: x1 - x0, h: y1 - y0, d: z1 - z0, x: (x0 + x1) / 2, y: (y0 + y1) / 2, z: (z0 + z1) / 2, color, shade,
});
const rect = (id, x0, z0, x1, z1, y1) => ({ id, x0, z0, x1, z1, y1, kind: 'prop', top: false });

/** Zeichnet den Plakat-Atlas (512², 2×2 Zellen) auf einen 2D-Kontext. */
export function drawPosterAtlas(g, w, h, font = 'sans-serif') {
  const cw = w / 2;
  const ch = h / 2;
  POSTER_NAMES.forEach((name, i) => {
    const x = (i % 2) * cw;
    const y = Math.floor(i / 2) * ch;
    g.fillStyle = POSTER_COLORS[i][0];
    g.fillRect(x, y, cw, ch);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(x + 10, y + 10, cw - 20, ch - 20);
    g.fillStyle = POSTER_COLORS[i][0];
    g.fillRect(x + 16, y + 16, cw - 32, ch - 32);
    // Kopf-Silhouette mit der jeweiligen Frisur
    const cx = x + cw / 2;
    const cy = y + ch * 0.46;
    g.fillStyle = '#f3d2b6';
    g.beginPath(); g.arc(cx, cy, cw * 0.14, 0, Math.PI * 2); g.fill();
    g.fillStyle = i === 3 ? '#222' : i === 1 ? '#f4e04a' : '#6a2a18';
    if (i === 0) { g.beginPath(); g.ellipse(cx + 8, cy - 18, cw * 0.2, cw * 0.12, -0.4, 0, Math.PI * 2); g.fill(); }
    else if (i === 1) { g.beginPath(); g.arc(cx, cy - 8, cw * 0.22, Math.PI, 0); g.fill(); }
    else if (i === 2) { for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(cx - cw * 0.2 + k * cw * 0.08, cy - 14 + (k % 2) * 10, cw * 0.06, 0, Math.PI * 2); g.fill(); } }
    else { g.fillRect(cx - cw * 0.14, cy - cw * 0.16, cw * 0.28, cw * 0.07); }
    g.fillStyle = POSTER_COLORS[i][1];
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `bold ${Math.round(cw * 0.1)}px ${font}`;
    g.fillText(name, cx, y + ch * 0.82);
    g.font = `${Math.round(cw * 0.06)}px ${font}`;
    g.fillText('HAARSCHARF', cx, y + ch * 0.92);
  });
}

/**
 * Innenraum bauen.
 * @param {object} sa layout.city.salon
 * @param {{posterMap?: object|null}} [o] posterMap = Plakat-Atlas (Textur) oder leer
 */
export function buildSalon(sa, o = {}) {
  const r = sa.rect;
  const T = sa.wall || 0.12;
  const X0 = r.x0;
  const X1 = r.x1;
  const Z0 = r.z0;
  const Z1 = r.z1;
  const cx = (X0 + X1) / 2;
  const solids = [];
  const colliders = [];
  const add = (...g) => { for (const x of g) solids.push(x); };

  // --- Boden: Schachbrett 0,5 m, knapp über dem Platzhalterboden der Außenhaut (y 0,012) ---
  const tile = 0.5;
  const FY = 0.02;
  for (let x = X0; x < X1 - 1e-6; x += tile) {
    for (let z = Z0 + T; z < Z1 - 1e-6; z += tile) {
      const wx = Math.min(tile, X1 - x);
      const wz = Math.min(tile, Z1 - z);
      const dark = (Math.round((x - X0) / tile) + Math.round((z - Z0) / tile)) % 2 === 0;
      add(quad({ w: wx, h: wz, x: x + wx / 2, y: FY, z: z + wz / 2, rx: -Math.PI / 2, color: dark ? [0.2, 0.42, 0.44] : [0.92, 0.88, 0.8] }));
    }
  }

  // --- Wandsockel (Dado) an den Innenwänden ---
  const dado = [0.2, 0.46, 0.5];
  add(bx(X0, FY, Z0 + T, sa.door.x0, 1.0, Z0 + T + 0.02, dado), bx(sa.door.x1, FY, Z0 + T, X1, 1.0, Z0 + T + 0.02, dado));
  add(bx(X0, FY, Z0 + T, X0 + 0.02, 1.0, Z1, dado), bx(X1 - 0.02, FY, Z0 + T, X1, 1.0, Z1, dado), bx(X0, FY, Z1 - 0.02, X1, 1.0, Z1, dado));
  add(bx(X0, 1.0, Z0 + T, X0 + 0.03, 1.04, Z1, CREAM), bx(X1 - 0.03, 1.0, Z0 + T, X1, 1.04, Z1, CREAM), bx(X0, 1.0, Z1 - 0.03, X1, 1.04, Z1, CREAM));

  // --- Deckenlampen ---
  const lampY = sa.ceil - 0.06;
  for (const lx of [X0 + 2, cx, X1 - 2]) for (const lz of [Z0 + 2, Z0 + 5]) add(bx(lx - 0.45, lampY, lz - 0.12, lx + 0.45, sa.ceil - 0.01, lz + 0.12, LAMP, [1, 1, 1, 1, 1, 1]));

  // --- Spiegelwand (Stuhl): Rahmenbrett hinter der Spiegelfläche ---
  const m = sa.mirror;
  const fz0 = Z1 - T;
  // Der Spiegel liegt bei m.z (knapp vor der Wand): Hinterlegung bleibt hinter der Spiegelebene, der Rahmen ist ein Ring um die Fläche.
  const FR = [0.78, 0.62, 0.22];
  const mx0 = m.x - m.w / 2;
  const mx1 = m.x + m.w / 2;
  const my0 = m.y - m.h / 2;
  const my1 = m.y + m.h / 2;
  const fb = m.z + 0.012; // Rückseite des Spiegels
  add(bx(mx0, my0, fb, mx1, my1, fz0, [0.3, 0.3, 0.34]));
  add(bx(mx0 - 0.1, my0 - 0.1, fz0 - 0.1, mx1 + 0.1, my0, fz0, FR), bx(mx0 - 0.1, my1, fz0 - 0.1, mx1 + 0.1, my1 + 0.1, fz0, FR));
  add(bx(mx0 - 0.1, my0, fz0 - 0.1, mx0, my1, fz0, FR), bx(mx1, my0, fz0 - 0.1, mx1 + 0.1, my1, fz0, FR));
  // Ablage mit Fläschchen, Kamm, Schere darunter
  add(bx(m.x - m.w / 2, 0.72, fz0 - 0.3, m.x + m.w / 2, 0.76, fz0, WOOD));
  for (let i = 0; i < 9; i++) {
    const bxp = m.x - m.w / 2 + 0.2 + i * ((m.w - 0.4) / 8);
    const col = [[0.9, 0.3, 0.5], [0.3, 0.7, 0.85], [0.95, 0.85, 0.3]][i % 3];
    add(bx(bxp - 0.04, 0.76, fz0 - 0.2, bxp + 0.04, 0.76 + 0.1 + (i % 3) * 0.04, fz0 - 0.12, col));
  }

  // --- Friseurstuhl (Blick nach +z, zum Spiegel) ---
  const ch = sa.chair;
  const chx = ch.x;
  const chz = ch.z;
  add(
    bx(chx - 0.3, FY, chz - 0.3, chx + 0.3, 0.07, chz + 0.3, CHROME), // Fuß
    bx(chx - 0.06, 0.07, chz - 0.06, chx + 0.06, 0.4, chz + 0.06, CHROME), // Säule
    bx(chx - 0.27, 0.4, chz - 0.25, chx + 0.27, 0.52, chz + 0.25, RED), // Sitz
    bx(chx - 0.26, 0.52, chz - 0.3, chx + 0.26, 1.15, chz - 0.2, RED), // Lehne
    bx(chx - 0.17, 1.15, chz - 0.28, chx + 0.17, 1.38, chz - 0.2, [0.62, 0.1, 0.15]), // Kopfstütze
    bx(chx - 0.36, 0.52, chz - 0.2, chx - 0.28, 0.7, chz + 0.22, CHROME), // Armlehnen
    bx(chx + 0.28, 0.52, chz - 0.2, chx + 0.36, 0.7, chz + 0.22, CHROME),
    bx(chx - 0.2, 0.14, chz + 0.28, chx + 0.2, 0.2, chz + 0.5, CHROME), // Fußrast
    bx(chx - 0.17, 0.2, chz + 0.28, chx + 0.17, 0.4, chz + 0.31, CHROME),
  );
  const chairR = rect('salonChair', chx - 0.42, chz - 0.34, chx + 0.42, chz + 0.54, 1.4);
  colliders.push(chairR);

  // --- Theke an der Westwand ---
  const cz0 = Z0 + 1.0;
  const cz1 = Z0 + 3.6;
  add(
    bx(X0, FY, cz0, X0 + 0.78, 0.98, cz1, WOOD),
    bx(X0, 0.98, cz0, X0 + 0.86, 1.03, cz1, [0.92, 0.9, 0.86]),
    bx(X0 + 0.1, 1.03, cz0 + 0.6, X0 + 0.5, 1.2, cz0 + 1.0, [0.82, 0.8, 0.74]), // Kasse
    bx(X0 + 0.14, 1.2, cz0 + 0.64, X0 + 0.46, 1.34, cz0 + 0.68, [0.3, 0.85, 0.55]), // Anzeige
  );
  for (let i = 0; i < 4; i++) add(bx(X0 + 0.15 + (i % 2) * 0.2, 1.03, cz0 + 1.5 + i * 0.28, X0 + 0.25 + (i % 2) * 0.2, 1.03 + 0.14 + (i % 3) * 0.04, cz0 + 1.6 + i * 0.28, [[0.95, 0.4, 0.6], [0.4, 0.8, 0.95], [0.95, 0.85, 0.3], [0.6, 0.9, 0.5]][i]));
  colliders.push(rect('salonCounter', X0 + T, cz0, X0 + 0.86, cz1, 1.05));

  // --- Waschbecken ---
  const wz0 = Z0 + 4.2;
  const wz1 = Z0 + 5.2;
  add(
    bx(X0, FY, wz0, X0 + 0.66, 0.78, wz1, [0.9, 0.9, 0.92]),
    bx(X0 + 0.04, 0.78, wz0 + 0.1, X0 + 0.6, 0.86, wz1 - 0.1, [0.82, 0.88, 0.95]), // Becken
    bx(X0 + 0.04, 0.86, wz0 + 0.04, X0 + 0.14, 1.12, wz1 - 0.04, CHROME), // Spiegelfuß/Armatur an der Wand
    bx(X0 + 0.14, 1.04, wz0 + 0.46, X0 + 0.4, 1.1, wz0 + 0.54, CHROME), // Hahn
  );
  colliders.push(rect('salonBasin', X0 + T, wz0, X0 + 0.7, wz1, 1.15));

  // --- Föhnhaube ---
  const hz0 = Z0 + 5.65;
  const hz1 = Z0 + 6.55;
  const hzc = (hz0 + hz1) / 2;
  add(
    bx(X0 + 0.05, FY, hz0 + 0.1, X0 + 0.7, 0.06, hz1 - 0.1, CHROME),
    bx(X0 + 0.3, 0.06, hzc - 0.04, X0 + 0.42, 1.5, hzc + 0.04, CHROME), // Stange
    bx(X0 + 0.12, 1.5, hzc - 0.33, X0 + 0.66, 1.9, hzc + 0.33, [0.85, 0.5, 0.62]), // Haube
    bx(X0 + 0.2, 0.4, hzc - 0.25, X0 + 0.66, 0.5, hzc + 0.25, RED), // Sitz
  );
  colliders.push(rect('salonDryer', X0 + T, hz0, X0 + 0.72, hz1, 1.95));

  // --- Kleiderstange (Anker sa.rack, Stange längs z) ---
  const rk = sa.rack;
  const rz0 = rk.z - 0.75;
  const rz1 = rk.z + 0.75;
  add(
    bx(rk.x - 0.03, FY, rz0 - 0.03, rk.x + 0.03, 1.62, rz0 + 0.03, CHROME),
    bx(rk.x - 0.03, FY, rz1 - 0.03, rk.x + 0.03, 1.62, rz1 + 0.03, CHROME),
    bx(rk.x - 0.02, 1.58, rz0, rk.x + 0.02, 1.62, rz1, CHROME),
    bx(rk.x - 0.2, FY, rz0 - 0.08, rk.x + 0.2, 0.05, rz0 + 0.08, CHROME),
    bx(rk.x - 0.2, FY, rz1 - 0.08, rk.x + 0.2, 0.05, rz1 + 0.08, CHROME),
  );
  const cloth = [[0.85, 0.2, 0.2], [0.2, 0.45, 0.8], [0.95, 0.8, 0.2], [0.25, 0.65, 0.4], [0.55, 0.3, 0.7], [0.95, 0.5, 0.15], [0.12, 0.12, 0.14], [0.9, 0.9, 0.92], [0.95, 0.5, 0.65], [0.2, 0.35, 0.3]];
  const nGar = 9;
  for (let i = 0; i < nGar; i++) {
    const gz = rz0 + 0.1 + i * ((rz1 - rz0 - 0.2) / (nGar - 1));
    const c = cloth[i % cloth.length];
    const long = i % 3 === 0;
    add(bx(rk.x - 0.24, long ? 0.62 : 0.88, gz - 0.035, rk.x + 0.24, 1.55, gz + 0.035, c)); // Kleidungsstück
    add(bx(rk.x - 0.31, long ? 1.2 : 1.3, gz - 0.03, rk.x - 0.24, 1.38, gz + 0.03, c)); // Ärmel
    add(bx(rk.x + 0.24, long ? 1.2 : 1.3, gz - 0.03, rk.x + 0.31, 1.38, gz + 0.03, c));
  }
  colliders.push(rect('salonRack', rk.x - 0.36, rz0 - 0.1, rk.x + 0.36, rz1 + 0.1, 1.65));

  // --- Umkleide ---
  const b = sa.booth;
  const bz0 = b.z0;
  const bz1 = Z1 - T;
  const bw = [0.34, 0.26, 0.3];
  add(
    bx(b.x0, FY, bz0, X1, 2.5, bz0 + 0.06, bw), // Nordwand
    bx(b.x0 - 0.06, FY, bz0, b.x0, 2.5, b.curtain.z0, bw), // Pfosten Nord
    bx(b.x0 - 0.06, FY, b.curtain.z1, b.x0, 2.5, bz1, bw), // Pfosten Süd
    bx(b.x0 - 0.06, b.curtain.y1, b.curtain.z0, b.x0, 2.5, b.curtain.z1, bw), // Sturz
    bx(b.x0 - 0.1, b.curtain.y1 - 0.02, b.curtain.z0, b.x0 - 0.06, b.curtain.y1 + 0.02, b.curtain.z1, CHROME), // Vorhangschiene
  );
  // Innenleben: Bank, Haken
  add(bx(b.x0 + 0.1, 0.38, bz1 - 0.5, b.x0 + 0.5, 0.44, bz1 - 0.06, WOOD), bx(b.x0 + 0.12, FY, bz1 - 0.48, b.x0 + 0.18, 0.38, bz1 - 0.42, WOOD), bx(b.x0 + 0.42, FY, bz1 - 0.48, b.x0 + 0.48, 0.38, bz1 - 0.42, WOOD));
  for (let i = 0; i < 3; i++) add(bx(b.x0 + 0.3 + i * 0.35, 1.9, bz0 + 0.06, b.x0 + 0.36 + i * 0.35, 1.98, bz0 + 0.14, CHROME));
  const bmx = X1 - T;
  const bmz = (bz0 + bz1) / 2;
  const bmir = { x: bmx - 0.02, y: 1.2, z: bmz, yaw: -Math.PI / 2, w: 1.3, h: 1.7 };
  add(bx(bmx, bmir.y - bmir.h / 2 - 0.08, bmz - bmir.w / 2 - 0.08, X1, bmir.y + bmir.h / 2 + 0.08, bmz + bmir.w / 2 + 0.08, [0.78, 0.62, 0.22]));
  colliders.push(rect('salonBoothN', b.x0, bz0, X1 - T, bz0 + 0.08, 2.5));
  colliders.push(rect('salonBoothPostN', b.x0 - 0.06, bz0, b.x0, b.curtain.z0, 2.5));
  colliders.push(rect('salonBoothPostS', b.x0 - 0.06, b.curtain.z1, b.x0, bz1, 2.5));

  // --- Vorhang: Streifen längs z (lokal 0..Länge), Pivot an der Nordseite; scale.z = Öffnung ---
  const cur = b.curtain;
  const clen = cur.z1 - cur.z0;
  const strips = [];
  const ns = 9;
  for (let i = 0; i < ns; i++) {
    const z0s = (i / ns) * clen;
    const z1s = ((i + 1) / ns) * clen;
    strips.push(bx(-0.025, 0, z0s, 0.025, cur.y1 - cur.y0, z1s, i % 2 ? [0.55, 0.1, 0.2] : [0.42, 0.07, 0.16], [0.9, 0.9, 1, 0.6, 0.95, 0.85]));
  }

  // --- Plakate ---
  const PY = 1.65;
  const posters = [
    { cell: 0, x: X0 + 0.04, y: 1.72, z: Z0 + 1.7, yaw: Math.PI / 2 }, // über der Theke
    { cell: 1, x: X0 + 0.04, y: 1.72, z: Z0 + 2.95, yaw: Math.PI / 2 },
    { cell: 2, x: X1 - 0.04, y: 2.0, z: rk.z, yaw: -Math.PI / 2 }, // über der Kleiderstange
    { cell: 3, x: X1 - 1.2, y: PY, z: Z0 + T + 0.04, yaw: 0 }, // rechts neben der Tür
  ];
  const ps = 0.95;
  const pg = posters.map((p) => {
    const u0 = (p.cell % 2) / 2;
    const v0 = 1 - (Math.floor(p.cell / 2) + 1) / 2;
    return quad({ w: ps, h: ps, x: p.x, y: p.y, z: p.z, ry: p.yaw, uv: [u0, v0, u0 + 0.5, v0 + 0.5] });
  });

  // --- Meshes ---
  const group = new Group();
  group.name = 'salon-interior';
  const solidMat = new MeshBasicMaterial({ vertexColors: true });
  const solidMesh = new Mesh(merge(solids), solidMat);
  solidMesh.name = 'salon-solids';
  const posterMat = new MeshBasicMaterial(o.posterMap ? { map: o.posterMap, toneMapped: false } : { color: 0xd0607a });
  const posterMesh = new Mesh(merge(pg), posterMat);
  posterMesh.name = 'salon-posters';
  const curMat = new MeshBasicMaterial({ vertexColors: true, side: DoubleSide });
  const curMesh = new Mesh(merge(strips), curMat);
  curMesh.name = 'salon-curtain';
  curMesh.position.set(cur.x, cur.y0, cur.z0);
  curMesh.scale.z = 0.12;
  group.add(solidMesh, posterMesh, curMesh);

  const eyeY = 1.3;
  const spots = {
    chair: { x: chx, z: chz, yaw: ch.yaw, camPos: { x: chx, y: eyeY, z: chz - 0.3 }, camTarget: { x: m.x, y: m.y - 0.15, z: m.z } },
    chairExit: { x: chx + 1.05, z: chz - 0.4, yaw: Math.PI / 2 },
    booth: {
      x: (b.x0 + X1) / 2 + 0.1, z: bmz, yaw: -Math.PI / 2,
      camPos: { x: b.x0 + 0.5, y: 1.5, z: bmz }, camTarget: { x: bmx, y: 1.35, z: bmz },
    },
    boothExit: { x: b.x0 - 0.75, z: bmz, yaw: Math.PI / 2 },
  };
  // Interaktionsboxen (Weltkoordinaten)
  const ia = {
    chair: { min: { x: chx - 0.85, y: 0, z: chz - 0.7 }, max: { x: chx + 0.85, y: 1.7, z: chz + 0.8 } },
    booth: { min: { x: b.x0 - 0.9, y: 0, z: bz0 + 0.1 }, max: { x: X1 - T, y: 2.4, z: bz1 } },
  };

  return {
    group,
    meshes: { solids: solidMesh, posters: posterMesh, curtain: curMesh },
    colliders,
    chairCollider: chairR,
    mirrors: { chair: { id: 'chair', x: m.x, y: m.y, z: m.z, yaw: m.yaw, w: m.w, h: m.h }, booth: { id: 'booth', ...bmir } },
    spots,
    ia,
    /** Vorhang: 0 = offen (zusammengeschoben), 1 = zu. */
    setCurtain(k) { curMesh.scale.z = Math.max(0.12, Math.min(1, 0.12 + k * 0.88)); },
    curtainClosed: () => curMesh.scale.z > 0.99,
    /** Innenhelligkeit (1 = Tag): unbeleuchtete Materialien passen sich der getönten Außenhaut an, damit der Raum nachts nicht „leuchtet“. */
    setBrightness(k) { for (const mat of [solidMat, posterMat, curMat]) mat.color.setScalar(k); },
    dispose() {
      group.removeFromParent();
      for (const mesh of [solidMesh, posterMesh, curMesh]) { mesh.geometry.dispose(); mesh.material.dispose(); }
    },
  };
}
