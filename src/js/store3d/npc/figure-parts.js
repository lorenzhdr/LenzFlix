// VIDEOTHEK LENZ · Figur v2 (1.17.0): Teile-Baukasten für den Render-Look v2 (reine Geometrie, nur Boxen/Kugeln mit Vertexfarbe).
// buildV2Parts(look) → { [bone]: Geometrie[] } für die Bones spine(1)/head(2)/armL(3)/armR(4)/legL(5)/legR(6) – genau wie der alte Pfad in
// npc/figure.js, das daraus EIN SkinnedMesh merged. Koordinaten = Bind-Pose (Gesicht zeigt nach −z). Unbekannte IDs zeichnen als Standard.
// IDs: char/ids.js. Der alte Pfad (Looks ohne v===2) bleibt in figure.js unberührt.
import { ConeGeometry, CylinderGeometry, Float32BufferAttribute, Matrix4, Euler, Quaternion, Vector3 } from 'three';
import { box } from '../util/geo.js';
import { sph } from '../modules/m4-geo.js';
import {
  HAIR_STYLES, EYES, BROWS, BEARDS, SHAPES, TOP_CUTS, TOP_PATTERNS, BOTTOM_CUTS, BOTTOM_PATTERNS, SHOE_MODELS, GLASSES, HATS, BAGS,
  UNLOCK_TOPS, UNLOCK_BOTTOMS, UNLOCK_SHOES, UNLOCK_GLASSES, UNLOCK_HATS, UNLOCK_BAGS,
} from '../char/ids.js';

export const BONE = { root: 0, spine: 1, head: 2, armL: 3, armR: 4, legL: 5, legR: 6 };
const SK = BONE.spine;
const HD = BONE.head;

const sc = (c, k) => c.map((v) => Math.min(1, Math.max(0, v * k)));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const isCol = (c) => Array.isArray(c) && c.length >= 3 && c.every((v) => Number.isFinite(v));
const col = (c, d) => (isCol(c) ? [c[0], c[1], c[2]] : d);
const pick = (list, id, def) => (list.includes(id) ? id : def);
const WHITE = [0.93, 0.93, 0.95];
const BLACK = [0.07, 0.07, 0.09];
const GOLD = [0.95, 0.78, 0.22];
const HAT_GOLD = [0.86, 0.58, 0.08]; // Freischalt-Hüte (goldcap/crown): feste Goldfarbe, unabhängig von hat.color

/** Kopf: Ellipsoid r 0,12, Skalierung 1/1,1/1 bei y 1,58, Vorderseite z ≈ −0,12 (Bind-Pose, vor der Kopf-Vergrößerung HEAD_K). */
const HEAD = { r: 0.12, sy: 1.1, cy: 1.58 };
const HEAD_WS = 12; // Kopf: 12 × 8 Facetten (Vorderseite = Meridian, Äquator = Reihe)
const HEAD_HS = 8;
/** Der ganze Kopf (alle Teile des Kopf-Bones) wird um den Hals (y 1,44) vergrößert, damit er nicht winzig wirkt. */
const HEAD_K = 1.15;
const NECK_PIVOT = 1.44;
/** Haaransatz vorn (Unterkante der Haarkappe über der Stirn), oberhalb der Brauen. */
const HAIRLINE = 1.665;

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);
function tint(g, color) {
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = color[0]; c[i * 3 + 1] = color[1]; c[i * 3 + 2] = color[2]; }
  g.setAttribute('color', new Float32BufferAttribute(c, 3));
  return g;
}
/** Kegel/Pyramide (seg Seiten, Spitze oben) mit Vertexfarbe; Mittelpunkt (x,y,z), Drehung rx/ry/rz. */
function cone(r, h, seg, x, y, z, color, rx = 0, ry = 0, rz = 0) {
  const g = tint(new ConeGeometry(r, h, seg, 1), color);
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); _p.set(x, y, z);
  g.applyMatrix4(_m.compose(_p, _q, _s));
  return g;
}
function drum(r, h, seg, x, y, z, color) {
  const g = tint(new CylinderGeometry(r, r, h, seg, 1), color);
  g.translate(x, y, z);
  return g;
}
/**
 * Bart als Schale über dem unteren Gesicht: leicht vergrößerte Kopf-Ellipse (gleiche Facetten wie der Kopf), vorn oberhalb yTop
 * abgeschnitten (Punkte auf yTop geklemmt), die hintere Hälfte entfällt (Dreiecke ohne vordere Punkte werden entfernt).
 */
function beardShell(color, yTop, k) {
  const g = sph(HEAD.r, 0, HEAD.cy, 0, color, k, HEAD.sy * k, k, HEAD_WS, HEAD_HS);
  const a = g.attributes.position;
  const skip = new Uint8Array(a.count); // 1 = hinten, 2 = oben geklemmt
  for (let i = 0; i < a.count; i++) {
    const y = a.getY(i);
    if (a.getZ(i) > 0.015) skip[i] = 1;
    else if (y > yTop) { a.setY(i, yTop); skip[i] = 2; }
  }
  const idx = g.index.array;
  const keep = [];
  for (let t = 0; t < idx.length; t += 3) {
    const s0 = skip[idx[t]];
    if (s0 && s0 === skip[idx[t + 1]] && s0 === skip[idx[t + 2]]) continue;
    keep.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  g.setIndex(keep);
  a.needsUpdate = true;
  return g;
}
/** Quader auf der Kopfoberfläche: z folgt dem Ellipsoid, p = Überstand vor der Haut, Neigung nach der Flächennormalen. */
function faceBox(list, w, h, d, x, y, color, p = 0.004, rz = 0) {
  const u = x / HEAD.r;
  const v = (y - HEAD.cy) / (HEAD.r * HEAD.sy);
  const zs = -HEAD.r * Math.sqrt(Math.max(0.02, 1 - u * u - v * v));
  const nx = x / (HEAD.r * HEAD.r);
  const ny = (y - HEAD.cy) / (HEAD.r * HEAD.r * HEAD.sy * HEAD.sy);
  const nz = zs / (HEAD.r * HEAD.r);
  list.push(box({ w, h, d, x, y, z: zs - p + d / 2, rx: Math.atan2(ny, -nz), ry: -Math.atan2(nx, -nz), rz, color }));
}

/** Look tolerant lesen (fehlende/kaputte Felder → Standard). */
function norm(look) {
  const o = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  const t = o(look.top);
  const b = o(look.bottom);
  const s = o(look.shoes);
  const h = o(look.hat);
  const g = o(look.bag);
  const allTops = [...TOP_CUTS, ...UNLOCK_TOPS];
  const allBottoms = [...BOTTOM_CUTS, ...UNLOCK_BOTTOMS];
  const allShoes = [...SHOE_MODELS, ...UNLOCK_SHOES];
  const allGlasses = [...GLASSES, ...UNLOCK_GLASSES];
  const allHats = [...HATS, ...UNLOCK_HATS];
  const allBags = [...BAGS, ...UNLOCK_BAGS];
  const skin = col(look.skin, [0.9, 0.7, 0.55]);
  const topC = col(t.color, [0.85, 0.2, 0.2]);
  const botC = col(b.color, [0.14, 0.16, 0.3]);
  return {
    skin,
    shape: pick(SHAPES, look.shape, 'straight'),
    hairStyle: pick(HAIR_STYLES, look.hairStyle, 'short'),
    hair: col(look.hair, [0.24, 0.13, 0.1]),
    eyes: pick(EYES, look.eyes, 'dot'),
    brows: pick(BROWS, look.brows, 'none'),
    beard: pick(BEARDS, look.beard, 'none'),
    topCut: pick(allTops, t.cut, 'tee'),
    top: topC,
    topPat: pick(TOP_PATTERNS, t.pattern, 'plain'),
    top2: col(t.color2, sc(topC, 0.6)),
    botCut: pick(allBottoms, b.cut, 'jeans'),
    bottom: botC,
    botPat: pick(BOTTOM_PATTERNS, b.pattern, 'plain'),
    bottom2: col(b.color2, sc(botC, 0.6)),
    shoeModel: pick(allShoes, s.model, 'sneaker'),
    shoe: col(s.color, [0.1, 0.1, 0.12]),
    sole: col(s.sole, [0.92, 0.92, 0.94]),
    glasses: pick(allGlasses, look.glasses, 'none'),
    hat: pick(allHats, h.id, 'none'),
    hatC: col(h.color, [0.8, 0.2, 0.2]),
    bag: pick(allBags, g.id, 'none'),
    bagC: col(g.color, [0.3, 0.3, 0.4]),
  };
}

const COVER = new Set(['cap', 'beanie', 'hat', 'bucket', 'beret', 'goldcap', 'catears', 'canhat', 'usher']);

export function buildV2Parts(look, opts = {}) {
  const L = norm(look || {});
  const P = { [BONE.spine]: [], [BONE.head]: [], [BONE.armL]: [], [BONE.armR]: [], [BONE.legL]: [], [BONE.legR]: [] };
  const sp = P[SK];
  const hd = P[HD];
  const skin = L.skin;
  const dims = { straight: { sw: 0.42, hw: 0.42, lx: 0.1, lw: 0.14 }, shoulders: { sw: 0.48, hw: 0.4, lx: 0.1, lw: 0.14 }, hips: { sw: 0.4, hw: 0.47, lx: 0.11, lw: 0.15 } }[L.shape];
  const { sw, hw, lx, lw } = dims;
  const ax = sw / 2 + 0.05;
  const wAt = (y) => (y >= 1.1 ? sw : hw);
  const bx = (list, w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) => list.push(box({ w, h, d, x, y, z, rx, ry, rz, color }));

  buildBottoms(P, L, { lx, lw, hw, ego: !!opts.ego });
  if (opts.ego) {
    // Ego (Ich-Sicht): nur Beine, Schuhe und (bei Rock/Kleid) der Rock – kein Bund-Brett, Hals, Torso, Arme oder Kopf
    if (L.topCut === 'dress') {
      bx(sp, hw + 0.1, 0.36, 0.31, 0, 0.64, 0, L.top);
      bx(sp, hw + 0.11, 0.03, 0.32, 0, 0.47, 0, L.top2);
    }
    buildShoes(P, L, { lx });
    return P;
  }
  buildTop(P, L, { sw, hw, ax, wAt, bx });
  // Kopf, Hals
  bx(sp, 0.075, 0.09, 0.075, 0, 1.425, 0, skin);
  hd.push(sph(HEAD.r, 0, HEAD.cy, 0, skin, 1, HEAD.sy, 1, HEAD_WS, HEAD_HS));
  buildHair(P, L);
  buildFace(P, L);
  buildGlasses(hd, L);
  buildHat(hd, L);
  // Kopf um den Hals vergrößern (alle Kopf-Teile gemeinsam, Gesicht bleibt auf der Oberfläche)
  for (const g of hd) { g.translate(0, -NECK_PIVOT, 0); g.scale(HEAD_K, HEAD_K, HEAD_K); g.translate(0, NECK_PIVOT, 0); }
  buildShoes(P, L, { lx });
  buildBag(P, L, { ax, bx });
  return P;
}

/* ------------------------------------------------------------------ Hosen */
function buildBottoms(P, L, { lx, lw, hw, ego = false }) {
  const c = L.bottom;
  const c2 = L.bottom2;
  const cut = L.botCut;
  const skin = L.skin;
  const pat = L.botPat;
  const sp = P[SK];
  const pushB = (list, w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) => list.push(box({ w, h, d, x, y, z, rx, ry, rz, color }));
  // Hosenbund (Gürtellinie unter dem Oberteil)
  if (cut !== 'skirt' && !ego) pushB(sp, hw + 0.012, 0.035, 0.24, 0, 0.815, 0, sc(c, 0.75)); // in Ego-Ansicht kein Bund-Brett über den Beinen
  for (const [side, bi] of [[-1, BONE.legL], [1, BONE.legR]]) {
    const a = P[bi];
    const x = side * lx;
    if (cut === 'shorts') {
      pushB(a, lw, 0.38, 0.17, x, 0.61, 0, c);
      pushB(a, lw - 0.02, 0.42, 0.15, x, 0.21, 0, skin);
      pushB(a, lw + 0.01, 0.03, 0.18, x, 0.425, 0, sc(c, 0.8));
    } else if (cut === 'skirt') {
      pushB(a, lw - 0.02, 0.56, 0.15, x, 0.28, 0, skin);
      pushB(a, lw - 0.015, 0.05, 0.155, x, 0.03, 0, WHITE); // Socken
    } else if (cut === 'wide') {
      pushB(a, lw + 0.02, 0.66, 0.18, x, 0.47, 0, c);
      pushB(a, lw + 0.04, 0.15, 0.2, x, 0.075, 0, sc(c, 0.9));
    } else if (cut === 'cargo') {
      pushB(a, lw + 0.015, 0.8, 0.19, x, 0.4, 0, c);
      pushB(a, 0.04, 0.12, 0.1, x + side * 0.088, 0.5, 0, sc(c, 0.82));
    } else if (cut === 'zebra') {
      pushB(a, lw, 0.8, 0.17, x, 0.4, 0, WHITE);
      for (const y of [0.1, 0.28, 0.46, 0.64]) pushB(a, lw + 0.012, 0.07, 0.182, x, y, 0, BLACK);
    } else {
      pushB(a, lw, 0.8, 0.17, x, 0.4, 0, c); // jeans, track
      if (cut === 'track') pushB(a, 0.008, 0.78, 0.1, x + side * (lw / 2 + 0.004), 0.4, 0, WHITE);
    }
    if (cut === 'zebra') continue;
    const wd = cut === 'wide' ? lw + 0.03 : lw;
    if (pat === 'stripe' && cut !== 'skirt') pushB(a, 0.01, 0.78, 0.1, x + side * (wd / 2 + 0.005), 0.4, 0, c2);
    else if (pat === 'twotone' && cut !== 'skirt') pushB(a, wd + 0.012, cut === 'shorts' ? 0.2 : 0.38, 0.182, x, cut === 'shorts' ? 0.2 : 0.19, 0, c2);
    else if (pat === 'check' && cut !== 'skirt') {
      for (const y of cut === 'shorts' ? [0.7, 0.55] : [0.6, 0.25]) pushB(a, wd + 0.012, 0.035, 0.182, x, y, 0, c2);
      pushB(a, 0.035, 0.76, 0.182, x, 0.4, 0, c2);
    }
  }
  if (cut === 'skirt') {
    pushB(sp, hw + 0.08, 0.34, 0.3, 0, 0.67, 0, c);
    pushB(sp, hw + 0.09, 0.03, 0.31, 0, 0.51, 0, sc(c, 0.8));
    if (pat === 'stripe') pushB(sp, 0.05, 0.34, 0.312, 0, 0.67, 0, c2);
    else if (pat === 'twotone') pushB(sp, hw + 0.09, 0.14, 0.312, 0, 0.58, 0, c2);
    else if (pat === 'check') { pushB(sp, hw + 0.09, 0.035, 0.312, 0, 0.7, 0, c2); pushB(sp, 0.035, 0.34, 0.312, -0.1, 0.67, 0, c2); pushB(sp, 0.035, 0.34, 0.312, 0.1, 0.67, 0, c2); }
  }
}

/* ---------------------------------------------------------------- Oberteil */
function buildTop(P, L, { sw, hw, ax, wAt, bx }) {
  const sp = P[SK];
  const c = L.top;
  const c2 = L.top2;
  const cut = L.topCut;
  const skin = L.skin;
  const thick = cut === 'sweater' || cut === 'jacket' || cut === 'hoodie';
  const gr = thick ? 0.02 : 0;
  const td = 0.23 + (thick ? 0.03 : 0);
  const fz = -td / 2;
  const bz = td / 2;
  const unlock = UNLOCK_TOPS.includes(cut);
  const torso = (color, g = gr, d = td, h0 = 0) => {
    if (sw === hw) sp.push(box({ w: sw + g, h: 0.58 - h0, d, y: 1.09 - h0 / 2, color }));
    else { sp.push(box({ w: sw + g, h: 0.28, d, y: 1.24, color })); sp.push(box({ w: hw + g, h: 0.3 - h0, d, y: 0.95 - h0 / 2, color })); }
  };
  // Ärmel: [oben, unten] = Farbe | null (Haut); Breite w
  let up = c;
  let lo = skin;
  let aw = 0.09;
  let alw = 0.085;
  const long = () => { lo = c; };
  switch (cut) {
    case 'tee': case 'polo': torso(c); break;
    case 'longsleeve': torso(c); long(); break;
    case 'hoodie': torso(c); long(); aw = 0.105; alw = 0.1; break;
    case 'shirt': torso(c); long(); break;
    case 'tank': torso(skin, 0, 0.22); sp.push(box({ w: sw - 0.1, h: 0.58, d: td + 0.012, y: 1.09, color: c })); up = skin; break;
    case 'sweater': torso(c); long(); aw = 0.105; alw = 0.1; break;
    case 'jacket': torso(c); long(); aw = 0.1; alw = 0.095; break;
    case 'vest': torso(c2, 0, 0.23); up = c2; break;
    case 'dress': torso(c); break;
    case 'cape': torso(sc(c, 0.85)); up = c; lo = c; aw = 0.1; alw = 0.095; break;
    case 'jersey3': torso(c); up = c; break;
    case 'banshirt': torso(c); break;
    case 'hivis': torso(c2, 0, 0.23); up = c2; break;
    default: torso(c);
  }
  for (const [sx, bi] of [[-1, BONE.armL], [1, BONE.armR]]) {
    const a = P[bi];
    const x = sx * ax;
    a.push(box({ w: aw, h: 0.3, d: aw, x, y: 1.21, z: 0, color: up }));
    a.push(box({ w: alw, h: 0.26, d: alw, x, y: 0.93, z: 0, color: lo }));
    a.push(sph(0.05, x, 0.78, 0, skin, 1, 1, 1, 6, 3));
    if (cut === 'shirt' || cut === 'sweater' || cut === 'jacket' || cut === 'hoodie' || cut === 'longsleeve') a.push(box({ w: alw + 0.012, h: 0.03, d: alw + 0.012, x, y: 0.815, z: 0, color: sc(c, cut === 'shirt' ? 1.2 : 0.8) }));
    if (cut === 'jersey3') a.push(box({ w: alw + 0.015, h: 0.045, d: alw + 0.015, x, y: 0.84, z: 0, color: WHITE })); // Schweißband
    if (cut === 'jersey3') a.push(box({ w: aw + 0.012, h: 0.04, d: aw + 0.012, x, y: 1.1, z: 0, color: c2 }));
    if (cut === 'tee' && L.topPat === 'twotone') a.push(box({ w: aw + 0.012, h: 0.12, d: aw + 0.012, x, y: 1.13, z: 0, color: c2 }));
    if (cut === 'hivis' || cut === 'vest') a.push(box({ w: aw + 0.01, h: 0.04, d: aw + 0.01, x, y: 1.09, z: 0, color: sc(c2, 0.8) }));
    if (cut === 'cape') a.push(box({ w: aw + 0.014, h: 0.03, d: aw + 0.014, x, y: 0.82, z: 0, color: sc(c, 0.7) }));
  }
  // Schnitt-Details
  if (cut === 'hoodie') {
    bx(sp, 0.2, 0.12, 0.1, 0, 1.44, bz - 0.01, c);
    bx(sp, 0.2, 0.09, 0.015, 0, 0.99, fz - 0.007, sc(c, 0.82));
    bx(sp, 0.012, 0.1, 0.012, -0.03, 1.33, fz - 0.007, WHITE);
    bx(sp, 0.012, 0.1, 0.012, 0.03, 1.33, fz - 0.007, WHITE);
  } else if (cut === 'shirt') {
    bx(sp, 0.07, 0.05, 0.02, -0.04, 1.375, fz - 0.004, sc(c, 1.25), 0, 0, 0.45);
    bx(sp, 0.07, 0.05, 0.02, 0.04, 1.375, fz - 0.004, sc(c, 1.25), 0, 0, -0.45);
    bx(sp, 0.016, 0.52, 0.006, 0, 1.1, fz - 0.003, sc(c, 0.7));
  } else if (cut === 'polo') {
    bx(sp, 0.12, 0.035, 0.12, 0, 1.395, 0, sc(c, 1.25));
    bx(sp, 0.03, 0.12, 0.006, 0, 1.3, fz - 0.003, sc(c, 0.75));
  } else if (cut === 'sweater') {
    bx(sp, sw + 0.03, 0.04, td + 0.012, 0, 0.82, 0, sc(c, 0.8));
    bx(sp, 0.13, 0.05, 0.13, 0, 1.405, 0, sc(c, 0.85));
  } else if (cut === 'jacket') {
    bx(sp, 0.014, 0.58, 0.006, 0, 1.09, fz - 0.003, sc(c, 0.45));
    bx(sp, 0.05, 0.07, 0.06, -0.05, 1.415, fz + 0.03, sc(c, 0.85));
    bx(sp, 0.05, 0.07, 0.06, 0.05, 1.415, fz + 0.03, sc(c, 0.85));
    bx(sp, 0.07, 0.05, 0.012, -0.12, 0.92, fz - 0.003, sc(c, 0.7));
    bx(sp, 0.07, 0.05, 0.012, 0.12, 0.92, fz - 0.003, sc(c, 0.7));
  } else if (cut === 'vest') {
    bx(sp, 0.02, 0.58, 0.012, 0, 1.09, fz - 0.005, sc(c, 0.7));
  } else if (cut === 'dress') {
    bx(sp, hw + 0.1, 0.36, td + 0.08, 0, 0.64, 0, c);
    bx(sp, hw + 0.11, 0.03, td + 0.09, 0, 0.47, 0, c2);
    bx(sp, hw + 0.02, 0.04, td + 0.01, 0, 0.83, 0, c2);
  } else if (cut === 'cape') {
    bx(sp, 0.5, 0.12, 0.33, 0, 1.3, 0, c);
    bx(sp, 0.6, 0.4, 0.38, 0, 0.98, 0, c);
    bx(sp, 0.62, 0.04, 0.4, 0, 0.78, 0, c2);
    bx(sp, 0.2, 0.13, 0.12, 0, 1.47, 0.1, c);
    bx(sp, 0.03, 0.15, 0.18, -0.135, 1.5, 0.0, c);
    bx(sp, 0.03, 0.15, 0.18, 0.135, 1.5, 0.0, c);
    bx(sp, 0.018, 0.018, 0.012, 0, 1.28, -0.19, WHITE);
    bx(sp, 0.018, 0.018, 0.012, 0, 1.12, -0.19, WHITE);
  } else if (cut === 'jersey3') {
    // große „3“ auf dem Rücken, kleine auf der Brust; Schulterstreifen
    const three = (z, s) => {
      const w = 0.12 * s;
      const th = 0.032 * s;
      const hh = 0.27 * s;
      const y0 = 1.09 + hh / 2 - 0.02 * s - 0.02;
      bx(sp, w, th, 0.01, 0, y0, z, c2);
      bx(sp, w, th, 0.01, 0, y0 - hh / 2 + th / 2, z, c2);
      bx(sp, w, th, 0.01, 0, y0 - hh + th, z, c2);
      bx(sp, th, hh / 2 - th, 0.01, w / 2 - th / 2, y0 - hh / 4, z, c2);
      bx(sp, th, hh / 2 - th, 0.01, w / 2 - th / 2, y0 - (hh * 3) / 4 + th / 2, z, c2);
    };
    three(bz + 0.005, 1.0);
    three(fz - 0.005, 0.5);
    bx(sp, sw + 0.012, 0.03, td + 0.012, 0, 1.33, 0, WHITE);
  } else if (cut === 'banshirt') {
    sp.push(sph(0.085, 0, 1.16, fz - 0.002, [0.82, 0.1, 0.12], 1, 1, 0.05, 10, 3));
    sp.push(sph(0.06, 0, 1.16, fz - 0.005, WHITE, 1, 1, 0.05, 10, 3));
    bx(sp, 0.15, 0.024, 0.008, 0, 1.16, fz - 0.009, [0.82, 0.1, 0.12], 0, 0, 0.785);
  } else if (cut === 'hivis') {
    const f = (z, d) => {
      bx(sp, 0.15, 0.58, d, -0.1, 1.09, z, c);
      bx(sp, 0.15, 0.58, d, 0.1, 1.09, z, c);
    };
    f(fz - 0.004, 0.012);
    bx(sp, sw + 0.01, 0.58, 0.012, 0, 1.09, bz + 0.004, c);
    const R = [0.86, 0.88, 0.92];
    bx(sp, sw + 0.02, 0.045, td + 0.02, 0, 1.2, 0, R);
    bx(sp, hw + 0.02, 0.045, td + 0.02, 0, 0.98, 0, R);
    bx(sp, 0.04, 0.58, 0.012, -0.1, 1.09, fz - 0.011, R);
    bx(sp, 0.04, 0.58, 0.012, 0.1, 1.09, fz - 0.011, R);
  }
  // Muster (nur für normale Schnitte)
  if (unlock || cut === 'cape') return;
  const pt = L.topPat;
  const dg = td + 0.012;
  if (pt === 'chest') bx(sp, sw + 0.014, 0.1, dg, 0, 1.25, 0, c2);
  else if (pt === 'rings') for (const y of [1.32, 1.2, 1.08, 0.96]) bx(sp, wAt(y) + 0.014, 0.045, dg, 0, y, 0, c2);
  else if (pt === 'vertical') for (const x of [-0.12, 0, 0.12]) bx(sp, 0.05, 0.58, dg + 0.002, x, 1.09, 0, c2);
  else if (pt === 'twotone') bx(sp, hw + 0.014, 0.3, dg, 0, 0.95, 0, c2);
  else if (pt === 'check') {
    for (const y of [1.28, 1.05]) bx(sp, wAt(y) + 0.012, 0.03, dg + 0.002, 0, y, 0, c2);
    for (const x of [-0.13, 0, 0.13]) bx(sp, 0.03, 0.56, dg + 0.006, x, 1.09, 0, c2);
  }
}

/* ------------------------------------------------------------------- Haare */
const TALL_HAIR = new Set(['afro', 'tuft', 'bun', 'mohawk', 'spiky', 'quiff', 'curls']);

/** Haarkappe vorn über die Stirn anheben: Unterkante auf den Haaransatz (HAIRLINE), an den Seiten und hinten bleibt sie tief. */
function liftHairline(g, z0 = 0.02, span = 0.06) {
  const a = g.attributes.position;
  for (let i = 0; i < a.count; i++) {
    const y = a.getY(i);
    const z = a.getZ(i);
    if (y >= HAIRLINE || z >= -z0) continue;
    const w = Math.min(1, (-z - z0) / span);
    a.setY(i, y + (HAIRLINE - y) * w);
  }
  a.needsUpdate = true;
  return g;
}
function buildHair(P, L) {
  const hd = P[HD];
  const h = L.hair;
  const covered = COVER.has(L.hat);
  const T = [];
  const S = hd;
  const cap = (r = 0.133, phi = 1.95, dy = 0, c = h) => T.push(liftHairline(sph(r, 0, 1.605 + dy, 0.016, c, 1, 1, 1, 8, 5, phi)));
  const bxT = (list, w, hh, d, x, y, z, c = h, rx = 0, ry = 0, rz = 0) => list.push(box({ w, h: hh, d, x, y, z, rx, ry, rz, color: c }));
  const bxS = (w, hh, d, x, y, z, c = h, rx = 0, ry = 0, rz = 0) => bxT(S, w, hh, d, x, y, z, c, rx, ry, rz);
  // unter der Krone nur flache Frisuren (hohe Teile würden durch das Gold ragen)
  const style = L.hat === 'crown' && TALL_HAIR.has(L.hairStyle) ? 'short' : L.hairStyle;
  switch (style) {
    case 'bald': break;
    case 'long': cap(); bxS(0.25, 0.3, 0.07, 0, 1.5, 0.1); break;
    case 'tuft': cap(0.133, 1.5); bxT(T, 0.05, 0.1, 0.05, 0, 1.76, 0); break;
    case 'bob': cap(); bxS(0.04, 0.2, 0.2, -0.125, 1.54, 0.02); bxS(0.04, 0.2, 0.2, 0.125, 1.54, 0.02); bxS(0.26, 0.2, 0.06, 0, 1.53, 0.11); break;
    case 'buzz': cap(0.126, 1.7, 0, sc(h, 0.85)); break;
    case 'sidepart':
      cap(); bxT(T, 0.2, 0.04, 0.06, 0, 1.675, -0.095); bxT(T, 0.09, 0.05, 0.12, -0.07, 1.715, -0.06, h, 0, 0, 0.3); break;
    case 'curls':
      cap(0.13, 1.8);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; T.push(sph(0.045, Math.cos(a) * 0.1, 1.7 + (i % 2) * 0.03, Math.sin(a) * 0.1 + 0.01, h, 1, 1, 1, 6, 3)); }
      T.push(sph(0.05, 0, 1.76, 0.01, h, 1, 1, 1, 6, 3));
      break;
    case 'afro': T.push(sph(0.17, 0, 1.7, 0.04, h, 1, 1, 1, 8, 5, 1.75)); break;
    case 'ponytail': cap(); bxS(0.06, 0.2, 0.06, 0, 1.55, 0.15, h, 0.3); bxS(0.07, 0.025, 0.07, 0, 1.64, 0.125, [0.9, 0.3, 0.4]); break;
    case 'bun': cap(); T.push(sph(0.06, 0, 1.76, 0.02, h, 1, 1, 1, 6, 4)); break;
    case 'mohawk': cap(0.126, 1.5, 0, sc(h, 0.8)); bxT(T, 0.035, 0.09, 0.22, 0, 1.745, 0.02); break;
    case 'mullet': cap(); bxS(0.22, 0.22, 0.06, 0, 1.52, 0.115); bxS(0.04, 0.1, 0.09, -0.12, 1.57, 0.06); bxS(0.04, 0.1, 0.09, 0.12, 1.57, 0.06); break;
    case 'spiky':
      cap(0.13, 1.8);
      for (const [x, z, rz, rx] of [[0, -0.02, 0, 0], [-0.07, 0.0, 0.5, 0], [0.07, 0.0, -0.5, 0], [0, 0.07, 0, 0.5], [0, -0.09, 0, -0.5]]) bxT(T, 0.035, 0.1, 0.035, x, 1.76, z, h, rx, 0, rz);
      break;
    case 'quiff': cap(); bxT(T, 0.16, 0.07, 0.12, 0, 1.745, -0.05, h, -0.35); break;
    case 'braids':
      cap();
      for (const sx of [-1, 1]) { bxS(0.035, 0.24, 0.035, sx * 0.1, 1.46, 0.09); bxS(0.045, 0.02, 0.045, sx * 0.1, 1.33, 0.09, [0.95, 0.85, 0.2]); }
      break;
    case 'pigtails':
      cap();
      for (const sx of [-1, 1]) { bxS(0.05, 0.16, 0.05, sx * 0.15, 1.54, 0.03, h, 0, 0, sx * 0.1); bxS(0.065, 0.02, 0.065, sx * 0.14, 1.63, 0.03, [0.95, 0.85, 0.2]); }
      break;
    case 'undercut': cap(0.126, 1.7, 0, sc(h, 0.7)); bxT(T, 0.16, 0.06, 0.2, 0, 1.725, 0.0); break;
    default: cap(); // short
  }
  if (!covered) hd.push(...T);
  else for (const g of T) g.dispose();
}

/* ---------------------------------------------------------- Gesicht, Bart */
// Alle Gesichtsteile sitzen per faceBox() auf der Kopfoberfläche (Ellipsoid): Breite innerhalb der Kopfbreite, minimal eingesenkt.
function buildFace(P, L) {
  const hd = P[HD];
  const skin = L.skin;
  const fb = (w, h, d, x, y, color, p = 0.004, rz = 0) => faceBox(hd, w, h, d, x, y, color, p, rz);
  const eye = (x, kind) => {
    switch (kind) {
      case 'round': fb(0.036, 0.036, 0.012, x, 1.6, WHITE); fb(0.02, 0.026, 0.012, x, 1.6, BLACK, 0.0085); break;
      case 'narrow': fb(0.034, 0.014, 0.012, x, 1.6, BLACK); break;
      case 'sleepy': fb(0.03, 0.016, 0.012, x, 1.595, BLACK); fb(0.034, 0.014, 0.012, x, 1.609, sc(skin, 0.82), 0.0055); break;
      case 'wide': fb(0.042, 0.046, 0.012, x, 1.602, WHITE); fb(0.024, 0.03, 0.012, x, 1.602, BLACK, 0.0085); break;
      default: fb(0.028, 0.034, 0.012, x, 1.6, [0.08, 0.08, 0.1]);
    }
  };
  if (L.eyes === 'wink') { eye(-0.045, 'dot'); fb(0.034, 0.01, 0.012, 0.045, 1.598, BLACK); }
  else { eye(-0.045, L.eyes); eye(0.045, L.eyes); }
  const bc = sc(L.hair, 0.75);
  const by = L.eyes === 'wide' || L.eyes === 'round' ? 1.64 : 1.634; // knapp über den Augen, unter dem Haaransatz
  // Brauen: beide Seiten spiegelgleich (x = ±bx), nach innen gerückt, damit sie an den Schläfen nicht unter den Haaransatz laufen
  const bx0 = 0.04;
  switch (L.brows) {
    case 'thin': for (const sx of [-1, 1]) fb(0.044, 0.008, 0.012, sx * bx0, by, bc, 0.005); break;
    case 'thick': for (const sx of [-1, 1]) fb(0.048, 0.016, 0.014, sx * bx0, by + 0.002, bc, 0.006); break;
    case 'arched': for (const sx of [-1, 1]) fb(0.044, 0.009, 0.012, sx * bx0, by + 0.003, bc, 0.005, sx * -0.28); break;
    case 'angry': for (const sx of [-1, 1]) fb(0.048, 0.012, 0.012, sx * bx0, by + 0.001, bc, 0.005, sx * 0.38); break;
    default:
  }
  fb(0.02, 0.03, 0.02, 0, 1.57, sc(skin, 0.93), 0.016); // Nase
  const beard = L.beard;
  const full = beard === 'full';
  fb(0.05, 0.012, 0.012, 0, 1.535, [0.62, 0.25, 0.25], full ? 0.016 : beard === 'stubble' ? 0.011 : 0.005); // Mund
  const b = sc(L.hair, 0.85);
  if (beard === 'stubble') hd.push(beardShell(mix(skin, L.hair, 0.4), 1.562, 1.03));
  else if (beard === 'moustache') fb(0.075, 0.018, 0.02, 0, 1.553, b, 0.008);
  else if (beard === 'goatee') { fb(0.075, 0.018, 0.02, 0, 1.553, b, 0.008); fb(0.04, 0.055, 0.02, 0, 1.49, b, 0.006); }
  else if (full) { hd.push(beardShell(b, 1.585, 1.06)); fb(0.085, 0.02, 0.02, 0, 1.557, b, 0.02); }
  else if (beard === 'chin') fb(0.03, 0.045, 0.02, 0, 1.478, b, 0.006);
}

/* ------------------------------------------------------------------ Brille */
function buildGlasses(hd, L) {
  const g = L.glasses;
  if (g === 'none') return;
  const bx = (w, h, d, x, y, z, color) => hd.push(box({ w, h, d, x, y, z, color }));
  const FR = [0.1, 0.1, 0.14];
  for (const sx of [-1, 1]) {
    const x = sx * 0.05;
    if (g === 'round') { hd.push(sph(0.04, x, 1.6, -0.115, FR, 1, 1, 0.2, 8, 3)); hd.push(sph(0.029, x, 1.6, -0.123, [0.75, 0.88, 0.95], 1, 1, 0.2, 8, 3)); }
    else if (g === 'square') { bx(0.075, 0.052, 0.012, x, 1.6, -0.12, FR); bx(0.057, 0.036, 0.012, x, 1.6, -0.1265, [0.75, 0.88, 0.95]); }
    else if (g === 'sun') { bx(0.08, 0.05, 0.014, x, 1.6, -0.12, [0.04, 0.04, 0.05]); bx(0.084, 0.008, 0.014, x, 1.627, -0.121, FR); }
    else if (g === 'nerd') { bx(0.08, 0.058, 0.014, x, 1.6, -0.12, BLACK); bx(0.056, 0.036, 0.014, x, 1.6, -0.1275, [0.8, 0.9, 0.95]); }
    else if (g === 'pilot') { hd.push(sph(0.046, x, 1.598, -0.115, GOLD, 1, 1.15, 0.2, 8, 3)); hd.push(sph(0.037, x, 1.598, -0.123, [0.22, 0.3, 0.26], 1, 1.15, 0.2, 8, 3)); }
    else if (g === '3d') { bx(0.08, 0.056, 0.014, x, 1.6, -0.12, WHITE); bx(0.058, 0.036, 0.014, x, 1.6, -0.1275, sx < 0 ? [0.88, 0.1, 0.12] : [0.1, 0.8, 0.9]); }
    bx(0.012, 0.012, 0.2, sx * 0.095, 1.605, -0.02, g === '3d' ? WHITE : g === 'pilot' ? GOLD : FR); // Bügel
  }
  bx(0.03, 0.01, 0.012, 0, 1.607, -0.12, g === '3d' ? WHITE : g === 'pilot' ? GOLD : FR);
  if (g === 'nerd') bx(0.018, 0.02, 0.016, 0, 1.607, -0.126, WHITE); // Pflaster
  if (g === 'pilot') bx(0.03, 0.008, 0.012, 0, 1.585, -0.12, GOLD);
}

/* --------------------------------------------------------------------- Hut */
// Hutränder vorn bleiben über den Augen/Brauen (≥ 1,655), damit Mützen das Gesicht nie bedecken.
function buildHat(hd, L) {
  const id = L.hat;
  if (id === 'none') return;
  const c = L.hatC;
  const bx = (w, h, d, x, y, z, color, rx = 0, ry = 0, rz = 0) => hd.push(box({ w, h, d, x, y, z, rx, ry, rz, color }));
  switch (id) {
    case 'cap': case 'goldcap': {
      // Kuppel sitzt eng auf dem Oberkopf, vorn auf den Haaransatz angehoben (Stirn/Brauen frei); kurzer, anliegender Schirm, gerade
      const cc = id === 'goldcap' ? HAT_GOLD : c;
      hd.push(liftHairline(sph(0.135, 0, 1.612, 0.004, cc, 1, 1, 1, 8, 5, 1.75), 0, 0.13));
      bx(0.15, 0.012, 0.065, 0, 1.667, -0.148, sc(cc, 0.8));
      break;
    }
    case 'beanie': hd.push(sph(0.14, 0, 1.63, 0, c, 1, 1, 1, 8, 5, 1.45)); break;
    case 'catears':
      // Mütze auf dem Oberkopf (deckt die Haare oben ab, vorn auf den Haaransatz angehoben) + zwei dreieckige Ohren auf der Mütze, symmetrisch
      hd.push(liftHairline(sph(0.139, 0, 1.612, 0.004, c, 1, 1, 1, 8, 5, 1.75), 0, 0.13));
      for (const sx of [-1, 1]) {
        hd.push(cone(0.05, 0.095, 3, sx * 0.07, 1.768, 0.004, c, 0, 0, sx * -0.28));
        hd.push(cone(0.03, 0.06, 3, sx * 0.0715, 1.762, -0.014, [0.95, 0.6, 0.7], 0, 0, sx * -0.28));
      }
      break;
    case 'hat':
      // Krempe liegt auf dem Kopf, Hutband direkt darüber, Kopfteil schließt ohne Spalt an
      bx(0.33, 0.018, 0.33, 0, 1.662, 0, sc(c, 0.8));
      bx(0.185, 0.13, 0.185, 0, 1.735, 0, c);
      bx(0.19, 0.028, 0.19, 0, 1.682, 0, sc(c, 0.55));
      break;
    case 'bucket':
      hd.push(sph(0.14, 0, 1.63, 0, c, 1, 0.95, 1, 8, 5, 1.45));
      bx(0.31, 0.014, 0.31, 0, 1.66, 0, sc(c, 0.85));
      break;
    case 'band': bx(0.255, 0.035, 0.255, 0, 1.655, 0, c); break;
    case 'beret': hd.push(sph(0.15, 0.01, 1.7, 0.01, c, 1.05, 0.4, 1.05, 8, 5)); bx(0.015, 0.035, 0.015, 0.01, 1.745, 0.01, sc(c, 0.7)); break;
    case 'crown': {
      // kleine goldene Krone auf dem Oberkopf: runder Reif, 8 regelmäßige Zacken, kleiner Edelstein
      hd.push(drum(0.092, 0.05, 8, 0, 1.695, 0.012, HAT_GOLD));
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        hd.push(cone(0.024, 0.06, 4, Math.sin(a) * 0.077, 1.75, 0.012 + Math.cos(a) * 0.077, HAT_GOLD, 0, a, 0));
      }
      hd.push(sph(0.013, 0, 1.695, -0.08, [0.9, 0.15, 0.25], 1, 1, 1, 6, 4));
      break;
    }
    case 'canhat':
      bx(0.26, 0.03, 0.2, 0, 1.69, 0, [0.2, 0.2, 0.24]);
      for (const sx of [-1, 1]) { bx(0.06, 0.12, 0.06, sx * 0.12, 1.75, 0, [0.82, 0.84, 0.88]); bx(0.064, 0.04, 0.064, sx * 0.12, 1.75, 0, sx < 0 ? [0.85, 0.15, 0.15] : [0.15, 0.45, 0.8]); }
      bx(0.24, 0.016, 0.02, 0, 1.815, 0, [0.2, 0.2, 0.24]);
      break;
    case 'usher': {
      const R = [0.75, 0.12, 0.15];
      bx(0.19, 0.09, 0.17, 0, 1.74, -0.005, R, 0, 0, 0.12);
      bx(0.195, 0.02, 0.175, 0, 1.705, -0.005, GOLD, 0, 0, 0.12);
      hd.push(sph(0.016, 0, 1.795, 0, GOLD, 1, 1, 1, 6, 4));
      bx(0.012, 0.03, 0.08, 0.1, 1.62, -0.02, GOLD);
      break;
    }
    default:
  }
}

/* ------------------------------------------------------------------ Schuhe */
function buildShoes(P, L, { lx }) {
  const m = L.shoeModel;
  const c = L.shoe;
  const so = L.sole;
  const skin = L.skin;
  for (const [side, bi] of [[-1, BONE.legL], [1, BONE.legR]]) {
    const a = P[bi];
    const x = side * lx;
    const bx = (w, h, d, dx, y, z, color) => a.push(box({ w, h, d, x: x + dx, y, z, color }));
    switch (m) {
      case 'boot':
        bx(0.155, 0.17, 0.19, 0, 0.085, 0.0, c);
        bx(0.15, 0.07, 0.27, 0, 0.035, -0.04, c);
        bx(0.16, 0.03, 0.28, 0, 0.015, -0.04, so);
        bx(0.16, 0.02, 0.2, 0, 0.17, 0, sc(c, 0.75));
        break;
      case 'sandal':
        bx(0.15, 0.02, 0.26, 0, 0.01, -0.04, so);
        bx(0.125, 0.04, 0.2, 0, 0.04, -0.05, skin);
        bx(0.15, 0.025, 0.035, 0, 0.055, -0.06, c);
        bx(0.15, 0.025, 0.035, 0, 0.055, 0.02, c);
        break;
      case 'loafer':
        bx(0.15, 0.06, 0.26, 0, 0.04, -0.04, c);
        bx(0.155, 0.02, 0.27, 0, 0.01, -0.04, sc(so, 0.35));
        bx(0.08, 0.012, 0.04, 0, 0.073, -0.09, sc(c, 1.5));
        break;
      case 'high':
        bx(0.155, 0.04, 0.27, 0, 0.055, -0.04, c);
        bx(0.15, 0.1, 0.17, 0, 0.12, 0.01, c);
        bx(0.16, 0.03, 0.28, 0, 0.015, -0.04, so);
        bx(0.155, 0.03, 0.14, 0, 0.18, 0.01, so);
        bx(0.04, 0.04, 0.012, side * 0.07, 0.11, 0.01, WHITE);
        break;
      case 'splash': {
        bx(0.15, 0.05, 0.26, 0, 0.055, -0.04, [0.93, 0.93, 0.95]);
        bx(0.16, 0.03, 0.27, 0, 0.015, -0.04, so);
        const dots = [[0.05, 0.05, -0.12, [0.9, 0.15, 0.6]], [-0.04, 0.083, -0.04, [0.1, 0.75, 0.9]], [0.02, 0.083, 0.03, [0.98, 0.85, 0.1]], [-0.06, 0.06, -0.1, [0.4, 0.85, 0.2]], [0.07, 0.08, 0.0, [0.6, 0.3, 0.85]]];
        for (const [dx, y, z, col2] of dots) a.push(box({ w: 0.04, h: 0.024, d: 0.045, x: x + dx * side, y, z, color: col2 }));
        break;
      }
      default: // sneaker
        bx(0.15, 0.05, 0.26, 0, 0.055, -0.04, c);
        bx(0.16, 0.03, 0.27, 0, 0.015, -0.04, so);
        bx(0.13, 0.03, 0.07, 0, 0.065, -0.14, sc(c, 1.35));
    }
  }
}

/* ----------------------------------------------------------------- Taschen */
function buildBag(P, L, { ax, bx }) {
  const id = L.bag;
  if (id === 'none') return;
  const c = L.bagC;
  const sp = P[SK];
  const arm = P[BONE.armR];
  switch (id) {
    case 'bag':
      bx(sp, 0.12, 0.2, 0.26, -ax - 0.01, 0.8, 0, c);
      bx(sp, 0.04, 0.64, 0.03, -0.12, 1.1, -0.12, sc(c, 0.7), 0, 0, 0.62);
      break;
    case 'backpack':
      bx(sp, 0.3, 0.36, 0.14, 0, 1.12, 0.18, c);
      bx(sp, 0.2, 0.14, 0.04, 0, 1.0, 0.27, sc(c, 0.8));
      for (const sx of [-1, 1]) bx(sp, 0.04, 0.3, 0.03, sx * 0.11, 1.17, -0.12, sc(c, 0.7));
      break;
    case 'shopping':
      bx(arm, 0.2, 0.28, 0.12, ax + 0.04, 0.58, -0.02, c);
      bx(arm, 0.02, 0.14, 0.02, ax + 0.04, 0.76, -0.02, sc(c, 0.6));
      break;
    case 'chips':
      bx(arm, 0.2, 0.3, 0.07, ax + 0.04, 0.58, -0.02, c);
      bx(arm, 0.22, 0.035, 0.1, ax + 0.04, 0.755, -0.02, sc(c, 0.7));
      bx(arm, 0.22, 0.035, 0.1, ax + 0.04, 0.42, -0.02, sc(c, 0.7));
      bx(arm, 0.13, 0.1, 0.01, ax + 0.04, 0.6, -0.059, [0.98, 0.85, 0.15]);
      bx(arm, 0.02, 0.14, 0.02, ax + 0.04, 0.8, -0.02, sc(c, 0.6));
      break;
    case 'vhspack':
      bx(sp, 0.32, 0.4, 0.14, 0, 1.1, 0.18, c);
      bx(sp, 0.27, 0.17, 0.035, 0, 1.2, 0.268, BLACK);
      bx(sp, 0.27, 0.17, 0.035, 0, 0.99, 0.268, [0.18, 0.18, 0.22]);
      bx(sp, 0.18, 0.06, 0.008, 0, 1.2, 0.288, WHITE);
      bx(sp, 0.18, 0.06, 0.008, 0, 0.99, 0.288, [0.95, 0.8, 0.2]);
      for (const sx of [-1, 1]) bx(sp, 0.04, 0.3, 0.03, sx * 0.11, 1.17, -0.12, sc(c, 0.7));
      break;
    default:
  }
}
