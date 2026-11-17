// VIDEOTHEK LENZ · Wegegraph der Passanten (rein, ohne three/DOM). Macht aus layout.city.sidewalkPaths (Polylinien, die sich an
// T-Punkten mitten im Segment treffen) einen Graphen: Segmente werden an T-Punkten geteilt, gleiche Punkte verschmolzen.
// Kante { id, a, b (Knotenindex), ax, az, bx, bz, len, wait, path }. Knoten { id, x, z, edges: [Kantenindex] }.
// wait = null | 'side' | 'main' | 'mid' (Zebrastreifen-Bedingung beim Betreten der Kante, in jede Richtung).

const KEY = 20; // Knoten-Schlüssel: auf 5 cm gerundet
const keyOf = (x, z) => `${Math.round(x * KEY)},${Math.round(z * KEY)}`;

/** Parameter t (0..1) des Punkts p auf Segment a–b, wenn p im Abstand < eps liegt, sonst -1. */
export function projectOn(a, b, p, eps = 0.06) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const l2 = dx * dx + dz * dz;
  if (l2 < 1e-9) return -1;
  const t = ((p.x - a.x) * dx + (p.z - a.z) * dz) / l2;
  if (t < 0 || t > 1) return -1;
  const qx = a.x + dx * t;
  const qz = a.z + dz * t;
  return Math.hypot(p.x - qx, p.z - qz) < eps ? t : -1;
}

export function buildGraph(paths) {
  const segs = [];
  const allPts = [];
  for (const p of paths || []) {
    for (const q of p.pts) allPts.push(q);
    for (let i = 0; i < p.pts.length - 1; i++) segs.push({ path: p.id, a: p.pts[i], b: p.pts[i + 1], wait: (p.waits && p.waits[i]) || null });
  }
  const nodes = [];
  const index = new Map();
  const node = (x, z) => {
    const k = keyOf(x, z);
    let i = index.get(k);
    if (i === undefined) { i = nodes.length; index.set(k, i); nodes.push({ id: i, x, z, edges: [] }); }
    return i;
  };
  const edges = [];
  for (const s of segs) {
    const ts = [0, 1];
    for (const q of allPts) {
      const t = projectOn(s.a, s.b, q);
      if (t > 0.001 && t < 0.999) ts.push(t);
    }
    ts.sort((x, y) => x - y);
    for (let i = 0; i < ts.length - 1; i++) {
      if (ts[i + 1] - ts[i] < 1e-4) continue;
      const ax = s.a.x + (s.b.x - s.a.x) * ts[i];
      const az = s.a.z + (s.b.z - s.a.z) * ts[i];
      const bx = s.a.x + (s.b.x - s.a.x) * ts[i + 1];
      const bz = s.a.z + (s.b.z - s.a.z) * ts[i + 1];
      const na = node(ax, az);
      const nb = node(bx, bz);
      if (na === nb) continue;
      const e = { id: edges.length, a: na, b: nb, ax: nodes[na].x, az: nodes[na].z, bx: nodes[nb].x, bz: nodes[nb].z, len: Math.hypot(bx - ax, bz - az), wait: s.wait, path: s.path };
      edges.push(e);
      nodes[na].edges.push(e.id);
      nodes[nb].edges.push(e.id);
    }
  }
  return { nodes, edges };
}

/** Alle Knoten vom Knoten 0 aus erreichbar? (Kanten ungerichtet) */
export function isConnected(g) {
  if (!g.nodes.length) return true;
  const seen = new Set([0]);
  const q = [0];
  while (q.length) {
    const n = g.nodes[q.pop()];
    for (const ei of n.edges) {
      const e = g.edges[ei];
      const o = e.a === n.id ? e.b : e.a;
      if (!seen.has(o)) { seen.add(o); q.push(o); }
    }
  }
  return seen.size === g.nodes.length;
}

/** Richtungsvektor (normiert) der Kante e in Laufrichtung dir (+1: a→b, −1: b→a). */
export function edgeDir(e, dir) {
  const l = e.len || 1;
  const s = dir >= 0 ? 1 : -1;
  return { x: ((e.bx - e.ax) / l) * s, z: ((e.bz - e.az) / l) * s };
}

/** Punkt auf Kante e im Abstand s vom Startknoten der Laufrichtung. */
export function pointOn(e, dir, s) {
  const t = Math.min(1, Math.max(0, s / (e.len || 1)));
  const ax = dir >= 0 ? e.ax : e.bx;
  const az = dir >= 0 ? e.az : e.bz;
  const bx = dir >= 0 ? e.bx : e.ax;
  const bz = dir >= 0 ? e.bz : e.az;
  return { x: ax + (bx - ax) * t, z: az + (bz - az) * t };
}

/**
 * Nächste Kante am Knoten `nodeId`, an dem man über Kante `fromEdge` ankam. Geradeaus bevorzugt, Stichwege (Sackgasse)
 * seltener; ohne Alternative Umkehr. Rückgabe { edge: Kantenindex, dir: +1|−1 }.
 */
export function chooseNext(g, fromEdge, nodeId, rand) {
  const n = g.nodes[nodeId];
  const from = g.edges[fromEdge];
  const incoming = from ? edgeDir(from, from.b === nodeId ? 1 : -1) : { x: 0, z: 0 };
  const cand = [];
  for (const ei of n.edges) {
    if (ei === fromEdge) continue;
    const e = g.edges[ei];
    const dir = e.a === nodeId ? 1 : -1;
    const d = edgeDir(e, dir);
    const dot = d.x * incoming.x + d.z * incoming.z;
    const far = g.nodes[dir === 1 ? e.b : e.a];
    const spur = far.edges.length === 1; // Sackgasse (Tür, Gasse, Kiosk)
    cand.push({ edge: ei, dir, w: (dot > 0.8 ? 3 : 1) * (spur ? 0.45 : 1) });
  }
  if (!cand.length) return { edge: fromEdge, dir: from && from.b === nodeId ? -1 : 1 };
  let sum = 0;
  for (const c of cand) sum += c.w;
  let r = rand() * sum;
  for (const c of cand) { r -= c.w; if (r <= 0) return { edge: c.edge, dir: c.dir }; }
  const c = cand[cand.length - 1];
  return { edge: c.edge, dir: c.dir };
}
