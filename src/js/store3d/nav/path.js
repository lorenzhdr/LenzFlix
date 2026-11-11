// VIDEOTHEK LENZ · Navigation (rein, ohne three): Raster, A*, Pfadglättung, Kreis-gegen-Rechteck-Kollision.
// Rechtecke: { x0, z0, x1, z1 } in Metern (x Osten, z Süden).

/** Navigationsraster: Zelle blockiert, wenn der Zellmittelpunkt näher als `radius` an einem Rechteck liegt. */
export function makeNavGrid(bounds, rects, radius = 0.32, cell = 0.25) {
  const ox = bounds.x0;
  const oz = bounds.z0;
  const cols = Math.max(1, Math.ceil((bounds.x1 - bounds.x0) / cell));
  const rows = Math.max(1, Math.ceil((bounds.z1 - bounds.z0) / cell));
  const blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    const z = oz + (r + 0.5) * cell;
    for (let c = 0; c < cols; c++) {
      const x = ox + (c + 0.5) * cell;
      if (x < bounds.x0 + radius || x > bounds.x1 - radius || z < bounds.z0 + radius || z > bounds.z1 - radius) {
        blocked[r * cols + c] = 1;
      }
    }
  }
  for (const q of rects) {
    const c0 = Math.max(0, Math.floor((q.x0 - radius - ox) / cell));
    const c1 = Math.min(cols - 1, Math.ceil((q.x1 + radius - ox) / cell));
    const r0 = Math.max(0, Math.floor((q.z0 - radius - oz) / cell));
    const r1 = Math.min(rows - 1, Math.ceil((q.z1 + radius - oz) / cell));
    for (let r = r0; r <= r1; r++) {
      const z = oz + (r + 0.5) * cell;
      for (let c = c0; c <= c1; c++) {
        const x = ox + (c + 0.5) * cell;
        const dx = Math.max(q.x0 - x, 0, x - q.x1);
        const dz = Math.max(q.z0 - z, 0, z - q.z1);
        if (dx * dx + dz * dz < radius * radius) blocked[r * cols + c] = 1;
      }
    }
  }
  return { cell, ox, oz, cols, rows, blocked, radius };
}

export function worldToCell(nav, x, z) {
  return [Math.floor((x - nav.ox) / nav.cell), Math.floor((z - nav.oz) / nav.cell)];
}

export function cellCenter(nav, c, r) {
  return { x: nav.ox + (c + 0.5) * nav.cell, z: nav.oz + (r + 0.5) * nav.cell };
}

export function isFree(nav, x, z) {
  const [c, r] = worldToCell(nav, x, z);
  if (c < 0 || r < 0 || c >= nav.cols || r >= nav.rows) return false;
  return nav.blocked[r * nav.cols + c] === 0;
}

/** Nächste freie Zelle (Ringsuche); null wenn keine im Umkreis `maxR` Zellen. */
export function nearestFree(nav, x, z, maxR = 12) {
  const [c0, r0] = worldToCell(nav, x, z);
  let best = null;
  let bestD = Infinity;
  for (let rad = 0; rad <= maxR; rad++) {
    for (let dr = -rad; dr <= rad; dr++) {
      for (let dc = -rad; dc <= rad; dc++) {
        if (Math.max(Math.abs(dr), Math.abs(dc)) !== rad) continue;
        const c = c0 + dc;
        const r = r0 + dr;
        if (c < 0 || r < 0 || c >= nav.cols || r >= nav.rows || nav.blocked[r * nav.cols + c]) continue;
        const p = cellCenter(nav, c, r);
        const d = (p.x - x) ** 2 + (p.z - z) ** 2;
        if (d < bestD) { bestD = d; best = p; }
      }
    }
    if (best) return best;
  }
  return null;
}

/** Sichtlinie: alle Stützpunkte im Abstand der halben Zellgröße frei. */
export function lineClear(nav, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(len / (nav.cell * 0.5)));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    if (!isFree(nav, a.x + dx * t, a.z + dz * t)) return false;
  }
  return true;
}

/** Pfadglättung: von jedem Punkt so weit wie möglich per Sichtlinie springen. */
export function smoothPath(nav, pts) {
  if (pts.length <= 2) return pts.slice();
  const out = [pts[0]];
  let i = 0;
  while (i < pts.length - 1) {
    let j = pts.length - 1;
    while (j > i + 1 && !lineClear(nav, pts[i], pts[j])) j--;
    out.push(pts[j]);
    i = j;
  }
  return out;
}

class MinHeap {
  constructor() { this.ids = []; this.keys = []; }
  get size() { return this.ids.length; }
  push(id, key) {
    const { ids, keys } = this;
    let i = ids.length;
    ids.push(id); keys.push(key);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (keys[p] <= key) break;
      ids[i] = ids[p]; keys[i] = keys[p]; i = p;
    }
    ids[i] = id; keys[i] = key;
  }
  pop() {
    const { ids, keys } = this;
    const top = ids[0];
    const id = ids.pop();
    const key = keys.pop();
    const n = ids.length;
    if (n > 0) {
      let i = 0;
      for (;;) {
        let c = i * 2 + 1;
        if (c >= n) break;
        if (c + 1 < n && keys[c + 1] < keys[c]) c++;
        if (keys[c] >= key) break;
        ids[i] = ids[c]; keys[i] = keys[c]; i = c;
      }
      ids[i] = id; keys[i] = key;
    }
    return top;
  }
}

/**
 * A* (8 Nachbarn, kein Eckenschneiden) von `from` nach `to` (Weltkoordinaten).
 * Start/Ziel werden bei Bedarf auf die nächste freie Zelle gezogen. Rückgabe: geglättete Punktliste
 * (ohne den Startpunkt selbst) oder null, wenn kein Weg existiert.
 */
export function findPath(nav, from, to) {
  const s = isFree(nav, from.x, from.z) ? from : nearestFree(nav, from.x, from.z);
  const g = isFree(nav, to.x, to.z) ? to : nearestFree(nav, to.x, to.z);
  if (!s || !g) return null;
  const { cols, rows, blocked } = nav;
  const [sc, sr] = worldToCell(nav, s.x, s.z);
  const [gc, gr] = worldToCell(nav, g.x, g.z);
  const start = sr * cols + sc;
  const goal = gr * cols + gc;
  if (start === goal) return [{ x: g.x, z: g.z }];
  const gScore = new Float32Array(cols * rows).fill(Infinity);
  const parent = new Int32Array(cols * rows).fill(-1);
  const closed = new Uint8Array(cols * rows);
  const heap = new MinHeap();
  const h = (c, r) => {
    const dx = Math.abs(c - gc);
    const dz = Math.abs(r - gr);
    return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz);
  };
  gScore[start] = 0;
  heap.push(start, h(sc, sr));
  const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  let found = false;
  while (heap.size) {
    const cur = heap.pop();
    if (closed[cur]) continue;
    closed[cur] = 1;
    if (cur === goal) { found = true; break; }
    const cc = cur % cols;
    const cr = (cur / cols) | 0;
    for (const [dc, dr] of DIRS) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      const ni = nr * cols + nc;
      if (blocked[ni] || closed[ni]) continue;
      if (dc !== 0 && dr !== 0 && (blocked[cr * cols + nc] || blocked[nr * cols + cc])) continue;
      const ng = gScore[cur] + (dc !== 0 && dr !== 0 ? Math.SQRT2 : 1);
      if (ng < gScore[ni]) {
        gScore[ni] = ng;
        parent[ni] = cur;
        heap.push(ni, ng + h(nc, nr));
      }
    }
  }
  if (!found) return null;
  const cells = [];
  for (let i = goal; i !== -1; i = parent[i]) cells.push(i);
  cells.reverse();
  const pts = cells.map((i) => cellCenter(nav, i % cols, (i / cols) | 0));
  pts[0] = { x: s.x, z: s.z };
  pts[pts.length - 1] = { x: g.x, z: g.z };
  const sm = smoothPath(nav, pts);
  sm.shift();
  return sm;
}

/**
 * Kreis (Mittelpunkt x,z, Radius r) gegen Rechtecke: schiebt den Kreis aus allen Rechtecken heraus
 * (Gleiten entlang von Wänden). Rückgabe { x, z, hit }.
 */
export function resolveCircle(x, z, r, rects) {
  let hit = false;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (const q of rects) {
      if (x + r < q.x0 || x - r > q.x1 || z + r < q.z0 || z - r > q.z1) continue;
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
        // Mittelpunkt liegt im Rechteck: über die kürzeste Achse hinausschieben
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
    }
    if (!moved) break;
  }
  return { x, z, hit };
}
