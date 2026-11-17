// VIDEOTHEK LENZ · Fassade des Ladens von außen (dauerhaft, Eigentümer: Modul `city`): Verkleidung mit Öffnungen, Leuchtschild,
// Öffnungszeiten und optional der Rollladen (nur wenn ein Intro folgt). Vorher nur im Intro (modules/outdoor.js addFacade).
// Die Nachbarhäuser sind jetzt echte Gebäude (world/build-city.js). Rückgabe: { group, shutter, signMat, setShutter(0..1),
// dropShutter(), flicker(t), openAmount, dispose() }.
import { Group, Mesh, MeshBasicMaterial, PlaneGeometry } from 'three';
import { box, merge, hex, disposeTree } from '../util/geo.js';
import { makeCanvas, toTexture, FONT } from './textures.js';

const WALL_OUT = 0.12; // Außenkante der Südwand (WALL_T)

function shutterCanvas() {
  const c = makeCanvas(64, 128);
  const x = c.getContext('2d');
  for (let i = 0; i < 8; i++) {
    const y = i * 16;
    x.fillStyle = '#7f8b98'; x.fillRect(0, y, 64, 16);
    x.fillStyle = '#a7b2bf'; x.fillRect(0, y, 64, 4);
    x.fillStyle = '#566170'; x.fillRect(0, y + 12, 64, 4);
  }
  return c;
}

function signCanvas() {
  const c = makeCanvas(1024, 256);
  const x = c.getContext('2d');
  x.fillStyle = '#0b0f2c'; x.fillRect(0, 0, 1024, 256);
  x.strokeStyle = '#ff3d7f'; x.lineWidth = 8; x.shadowColor = '#ff3d7f'; x.shadowBlur = 18;
  x.beginPath(); x.roundRect ? x.roundRect(14, 14, 996, 228, 28) : x.rect(14, 14, 996, 228); x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  let px = 118;
  x.font = `bold ${px}px ${FONT}`;
  while (x.measureText('VIDEOTHEK LENZ').width > 900 && px > 40) { px -= 4; x.font = `bold ${px}px ${FONT}`; }
  x.shadowColor = '#35e6ff'; x.shadowBlur = 36; x.fillStyle = '#35e6ff';
  x.fillText('VIDEOTHEK LENZ', 512, 108);
  x.shadowBlur = 14; x.fillStyle = '#d9fbff';
  x.fillText('VIDEOTHEK LENZ', 512, 108);
  x.font = `bold 46px ${FONT}`;
  x.shadowColor = '#ffd23f'; x.shadowBlur = 22; x.fillStyle = '#ffd23f';
  x.fillText('Verleih & Verkauf', 512, 200);
  return c;
}

function hoursCanvas() {
  const c = makeCanvas(160, 240);
  const x = c.getContext('2d');
  x.fillStyle = '#f3ead2'; x.fillRect(0, 0, 160, 240);
  x.fillStyle = '#12163a'; x.fillRect(0, 0, 160, 36);
  x.fillStyle = '#ffd23f'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `bold 17px ${FONT}`; x.fillText('ÖFFNUNGSZEITEN', 80, 19);
  x.fillStyle = '#222';
  x.font = `bold 20px ${FONT}`;
  const rows = [['Mo – Fr', '10 – 22 Uhr'], ['Samstag', '10 – 23 Uhr'], ['Sonntag', '13 – 20 Uhr']];
  rows.forEach(([a, b], i) => { x.fillText(a, 80, 74 + i * 52); x.font = `16px ${FONT}`; x.fillText(b, 80, 96 + i * 52); x.font = `bold 20px ${FONT}`; });
  x.fillStyle = '#b3261e'; x.font = `bold 13px ${FONT}`; x.fillText('Kassetten zurück bis 18 Uhr', 80, 226);
  return c;
}

/** Wand entlang x mit Öffnungen (Pfeiler/Brüstung/Sturz als Quader) – Außenverkleidung. */
function claddingParts(list, x0, x1, zc, t, h, openings, color) {
  const part = (a, b, ya, yb) => {
    if (b - a < 0.005 || yb - ya < 0.005) return;
    list.push(box({ w: b - a, h: yb - ya, d: t, x: (a + b) / 2, y: (ya + yb) / 2, z: zc, color }));
  };
  let cur = x0;
  for (const o of [...openings].sort((a, b) => a.x0 - b.x0)) {
    part(cur, o.x0, 0, h);
    part(o.x0, o.x1, 0, o.y0);
    part(o.x0, o.x1, o.y1, h);
    cur = o.x1;
  }
  part(cur, x1, 0, h);
}


/**
 * Fassade bauen. `out` = Außenbereich (modules/outdoor.js getOutdoor). `o.shutter`: Rollladen anlegen (Intro folgt).
 */
export function buildFacade(out, o = {}) {
  const L = out.L;
  const W = L.w;
  const D = L.d;
  const group = new Group();
  group.name = 'm4-facade';
  out.group.add(group);
  const door = L.facade.door;
  const windows = L.facade.windows || [];
  const z0 = D + WALL_OUT + 0.05;
  const front = z0 + 0.04; // Außenfläche der Verkleidung
  const openings = [{ x0: door.x0, x1: door.x1, y0: 0, y1: 2.4 }, ...windows.map((w) => ({ x0: w.x0, x1: w.x1, y0: w.y0, y1: w.y1 }))];
  const parts = [];
  const TEAL = hex('#1c4f5e');
  claddingParts(parts, -WALL_OUT, W + WALL_OUT, z0, 0.08, 2.85, openings, TEAL);
  const NAVY = hex('#10153a');
  parts.push(box({ w: W + 2 * WALL_OUT, h: 2.35, d: 0.08, x: W / 2, y: 4.0, z: z0, color: NAVY }));
  for (const [y, c] of [[5.12, [1, 0.24, 0.5]], [2.9, [1, 0.82, 0.25]]]) parts.push(box({ w: W + 2 * WALL_OUT + 0.1, h: 0.07, d: 0.12, x: W / 2, y, z: z0 + 0.02, color: c }));
  const mat = new MeshBasicMaterial({ vertexColors: true });
  const cladding = new Mesh(merge(parts), mat);
  cladding.matrixAutoUpdate = false;
  out.tint(mat);
  group.add(cladding);

  // Leuchtschild + Öffnungszeiten (selbstleuchtend, nicht getönt)
  const signTex = toTexture(signCanvas(), { aniso: 4 });
  const signMat = new MeshBasicMaterial({ map: signTex, toneMapped: false });
  const sign = new Mesh(new PlaneGeometry(Math.min(W - 1.4, 7.4), Math.min(W - 1.4, 7.4) / 4), signMat);
  sign.position.set(W / 2, 4.0, front + 0.012);
  group.add(sign);
  const hoursMat = new MeshBasicMaterial({ map: toTexture(hoursCanvas(), { aniso: 4 }) });
  out.tint(hoursMat);
  const hours = new Mesh(new PlaneGeometry(0.5, 0.75), hoursMat);
  hours.position.set(door.x1 + 0.36, 1.5, front + 0.012);
  group.add(hours);

  // Rollladen: Lamellen-Textur, Oberkante fest, beim Hochfahren schrumpft die Höhe (Textur skaliert mit)
  const SH = 2.62;
  const SW = W - 0.5;
  let shutter = null;
  let casing = null;
  let shTex = null;
  let shMat = null;
  const R = SH / 0.56;
  if (o.shutter) {
    shTex = toTexture(shutterCanvas(), { repeat: true, aniso: 2, mips: false });
    shTex.repeat.set(SW / 1.0, R);
    const shGeo = new PlaneGeometry(SW, SH);
    shGeo.translate(0, -SH / 2, 0);
    shMat = new MeshBasicMaterial({ map: shTex });
    out.tint(shMat);
    shutter = new Mesh(shGeo, shMat);
    shutter.position.set(W / 2, SH, front + 0.1);
    group.add(shutter);
    casing = new Mesh(box({ w: W - 0.2, h: 0.3, d: 0.28, x: 0, y: 0, z: 0, color: [0.36, 0.4, 0.46] }), new MeshBasicMaterial({ vertexColors: true }));
    casing.position.set(W / 2, SH + 0.14, front + 0.1);
    out.tint(casing.material);
    group.add(casing);
  }
  out.setPalette(out.tod, out.rain);

  let openAmt = 0;
  const untint = (m) => { const i = out.tinted.findIndex((q) => q.mat === m); if (i >= 0) out.tinted.splice(i, 1); };
  const api = {
    group, signMat,
    get shutter() { return shutter; },
    /** 0 = zu, 1 = oben (komplett eingerollt, unsichtbar). Ohne Rollladen wirkungslos. */
    setShutter(v) {
      openAmt = Math.min(1, Math.max(0, v));
      if (!shutter) return;
      const s = Math.max(0.0001, 1 - openAmt);
      shutter.visible = openAmt < 0.995;
      shutter.scale.y = s;
      shTex.repeat.y = R * s;
      shTex.offset.y = R * (1 - s);
    },
    get openAmount() { return openAmt; },
    /** Rollladen samt Kasten entsorgen (nach dem Intro); die Fassade bleibt. */
    dropShutter() {
      if (!shutter) return;
      for (const m of [shutter, casing]) { m.removeFromParent(); m.geometry.dispose(); }
      shTex.dispose();
      untint(shMat);
      untint(casing.material);
      shMat.dispose();
      casing.material.dispose();
      shutter = null;
      casing = null;
      openAmt = 1;
    },
    /** Neon-Flackern beim Einschalten (t in Sekunden seit Start). */
    flicker(t) {
      const k = t < 0.9 ? (Math.sin(t * 61) > 0.1 && Math.sin(t * 23) > -0.3 ? 1 : 0.25) : 1;
      signMat.color.setScalar(k);
    },
    dispose() {
      group.removeFromParent();
      disposeTree(group);
      signTex.dispose();
      for (const t of [mat, hoursMat, shMat, casing && casing.material]) if (t) untint(t);
    },
  };
  return api;
}
