// VIDEOTHEK LENZ · Kollision mit Höhen (rein, ohne three, ohne Import aus path.js): Kollider-Format, Kreis-gegen-Rechteck mit
// Höhenfilter, Bodenhöhe, Decke, Hochziehen (Mantle) und Raster-Hash. Fehlende Höhe = 0..Infinity = blockiert immer
// (Verhalten wie nav/path.js resolveCircle).
//
// Kollider: { x0, z0, x1, z1, kind?, y0 = 0, y1 = Infinity, top?, dynamic? }
//   y0/y1     Unter-/Oberkante in m (Boden = 0).
//   top       nur bei endlichem y1: false = Oberseite nicht begehbar (Zaun, Wand); Standard true.
//   dynamic   true = bewegt sich (Auto, NPC, Kiste): nicht im Nav-Raster, nicht im Raster-Hash, linear geprüft (layout.dyn).
// Quelle (`src`) der Funktionen: Array von Kollidern ODER Index (createColliderIndex) ODER { index, dyn: Set|Array }.

/** Stufenhöhe: Kanten bis hierhin laufen ohne Sprung. */
export const STEP_H = 0.35;
/** Körperhöhe für Deckenprüfung und Blockade. */
export const BODY_H = 1.7;
/** Maximale Hochziehhöhe (Oberkante über den Füßen). */
export const MANTLE_H = 1.3;
/** Fußradius für die Bodenprüfung. */
const FOOT_R = 0.15;
export const EPS = 1e-4;
/** Körperradius (Kreis am Boden). */
export const RADIUS = 0.28;
/** Gravitation in m/s^2. */
export const GRAV = 20;
/** Absprunggeschwindigkeit: Scheitel v^2 / (2 g) = 0,99 m. */
export const JUMP_V = 6.3;
/** Terminalgeschwindigkeit (negativ). */
export const VY_MIN = -30;
/** Sekunden nach dem Verlassen einer Kante, in denen noch gesprungen werden darf. */
export const COYOTE = 0.10;
/** Sekunden, die ein Sprungwunsch vor der Landung gemerkt wird. */
export const JUMP_BUF = 0.12;
/** Horizontal-Glättung in der Luft (am Boden 11 bzw. 14). */
export const AIR_K = 3;
/** Dauer des Hochziehens in Sekunden. */
export const MANTLE_T = 0.28;
/** Schubs-Stärke (Mehrspieler, 1.16.0): Faktor für Body.knock bei voller Stärke (pu.s = 100); nur Stoß, kein Schaden. */
export const PUSH_KNOCK = 0.9;

const y0Of = (q) => (q.y0 === undefined ? 0 : q.y0);
const y1Of = (q) => (q.y1 === undefined ? Infinity : q.y1);

/** Blockiert Kollider q einen Körper mit den Füßen auf feetY? (Oberkante über Stufenhöhe UND Unterkante unter dem Kopf.) */
export function colliderBlocks(q, feetY, bodyH = BODY_H) {
  // top:false (Oberseite nicht begehbar): auch nicht überspringbar, solange die Füße unter der Oberkante sind
  // (sonst gleitet der Sprung über das Möbel und die Landung schiebt ruckartig seitlich heraus)
  if (q.top === false && y1Of(q) > STEP_H + EPS && y1Of(q) > feetY + EPS) return y0Of(q) < feetY + bodyH - EPS;
  return y1Of(q) > feetY + STEP_H + EPS && y0Of(q) < feetY + bodyH - EPS;
}

/** Blockiert Kollider q das Navigationsraster (Boden-Hindernis)? Dächer, Brücken und dynamische nie. */
export function navBlocks(q) {
  if (q.dynamic) return false;
  return y0Of(q) < STEP_H && y1Of(q) > STEP_H;
}

// --- Raster-Hash ---
const cellKey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

/**
 * Räumlicher Hash (Zellgröße `cell` m) für statische Kollider; jeder Kollider steht in allen überdeckten Zellen.
 * Dynamische Kollider (dynamic: true) werden nicht aufgenommen (add liefert false).
 */
export function createColliderIndex(rects = [], cell = 4) {
  const map = new Map(); // Zellschlüssel -> Kollider[]
  const keysOf = new Map(); // Kollider -> Zellschlüssel[] (für remove nach moveCollider)
  const seen = new Set();
  const cellsOf = (q) => {
    const out = [];
    const c0 = Math.floor(q.x0 / cell);
    const c1 = Math.floor(q.x1 / cell);
    const r0 = Math.floor(q.z0 / cell);
    const r1 = Math.floor(q.z1 / cell);
    for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) out.push(cellKey(c, r));
    return out;
  };
  const idx = {
    cell,
    get size() { return keysOf.size; },
    add(q) {
      if (!q || q.dynamic || keysOf.has(q)) return false;
      const keys = cellsOf(q);
      for (const k of keys) {
        const l = map.get(k);
        if (l) l.push(q); else map.set(k, [q]);
      }
      keysOf.set(q, keys);
      return true;
    },
    remove(q) {
      const keys = keysOf.get(q);
      if (!keys) return false;
      for (const k of keys) {
        const l = map.get(k);
        if (!l) continue;
        const i = l.indexOf(q);
        if (i >= 0) l.splice(i, 1);
        if (!l.length) map.delete(k);
      }
      keysOf.delete(q);
      return true;
    },
    /** Nach dem Verschieben (Rechteck mutiert): neu einsortieren. */
    update(q) { idx.remove(q); return idx.add(q); },
    has(q) { return keysOf.has(q); },
    rebuild(list = []) {
      map.clear();
      keysOf.clear();
      for (const q of list) idx.add(q);
    },
    /** cb(q) je Kollider genau einmal, dessen Zellen das Rechteck berühren (Kandidaten, kein exakter Test). */
    query(x0, z0, x1, z1, cb) {
      seen.clear();
      const c0 = Math.floor(x0 / cell);
      const c1 = Math.floor(x1 / cell);
      const r0 = Math.floor(z0 / cell);
      const r1 = Math.floor(z1 / cell);
      for (let r = r0; r <= r1; r++) {
        for (let c = c0; c <= c1; c++) {
          const l = map.get(cellKey(c, r));
          if (!l) continue;
          for (let i = 0; i < l.length; i++) {
            const q = l[i];
            if (seen.has(q)) continue;
            seen.add(q);
            cb(q);
          }
        }
      }
    },
  };
  for (const q of rects) idx.add(q);
  return idx;
}

/** Kandidaten um (x, z) im Abstand r aus `src` in `out` sammeln (Array: alle, Index: Zellen + dyn). */
function gather(src, x0, z0, x1, z1, out) {
  out.length = 0;
  if (Array.isArray(src)) return src; // linear, ohne Kopie (nie verändern)
  if (!src) return out;
  const index = typeof src.query === 'function' ? src : src.index;
  if (index) index.query(x0, z0, x1, z1, (q) => { out.push(q); });
  const dyn = src.dyn;
  if (dyn) for (const q of dyn) out.push(q);
  return out;
}

const scratch = [];

/**
 * Kreis (x, z, r) gegen Kollider schieben, die einen Körper mit den Füßen auf feetY blockieren (Gleiten an Wänden).
 * Rückgabe { x, z, hit, rect, mantle }: rect = zuletzt geschnittener Kollider, mantle = erster geschnittener Kollider mit
 * endlichem y1, y1 - feetY in (STEP_H, MANTLE_H] und top !== false (sonst null).
 */
export function resolveCircle3(x, z, r, src, feetY = 0, bodyH = BODY_H) {
  let hit = false;
  let rect = null;
  let mantle = null;
  for (let pass = 0; pass < 3; pass++) {
    const list = gather(src, x - r, z - r, x + r, z + r, scratch);
    let moved = false;
    for (let i = 0; i < list.length; i++) {
      const q = list[i];
      if (x + r < q.x0 || x - r > q.x1 || z + r < q.z0 || z - r > q.z1) continue;
      if (!colliderBlocks(q, feetY, bodyH)) continue;
      const nx = Math.min(Math.max(x, q.x0), q.x1);
      const nz = Math.min(Math.max(z, q.z0), q.z1);
      const dx = x - nx;
      const dz = z - nz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= r * r) continue;
      if (d2 > 1e-10) {
        const d = Math.sqrt(d2);
        x = nx + (dx / d) * r;
        z = nz + (dz / d) * r;
      } else {
        const left = x - q.x0;
        const right = q.x1 - x;
        const top = z - q.z0;
        const bottom = q.z1 - z;
        const m = Math.min(left, right, top, bottom);
        if (m === left) x = q.x0 - r;
        else if (m === right) x = q.x1 + r;
        else if (m === top) z = q.z0 - r;
        else z = q.z1 + r;
      }
      moved = true;
      hit = true;
      rect = q;
      if (!mantle) {
        const y1 = y1Of(q);
        if (Number.isFinite(y1) && q.top !== false && y1 - feetY > STEP_H && y1 - feetY <= MANTLE_H) mantle = q;
      }
    }
    if (!moved) break;
  }
  scratch.length = 0;
  return { x, z, hit, rect, mantle };
}

/**
 * Bodenhöhe unter (x, z) für Füße auf feetY: höchste begehbare Oberkante y1 (endlich, top !== false, 0 <= y1 <= feetY + STEP_H),
 * deren Rechteck vom Fußkreis (FOOT_R) geschnitten wird. Ohne Treffer { y: 0, rect: null }.
 */
export function groundHeight(x, z, r, feetY, src) {
  let y = 0;
  let rect = null;
  const fr = FOOT_R;
  const list = gather(src, x - fr, z - fr, x + fr, z + fr, scratch);
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    const y1 = y1Of(q);
    if (!Number.isFinite(y1) || q.top === false || y1 < 0 || y1 > feetY + STEP_H + EPS) continue;
    const dx = Math.max(q.x0 - x, 0, x - q.x1);
    const dz = Math.max(q.z0 - z, 0, z - q.z1);
    if (dx * dx + dz * dz >= fr * fr) continue;
    if (!rect || y1 > y) { y = y1; rect = q; }
  }
  scratch.length = 0;
  return { y, rect };
}

/** Niedrigste Unterkante y0 über dem Kopfbereich (> feetY + STEP_H, < feetY + bodyH + 0.2) mit Überlappung, sonst Infinity. */
export function ceilingY(x, z, r, feetY, src, bodyH = BODY_H) {
  let best = Infinity;
  const list = gather(src, x - r, z - r, x + r, z + r, scratch);
  for (let i = 0; i < list.length; i++) {
    const q = list[i];
    const y0 = y0Of(q);
    if (y0 <= feetY + STEP_H || y0 >= feetY + bodyH + 0.2 || y0 >= best) continue;
    const dx = Math.max(q.x0 - x, 0, x - q.x1);
    const dz = Math.max(q.z0 - z, 0, z - q.z1);
    if (dx * dx + dz * dz >= r * r) continue;
    best = y0;
  }
  scratch.length = 0;
  return best;
}

/**
 * Hochzieh-Ziel an einer Kante in Richtung (dirx, dirz) (normiert) oder null.
 * Kandidat = Kollider, an den ein Probepunkt 0,1 m voraus stößt (resolveCircle3.mantle). Zielpunkt 0,32 m hinter der Kante
 * (ins Rechteck geklemmt, bei Rechteck schmaler als 2r in der Mitte); gültig, wenn dort auf Höhe y1 nichts blockiert
 * und über dem Kopf Platz bleibt.
 */
export function findMantle(x, z, r, dirx, dirz, feetY, src) {
  const len = Math.hypot(dirx, dirz);
  if (!(len > 1e-6)) return null;
  const dx = dirx / len;
  const dz = dirz / len;
  const probe = resolveCircle3(x + dx * 0.1, z + dz * 0.1, r, src, feetY);
  const q = probe.mantle;
  if (!q) return null;
  const y1 = y1Of(q);
  // Eintrittspunkt: nächster Punkt des Rechtecks zur Spielerposition
  const ex = Math.min(Math.max(x, q.x0), q.x1);
  const ez = Math.min(Math.max(z, q.z0), q.z1);
  let tx = ex + dx * 0.32;
  let tz = ez + dz * 0.32;
  const clampAxis = (v, lo, hi) => (hi - lo < 2 * r ? (lo + hi) / 2 : Math.min(Math.max(v, lo + 0.05), hi - 0.05));
  tx = clampAxis(tx, q.x0, q.x1);
  tz = clampAxis(tz, q.z0, q.z1);
  if (resolveCircle3(tx, tz, r, src, y1).hit) return null;
  if (!(ceilingY(tx, tz, r, y1, src) > y1 + BODY_H)) return null;
  return { rect: q, y1, x: tx, z: tz };
}
