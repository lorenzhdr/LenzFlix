// VIDEOTHEK LENZ · Ultra-Plan der Außenwelt (1.19.0, deterministisch, ohne DOM): wo die Ultra-Details der Stadt stehen.
// Liest nur layout/layout.city (Kollider, Fußwege, Zonen, Spawns, Gebäude, Fenster-Vorgaben) und ERZEUGT KEINE Kollider.
// Bodennahe Teile (Bäume, Mülleimer, Poller, Schilder, Fahrradständer, Gullys, Fallrohre) werden nur dort gesetzt, wo `makeKeepout` frei meldet:
// ≥ 0,6 m Abstand zu allen Fußweg-Pfaden, nichts an Türen/Interaktionsbereichen/Spawns/Fundstücken/Requisiten-Plätzen, nichts in Kollidern.
// Hohe Teile (Gesimse, Klimageräte, Schüsseln, Schornsteine, Antennen, Kronen) hängen über Kopfhöhe an Fassaden bzw. Dächern.
import { seeded } from '../modules/m4-util.js';
import { windowGrid } from '../modules/outdoor.js';
import { gangEnv } from '../modules/gang.js';

export const SKY_RADII = [52, 54, 56]; // Radien der Skyline-Ringe (m, Höhenstaffeln innen → außen)
const WIN_FLOOR_H = 2.7;

const rectDist = (q, x, z) => Math.hypot(Math.max(q.x0 - x, 0, x - q.x1), Math.max(q.z0 - z, 0, z - q.z1));
function segDist(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
  return Math.hypot(x - (a.x + t * dx), z - (a.z + t * dz));
}

/** Haustür-Bereiche (vor den Gebäuden mit Haustür, die build-city-decor.js zeichnet), als Rechtecke zum Freihalten. */
export function doorRects(city) {
  const list = [];
  for (const b of city.buildings) {
    if (!b.front || b.x1 - b.x0 < 3 || b.parts) continue;
    const dx = b.x0 + (b.x1 - b.x0) * 0.25;
    if (b.front === 'S') list.push({ x0: dx - 1.0, x1: dx + 1.4, z0: b.z1 - 0.1, z1: b.z1 + 1.1 });
    else list.push({ x0: dx - 1.0, x1: dx + 1.4, z0: b.z0 - 1.1, z1: b.z0 + 0.1 });
  }
  return list;
}

/**
 * Freihalte-Prüfung. blocked(x, z, r, kind) → true, wenn ein bodennahes Teil (Kreis r um x/z) dort NICHT stehen darf.
 * kind 'tree' hält zusätzlich Abstand zu Laternen, Schildern und Ampelmasten (Krone).
 */
export function makeKeepout(layout) {
  const c = layout.city;
  const rects = layout.colliders.filter((q) => q.kind !== 'bounds');
  const segs = [];
  for (const p of c.sidewalkPaths) for (let i = 0; i + 1 < p.pts.length; i++) segs.push([p.pts[i], p.pts[i + 1]]);
  const zoneIds = { doorway: 0.9, theft: 0.9, palastEntrance: 0.9, kiosk: 0.6, alley: 0.6, salon: 1.0 };
  const zoneRects = Object.entries(zoneIds).filter(([id]) => c.zones[id]).map(([id, m]) => {
    const r = c.zones[id].rect;
    return { x0: r.x0 - m, z0: r.z0 - m, x1: r.x1 + m, z1: r.z1 + m };
  });
  const zebraRects = c.zebras.map((q) => ({ x0: q.x0 - 0.4, z0: q.z0 - 0.4, x1: q.x1 + 0.4, z1: q.z1 + 0.4 }));
  const doors = doorRects(c);
  // Palast-Schaukästen: ~0,8 m Luft davor/daneben (kein Mülleimer, Fahrradständer, Poller direkt am Aushang)
  const posterRects = ((c.palast && c.palast.posterSlots) || []).map((q) => ({ x0: q.x - q.w / 2 - 0.8, z0: q.z - 0.8, x1: q.x + q.w / 2 + 0.8, z1: q.z + 0.8 }));
  let gangSpots = [];
  try { const ge = gangEnv(c); if (ge) gangSpots = ge.spots; } catch { gangSpots = []; }
  const spawns = Object.values(c.spawns);
  const slots = [...c.discoverSlots, ...c.propSlots];
  const b = c.bounds;
  const inside = (r, x, z, m) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;
  return {
    blocked(x, z, r = 0.2, kind = '') {
      if (x - r < b.x0 + 0.5 || x + r > b.x1 - 0.5 || z - r < b.z0 + 0.5 || z + r > b.z1 - 0.5) return true;
      const margin = kind === 'hug' ? 0.02 : 0.1; // 'hug': Teile an der Hauswand (Mülleimer, Fallrohr, Fahrradständer)
      for (const q of rects) if (rectDist(q, x, z) < r + margin) return true;
      for (const [a, e] of segs) if (segDist(x, z, a, e) < 0.6 + r) return true;
      for (const q of zoneRects) if (inside(q, x, z, r)) return true;
      for (const q of zebraRects) if (inside(q, x, z, r)) return true;
      for (const q of doors) if (inside(q, x, z, r)) return true;
      for (const q of posterRects) if (inside(q, x, z, r)) return true;
      for (const s of spawns) if (Math.hypot(x - s.x, z - s.z) < 1.4 + r) return true;
      for (const s of slots) if (Math.hypot(x - s.x, z - s.z) < 0.9 + r) return true;
      if (kind === 'tree') {
        for (const l of c.lights) if (Math.hypot(x - l.x, z - l.z) < 2.4) return true;
        for (const s of c.signs) if (Math.hypot(x - s.x, z - s.z) < 2.4) return true;
        for (const s of c.signals) if (Math.hypot(x - s.x, z - s.z) < 1.8) return true;
        for (const s of gangSpots) if (Math.hypot(x - s.x, z - s.z) < 1.0 + r) return true; // Bandenplätze (gang-Zone) bleiben stammfrei
      }
      return false;
    },
  };
}

/** Schildflächen der Stadt auf Fassaden (city.signs + Ladenschilder samt Kasten) als Rechtecke { axis, c (Wandposition), a0/a1 (entlang der Wand), y0/y1 }. */
export function signBoards(city) {
  const list = [];
  for (const s of city.signs || []) {
    const h = s.w / 4;
    const alongX = Math.abs(Math.sin(s.yaw || 0)) < 0.5; // Schild auf einer Wand quer zu z (yaw 0 / π)
    list.push(alongX ? { axis: 'z', c: s.z, a0: s.x - s.w / 2, a1: s.x + s.w / 2, y0: s.y - h / 2, y1: s.y + h / 2 } : { axis: 'x', c: s.x, a0: s.z - s.w / 2, a1: s.z + s.w / 2, y0: s.y - h / 2, y1: s.y + h / 2 });
  }
  for (const s of city.shopFronts || []) {
    const h = s.w / 4 + 0.16;
    list.push({ axis: 'z', c: s.z, a0: s.x - s.w / 2 - 0.1, a1: s.x + s.w / 2 + 0.1, y0: s.y - h / 2, y1: s.y + h / 2 });
  }
  const ps = city.palast && city.palast.sign;
  if (ps && city.frame && Number.isFinite(city.frame.sz)) { // Palast-Leuchtschild samt Glühlampen-Rahmen (build-city-decor: ±0,25 seitlich, ±0,2 + 0,15 oben/unten)
    const h = ps.w / 4 + 0.8;
    list.push({ axis: 'z', c: city.frame.sz, a0: ps.x - ps.w / 2 - 0.3, a1: ps.x + ps.w / 2 + 0.3, y0: ps.y - h / 2, y1: ps.y + h / 2 });
  }
  return list;
}
/** Überdeckt ein Fenster (Rahmen inklusive, `margin` m Rand) ein Schild derselben Wand? */
export function windowOnSign(win, boards, margin = 0.15) {
  const a = win.axis === 'z' ? win.x : win.z;
  const c = win.axis === 'z' ? win.z : win.x;
  for (const b of boards) {
    if (b.axis !== win.axis || Math.abs(b.c - c) > 0.6) continue;
    if (a + win.w / 2 + margin > b.a0 && a - win.w / 2 - margin < b.a1 && win.y + win.h / 2 + margin > b.y0 && win.y - win.h / 2 - margin < b.y1) return true;
  }
  return false;
}

/** Fenster der Fassaden, genau wie world/build-city.js sie anlegt (Position/Größe; `lit` ist hier ohne Belang). */
export function facadeWindows(city) {
  const out = [];
  const boards = signBoards(city);
  const flat = () => 0.5;
  for (const b of city.buildings) {
    const w = b.x1 - b.x0;
    if (!(b.front && w > 3)) continue;
    const z = b.front === 'S' ? b.z1 + 0.01 : b.z0 - 0.01;
    const grid = [];
    windowGrid(grid, b.x0 + 1.2, b.x1 - 0.2, 1.3, Math.floor((b.h - 1.4) / WIN_FLOOR_H), z, b.front === 'S' ? 1 : -1, flat);
    const sr = b.parts && city.salon ? city.salon.rect : null;
    for (const g of grid) {
      if (sr && g.x > sr.x0 - 0.6 && g.x < sr.x1 + 0.6 && g.y - g.h / 2 < city.salon.ceil) continue;
      const win = { ...g, face: b.front === 'S' ? 1 : -1, axis: 'z', b: b.id };
      if (windowOnSign(win, boards)) continue; // Ultra-Rahmen nie über Schildern (Schrift bleibt lesbar)
      out.push(win);
    }
  }
  const f = city.frame;
  for (const [ex, dir] of [[f.XW0 + 0.03, 1], [f.XW1 - 0.03, -1]]) {
    for (let fl = 0; fl < 4; fl++) for (let zz = f.fz + 1.1; zz < f.sz - 0.6; zz += 1.8) {
      const win = { x: ex, y: 2.2 + fl * 2.2 + (fl ? 0.3 : 0), z: zz, w: 0.9, h: 1.3, face: dir, axis: 'x', b: 'wall' };
      if (!windowOnSign(win, boards)) out.push(win);
    }
  }
  return out;
}

const shuffle = (arr, rand) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

/** Fassaden-Details (hoch über Kopf): Gesimse, Fensterrahmen, Fallrohre, Klimageräte, Schüsseln, Dachlippen, Schornsteine, Antennen. */
function planFacade(layout, rand) {
  const city = layout.city;
  const f = city.frame;
  const windows = facadeWindows(city);
  const keep = makeKeepout(layout);
  const doors = doorRects(city);
  const fronts = city.shopFronts || [];
  const ac = [];
  const dishes = [];
  const pipes = [];
  const roofs = [];
  for (const b of city.buildings) {
    const w = b.x1 - b.x0;
    const d = b.z1 - b.z0;
    const group = b.region === 'Y' ? 'yard' : 'street';
    // Dach: Schornsteine + Antenne (immer über der Dachkante, y = h + 0.275)
    const rr = { id: b.id, group, x0: b.x0, z0: b.z0, x1: b.x1, z1: b.z1, y: b.h + 0.275, chimneys: [], antenna: null, tank: null };
    const nCh = w * d > 90 ? 2 : 1;
    for (let k = 0; k < nCh; k++) rr.chimneys.push({ x: b.x0 + 1.6 + rand() * Math.max(0.1, w - 3.2), z: b.z0 + 1.6 + rand() * Math.max(0.1, d - 3.2), w: 0.5 + rand() * 0.2, d: 0.5 + rand() * 0.2, h: 0.9 + rand() * 0.8 });
    if (rand() < 0.7) rr.antenna = { x: b.x0 + 1.2 + rand() * Math.max(0.1, w - 2.4), z: b.z0 + 1.2 + rand() * Math.max(0.1, d - 2.4), h: 2.2 + rand() * 1.6, bars: 2 + Math.floor(rand() * 3) };
    roofs.push(rr);
    if (!(b.front && w > 3)) continue;
    const face = b.front === 'S' ? 1 : -1;
    const zf = b.front === 'S' ? b.z1 : b.z0;
    // Fallrohr an der linken Kante (das vorhandene sitzt rechts); nicht vor der Haustür
    const px = b.x0 + 0.35;
    if (!doors.some((r) => px > r.x0 - 0.1 && px < r.x1 + 0.1 && zf + face * 0.1 > r.z0 && zf + face * 0.1 < r.z1) && !keep.blocked(px, zf + face * 0.1, 0.06, 'hug')) pipes.push({ x: px, z: zf + face * 0.1, face, h: b.h - 0.55, b: b.id });
    // Klimageräte / Schüsseln in den Spalten zwischen den Fenstern
    const ws = windows.filter((q) => q.b === b.id && q.axis === 'z');
    const rowY = ws.length ? ws[0].y : 2.65;
    const xs = [...new Set(ws.filter((q) => q.y === rowY).map((q) => q.x))].sort((a, e) => a - e);
    const sf = fronts.find((s) => s.id === b.id);
    const clearOfSign = (x) => !sf || Math.abs(x - sf.x) > sf.w / 2 + 0.6;
    const gaps = shuffle(xs.slice(0, -1).map((x) => x + 0.875).filter(clearOfSign), rand);
    const nAc = Math.min(gaps.length, rand() < 0.2 ? 0 : 1 + (rand() < 0.6 ? 1 : 0));
    for (let k = 0; k < nAc; k++) ac.push({ x: gaps[k], y: 4.05, z: zf + face * 0.19, face, b: b.id });
    if (gaps.length > nAc && rand() < 0.6) dishes.push({ x: gaps[nAc], y: 4.2, z: zf + face * 0.04, face, b: b.id });
  }
  return { windows, ac, dishes, pipes, roofs, frame: f };
}

/** Abstand der Punktmitte (x,y,z) zum Quader b (x0..x1, y0..y1, z0..z1). */
function sphereBoxDist(b, x, y, z) {
  return Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1), Math.max(b.z0 - z, 0, z - b.z1));
}
/** Schneidet die Strecke a→b eine Kugel (Mitte c, Radius r)? */
export function segmentHitsSphere(a, b, c, r) {
  const dx = b.x - a.x; const dy = b.y - a.y; const dz = b.z - a.z;
  const l2 = dx * dx + dy * dy + dz * dz;
  const t = l2 ? Math.max(0, Math.min(1, ((c.x - a.x) * dx + (c.y - a.y) * dy + (c.z - a.z) * dz) / l2)) : 0;
  return Math.hypot(a.x + t * dx - c.x, a.y + t * dy - c.y, a.z + t * dz - c.z) < r;
}
/** Kronenkugeln eines Baums (Hauptblob + 2 Nebenblobs), Zufall je Standort (unabhängig von der Plan-Zufallsfolge). */
function crownBlobs(t, lr) {
  const cy = t.trunk + t.crown * 0.55;
  const blobs = [{ x: t.x, y: cy, z: t.z, sx: t.crown, sy: t.crown * 0.95, sz: t.crown, tone: t.tone }];
  for (let k = 0; k < 2; k++) {
    const a = lr() * Math.PI * 2;
    const s = t.crown * (0.55 + lr() * 0.2);
    blobs.push({ x: t.x + Math.cos(a) * t.crown * 0.6, y: cy + (k ? 0.45 : -0.2) * t.crown, z: t.z + Math.sin(a) * t.crown * 0.6, sx: s, sy: s * 0.9, sz: s, tone: (t.tone + 1 + k) % 3 });
  }
  return blobs;
}
const blobR = (b) => Math.max(b.sx, b.sy, b.sz);

/** Bäume: Stämme + Kronenblobs (InstancedMesh), nur dort, wo die Freihalte-Prüfung (inkl. Laternen/Schilder) frei meldet und die KRONE nichts schneidet. */
function planTrees(layout, keep, rand, placed, signs = []) {
  const c = layout.city;
  const f = c.frame;
  const cand = [];
  for (let x = f.XW0 + 3; x < f.XW1 - 2; x += 3) cand.push({ x, z: f.D + 2.3, w: 1 }); // Nordseite am Bordstein
  for (let z = f.zSN + 4; z < f.D - 3; z += 3.5) { cand.push({ x: f.xc0 - 0.5, z, w: 1 }); cand.push({ x: f.xc1 + 0.5, z, w: 1 }); } // Seitenstraße Nord
  for (let z = f.sz + 3; z < f.zSS - 3; z += 3.5) { cand.push({ x: f.xc0 - 0.5, z, w: 1 }); cand.push({ x: f.xc1 + 0.5, z, w: 1 }); } // Seitenstraße Süd
  for (const [x, z] of [[f.W + 7.0, -9.6], [-2.0, -10.0], [f.W * 0.45, -10.0]]) cand.push({ x, z, w: 2 }); // Hinterhof (Ecken)
  shuffle(cand, rand);
  // feste Hindernisse für Kronen: hohe Kollider (Hauswände, Container, Hofwand …) und Schildtafeln der Straßenschilder
  const solids = layout.colliders.filter((q) => q.kind !== 'bounds' && Number.isFinite(q.x0)).map((q) => ({ x0: q.x0, x1: q.x1, z0: q.z0, z1: q.z1, y0: q.y0 || 0, y1: Number.isFinite(q.y1) ? q.y1 : 99 }));
  const plates = signs.map((s) => ({ x0: s.x - 0.3, x1: s.x + 0.3, z0: s.z - 0.3, z1: s.z + 0.3, y0: 1.75, y1: 2.35 }));
  // Sichtlinien zu den Leuchtschildern (Laden, Palast) von den Straßenachsen: keine Krone davor
  const targets = [{ x: f.W / 2, y: 4.0, z: f.D + 0.05 }];
  if (c.palast && c.palast.sign) targets.push({ x: c.palast.sign.x, y: c.palast.sign.y, z: f.sz - 0.05 });
  const eyes = [];
  for (let x = f.XW0 + 2; x < f.XW1 - 1; x += 4) eyes.push({ x, y: 1.6, z: f.roadMid });
  for (let z = f.zSN + 2; z < f.zSS - 1; z += 4) eyes.push({ x: (f.xc0 + f.xc1) / 2, y: 1.6, z });
  const sightClear = (blobs) => {
    for (const tg of targets) for (const e of eyes) {
      if (Math.hypot(tg.x - e.x, tg.z - e.z) > 45) continue;
      for (const b of blobs) if (segmentHitsSphere(e, tg, b, blobR(b) * 0.85)) return false;
    }
    return true;
  };
  const trees = [];
  const MIN = 7.5;
  for (const k of cand) {
    if (trees.length >= 16) break;
    if (keep.blocked(k.x, k.z, 0.2, 'tree')) continue;
    if (trees.some((t) => Math.hypot(t.x - k.x, t.z - k.z) < MIN)) continue;
    if (placed.some((p) => Math.hypot(p.x - k.x, p.z - k.z) < p.r + 0.45)) continue;
    if (k.x > -1.5 && k.x < f.W + 1.5 && k.z > f.D - 0.5 && k.z < f.D + 6) continue; // nie mittig vor dem Schaufenster/Schild der Videothek
    const lr = seeded(Math.round(k.x * 100) * 7919 + Math.round(k.z * 100) * 104729 + 17);
    const t = { x: Math.round(k.x * 100) / 100, z: Math.round(k.z * 100) / 100, r: 0.2, trunk: 2.2 + lr() * 0.5, crown: 1.0 + lr() * 0.35, tone: Math.floor(lr() * 3), yard: k.w === 2 };
    const blobs = crownBlobs(t, lr);
    if (blobs.some((b) => { const r = blobR(b) * 0.9; return solids.some((q) => sphereBoxDist(q, b.x, b.y, b.z) < r) || plates.some((q) => sphereBoxDist(q, b.x, b.y, b.z) < r); })) continue;
    if (!sightClear(blobs)) continue;
    t.blobs = blobs;
    trees.push(t);
  }
  const crowns = [];
  for (const t of trees) crowns.push(...t.blobs);
  for (const t of trees) delete t.blobs;
  return { trees, crowns };
}

const CURB_STEP = 0.25;
const CURB_MIN = 0.5;
/** Freie Abschnitte [z0, z1] einer Bordsteinlinie bei x (Walk-Seite dir): alles, was `keep` nicht blockiert; Reste < 0,5 m entfallen. */
export function curbRuns(keep, x, z0, z1, dir) {
  const runs = [];
  const cx = x - dir * 0.08; // Mitte des Bordsteinkörpers
  const n = Math.max(1, Math.ceil((z1 - z0) / CURB_STEP - 1e-9));
  let a = null;
  for (let i = 0; i < n; i++) {
    const za = z0 + i * CURB_STEP;
    const zb = Math.min(z1, za + CURB_STEP);
    const free = ![za, (za + zb) / 2, zb].some((zz) => keep.blocked(cx, zz, 0.1, 'hug')); // Zellenanfang, -mitte, -ende
    if (free && a === null) a = za;
    if ((!free || i === n - 1) && a !== null) {
      const end = free ? zb : za;
      if (end - a >= CURB_MIN) runs.push([a, end]);
      a = null;
    }
  }
  return runs;
}

/** Straße: Bordstein-Fasen, Gullys, Kanaldeckel, Poller, Mülleimer, Fahrradständer, Schilder. */
function planStreet(layout, keep, rand, placed) {
  const c = layout.city;
  const f = c.frame;
  const { XW0, XW1, xc0, xc1, roadZ0, roadZ1, fz, sz, D, zSN, zSS, roadMid } = f;
  const aL = xc0 - 2.4;
  const aR = xc1 + 2.4;
  const zebraX = c.zebras.filter((z) => z.z1 - z.z0 > 3).map((z) => [z.x0 - 1.4, z.x1 + 1.4]); // Querungen der Fahrbahn (Fußwege kreuzen dort)
  const nearCross = (x) => zebraX.some(([a, b]) => x > a && x < b) || (x > xc0 - 3 && x < xc1 + 3);
  const curbs = [];
  // Fase auf den vorhandenen Bordsteinen der Hauptstraße (außerhalb der Querungen), je Seite abschnittsweise
  for (const [a, b] of [[XW0, aL], [aR, XW1]]) {
    let x = a;
    while (x < b) {
      const x1 = Math.min(b, x + 2.4);
      if (!nearCross((x + x1) / 2) && !zebraX.some(([za, zb]) => x1 > za && x < zb)) {
        curbs.push({ axis: 'x', x0: x, x1, z: roadZ0, dir: 1 }); // Kante zur Fahrbahn: z = roadZ0 (Straße liegt bei +z)
        curbs.push({ axis: 'x', x0: x, x1, z: roadZ1, dir: -1 });
      }
      x = x1;
    }
  }
  // neue Bordsteine der Seitenstraßen (Walk x ≤ xc0 bzw. ≥ xc1), mit Fase; nicht im Querungsbereich der Zebrastreifen
  const sideRuns = [[zSN, D + 0.2], [D + 10.3, zSS]];
  // Die soliden Bordsteine laufen durch makeKeepout: an Querungen (Fußwege, Zebrastreifen, Türen/Zonen, Spawns, Kollider) wird unterbrochen.
  for (const [z0, z1] of sideRuns) {
    for (const [z0r, z1r] of curbRuns(keep, xc0, z0, z1, 1)) curbs.push({ axis: 'z', z0: z0r, z1: z1r, x: xc0, dir: 1, solid: true });
    for (const [z0r, z1r] of curbRuns(keep, xc1, z0, z1, -1)) curbs.push({ axis: 'z', z0: z0r, z1: z1r, x: xc1, dir: -1, solid: true });
  }
  const grates = [];
  const manholes = [];
  const bollards = [];
  const bins = [];
  const hoops = [];
  const signs = [];
  const place = (list, item, r, kind, minGap = 0.25) => {
    if (keep.blocked(item.x, item.z, r, kind)) return false;
    if (placed.some((p) => Math.hypot(p.x - item.x, p.z - item.z) < p.r + r + minGap)) return false;
    placed.push({ x: item.x, z: item.z, r });
    list.push(item);
    return true;
  };
  // Gullys an der Fahrbahnseite der Bordsteine
  for (let x = XW0 + 5; x < XW1 - 4; x += 7) {
    if (nearCross(x) || nearCross(x + 0.3)) continue;
    if (rand() < 0.25) continue;
    grates.push({ x, z: roadZ0 + 0.2 });
    grates.push({ x: x + 3.4, z: roadZ1 - 0.2 });
  }
  const grates2 = grates.filter((g) => !nearCross(g.x) && g.x > XW0 + 1 && g.x < XW1 - 1);
  // Kanaldeckel auf der Mittellinie in Lücken der Strichlinie (x = XW0 + 1 + 3.2k + 2.35)
  for (let k = 3; k < 40; k += 5) {
    const x = XW0 + 1 + 3.2 * k + 2.35;
    if (x > XW1 - 3 || nearCross(x)) continue;
    manholes.push({ x, z: roadMid });
  }
  for (let z = zSN + 3.5; z < roadZ0 - 1.5; z += 7) manholes.push({ x: (xc0 + xc1) / 2 + 1.7, z });
  for (let z = roadZ1 + 4; z < zSS - 1.5; z += 7.5) manholes.push({ x: (xc0 + xc1) / 2 - 1.7, z });
  // Poller an den Ecken der Seitenstraße (Nordseite, Gehwegkante der Hauptstraße)
  const pollCand = [];
  for (const x0 of [aL - 6.2, aR + 1.4]) for (let k = 0; k < 4; k++) pollCand.push({ x: x0 + k * 1.2, z: roadZ0 - 0.42 });
  for (const q of pollCand) place(bollards, { x: Math.round(q.x * 100) / 100, z: q.z }, 0.1, '', 0.15);
  // Mülleimer: an Hauswänden (Nord nur ganz dicht an der Wand, Süd mit Luft) und an den Seitenstraßen
  const binCand = [];
  for (let x = XW0 + 2; x < XW1 - 2; x += 1.5) { binCand.push({ x, z: fz + 0.2, yaw: 0, hug: true }); binCand.push({ x, z: sz - 0.2, yaw: Math.PI, hug: true }); }
  for (let z = zSN + 3; z < D - 2; z += 2.5) { binCand.push({ x: xc0 - 0.35, z, yaw: Math.PI / 2 }); binCand.push({ x: xc1 + 0.35, z, yaw: -Math.PI / 2 }); }
  for (let z = sz + 3; z < zSS - 3; z += 2.5) { binCand.push({ x: xc0 - 0.35, z, yaw: Math.PI / 2 }); binCand.push({ x: xc1 + 0.35, z, yaw: -Math.PI / 2 }); }
  shuffle(binCand, rand);
  for (const q of binCand) {
    if (bins.length >= 7) break;
    if (bins.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < 11)) continue;
    place(bins, { x: Math.round(q.x * 100) / 100, z: Math.round(q.z * 100) / 100, yaw: q.yaw }, 0.17, q.hug ? 'hug' : '');
  }
  // Fahrradständer (Reihe aus 3 Bügeln, Breite ≈ 1,2 m): nur an der Südfront und an den Seitenstraßen
  const hoopCand = [];
  for (let x = XW0 + 3; x < XW1 - 3; x += 1.5) hoopCand.push({ x, z: sz - 0.16, yaw: 0, hug: true });
  for (let z = zSN + 3; z < D - 2; z += 2.5) { hoopCand.push({ x: xc0 - 0.5, z, yaw: Math.PI / 2 }); hoopCand.push({ x: xc1 + 0.5, z, yaw: Math.PI / 2 }); }
  shuffle(hoopCand, rand);
  for (const q of hoopCand) {
    if (hoops.length >= 4) break;
    if (hoops.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < 14)) continue;
    const it = { x: Math.round(q.x * 100) / 100, z: Math.round(q.z * 100) / 100, yaw: q.yaw };
    const along = q.yaw === 0 ? [[-0.5, 0], [0, 0], [0.5, 0]] : [[0, -0.5], [0, 0], [0, 0.5]]; // Reihe von 1,0 m Länge: drei Prüfpunkte
    if (along.some(([ox, oz]) => keep.blocked(it.x + ox, it.z + oz, 0.1, q.hug ? 'hug' : ''))) continue;
    if (placed.some((p) => Math.hypot(p.x - it.x, p.z - it.z) < p.r + 0.7)) continue;
    placed.push({ x: it.x, z: it.z, r: 0.55 });
    hoops.push(it);
  }
  // Straßenschilder (Pfosten + Piktogramm), Plakette zeigt zur Fahrbahn
  const KINDS = ['arrow', 'ban', 'warn', 'info', 'bike'];
  const signCand = [];
  for (let x = XW0 + 4; x < XW1 - 4; x += 2) signCand.push({ x, z: roadZ0 - 0.3, yaw: 0 });
  for (let z = zSN + 3; z < D - 2; z += 2.5) { signCand.push({ x: xc0 - 0.3, z, yaw: Math.PI / 2 }); signCand.push({ x: xc1 + 0.3, z, yaw: -Math.PI / 2 }); }
  shuffle(signCand, rand);
  for (const q of signCand) {
    if (signs.length >= 7) break;
    if (signs.some((o) => Math.hypot(o.x - q.x, o.z - q.z) < 9)) continue;
    place(signs, { x: Math.round(q.x * 100) / 100, z: Math.round(q.z * 100) / 100, yaw: q.yaw, kind: KINDS[signs.length % KINDS.length] }, 0.12, '');
  }
  return { curbs, grates: grates2, manholes, bollards, bins, hoops, signs };
}

/** Skyline: ferne Gebäude auf drei Ringen (Höhenstaffeln). Die Gebäude liegen RELATIV zum Ringmittelpunkt (x/z um den Ursprung); cx/cz = Mitte der Welt (Bereich bounds), der Ring folgt der Kamera über skylineRoot(). */
export function planSkyline(layout) {
  const b = layout.city.bounds;
  const cx = (b.x0 + b.x1) / 2;
  const cz = (b.z0 + b.z1) / 2;
  const rand = seeded(Math.round(layout.w * 100 + layout.d * 10) + 77);
  const H = [[10, 20], [16, 28], [22, 38]];
  const blds = [];
  SKY_RADII.forEach((R, layer) => {
    let a = rand() * 0.3;
    while (a < Math.PI * 2 - 0.1) {
      const w = 5 + rand() * 7;
      const d = 5 + rand() * 4;
      const [h0, h1] = H[layer];
      const h = h0 + rand() * (h1 - h0);
      const da = w / R;
      const am = a + da / 2;
      blds.push({ layer, x: Math.cos(am) * R, z: Math.sin(am) * R, w, d, h, rot: -am - Math.PI / 2, tone: rand(), roof: rand() < 0.3 ? { w: w * 0.4, d: d * 0.5, h: 1 + rand() * 2 } : null, seed: Math.floor(rand() * 1e6) });
      a += da + 0.006 + rand() * 0.03;
    }
  });
  const dx = Math.max(Math.abs(b.x0 - cx), Math.abs(b.x1 - cx));
  const dz = Math.max(Math.abs(b.z0 - cz), Math.abs(b.z1 - cz));
  const maxOff = Math.hypot(dx, dz);
  const follow = Math.min(1, Math.max(0.9, 1 - 1.4 / maxOff)); // Anteil, mit dem die Skyline der Kamera folgt (Rest = Parallaxe)
  return { cx, cz, blds, follow };
}

/** Wurzelposition der Skyline für eine Kamera: Mitte der Welt + (Kamera − Mitte) · follow (Ring um die Kamera, Rest = Parallaxe). */
export function skylineRoot(sk, camX, camZ) {
  return { x: sk.cx + (camX - sk.cx) * sk.follow, z: sk.cz + (camZ - sk.cz) * sk.follow };
}

/** Gesamtplan (rein, deterministisch). */
export function planUltraCity(layout) {
  const rand = seeded(Math.round(layout.w * 100 + layout.d * 10) + 31);
  const keep = makeKeepout(layout);
  const placed = [];
  const street = planStreet(layout, keep, rand, placed);
  const t = planTrees(layout, keep, rand, placed, street.signs);
  const facade = planFacade(layout, rand);
  const skyline = planSkyline(layout);
  return { facade, street, trees: t.trees, crowns: t.crowns, skyline };
}

/** Bodennahe Standflächen (Kreise) des Plans für Tests/Prüfungen: [{ x, z, r, kind }]. */
export function groundFootprints(plan) {
  const out = [];
  for (const t of plan.trees) out.push({ x: t.x, z: t.z, r: t.r, kind: 'tree' });
  for (const q of plan.street.bollards) out.push({ x: q.x, z: q.z, r: 0.1, kind: 'bollard' });
  for (const q of plan.street.bins) out.push({ x: q.x, z: q.z, r: 0.17, kind: 'bin' });
  for (const q of plan.street.hoops) for (const k of [-0.5, 0, 0.5]) out.push({ x: q.x + (q.yaw === 0 ? k : 0), z: q.z + (q.yaw === 0 ? 0 : k), r: 0.1, kind: 'hoop' });
  for (const q of plan.street.signs) out.push({ x: q.x, z: q.z, r: 0.12, kind: 'sign' });
  for (const q of plan.facade.pipes) out.push({ x: q.x, z: q.z, r: 0.06, kind: 'pipe' });
  return out;
}
