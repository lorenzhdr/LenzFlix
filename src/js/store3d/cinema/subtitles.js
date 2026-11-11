// VIDEOTHEK LENZ · VR-Kino: Untertitel auf der Leinwand (Text → eigene Canvas, ASS/libass → Quell-Canvas kopiert).
import { Mesh, MeshBasicMaterial, CanvasTexture, SRGBColorSpace, LinearFilter, BufferGeometry } from 'three';
import { screenGeometry } from './screen.js';

/**
 * Text auf höchstens maxLines Zeilen umbrechen (rein). measure(str) → Breite. Vorhandene Zeilenumbrüche bleiben.
 * Passt der Text nicht, wird die letzte Zeile mit „…“ gekürzt.
 */
export function wrapLines(text, maxWidth, measure, maxLines = 3) {
  const out = [];
  for (const para of String(text == null ? '' : text).replace(/\r/g, '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    let line = '';
    for (const w of words) {
      const cand = line ? `${line} ${w}` : w;
      if (line && measure(cand) > maxWidth) { out.push(line); line = w; } else line = cand;
    }
    if (line) out.push(line);
  }
  if (out.length <= maxLines) return out;
  const cut = out.slice(0, maxLines);
  let last = `${cut[maxLines - 1]}…`;
  while (last.length > 2 && measure(last) > maxWidth) last = `${last.slice(0, -2)}…`;
  cut[maxLines - 1] = last;
  return cut;
}

const TEXT_W = 1600;
const TEXT_H = 330;
const FONT_PX = 66;
const LINE_PX = 82;
const FONT = `700 ${FONT_PX}px system-ui, "Segoe UI", Roboto, Arial, sans-serif`;
const MAX_CANVAS_FPS_GAP = 33;

function ctx2d(c) {
  try { return c.getContext ? c.getContext('2d') : null; } catch { return null; }
}

/**
 * createSubtitles({ screen }): hängt eine transparente Fläche an die Leinwandgruppe.
 * set(sub) mit { kind:'text', text } | { kind:'canvas', canvas } | null; tick(now) kopiert Canvas-Untertitel (max. 30 Hz).
 */
export function createSubtitles({ screen }) {
  const textCanvas = document.createElement('canvas');
  textCanvas.width = TEXT_W;
  textCanvas.height = TEXT_H;
  const tg = ctx2d(textCanvas);
  const mat = new MeshBasicMaterial({ transparent: true, toneMapped: false, depthWrite: false, opacity: 1 });
  const mesh = new Mesh(new BufferGeometry(), mat);
  mesh.name = 'lfx-cinema-subtitles';
  mesh.renderOrder = 6;
  mesh.visible = false;
  screen.group.add(mesh);

  let textTex = null;
  let canvasTex = null;
  let copyCanvas = null;
  let copyCtx = null;
  let mode = 'none';
  let lastText = null;
  let lastCopy = -1e9;
  let dimsVersion = -1;
  let srcW = 0;
  let srcH = 0;
  let disposed = false;

  function layout() {
    const d = screen.dims;
    dimsVersion = d.version;
    mesh.geometry.dispose();
    if (mode === 'canvas') {
      mesh.geometry = screenGeometry({ radius: d.radius, width: d.width, height: d.height });
      mesh.position.set(0, 0, 0.04);
    } else {
      const w = d.width * 0.62;
      const h = w * TEXT_H / TEXT_W;
      mesh.geometry = screenGeometry({ radius: d.radius, width: w, height: h });
      mesh.position.set(0, -d.height / 2 + h / 2 + d.height * 0.05, 0.04);
    }
  }

  function drawText(text) {
    if (!tg) return;
    tg.clearRect(0, 0, TEXT_W, TEXT_H);
    tg.font = FONT;
    tg.textAlign = 'center';
    tg.textBaseline = 'alphabetic';
    tg.lineJoin = 'round';
    const lines = wrapLines(text, TEXT_W * 0.92, (s) => tg.measureText(s).width, 3);
    let y = TEXT_H - 36 - (lines.length - 1) * LINE_PX;
    for (const ln of lines) {
      tg.lineWidth = 12;
      tg.strokeStyle = 'rgba(0,0,0,0.88)';
      tg.strokeText(ln, TEXT_W / 2, y, TEXT_W * 0.96);
      tg.fillStyle = '#ffffff';
      tg.fillText(ln, TEXT_W / 2, y, TEXT_W * 0.96);
      y += LINE_PX;
    }
    if (textTex) textTex.needsUpdate = true;
  }

  function ensureTextTex() {
    if (textTex) return;
    textTex = new CanvasTexture(textCanvas);
    textTex.colorSpace = SRGBColorSpace;
    textTex.generateMipmaps = false;
    textTex.minFilter = LinearFilter;
  }

  function ensureCopy(sw, sh) {
    if (copyCanvas && sw === srcW && sh === srcH) return;
    if (canvasTex) { canvasTex.dispose(); canvasTex = null; }
    const k = Math.min(1, 1920 / Math.max(1, sw));
    srcW = sw;
    srcH = sh;
    copyCanvas = document.createElement('canvas');
    copyCanvas.width = Math.max(2, Math.round(sw * k));
    copyCanvas.height = Math.max(2, Math.round(sh * k));
    copyCtx = ctx2d(copyCanvas);
    canvasTex = new CanvasTexture(copyCanvas);
    canvasTex.colorSpace = SRGBColorSpace;
    canvasTex.generateMipmaps = false;
    canvasTex.minFilter = LinearFilter;
    // Größe geändert: neue Textur (kein Resize einer hochgeladenen CanvasTexture), Material neu binden
    if (mode === 'canvas') { mat.map = canvasTex; mat.needsUpdate = true; }
  }

  function setMode(m) {
    if (m === mode) return;
    mode = m;
    mesh.visible = m !== 'none';
    if (m === 'text') { ensureTextTex(); mat.map = textTex; } else if (m === 'canvas') mat.map = canvasTex;
    mat.needsUpdate = true;
    dimsVersion = -1;
  }

  const api = {
    mesh,
    get mode() { return mode; },
    get text() { return lastText; },
    set(sub) {
      if (disposed) return;
      if (!sub) { setMode('none'); lastText = null; return; }
      if (sub.kind === 'text') {
        const t = String(sub.text == null ? '' : sub.text).trim();
        if (!t) { setMode('none'); lastText = null; return; }
        ensureTextTex();
        setMode('text');
        if (t !== lastText) { lastText = t; drawText(t); }
      } else if (sub.kind === 'canvas' && sub.canvas) {
        const c = sub.canvas;
        if (!(c.width > 0 && c.height > 0)) { setMode('none'); return; }
        ensureCopy(c.width, c.height);
        mat.map = canvasTex;
        setMode('canvas');
        mat.map = canvasTex;
        lastText = null;
        api._src = c;
      }
    },
    tick(now) {
      if (disposed || mode === 'none') return;
      if (dimsVersion !== screen.dims.version) layout();
      if (mode === 'canvas' && copyCtx && api._src && now - lastCopy >= MAX_CANVAS_FPS_GAP) {
        lastCopy = now;
        try {
          copyCtx.clearRect(0, 0, copyCanvas.width, copyCanvas.height);
          copyCtx.drawImage(api._src, 0, 0, copyCanvas.width, copyCanvas.height);
          canvasTex.needsUpdate = true;
        } catch { /* egal */ }
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      mesh.removeFromParent();
      mesh.geometry.dispose();
      mat.dispose();
      if (textTex) textTex.dispose();
      if (canvasTex) canvasTex.dispose();
      api._src = null;
    },
  };
  return api;
}
