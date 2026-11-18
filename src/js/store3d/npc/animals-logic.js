// VIDEOTHEK LENZ · Tier-Logik (rein, ohne three/DOM): Katze (Zustandsautomat) und Taubenschwarm.
// Katze: sit | groom | walk | flee | purr. Sie läuft zwischen festen Plätzen (gerade Linien, vorab auf Freiheit geprüft), flieht vor
// rennenden/nahen Spielern und von Schlägen in ihrer Nähe, lässt sich bei ruhigem Herangehen streicheln (purr).
// Tauben: peck | walk | fly | land. Der Schwarm hebt gemeinsam ab (kleine Verzögerungen), kreist 6–14 s und landet an einem Heimatplatz.
import { angDiff } from '../modules/m4-util.js';

const TAU = Math.PI * 2;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const yawTo = (dx, dz) => Math.atan2(-dx, -dz);

// ---------------------------------------------------------------- Katze
export const CAT = { sitMin: 4, sitMax: 11, groomT: 2.8, walkSpeed: 0.8, fleeSpeed: 5.2, purrT: 3.6, startleDist: 3.2, closeDist: 1.1, petDist: 2.4, petSpeed: 1.3, laserRange: 8, laserSpeed: 4.2, laserFound: 3, pounceT: 0.5, pounceMin: 1 };

/** Geradenprüfung gegen Rechtecke {x0,z0,x1,z1,y1}: frei, wenn keine Hindernisse mit Höhe > 0,3 gekreuzt werden (Stichproben alle 0,2 m). */
export function lineFree(colliders, a, b, pad = 0.15) {
  const len = Math.hypot(b.x - a.x, b.z - a.z);
  const n = Math.max(1, Math.ceil(len / 0.2));
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = a.x + (b.x - a.x) * t;
    const z = a.z + (b.z - a.z) * t;
    for (const q of colliders) {
      if (q.dynamic) continue;
      if ((q.y1 === undefined ? Infinity : q.y1) <= 0.3) continue;
      if ((q.y0 || 0) > 0.6) continue;
      if (x > q.x0 - pad && x < q.x1 + pad && z > q.z0 - pad && z < q.z1 + pad) {
        // Zielplatz darf auf/an dem Hindernis liegen (Kiste, Container): nur Endpunkt-Nähe ausnehmen
        if (Math.hypot(x - b.x, z - b.z) < 0.9 || Math.hypot(x - a.x, z - a.z) < 0.9) continue;
        return false;
      }
    }
  }
  return true;
}

export function createCat(spots, rand) {
  const i = Math.floor(rand() * spots.length);
  const s = spots[i];
  return { x: s.x, y: s.y || 0, z: s.z, yaw: 0, state: 'sit', timer: CAT.sitMin + rand() * (CAT.sitMax - CAT.sitMin), spot: i, from: null, to: null, prog: 0, meowCool: 6, startled: 0, purrT: 0, moveSpeed: 0, tail: 0 };
}

function pickTarget(cat, env, away) {
  const spots = env.spots;
  const here = { x: cat.x, z: cat.z };
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < spots.length; i++) {
    if (i === cat.spot) continue;
    const s = spots[i];
    const d = Math.hypot(s.x - cat.x, s.z - cat.z);
    if (d < 1.8) continue;
    if (env.free && !env.free(here, s)) continue;
    let score = env.rand() * 2;
    if (away && env.player) score += Math.hypot(s.x - env.player.x, s.z - env.player.z) * 0.9 + ((s.y || 0) > 0.5 ? 1.5 : 0);
    if (score > bestScore) { bestScore = score; best = i; }
  }
  return best;
}

function go(cat, idx, env, state) {
  const s = env.spots[idx];
  cat.from = { x: cat.x, y: cat.y, z: cat.z };
  cat.to = { x: s.x, y: s.y || 0, z: s.z };
  cat.spot = idx;
  cat.prog = 0;
  cat.state = state;
  cat.yaw = yawTo(s.x - cat.x, s.z - cat.z);
}

/** Der Spieler streichelt: nur im Sitzen/Putzen. Rückgabe true bei Erfolg. */
export function petCat(cat) {
  if (cat.state !== 'sit' && cat.state !== 'groom') return false;
  cat.state = 'purr';
  cat.purrT = CAT.purrT;
  return true;
}

/** Ist die Katze gerade streichelbar? (Zustand sit/groom/purr, Spieler langsam und nah) */
export function catPettable(cat, player) {
  if (!player) return false;
  if (cat.state !== 'sit' && cat.state !== 'groom' && cat.state !== 'purr') return false;
  return Math.hypot(player.x - cat.x, player.z - cat.z) < CAT.petDist && (player.speed || 0) < CAT.petSpeed;
}

/** Erschrecken (Schlag in der Nähe o. ä.). */
export function scareCat(cat, env) {
  if (cat.state === 'flee') return;
  const t = pickTarget(cat, env, true);
  cat.startled = 0.5;
  if (t >= 0) go(cat, t, env, 'flee');
}

/**
 * env = { rand, spots: [{x,z,y}], free(a,b), player: {x,z,speed,y}|null, laser?: {x,z}|null (1.18.0) }. Rückgabe Ereignisse [{type:'meow'|'purr'|'startle'|'catlaser'}].
 * Laserpunkt (1.18.0): sitzende/putzende/laufende Katze im Umkreis von 8 m mit freier Sicht jagt den Punkt (Zustand `chase`); nach >= 1 s Jagd und
 * ausgehendem Laser springt sie (`pounce`); nach 3 s Jagd einmal Ereignis `catlaser`. Ohne env.laser bleibt alles wie zuvor.
 */
export function stepCat(cat, dt, env) {
  const ev = [];
  cat.meowCool = Math.max(0, cat.meowCool - dt);
  cat.startled = Math.max(0, cat.startled - dt);
  cat.tail += dt * (cat.state === 'flee' ? 14 : cat.state === 'purr' ? 2.4 : 3.2);
  const pl = env.player;
  const dist = pl ? Math.hypot(pl.x - cat.x, pl.z - cat.z) : Infinity;
  const sp = pl ? pl.speed || 0 : 0;
  const lz = env.laser || null;
  if (cat.state === 'chase') return stepChase(cat, dt, env, lz, ev);
  if (cat.state === 'pounce') {
    cat.timer -= dt;
    const p = 1 - Math.max(0, cat.timer) / CAT.pounceT;
    cat.y = Math.sin(Math.min(1, p) * Math.PI) * 0.4;
    cat.x += -Math.sin(cat.yaw) * 1.2 * dt; cat.z += -Math.cos(cat.yaw) * 1.2 * dt;
    if (cat.timer <= 0) { cat.state = 'sit'; cat.y = 0; cat.timer = 3 + env.rand() * 4; cat.moveSpeed = 0; }
    return ev;
  }
  if (lz && cat.state !== 'flee' && Math.hypot(lz.x - cat.x, lz.z - cat.z) < CAT.laserRange && (!env.free || env.free({ x: cat.x, z: cat.z }, lz))) {
    cat.state = 'chase'; cat.chaseT = 0; cat.chk = 0.25; cat.laserDone = false; cat.moveSpeed = CAT.laserSpeed;
    return stepChase(cat, dt, env, lz, ev);
  }
  if (cat.state === 'walk' || cat.state === 'flee') {
    const speed = cat.state === 'flee' ? CAT.fleeSpeed : CAT.walkSpeed;
    const total = Math.hypot(cat.to.x - cat.from.x, cat.to.z - cat.from.z) || 1;
    cat.prog = Math.min(1, cat.prog + (speed * dt) / total);
    const p = cat.prog;
    cat.x = cat.from.x + (cat.to.x - cat.from.x) * p;
    cat.z = cat.from.z + (cat.to.z - cat.from.z) * p;
    const dy = cat.to.y - cat.from.y;
    // Sprung auf Erhöhungen: Höhe steigt erst auf den letzten 25 % der Strecke (Bogen), Abstieg zu Beginn
    const k = dy >= 0 ? clamp((p - 0.75) / 0.25, 0, 1) : clamp(p / 0.25, 0, 1);
    cat.y = cat.from.y + dy * k + (Math.abs(dy) > 0.2 ? Math.sin(k * Math.PI) * 0.35 : 0);
    cat.moveSpeed = speed;
    if (p >= 1) { cat.state = 'sit'; cat.timer = 3 + env.rand() * 5; cat.yaw = yawTo(pl ? pl.x - cat.x : 0, pl ? pl.z - cat.z : 1); cat.moveSpeed = 0; }
    return ev;
  }
  cat.moveSpeed = 0;
  // Erschrecken (nicht beim Streicheln, sofern der Spieler nicht wild heranrennt)
  const wild = dist < CAT.startleDist && sp > 3;
  const near = dist < CAT.closeDist && sp > 1.8;
  if (cat.state === 'purr') {
    cat.purrT -= dt;
    if (wild || near) { scareCat(cat, env); ev.push({ type: 'startle' }); return ev; }
    if (cat.purrT <= 0) { cat.state = 'sit'; cat.timer = 4 + env.rand() * 4; }
    return ev;
  }
  if (wild || near) { scareCat(cat, env); if (cat.state === 'flee') ev.push({ type: 'startle' }); return ev; }
  cat.timer -= dt;
  if (pl && dist < 4.5 && cat.state === 'sit') cat.yaw += angDiff(cat.yaw, yawTo(pl.x - cat.x, pl.z - cat.z)) * Math.min(1, dt * 3);
  if (pl && dist < 3.5 && cat.meowCool <= 0 && env.rand() < dt * 0.3) { cat.meowCool = 25; ev.push({ type: 'meow' }); }
  if (cat.timer <= 0) {
    const r = env.rand();
    if (cat.state === 'sit' && r < 0.4) { cat.state = 'groom'; cat.timer = CAT.groomT; }
    else if (r < 0.75) {
      const t = pickTarget(cat, env, false);
      if (t >= 0) go(cat, t, env, 'walk'); else { cat.state = 'sit'; cat.timer = 4; }
    } else { cat.state = 'sit'; cat.timer = CAT.sitMin + env.rand() * (CAT.sitMax - CAT.sitMin); }
  }
  return ev;
}

function stepChase(cat, dt, env, lz, ev) {
  if (!lz || Math.hypot(lz.x - cat.x, lz.z - cat.z) > CAT.laserRange + 2) {
    cat.moveSpeed = 0;
    if (cat.chaseT >= CAT.pounceMin && !lz) { cat.state = 'pounce'; cat.timer = CAT.pounceT; } else { cat.state = 'sit'; cat.timer = 3 + env.rand() * 3; cat.y = 0; }
    return ev;
  }
  cat.chaseT += dt;
  cat.chk -= dt;
  if (cat.chk <= 0) { cat.chk = 0.25; if (env.free && !env.free({ x: cat.x, z: cat.z }, lz)) { cat.state = 'sit'; cat.timer = 2; cat.moveSpeed = 0; return ev; } }
  const dx = lz.x - cat.x;
  const dz = lz.z - cat.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.25) {
    const step = Math.min(d, CAT.laserSpeed * dt);
    cat.x += (dx / d) * step; cat.z += (dz / d) * step;
    cat.yaw = yawTo(dx, dz);
    cat.moveSpeed = CAT.laserSpeed;
  } else cat.moveSpeed = 0;
  cat.y += (0 - cat.y) * Math.min(1, dt * 6);
  if (!cat.laserDone && cat.chaseT >= CAT.laserFound) { cat.laserDone = true; ev.push({ type: 'catlaser' }); }
  return ev;
}

// ---------------------------------------------------------------- Tauben
export const PIGEON = { laserDist: 2.5, flushDist: 3.4, flushRunDist: 7, runSpeed: 3.4, flySpeed: 5.2, altitude: 4.2, flyMin: 6, flyMax: 14 };

export function createFlock(homes, n, rand) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = homes[i % homes.length];
    const a = rand() * TAU;
    const r = rand() * (h.r || 1.4);
    out.push({
      id: i, x: h.x + Math.cos(a) * r, y: 0, z: h.z + Math.sin(a) * r, yaw: rand() * TAU, state: 'peck', timer: 1 + rand() * 3, home: i % homes.length,
      tx: 0, tz: 0, delay: 0, flap: 0, bob: rand() * 6, flyT: 0, turn: 0, speed: 0,
    });
  }
  return out;
}

/** Schwarm aufscheuchen (alle am Boden; jede Taube mit eigener Verzögerung 0–0,45 s). */
export function flush(flock, from, rand) {
  for (const p of flock) {
    if (p.state === 'fly' || p.state === 'land') continue;
    p.state = 'fly';
    p.delay = rand() * 0.45;
    p.flyT = PIGEON.flyMin + rand() * (PIGEON.flyMax - PIGEON.flyMin);
    p.turn = (rand() < 0.5 ? -1 : 1) * (0.25 + rand() * 0.4);
    p.yaw = from ? yawTo(p.x - from.x, p.z - from.z) + (rand() - 0.5) * 1.2 : p.yaw;
    p.speed = 0;
  }
}

/** env = { rand, homes: [{x,z,r}], player: {x,z,speed}|null, bounds: {x0,z0,x1,z1} } → Ereignisse [{type:'flush'}] */
export function stepFlock(flock, dt, env) {
  const ev = [];
  const pl = env.player;
  const lz = env.laser || null;
  if (lz) { // 1.18.0: Laserpunkt in Taubennähe scheucht den Schwarm auf
    for (const p of flock) {
      if ((p.state === 'peck' || p.state === 'walk') && Math.hypot(lz.x - p.x, lz.z - p.z) < PIGEON.laserDist) { flush(flock, lz, env.rand); ev.push({ type: 'flush' }); break; }
    }
  }
  if (pl) {
    let trig = false;
    for (const p of flock) {
      if (p.state !== 'peck' && p.state !== 'walk') continue;
      const d = Math.hypot(pl.x - p.x, pl.z - p.z);
      if (d < PIGEON.flushDist || (d < PIGEON.flushRunDist && (pl.speed || 0) > PIGEON.runSpeed)) { trig = true; break; }
    }
    if (trig) { flush(flock, pl, env.rand); ev.push({ type: 'flush' }); }
  }
  for (const p of flock) {
    p.bob += dt * (p.state === 'walk' ? 9 : 5);
    if (p.state === 'peck') {
      p.y = 0; p.flap = 0;
      p.timer -= dt;
      if (p.timer <= 0) {
        const h = env.homes[p.home];
        const a = env.rand() * TAU;
        const r = env.rand() * (h.r || 1.4);
        p.tx = h.x + Math.cos(a) * r; p.tz = h.z + Math.sin(a) * r;
        p.state = 'walk';
      }
    } else if (p.state === 'walk') {
      const dx = p.tx - p.x;
      const dz = p.tz - p.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.1) { p.state = 'peck'; p.timer = 1.5 + env.rand() * 3.5; continue; }
      p.yaw += angDiff(p.yaw, yawTo(dx, dz)) * Math.min(1, dt * 8);
      const step = Math.min(d, 0.6 * dt);
      p.x += (dx / d) * step; p.z += (dz / d) * step;
    } else if (p.state === 'fly') {
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.flap += dt * 22;
      p.speed += (PIGEON.flySpeed - p.speed) * Math.min(1, dt * 2);
      p.y += (PIGEON.altitude * (0.75 + 0.25 * Math.sin(p.id)) - p.y) * Math.min(1, dt * 1.6);
      p.yaw += p.turn * dt;
      const b = env.bounds;
      if (b && (p.x < b.x0 + 6 || p.x > b.x1 - 6 || p.z < b.z0 + 6 || p.z > b.z1 - 6)) {
        p.yaw += angDiff(p.yaw, yawTo((b.x0 + b.x1) / 2 - p.x, (b.z0 + b.z1) / 2 - p.z)) * Math.min(1, dt * 2);
      }
      p.x += -Math.sin(p.yaw) * p.speed * dt;
      p.z += -Math.cos(p.yaw) * p.speed * dt;
      p.flyT -= dt;
      if (p.flyT <= 0) {
        const h = env.homes[Math.floor(env.rand() * env.homes.length)];
        p.home = env.homes.indexOf(h);
        p.tx = h.x + (env.rand() - 0.5) * (h.r || 1.4) * 2;
        p.tz = h.z + (env.rand() - 0.5) * (h.r || 1.4) * 2;
        p.state = 'land';
      }
    } else if (p.state === 'land') {
      const dx = p.tx - p.x;
      const dz = p.tz - p.z;
      const d = Math.hypot(dx, dz);
      p.flap += dt * (p.y > 0.3 ? 20 : 8);
      p.yaw += angDiff(p.yaw, yawTo(dx, dz)) * Math.min(1, dt * 3);
      // Sinkflug: Höhe folgt der Restdistanz (Gleitwinkel ≈ 25°)
      const targetY = Math.min(p.y, Math.max(0, d * 0.5));
      p.y += (targetY - p.y) * Math.min(1, dt * 6);
      const sp = Math.max(1.2, Math.min(p.speed, d * 1.6));
      p.x += (dx / (d || 1)) * Math.min(d, sp * dt);
      p.z += (dz / (d || 1)) * Math.min(d, sp * dt);
      if (d < 0.15 && p.y < 0.12) { p.state = 'peck'; p.y = 0; p.timer = 1 + env.rand() * 3; p.flap = 0; p.speed = 0; }
    }
  }
  return ev;
}
