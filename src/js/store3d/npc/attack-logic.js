// VIDEOTHEK LENZ · Angriffs-Logik der Passanten (1.18.0; rein, ohne three/DOM): Drohen, Verfolgen (höchstens 8 s), Zuschlagen, Geblendet.
// createAttack({ x, z, yaw, item, until, attack }) → Zustand; stepAttack(a, dt, env) → Ereignisse
//   { type: 'anim', name, speed?, restart } · { type: 'say', cat } · { type: 'strike', dir:{x,z}, dmg, item, from:{x,z} } · { type: 'end', reason, then:'walk'|'flee' }
// env = { clock (s), target:{x,z}|null, free(a,b) → bool, stop:boolean (Schutz/VR/weg), rand }.
// Phasen: threat (Ärmel hoch, Drohpose) → chase (laufen, höchstens bis `until`) ⇄ swing (Hieb); blind (Laser: Hände vor den Augen, danach
// Angriff oder Flucht). Der Aufrufer setzt Position/Blick aus a.x, a.z, a.yaw und räumt beim Ende (Graph-Anschluss, Gegenstand weg) auf.
import { chaseStep, CHASE_MAX } from './temper-logic.js';
import { yawOf } from './walker-logic.js';

export const ATK = {
  sleevesS: 0.7, threatS: 1.5, speed: 3.2, reach: 1.3, swingGap: 1.3, swingS: 0.5, strikeAt: 0.22,
  dmgFist: 8, dmgItem: 11, blindS: 2, blockedGiveUp: 1.2, maxRange: 18, stunS: 0.5,
};

/** Gegenstand für den Hieb aus dem Look: Regenschirm, Tasche, Tüte, Rucksack (→ Tasche); sonst null (Faust). */
export function attackItem(look) {
  if (!look) return null;
  if (look.umbrella) return 'umbrella';
  if (look.bag === 'bag' || look.bag === 'backpack') return 'bag';
  if (look.bag === 'shopping') return 'shopping';
  return null;
}

export function createAttack(o) {
  return {
    phase: 'threat', t: 0, x: o.x, z: o.z, yaw: o.yaw || 0, item: o.item || null, until: o.until, attack: !!o.attack,
    cool: 0, struck: false, runAnim: false, blocked: 0, stun: 0, started: false, threatAnim: false, then: 'walk', blindThen: 'flee',
  };
}

/** Geblendet (Laser): `then` 'attack' (hitzköpfig) oder 'flee'. */
export function createBlind(o) {
  const a = createAttack({ ...o, attack: false });
  a.phase = 'blind';
  a.blindThen = o.then === 'attack' ? 'attack' : 'flee';
  return a;
}

/** Treffer auf den Angreifer: kurz aus dem Tritt, der Lauf-Zyklus wird neu angestoßen. */
export function stunAttack(a, s = ATK.stunS) {
  if (!a || a.phase === 'blind') return;
  a.stun = s;
  a.runAnim = false;
  if (a.phase === 'swing') { a.phase = 'chase'; a.t = 0; a.cool = ATK.swingGap; }
}

export function stepAttack(a, dt, env) {
  const ev = [];
  const tg = env.target;
  a.t += dt;
  a.cool = Math.max(0, a.cool - dt);
  if (a.phase === 'blind') {
    if (!a.started) { a.started = true; ev.push({ type: 'anim', name: 'cover', restart: true }, { type: 'say', cat: 'blinded' }); }
    if (a.t >= ATK.blindS) {
      if (a.blindThen === 'attack' && tg && !env.stop) { a.phase = 'chase'; a.t = 0; a.attack = true; a.until = env.clock + CHASE_MAX; a.runAnim = false; ev.push({ type: 'say', cat: 'attackHot' }); } else ev.push({ type: 'end', reason: 'blind', then: a.blindThen === 'attack' ? 'walk' : 'flee' });
    }
    return ev;
  }
  if (env.stop || !tg) { ev.push({ type: 'end', reason: 'stop', then: 'walk' }); return ev; }
  const dx = tg.x - a.x;
  const dz = tg.z - a.z;
  const d = Math.hypot(dx, dz);
  if (d > 0.05) a.yaw += angTo(a.yaw, yawOf(dx, dz)) * Math.min(1, dt * 10);
  if (a.stun > 0) { a.stun -= dt; return ev; }
  if (a.phase === 'threat') {
    if (!a.started) { a.started = true; ev.push({ type: 'anim', name: 'sleeves', restart: true }); }
    if (!a.threatAnim && a.t >= ATK.sleevesS) { a.threatAnim = true; ev.push({ type: 'anim', name: 'threat', restart: true }); }
    if (a.t >= ATK.threatS) {
      if (a.attack) { a.phase = 'chase'; a.t = 0; a.runAnim = false; ev.push({ type: 'say', cat: 'attackHot' }); } else ev.push({ type: 'end', reason: 'threatDone', then: 'walk' });
    }
    return ev;
  }
  if (a.phase === 'chase') {
    if (chaseStep({ chaseUntil: a.until }, env.clock) === 'done') { ev.push({ type: 'end', reason: 'timeout', then: 'walk' }); return ev; }
    if (d > ATK.maxRange) { ev.push({ type: 'end', reason: 'far', then: 'walk' }); return ev; }
    if (d <= ATK.reach) {
      if (a.cool <= 0) {
        a.phase = 'swing'; a.t = 0; a.struck = false;
        ev.push({ type: 'anim', name: a.item ? 'swing' : 'hit', restart: true });
      } else if (a.runAnim) { a.runAnim = false; ev.push({ type: 'anim', name: 'idle', restart: false }); }
      return ev;
    }
    if (env.free && !env.free({ x: a.x, z: a.z }, tg)) {
      a.blocked += dt;
      if (a.blocked > ATK.blockedGiveUp) ev.push({ type: 'end', reason: 'blocked', then: 'walk' });
      return ev;
    }
    a.blocked = 0;
    if (!a.runAnim) { a.runAnim = true; ev.push({ type: 'anim', name: 'run', speed: ATK.speed, restart: false }); }
    const step = Math.min(d - ATK.reach * 0.8, ATK.speed * dt);
    if (step > 0) { a.x += (dx / d) * step; a.z += (dz / d) * step; }
    return ev;
  }
  // swing
  if (!a.struck && a.t >= ATK.strikeAt) {
    a.struck = true;
    if (d <= ATK.reach + 0.5) ev.push({ type: 'strike', dir: { x: dx / (d || 1), z: dz / (d || 1) }, dmg: a.item ? ATK.dmgItem : ATK.dmgFist, item: a.item, from: { x: a.x, z: a.z } });
  }
  if (a.t >= ATK.swingS) { a.phase = 'chase'; a.t = 0; a.cool = ATK.swingGap; a.runAnim = false; }
  return ev;
}

/** Kürzeste Winkeldifferenz (rad) von a nach b. */
function angTo(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Nächster Punkt des Wegegraphen zu (x, z), ohne Kanten mit Ampel-/Zebra-Bedingung. → { edge, t (0..1 vom Startknoten), dist } | null.
 * Dient dem Wiedereinstieg eines Passanten in den Graphen nach der Verfolgung (Aufrufer setzt s aus t und der Laufrichtung).
 */
export function nearestOnGraph(g, x, z, skip) {
  let best = null;
  for (const e of g.edges) {
    if (e.wait || (skip && skip(e))) continue;
    const ex = e.bx - e.ax;
    const ez = e.bz - e.az;
    const l2 = ex * ex + ez * ez;
    if (l2 < 1e-9) continue;
    const t = Math.max(0, Math.min(1, ((x - e.ax) * ex + (z - e.az) * ez) / l2));
    const d = Math.hypot(x - (e.ax + ex * t), z - (e.az + ez * t));
    if (!best || d < best.dist) best = { edge: e.id, t, dist: d };
  }
  return best;
}
