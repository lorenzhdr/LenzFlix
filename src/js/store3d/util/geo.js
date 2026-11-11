// VIDEOTHEK LENZ · Geometrie-Helfer. Alle Teile tragen position/normal/uv/color und sind indiziert,
// damit mergeGeometries sie zu wenigen Draw-Calls zusammenfassen kann.
import { BoxGeometry, PlaneGeometry, BufferGeometry, Float32BufferAttribute, Matrix4, Euler, Vector3, Quaternion } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const _m = new Matrix4();
const _q = new Quaternion();
const _e = new Euler();
const _p = new Vector3();
const _s = new Vector3(1, 1, 1);

function paint(g, color, shade) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  const per = n / 6; // BoxGeometry: 6 Flächen à gleich vielen Vertices
  for (let i = 0; i < n; i++) {
    const f = shade ? Math.min(5, Math.floor(i / per)) : 0;
    const sh = shade ? shade[f] : 1;
    col[i * 3] = color[0] * sh;
    col[i * 3 + 1] = color[1] * sh;
    col[i * 3 + 2] = color[2] * sh;
  }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
}

function xform(g, x, y, z, rx, ry, rz) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _m.compose(_p, _q, _s);
  g.applyMatrix4(_m);
}

/**
 * Quader (Mittelpunkt x,y,z). color = [r,g,b] 0..1; shade = Helligkeit je Fläche [+x,-x,+y,-y,+z,-z];
 * tile = Meter pro Texturwiederholung (UV wird in Metern skaliert), sonst 0..1 je Fläche.
 */
export function box({ w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, color = [1, 1, 1], shade = null, tile = 0 }) {
  const g = new BoxGeometry(w, h, d);
  if (tile) {
    const uv = g.attributes.uv;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
    for (let f = 0; f < 6; f++) {
      for (let i = 0; i < 4; i++) {
        const k = f * 4 + i;
        uv.setXY(k, (uv.getX(k) * dims[f][0]) / tile, (uv.getY(k) * dims[f][1]) / tile);
      }
    }
  }
  paint(g, color, shade);
  xform(g, x, y, z, rx, ry, rz);
  return g;
}

/** Ebene (Normale +z, nach Rotation ry/rx gedreht), optional mit UV-Rechteck [u0,v0,u1,v1]. */
export function quad({ w, h, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, color = [1, 1, 1], uv = null, tile = 0 }) {
  const g = new PlaneGeometry(w, h);
  if (uv) {
    const a = g.attributes.uv;
    for (let i = 0; i < 4; i++) a.setXY(i, uv[0] + a.getX(i) * (uv[2] - uv[0]), uv[1] + a.getY(i) * (uv[3] - uv[1]));
  } else if (tile) {
    const a = g.attributes.uv;
    for (let i = 0; i < 4; i++) a.setXY(i, (a.getX(i) * w) / tile, (a.getY(i) * h) / tile);
  }
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = color[0]; col[i * 3 + 1] = color[1]; col[i * 3 + 2] = color[2]; }
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  xform(g, x, y, z, rx, ry, rz);
  return g;
}

/** Horizontale Fläche im Grundriss-Rechteck; up=false → Normale nach unten (Decke). uv in Metern/tile, uv1 = Raum-UV. */
export function flatRect(x0, z0, x1, z1, { y = 0, up = true, tile = 2, roomW = 1, roomD = 1, color = [1, 1, 1] } = {}) {
  const g = new BufferGeometry();
  const pos = [x0, y, z0, x0, y, z1, x1, y, z1, x1, y, z0];
  const uv = [x0 / tile, z0 / tile, x0 / tile, z1 / tile, x1 / tile, z1 / tile, x1 / tile, z0 / tile];
  const uv1 = [x0 / roomW, 1 - z0 / roomD, x0 / roomW, 1 - z1 / roomD, x1 / roomW, 1 - z1 / roomD, x1 / roomW, 1 - z0 / roomD];
  const ny = up ? 1 : -1;
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new Float32BufferAttribute([0, ny, 0, 0, ny, 0, 0, ny, 0, 0, ny, 0], 3));
  g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  g.setAttribute('uv1', new Float32BufferAttribute(uv1, 2));
  g.setAttribute('color', new Float32BufferAttribute(new Array(12).fill(0).map((_, i) => color[i % 3]), 3));
  g.setIndex(up ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
  return g;
}

export function merge(list) {
  if (!list.length) return null;
  const g = mergeGeometries(list, false);
  for (const x of list) x.dispose();
  return g;
}

export function hex(c) {
  const n = typeof c === 'string' ? parseInt(c.replace('#', ''), 16) : c;
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

export function scale3(c, f) {
  return [c[0] * f, c[1] * f, c[2] * f];
}

/** Deterministischer Zufall (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

/** Entsorgt Geometrien, Materialien und Texturen eines Objektbaums. */
export function disposeTree(root) {
  root.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k of Object.keys(m)) if (m[k] && m[k].isTexture) m[k].dispose();
      m.dispose();
    }
  });
}
