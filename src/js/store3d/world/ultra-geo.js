// VIDEOTHEK LENZ · Ultra-Geometrie (1.19.0): schneller Roh-Baukasten für Außen-Details. Schreibt Quader/Zylinder direkt in
// Positions-/Farb-Arrays (kein BufferGeometry je Teil, kein merge) und liefert am Ende EINE indizierte Geometrie (position + color).
// Nur für MeshBasicMaterial mit vertexColors gedacht (keine Normalen, keine UVs). Dreiecke zählen kaum, die Bauzeit soll klein bleiben.
import { BufferGeometry, Float32BufferAttribute, Uint32BufferAttribute, Matrix4, Euler, Quaternion, Vector3 } from 'three';

const SHADE = [0.86, 0.8, 1, 0.55, 0.94, 0.74]; // Flächenhelligkeit +x, -x, +y, -y, +z, -z (ohne Licht ein Hauch Körper)
// Flächen: n, u, v mit u×v = n (Gegen-Uhrzeigersinn von außen), Eckenfolge (-u-v, +u-v, +u+v, -u+v).
const FACES = [
  [[1, 0, 0], [0, 1, 0], [0, 0, 1]],
  [[-1, 0, 0], [0, 0, 1], [0, 1, 0]],
  [[0, 1, 0], [0, 0, 1], [1, 0, 0]],
  [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]],
  [[0, 0, -1], [0, 1, 0], [1, 0, 0]],
];

export class Raw {
  constructor() {
    this.p = [];
    this.c = [];
    this.i = [];
    this._m = new Matrix4();
    this._v = new Vector3();
    this._q = new Quaternion();
    this._e = new Euler();
    this._id = true;
  }

  get vertexCount() { return this.p.length / 3; }

  /** Transformation für die folgenden Teile (Mittelpunkt + optionale Drehung Y/X/Z in rad). */
  at(x, y, z, ry = 0, rx = 0, rz = 0) {
    this._id = !ry && !rx && !rz;
    if (this._id) { this._ox = x; this._oy = y; this._oz = z; return this; }
    this._e.set(rx, ry, rz, 'YXZ');
    this._q.setFromEuler(this._e);
    this._m.compose(this._v.set(x, y, z), this._q, new Vector3(1, 1, 1));
    return this;
  }

  _push(lx, ly, lz, col, sh) {
    if (this._id) {
      this.p.push(lx + this._ox, ly + this._oy, lz + this._oz);
    } else {
      const v = this._v.set(lx, ly, lz).applyMatrix4(this._m);
      this.p.push(v.x, v.y, v.z);
    }
    this.c.push(col[0] * sh, col[1] * sh, col[2] * sh);
  }

  _quad(a, b, c, d) { this.i.push(a, b, c, a, c, d); }

  /** Quader mit Mittelpunkt (cx,cy,cz), Maßen w,h,d, optional gedreht (ry,rx,rz). */
  box(cx, cy, cz, w, h, d, col, ry = 0, rx = 0, rz = 0) {
    this.at(cx, cy, cz, ry, rx, rz);
    const half = [w / 2, h / 2, d / 2];
    for (let f = 0; f < 6; f++) {
      const [n, u, v] = FACES[f];
      const base = this.vertexCount;
      for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        this._push(
          n[0] * half[0] + su * u[0] * half[0] + sv * v[0] * half[0],
          n[1] * half[1] + su * u[1] * half[1] + sv * v[1] * half[1],
          n[2] * half[2] + su * u[2] * half[2] + sv * v[2] * half[2],
          col, SHADE[f],
        );
      }
      this._quad(base, base + 1, base + 2, base + 3);
    }
    return this;
  }

  /** Quader von Ecke zu Ecke (x0..x1, y0..y1, z0..z1). */
  span(x0, y0, z0, x1, y1, z1, col) {
    return this.box((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0), col);
  }

  /** Senkrechter Kegelstumpf (Mitte der Grundfläche bei y = cy - h/2), Deckel oben, optional unten. */
  cyl(cx, cy, cz, r0, r1, h, seg, col, ry = 0, rx = 0, rz = 0, bottom = false) {
    this.at(cx, cy, cz, ry, rx, rz);
    const y0 = -h / 2;
    const y1 = h / 2;
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2;
      const a1 = ((k + 1) / seg) * Math.PI * 2;
      const base = this.vertexCount;
      const sh = 0.78 + 0.22 * Math.cos(((a0 + a1) / 2) - 0.9);
      this._push(Math.cos(a0) * r0, y0, Math.sin(a0) * r0, col, sh);
      this._push(Math.cos(a0) * r1, y1, Math.sin(a0) * r1, col, sh);
      this._push(Math.cos(a1) * r1, y1, Math.sin(a1) * r1, col, sh);
      this._push(Math.cos(a1) * r0, y0, Math.sin(a1) * r0, col, sh);
      this._quad(base, base + 1, base + 2, base + 3);
    }
    if (r1 > 0) { // Deckel (Normale +y)
      const c0 = this.vertexCount;
      this._push(0, y1, 0, col, 1);
      for (let k = 0; k < seg; k++) { const a = (k / seg) * Math.PI * 2; this._push(Math.cos(a) * r1, y1, Math.sin(a) * r1, col, 1); }
      for (let k = 0; k < seg; k++) this.i.push(c0, c0 + 1 + ((k + 1) % seg), c0 + 1 + k);
    }
    if (bottom && r0 > 0) { // Boden (Normale -y)
      const c0 = this.vertexCount;
      this._push(0, y0, 0, col, SHADE[3]);
      for (let k = 0; k < seg; k++) { const a = (k / seg) * Math.PI * 2; this._push(Math.cos(a) * r0, y0, Math.sin(a) * r0, col, SHADE[3]); }
      for (let k = 0; k < seg; k++) this.i.push(c0, c0 + 1 + k, c0 + 1 + ((k + 1) % seg));
    }
    return this;
  }

  /** Waagerechte Fläche (Normale +y), Rechteck x0..x1 / z0..z1 auf Höhe y. */
  floor(x0, z0, x1, z1, y, col) {
    this.at(0, 0, 0);
    const base = this.vertexCount;
    this._push(x0, y, z0, col, 1); this._push(x0, y, z1, col, 1); this._push(x1, y, z1, col, 1); this._push(x1, y, z0, col, 1);
    this._quad(base, base + 1, base + 2, base + 3);
    return this;
  }

  /** Senkrechte Fläche (Normale +z gedreht um ry) mit Mittelpunkt, Breite w, Höhe h. Farbe je Ecke optional (4 Farben). */
  panel(cx, cy, cz, w, h, col, ry = 0) {
    this.at(cx, cy, cz, ry);
    const base = this.vertexCount;
    const cols = Array.isArray(col[0]) ? col : [col, col, col, col];
    this._push(-w / 2, -h / 2, 0, cols[0], 1); this._push(w / 2, -h / 2, 0, cols[1], 1); this._push(w / 2, h / 2, 0, cols[2], 1); this._push(-w / 2, h / 2, 0, cols[3], 1);
    this._quad(base, base + 1, base + 2, base + 3);
    return base;
  }

  geometry() {
    if (!this.p.length) return null;
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new Float32BufferAttribute(this.c, 3));
    g.setIndex(new Uint32BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }
}
