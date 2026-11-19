// VIDEOTHEK LENZ · Figuren-Detail und Winterkleidung (1.19.0 U4): zusätzliche Low-Poly-Teile (Boxen/Kugeln mit Vertexfarbe) für die Figuren-Fabrik.
// Reine Geometrie, ohne Zustand; die Teile landen im selben gemergten SkinnedMesh (kein Draw-Call mehr) und am selben Bone wie das Vorbild.
// Beschreiber d (aus figure.js alter Pfad bzw. figure-parts.js v2):
//   { v2, skin, top, bottom, shoes, hair, sw, hw, td, ax, lx, lw, topCut, botCut, shoeModel, brows, hasHat, apron?, stripe?, handBusy? }
//   handBusy: rechte Hand hält etwas (Handgegenstand, Schirm, Tasche) → keine Finger/Daumen rechts (kein Überlagern); apron/stripe (Alt-Look-Rollen): keine Knöpfe/Gürtel unter Schürze/Streifen.
// Detail (nur mit detail=true): Finger/Daumen, Halsrand, Knopfleiste, Gürtel mit Schnalle, Absätze/Schuhkappen, Hosensaum, Ohren, Brauen, Unterlippe.
// Winter: Strickmütze mit Bommel (nur ohne vorhandenen Hut), Schal um den Hals mit hängendem Ende.
import { box } from '../util/geo.js';
import { sph } from '../modules/m4-geo.js';

const BONE = { spine: 1, head: 2, armL: 3, armR: 4, legL: 5, legR: 6 };
const sc = (c, k) => c.map((v) => Math.min(1, Math.max(0, v * k)));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const STEEL = [0.74, 0.76, 0.8];
const WHITE = [0.93, 0.93, 0.95];
const LEATHER = [0.2, 0.13, 0.09];
const NO_BELT = new Set(['dress', 'cape', 'sweater', 'hoodie', 'jacket']);
const NO_COLLAR = new Set(['tee', 'longsleeve', 'tank', 'vest', 'jersey3', 'banshirt', 'hivis', 'dress', undefined]);
const BUTTONED = new Set(['longsleeve', 'vest']);
const NO_HEM = new Set(['shorts', 'skirt', 'zebra']);

/** Teile für Körper-Bones (Hände, Halsrand, Knöpfe, Gürtel, Schuhe, Saum). */
export function detailBody(P, d) {
  const sp = P[BONE.spine];
  const fz = -d.td / 2;
  // Finger und Daumen (Arm-Bones; Hand = Kugel bei y 0,78)
  for (const [sx, bi] of [[-1, BONE.armL], [1, BONE.armR]]) {
    if (sx === 1 && d.handBusy) continue;
    const a = P[bi];
    const x = sx * d.ax;
    for (const z of [-0.03, -0.01, 0.01, 0.03]) a.push(box({ w: 0.017, h: 0.07, d: 0.017, x, y: 0.715, z, color: sc(d.skin, 0.97) }));
    a.push(box({ w: 0.02, h: 0.05, d: 0.022, x: x - sx * 0.02, y: 0.765, z: -0.058, rx: 0.25, color: d.skin }));
  }
  // Halsrand bei Oberteilen ohne Kragen (Rundhals-Bündchen)
  const collar = d.v2 ? NO_COLLAR.has(d.topCut) : true;
  if (collar) sp.push(box({ w: 0.13, h: 0.022, d: d.td + 0.006, x: 0, y: 1.372, z: 0, color: sc(d.top, 0.75) }));
  // Knopfleiste
  if ((!d.v2 && !d.apron && !d.stripe) || (d.v2 && BUTTONED.has(d.topCut))) for (const y of [1.31, 1.2, 1.09, 0.98]) sp.push(box({ w: 0.016, h: 0.016, d: 0.012, x: 0, y, z: fz, color: sc(d.top, 0.55) }));
  // Gürtel mit Schnalle
  if (d.botCut !== 'skirt' && !d.apron && (!d.v2 || !NO_BELT.has(d.topCut))) {
    sp.push(box({ w: d.hw + 0.03, h: 0.028, d: d.td + 0.016, x: 0, y: d.v2 ? 0.845 : 0.835, z: 0, color: LEATHER }));
    sp.push(box({ w: 0.04, h: 0.034, d: 0.012, x: 0, y: d.v2 ? 0.845 : 0.835, z: -(d.td + 0.016) / 2 - 0.002, color: STEEL }));
  }
  // Schuhkappe und Absatz, Hosensaum (Bein-Bones)
  for (const [sx, bi] of [[-1, BONE.legL], [1, BONE.legR]]) {
    const a = P[bi];
    const x = sx * d.lx;
    if (d.shoeModel !== 'sandal') {
      a.push(box({ w: 0.11, h: 0.035, d: 0.055, x, y: 0.0175, z: 0.085, color: sc(d.shoes, 0.55) }));
      a.push(box({ w: 0.13, h: 0.02, d: 0.04, x, y: 0.012, z: -0.185, color: sc(d.shoes, 0.6) }));
    }
    if (!NO_HEM.has(d.botCut)) a.push(box({ w: d.lw + (d.botCut === 'wide' ? 0.05 : 0.02), h: 0.032, d: 0.19, x, y: d.v2 ? 0.105 : 0.095, z: 0, color: sc(d.bottom, 0.8) }));
  }
}

/** Kopf-Teile (Ohren, Brauen, Unterlippe); fb = faceBox(w,h,d,x,y,color,p,rz) auf die Kopfoberfläche. Vor der Kopfskalierung aufrufen. */
export function detailHead(hd, d, fb) {
  for (const sx of [-1, 1]) hd.push(box({ w: 0.02, h: 0.05, d: 0.03, x: sx * 0.121, y: 1.58, z: 0.004, color: sc(d.skin, 0.95) }));
  if (!d.v2 || d.brows === 'none') {
    const bc = sc(d.hair, 0.7);
    for (const sx of [-1, 1]) fb(0.044, 0.008, 0.012, sx * 0.04, 1.627, bc, d.v2 ? 0.005 : 0.012);
  }
  fb(0.03, 0.008, 0.012, 0, 1.523, [0.55, 0.22, 0.22], 0.004);
}

/** Winterfarben aus dem Look (deterministisch). */
function winterColors(d) {
  const hat = sc(mix(d.top, d.bottom, 0.35), 1.1);
  return { hat, cuff: sc(hat, 0.72), pom: mix(hat, WHITE, 0.55), scarf: sc(mix(d.top, WHITE, 0.25), 0.95), scarf2: sc(mix(d.bottom, d.top, 0.5), 1.15) };
}

/** Strickmütze mit Bommel auf dem Kopf-Bone (vor der Kopfskalierung). Nur wenn kein Hut getragen wird. */
export function winterHead(hd, d) {
  const c = winterColors(d);
  hd.push(sph(0.145, 0, 1.625, 0, c.hat, 1, 1, 1, 8, 5, 1.5));
  hd.push(box({ w: 0.27, h: 0.04, d: 0.27, x: 0, y: 1.655, z: 0, color: c.cuff }));
  hd.push(sph(0.04, 0, 1.795, 0, c.pom, 1, 1, 1, 6, 4));
}

/** Schal: zwei Boxen um den Hals (Spine-Bone), ein Ende hängt vor der Brust. */
export function winterBody(P, d) {
  const sp = P[BONE.spine];
  const c = winterColors(d);
  const fz = -d.td / 2;
  sp.push(box({ w: 0.17, h: 0.06, d: 0.17, x: 0, y: 1.41, z: 0, color: c.scarf }));
  sp.push(box({ w: 0.18, h: 0.022, d: 0.18, x: 0, y: 1.415, z: 0, color: c.scarf2 }));
  sp.push(box({ w: 0.07, h: 0.26, d: 0.03, x: 0.05, y: 1.255, z: fz - 0.02, color: c.scarf }));
  sp.push(box({ w: 0.072, h: 0.022, d: 0.032, x: 0.05, y: 1.19, z: fz - 0.02, color: c.scarf2 }));
  sp.push(box({ w: 0.072, h: 0.02, d: 0.032, x: 0.05, y: 1.135, z: fz - 0.02, color: sc(c.scarf, 0.8) }));
}
