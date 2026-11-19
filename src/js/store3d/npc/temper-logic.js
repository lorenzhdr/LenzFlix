// VIDEOTHEK LENZ · NPC-Temperament (1.18.0; rein): ängstlich (shy) | normal | hitzköpfig (hot) aus dem Seed, Reaktion auf Provokation.
export const TEMPERS = ['shy', 'normal', 'hot'];
export const CHASE_MAX = 8;
export const MAX_ATTACKERS = 3;

export function fnv(s) {
  let h = 2166136261;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** Temperament aus dem Seed (Zahl oder Text): ~35 % shy, 45 % normal, 20 % hot. */
export function temperOf(seed) {
  const u = fnv(`temper:${seed}`);
  return u < 0.35 ? 'shy' : u < 0.8 ? 'normal' : 'hot';
}

/**
 * Reaktion auf Provokation. state = { temper, threatened?, chaseUntil? } (wird fortgeschrieben).
 * kind: 'hit' | 'shove' | 'insult' | 'emote' | 'laser'. → { action: 'flee'|'scold'|'threat'|'attack', until? }
 */
export function reactToProvocation(state, kind, t) {
  if (state.temper === 'shy') return { action: 'flee' };
  if (state.temper === 'hot') {
    if (kind === 'hit' || state.threatened) {
      state.chaseUntil = t + CHASE_MAX;
      state.threatened = true;
      return { action: 'attack', until: state.chaseUntil };
    }
    state.threatened = true;
    return { action: 'threat' };
  }
  return { action: 'scold' };
}

/** Verfolgung des Hitzköpfigen: 'chase' bis höchstens 8 s nach dem Auslöser, dann 'done'. */
export function chaseStep(state, t) {
  return state.chaseUntil != null && t < state.chaseUntil ? 'chase' : 'done';
}

/** Macht ein Umstehender mit? Nur Hitzköpfige, solange weniger als 3 Angreifer (n = aktuelle Zahl). */
export function bystanderJoin(n, temper = 'hot') { return temper === 'hot' && n < MAX_ATTACKERS; }
