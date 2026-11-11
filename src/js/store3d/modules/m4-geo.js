// VIDEOTHEK LENZ · M4: kleine three-Geometriehelfer (Kugel mit Vertexfarbe, damit sie mit util/geo.js `box`/`quad` zusammengeführt werden kann).
import { SphereGeometry, Float32BufferAttribute } from 'three';

/** Kugel (ggf. nur Kappe bis phiLen) als indizierte Geometrie mit position/normal/uv/color. */
export function sph(r, x, y, z, color, sx = 1, sy = 1, sz = 1, ws = 8, hs = 6, phiLen = Math.PI) {
  const g = new SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, phiLen);
  g.scale(sx, sy, sz);
  g.translate(x, y, z);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { c[i * 3] = color[0]; c[i * 3 + 1] = color[1]; c[i * 3 + 2] = color[2]; }
  g.setAttribute('color', new Float32BufferAttribute(c, 3));
  return g;
}

/** UV-Rechteck [u0,v0,u1,v1] aus Pixelbereich eines Atlas (Canvas, y nach unten). */
export function atlasUv(x, y, w, h, size) {
  return [x / size, 1 - (y + h) / size, (x + w) / size, 1 - y / size];
}
