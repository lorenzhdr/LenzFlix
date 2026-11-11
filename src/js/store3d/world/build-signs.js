// VIDEOTHEK LENZ · Neonröhren-Schilder je Abteilung. Beschriftungen liegen in Atlas-Seiten (16 Schilder je 1024²),
// pro Seite ein Neon-Mesh (additiv) – dazu Tafeln und Aufhängungen in einem Trim-Mesh.
import { Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, AdditiveBlending } from 'three';
import { box, quad, merge, hex, disposeTree } from '../util/geo.js';
import { makeCanvas, toTexture, FONT } from './textures.js';
import { CEIL_H } from './layout.js';

const TILE_W = 512;
const TILE_H = 128;
const PER_PAGE = 16;

function rgba(c, a) {
  const [r, g, b] = hex(c);
  return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
}

function drawNeon(ctx, x, y, text, color) {
  ctx.save();
  ctx.translate(x, y);
  // Rahmen
  const rr = (ins) => {
    const r = 18;
    const w = TILE_W - ins * 2;
    const h = TILE_H - ins * 2;
    ctx.beginPath();
    ctx.moveTo(ins + r, ins); ctx.lineTo(ins + w - r, ins); ctx.quadraticCurveTo(ins + w, ins, ins + w, ins + r);
    ctx.lineTo(ins + w, ins + h - r); ctx.quadraticCurveTo(ins + w, ins + h, ins + w - r, ins + h);
    ctx.lineTo(ins + r, ins + h); ctx.quadraticCurveTo(ins, ins + h, ins, ins + h - r);
    ctx.lineTo(ins, ins + r); ctx.quadraticCurveTo(ins, ins, ins + r, ins);
    ctx.closePath();
  };
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const passes = [[10, 26, rgba(color, 0.55)], [5, 14, color], [2, 0, 'rgba(255,255,255,0.9)']];
  for (const [lw, blur, col] of passes) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    rr(10);
    ctx.stroke();
  }
  // Schrift als Neonkontur
  let size = 78;
  ctx.font = `bold ${size}px ${FONT}`;
  const maxW = TILE_W - 70;
  const w0 = ctx.measureText(text).width;
  if (w0 > maxW) { size = Math.max(24, Math.floor((size * maxW) / w0)); ctx.font = `bold ${size}px ${FONT}`; }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const [lw, blur, col] of passes) {
    ctx.shadowColor = color;
    ctx.shadowBlur = blur;
    ctx.strokeStyle = col;
    ctx.lineWidth = lw * 0.7;
    ctx.strokeText(text, TILE_W / 2, TILE_H / 2 + 4);
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = rgba(color, 0.18);
  ctx.fillText(text, TILE_W / 2, TILE_H / 2 + 4);
  ctx.restore();
}

export function buildSigns(layout, preset) {
  const group = new Group();
  group.name = 'signs';
  const textures = [];
  const trim = [];
  const pages = Math.ceil(layout.signs.length / PER_PAGE);
  const pageGeoms = Array.from({ length: pages }, () => []);

  layout.signs.forEach((sg, i) => {
    const page = Math.floor(i / PER_PAGE);
    const k = i % PER_PAGE;
    sg._page = page;
    sg._tile = k;
    const h = sg.w / 4;
    sg.h = h;
    const u0 = ((k % 2) * TILE_W) / 1024;
    const u1 = u0 + TILE_W / 1024;
    const vTop = 1 - (Math.floor(k / 2) * TILE_H) / 1024;
    const v1 = vTop;
    const v0 = vTop - TILE_H / 1024;
    const rot = sg.yaw;
    // Tafel (dunkel) + Neon-Ebenen vorn/hinten
    trim.push(box({ w: sg.w + 0.12, h: h + 0.1, d: 0.05, x: sg.x, y: sg.y, z: sg.z, ry: rot, color: [0.05, 0.05, 0.07] }));
    const nx = Math.sin(rot);
    const nz = Math.cos(rot);
    const off = 0.03;
    pageGeoms[page].push(quad({ w: sg.w, h, x: sg.x + nx * off, y: sg.y, z: sg.z + nz * off, ry: rot, uv: [u0, v0, u1, v1] }));
    if (sg.kind === 'hang' || sg.kind === 'top') {
      pageGeoms[page].push(quad({ w: sg.w, h, x: sg.x - nx * off, y: sg.y, z: sg.z - nz * off, ry: rot + Math.PI, uv: [u0, v0, u1, v1] }));
      const rodH = CEIL_H - (sg.y + h / 2);
      for (const sx of sg.kind === 'top' ? [] : [-0.36, 0.36]) {
        const lx = sx * sg.w;
        trim.push(box({ w: 0.015, h: rodH, d: 0.015, x: sg.x + Math.cos(rot) * lx, y: sg.y + h / 2 + rodH / 2, z: sg.z - Math.sin(rot) * lx, color: [0.6, 0.62, 0.66] }));
      }
    }
  });

  const textureOf = (page) => {
    const c = makeCanvas(1024, 1024);
    const ctx = c.getContext('2d');
    layout.signs.forEach((sg) => {
      if (sg._page !== page) return;
      drawNeon(ctx, (sg._tile % 2) * TILE_W, Math.floor(sg._tile / 2) * TILE_H, sg.text.toUpperCase(), sg.color);
    });
    const t = toTexture(c, { aniso: Math.min(4, preset.anisotropy), mips: preset.signMips });
    textures.push(t);
    return t;
  };
  pageGeoms.forEach((geoms, page) => {
    if (!geoms.length) return;
    const mat = new MeshBasicMaterial({
      map: textureOf(page), transparent: true, blending: AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    const mesh = new Mesh(merge(geoms), mat);
    mesh.renderOrder = 4;
    group.add(mesh);
  });
  if (trim.length) group.add(new Mesh(merge(trim), new MeshLambertMaterial({ vertexColors: true })));
  return { group, dispose() { disposeTree(group); textures.forEach((t) => t.dispose()); } };
}
