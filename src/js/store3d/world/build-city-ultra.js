// VIDEOTHEK LENZ · Ultra-Details der Außenwelt (1.19.0, nur Stufe 'ultra'; Registrierung in modules/ultra-city.js).
// Vier Einträge, je ein Ergebnis { object, update?, dispose }: facade (Gesimse, Fensterrahmen, Fallrohre, Klimageräte, Schüsseln, Dach),
// street (Bordsteinfasen, Gullys, Kanaldeckel, Poller, Mülleimer, Fahrradständer, Schilder), trees (Bäume/Kronen als InstancedMesh),
// skyline (ferne Häuser-Silhouetten). Stil wie die Nachbargeometrie: Boxen/Prismen, Vertexfarben, MeshBasicMaterial; Außenmaterialien
// laufen über `out.tint` (Tageszeit/Wetter), die Skyline färbt sich selbst (wie Himmel und Boden). KEINE Kollider, nichts in Laufwegen
// (Plan: world/ultra-plan.js). Je Eintrag höchstens 2 Draw-Calls (facade 2, street 1, trees 2, skyline 1).
import { Group, Mesh, MeshBasicMaterial, InstancedMesh, IcosahedronGeometry, Float32BufferAttribute, Matrix4, Quaternion, Euler, Vector3, Color } from 'three';
import { Raw } from './ultra-geo.js';
import { seeded } from '../modules/m4-util.js';
import { SKY_RADII, skylineRoot } from './ultra-plan.js';

const PI = Math.PI;
const shadeOf = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const lift = (c, k, a = 0) => [Math.min(1, c[0] * k + a), Math.min(1, c[1] * k + a), Math.min(1, c[2] * k + a)];

// --- gemeinsame Helfer ---
function tintedMat(out, base = [1, 1, 1], setup = null) {
  const m = new MeshBasicMaterial({ vertexColors: true });
  if (setup) setup(m); // eigene Shader-Hooks VOR out.tint: der Schnee-Patch (snow.patch) verkettet sie samt Cache-Schlüssel
  out.tint(m, base);
  const sh = out.pal && out.pal.shade;
  if (sh) m.color.setRGB(base[0] * sh[0], base[1] * sh[1], base[2] * sh[2]);
  return m;
}
function untint(out, mats) {
  for (const m of mats) {
    const i = out.tinted ? out.tinted.findIndex((q) => q.mat === m) : -1;
    if (i >= 0) out.tinted.splice(i, 1);
  }
}
function meshOf(raw, mat, name) {
  const geo = raw.geometry();
  if (!geo) return null;
  const m = new Mesh(geo, mat);
  m.name = name;
  m.matrixAutoUpdate = false;
  return m;
}
function disposeMeshes(list, mats) {
  for (const m of list) { if (m) { m.removeFromParent(); m.geometry.dispose(); } }
  for (const m of mats) m.dispose();
}

// =====================================================================================================================
// facade
// =====================================================================================================================
const TRIM = [0.78, 0.75, 0.7];
const FRAME = [0.93, 0.91, 0.86];
const PIPE = [0.25, 0.27, 0.3];
const ACC = [0.84, 0.86, 0.88];
const DK = [0.2, 0.22, 0.27];

/** Rahmenleiste in der Fassadenebene: Mittelpunkt (x,y,z), a = Breite entlang der Wand, b = Höhe, t = Tiefe; axis 'z' (Wand quer z) oder 'x'. */
function bar(raw, axis, x, y, z, a, b, t, col) {
  if (axis === 'z') raw.box(x, y, z, a, b, t, col);
  else raw.box(x, y, z, t, b, a, col);
}

function facadeParts(city, plan) {
  const st = new Raw();
  const yd = new Raw();
  const f = city.frame;
  const bById = new Map(city.buildings.map((b) => [b.id, b]));
  const pf = plan.facade;

  // Gesimse (Traufe + Konsolen, Geschossband) an den Fassaden der Gebäude mit Front
  for (const b of city.buildings) {
    const w = b.x1 - b.x0;
    if (!(b.front && w > 3)) continue;
    const face = b.front === 'S' ? 1 : -1;
    const zf = b.front === 'S' ? b.z1 : b.z0;
    const base = lift(b.color, 1.15, 0.22);
    st.box((b.x0 + b.x1) / 2, b.h - 0.61, zf + face * 0.12, w + 0.12, 0.18, 0.24, base); // Traufgesims
    st.box((b.x0 + b.x1) / 2, b.h - 0.45, zf + face * 0.06, w + 0.04, 0.08, 0.12, shadeOf(base, 0.8)); // Unterkante
    for (let x = b.x0 + 0.6; x < b.x1 - 0.3; x += 1.2) st.box(x, b.h - 0.78, zf + face * 0.07, 0.12, 0.16, 0.14, shadeOf(base, 0.9)); // Konsolen
    if (b.h > 4.5) st.box((b.x0 + b.x1) / 2, 3.52, zf + face * 0.045, w + 0.02, 0.08, 0.09, shadeOf(base, 0.95)); // Geschossband (flacher als die Schildkästen)
  }
  // Fensterrahmen + Sprossen: zwischen Fassade und Fensterquad (Quad liegt 1 cm vor der Wand, Rahmen 2–5 cm)
  for (const w of pf.windows) {
    const hw = w.w / 2;
    const hh = w.h / 2;
    const at = (o) => (w.axis === 'z' ? [w.x + o, w.z + w.face * 0.035] : [w.x + w.face * 0.035, w.z + o]);
    let [ax, az] = at(0);
    bar(st, w.axis, ax, w.y + hh - 0.035, az, w.w + 0.1, 0.08, 0.03, FRAME); // oben
    bar(st, w.axis, ax, w.y - hh + 0.035, az, w.w + 0.1, 0.08, 0.03, FRAME); // unten
    [ax, az] = at(-hw + 0.03); bar(st, w.axis, ax, w.y, az, 0.08, w.h + 0.08, 0.03, FRAME); // links
    [ax, az] = at(hw - 0.03); bar(st, w.axis, ax, w.y, az, 0.08, w.h + 0.08, 0.03, FRAME); // rechts
    [ax, az] = at(0);
    bar(st, w.axis, ax, w.y, az, 0.035, w.h, 0.03, FRAME); // Mittelsprosse
    bar(st, w.axis, ax, w.y + 0.18, az, w.w, 0.035, 0.03, FRAME); // Quersprosse
  }
  // Fallrohre (links), Klimageräte, Schüsseln
  for (const p of pf.pipes) {
    st.box(p.x, p.h / 2, p.z, 0.09, p.h, 0.09, PIPE);
    for (let y = 0.8; y < p.h; y += 1.6) st.box(p.x, y, p.z - p.face * 0.03, 0.13, 0.06, 0.13, shadeOf(PIPE, 1.3));
    st.box(p.x, p.h + 0.04, p.z, 0.12, 0.1, 0.12, shadeOf(PIPE, 1.2));
  }
  for (const a of pf.ac) {
    st.box(a.x, a.y, a.z, 0.72, 0.46, 0.34, ACC);
    for (let k = 0; k < 4; k++) st.box(a.x, a.y - 0.15 + k * 0.1, a.z + a.face * 0.18, 0.6, 0.035, 0.02, DK); // Lüftungsschlitze
    st.box(a.x - 0.25, a.y - 0.3, a.z - a.face * 0.1, 0.06, 0.16, 0.2, PIPE); // Konsolen
    st.box(a.x + 0.25, a.y - 0.3, a.z - a.face * 0.1, 0.06, 0.16, 0.2, PIPE);
  }
  for (const d of pf.dishes) {
    st.box(d.x, d.y - 0.05, d.z + d.face * 0.07, 0.05, 0.05, 0.2, PIPE); // Arm
    st.cyl(d.x, d.y + 0.02, d.z + d.face * 0.2, 0.04, 0.3, 0.16, 10, [0.9, 0.9, 0.92], 0, d.face * (PI / 2 - 0.3), 0, true); // Schüssel, leicht nach oben geneigt
    st.box(d.x, d.y + 0.2, d.z + d.face * 0.38, 0.03, 0.03, 0.22, PIPE, 0, d.face * -0.3); // Feed-Arm
  }
  // Dächer: Lippen, Schornsteine, Antennen
  const BRICK = [0.5, 0.32, 0.28];
  for (const r of pf.roofs) {
    const g = r.group === 'yard' ? yd : st;
    const b = bById.get(r.id);
    const lip = shadeOf(b.color, 0.55);
    const y0 = r.y;
    g.span(r.x0 - 0.15, y0, r.z0 - 0.15, r.x1 + 0.15, y0 + 0.2, r.z0 - 0.05, lip);
    g.span(r.x0 - 0.15, y0, r.z1 + 0.05, r.x1 + 0.15, y0 + 0.2, r.z1 + 0.15, lip);
    g.span(r.x0 - 0.15, y0, r.z0 - 0.05, r.x0 - 0.05, y0 + 0.2, r.z1 + 0.05, lip);
    g.span(r.x1 + 0.05, y0, r.z0 - 0.05, r.x1 + 0.15, y0 + 0.2, r.z1 + 0.05, lip);
    for (const c of r.chimneys) {
      g.box(c.x, y0 + c.h / 2, c.z, c.w, c.h, c.d, BRICK);
      g.box(c.x, y0 + c.h + 0.05, c.z, c.w + 0.14, 0.1, c.d + 0.14, [0.34, 0.33, 0.36]);
      g.cyl(c.x, y0 + c.h + 0.3, c.z, 0.07, 0.07, 0.4, 6, [0.5, 0.5, 0.54]);
    }
    if (r.antenna) {
      const a = r.antenna;
      g.box(a.x, y0 + a.h / 2, a.z, 0.05, a.h, 0.05, [0.55, 0.57, 0.6]);
      for (let k = 0; k < a.bars; k++) g.box(a.x, y0 + a.h - 0.15 - k * 0.4, a.z, 1.0 - k * 0.2, 0.035, 0.035, [0.55, 0.57, 0.6]);
    }
  }
  // LENZ-Laden: Dachabdeckung (Coping) über der Fassade; PALAST: Gesims, Eckpilaster, Dachaufbauten
  const W = f.W;
  const D = f.D;
  st.box(W / 2, 5.37, D + 0.28, W + 0.4, 0.14, 0.36, TRIM);
  const p = city.palast;
  const pr = p.rect;
  const ph = p.h;
  const PT = [0.42, 0.38, 0.58];
  st.box((pr.x0 + pr.x1) / 2, ph - 0.62, pr.z0 - 0.14, pr.x1 - pr.x0 + 0.3, 0.2, 0.28, PT);
  st.box((pr.x0 + pr.x1) / 2, ph - 0.44, pr.z0 - 0.07, pr.x1 - pr.x0 + 0.1, 0.08, 0.14, shadeOf(PT, 0.8));
  for (const x of [pr.x0 + 0.2, pr.x1 - 0.2]) {
    st.box(x, (ph - 0.7) / 2, pr.z0 - 0.07, 0.4, ph - 0.7, 0.14, shadeOf(PT, 0.9)); // Eckpilaster
    st.box(x, 0.12, pr.z0 - 0.09, 0.52, 0.24, 0.18, shadeOf(PT, 0.7)); // Sockel
    st.box(x, ph - 0.95, pr.z0 - 0.1, 0.52, 0.2, 0.2, PT); // Kapitell
  }
  const ry = ph + 0.25;
  for (const [fx, fz, w, d, h] of [[0.3, 0.3, 1.5, 1.1, 1.0], [0.62, 0.55, 1.1, 1.1, 0.8], [0.45, 0.72, 0.8, 0.8, 0.7]]) {
    const cx = pr.x0 + (pr.x1 - pr.x0) * fx;
    const cz = pr.z0 + (pr.z1 - pr.z0) * fz;
    st.box(cx, ry + h / 2, cz, w, h, d, [0.55, 0.57, 0.6]);
    st.box(cx, ry + h + 0.04, cz, w + 0.1, 0.08, d + 0.1, [0.38, 0.4, 0.44]);
  }
  st.box(pr.x0 + (pr.x1 - pr.x0) * 0.78, ry + 2.0, pr.z0 + 4, 0.07, 4.0, 0.07, [0.55, 0.57, 0.6]);
  st.cyl(pr.x0 + (pr.x1 - pr.x0) * 0.78, ry + 3.4, pr.z0 + 3.7, 0.05, 0.5, 0.2, 12, [0.9, 0.9, 0.92], 0, -(PI / 2 - 0.25), 0, true);
  // Hinterhof: Klimageräte hoch an der Hofwand (Gebäude YB, Südseite z = -11 zeigt in den Hof)
  const yb = bById.get('YB');
  if (yb) for (const k of [0.3, 0.55, 0.85]) {
    const x = Math.round(W * k * 100) / 100;
    yd.box(x, 4.3, yb.z1 + 0.19, 0.72, 0.46, 0.34, ACC);
    for (let q = 0; q < 4; q++) yd.box(x, 4.15 + q * 0.1, yb.z1 + 0.37, 0.6, 0.035, 0.02, DK);
    yd.box(x - 0.25, 4.0, yb.z1 + 0.1, 0.06, 0.16, 0.2, PIPE);
    yd.box(x + 0.25, 4.0, yb.z1 + 0.1, 0.06, 0.16, 0.2, PIPE);
  }
  return { st, yd };
}

export function buildUltraFacade(out, city, plan) {
  const { st, yd } = facadeParts(city, plan);
  const mat = tintedMat(out);
  const root = new Group();
  root.name = 'ultra-facade';
  const mStreet = meshOf(st, mat, 'ultra-facade-street');
  const mYard = meshOf(yd, mat, 'ultra-facade-yard');
  if (mStreet) root.add(mStreet);
  if (mYard) root.add(mYard);
  return {
    object: root,
    meshes: [mStreet, mYard].filter(Boolean),
    /** Bereichsgruppen des Moduls `city` spiegeln: Straße immer außer im Saal, Hof nur in der Nähe. */
    sync(groups) {
      if (mStreet) mStreet.visible = groups.street.visible;
      if (mYard) mYard.visible = groups.yard.visible;
    },
    dispose() { root.removeFromParent(); disposeMeshes([mStreet, mYard], [mat]); untint(out, [mat]); },
  };
}

// =====================================================================================================================
// street
// =====================================================================================================================
const CURB = [0.62, 0.62, 0.66];
const CURB_HI = [0.84, 0.84, 0.88];

function signGlyph(raw, s, yaw) {
  const sy = Math.sin(yaw);
  const cy = Math.cos(yaw);
  const at = (ox, oy, oz) => [s.x + ox * cy + (oz + 0.03) * sy, 2.05 + oy, s.z - ox * sy + (oz + 0.03) * cy];
  const BLUE = [0.1, 0.3, 0.68];
  const WHITE = [0.95, 0.95, 0.97];
  const RED = [0.82, 0.12, 0.12];
  const YEL = [0.96, 0.78, 0.12];
  const INK = [0.12, 0.12, 0.15];
  const rect = (ox, oy, oz, w, h, d, c, rz = 0) => { const [x, yy, z] = at(ox, oy, oz); raw.box(x, yy, z, w, h, d, c, yaw, 0, rz); };
  const disc = (ox, oy, oz, r, h, c) => { const [x, yy, z] = at(ox, oy, oz); raw.cyl(x, yy, z, r, r, h, 14, c, yaw, PI / 2, 0, true); };
  raw.box(s.x, 1.1, s.z, 0.05, 2.2, 0.05, [0.5, 0.52, 0.56]); // Pfosten
  if (s.kind === 'ban') {
    disc(0, 0, 0.02, 0.27, 0.03, RED); disc(0, 0, 0.04, 0.19, 0.02, WHITE); rect(0, 0, 0.06, 0.34, 0.08, 0.02, RED);
  } else if (s.kind === 'warn') {
    rect(0, 0, 0.02, 0.5, 0.5, 0.03, INK, PI / 4); rect(0, 0, 0.04, 0.42, 0.42, 0.02, YEL, PI / 4);
    rect(0, 0.05, 0.06, 0.05, 0.17, 0.02, INK); rect(0, -0.12, 0.06, 0.06, 0.06, 0.02, INK);
  } else {
    rect(0, 0, 0.02, 0.5, 0.5, 0.03, BLUE);
    rect(0, 0, 0.04, 0.44, 0.44, 0.015, shadeOf(BLUE, 1.25));
    if (s.kind === 'arrow') { rect(0, -0.06, 0.06, 0.07, 0.24, 0.02, WHITE); rect(0, 0.1, 0.06, 0.2, 0.2, 0.02, WHITE, PI / 4); }
    else if (s.kind === 'info') { rect(0, 0.1, 0.06, 0.07, 0.07, 0.02, WHITE); rect(0, -0.05, 0.06, 0.07, 0.22, 0.02, WHITE); }
    else { disc(-0.13, -0.1, 0.06, 0.08, 0.02, WHITE); disc(0.13, -0.1, 0.06, 0.08, 0.02, WHITE); rect(0, 0.02, 0.06, 0.3, 0.04, 0.02, WHITE); rect(0.06, 0.12, 0.06, 0.04, 0.2, 0.02, WHITE); } // Fahrrad
  }
}

export function buildUltraStreet(out, city, plan) {
  const raw = new Raw();
  const ps = plan.street;
  for (const c of ps.curbs) {
    if (c.axis === 'x') {
      const len = c.x1 - c.x0;
      raw.box((c.x0 + c.x1) / 2, 0.128, c.z - c.dir * 0.012, len, 0.055, 0.055, CURB_HI, 0, PI / 4); // Fase an der Straßenkante
    } else {
      const len = c.z1 - c.z0;
      if (c.solid) raw.span(Math.min(c.x, c.x - c.dir * 0.16), 0, c.z0, Math.max(c.x, c.x - c.dir * 0.16), 0.14, c.z1, CURB);
      raw.box(c.x - c.dir * 0.012, 0.128, (c.z0 + c.z1) / 2, 0.055, 0.055, len, CURB_HI, 0, 0, PI / 4);
    }
  }
  const SLAT = [0.1, 0.1, 0.12];
  for (const g of ps.grates) {
    raw.box(g.x, 0.0, g.z, 0.56, 0.02, 0.3, [0.34, 0.35, 0.4]);
    for (let k = -2; k <= 2; k++) raw.box(g.x + k * 0.1, 0.011, g.z, 0.035, 0.004, 0.24, SLAT);
  }
  for (const m of ps.manholes) {
    raw.cyl(m.x, 0.0, m.z, 0.34, 0.34, 0.02, 14, [0.24, 0.25, 0.29]);
    raw.cyl(m.x, 0.006, m.z, 0.27, 0.27, 0.012, 14, [0.17, 0.18, 0.21]);
    raw.box(m.x, 0.013, m.z, 0.5, 0.004, 0.05, [0.3, 0.31, 0.35]);
    raw.box(m.x, 0.013, m.z, 0.05, 0.004, 0.5, [0.3, 0.31, 0.35]);
  }
  for (const b of ps.bollards) {
    raw.cyl(b.x, 0.45, b.z, 0.07, 0.065, 0.9, 8, [0.22, 0.24, 0.28]);
    raw.cyl(b.x, 0.7, b.z, 0.072, 0.072, 0.09, 8, [0.96, 0.8, 0.1]);
    raw.cyl(b.x, 0.93, b.z, 0.065, 0.035, 0.06, 8, [0.3, 0.32, 0.36]);
  }
  for (const b of ps.bins) {
    raw.cyl(b.x, 0.41, b.z, 0.15, 0.17, 0.82, 10, [0.2, 0.34, 0.3]);
    raw.cyl(b.x, 0.55, b.z, 0.172, 0.172, 0.04, 10, [0.96, 0.8, 0.1]);
    raw.cyl(b.x, 0.855, b.z, 0.185, 0.185, 0.06, 10, [0.13, 0.2, 0.18]);
    raw.cyl(b.x, 0.9, b.z, 0.07, 0.05, 0.04, 8, [0.3, 0.32, 0.36]);
  }
  const STEEL = [0.5, 0.52, 0.56];
  for (const h of ps.hoops) {
    const dx = h.yaw === 0 ? 1 : 0;
    const dz = h.yaw === 0 ? 0 : 1;
    for (const k of [-0.5, 0, 0.5]) {
      const x = h.x + dx * k;
      const z = h.z + dz * k;
      const lx = dx * 0.23;
      const lz = dz * 0.23;
      raw.box(x - lx, 0.38, z - lz, 0.035, 0.76, 0.035, STEEL);
      raw.box(x + lx, 0.38, z + lz, 0.035, 0.76, 0.035, STEEL);
      raw.box(x, 0.77, z, dx ? 0.5 : 0.035, 0.035, dz ? 0.5 : 0.035, STEEL);
    }
  }
  for (const s of ps.signs) signGlyph(raw, s, s.yaw);
  const mat = tintedMat(out);
  const mesh = meshOf(raw, mat, 'ultra-street-mesh');
  const root = new Group();
  root.name = 'ultra-street';
  if (mesh) root.add(mesh);
  return {
    object: root,
    meshes: [mesh].filter(Boolean),
    sync(groups) { if (mesh) mesh.visible = groups.street.visible; },
    dispose() { root.removeFromParent(); disposeMeshes([mesh], [mat]); untint(out, [mat]); },
  };
}

// =====================================================================================================================
// trees
// =====================================================================================================================
const GREENS = [new Color(0.07, 0.3, 0.08), new Color(0.15, 0.4, 0.09), new Color(0.05, 0.24, 0.12)]; // Werte sind linear (wie alle Vertexfarben der Stadt)

function crownGeometry() {
  const g = new IcosahedronGeometry(1, 1);
  const pos = g.attributes.position;
  const col = new Float32Array(pos.count * 3);
  const r = seeded(4242);
  const a = new Vector3();
  const b = new Vector3();
  const c = new Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const n = b.clone().sub(a).cross(c.clone().sub(a)).normalize();
    const sh = 0.62 + 0.38 * (n.y * 0.5 + 0.5) + (r() - 0.5) * 0.14; // helle Oberseiten, dunkle Unterseiten, Facetten-Streuung
    for (let k = 0; k < 3; k++) { col[(i + k) * 3] = sh; col[(i + k) * 3 + 1] = sh; col[(i + k) * 3 + 2] = sh; }
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

/** Wiege-Periode (s): 1,4·T = 28π und 1,1·T = 22π → beide Terme schließen nahtlos; uSway bleibt klein (float32). */
export const SWAY_PERIOD = 20 * PI;
/** Wiege-Zeit ab Modulstart t0, periodisch in [0, SWAY_PERIOD). */
export function swayTime(t, t0 = 0) {
  const d = (t - t0) % SWAY_PERIOD;
  return d < 0 ? d + SWAY_PERIOD : d;
}
/** onBeforeCompile-Hook fürs Wiegen der Kronen (Instanzen). */
function swayHook(uSway) {
  return (sh) => {
    sh.uniforms.uSway = uSway;
    sh.vertexShader = `uniform float uSway;\n${sh.vertexShader}`.replace('#include <begin_vertex>', `#include <begin_vertex>
#ifdef USE_INSTANCING
  float lfxPh = instanceMatrix[3].x * 0.6 + instanceMatrix[3].z * 0.9;
  float lfxK = position.y * 0.5 + 0.6;
  transformed.x += sin(uSway * 1.4 + lfxPh) * 0.05 * lfxK;
  transformed.z += cos(uSway * 1.1 + lfxPh * 1.3) * 0.04 * lfxK;
#endif`);
  };
}

export function buildUltraTrees(out, city, plan) {
  const root = new Group();
  root.name = 'ultra-trees';
  const trees = plan.trees;
  const crowns = plan.crowns;
  if (!trees.length) return { object: root, sync() {}, dispose() { root.removeFromParent(); } };
  const uSway = { value: 0 };
  // Wiegen: Zeitbasis ab Modulstart, nahtlos periodisch (SWAY_PERIOD); bei prefers-reduced-motion ruhig (Listener wird in dispose entfernt)
  let t0 = null;
  let mq = null;
  try { mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null; } catch { mq = null; }
  let still = !!(mq && mq.matches);
  const onMq = (e) => { still = !!(e && typeof e.matches === 'boolean' ? e.matches : mq && mq.matches); };
  if (mq) { try { if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); } catch { /* egal */ } }
  const crownMat = tintedMat(out, [1, 1, 1], (m) => { m.onBeforeCompile = swayHook(uSway); m.customProgramCacheKey = () => 'lfx-ultra-sway'; });
  const trunkMat = tintedMat(out);
  const crownGeo = crownGeometry();
  const tr = new Raw();
  tr.cyl(0, 0.07, 0, 0.17, 0.12, 0.14, 6, [0.13, 0.08, 0.05]);
  tr.cyl(0, 1.2, 0, 0.12, 0.07, 2.4, 6, [0.17, 0.1, 0.06]);
  const trunkGeo = tr.geometry();
  const crownMesh = new InstancedMesh(crownGeo, crownMat, crowns.length);
  const trunkMesh = new InstancedMesh(trunkGeo, trunkMat, trees.length);
  crownMesh.name = 'ultra-tree-crowns';
  trunkMesh.name = 'ultra-tree-trunks';
  const m = new Matrix4();
  const q = new Quaternion();
  const e = new Euler();
  const p = new Vector3();
  const s = new Vector3();
  const rand = seeded(909);
  crowns.forEach((c, i) => {
    q.setFromEuler(e.set(0, rand() * PI * 2, 0));
    m.compose(p.set(c.x, c.y, c.z), q, s.set(c.sx, c.sy, c.sz));
    crownMesh.setMatrixAt(i, m);
    crownMesh.setColorAt(i, GREENS[c.tone % 3]);
  });
  trees.forEach((t, i) => {
    q.setFromEuler(e.set(0, rand() * PI * 2, 0));
    m.compose(p.set(t.x, 0, t.z), q, s.set(1, t.trunk / 2.4, 1));
    trunkMesh.setMatrixAt(i, m);
  });
  crownMesh.instanceMatrix.needsUpdate = true;
  trunkMesh.instanceMatrix.needsUpdate = true;
  if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
  root.add(trunkMesh, crownMesh);
  return {
    object: root,
    meshes: [crownMesh, trunkMesh],
    get still() { return still; },
    update(dt, t) {
      if (still) return;
      if (t0 === null) t0 = t;
      uSway.value = swayTime(t, t0);
    },
    sync(groups) { root.children.forEach((c) => { c.visible = groups.street.visible; }); },
    dispose() {
      if (mq) { try { if (mq.removeEventListener) mq.removeEventListener('change', onMq); else if (mq.removeListener) mq.removeListener(onMq); } catch { /* egal */ } }
      root.removeFromParent();
      crownMesh.dispose(); trunkMesh.dispose();
      crownGeo.dispose(); trunkGeo.dispose(); crownMat.dispose(); trunkMat.dispose();
      untint(out, [crownMat, trunkMat]);
    },
  };
}

// =====================================================================================================================
// skyline
// =====================================================================================================================
const WARM = [1, 0.8, 0.46];
const COOL = [0.4, 0.56, 0.85];
const FOG_MIX = [0.4, 0.52, 0.64]; // Anteil Horizontfarbe je Ring (Luftperspektive: weiter weg = nebliger)
/** Anteil Horizontfarbe eines Rings bei Wetter-Nebel fog 0..1 (bei 1 ganz in Nebelfarbe). */
export function fogMixOf(layer, fog) {
  const f = fog > 0 ? Math.min(1, fog) : 0;
  return FOG_MIX[layer] + (1 - FOG_MIX[layer]) * f;
}

export function buildUltraSkyline(out, city, plan, camera) {
  const sk = plan.skyline;
  const raw = new Raw();
  const bodies = []; // { v0, v1, layer, tone }
  const wins = []; // { v0, lit, layer }
  const rand = seeded(2718);
  for (const b of sk.blds) {
    const v0 = raw.vertexCount;
    const sy = Math.sin(b.rot);
    const cy = Math.cos(b.rot);
    raw.box(b.x, b.h / 2 - 0.05, b.z, b.w, b.h, b.d, [1, 1, 1], b.rot);
    if (b.roof) raw.box(b.x + (b.w * 0.1) * cy, b.h + b.roof.h / 2 - 0.05, b.z - (b.w * 0.1) * sy, b.roof.w, b.roof.h, b.roof.d, [1, 1, 1], b.rot);
    bodies.push({ v0, v1: raw.vertexCount, layer: b.layer, tone: b.tone });
    // Fenster auf der Innenseite (lokal +z zeigt zur Mitte)
    const cols = Math.max(1, Math.floor((b.w - 1.2) / 2.4));
    const rows = Math.max(1, Math.floor((b.h - 3) / 3));
    for (let rr = 0; rr < rows; rr++) {
      for (let k = 0; k < cols; k++) {
        const lx = (k - (cols - 1) / 2) * 2.4;
        const ly = 2.6 + rr * 3 + 0.8;
        const lz = b.d / 2 + 0.04;
        const wx = b.x + lx * cy + lz * sy;
        const wz = b.z - lx * sy + lz * cy;
        const v = raw.panel(wx, ly - 0.05, wz, 0.95, 1.35, [1, 1, 1], b.rot);
        wins.push({ v0: v, lit: rand(), layer: b.layer });
      }
    }
  }
  const shadeArr = Float32Array.from(raw.c); // aktuell: reine Flächenhelligkeit (Farbe war 1,1,1)
  const geo = raw.geometry();
  const mat = new MeshBasicMaterial({ vertexColors: true, fog: false });
  const mesh = new Mesh(geo, mat);
  mesh.name = 'ultra-skyline';
  mesh.frustumCulled = false;
  const root = new Group();
  root.name = 'ultra-skyline';
  root.add(mesh);
  const col = geo.attributes.color;
  const mix = (a, b, k) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
  // Wetter-Nebel (0..1): die Skyline läuft mit dichterem Nebel gegen die Horizontfarbe (= Nebelfarbe), weich nachgeführt
  const fogOf = () => { const f = out.wx && Number.isFinite(out.wx.fog) ? out.wx.fog : 0; return f > 0 ? Math.min(1, f) : 0; };
  let fk = fogOf();
  const fogMix = (layer) => fogMixOf(layer, fk);
  function recolor(tod, rain, pal) {
    if (!pal) return;
    const hor = pal.sky[2];
    const shade = pal.shade;
    const litP = tod === 'night' ? 0.15 : tod === 'dusk' ? 0.08 : 0;
    for (const bd of bodies) {
      const m = fogMix(bd.layer);
      const base = [(0.17 + bd.tone * 0.1) * shade[0], (0.19 + bd.tone * 0.08) * shade[1], (0.25 + bd.tone * 0.07) * shade[2]];
      const c = mix(base, hor, m);
      for (let v = bd.v0; v < bd.v1; v++) col.setXYZ(v, c[0] * shadeArr[v * 3], c[1] * shadeArr[v * 3], c[2] * shadeArr[v * 3]);
    }
    for (const w of wins) {
      const m = fogMix(w.layer);
      let c;
      if (w.lit < litP) c = mix(w.lit < litP * 0.7 ? WARM : COOL, hor, m * 0.35);
      else c = mix([0.1 * shade[0] + 0.02, 0.13 * shade[1] + 0.03, 0.2 * shade[2] + 0.05], hor, m);
      for (let k = 0; k < 4; k++) col.setXYZ(w.v0 + k, c[0], c[1], c[2]);
    }
    col.needsUpdate = true;
  }
  const hook = (tod, rain, pal) => recolor(tod, rain, pal);
  out.hooks.push(hook);
  recolor(out.tod, out.rain, out.pal);
  return {
    object: root,
    meshes: [mesh],
    update(dt) {
      const tg = fogOf();
      if (tg !== fk) {
        fk = Math.abs(tg - fk) < 0.01 ? tg : fk + (tg - fk) * Math.min(1, (dt > 0 ? dt : 0.016) * 3);
        recolor(out.tod, out.rain, out.pal);
      }
      const cam = camera;
      if (!cam) return;
      const p = skylineRoot(sk, cam.position.x, cam.position.z);
      root.position.set(p.x, 0, p.z);
      root.updateMatrixWorld(true);
    },
    /** Drinnen (Saal, Foyer, Salon) nicht zeichnen. */
    sync(groups, area) { root.visible = !(area === 'palastHall' || area === 'palastFoyer' || area === 'salon'); },
    dispose() {
      const i = out.hooks.indexOf(hook);
      if (i >= 0) out.hooks.splice(i, 1);
      root.removeFromParent();
      geo.dispose();
      mat.dispose();
    },
  };
}

export { SKY_RADII };
