// VIDEOTHEK LENZ · Ultra-Innenraum (1.19.0): Geometrie der Ultra-Details (Plakate, Kleinkram, Lampen, Staub).
// Jede build…-Funktion liefert { object, update?, dispose } für die Ultra-Registry (engine/ultra.js). Nur Dekor: keine Kollider.
import {
  Group, Mesh, Points, BufferGeometry, Float32BufferAttribute, MeshBasicMaterial, MeshLambertMaterial, ShaderMaterial,
  AdditiveBlending, DoubleSide,
} from 'three';
import { box, quad, merge, disposeTree } from '../util/geo.js';
import { makeCanvas, toTexture, FONT } from './textures.js';
import { CEIL_H } from './layout.js';
import { wallTrimSpans } from './build-room.js';
import {
  POSTER_ART, fitTitle, wrapWords, posterSpots, clutterBoxes, shelfTags, skirtingSpans, lampSpecs, dustPoints,
} from './room-ultra-logic.js';

const PI = Math.PI;
const rgb = (n) => [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];

function starPath(ctx, cx, cy, R) {
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? R * 0.45 : R;
    const a = -PI / 2 + (i * PI) / 5;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath();
}

function wrapLines(ctx, text, maxW) {
  return wrapWords(text.split(' '), (t) => ctx.measureText(t).width, maxW);
}

/** Atlas 1024 × 768: 8 Plakate à 256 × 384 (Fantasietitel, Tagline, Sterne, Rahmen). */
function posterAtlas() {
  const c = makeCanvas(1024, 768);
  const ctx = c.getContext('2d');
  POSTER_ART.forEach((a, i) => {
    const x = (i % 4) * 256;
    const y = Math.floor(i / 4) * 384;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, 256, 384); ctx.clip();
    const g = ctx.createLinearGradient(x, y, x, y + 384);
    g.addColorStop(0, a.c[0]); g.addColorStop(1, a.c[1]);
    ctx.fillStyle = g; ctx.fillRect(x, y, 256, 384);
    // Motiv: Mond/Sonne, Häuserreihe oder Wellen je nach Zelle
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.beginPath(); ctx.arc(x + 128 + (i % 3 - 1) * 40, y + 120, 54, 0, PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    if (i % 2 === 0) {
      for (let k = 0; k < 9; k++) {
        const bw = 22 + ((k * 7 + i) % 5) * 5;
        const bh = 50 + ((k * 37 + i * 11) % 90);
        ctx.fillRect(x + k * 29 - 4, y + 262 - bh, bw, bh + 40);
      }
    } else {
      for (let k = 0; k < 3; k++) {
        ctx.beginPath(); ctx.moveTo(x, y + 270 + k * 22);
        for (let px = 0; px <= 256; px += 16) ctx.lineTo(x + px, y + 262 + k * 22 + Math.sin(px * 0.07 + i + k) * 12);
        ctx.lineTo(x + 256, y + 384); ctx.lineTo(x, y + 384); ctx.closePath(); ctx.fill();
      }
    }
    // Titel
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fff';
    const fit = fitTitle(a.title, 216, (t, px) => { ctx.font = `bold ${px}px ${FONT}`; return ctx.measureText(t).width; });
    ctx.font = `bold ${fit.px}px ${FONT}`;
    const lines = wrapWords(fit.words, (t) => ctx.measureText(t).width, 216);
    const lh = Math.round(fit.px * 1.07);
    const y0 = y + 296 - ((lines.length - 1) * lh) / 2;
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 6;
    lines.forEach((ln, k) => ctx.fillText(ln, x + 128, y0 + k * lh));
    ctx.shadowBlur = 0;
    // Tagline
    ctx.font = `italic 12px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.82)';
    const tl = wrapLines(ctx, a.tag, 214);
    tl.forEach((ln, k) => ctx.fillText(ln, x + 128, y + 344 + k * 14 - (tl.length - 1) * 7));
    // Sterne
    for (let s = 0; s < 5; s++) {
      starPath(ctx, x + 128 + (s - 2) * 22, y + 28, 9);
      ctx.fillStyle = s < a.stars ? '#ffd23f' : 'rgba(255,255,255,0.25)';
      ctx.fill();
    }
    // Rahmen
    ctx.strokeStyle = '#1b1410'; ctx.lineWidth = 14; ctx.strokeRect(x + 2, y + 2, 252, 380);
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 2; ctx.strokeRect(x + 11, y + 11, 234, 362);
    ctx.restore();
  });
  return c;
}

/** 'posters': gemergte Plakate, 1 Mesh + 1 Atlas-Textur. */
export function buildPosters(layout, o = {}) {
  const group = new Group();
  group.name = 'ultra-posters';
  let tex = null;
  let mesh = null;
  const parts = posterSpots(layout).map((p) => {
    const col = p.cell % 4;
    const row = Math.floor(p.cell / 4);
    const u0 = col * 0.25;
    const v1 = 1 - row * 0.5;
    return quad({ w: p.w, h: p.h, x: p.x, y: p.y, z: p.z, ry: p.ry, uv: [u0, v1 - 0.5, u0 + 0.25, v1] });
  });
  const mat = new MeshLambertMaterial({ vertexColors: true });
  if (parts.length) {
    mesh = new Mesh(merge(parts), mat);
    mesh.visible = false; // erst mit dem Atlas zeigen (Teilschritt more()), sonst blitzen kurz weiße Flächen
    group.add(mesh);
  }
  let done = false;
  return {
    object: group,
    /** Teilschritt (engine/ultra.js): der Plakat-Atlas (Canvas) ist der teure Teil und kommt in einem eigenen Häppchen. */
    more() {
      if (done) return false;
      done = true;
      tex = toTexture(posterAtlas(), { aniso: o.aniso || 4 });
      mat.map = tex;
      mat.needsUpdate = true;
      if (mesh) mesh.visible = true;
      return false;
    },
    get textures() { return tex ? [tex] : []; },
    dispose() { disposeTree(group); mat.dispose(); if (tex) tex.dispose(); },
  };
}

/** 'clutter': Tresen-Kleinkram, Preisschilder/Genre-Leisten, Sockelleisten, Fußmatte – 1 Mesh. */
export function buildClutter(layout) {
  const group = new Group();
  group.name = 'ultra-clutter';
  const parts = [];
  for (const b of clutterBoxes(layout)) parts.push(box({ w: b.w, h: b.h, d: b.d, x: b.x, y: b.y, z: b.z, rx: b.rx || 0, color: b.color }));
  for (const t of shelfTags(layout)) parts.push(quad({ w: t.w, h: t.h, x: t.x, y: t.y, z: t.z, ry: t.ry, color: rgb(t.color) }));
  for (const s of skirtingSpans(layout, wallTrimSpans)) parts.push(box({ w: s.w, h: 0.12, d: s.d, x: s.x, y: 0.06, z: s.z, color: [0.27, 0.18, 0.11] }));
  if (parts.length) group.add(new Mesh(merge(parts), new MeshLambertMaterial({ vertexColors: true })));
  return { object: group, dispose() { disposeTree(group); } };
}

function haloCanvas() {
  const c = makeCanvas(64, 64);
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.35, 'rgba(255,255,255,0.3)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  return c;
}

/** 'lamps': Leuchtstreifen + Neonröhre (Basic, emissive) und additive Halo-Quads – 2 Meshes. */
export function buildLamps(layout) {
  const group = new Group();
  group.name = 'ultra-lamps';
  const sp = lampSpecs(layout);
  const bars = [];
  for (const s of sp.strips) bars.push(box({ w: s.w, h: s.h, d: s.d, x: s.x, y: s.y, z: s.z, color: [1, 0.96, 0.82] }));
  const n = sp.neon;
  const nx = (n.x0 + n.x1) / 2;
  bars.push(box({ w: n.x1 - n.x0, h: 0.04, d: 0.04, x: nx, y: n.y, z: n.z, color: [1, 0.45, 0.78] }));
  for (const x of [n.x0 + 0.1, n.x1 - 0.1]) bars.push(box({ w: 0.012, h: CEIL_H - n.y, d: 0.012, x, y: n.y + (CEIL_H - n.y) / 2, z: n.z, color: [0.35, 0.36, 0.4] }));
  group.add(new Mesh(merge(bars), new MeshBasicMaterial({ vertexColors: true, toneMapped: false })));
  const halos = [];
  const warm = [0.3, 0.25, 0.17];
  for (const h of sp.halos) halos.push(quad({ w: h.w, h: h.d, x: h.x, y: h.y, z: h.z, rx: PI / 2, color: warm }));
  halos.push(quad({ w: n.x1 - n.x0 + 1.2, h: 1.1, x: nx, y: n.y - 0.1, z: n.z, color: [0.5, 0.1, 0.28] }));
  const tex = toTexture(haloCanvas(), { aniso: 1, mips: false });
  const hm = new MeshBasicMaterial({ map: tex, vertexColors: true, transparent: true, blending: AdditiveBlending, depthWrite: false, side: DoubleSide, forceSinglePass: true }); // forceSinglePass: sonst 2 Durchgänge (doppelseitig + transparent)
  const hmesh = new Mesh(merge(halos), hm);
  hmesh.renderOrder = 7;
  group.add(hmesh);
  return { object: group, dispose() { disposeTree(group); tex.dispose(); } };
}

const DUST_VS = `
uniform float uTime; uniform float uPx;
attribute vec2 aPS;
varying float vA;
void main() {
  float t = uTime * aPS.y + aPS.x;
  vec3 p = position + vec3(sin(t * 0.9) * 0.18, sin(t * 0.6 + 1.7) * 0.12, cos(t * 0.8) * 0.18);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uPx * 0.012 / max(0.2, -mv.z), 1.5, 6.0);
  vA = 0.35 + 0.35 * sin(t * 1.3);
}`;
const DUST_FS = `
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  float a = (1.0 - smoothstep(0.2, 1.0, d)) * vA * 0.55;
  if (a < 0.01) discard;
  gl_FragColor = vec4(1.0, 0.93, 0.8, a);
}`;

/** 'dust': ~200 Staubpunkte (1 Points-Draw-Call); Bewegung nur über die Shader-Zeit, Reduced-Motion → statisch. */
export function buildDust(layout, ctx, n = 200) {
  const pts = dustPoints(layout, n);
  const pos = new Float32Array(pts.length * 3);
  const ps = new Float32Array(pts.length * 2);
  pts.forEach((p, i) => { pos.set([p.x, p.y, p.z], i * 3); ps.set([p.ph, p.sp], i * 2); });
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  g.setAttribute('aPS', new Float32BufferAttribute(ps, 2));
  const m = new ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPx: { value: 1000 } },
    vertexShader: DUST_VS, fragmentShader: DUST_FS, transparent: true, depthWrite: false, blending: AdditiveBlending,
  });
  const obj = new Points(g, m);
  obj.name = 'ultra-dust';
  obj.frustumCulled = false;
  // Reduced-Motion: beim Bau lesen UND auf Änderungen der Systemeinstellung hören (Listener wird in dispose entfernt).
  let mq = null;
  try { mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null; } catch { mq = null; }
  let still = !!(mq && mq.matches);
  const onMq = (e) => { still = !!(e && typeof e.matches === 'boolean' ? e.matches : mq && mq.matches); };
  if (mq) { try { if (mq.addEventListener) mq.addEventListener('change', onMq); else if (mq.addListener) mq.addListener(onMq); } catch { /* egal */ } }
  return {
    object: obj,
    get still() { return still; },
    update(dt, t) {
      if (!still) m.uniforms.uTime.value = t;
      try {
        const h = (ctx && ctx.renderer && ctx.renderer.domElement && ctx.renderer.domElement.height) || 1000;
        const fov = (ctx && ctx.camera && ctx.camera.fov) || 70;
        m.uniforms.uPx.value = h / (2 * Math.tan((fov * PI) / 360));
      } catch { /* egal */ }
    },
    dispose() {
      if (mq) { try { if (mq.removeEventListener) mq.removeEventListener('change', onMq); else if (mq.removeListener) mq.removeListener(onMq); } catch { /* egal */ } }
      g.dispose(); m.dispose();
    },
  };
}
