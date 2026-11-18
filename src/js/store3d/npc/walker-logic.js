// VIDEOTHEK LENZ · Passanten-Zustandsautomat (rein, ohne three/DOM). Läuft auf dem Wegegraph aus pathgraph.js.
// Zustände: walk | wait (Ampel/Zebra) | browse (Schaufenster, Sackgassen-Ende) | stagger (getroffen/angerempelt) | flee (eilig weg).
// stepWalker(w, dt, env) → Ereignisliste [{ type: 'say', cat } | { type: 'bump' }]. env = {
//   graph, rand, signal: { walkMain, walkSide }, player: { x, z, speed } | null, zebraClear(edge) → bool, roadMid (z, trennt Nord-/Südgehweg) }
import { edgeDir, pointOn, chooseNext } from './pathgraph.js';
import { angDiff } from '../modules/m4-util.js';

export const SPUR_PATHS = new Set(['shopDoor', 'palastDoor', 'alleyMouth', 'kioskFront']);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const yawOf = (dx, dz) => Math.atan2(-dx, -dz);

/** Darf auf einer Kante mit Bedingung `wait` losgelaufen werden? */
export function canGo(wait, env, edge) {
  if (!wait) return true;
  const s = env.signal || {};
  if (wait === 'main') return !!s.walkMain;
  if (wait === 'side') return !!s.walkSide;
  if (wait === 'mid') return env.zebraClear ? !!env.zebraClear(edge) : true;
  return true;
}

export function createWalker(graph, rand, o = {}) {
  const edge = o.edge !== undefined ? o.edge : Math.floor(rand() * graph.edges.length);
  const e = graph.edges[edge];
  const dir = o.dir !== undefined ? o.dir : rand() < 0.5 ? 1 : -1;
  const s = o.s !== undefined ? o.s : rand() * e.len;
  const vBase = o.speed || 1.05 + rand() * 0.55;
  const w = {
    id: o.id !== undefined ? o.id : 0, edge, dir, s, vBase, v: vBase, rush: o.rush || 1, state: 'walk', timer: 0, pending: null,
    laneOff: (rand() - 0.5) * 1.0, lateral: 0, x: 0, z: 0, yaw: 0, anim: 'walk', bumpCool: 0, speakCool: 3 + rand() * 6, ignoreWaitTimer: 0,
    browseFace: null, recoil: { x: 0, z: 0 }, fleeT: 0, hitCount: 0,
  };
  place(w, graph);
  w.yaw = yawOf(...dirXZ(graph, w));
  w.lateral = w.laneOff;
  return w;
}

function dirXZ(g, w) { const d = edgeDir(g.edges[w.edge], w.dir); return [d.x, d.z]; }

/** Position aus Kante, s und Seitenversatz (Versatz klingt an den Kantenenden aus, damit Knoten sauber passiert werden). */
function place(w, g) {
  const e = g.edges[w.edge];
  const p = pointOn(e, w.dir, w.s);
  const d = edgeDir(e, w.dir);
  const fade = clamp(Math.min(w.s, e.len - w.s) / 0.8, 0, 1);
  const lat = w.lateral * fade;
  w.x = p.x - d.z * lat;
  w.z = p.z + d.x * lat;
}

/** Gehweg-Seite (Blickrichtung zum Schaufenster) */
const faceBuildings = (w, env) => (w.z < (env.roadMid || 0) ? 0 : Math.PI);

function arrive(w, env) {
  const g = env.graph;
  const e = g.edges[w.edge];
  const nodeId = w.dir === 1 ? e.b : e.a;
  const n = g.nodes[nodeId];
  if (n.edges.length === 1 && SPUR_PATHS.has(e.path)) {
    // Sackgasse am Gebäude: kurz stehen, dann umkehren
    w.pending = { edge: w.edge, dir: -w.dir };
    w.state = 'browse';
    w.timer = 1.6 + env.rand() * 2.6;
    w.browseFace = yawOf(...dirXZ(g, w));
    w.s = e.len;
    if (env.rand() < 0.5) return [{ type: 'say', cat: e.path === 'palastDoor' ? 'poster' : 'window' }];
    return [];
  }
  const nx = chooseNext(g, w.edge, nodeId, env.rand);
  w.edge = nx.edge;
  w.dir = nx.dir;
  w.s = 0;
  return [];
}

/** Ein Schritt. dt in s (bereits auf ≤ 0,25 begrenzt vom Aufrufer). */
export function stepWalker(w, dt, env) {
  const ev = [];
  const g = env.graph;
  w.bumpCool = Math.max(0, w.bumpCool - dt);
  w.speakCool = Math.max(0, w.speakCool - dt);
  const pl = env.player;
  w.recoil.x *= Math.exp(-dt * 5); w.recoil.z *= Math.exp(-dt * 5);

  if (w.state === 'stagger') {
    w.timer -= dt;
    w.anim = 'stagger';
    if (w.timer <= 0) {
      if (w.after === 'walk') { w.state = 'walk'; w.after = null; w.rush = 1; } else if (w.after === 'hold') { w.state = 'hold'; w.timer = 4; w.after = null; } else { w.state = 'flee'; w.fleeT = 6; w.rush = 1.9; w.anim = 'run'; }
    }
    place(w, g);
    return ev;
  }
  if (w.state === 'hold') { // hitzköpfig: steht und droht, der Aufrufer übernimmt per w.react; danach weiter
    w.timer -= dt;
    w.anim = 'idle';
    w.v = 0;
    if (w.timer <= 0) { w.state = 'walk'; w.rush = 1; }
    place(w, g);
    return ev;
  }
  if (w.state === 'browse') {
    w.timer -= dt;
    w.anim = 'idle';
    w.v = 0;
    const face = w.browseFace !== null ? w.browseFace : faceBuildings(w, env);
    w.yaw += angDiff(w.yaw, face) * Math.min(1, dt * 6);
    if (w.timer <= 0) {
      w.state = 'walk';
      w.browseFace = null;
      if (w.pending) { w.edge = w.pending.edge; w.dir = w.pending.dir; w.s = 0; w.pending = null; }
    }
    place(w, g);
    return ev;
  }

  let e = g.edges[w.edge];
  if (w.state === 'wait') {
    w.anim = 'idle';
    w.v = 0;
    const d = edgeDir(e, w.dir);
    w.yaw += angDiff(w.yaw, yawOf(d.x, d.z)) * Math.min(1, dt * 6);
    if (canGo(e.wait, env, e)) { w.state = w.fleeT > 0 ? 'flee' : 'walk'; w.ignoreWaitTimer = 0; } else { place(w, g); return ev; }
  }
  if (w.state === 'flee') { w.fleeT -= dt; if (w.fleeT <= 0) { w.state = 'walk'; w.rush = 1; } }

  // Warten vor der Kante (nur am Anfang)
  if (w.s <= 0.01 && e.wait && !canGo(e.wait, env, e)) {
    w.state = 'wait';
    w.anim = 'idle';
    w.v = 0;
    place(w, g);
    return ev;
  }

  const d = edgeDir(e, w.dir);
  const nx = -d.z;
  const nz = d.x;
  let slow = 1;
  let dodge = 0;
  if (pl) {
    const rx = pl.x - w.x;
    const rz = pl.z - w.z;
    const dist = Math.hypot(rx, rz);
    const fwd = rx * d.x + rz * d.z;
    const side = rx * nx + rz * nz;
    if (dist < 2.3 && fwd > -0.2 && Math.abs(side) < 1.0) dodge = (side >= 0 ? -1 : 1) * 0.85;
    if (dist < 1.3 && fwd > 0) slow = 0.55;
    if (dist < 0.62 && (pl.speed || 0) > 3 && w.bumpCool <= 0) {
      w.bumpCool = 3;
      w.state = 'stagger';
      w.timer = 0.8;
      w.fleeT = 0;
      w.rush = 1.3;
      w.recoil.x = rx !== 0 ? -rx / (dist || 1) * 1.2 : 0;
      w.recoil.z = rz !== 0 ? -rz / (dist || 1) * 1.2 : 0;
      ev.push({ type: 'bump' });
      if (w.speakCool <= 0) { ev.push({ type: 'say', cat: 'rammed' }); w.speakCool = 5; }
      place(w, g);
      return ev;
    }
    if (dist < 2.2 && w.speakCool <= 0 && env.rand() < dt * 0.25 && (pl.speed || 0) < 2) { ev.push({ type: 'say', cat: env.night ? 'night' : 'hello' }); w.speakCool = 12; }
  }
  const lim = e.wait ? 0.95 : 1.15;
  const wantLat = clamp((e.wait ? clamp(w.laneOff, -0.3, 0.3) : w.laneOff) + dodge, -lim, lim);
  w.lateral += (wantLat - w.lateral) * Math.min(1, dt * 3);

  // Gelegentlich am Schaufenster stehen bleiben (nur auf normalen Gehwegkanten)
  if (!e.wait && w.state === 'walk' && e.len > 4 && w.s > 1 && w.s < e.len - 1.2 && env.rand() < dt * 0.045 && !env.raining) {
    w.state = 'browse';
    w.timer = 3 + env.rand() * 4;
    w.browseFace = null;
    if (env.rand() < 0.45) ev.push({ type: 'say', cat: w.z > (env.roadMid || 0) ? 'poster' : 'window' });
    return ev;
  }

  // Tempo
  let tv = w.vBase * w.rush * slow;
  if (e.wait && w.s > 0.05) { const sg = env.signal || {}; const still = e.wait === 'main' ? sg.walkMain : e.wait === 'side' ? sg.walkSide : true; if (!still) tv *= 1.35; }
  w.v += (tv - w.v) * Math.min(1, dt * 4);
  w.s += w.v * dt;
  w.anim = w.v > 2.6 ? 'run' : w.v > 0.2 ? 'walk' : 'idle';
  if (w.s >= e.len) { w.s = e.len; place(w, g); const r = arrive(w, env); for (const x of r) ev.push(x); e = g.edges[w.edge]; }
  place(w, g);
  if (w.state === 'walk') {
    const dd = edgeDir(e, w.dir);
    w.yaw += angDiff(w.yaw, yawOf(dd.x, dd.z)) * Math.min(1, dt * 8);
  }
  return ev;
}

/**
 * Treffer: Walker taumelt. dir = Schlagrichtung (xz), wird als Rückstoß genutzt.
 * Temperament (4. Arg. oder w.temper, 'shy'|'normal'|'hot'): ohne Angabe/shy wie bisher (danach eilig weg, Rückgabe nur say).
 * normal → danach weiterlaufen (action 'scold'); hot → danach stehen ('hold', action 'threat'/'attack'; Angriff steuert der Aufrufer über w.react).
 */
export function hitWalker(w, dir, rand, temper = w.temper) {
  const mode = temper === 'normal' || temper === 'hot' ? temper : 'shy';
  w.state = 'stagger';
  w.timer = mode === 'shy' ? 1.0 : 0.6;
  w.rush = mode === 'shy' ? 1.9 : 1;
  w.fleeT = mode === 'shy' ? 6 : 0;
  w.after = mode === 'shy' ? null : mode === 'normal' ? 'walk' : 'hold';
  w.hitCount++;
  const l = Math.hypot(dir.x, dir.z) || 1;
  w.recoil.x = (dir.x / l) * 2.2;
  w.recoil.z = (dir.z / l) * 2.2;
  w.speakCool = 0;
  if (mode === 'normal') return { type: 'say', cat: 'bumped', action: 'scold' };
  if (mode === 'hot') return { type: 'say', cat: 'threat', action: w.hitCount > 1 ? 'attack' : 'threat' };
  return { type: 'say', cat: rand() < 0.35 && w.hitCount > 1 ? 'flee' : 'bumped' };
}

/** Kegel-Treffer: nächste Person im Kegel (±coneDeg) bis range in der xz-Ebene. people = [{x,z,...}] → { index, dist } | null. */
export function pickInCone(people, origin, dir, range = 1.6, coneDeg = 25) {
  const l = Math.hypot(dir.x, dir.z);
  if (l < 1e-4) return null;
  const dx = dir.x / l;
  const dz = dir.z / l;
  const cos = Math.cos((coneDeg * Math.PI) / 180);
  let best = null;
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    const rx = p.x - origin.x;
    const rz = p.z - origin.z;
    const dist = Math.hypot(rx, rz);
    if (dist > range) continue;
    if (dist > 0.25 && (rx * dx + rz * dz) / dist < cos) continue;
    if (!best || dist < best.dist) best = { index: i, dist };
  }
  return best;
}

/** Soll-Anzahl Passanten nach Qualität, Tageszeit und Regen. */
export function walkerCount(npcMax, tod, raining) {
  let n = npcMax;
  if (tod === 'night') n = Math.ceil(n * 0.5);
  else if (tod === 'dusk') n = Math.ceil(n * 0.8);
  if (raining) n = Math.ceil(n * 0.85);
  return Math.max(0, n);
}
