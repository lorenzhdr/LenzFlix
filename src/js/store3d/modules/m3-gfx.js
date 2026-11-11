// VIDEOTHEK LENZ · M3 Kasse & Orte: three/Canvas-Helfer (Cover-Atlas, Beschriftungs-Texturen) und DOM-Panel-Helfer.
import { CanvasTexture, SRGBColorSpace } from 'three';
import { makeCanvas, FONT } from '../world/textures.js';
import { hash } from '../util/geo.js';
import { atlasCell, wrapText } from './m3-util.js';

export const MONO = '"LenzStore Mono","Courier New",monospace';

/** Canvas-Textur (sRGB), von ctx.track verwaltet. draw(g, w, h) zeichnet einmalig. */
export function canvasTexture(ctx, w, h, draw) {
  const c = makeCanvas(w, h);
  draw(c.getContext('2d'), w, h);
  const t = new CanvasTexture(c);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return ctx.track(t);
}

function fitCover(g, img, x, y, w, h) {
  const iw = img.width || img.naturalWidth;
  const ih = img.height || img.naturalHeight;
  if (!iw || !ih) return;
  const k = Math.max(w / iw, h / ih);
  const sw = w / k;
  const sh = h / k;
  g.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, x, y, w, h);
}

function fitContain(g, img, x, y, w, h) {
  const iw = img.width || img.naturalWidth;
  const ih = img.height || img.naturalHeight;
  if (!iw || !ih) return;
  const k = Math.min(w / iw, h / ih);
  g.drawImage(img, x + (w - iw * k) / 2, y + (h - ih * k) / 2, iw * k, ih * k);
}

function placeholder(g, e, x, y, w, h) {
  const hue = hash(String(e.title || e.url || 'x')) % 360;
  const gr = g.createLinearGradient(x, y, x + w, y + h);
  gr.addColorStop(0, `hsl(${hue} 55% 42%)`);
  gr.addColorStop(1, `hsl(${(hue + 40) % 360} 60% 16%)`);
  g.fillStyle = gr;
  g.fillRect(x, y, w, h);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const fs = Math.round(Math.min(w, h) * 0.1);
  g.font = `bold ${fs}px ${FONT}`;
  const lines = wrapText(e.title, Math.max(6, Math.round(w / (fs * 0.62))), 4);
  lines.forEach((l, i) => g.fillText(l, x + w / 2, y + h / 2 + (i - (lines.length - 1) / 2) * fs * 1.2));
}

function decorate(g, e, x, y, w, h) {
  if (e.progress > 0) {
    const bh = Math.max(6, Math.round(h * 0.055));
    g.fillStyle = 'rgba(0,0,0,0.65)';
    g.fillRect(x, y + h - bh, w, bh);
    g.fillStyle = '#ff3d7f';
    g.fillRect(x, y + h - bh, w * Math.min(1, e.progress), bh);
  }
  if (e.caption) {
    const bh = Math.round(h * 0.2);
    const gr = g.createLinearGradient(0, y + h - bh, 0, y + h);
    gr.addColorStop(0, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.85)');
    g.fillStyle = gr;
    g.fillRect(x, y + h - bh, w, bh);
    g.fillStyle = '#fff';
    g.textAlign = 'left';
    g.textBaseline = 'alphabetic';
    const fs = Math.round(h * 0.085);
    g.font = `bold ${fs}px ${FONT}`;
    g.fillText(wrapText(e.caption, 32, 1)[0] || '', x + w * 0.04, y + h - h * 0.045, w * 0.92);
  }
  g.strokeStyle = e.border || 'rgba(255,255,255,0.55)';
  g.lineWidth = Math.max(2, Math.round(w * 0.012));
  g.strokeRect(x + g.lineWidth / 2, y + g.lineWidth / 2, w - g.lineWidth, h - g.lineWidth);
}

/**
 * Cover-Atlas: ein Canvas (cols × rows Zellen) für viele Hüllen/Poster – ein Material, ein Draw-Call.
 * entries: [{ url, title, progress?, caption?, fit?: 'cover'|'contain' }]. Platzhalter sofort, Bilder asynchron (≤ 4 parallel über ctx.loadTexture).
 * Rückgabe: { texture, uv(i), draw(i) }.
 */
export function coverBoard(ctx, entries, { cols, cw, ch, maxWidth = 200 }) {
  const rows = Math.max(1, Math.ceil(entries.length / cols));
  const canvas = makeCanvas(cols * cw, rows * ch);
  const g = canvas.getContext('2d');
  g.fillStyle = '#1b1f33';
  g.fillRect(0, 0, canvas.width, canvas.height);
  const texture = ctx.track(new CanvasTexture(canvas));
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  const imgs = new Array(entries.length).fill(null);
  const paint = (i) => {
    const e = entries[i];
    const cell = atlasCell(i, cols, rows, cw, ch);
    g.save();
    g.beginPath();
    g.rect(cell.x, cell.y, cell.w, cell.h);
    g.clip();
    placeholder(g, e, cell.x, cell.y, cell.w, cell.h);
    const img = imgs[i];
    if (img) {
      if (e.fit === 'contain') {
        g.fillStyle = 'rgba(0,0,0,0.55)';
        g.fillRect(cell.x, cell.y, cell.w, cell.h);
        fitContain(g, img, cell.x, cell.y, cell.w, cell.h);
      } else fitCover(g, img, cell.x, cell.y, cell.w, cell.h);
    }
    decorate(g, e, cell.x, cell.y, cell.w, cell.h);
    g.restore();
    texture.needsUpdate = true;
  };
  entries.forEach((e, i) => {
    paint(i);
    if (!e.url) return;
    ctx.loadTexture(e.url, { maxWidth }).then((t) => {
      if (!t || !t.image) return;
      imgs[i] = t.image;
      paint(i);
    });
  });
  return { texture, uv: (i) => atlasCell(i, cols, rows, cw, ch).uv };
}

// --- DOM ---
export function h(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export function button(text, cls, onClick) {
  const b = h('button', cls, text);
  b.type = 'button';
  b.addEventListener('click', (ev) => { ev.stopPropagation(); onClick(ev); });
  return b;
}

/**
 * Modales Panel (Backdrop + Panel) über ctx.overlay. build(panel, close) füllt das Panel.
 * Esc schließt der Kern (Modus „overlay“); Klick auf den Backdrop und der Schließen-Knopf rufen close().
 */
export function openPanel(ctx, { cls, label, build, onClose }) {
  const root = h('div', `lfx-store-m3 ${cls || ''}`.trim());
  const panel = h('div', 'lfx-store-m3-panel');
  panel.setAttribute('role', 'dialog');
  if (label) panel.setAttribute('aria-label', label);
  root.appendChild(panel);
  let open = true;
  const close = () => { if (open && ctx.overlay.isOpen()) ctx.overlay.close(); };
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  for (const ev of ['keydown', 'keyup', 'keypress']) root.addEventListener(ev, (e) => e.stopPropagation());
  build(panel, close);
  ctx.overlay.open(root, { onClose: () => { open = false; if (onClose) onClose(); } });
  if (!ctx.isTouch) {
    const first = panel.querySelector('button, [tabindex]');
    if (first) { try { first.focus({ preventScroll: true }); } catch { /* egal */ } }
  }
  return { root, panel, close };
}
