// VIDEOTHEK LENZ · prozedurale Canvas-Texturen (Teppich, Holz, Tapete, Decke, Glow, Nachthimmel).
import { CanvasTexture, SRGBColorSpace, RepeatWrapping, LinearFilter, LinearMipmapLinearFilter } from 'three';
import { rng } from '../util/geo.js';

export const FONT = '"Arial Black","Impact","Avenir Next Condensed","Helvetica Neue",Arial,sans-serif';

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function toTexture(canvas, { repeat = false, aniso = 1, mips = true, srgb = true } = {}) {
  const t = new CanvasTexture(canvas);
  if (srgb) t.colorSpace = SRGBColorSpace;
  if (repeat) { t.wrapS = RepeatWrapping; t.wrapT = RepeatWrapping; }
  t.anisotropy = aniso;
  t.generateMipmaps = mips;
  t.minFilter = mips ? LinearMipmapLinearFilter : LinearFilter;
  return t;
}

// Zeichnet `fn` neunmal versetzt, damit die Textur nahtlos kachelt.
function tiled(ctx, size, fn) {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) {
      ctx.save();
      ctx.translate(dx, dy);
      fn();
      ctx.restore();
    }
  }
}

const CARPETS = {
  blue: { base: '#16327a', motifs: ['#2ec4b6', '#d6336c', '#ffd166', '#6f8cff'], speck: 'rgba(255,255,255,0.05)' },
  red: { base: '#4a1522', motifs: ['#c9a227', '#7a2236', '#2b1b3a', '#a6483c'], speck: 'rgba(255,220,200,0.05)' },
  kids: { base: '#2b6cb8', motifs: ['#ffd23f', '#ff5d73', '#3ddc97', '#ffffff'], speck: 'rgba(255,255,255,0.07)' },
};

function carpetCanvas(kind) {
  const P = CARPETS[kind] || CARPETS.blue;
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = P.base;
  ctx.fillRect(0, 0, S, S);
  // Kachel-Motive (90er-Konfetti: Dreiecke, Kringel, Punkte, Zickzack)
  tiled(ctx, S, () => {
    const r = rng(kind.length * 977 + 13);
    for (let i = 0; i < 26; i++) {
      const x = r() * S;
      const y = r() * S;
      const col = P.motifs[Math.floor(r() * P.motifs.length)];
      const a = r() * Math.PI * 2;
      const s = 5 + r() * 9;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = col;
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.85;
      const t = Math.floor(r() * 4);
      if (t === 0) {
        ctx.beginPath(); ctx.moveTo(0, -s); ctx.lineTo(s, s * 0.8); ctx.lineTo(-s, s * 0.8); ctx.closePath(); ctx.fill();
      } else if (t === 1) {
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.arc(0, 0, s * 0.7, 0, Math.PI * 1.6); ctx.stroke();
      } else if (t === 2) {
        ctx.beginPath(); ctx.arc(0, 0, s * 0.4, 0, Math.PI * 2); ctx.fill();
      } else {
        ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(-s / 2, -s / 2); ctx.lineTo(0, 0); ctx.lineTo(s / 2, -s / 2); ctx.lineTo(s, 0); ctx.stroke();
      }
      ctx.restore();
    }
  });
  // Faser-Rauschen
  const r2 = rng(4242);
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = r2() > 0.5 ? P.speck : 'rgba(0,0,0,0.06)';
    ctx.fillRect(r2() * S, r2() * S, 1.5, 1.5);
  }
  return c;
}

function woodCanvas() {
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#c9a26c';
  ctx.fillRect(0, 0, S, S);
  const r = rng(77);
  for (let y = 0; y < S; y += 1) {
    const a = 0.04 + r() * 0.1;
    ctx.fillStyle = r() > 0.5 ? `rgba(90,55,20,${a})` : `rgba(255,235,200,${a * 0.8})`;
    ctx.fillRect(0, y, S, 1 + (r() > 0.85 ? 1 : 0));
  }
  for (let i = 0; i < 5; i++) {
    const y = r() * S;
    ctx.strokeStyle = 'rgba(70,40,15,0.25)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= S; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 3);
    ctx.stroke();
  }
  for (let i = 0; i < 3; i++) {
    const x = r() * S;
    const y = r() * S;
    const g = ctx.createRadialGradient(x, y, 1, x, y, 10);
    g.addColorStop(0, 'rgba(60,32,10,0.55)');
    g.addColorStop(1, 'rgba(60,32,10,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, 14, 6, 0, 0, Math.PI * 2); ctx.fill();
  }
  return c;
}

function wallpaperCanvas() {
  const S = 256;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#efe2c4';
  ctx.fillRect(0, 0, S, S);
  for (let x = 0; x < S; x += 32) {
    ctx.fillStyle = 'rgba(160,120,70,0.10)';
    ctx.fillRect(x, 0, 16, S);
  }
  ctx.fillStyle = 'rgba(150,100,60,0.10)';
  for (let y = 16; y < S; y += 64) {
    for (let x = 16; x < S; x += 32) {
      ctx.beginPath(); ctx.moveTo(x, y - 6); ctx.lineTo(x + 5, y); ctx.lineTo(x, y + 6); ctx.lineTo(x - 5, y); ctx.closePath(); ctx.fill();
    }
  }
  return c;
}

function ceilingCanvas() {
  const S = 128;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ece6d6';
  ctx.fillRect(0, 0, S, S);
  const r = rng(5);
  for (let i = 0; i < 260; i++) {
    ctx.fillStyle = 'rgba(80,70,50,0.16)';
    ctx.fillRect(r() * S, r() * S, 1.5, 1.5);
  }
  ctx.strokeStyle = 'rgba(90,85,70,0.55)';
  ctx.lineWidth = 3;
  ctx.strokeRect(0, 0, S, S);
  return c;
}

function glowCanvas() {
  const S = 128;
  const c = makeCanvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return c;
}

function nightCanvas() {
  const W = 1024;
  const H = 256;
  const c = makeCanvas(W, H);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#070a1c');
  g.addColorStop(0.6, '#16204a');
  g.addColorStop(1, '#2a2f5c');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  const r = rng(321);
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.2 + r() * 0.5})`;
    ctx.fillRect(r() * W, r() * H * 0.5, 1.5, 1.5);
  }
  // Häuserreihe mit erleuchteten Fenstern
  for (let x = 0; x < W; x += 70 + r() * 40) {
    const w = 60 + r() * 50;
    const h = 70 + r() * 110;
    ctx.fillStyle = '#0c1030';
    ctx.fillRect(x, H - h, w, h);
    for (let wy = H - h + 10; wy < H - 14; wy += 18) {
      for (let wx = x + 8; wx < x + w - 10; wx += 16) {
        if (r() > 0.55) { ctx.fillStyle = r() > 0.5 ? '#ffd27a' : '#9fd0ff'; ctx.fillRect(wx, wy, 8, 10); }
      }
    }
  }
  // Laternen
  for (const x of [140, 420, 700, 930]) {
    const gl = ctx.createRadialGradient(x, H - 150, 0, x, H - 150, 60);
    gl.addColorStop(0, 'rgba(255,220,150,0.8)');
    gl.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(x - 60, H - 210, 120, 120);
    ctx.fillStyle = '#05060f';
    ctx.fillRect(x - 2, H - 150, 4, 150);
  }
  return c;
}

/** Erzeugt alle statischen Welt-Texturen. `dispose()` gibt sie frei. */
export function makeTextures(preset) {
  const aniso = preset.anisotropy;
  const t = {
    carpet: toTexture(carpetCanvas('blue'), { repeat: true, aniso }),
    carpetRed: toTexture(carpetCanvas('red'), { repeat: true, aniso }),
    carpetKids: toTexture(carpetCanvas('kids'), { repeat: true, aniso }),
    wood: toTexture(woodCanvas(), { repeat: true, aniso }),
    wallpaper: toTexture(wallpaperCanvas(), { repeat: true, aniso }),
    ceiling: toTexture(ceilingCanvas(), { repeat: true, aniso }),
    glow: toTexture(glowCanvas(), { aniso: 1, mips: false }),
    night: toTexture(nightCanvas(), { aniso: 1, mips: false }),
  };
  t.setAnisotropy = (n) => { for (const k of ['carpet', 'carpetRed', 'carpetKids', 'wood', 'wallpaper', 'ceiling']) t[k].anisotropy = n; };
  t.dispose = () => { for (const k of Object.keys(t)) if (t[k] && t[k].isTexture) t[k].dispose(); };
  return t;
}
