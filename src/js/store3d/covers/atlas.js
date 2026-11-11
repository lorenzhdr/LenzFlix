// VIDEOTHEK LENZ · Cover-Atlas zeichnen (temporäres Canvas): Cover, Medien-Optik (VHS-Pappe, DVD-Rand, Box-Set),
// Platzhalter (Abteilungsfarbe + Titel) und Aufkleber (Gesehen, Fortschritts-Banderole, NEU).
import { makeCanvas, FONT } from '../world/textures.js';
import { shelfSpec } from '../world/layout.js';
import { BASE, SWATCH_Y, SWATCH_W, SWATCH_H, SWATCH_COLORS } from './atlasmap.js';
import { hash } from '../util/geo.js';

function wrap(ctx, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(t).width <= maxW || !cur) cur = t;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/\s*\S{0,2}$/, '')}…`;
  }
  return lines;
}

function shade(hexColor, f) {
  const n = parseInt(String(hexColor).replace('#', ''), 16) || 0x444444;
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${c((n >> 16) & 255)},${c((n >> 8) & 255)},${c(n & 255)})`;
}

function coverFit(ctx, img, x, y, w, h) {
  const sw = img.width || img.naturalWidth;
  const sh = img.height || img.naturalHeight;
  if (!sw || !sh) return false;
  const tr = w / h;
  const sr = sw / sh;
  let cw = sw;
  let ch = sh;
  let cx = 0;
  let cy = 0;
  if (sr > tr) { cw = sh * tr; cx = (sw - cw) / 2; } else { ch = sw / tr; cy = (sh - ch) / 2; }
  ctx.drawImage(img, cx, cy, cw, ch, x, y, w, h);
  return true;
}

function sticker(ctx, item, x, y, w, h, s) {
  const lfx = item.lfx || {};
  const ud = item.UserData || {};
  const progress = lfx.progress > 0 ? lfx.progress : 0;
  if (progress > 0 && progress < 1) {
    const by = y + h * 0.74;
    const bh = h * 0.07;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x, by, w, bh);
    ctx.fillStyle = '#ff9f1c';
    ctx.fillRect(x, by, w * Math.min(1, progress), bh);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x, by, w, Math.max(1, s));
  }
  if (lfx.watched || ud.Played) {
    const r = w * 0.15;
    const cx = x + w * 0.78;
    const cy = y + h * 0.2;
    ctx.fillStyle = '#2ecc71';
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1, 3 * s);
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1.5, 4 * s);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx - r * 0.45, cy); ctx.lineTo(cx - r * 0.1, cy + r * 0.38); ctx.lineTo(cx + r * 0.5, cy - r * 0.35); ctx.stroke();
  }
  if (lfx.isNew) {
    ctx.save();
    ctx.translate(x + w * 0.27, y + h * 0.13);
    ctx.rotate(-0.22);
    const bw = w * 0.5;
    const bh = h * 0.13;
    ctx.fillStyle = '#ffd400';
    ctx.strokeStyle = '#d6001c';
    ctx.lineWidth = Math.max(1, 2.5 * s);
    ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.strokeRect(-bw / 2, -bh / 2, bw, bh);
    ctx.fillStyle = '#d6001c';
    ctx.font = `bold ${Math.round(bh * 0.78)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('NEU', 0, bh * 0.04);
    ctx.restore();
  }
}

function placeholderCell(ctx, item, x, y, w, h, s, color) {
  // dunkle, edle Hülle: fast schwarz, schmaler Genre-Farbstreifen links, Titel klein in Grau-Weiß
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, '#23252f');
  g.addColorStop(1, '#101218');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = shade(color, 0.85);
  ctx.fillRect(x, y, Math.max(3, 9 * s), h);
  ctx.fillStyle = 'rgba(255,255,255,0.07)';
  ctx.fillRect(x + Math.max(3, 9 * s), y, w, Math.max(1, 3 * s));
  ctx.fillStyle = '#d7d9e2';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fs = Math.max(7, Math.round(13 * s));
  ctx.font = `bold ${fs}px ${FONT}`;
  const lines = wrap(ctx, item.Name || '?', w - 28 * s, 5);
  const lh = fs * 1.15;
  const cx = x + w / 2 + 4 * s;
  const top = y + h * 0.45 - ((lines.length - 1) * lh) / 2;
  lines.forEach((l, i) => ctx.fillText(l, cx, top + i * lh));
  if (item.ProductionYear) {
    ctx.font = `${Math.max(6, Math.round(10 * s))}px ${FONT}`;
    ctx.fillStyle = 'rgba(215,217,226,0.55)';
    ctx.fillText(String(item.ProductionYear), cx, y + h * 0.78);
  }
}

/**
 * Zeichnet den Atlas eines Faces.
 * @param {object} p { face, items: Map, bitmaps: Map<slotIdx, Image|ImageBitmap>, size, spec? (shelfSpec, Standard normal) }
 * @returns {HTMLCanvasElement}
 */
export function drawAtlas({ face, items, bitmaps, size, spec = shelfSpec(false) }) {
  const s = size / BASE;
  const c = makeCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#101014';
  ctx.fillRect(0, 0, size, size);
  // Farbfelder für Hüllenseiten
  SWATCH_COLORS.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.fillRect(i * SWATCH_W * s, SWATCH_Y * s, SWATCH_W * s, SWATCH_H * s);
  });
  const cw = spec.cellW * s;
  const ch = spec.cellH * s;
  face.slots.forEach((id, idx) => {
    if (id == null) return;
    const item = items.get(id) || { Id: id, Name: '?' };
    const col = idx % spec.cols;
    const row = Math.floor(idx / spec.cols);
    const x = col * cw;
    const y = row * ch;
    const media = (item.lfx && item.lfx.media) || 'dvd';
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, cw, ch);
    ctx.clip();
    // Hüllenkörper
    let inset;
    if (media === 'vhs') {
      ctx.fillStyle = '#e2d8bd';
      ctx.fillRect(x, y, cw, ch);
      inset = { l: 7 * s, t: 7 * s, r: 7 * s, b: 16 * s };
    } else if (media === 'box') {
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(x, y, cw, ch);
      ctx.fillStyle = '#17140a';
      ctx.fillRect(x + 4 * s, y + 4 * s, cw - 8 * s, ch - 8 * s);
      inset = { l: 8 * s, t: 8 * s, r: 8 * s, b: 8 * s };
    } else {
      ctx.fillStyle = hash(id) % 3 === 0 ? '#101012' : '#1d3f9c';
      ctx.fillRect(x, y, cw, ch);
      inset = { l: 11 * s, t: 4 * s, r: 4 * s, b: 4 * s };
    }
    const ix = x + inset.l;
    const iy = y + inset.t;
    const iw = cw - inset.l - inset.r;
    const ih = ch - inset.t - inset.b;
    const bmp = bitmaps && bitmaps.get(idx);
    ctx.save();
    ctx.beginPath();
    ctx.rect(ix, iy, iw, ih);
    ctx.clip();
    let drawn = false;
    if (bmp) {
      try { drawn = coverFit(ctx, bmp, ix, iy, iw, ih); } catch { drawn = false; }
    }
    if (!drawn) placeholderCell(ctx, item, ix, iy, iw, ih, s, face.color);
    ctx.restore();
    if (media === 'dvd') { // Rücken-Streifen der Hülle
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + 8 * s, y + 4 * s, Math.max(1, 1.5 * s), ch - 8 * s);
    }
    sticker(ctx, item, ix, iy, iw, ih, s);
    ctx.restore();
  });
  return c;
}
