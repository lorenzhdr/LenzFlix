// VIDEOTHEK LENZ · Ausstattung: Kassentresen mit Kassen-PC, Poster, Pappaufsteller, Vorhang, Personaltür.
import { Group, Mesh, MeshBasicMaterial, MeshLambertMaterial, DoubleSide } from 'three';
import { box, quad, merge, hex, rng, disposeTree } from '../util/geo.js';
import { makeCanvas, toTexture, FONT } from './textures.js';

const PI = Math.PI;
const POSTERS = [
  ['ZEITSPRUNG', ['#1b1f5e', '#e84a5f']], ['MITTERNACHTSZUG', ['#0b1a2e', '#2ec4b6']], ['DER LETZTE SOMMER', ['#f7b267', '#f25c54']],
  ['KOMETENJÄGER', ['#10002b', '#7b2cbf']], ['SCHATTENBOXER', ['#222', '#ff9f1c']], ['PIRATENBUCHT', ['#0a4d68', '#f6d55c']],
  ['STILLE STADT', ['#2d3142', '#bfc0c0']], ['TURBO TANTE', ['#ff006e', '#ffbe0b']],
];

function posterAtlas() {
  const c = makeCanvas(1024, 768);
  const ctx = c.getContext('2d');
  POSTERS.forEach(([title, [a, b]], i) => {
    const x = (i % 4) * 256;
    const y = Math.floor(i / 4) * 384;
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, 256, 384); ctx.clip();
    const g = ctx.createLinearGradient(x, y, x, y + 384);
    g.addColorStop(0, a); g.addColorStop(1, b);
    ctx.fillStyle = g; ctx.fillRect(x, y, 256, 384);
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    const r = rng(i + 9);
    const m = i % 4;
    if (m === 0) { ctx.beginPath(); ctx.arc(x + 128, y + 130, 62, 0, PI * 2); ctx.fill(); }
    for (let k = 0; k < 4; k++) {
      ctx.fillStyle = `rgba(0,0,0,${0.12 + k * 0.08})`;
      ctx.beginPath();
      ctx.moveTo(x - 10, y + 300);
      for (let px = 0; px <= 276; px += 30) ctx.lineTo(x + px - 10, y + 250 + k * 18 - r() * 60);
      ctx.lineTo(x + 270, y + 384); ctx.lineTo(x - 10, y + 384); ctx.closePath(); ctx.fill();
    }
    if (m === 1) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      for (let k = 0; k < 14; k++) ctx.fillRect(x + r() * 240, y + r() * 150, 2, 2);
    }
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center';
    ctx.font = `bold 30px ${FONT}`;
    const words = title.split(' ');
    words.forEach((w, k) => ctx.fillText(w, x + 128, y + 312 + k * 32 - (words.length - 1) * 16));
    ctx.font = `12px ${FONT}`;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText('JETZT AUF VIDEO', x + 128, y + 368);
    ctx.restore();
  });
  return c;
}

function starCanvas(text, sub, c1, c2) {
  const c = makeCanvas(256, 384);
  const ctx = c.getContext('2d');
  ctx.translate(128, 150);
  ctx.beginPath();
  for (let i = 0; i < 32; i++) {
    const rad = i % 2 ? 98 : 122;
    const a = (i / 32) * PI * 2;
    ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
  }
  ctx.closePath();
  ctx.fillStyle = c1; ctx.fill();
  ctx.lineWidth = 8; ctx.strokeStyle = '#fff'; ctx.stroke();
  ctx.save(); ctx.rotate(-0.14);
  ctx.fillStyle = c2; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold 62px ${FONT}`; ctx.fillText(text, 0, -6);
  ctx.font = `bold 20px ${FONT}`; ctx.fillText(sub, 0, 46);
  ctx.restore();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  // Füße (Pappe)
  ctx.fillStyle = '#c8a06a'; ctx.fillRect(100, 270, 56, 114);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 6; ctx.strokeRect(100, 270, 56, 114);
  return c;
}

function popcornCanvas() {
  const c = makeCanvas(256, 384);
  const ctx = c.getContext('2d');
  const r = rng(5);
  for (let i = 0; i < 28; i++) {
    ctx.fillStyle = i % 3 ? '#fff4c2' : '#ffe08a';
    ctx.beginPath(); ctx.arc(60 + r() * 140, 70 + r() * 60, 20 + r() * 10, 0, PI * 2); ctx.fill();
  }
  ctx.beginPath(); ctx.moveTo(48, 130); ctx.lineTo(208, 130); ctx.lineTo(182, 360); ctx.lineTo(74, 360); ctx.closePath();
  ctx.fillStyle = '#fff'; ctx.fill();
  ctx.save(); ctx.clip();
  ctx.fillStyle = '#e63946';
  for (let x = 40; x < 220; x += 44) ctx.fillRect(x, 120, 22, 250);
  ctx.restore();
  ctx.lineWidth = 7; ctx.strokeStyle = '#fff';
  ctx.beginPath(); ctx.moveTo(48, 130); ctx.lineTo(208, 130); ctx.lineTo(182, 360); ctx.lineTo(74, 360); ctx.closePath(); ctx.stroke();
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `bold 34px ${FONT}`;
  ctx.fillStyle = '#1d3557'; ctx.fillRect(62, 200, 132, 56);
  ctx.fillStyle = '#ffd400'; ctx.fillText('KINO', 128, 240);
  return c;
}

function screenCanvas() {
  const c = makeCanvas(256, 192);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#06210f'; ctx.fillRect(0, 0, 256, 192);
  ctx.fillStyle = '#58ff8a'; ctx.font = 'bold 18px "Courier New",monospace';
  ctx.fillText('VIDEOTHEK LENZ', 16, 34);
  ctx.fillText('KASSE · FILMSUCHE', 16, 62);
  ctx.fillText('TITEL EINGEBEN:', 16, 108);
  ctx.fillText('> _', 16, 136);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  for (let y = 0; y < 192; y += 3) ctx.fillRect(0, y, 256, 1);
  return c;
}

function plateCanvas(text) {
  const c = makeCanvas(256, 64);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#e8e8e8'; ctx.fillRect(0, 0, 256, 64);
  ctx.fillStyle = '#b3261e'; ctx.fillRect(0, 0, 256, 8);
  ctx.fillStyle = '#222'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `bold 30px ${FONT}`; ctx.fillText(text, 128, 38);
  return c;
}

export function buildProps(layout, preset) {
  const group = new Group();
  group.name = 'props';
  const textures = [];
  const T = (canvas, o) => { const t = toTexture(canvas, { aniso: Math.min(4, preset.anisotropy), ...o }); textures.push(t); return t; };
  const solid = [];
  const { w: W, d: D } = layout;
  const cn = layout.counter;

  // --- Kassentresen ---
  const cw = cn.x1 - cn.x0;
  solid.push(box({ w: cw, h: 1.05, d: cn.z1 - cn.z0, x: (cn.x0 + cn.x1) / 2, y: 0.525, z: (cn.z0 + cn.z1) / 2, color: hex('#2a6f86') }));
  solid.push(box({ w: cw + 0.06, h: 0.05, d: cn.z1 - cn.z0 + 0.1, x: (cn.x0 + cn.x1) / 2, y: 1.075, z: (cn.z0 + cn.z1) / 2 - 0.02, color: [0.28, 0.17, 0.1] }));
  solid.push(box({ w: 0.1, h: 1.05, d: D - (cn.z1), x: cn.x0 - 0.05, y: 0.525, z: (cn.z1 + D) / 2, color: hex('#2a6f86') }));
  // Kassen-PC (Bildschirm zeigt nach Norden zu den Kunden)
  const pcx = layout.pc.x;
  const pcz = (cn.z0 + cn.z1) / 2;
  solid.push(box({ w: 0.44, h: 0.38, d: 0.4, x: pcx, y: 1.1 + 0.25, z: pcz, color: [0.86, 0.83, 0.72] }));
  solid.push(box({ w: 0.16, h: 0.1, d: 0.2, x: pcx, y: 1.1 + 0.03, z: pcz, color: [0.8, 0.77, 0.68] }));
  solid.push(box({ w: 0.42, h: 0.025, d: 0.15, x: pcx, y: 1.1 + 0.015, z: cn.z0 + 0.12, color: [0.8, 0.77, 0.68] }));
  solid.push(box({ w: 0.36, h: 0.14, d: 0.3, x: W - 1.8, y: 1.1 + 0.07, z: pcz, color: [0.25, 0.25, 0.28] }));
  solid.push(box({ w: 0.2, h: 0.1, d: 0.08, x: W - 1.8, y: 1.1 + 0.2, z: pcz + 0.08, color: [0.25, 0.25, 0.28], rx: -0.4 }));
  // Personaltür (Nordwand, zwischen Kinder-Ecke und Ab-18-Raum)
  const st = layout.zones.staff;
  solid.push(box({ w: 1.0, h: 2.1, d: 0.06, x: st.x, y: 1.05, z: 0.04, color: [0.32, 0.34, 0.38] }));
  solid.push(box({ w: 0.04, h: 0.04, d: 0.06, x: st.x + 0.38, y: 1.0, z: 0.1, color: [0.8, 0.8, 0.8] }));
  // Vorhang zum Ab-18-Raum
  if (layout.adultDoor) {
    const ad = layout.adultDoor;
    const gap = ad.x1 - ad.x0;
    const n = 9;
    for (let i = 0; i < n; i++) {
      const sw = gap / n + 0.03;
      const sh = 0.8 + 0.2 * (i % 3);
      solid.push(box({ w: sw, h: 2.3, d: 0.05, x: ad.x0 + (i + 0.5) * (gap / n), y: 1.15, z: layout.adultRoom.z1 - 0.06 + (i % 2) * 0.04, color: [0.5 * sh, 0.07 * sh, 0.12 * sh] }));
    }
    solid.push(box({ w: gap + 0.15, h: 0.04, d: 0.06, x: (ad.x0 + ad.x1) / 2, y: 2.34, z: layout.adultRoom.z1 - 0.06, color: [0.7, 0.7, 0.72] }));
  }
  group.add(new Mesh(merge(solid), new MeshLambertMaterial({ vertexColors: true })));

  // Monitor-Bildschirm (leuchtet, unbeleuchtet)
  const screen = new Mesh(quad({ w: 0.32, h: 0.25, x: pcx, y: 1.1 + 0.27, z: pcz - 0.205, ry: PI }), new MeshBasicMaterial({ map: T(screenCanvas()), toneMapped: false }));
  group.add(screen);
  // LED-Band an der Tresenfront
  const led = new Mesh(box({ w: cw, h: 0.04, d: 0.015, x: (cn.x0 + cn.x1) / 2, y: 0.9, z: cn.z0 - 0.007, color: [1, 1, 1] }), new MeshBasicMaterial({ color: 0xff4fa3, toneMapped: false }));
  group.add(led);
  const plate = new Mesh(quad({ w: 0.7, h: 0.175, x: st.x, y: 2.0, z: 0.075 }), new MeshBasicMaterial({ map: T(plateCanvas('NUR PERSONAL')) }));
  group.add(plate);

  // --- Poster ---
  const atlas = T(posterAtlas());
  const pw = 0.75;
  const ph = 1.1;
  const pg = [];
  const frames = [];
  const hang = (x, z, ry, i) => {
    const cx = (i % 4) * 0.25;
    const cy = Math.floor(i / 4) * 0.5;
    const nx = Math.sin(ry);
    const nz = Math.cos(ry);
    pg.push(quad({ w: pw, h: ph, x: x + nx * 0.03, y: 1.65, z: z + nz * 0.03, ry, uv: [cx, 0.5 - cy, cx + 0.25, 1 - cy] }));
    frames.push(box({ w: pw + 0.08, h: ph + 0.08, d: 0.03, x: x + nx * 0.012, y: 1.65, z: z + nz * 0.012, ry, color: [0.1, 0.1, 0.12] }));
  };
  let pi = 0;
  for (let x = 1.6; x < W - 1.2; x += 2.4) {
    if (Math.abs(x - st.x) < 1.3) continue;
    hang(x, 0, 0, pi++ % 8);
  }
  for (let z = D - 4.8; z < D - 0.9; z += 1.8) hang(0, z, PI / 2, pi++ % 8);
  hang(W, D - 4.4, -PI / 2, pi % 8);
  if (pg.length) {
    group.add(new Mesh(merge(pg), new MeshLambertMaterial({ map: atlas, vertexColors: true })));
    group.add(new Mesh(merge(frames), new MeshLambertMaterial({ vertexColors: true })));
  }

  // --- Pappaufsteller ---
  const standee = (canvas, x, z, ry, w = 0.75) => {
    const m = new Mesh(quad({ w, h: w * 1.5 }), new MeshLambertMaterial({ map: T(canvas), alphaTest: 0.5, side: DoubleSide }));
    m.position.set(x, (w * 1.5) / 2, z);
    m.rotation.y = ry;
    group.add(m);
  };
  standee(starCanvas('NEU!', 'FRISCH IM REGAL', '#ffd400', '#d6001c'), 1.35, D - 4.6, 0.35);
  if (layout.kidsRoom) standee(popcornCanvas(), layout.kidsRoom.x1 - 0.7, layout.band - 0.7, -0.2, 0.7);

  return { group, screen, dispose() { disposeTree(group); textures.forEach((t) => t.dispose()); } };
}
