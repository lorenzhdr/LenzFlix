// VIDEOTHEK LENZ · Physik: Geometrien der Objektarten (three; alles prozedural, Vertexfarben, Ursprung in der Körpermitte).
// Eine Geometrie pro Art (geteilt von allen Instanzen), Material über getOutdoor().tint (Tageszeit-Tönung).
import { BoxGeometry, CylinderGeometry, SphereGeometry, TorusGeometry, Float32BufferAttribute, CanvasTexture, SRGBColorSpace, MeshBasicMaterial } from 'three';
import { box, merge, hash } from '../util/geo.js';
import { KINDS } from './kinds.js';

function paintAll(g, color) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = color[0]; col[i * 3 + 1] = color[1]; col[i * 3 + 2] = color[2]; }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}
function cyl(r0, r1, h, y, color, seg = 10) {
  const g = new CylinderGeometry(r0, r1, h, seg);
  g.translate(0, y, 0);
  return paintAll(g, color);
}
function bx(w, h, d, x, y, z, color) { return box({ w, h, d, x, y, z, color }); }

/** Kugel mit Vertexfarben nach Naht/Flecken (rollt sichtbar). */
function ball(r, base, seam, patch) {
  const g = new SphereGeometry(r, 12, 9);
  const pos = g.attributes.position;
  const n = pos.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const x = pos.getX(i) / r; const y = pos.getY(i) / r; const z = pos.getZ(i) / r;
    let c = base;
    if (patch) {
      const cell = hash(`${Math.round(x * 1.6)}:${Math.round(y * 1.6)}:${Math.round(z * 1.6)}`) % 3;
      if (cell === 0) c = patch;
    } else if (Math.abs(y) < 0.09 || Math.abs(x) < 0.09 || Math.abs(Math.abs(z) - 0.6) < 0.07) c = seam;
    col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

const BUILD = {
  basketball: () => ball(KINDS.basketball.size, [0.95, 0.45, 0.12], [0.22, 0.1, 0.05], null),
  soccer: () => ball(KINDS.soccer.size, [0.96, 0.96, 0.96], null, [0.12, 0.12, 0.14]),
  can: () => merge([cyl(0.04, 0.04, 0.12, 0, [0.85, 0.2, 0.22]), cyl(0.041, 0.041, 0.04, 0.01, [0.95, 0.95, 0.95]), cyl(0.036, 0.036, 0.004, 0.062, [0.75, 0.75, 0.8])]),
  cone: () => merge([bx(0.3, 0.03, 0.3, 0, -0.21, 0, [0.95, 0.45, 0.1]), cyl(0.03, 0.13, 0.42, 0.015, [1, 0.5, 0.08]), cyl(0.065, 0.085, 0.07, 0.03, [0.96, 0.96, 0.96])]),
  crate: () => merge([bx(0.5, 0.3, 0.36, 0, 0, 0, [0.2, 0.42, 0.78]), bx(0.46, 0.04, 0.02, 0, 0.05, 0.181, [0.1, 0.2, 0.45]), bx(0.46, 0.04, 0.02, 0, 0.05, -0.181, [0.1, 0.2, 0.45]), bx(0.12, 0.1, 0.02, 0, -0.02, 0.182, [0.95, 0.85, 0.3])]),
  box: () => merge([bx(0.45, 0.4, 0.45, 0, 0, 0, [0.72, 0.55, 0.34]), bx(0.46, 0.012, 0.1, 0, 0.2, 0, [0.82, 0.7, 0.45]), bx(0.1, 0.1, 0.01, 0.1, 0.05, 0.226, [0.95, 0.95, 0.9])]),
  bin: () => merge([cyl(0.28, 0.24, 0.9, -0.02, [0.3, 0.38, 0.34], 12), cyl(0.3, 0.3, 0.06, 0.46, [0.22, 0.28, 0.25], 12), cyl(0.04, 0.04, 0.04, 0.5, [0.15, 0.17, 0.16], 6)]),
  tape: () => merge([bx(0.14, 0.2, 0.03, 0, 0, 0, [0.22, 0.28, 0.5]), bx(0.12, 0.02, 0.032, 0, 0.07, 0, [0.9, 0.85, 0.3])]),
};

/** Aufsteller: Quader, dessen UV die Vorder-/Rückseite auf die Grafik (u 0..0.9) und alle anderen Flächen auf einen Randstreifen legt. */
function standeeGeo() {
  const g = new BoxGeometry(0.55, 1.6, 0.1);
  const uv = g.attributes.uv;
  for (let f = 0; f < 6; f++) {
    for (let i = 0; i < 4; i++) {
      const k = f * 4 + i;
      if (f === 4 || f === 5) uv.setXY(k, uv.getX(k) * 0.9, uv.getY(k));
      else uv.setXY(k, 0.96, 0.5);
    }
  }
  return paintAll(g, [1, 1, 1]);
}

function standeeCanvas(makeCanvas) {
  const c = makeCanvas(256, 512);
  const x = c.getContext('2d');
  x.fillStyle = '#12142a'; x.fillRect(0, 0, 256, 512);
  const g = x.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, '#ff3d7f'); g.addColorStop(1, '#ffb347');
  x.fillStyle = g; x.fillRect(8, 8, 232, 496);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = 'bold 40px sans-serif'; x.fillText('NEU IM', 128, 70);
  x.font = 'bold 56px sans-serif'; x.fillText('VERLEIH', 128, 126);
  // Kassette (Comic-Figur): lächelndes Gesicht
  x.fillStyle = '#23305a'; x.fillRect(48, 190, 160, 200);
  x.fillStyle = '#f2d96b'; x.fillRect(60, 206, 136, 70);
  x.fillStyle = '#23305a';
  x.beginPath(); x.arc(100, 244, 9, 0, 7); x.arc(156, 244, 9, 0, 7); x.fill();
  x.strokeStyle = '#23305a'; x.lineWidth = 6; x.beginPath(); x.arc(128, 320, 34, 0.15 * Math.PI, 0.85 * Math.PI); x.stroke();
  x.fillStyle = '#fff'; x.font = 'bold 30px sans-serif'; x.fillText('Heute nur', 128, 440);
  x.font = 'bold 34px sans-serif'; x.fillText('1 Euro!*', 128, 478);
  return c;
}

/** Geometrie je Art (lazy, geteilt); standee zusätzlich mit eigenem Material (Textur). */
export function createShapes(makeCanvas) {
  const geos = new Map();
  let standeeMat = null;
  let standeeTex = null;
  return {
    geometry(kind) {
      let g = geos.get(kind);
      if (!g) {
        g = kind === 'standee' ? standeeGeo() : (BUILD[kind] || (() => paintAll(new BoxGeometry(0.3, 0.3, 0.3), [0.8, 0.8, 0.8])))();
        geos.set(kind, g);
      }
      return g;
    },
    standeeMaterial(tint) {
      if (!standeeMat) {
        standeeTex = new CanvasTexture(standeeCanvas(makeCanvas));
        standeeTex.colorSpace = SRGBColorSpace;
        standeeMat = tint(new MeshBasicMaterial({ map: standeeTex, vertexColors: true }));
      }
      return standeeMat;
    },
    /** Hülle als Einzelobjekt (Cover als Textur, falls art): { mesh-Bestandteile } → Geometrie + Material, Aufrufer entsorgt. */
    tapeMesh(art, media) {
      const [w, h, d] = media === 'vhs' ? [0.19, 0.105, 0.035] : media === 'box' ? [0.16, 0.22, 0.05] : [0.135, 0.19, 0.016];
      const g = new BoxGeometry(w, h, d);
      const side = new MeshBasicMaterial({ color: 0x23305a });
      let tex = null;
      if (art) { tex = new CanvasTexture(art); tex.colorSpace = SRGBColorSpace; }
      const front = new MeshBasicMaterial({ color: tex ? 0xffffff : 0x3a4a78, map: tex });
      return { geometry: g, materials: [side, side, side, side, front, side], tex, size: [w, h, d] };
    },
    torus(r, tube) { return new TorusGeometry(r, tube, 6, 16); },
    dispose() {
      for (const g of geos.values()) g.dispose();
      geos.clear();
      if (standeeMat) standeeMat.dispose();
      if (standeeTex) standeeTex.dispose();
      standeeMat = null; standeeTex = null;
    },
  };
}
