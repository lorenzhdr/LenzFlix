// VIDEOTHEK LENZ · Ultra-Texturen (1.19.0): 512²-Varianten von Teppich, Holz, Tapete und Decke mit mehr Detail
// (Fasern, Maserung, Fugen, Prägung, Abnutzung). Gleiche Kachelperiode wie die 256²-Texturen (UV bleibt gültig).
// Neue CanvasTextures – die alten werden nie in der Größe verändert (Falle CanvasTexture).
import { rng } from '../util/geo.js';
import { makeCanvas, toTexture } from './textures.js';

const S = 512;

// Zeichnet fn neunmal versetzt, damit die Textur nahtlos kachelt.
function tiled(ctx, fn) {
  for (const dx of [-S, 0, S]) {
    for (const dy of [-S, 0, S]) {
      ctx.save();
      ctx.translate(dx, dy);
      fn();
      ctx.restore();
    }
  }
}

const CARPETS = {
  blue: { base: '#16327a', motifs: ['#2ec4b6', '#d6336c', '#ffd166', '#6f8cff'], light: 'rgba(255,255,255,0.07)', worn: 'rgba(190,200,255,0.07)' },
  red: { base: '#4a1522', motifs: ['#c9a227', '#7a2236', '#2b1b3a', '#a6483c'], light: 'rgba(255,220,200,0.07)', worn: 'rgba(255,200,170,0.06)' },
  kids: { base: '#2b6cb8', motifs: ['#ffd23f', '#ff5d73', '#3ddc97', '#ffffff'], light: 'rgba(255,255,255,0.09)', worn: 'rgba(255,255,255,0.08)' },
};

function carpetCanvas(kind) {
  const P = CARPETS[kind] || CARPETS.blue;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = P.base;
  ctx.fillRect(0, 0, S, S);
  // Gewebestruktur: feines Gitter
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let i = 0; i < S; i += 4) { ctx.fillRect(i, 0, 1, S); ctx.fillRect(0, i, S, 1); }
  // Motive (gleiche Zufallsfolge wie die Basistextur, doppelt so groß gezeichnet, mit dunklem Schatten und Lichtkante)
  tiled(ctx, () => {
    const r = rng(kind.length * 977 + 13);
    for (let i = 0; i < 26; i++) {
      const x = r() * 256 * 2;
      const y = r() * 256 * 2;
      const col = P.motifs[Math.floor(r() * P.motifs.length)];
      const a = r() * Math.PI * 2;
      const s = (5 + r() * 9) * 2;
      const t = Math.floor(r() * 4);
      for (const pass of [0, 1]) {
        ctx.save();
        ctx.translate(x + (pass ? 0 : 1.6), y + (pass ? 0 : 1.6));
        ctx.rotate(a);
        ctx.fillStyle = pass ? col : 'rgba(0,0,0,0.28)';
        ctx.strokeStyle = pass ? col : 'rgba(0,0,0,0.28)';
        ctx.globalAlpha = pass ? 0.88 : 1;
        if (t === 0) {
          ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s, s * 0.8); ctx.lineTo(-s, s * 0.8); ctx.closePath(); ctx.fill();
        } else if (t === 1) {
          ctx.lineWidth = 4.4;
          ctx.beginPath(); ctx.arc(0, 0, s * 0.7, 0, Math.PI * 1.6); ctx.stroke();
        } else if (t === 2) {
          ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.lineWidth = 4.4;
          ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s / 2, -s / 2); ctx.lineTo(0, 0); ctx.lineTo(s / 2, -s / 2); ctx.lineTo(s, 0); ctx.stroke();
        }
        ctx.restore();
      }
    }
  });
  // Abnutzung: helle, weiche Laufspuren
  tiled(ctx, () => {
    const r = rng(kind.length * 31 + 7);
    for (let i = 0; i < 7; i++) {
      const x = r() * S;
      const y = r() * S;
      const rad = 40 + r() * 70;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, P.worn);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  });
  // Fasern: kurze Striche in zwei Helligkeiten
  const r2 = rng(4242 + kind.length);
  for (let i = 0; i < 9000; i++) {
    ctx.fillStyle = r2() > 0.5 ? P.light : 'rgba(0,0,0,0.09)';
    ctx.fillRect(r2() * S, r2() * S, 1 + (r2() > 0.7 ? 1 : 0), 2);
  }
  return c;
}

function woodCanvas() {
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const r = rng(77);
  const BOARD = 128; // vier Bretter je Kachel
  for (let b = 0; b < S / BOARD; b++) {
    const y0 = b * BOARD;
    const tone = (r() - 0.5) * 26;
    ctx.fillStyle = `rgb(${Math.round(201 + tone)},${Math.round(162 + tone * 0.8)},${Math.round(108 + tone * 0.6)})`;
    ctx.fillRect(0, y0, S, BOARD);
    // Maserung: lange, leicht gewellte Linien (nahtlos: ganze Perioden in x)
    for (let i = 0; i < 26; i++) {
      const y = y0 + 4 + r() * (BOARD - 8);
      const amp = 0.6 + r() * 2.2;
      const k = Math.round(1 + r() * 3);
      const ph = r() * 6.28;
      ctx.strokeStyle = r() > 0.45 ? `rgba(80,48,18,${0.1 + r() * 0.22})` : `rgba(255,236,205,${0.08 + r() * 0.16})`;
      ctx.lineWidth = 0.7 + r() * 1.1;
      ctx.beginPath();
      for (let x = 0; x <= S; x += 8) {
        const yy = y + Math.sin((x / S) * Math.PI * 2 * k + ph) * amp;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
    // Astlöcher
    if (r() > 0.35) {
      const x = r() * S;
      const y = y0 + 24 + r() * (BOARD - 48);
      for (const [rad, a] of [[20, 0.18], [12, 0.34], [5, 0.55]]) {
        ctx.fillStyle = `rgba(58,30,8,${a})`;
        ctx.beginPath(); ctx.ellipse(x, y, rad * 1.5, rad * 0.55, 0, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Fuge (dunkel, mit heller Kante) und Stoßfugen
    ctx.fillStyle = 'rgba(40,22,8,0.55)';
    ctx.fillRect(0, y0, S, 2);
    ctx.fillStyle = 'rgba(255,240,215,0.28)';
    ctx.fillRect(0, y0 + 2, S, 1);
    const jx = Math.floor(r() * S);
    ctx.fillStyle = 'rgba(40,22,8,0.5)';
    ctx.fillRect(jx, y0, 2, BOARD);
  }
  // Abnutzung: Kratzer
  for (let i = 0; i < 30; i++) {
    const x = r() * S;
    const y = r() * S;
    ctx.strokeStyle = 'rgba(255,240,220,0.16)';
    ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 6 + r() * 26, y + (r() - 0.5) * 5); ctx.stroke();
  }
  return c;
}

function wallpaperCanvas() {
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#efe2c4';
  ctx.fillRect(0, 0, S, S);
  // Streifen mit Prägekanten
  for (let x = 0; x < S; x += 64) {
    ctx.fillStyle = 'rgba(160,120,70,0.10)';
    ctx.fillRect(x, 0, 32, S);
    ctx.fillStyle = 'rgba(255,250,235,0.32)';
    ctx.fillRect(x, 0, 2, S);
    ctx.fillStyle = 'rgba(120,85,45,0.16)';
    ctx.fillRect(x + 32, 0, 2, S);
  }
  // Rauten mit Innenzeichnung
  for (let y = 32; y < S; y += 128) {
    for (let x = 32; x < S; x += 64) {
      for (const [s, col] of [[12, 'rgba(150,100,60,0.12)'], [8, 'rgba(255,250,235,0.18)'], [3.4, 'rgba(150,100,60,0.2)']]) {
        ctx.fillStyle = col;
        ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.85, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * 0.85, y); ctx.closePath(); ctx.fill();
      }
      // Ranke zwischen den Rauten
      ctx.strokeStyle = 'rgba(150,100,60,0.12)';
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y + 14); ctx.bezierCurveTo(x - 10, y + 34, x + 10, y + 46, x, y + 64); ctx.stroke();
    }
  }
  // Papierkorn
  const r = rng(909);
  for (let i = 0; i < 5200; i++) {
    ctx.fillStyle = r() > 0.5 ? 'rgba(110,80,40,0.07)' : 'rgba(255,255,255,0.12)';
    ctx.fillRect(r() * S, r() * S, 1.5, 1.5);
  }
  return c;
}

function ceilingCanvas() {
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ece6d6';
  ctx.fillRect(0, 0, S, S);
  const r = rng(5);
  // Akustikplatte: gelochtes Raster mit versetzten Löchern
  for (let y = 24; y < S - 16; y += 14) {
    for (let x = 24 + ((y / 14) % 2) * 7; x < S - 16; x += 14) {
      if (r() < 0.12) continue;
      ctx.fillStyle = 'rgba(70,62,45,0.34)';
      ctx.beginPath(); ctx.arc(x, y, 1.6 + r() * 0.8, 0, Math.PI * 2); ctx.fill();
    }
  }
  for (let i = 0; i < 1400; i++) {
    ctx.fillStyle = 'rgba(80,70,50,0.14)';
    ctx.fillRect(r() * S, r() * S, 1.5, 1.5);
  }
  // Wasserfleck
  const gx = 90 + r() * 330;
  const gy = 90 + r() * 330;
  const g = ctx.createRadialGradient(gx, gy, 4, gx, gy, 70);
  g.addColorStop(0, 'rgba(140,110,60,0.14)');
  g.addColorStop(1, 'rgba(140,110,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(gx - 70, gy - 70, 140, 140);
  // Rand: Doppelnut
  ctx.strokeStyle = 'rgba(90,85,70,0.6)';
  ctx.lineWidth = 7;
  ctx.strokeRect(0, 0, S, S);
  ctx.strokeStyle = 'rgba(255,255,250,0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(6, 6, S - 12, S - 12);
  return c;
}

/** Schlüssel (userData.lfxTex der Basistexturen) → Zeichenfunktion. */
export const ULTRA_TEX = {
  carpet: () => carpetCanvas('blue'),
  carpetRed: () => carpetCanvas('red'),
  carpetKids: () => carpetCanvas('kids'),
  wood: woodCanvas,
  wallpaper: wallpaperCanvas,
  ceiling: ceilingCanvas,
};

/** Erzeugt alle Ultra-Texturen: { key: CanvasTexture }. aniso = Anisotropie. */
export function makeUltraTextures(aniso = 4) {
  const out = {};
  for (const [k, fn] of Object.entries(ULTRA_TEX)) out[k] = toTexture(fn(), { repeat: true, aniso });
  return out;
}
