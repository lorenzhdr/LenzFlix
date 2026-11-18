// VIDEOTHEK LENZ · Rowdy-Bande, reine Logik (1.18.0; ohne three/DOM, Zeit/Zufall injiziert): Spawn-Regel, Zustände, Aufenthaltsgrenzen.
// Zustände: idle → approach → taunt → threaten → attack → flee | beaten. Bereiche kommen als Rechtecke {x0,z0,x1,z1} aus layout.city
// (allowed = Zonen alley/yard/escape, forbidden = shop/doorway); in die Straße höchstens STREET_MARGIN m über den Rand.
export const GANG_MAX = 3;
export const STREET_MARGIN = 6;
export const ROWDY_HP = 60;
export const FLEE_HP = 0.25; // Anteil
export const ST = ['idle', 'approach', 'taunt', 'threaten', 'attack', 'flee', 'beaten'];

function fnv(s) {
  let h = 2166136261;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Anzahl Rowdys: nachts 2–3, abends 0–1, tags selten 0–1 (je Zeit-Seed, deterministisch). */
export function spawnCount(tod, seed) {
  const u = fnv(`gang:${tod}:${seed}`);
  if (tod === 'night') return u < 0.5 ? 2 : 3;
  if (tod === 'dusk') return u < 0.5 ? 1 : 0;
  return u < 0.2 ? 1 : 0;
}

const inR = (r, x, z) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;
const distR = (r, x, z) => Math.hypot(Math.max(r.x0 - x, 0, x - r.x1), Math.max(r.z0 - z, 0, z - r.z1));

/** Darf ein Rowdy hier stehen? In einer erlaubten Zone oder höchstens 6 m daneben; nie in verbotenen (Laden, Tür). */
export function gangAreaOk(x, z, allowed, forbidden = [], margin = STREET_MARGIN) {
  for (const f of forbidden) if (inR(f, x, z)) return false;
  for (const a of allowed) if (distR(a, x, z) <= margin) return true;
  return false;
}

/** Startpunkte deterministisch aus dem Seed (Führung berechnet gleich wie jeder Client): spots = [{x,z}] → n Stück. */
export function spawnPlan(seed, n, spots) {
  const pool = spots.slice();
  const out = [];
  for (let k = 0; k < n && pool.length; k++) {
    const i = Math.floor(fnv(`spot:${seed}:${k}`) * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

export function createRowdy(i, p, seed = 0) {
  return { i, st: 'idle', x: p.x, z: p.z, hx: p.x, hz: p.z, yaw: 0, hp: ROWDY_HP, t: 0, cool: 0, speed: 1.1 + fnv(`spd:${seed}:${i}`) * 0.5, struck: false };
}

export function createGang(seed, n, spots) {
  return { seed, phase: 0, members: spawnPlan(seed, Math.min(GANG_MAX, n), spots).map((p, i) => createRowdy(i, p, seed)) };
}

/** Treffer auf einen Rowdy. → Ereignisse [{type:'gang-flee', i}] wenn er dadurch flieht, [{type:'beaten', i}] bei hp ≤ 0. */
export function hitRowdy(m, dmg) {
  const ev = [];
  if (m.st === 'beaten' || m.st === 'flee') { m.hp = Math.max(0, m.hp - dmg); return ev; }
  m.hp = Math.max(0, m.hp - dmg);
  if (m.hp <= 0) { m.st = 'beaten'; m.t = 4; ev.push({ type: 'beaten', i: m.i }); } else if (m.hp <= ROWDY_HP * FLEE_HP) { m.st = 'flee'; m.t = 6; ev.push({ type: 'gang-flee', i: m.i }); }
  return ev;
}

function moveTo(m, tx, tz, dt, env, mul = 1) {
  const dx = tx - m.x;
  const dz = tz - m.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) return d;
  const s = Math.min(d, m.speed * mul * dt);
  const nx = m.x + (dx / d) * s;
  const nz = m.z + (dz / d) * s;
  if (gangAreaOk(nx, nz, env.allowed, env.forbidden)) { m.x = nx; m.z = nz; }
  m.yaw = Math.atan2(-dx, -dz);
  return d;
}

/**
 * Ein Schritt je Rowdy. env = { allowed, forbidden, player: {x,z,safe}|null }. safe = Schutzzone/VR/Menü (dann Abbruch).
 * → Ereignisse [{type:'say', i, cat:'taunt'|'threaten'}, {type:'strike', i, dmg}, {type:'gang-flee', i}] (flee nur über hitRowdy).
 */
export function stepRowdy(m, dt, env) {
  const ev = [];
  const p = env.player;
  m.cool = Math.max(0, m.cool - dt);
  m.t = Math.max(0, m.t - dt);
  if (m.st === 'beaten') { if (m.t <= 0) { m.st = 'flee'; m.t = 6; } return ev; }
  if (m.st === 'flee') {
    moveTo(m, m.hx, m.hz, dt, env, 1.6);
    if (m.t <= 0) { m.st = 'idle'; m.hp = Math.max(m.hp, ROWDY_HP * 0.5); }
    return ev;
  }
  const usable = p && !p.safe && gangAreaOk(p.x, p.z, env.allowed, env.forbidden);
  const dist = p ? Math.hypot(p.x - m.x, p.z - m.z) : Infinity;
  if (!usable) { // Ziel weg oder geschützt: zurück an den Platz
    if (m.st !== 'idle') { m.st = 'idle'; m.t = 0; }
    moveTo(m, m.hx, m.hz, dt, env);
    return ev;
  }
  if (m.st === 'idle') { if (dist < 12) m.st = 'approach'; return ev; }
  if (m.st === 'approach') {
    moveTo(m, p.x, p.z, dt, env);
    if (dist < 3.2) { m.st = 'taunt'; m.t = 2.5; ev.push({ type: 'say', i: m.i, cat: 'taunt' }); }
    return ev;
  }
  if (m.st === 'taunt') {
    m.yaw = Math.atan2(m.x - p.x, m.z - p.z);
    if (m.t <= 0) { m.st = 'threaten'; m.t = 2; ev.push({ type: 'say', i: m.i, cat: 'threaten' }); }
    return ev;
  }
  if (m.st === 'threaten') { if (m.t <= 0) m.st = 'attack'; return ev; }
  if (m.st === 'attack') {
    if (dist > 1.2) moveTo(m, p.x, p.z, dt, env, 1.5);
    else if (m.cool <= 0) { m.cool = 1.2; ev.push({ type: 'strike', i: m.i, dmg: 8 }); }
  }
  return ev;
}
