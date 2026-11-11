// VIDEOTHEK LENZ · VR-Sprechblase: Billboard-Plane mit Canvas-Textur (abgerundete Blase mit Spitze, max. 3 Zeilen).
// createBubble3d({ getScene, camera }) → { show(text, { x, y, z }), hide(), update(dt), dispose(), visible }
// Die Spitze der Blase sitzt exakt auf `pos` (Ursprung der Geometrie = Spitze), dort wird auch skaliert.
import { Mesh, PlaneGeometry, MeshBasicMaterial, CanvasTexture, SRGBColorSpace, DoubleSide, Vector3 } from 'three';
import { wrapText, COLORS } from './panel.js';

const CW = 768;
const CH = 288;
const BODY_H = 232;
const M_PER_PX = 0.6 / CW; // Blase 0,6 m breit bei Skalierung 1
const FONT = 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SIZE = 44;
const LINE_H = 54;
const MAX_LINES = 3;
const PAD_X = 40;
// Skalierung: bis 2,5 m unverändert, danach linear wachsend bis max. 3,4 (8 m ≈ 12° Blickwinkel statt 4°)
const NEAR = 2.5;
const MAX_SCALE = 3.4;

const approx = (text, size) => String(text).length * size * 0.55;

/** Text in höchstens maxLines Zeilen umbrechen, die letzte bei Überlänge mit „…“ kürzen. */
export function bubbleLines(text, maxW, measure = approx, maxLines = MAX_LINES) {
  const lines = wrapText(text, maxW, SIZE, measure).filter((l, i, a) => l !== '' || a.length === 1);
  if (lines.length <= maxLines) return lines;
  const out = lines.slice(0, maxLines);
  let last = `${out[maxLines - 1]} ${lines.slice(maxLines).join(' ')}`.trim();
  while (last.length > 1 && measure(`${last}…`, SIZE) > maxW) last = last.slice(0, -1);
  out[maxLines - 1] = `${last.trimEnd()}…`;
  return out;
}

export function createBubble3d({ getScene, camera } = {}) {
  let mesh = null;
  let mat = null;
  let tex = null;
  let canvas = null;
  let g = null;
  let shown = false;
  let opacity = 0;
  let curText = null;
  let disposed = false;
  const tip = new Vector3();
  const cam = new Vector3();

  function ensure() {
    if (mesh || disposed) return;
    canvas = document.createElement('canvas');
    canvas.width = CW;
    canvas.height = CH;
    try { g = canvas.getContext ? canvas.getContext('2d') : null; } catch { g = null; }
    tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    tex.anisotropy = 4;
    mat = new MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthTest: true, depthWrite: false, side: DoubleSide, opacity: 0 });
    const geo = new PlaneGeometry(CW * M_PER_PX, CH * M_PER_PX);
    geo.translate(0, (CH * M_PER_PX) / 2, 0); // Ursprung = untere Mitte = Spitze
    mesh = new Mesh(geo, mat);
    mesh.name = 'lfx-bubble3d';
    mesh.renderOrder = 25;
    mesh.visible = false;
    mesh.frustumCulled = false;
  }

  function draw(text) {
    if (!g) return;
    g.clearRect(0, 0, CW, CH);
    const r = 44;
    const w = CW - 16;
    const x0 = 8;
    const y0 = 8;
    const h = BODY_H - 16;
    g.beginPath();
    if (g.roundRect) g.roundRect(x0, y0, w, h, r); else g.rect(x0, y0, w, h);
    g.moveTo(CW / 2 - 28, y0 + h - 1);
    g.lineTo(CW / 2, CH - 8);
    g.lineTo(CW / 2 + 28, y0 + h - 1);
    g.closePath();
    g.fillStyle = '#fff6d6';
    g.fill();
    g.lineWidth = 8;
    g.strokeStyle = COLORS.yellow;
    g.lineJoin = 'round';
    g.stroke();
    g.font = `700 ${SIZE}px ${FONT}`;
    const meas = (t) => g.measureText(t).width;
    const lines = bubbleLines(text, CW - PAD_X * 2, (t) => meas(t));
    g.fillStyle = COLORS.dark;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    const top = y0 + h / 2 - ((lines.length - 1) * LINE_H) / 2;
    lines.forEach((ln, i) => g.fillText(ln, CW / 2, top + i * LINE_H, CW - PAD_X * 2));
    tex.needsUpdate = true;
  }

  function face() {
    if (!mesh || !camera) return;
    cam.setFromMatrixPosition(camera.matrixWorld);
    const dx = cam.x - mesh.position.x;
    const dz = cam.z - mesh.position.z;
    mesh.rotation.set(0, Math.atan2(dx, dz), 0);
    const dist = Math.hypot(dx, cam.y - mesh.position.y, dz);
    mesh.scale.setScalar(Math.max(1, Math.min(MAX_SCALE, dist / NEAR)));
  }

  function attach() {
    const scene = typeof getScene === 'function' ? getScene() : null;
    if (scene && mesh && mesh.parent !== scene) scene.add(mesh);
  }

  return {
    get visible() { return shown; },
    show(text, pos) {
      if (disposed) return;
      ensure();
      const t = String(text == null ? '' : text);
      if (t !== curText) { curText = t; draw(t); }
      if (pos) { tip.set(pos.x || 0, pos.y || 0, pos.z || 0); mesh.position.copy(tip); }
      shown = true;
      mesh.visible = true;
      attach();
      face();
    },
    hide() { shown = false; },
    update(dt) {
      if (!mesh || disposed) return;
      const target = shown ? 1 : 0;
      if (opacity !== target) {
        const step = Math.max(0, dt || 0) * 6;
        opacity = opacity < target ? Math.min(target, opacity + step) : Math.max(target, opacity - step);
        mat.opacity = opacity;
        if (opacity <= 0.001 && !shown) mesh.visible = false;
      }
      if (mesh.visible) { attach(); face(); }
    },
    dispose() {
      shown = false;
      if (disposed) return;
      disposed = true;
      if (mesh) { mesh.removeFromParent(); mesh.geometry.dispose(); }
      if (mat) mat.dispose();
      if (tex) tex.dispose();
      mesh = null; mat = null; tex = null; canvas = null; g = null;
    },
  };
}
