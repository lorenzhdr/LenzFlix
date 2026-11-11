// VIDEOTHEK LENZ · M4 Snack-Theke (Zone „snack“, Westwand): Süßigkeiten-Regal mit bunten Packungen, Popcornmaschine
// (Glaskasten, warmes Licht, animierte Popcorn-Partikel), Getränke-Kühlschrank mit leuchtender Front, Preisschilder in DM,
// Neonschild „SNACKS“. Fantasienamen. ≈ 5 Draw-Calls (Solid, Glas, Atlas, Glanz, Partikel).
import {
  Mesh, MeshBasicMaterial, MeshLambertMaterial, Points, PointsMaterial, BufferGeometry, Float32BufferAttribute, AdditiveBlending, DoubleSide,
} from 'three';
import { box, quad, merge, rng } from '../util/geo.js';
import { makeCanvas, toTexture, FONT } from '../world/textures.js';
import { sph, atlasUv } from './m4-geo.js';
import { prefersReducedMotion } from './m4-util.js';

const PI = Math.PI;
const ATLAS = 1024;
const R = { candy: [0, 0, 480, 900], fridge: [480, 0, 420, 900], sign: [0, 900, 620, 124], pop: [620, 900, 404, 124] };
const PACKS = [
  ['KNUSPA', 'FLIPS', '#ff6b35'], ['SCHOKO', 'ZACK', '#7b3f1d'], ['FRUCHT', 'FRATZEN', '#3ddc97'], ['LAKRITZ', 'LOK', '#2b2b3a'],
  ['NASCH', 'NUSS', '#c77dff'], ['ZITRO', 'ZAP', '#ffd23f'], ['MINZ', 'MOPS', '#35e6ff'], ['KARAMELL', 'KUSS', '#e9a04a'],
  ['BEEREN', 'BLITZ', '#ff3d7f'], ['KEKS', 'KRACH', '#d8b27a'], ['SAURE', 'SCHNUTE', '#90be6d'], ['WAFFEL', 'WIRBEL', '#f4a6c0'],
];
const PRICES = ['0,99', '1,29', '1,49', '0,79', '1,99', '1,19', '0,89', '1,59'];
const TOASTS = {
  pop: ['Frisch gepoppt: knusprig, warm und 3,50 DM.', 'Süß oder salzig? Hier gibt es nur: ja.', 'Die Maschine knistert schon seit 1996 zufrieden.'],
  fridge: ['Kalt, kälter, Cola-Blitz.', 'Der Kühlschrank brummt im Takt der Neonröhre.', 'Zitro-Zap: 1,99 DM – ohne Pfand-Drama.'],
  candy: ['Karamell-Kuss ist heute im Angebot.', 'Wer Saure Schnute isst, schaut danach besonders ernst.', 'Nasch-Nuss: nur echt mit Knack.'],
};

function atlasCanvas() {
  const c = makeCanvas(ATLAS, ATLAS);
  const x = c.getContext('2d');
  const rd = rng(1999);
  x.fillStyle = '#1a1c2e'; x.fillRect(0, 0, ATLAS, ATLAS);
  // Süßigkeiten-Regal: 5 Böden à 3 Packungen + Preisschilder
  {
    const [rx, ry, rw, rh] = R.candy;
    x.fillStyle = '#5b3d22'; x.fillRect(rx, ry, rw, rh);
    const rows = 5;
    const rowH = rh / rows;
    for (let r = 0; r < rows; r++) {
      const y0 = ry + r * rowH;
      x.fillStyle = '#3e2a17'; x.fillRect(rx, y0 + rowH - 34, rw, 14);
      for (let k = 0; k < 3; k++) {
        const [a, b, col] = PACKS[(r * 3 + k) % PACKS.length];
        const px = rx + 22 + k * 150;
        const py = y0 + 14;
        x.fillStyle = col; x.fillRect(px, py, 130, rowH - 62);
        x.fillStyle = 'rgba(255,255,255,0.22)'; x.fillRect(px, py, 130, 22);
        x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.font = `bold 21px ${FONT}`;
        x.fillText(a, px + 65, py + (rowH - 62) / 2 - 12);
        x.fillText(b, px + 65, py + (rowH - 62) / 2 + 14);
        x.fillStyle = '#f7f3e4'; x.fillRect(px + 20, y0 + rowH - 30, 90, 24);
        x.fillStyle = '#b3261e'; x.font = `bold 16px ${FONT}`;
        x.fillText(`${PRICES[Math.floor(rd() * PRICES.length)]} DM`, px + 65, y0 + rowH - 17);
      }
    }
  }
  // Kühlschrank-Front (leuchtend): Dosen/Flaschen in Reihen
  {
    const [rx, ry, rw, rh] = R.fridge;
    const g = x.createLinearGradient(rx, ry, rx, ry + rh);
    g.addColorStop(0, '#dff6ff'); g.addColorStop(1, '#9fd8f5');
    x.fillStyle = g; x.fillRect(rx, ry, rw, rh);
    const cols = ['#ff3d3d', '#ffd23f', '#3ddc97', '#35a7ff', '#ff8a2b', '#c77dff'];
    for (let r = 0; r < 5; r++) {
      const y0 = ry + 80 + r * 150;
      x.fillStyle = 'rgba(30,60,90,0.35)'; x.fillRect(rx + 10, y0 + 118, rw - 20, 8);
      for (let k = 0; k < 6; k++) {
        x.fillStyle = cols[(r + k) % cols.length];
        x.fillRect(rx + 22 + k * 62, y0 + 8, 44, 108);
        x.fillStyle = 'rgba(255,255,255,0.4)'; x.fillRect(rx + 26 + k * 62, y0 + 8, 8, 108);
      }
    }
    x.fillStyle = '#12163a'; x.fillRect(rx, ry, rw, 62);
    x.fillStyle = '#35e6ff'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `bold 34px ${FONT}`;
    x.fillText('EISKALT · 1,99 DM', rx + rw / 2, ry + 32);
  }
  // Neonschild SNACKS
  {
    const [rx, ry, rw, rh] = R.sign;
    x.fillStyle = '#0b0f2c'; x.fillRect(rx, ry, rw, rh);
    x.strokeStyle = '#ffd23f'; x.lineWidth = 5; x.shadowColor = '#ffd23f'; x.shadowBlur = 12;
    x.strokeRect(rx + 6, ry + 6, rw - 12, rh - 12);
    x.fillStyle = '#ff3d7f'; x.shadowColor = '#ff3d7f'; x.shadowBlur = 18;
    x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `bold 84px ${FONT}`;
    x.fillText('SNACKS', rx + rw / 2, ry + rh / 2 + 4);
    x.shadowBlur = 0;
  }
  // Preisschild Popcorn
  {
    const [rx, ry, rw, rh] = R.pop;
    x.fillStyle = '#fff6d8'; x.fillRect(rx, ry, rw, rh);
    x.fillStyle = '#d6001c'; x.fillRect(rx, ry, rw, 18);
    x.fillStyle = '#222'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.font = `bold 40px ${FONT}`;
    x.fillText('POPCORN 3,50 DM', rx + rw / 2, ry + 72);
  }
  return c;
}

function glowCanvas() {
  const c = makeCanvas(32, 32);
  const x = c.getContext('2d');
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 32, 32);
  return c;
}

export default {
  name: 'snack',
  init(ctx) {
    const L = ctx.layout;
    const zone = L.zones.snack;
    if (!zone) return {};
    const D = L.d;
    const reduced = prefersReducedMotion();
    const zc1 = D - 3.0; // Süßigkeiten-Regal
    const zc2 = D - 2.05; // Popcorn
    const zc3 = D - 1.18; // Kühlschrank
    const solid = [];
    const WOOD = [0.5, 0.34, 0.2];
    // Süßigkeiten-Regal
    solid.push(box({ w: 0.42, h: 1.7, d: 0.9, x: 0.21, y: 0.85, z: zc1, color: WOOD }));
    solid.push(box({ w: 0.44, h: 0.05, d: 0.94, x: 0.22, y: 1.72, z: zc1, color: [0.3, 0.2, 0.12] }));
    // Popcorn-Theke
    solid.push(box({ w: 0.62, h: 0.9, d: 0.84, x: 0.31, y: 0.45, z: zc2, color: [0.75, 0.18, 0.2] }));
    solid.push(box({ w: 0.66, h: 0.05, d: 0.88, x: 0.33, y: 0.925, z: zc2, color: [0.96, 0.92, 0.8] }));
    // Maschine: Sockel, Eckpfosten, Dach, Kessel, Popcornhaufen
    const mx = 0.31;
    solid.push(box({ w: 0.52, h: 0.12, d: 0.52, x: mx, y: 1.02, z: zc2, color: [0.2, 0.2, 0.24] }));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) solid.push(box({ w: 0.04, h: 0.8, d: 0.04, x: mx + sx * 0.25, y: 1.48, z: zc2 + sz * 0.25, color: [0.85, 0.82, 0.74] }));
    solid.push(box({ w: 0.6, h: 0.13, d: 0.6, x: mx, y: 1.95, z: zc2, color: [0.86, 0.12, 0.2] }));
    solid.push(box({ w: 0.22, h: 0.1, d: 0.22, x: mx, y: 2.06, z: zc2, color: [1, 0.82, 0.25] }));
    solid.push(box({ w: 0.34, h: 0.05, d: 0.34, x: mx, y: 1.72, z: zc2, color: [0.18, 0.18, 0.2] }));
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * PI * 2;
      solid.push(sph(0.075, mx + Math.cos(a) * 0.14, 1.12 + (i % 3) * 0.04, zc2 + Math.sin(a) * 0.14, [1, 0.93, 0.68], 1, 0.85, 1, 6, 4));
    }
    // Kühlschrank
    solid.push(box({ w: 0.65, h: 1.85, d: 0.8, x: 0.325, y: 0.925, z: zc3, color: [0.9, 0.91, 0.94] }));
    solid.push(box({ w: 0.04, h: 0.05, d: 0.84, x: 0.67, y: 1.87, z: zc3, color: [0.3, 0.32, 0.38] }));
    const solidMesh = new Mesh(merge(solid), new MeshLambertMaterial({ vertexColors: true }));
    solidMesh.matrixAutoUpdate = false;

    // Glas des Popcorn-Kastens
    const glassParts = [];
    const gy = 1.48;
    for (const sz of [-1, 1]) glassParts.push(quad({ w: 0.5, h: 0.8, x: mx, y: gy, z: zc2 + sz * 0.25 }));
    for (const sx of [-1, 1]) glassParts.push(quad({ w: 0.5, h: 0.8, x: mx + sx * 0.25, y: gy, z: zc2, ry: PI / 2 }));
    const glass = new Mesh(merge(glassParts), new MeshBasicMaterial({ color: 0xcfe9ff, transparent: true, opacity: 0.16, depthWrite: false, side: DoubleSide }));
    glass.renderOrder = 5;

    // Atlas-Quader (unbeleuchtet, leuchtend): Regalfront, Kühlschrankfront, Schild, Preisschild
    const atlasTex = toTexture(atlasCanvas(), { aniso: 4 });
    const u = (r) => atlasUv(r[0], r[1], r[2], r[3], ATLAS);
    const faces = [
      quad({ w: 0.9, h: 1.7, x: 0.425, y: 0.85, z: zc1, ry: PI / 2, uv: u(R.candy) }),
      quad({ w: 0.8, h: 1.85, x: 0.655, y: 0.925, z: zc3, ry: PI / 2, uv: u(R.fridge) }),
      quad({ w: 1.6, h: 0.31, x: 0.05, y: 2.45, z: D - 2.05, ry: PI / 2, uv: u(R.sign) }),
      quad({ w: 0.5, h: 0.153, x: 0.635, y: 0.55, z: zc2, ry: PI / 2, uv: u(R.pop) }),
    ];
    const atlasMesh = new Mesh(merge(faces), new MeshBasicMaterial({ map: atlasTex, toneMapped: false }));
    atlasMesh.matrixAutoUpdate = false;

    // Warmer Glanz (additiv): Popcorn-Licht im Kasten + Lichtpfützen vor Maschine und Kühlschrank
    const glowTex = toTexture(glowCanvas(), { mips: false });
    const glows = [
      quad({ w: 1.5, h: 1.5, x: 0.7, y: 0.014, z: zc2, rx: -PI / 2, color: [1, 0.72, 0.35] }),
      quad({ w: 1.5, h: 1.8, x: 0.9, y: 0.013, z: zc3, rx: -PI / 2, color: [0.55, 0.85, 1] }),
      quad({ w: 0.9, h: 0.9, x: mx, y: 1.45, z: zc2, ry: PI / 2, color: [1, 0.8, 0.45] }),
    ];
    const glowMesh = new Mesh(merge(glows), new MeshBasicMaterial({ map: glowTex, vertexColors: true, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide, opacity: 0.55 }));
    glowMesh.renderOrder = 6;
    glowMesh.matrixAutoUpdate = false;

    // Popcorn-Partikel im Kasten
    const NP = ctx.isPhone ? 10 : 16;
    const pp = new Float32Array(NP * 3);
    const ph = new Float32Array(NP * 3);
    const rp = rng(31);
    for (let i = 0; i < NP; i++) { ph[i * 3] = rp() * 6.28; ph[i * 3 + 1] = 1.2 + rp() * 1.4; ph[i * 3 + 2] = rp() * 6.28; }
    const pg = new BufferGeometry();
    pg.setAttribute('position', new Float32BufferAttribute(pp, 3));
    const pm = new PointsMaterial({ color: 0xfff0c4, size: ctx.isPhone ? 4 : 5, sizeAttenuation: false, depthWrite: false });
    const pts = new Points(pg, pm);
    pts.frustumCulled = false;

    for (const o of [solidMesh, glass, atlasMesh, glowMesh, pts]) { ctx.scene.add(o); ctx.track(o); }
    ctx.track(atlasTex); ctx.track(glowTex);

    // Kollider (Spieler bleibt vor den Einheiten)
    ctx.addCollider({ x0: 0, z0: zc1 - 0.45, x1: 0.46, z1: zc1 + 0.45 });
    ctx.addCollider({ x0: 0, z0: zc2 - 0.44, x1: 0.67, z1: zc2 + 0.44 });
    ctx.addCollider({ x0: 0, z0: zc3 - 0.4, x1: 0.7, z1: zc3 + 0.4 });

    const toast = (list) => { try { ctx.deps.toast(list[Math.floor(Math.random() * list.length)]); } catch { /* egal */ } };
    ctx.addInteractable({ box: { min: { x: 0, y: 0, z: zc2 - 0.44 }, max: { x: 0.7, y: 2.1, z: zc2 + 0.44 } }, label: 'Popcornmaschine', hint: 'E / Klick: Probieren', onUse: () => toast(TOASTS.pop) });
    ctx.addInteractable({ box: { min: { x: 0, y: 0, z: zc3 - 0.4 }, max: { x: 0.7, y: 1.9, z: zc3 + 0.4 } }, label: 'Getränke-Kühlschrank', hint: 'E / Klick: Öffnen', onUse: () => toast(TOASTS.fridge) });
    ctx.addInteractable({ box: { min: { x: 0, y: 0, z: zc1 - 0.45 }, max: { x: 0.5, y: 1.8, z: zc1 + 0.45 } }, label: 'Süßigkeiten', hint: 'E / Klick: Stöbern', onUse: () => toast(TOASTS.candy) });

    let suspended = false;
    let near = false;
    let chk = 0;
    const p = ctx.player;
    function placeParticles(t) {
      for (let i = 0; i < NP; i++) {
        const k = i * 3;
        const s = Math.abs(Math.sin(t * ph[k + 1] + ph[k]));
        pp[k] = mx + Math.sin(t * 0.9 + ph[k]) * 0.14;
        pp[k + 1] = 1.1 + s * 0.5;
        pp[k + 2] = zc2 + Math.cos(t * 0.8 + ph[k + 2]) * 0.14;
      }
      pg.attributes.position.needsUpdate = true;
    }
    placeParticles(0.7);
    return {
      update(dt, t) {
        if (suspended) return;
        if (t - chk > 0.5) { chk = t; const q = p.getPose(); near = Math.hypot(q.x - 1, q.z - zc2) < 12; pts.visible = near && ctx.quality() !== 'low'; }
        if (!pts.visible || reduced) return;
        placeParticles(t);
      },
      onSuspend() { suspended = true; },
      onResume() { suspended = false; },
      onQuality(lv) { pts.visible = near && lv !== 'low'; },
    };
  },
};
