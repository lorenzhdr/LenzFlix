// VIDEOTHEK LENZ · Grundriss (rein, ohne three, deterministisch).
// Koordinaten: x nach Osten, z nach Süden (Eingang an der Südwand z = D), y nach oben. Alles in Metern.
// Yaw-Konvention (wie three.js rotation.y): Vorwärts = (-sin yaw, -cos yaw); yaw 0 blickt nach Norden (-z).
// Ein "Face" ist eine Regalseite (ein Segment, spec.cols Hüllen breit); seine Frontebene liegt bei (x, z), die
// Normale zeigt nach (nx, nz) = (sin yaw, cos yaw), "rechts" in Blickrichtung auf das Face ist (nz, -nx).
import { makeNavGrid } from '../nav/path.js';

export const SEG_W = 1.2;
// Normal-Werte (kleine Hüllen); für die Platzierung gilt immer die Spezifikation `layout.spec` (siehe shelfSpec).
export const COLS = 7;
export const ROWS_TALL = 5;
export const ROWS_LOW = 3;
export const CAP_TALL = COLS * ROWS_TALL;
export const CAP_LOW = COLS * ROWS_LOW;
export const UNIT_DEPTH = 0.5;
export const WALL_DEPTH = 0.3;
export const H_TALL = 1.95;
export const H_LOW = 1.25;
export const CEIL_H = 3.0;
export const WALL_T = 0.12;
export const AISLE = 1.6;
export const NAV_CELL = 0.25;
export const NAV_RADIUS = 0.32;

const AISLE_BACK = 1.5;
const FRONT = 5.8;
const CROSS = 1.8;
const MIN_W = 12.5;

const HALF_PI = Math.PI / 2;

const THICK = { vhs: 0.025, dvd: 0.014, box: 0.05 };
const SPECS = {
  // Normal: 7 Spalten, Hülle 0,14 × 0,20 m, 5 (hoch) bzw. 3 (niedrig) Fächer à 0,33 m, Atlas-Zelle 146 × 200
  normal: {
    big: false, cols: 7, rowsTall: 5, rowsLow: 3, capTall: 35, capLow: 21, base: 0.26, stepTall: 0.33, stepLow: 0.33,
    cover: { w: 0.14, h: 0.2, boxW: 0.15, boxH: 0.205, pitch: 0.16, tilt: 0.1, zBottom: -0.03, thick: THICK },
    cellW: 146, cellH: 200,
  },
  // Groß: 6 Spalten, Hülle 0,17 × 0,24 m (Seitenverhältnis wie die Atlas-Zelle 170 × 240), hohe Regale 4 Fächer à 0,42 m
  // (4 × 240 px + Farbfeldstreifen passen in 1024²), niedrige 3 Fächer à 0,33 m.
  big: {
    big: true, cols: 6, rowsTall: 4, rowsLow: 3, capTall: 24, capLow: 18, base: 0.26, stepTall: 0.42, stepLow: 0.33,
    cover: { w: 0.17, h: 0.24, boxW: 0.18, boxH: 0.249, pitch: 0.19, tilt: 0.1, zBottom: -0.03, thick: THICK },
    cellW: 170, cellH: 240,
  },
};

/** Regal-/Hüllen-Spezifikation (rein, konstant): Spalten, Fächer, Kapazität, Hüllenmaße, Atlas-Zellen. */
export function shelfSpec(big) {
  return big ? SPECS.big : SPECS.normal;
}

/** Y der Fachboden-Oberkante; `level` 0 = unterstes Fach. */
export function levelY(spec, level, low) {
  return spec.base + (low ? spec.stepLow : spec.stepTall) * level;
}

/** Verteilt `m` Hüllen auf `rows` Fachböden (oben beginnend) und zentriert jede Reihe: Slot-Array rows*cols. */
export function fillSlots(items, rows, cols = COLS) {
  const slots = new Array(rows * cols).fill(null);
  const m = items.length;
  const base = Math.floor(m / rows);
  const extra = m % rows;
  let cur = 0;
  for (let r = 0; r < rows; r++) {
    const q = base + (r < extra ? 1 : 0);
    const start = Math.floor((cols - q) / 2);
    for (let k = 0; k < q; k++) slots[r * cols + start + k] = items[cur++];
  }
  return slots;
}

function chunk(items, parts) {
  const out = [];
  const base = Math.floor(items.length / parts);
  const extra = items.length % parts;
  let cur = 0;
  for (let i = 0; i < parts; i++) {
    const n = base + (i < extra ? 1 : 0);
    out.push(items.slice(cur, cur + n));
    cur += n;
  }
  return out;
}

/** Slot-Mittelpunkt im Face-Koordinatensystem (x rechts, y oben, z aus dem Regal). */
export function slotLocal(idx, rows, spec = SPECS.normal, low = false) {
  const row = Math.floor(idx / spec.cols);
  const col = idx % spec.cols;
  const level = rows - 1 - row; // 0 = unterstes Fach
  return { x: (col - (spec.cols - 1) / 2) * spec.cover.pitch, y: levelY(spec, level, low) + spec.cover.h / 2, z: -0.05 };
}

/** Normal-Fachhöhe (Abstand 0,33 m); für andere Spezifikationen `levelY`. */
export function levelBase(level) {
  return 0.26 + 0.33 * level;
}

function runSegCount(dept, double, spec) {
  const n = dept.itemIds.length;
  const cap = dept.kind === 'kids' ? spec.capLow : spec.capTall;
  return Math.max(1, double ? Math.ceil(n / (2 * cap)) : Math.ceil(n / cap));
}

/**
 * Baut den Grundriss. `departments`: [{ id, label, kind, color, itemIds }] in Laufreihenfolge.
 * `opts.big`: große Hüllen (siehe shelfSpec); die Spezifikation hängt als `layout.spec` am Ergebnis.
 * @returns {object} { w, d, ceilH, runs, faces, walls, colliders, signs, zones, nav, spawn, door, panels, placements }
 */
export function buildLayout(departments, opts = {}) {
  const spec = shelfSpec(!!(opts && opts.big));
  const depts = (departments || []).filter((x) => x && x.itemIds && x.itemIds.length);
  const newD = depts.filter((x) => x.kind === 'new');
  const kidsD = depts.filter((x) => x.kind === 'kids');
  const adultD = depts.filter((x) => x.kind === 'adult');
  const seriesD = depts.filter((x) => x.kind === 'series');
  const freeD = depts.filter((x) => !['new', 'kids', 'adult', 'series'].includes(x.kind));

  // --- Segmentbedarf ---
  const sFree = freeD.reduce((a, x) => a + runSegCount(x, true, spec), 0);
  const sWall = seriesD.reduce((a, x) => a + runSegCount(x, false, spec), 0);
  const sKids = kidsD.reduce((a, x) => a + runSegCount(x, true, spec), 0);
  const sAdult = adultD.reduce((a, x) => a + runSegCount(x, true, spec), 0);

  // Hauptzone: Segmente pro Gang r, Gänge k
  const rMinWall = Math.ceil(sWall / 2);
  let r = Math.max(3, rMinWall, Math.round(Math.sqrt(sFree * 1.6)));
  const k = sFree > 0 ? Math.ceil(sFree / r) : 0;
  if (k > 0) r = Math.max(3, rMinWall, Math.ceil(sFree / k));
  const mainLen = r * SEG_W;

  // Hinterer Streifen: Kinder-Ecke (links) und Ab-18-Raum (rechts)
  const rb = Math.min(8, Math.max(3, Math.ceil(Math.max(sKids, sAdult, 1) / 2)));
  const nrK = Math.ceil(sKids / rb);
  const nrA = Math.ceil(sAdult / rb);
  const band = Math.max(6.6, rb * SEG_W + 2.4);
  const wk = Math.max(6, 0.3 + AISLE_BACK + nrK * (UNIT_DEPTH + AISLE_BACK));
  const wa = Math.max(6, WALL_T + AISLE_BACK + nrA * (UNIT_DEPTH + AISLE_BACK));

  const wRows = 0.6 + (k + 1) * AISLE + k * UNIT_DEPTH;
  const W = Math.max(MIN_W, wRows, wk + 3.6 + wa);
  const aisle = k > 0 ? (W - 0.6 - UNIT_DEPTH * k) / (k + 1) : AISLE;
  const zMainN = band + CROSS; // Nordkante der Gänge
  const zMainS = zMainN + mainLen; // Südkante der Gänge
  const D = zMainS + FRONT;

  const runs = [];
  const faces = [];
  const placements = {};
  const signs = [];
  const colliders = [];
  const walls = [];

  // --- Run-Fabrik ---
  // Ein Run ist eine Regalreihe; Segment j liegt bei lokalem x = (j-(S-1)/2)*SEG_W, Lokal-x zeigt nach (cos yaw, -sin yaw).
  function makeRun(o) {
    const run = {
      id: `r${runs.length}`, axis: o.axis, cx: o.cx, cz: o.cz, segs: o.segs.length, depth: o.double ? UNIT_DEPTH : WALL_DEPTH,
      double: o.double, low: !!o.low, rows: o.low ? spec.rowsLow : spec.rowsTall, h: o.low ? H_LOW : H_TALL, yaw: o.yaw, rev: !!o.rev, style: o.style, segments: [],
    };
    const S = run.segs;
    const dx = Math.cos(o.yaw);
    const dz = -Math.sin(o.yaw);
    const nx = Math.sin(o.yaw);
    const nz = Math.cos(o.yaw);
    const rows = run.low ? spec.rowsLow : spec.rowsTall;
    o.segs.forEach((sg, j) => {
      const lx = (o.rev ? -1 : 1) * (j - (S - 1) / 2) * SEG_W;
      const sx = o.cx + dx * lx;
      const sz = o.cz + dz * lx;
      const seg = { index: j, dept: sg.dept.id, color: sg.dept.color, label: sg.dept.label, lx, x: sx, z: sz, faces: [] };
      const sides = o.double ? ['A', 'B'] : ['A'];
      for (const side of sides) {
        const sgn = side === 'A' ? 1 : -1;
        const fx = sx + nx * sgn * (run.depth / 2);
        const fz = sz + nz * sgn * (run.depth / 2);
        const yaw = side === 'A' ? o.yaw : o.yaw + Math.PI;
        const fnx = Math.sin(yaw);
        const fnz = Math.cos(yaw);
        const items = sg[side] || [];
        const face = {
          index: faces.length, id: `f${faces.length}`, run: run.id, seg: j, side, dept: sg.dept.id, kind: sg.dept.kind, color: sg.dept.color,
          x: fx, z: fz, yaw: ((yaw % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI), nx: Math.round(fnx * 1e6) / 1e6, nz: Math.round(fnz * 1e6) / 1e6,
          rows, low: run.low, slots: fillSlots(items, rows, spec.cols),
          stand: { x: fx + fnx * 0.85, z: fz + fnz * 0.85, yaw },
        };
        face.slots.forEach((id, idx) => {
          if (id != null) (placements[id] || (placements[id] = [])).push({ face: face.index, slot: idx, dept: face.dept });
        });
        faces.push(face);
        seg.faces.push(face.index);
      }
      run.segments.push(seg);
    });
    const half = (run.axis === 'z' ? { x: run.depth / 2, z: (S * SEG_W) / 2 } : { x: (S * SEG_W) / 2, z: run.depth / 2 });
    run.rect = { x0: run.cx - half.x, z0: run.cz - half.z, x1: run.cx + half.x, z1: run.cz + half.z, kind: 'shelf', run: run.id };
    runs.push(run);
    colliders.push(run.rect);
    return run;
  }

  // Segmentlisten je Abteilung: [{ dept, A:[items], B:[items] }]
  function deptSegs(dept, double) {
    const S = runSegCount(dept, double, spec);
    const out = [];
    if (double) {
      const parts = chunk(dept.itemIds, S * 2);
      for (let j = 0; j < S; j++) out.push({ dept, A: parts[j], B: parts[S + j] });
    } else {
      const parts = chunk(dept.itemIds, S);
      for (let j = 0; j < S; j++) out.push({ dept, A: parts[j] });
    }
    return out;
  }
  const flat = (list, double) => list.flatMap((x) => deptSegs(x, double));
  function splitRuns(segs, cap) {
    const out = [];
    for (let i = 0; i < segs.length; i += cap) out.push(segs.slice(i, i + cap));
    return out;
  }

  // --- Freie Gänge der Hauptzone (Nord-Süd, doppelseitig) ---
  splitRuns(flat(freeD, true), r).forEach((chunkSegs, i) => {
    const cx = 0.3 + aisle + UNIT_DEPTH / 2 + i * (UNIT_DEPTH + aisle);
    makeRun({ axis: 'z', cx, cz: zMainS - (chunkSegs.length * SEG_W) / 2, double: true, yaw: HALF_PI, segs: chunkSegs, style: 'wood' });
  });

  // --- Serien-Wand (einseitig, West dann Ost) ---
  {
    const wallSegs = flat(seriesD, false);
    const west = wallSegs.slice(0, r);
    const east = wallSegs.slice(r, 2 * r);
    if (west.length) {
      makeRun({ axis: 'z', cx: WALL_DEPTH / 2, cz: zMainS - (west.length * SEG_W) / 2, double: false, yaw: HALF_PI, segs: west, style: 'wall' });
    }
    if (east.length) {
      makeRun({ axis: 'z', cx: W - WALL_DEPTH / 2, cz: zMainS - (east.length * SEG_W) / 2, double: false, yaw: -HALF_PI, rev: true, segs: east, style: 'wall' });
    }
  }

  // --- Kinder-Ecke (hinten links, niedrige bunte Regale) ---
  splitRuns(flat(kidsD, true), rb).forEach((chunkSegs, i) => {
    const cx = 0.3 + AISLE_BACK + UNIT_DEPTH / 2 + i * (UNIT_DEPTH + AISLE_BACK);
    makeRun({ axis: 'z', cx, cz: band - 1.5 - (chunkSegs.length * SEG_W) / 2, double: true, low: true, yaw: HALF_PI, segs: chunkSegs, style: 'kids' });
  });

  // --- Ab-18-Raum (hinten rechts, abgetrennt) ---
  const xs = W - wa; // Westwand des Raums
  splitRuns(flat(adultD, true), rb).forEach((chunkSegs, i) => {
    const cx = xs + WALL_T + AISLE_BACK + UNIT_DEPTH / 2 + i * (UNIT_DEPTH + AISLE_BACK);
    makeRun({ axis: 'z', cx, cz: band - 1.5 - (chunkSegs.length * SEG_W) / 2, double: true, yaw: HALF_PI, segs: chunkSegs, style: 'adult' });
  });

  // --- Neuheiten (Ost-West-Regal vor den Gängen, direkt am Eingang) ---
  const newX0 = 2.6;
  const newSegs = flat(newD, true);
  let newRun = null;
  if (newSegs.length) {
    newRun = makeRun({ axis: 'x', cx: newX0 + (newSegs.length * SEG_W) / 2, cz: D - 3.4, double: true, yaw: 0, segs: newSegs, style: 'new' });
  }

  // --- Wände ---
  const doorW = 2.2;
  const door = { x0: W / 2 - doorW / 2, x1: W / 2 + doorW / 2, w: doorW };
  const adultDoor = { x0: xs + WALL_T + 0.05, x1: xs + WALL_T + 1.65 };
  walls.push(
    { x0: -WALL_T, z0: -WALL_T, x1: W + WALL_T, z1: 0, h: CEIL_H, kind: 'outer-n' },
    { x0: -WALL_T, z0: D, x1: W + WALL_T, z1: D + WALL_T, h: CEIL_H, kind: 'outer-s' },
    { x0: -WALL_T, z0: 0, x1: 0, z1: D, h: CEIL_H, kind: 'outer-w' },
    { x0: W, z0: 0, x1: W + WALL_T, z1: D, h: CEIL_H, kind: 'outer-e' },
  );
  if (sAdult > 0) {
    walls.push(
      { x0: xs, z0: 0, x1: xs + WALL_T, z1: band, h: CEIL_H, kind: 'adult-w' },
      { x0: adultDoor.x1, z0: band - WALL_T, x1: W, z1: band, h: CEIL_H, kind: 'adult-s' },
    );
  }
  for (const wl of walls) colliders.push({ ...wl, kind: 'wall' });

  // --- Kasse (vorne rechts) ---
  const counter = { x0: W - 4.6, z0: D - 3.5, x1: W, z1: D - 2.8, kind: 'counter' };
  const counterSide = { x0: W - 4.7, z0: D - 2.8, x1: W - 4.6, z1: D, kind: 'counter' };
  colliders.push(counter, counterSide);
  const register = { x: W - 2.6, z: D - 4.3, yaw: Math.PI };

  // --- Schilder ---
  const signW = (label) => Math.min(2.0, Math.max(1.3, 0.55 + label.length * 0.16));
  const mkSign = (o) => signs.push({ id: `s${signs.length}`, y: 2.4, h: 0.5, kind: 'hang', ...o });
  for (const run of runs) {
    let prev = null;
    let wallIdx = 0;
    run.segments.forEach((seg) => {
      if (seg.dept === prev) return;
      prev = seg.dept;
      const w = signW(seg.label);
      if (run.style === 'wall') {
        const west = run.yaw > 0;
        // Wandschilder benachbarter Abteilungen (1 Segment = 1,2 m) in zwei Höhen versetzt, damit sie sich nicht überdecken
        mkSign({ text: seg.label, color: seg.color, dept: seg.dept, kind: 'wall', x: west ? 0.03 : W - 0.03, z: seg.z, yaw: west ? HALF_PI : -HALF_PI, w: Math.min(w, 1.9), y: wallIdx++ % 2 ? 2.22 : 2.72 });
      } else if (run.axis === 'z') {
        if (seg.index === 0) {
          // ein hängendes Schild pro Gang-Kopf (Südende), hoch und frei von weiteren Ebenen in der Sichtachse
          mkSign({ text: seg.label, color: seg.color, dept: seg.dept, x: run.cx, z: seg.z + SEG_W / 2 - 0.05, yaw: 0, w, y: 2.62 });
        } else {
          // weitere Abteilungen im Gang: flaches Schild auf dem Regal, zu den Gängen gerichtet, ein Schild je Abteilung
          const count = run.segments.filter((q) => q.dept === seg.dept).length;
          mkSign({ text: seg.label, color: seg.color, dept: seg.dept, kind: 'top', x: run.cx, z: seg.z - ((count - 1) * SEG_W) / 2, yaw: HALF_PI, w: Math.min(1.9, Math.max(1.1, count * SEG_W - 0.1)), y: 2.3 });
        }
      } else {
        mkSign({ text: seg.label, color: seg.color, dept: seg.dept, x: run.cx, z: run.cz, yaw: 0, w: 2.2, y: 2.35 });
      }
    });
  }
  mkSign({ text: 'KASSE', color: '#ff4fa3', dept: 'register', x: W - 2.3, z: D - 3.15, yaw: 0, w: 1.5 });
  if (sAdult > 0) mkSign({ text: 'AB 18', color: '#ff2d2d', dept: 'adult-door', kind: 'door', x: (adultDoor.x0 + adultDoor.x1) / 2, z: band - 0.03, yaw: 0, w: 1.5, y: 2.55 });
  mkSign({ text: 'VIDEOTHEK LENZ', color: '#35e6ff', dept: 'brand', kind: 'wall', x: W / 2, z: 0.03, yaw: 0, w: 3.6, y: 2.5 });

  // --- Zonen ---
  const zones = {};
  const zone = (id, o) => { zones[id] = { id, ...o }; };
  const box = (x0, z0, x1, z1) => ({ x0, z0, x1, z1 });
  zone('entrance', { label: 'Eingang', x: W / 2, z: D - 1.4, yaw: 0, rect: box(W / 2 - 1.6, D - 2.4, W / 2 + 1.6, D - 0.4) });
  zone('register', {
    label: 'Kasse', ...register, rect: box(W - 4.6, D - 4.9, W - 1.7, D - 2.8), counter: { ...counter },
  });
  for (const dp of depts) {
    const f = faces.find((q) => q.dept === dp.id);
    if (f) zone(`dept:${dp.id}`, { label: dp.label, x: f.stand.x, z: f.stand.z, yaw: f.stand.yaw, rect: box(f.stand.x - 0.8, f.stand.z - 0.8, f.stand.x + 0.8, f.stand.z + 0.8) });
  }
  const kidsFace = faces.find((q) => q.kind === 'kids');
  if (kidsFace) zone('kids', { label: 'Kinder-Ecke', x: kidsFace.stand.x, z: kidsFace.stand.z, yaw: kidsFace.stand.yaw, rect: box(0.3, 0.3, wk, band - 0.3) });
  if (sAdult > 0) zone('adult', { label: 'Ab 18', x: (adultDoor.x0 + adultDoor.x1) / 2, z: band + 0.9, yaw: 0, rect: box(xs + WALL_T, 0, W, band - WALL_T) });
  // Reservierte Zonen für spätere Meilensteine (leer; Kollider legen die Module an). Alle Rechtecke frei von Regal-Kollidern.
  const midX0 = wk + 0.3;
  const midX1 = Math.max(midX0, xs - 0.3);
  const staffX = (wk + xs) / 2;
  zone('cashier', { label: 'Kassierer-Platz', reserved: true, x: W - 2.9, z: D - 1.6, yaw: Math.PI, rect: box(W - 4.4, D - 2.4, W - 1.4, D - 0.6) });
  zone('reserve', { label: 'Reservierungsfach', reserved: true, x: W - 0.7, z: D - 1.5, yaw: -HALF_PI, rect: box(W - 1.2, D - 2.6, W - 0.2, D - 0.6) });
  zone('returns', { label: 'Rückgabe-Wagen', reserved: true, x: W - 1.0, z: D - 4.3, yaw: Math.PI, rect: box(W - 1.6, D - 4.9, W - 0.4, D - 3.7) });
  zone('snack', { label: 'Snack-Theke', reserved: true, x: 1.1, z: D - 2.2, yaw: -HALF_PI, rect: box(0.3, D - 3.6, 2.0, D - 0.8) });
  zone('tv', { label: 'TV-Ecke', reserved: true, x: (midX0 + midX1) / 2, z: band * 0.5 + 0.7, yaw: 0, rect: box(midX0, 1.4, midX1, band - 0.8) });
  zone('staff', { label: 'Mitarbeiter-Tür', reserved: true, x: staffX, z: 1.2, yaw: 0, rect: box(staffX - 0.6, 0, staffX + 0.6, 1.2) });
  zone('window', { label: 'Schaufenster links', reserved: true, x: (1.2 + door.x0 - 0.7) / 2, z: D - 0.6, yaw: 0, rect: box(1.2, D - 1.0, door.x0 - 0.7, D) });
  zone('window2', { label: 'Schaufenster rechts', reserved: true, x: (door.x1 + 0.7 + W - 1.2) / 2, z: D - 0.6, yaw: 0, rect: box(door.x1 + 0.7, D - 1.0, W - 1.2, D) });

  // Blickpunkte (zones()/Debug): von dort schaut man auf das Objekt; nie hinter dem Tresen
  const look = (fx, fz, tx, tz) => Math.atan2(-(tx - fx), -(tz - fz));
  const view = (id, x, z, tx, tz) => { if (zones[id]) zones[id].view = { x, z, yaw: look(x, z, tx, tz) }; };
  view('returns', W - 2.8, D - 4.3, W - 1.0, D - 4.3);
  view('reserve', W - 1.8, D - 4.1, W - 0.3, D - 1.6);
  view('cashier', W - 2.9, D - 4.2, W - 2.9, D - 1.6);
  view('snack', 3.4, D - 2.2, 1.1, D - 2.2);
  view('staff', staffX, 3.2, staffX, 0);
  view('tv', midX0 - 0.2, (1.4 + band - 0.8) / 2, midX1 + 0.3, (1.4 + band - 0.8) / 2);
  view('window', zones.window.x, D - 2.6, zones.window.x, D);
  view('window2', zones.window2.x, D - 2.6, zones.window2.x, D);

  // --- Navigationsraster ---
  const bounds = { x0: 0, z0: 0, x1: W, z1: D };
  const nav = makeNavGrid(bounds, colliders, NAV_RADIUS, NAV_CELL);

  // --- Deckenpaneele (Leuchtstoffröhren) ---
  const panels = [];
  const stepX = 2.9;
  const stepZ = 3.2;
  for (let z = stepZ / 2; z < D; z += stepZ) {
    for (let x = stepX / 2; x < W; x += stepX) panels.push({ x, z, w: 1.2, d: 0.3 });
  }

  return {
    spec, w: W, d: D, ceilH: CEIL_H, band, zMainN, zMainS, rowSegs: r, rows: k, aisle,
    runs, faces, walls, colliders, signs, zones, nav, panels, placements,
    spawn: { x: W / 2, z: D - 1.4, yaw: 0 },
    pc: { x: W - 3.5, z: (counter.z0 + counter.z1) / 2 }, // Kassen-PC (build-props.js und modules/terminal.js)
    door, adultDoor: sAdult > 0 ? adultDoor : null, counter, register, newRun,
    adultRoom: sAdult > 0 ? { x0: xs, z0: 0, x1: W, z1: band } : null,
    kidsRoom: sKids > 0 ? { x0: 0, z0: 0, x1: wk, z1: band } : null,
  };
}

/** Navigationsraster aus den aktuellen Kollidern neu berechnen (nach addCollider/removeCollider der Module). */
export function rebuildNav(layout) {
  layout.nav = makeNavGrid({ x0: 0, z0: 0, x1: layout.w, z1: layout.d }, layout.colliders, NAV_RADIUS, NAV_CELL);
  return layout.nav;
}
