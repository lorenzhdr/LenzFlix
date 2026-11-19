// VIDEOTHEK LENZ · Rowdy-Bande, reine Logik (1.18.0; ohne three/DOM, Zeit/Zufall injiziert): Spawn-Regel, Zustände, Aufenthaltsgrenzen.
// Zustände: idle → approach → taunt → threaten → attack → flee | beaten. Bereiche kommen als Rechtecke {x0,z0,x1,z1} aus layout.city
// (allowed = Zonen alley/yard/escape, forbidden = shop/doorway); in die Straße höchstens STREET_MARGIN m über den Rand.
export const GANG_MAX = 3;
export const STREET_MARGIN = 6;
export const ROWDY_HP = 60;
export const FLEE_HP = 0.25; // Anteil
/** Körperradius (m) gegen feste Hindernisse (1.19.0, Kreisprüfung statt Mittelpunkt); Spielerhöhe (m), ab der er für Bodenfiguren unerreichbar ist (Feuertreppe). */
export const BODY_R = 0.3;
export const REACH_Y = 0.6;
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
  for (const f of forbidden) if (f.r > 0 ? distR(f, x, z) < f.r : inR(f, x, z)) return false; // f.r: Körperradius-Kreis statt Mittelpunkt
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
  return { i, st: 'idle', x: p.x, z: p.z, hx: p.x, hz: p.z, yaw: 0, hp: ROWDY_HP, t: 0, cool: 0, stuck: 0, speed: 1.1 + fnv(`spd:${seed}:${i}`) * 0.5, struck: false };
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

/**
 * Schritt Richtung Ziel; ist er gesperrt, gleitet der Rowdy entlang einer Achse (1.18.1, Achsenschritt auf den Rest geklemmt, sonst
 * pendelt er um die Zielkoordinate). → true nur bei echtem Fortschritt (Abstand sinkt um mindestens PROGRESS_MIN des Schritts).
 */
const PROGRESS_MIN = 0.25;
const SIDE_MAX_S = 1; // höchstens so lange (s) seitlich ausweichen, bevor es als Stillstand zählt
function moveTo(m, tx, tz, dt, env, mul = 1) {
  const dx = tx - m.x;
  const dz = tz - m.z;
  const d = Math.hypot(dx, dz);
  if (d < 1e-3) return false;
  m.yaw = Math.atan2(-dx, -dz);
  const s = Math.min(d, m.speed * mul * dt);
  const sx = (dx / d) * s;
  const sz = (dz / d) * s;
  const ok = (x, z) => gangAreaOk(x, z, env.allowed, env.forbidden);
  let usedSide = false;
  if (ok(m.x + sx, m.z + sz)) { m.x += sx; m.z += sz; m.side = 0; m.sideT = 0; }
  else {
    // Gleiten: die längere Achse zuerst, Schritt höchstens bis zur Zielkoordinate
    const tryX = () => { if (Math.abs(dx) <= 1e-3) return false; const nx = m.x + Math.sign(dx) * Math.min(s, Math.abs(dx)); if (ok(nx, m.z)) { m.x = nx; return true; } return false; };
    const tryZ = () => { if (Math.abs(dz) <= 1e-3) return false; const nz = m.z + Math.sign(dz) * Math.min(s, Math.abs(dz)); if (ok(m.x, nz)) { m.z = nz; return true; } return false; };
    // 1.19.0: Achsen gesperrt (Pfosten genau auf der Linie, Körperradius): Schritt um 50° bzw. 90° zur Seite drehen, die Seite bleibt (m.side)
    // bis der direkte Weg wieder frei ist; sonst pendelt der Rowdy am Pfosten zwischen Umweg und Zielachse.
    const side = () => {
      if ((m.sideT || 0) > SIDE_MAX_S) return false; // Umweg nur kurz, sonst pendelt er an langen Wänden (zählt als Stillstand → pöbeln/aufgeben)
      const k0 = m.side || (m.i % 2 ? 1 : -1);
      for (const a of [0.87, 1.57]) {
        for (const k of [k0, -k0]) {
          const c = Math.cos(a); const sn = Math.sin(a) * k;
          const ux = dx / d; const uz = dz / d;
          const nx = m.x + (ux * c - uz * sn) * s; const nz = m.z + (uz * c + ux * sn) * s;
          if (ok(nx, nz)) { m.x = nx; m.z = nz; m.side = k; m.sideT = (m.sideT || 0) + dt; usedSide = true; return true; }
        }
      }
      return false;
    };
    const axes = () => (Math.abs(dx) >= Math.abs(dz) ? tryX() || tryZ() : tryZ() || tryX());
    if (!(m.side ? side() || axes() : axes() || side())) return false;
  }
  return !usedSide && d - Math.hypot(tx - m.x, tz - m.z) >= PROGRESS_MIN * s;
}

/** Ab so viel Stillstand (s) pöbelt ein Rowdy am Rand, statt im Anlauf festzuhängen; bis zu diesem Abstand (m). */
export const STUCK_TAUNT_S = 1.2;
export const STUCK_TAUNT_DIST = 9;
/** Kommt ein angreifender Rowdy so lange (s) nicht weiter, gibt er auf (zurück an den Platz, Pause GIVE_UP_COOL s). */
export const STUCK_GIVE_UP_S = 4;
export const GIVE_UP_COOL = 6;
const stuckStep = (m, progressed, dt) => { m.stuck = progressed ? 0 : (m.stuck || 0) + dt; };

/**
 * Ein Schritt je Rowdy. env = { allowed, forbidden, playerAllowed?, playerForbidden?, player: {x,z,y?,safe}|null }. safe = Schutzzone/VR/Menü (dann Abbruch).
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
  // Ziel-Bereich getrennt (1.19.0): auf Hindernissen (Feuertreppe) darf der Spieler stehen, ist dann aber nur über seine Höhe unerreichbar
  const usable = p && !p.safe && gangAreaOk(p.x, p.z, env.playerAllowed || env.allowed, env.playerForbidden || env.forbidden);
  const reach = !p || !(p.y > REACH_Y);
  const dist = p ? Math.hypot(p.x - m.x, p.z - m.z) : Infinity;
  if (!usable) { // Ziel weg oder geschützt: zurück an den Platz
    if (m.st !== 'idle') { m.st = 'idle'; m.t = 0; }
    m.stuck = 0;
    moveTo(m, m.hx, m.hz, dt, env);
    return ev;
  }
  if (m.st === 'idle') {
    if (m.cool > 0) { moveTo(m, m.hx, m.hz, dt, env); return ev; } // nach dem Aufgeben (1.18.1): erst zurück an den Platz
    if (dist < 12) { m.st = 'approach'; m.stuck = 0; }
    return ev;
  }
  if (m.st === 'approach') {
    stuckStep(m, moveTo(m, p.x, p.z, dt, env), dt);
    // 1.18.1: Weg versperrt (Kollider, Tür, Leine) → am Rand pöbeln statt dauerhaft im Anlauf zu hängen
    if (dist < 3.2 || (m.stuck >= STUCK_TAUNT_S && dist < STUCK_TAUNT_DIST)) { m.st = 'taunt'; m.t = 2.5; m.stuck = 0; ev.push({ type: 'say', i: m.i, cat: 'taunt' }); }
    return ev;
  }
  if (m.st === 'taunt') {
    m.yaw = Math.atan2(m.x - p.x, m.z - p.z);
    if (m.t <= 0) { m.st = 'threaten'; m.t = 2; ev.push({ type: 'say', i: m.i, cat: 'threaten' }); }
    return ev;
  }
  if (m.st === 'threaten') { if (m.t <= 0) m.st = 'attack'; return ev; }
  if (m.st === 'attack') {
    if (!reach) { m.st = 'taunt'; m.t = 2.5; m.stuck = 0; ev.push({ type: 'say', i: m.i, cat: 'taunt' }); return ev; } // oben auf der Treppe: kein Schlag, nur pöbeln
    if (dist > 1.2) {
      stuckStep(m, moveTo(m, p.x, p.z, dt, env, 1.5), dt);
      if (m.stuck >= STUCK_GIVE_UP_S) { m.st = 'idle'; m.t = 0; m.stuck = 0; m.cool = GIVE_UP_COOL; } // 1.18.1: Weg versperrt → aufgeben
    } else if (m.cool <= 0) { m.stuck = 0; m.cool = 1.2; ev.push({ type: 'strike', i: m.i, dmg: 8 }); }
  }
  return ev;
}
