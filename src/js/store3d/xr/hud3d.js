// VIDEOTHEK LENZ · VR-Anzeigen: Ziel-Label am Laserende, Hinweis (Toast, kopffest) und Diagnose-Zeilen.
// Canvas-Texturen werden nur bei geänderter Beschriftung neu gezeichnet.
import { Mesh, PlaneGeometry, MeshBasicMaterial, CanvasTexture, SRGBColorSpace, Vector3 } from 'three';

/** Hinweistext für VR: „E / Klick:“ → „Trigger:“. */
export function vrHint(hint, fallback = 'Trigger: Benutzen') {
  const h = String(hint == null || hint === '' ? fallback : hint);
  return h.replace(/E\s*\/\s*Klick\s*:/i, 'Trigger:');
}

/** Diagnose-Zeilen aus dem Zustand (rein). cinema = Ergebnis von cinema.diag() (Objekt, Text oder Liste). */
export function diagLines({ visibility, space, sources, cinema }) {
  const out = [`Sitzung: ${visibility || '?'}`, `Raum: ${space || '?'}`, `Eingabe: ${sources && sources.length ? sources.join(', ') : 'keine'}`];
  if (typeof cinema === 'string') out.push(cinema);
  else if (Array.isArray(cinema)) for (const l of cinema) out.push(String(l));
  else if (cinema && typeof cinema === 'object') {
    const keys = ['phase', 'videoFrames', 'readyState'];
    const parts = keys.filter((k) => cinema[k] != null).map((k) => `${k} ${cinema[k]}`);
    out.push(`Kino: ${parts.length ? parts.join(' · ') : Object.keys(cinema).map((k) => `${k} ${cinema[k]}`).join(' · ')}`);
  }
  return out;
}

const FONT = 'system-ui, "Segoe UI", sans-serif';

class TextQuad {
  constructor({ renderOrder, depthTest = false }) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = 64;
    this.canvas.height = 64;
    let g;
    try { g = this.canvas.getContext ? this.canvas.getContext('2d') : null; } catch { g = null; }
    this.g = g;
    this.tex = new CanvasTexture(this.canvas);
    this.tex.colorSpace = SRGBColorSpace;
    this.mat = new MeshBasicMaterial({ map: this.tex, transparent: true, toneMapped: false, depthTest, depthWrite: false, fog: false });
    this.mesh = new Mesh(new PlaneGeometry(1, 1), this.mat);
    this.mesh.renderOrder = renderOrder;
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.key = null;
    this.w = 1;
    this.h = 1;
  }

  /** rows: [{ text, size, color, weight? }]; ppm = Pixel pro Meter. Zeichnet nur bei geändertem Inhalt. */
  set(rows, { ppm = 1000, align = 'center', pad = 22 } = {}) {
    const key = JSON.stringify([rows, ppm, align]);
    if (key === this.key) return;
    this.key = key;
    const g = this.g;
    let w = 200;
    let h = 60;
    if (g) {
      let maxW = 0;
      let y = pad;
      for (const r of rows) { g.font = `${r.weight || '600'} ${r.size}px ${FONT}`; maxW = Math.max(maxW, g.measureText(r.text).width); y += r.size * 1.25; }
      w = Math.ceil(maxW + pad * 2);
      h = Math.ceil(y + pad - 4);
      this.canvas.width = w;
      this.canvas.height = h;
      g.clearRect(0, 0, w, h);
      g.fillStyle = 'rgba(13, 19, 48, 0.88)';
      g.beginPath();
      if (g.roundRect) g.roundRect(0, 0, w, h, 20); else g.rect(0, 0, w, h);
      g.fill();
      g.textBaseline = 'top';
      g.textAlign = align;
      y = pad;
      for (const r of rows) {
        g.font = `${r.weight || '600'} ${r.size}px ${FONT}`;
        g.fillStyle = r.color;
        g.fillText(r.text, align === 'center' ? w / 2 : pad, y);
        y += r.size * 1.25;
      }
      this.tex.needsUpdate = true;
    }
    this.w = w / ppm;
    this.h = h / ppm;
    this.mesh.geometry.dispose();
    this.mesh.geometry = new PlaneGeometry(this.w, this.h);
  }

  dispose() {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mat.dispose();
    this.tex.dispose();
  }
}

const _v = new Vector3();

export class Hud3d {
  /** @param {{ rig: Object3D, camera: Camera }} o */
  constructor({ rig, camera }) {
    this.rig = rig;
    this.camera = camera;
    this.label = new TextQuad({ renderOrder: 9000 });
    this.toastQuad = new TextQuad({ renderOrder: 9001 });
    this.diagQuad = new TextQuad({ renderOrder: 9002 });
    rig.add(this.label.mesh);
    camera.add(this.toastQuad.mesh);
    camera.add(this.diagQuad.mesh);
    this.toastQuad.mesh.position.set(0, -0.28, -1.0);
    this.diagQuad.mesh.position.set(-0.32, 0.2, -1.0);
    this.toastLeft = 0;
    this.labelOn = false;
  }

  /** Label am Weltpunkt (Laserende); title leer → ausblenden. */
  setLabel(title, hint, worldPoint) {
    if (!title && !hint) { this.hideLabel(); return; }
    const rows = [];
    if (title) rows.push({ text: String(title), size: 40, color: '#ffffff', weight: '700' });
    if (hint) rows.push({ text: vrHint(hint), size: 28, color: '#ffd23f' });
    this.label.set(rows, { ppm: 1100 });
    const m = this.label.mesh;
    this.rig.updateWorldMatrix(true, false);
    _v.copy(worldPoint);
    this.rig.worldToLocal(_v);
    const cam = this.camera;
    const dx = _v.x - cam.position.x;
    const dy = _v.y - cam.position.y;
    const dz = _v.z - cam.position.z;
    const dist = Math.min(5, Math.max(0.6, Math.hypot(dx, dy, dz)));
    m.position.set(_v.x, _v.y + 0.07 * dist * 0.5 + 0.06, _v.z);
    m.quaternion.copy(cam.quaternion);
    const s = 0.55 + dist * 0.22;
    m.scale.set(s, s, 1);
    m.visible = true;
    this.labelOn = true;
  }

  hideLabel() {
    if (this.labelOn) { this.label.mesh.visible = false; this.labelOn = false; }
  }

  toast(text, ms = 2600) {
    this.toastQuad.set([{ text: String(text == null ? '' : text), size: 34, color: '#f4f6ff' }], { ppm: 1100 });
    this.toastQuad.mesh.visible = true;
    this.toastLeft = Math.max(0.3, ms / 1000);
  }

  closeToast() {
    this.toastLeft = 0;
    this.toastQuad.mesh.visible = false;
  }

  get toastOpen() { return this.toastQuad.mesh.visible; }

  /** lines: string[] | null (aus). */
  setDiag(lines) {
    if (!lines || !lines.length) { this.diagQuad.mesh.visible = false; return; }
    this.diagQuad.set(lines.map((t) => ({ text: String(t), size: 24, color: '#aab4e8', weight: '500' })), { ppm: 1400, align: 'left' });
    this.diagQuad.mesh.visible = true;
  }

  update(dt) {
    if (this.toastLeft > 0) {
      this.toastLeft -= dt;
      if (this.toastLeft <= 0) this.closeToast();
    }
  }

  dispose() {
    this.label.dispose();
    this.toastQuad.dispose();
    this.diagQuad.dispose();
  }
}
