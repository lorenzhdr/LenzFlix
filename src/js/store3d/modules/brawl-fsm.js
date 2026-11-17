// VIDEOTHEK LENZ · Richards Zustandsautomat (rein, ohne three/DOM, Zeit wird injiziert, Sekunden).
// calm -> annoyed (1. Treffer) -> shove (2.) -> throw (3.) -> chase -> banned -> grudge -> calm.
// Treffer in throw/chase/banned zählen nicht; in grudge springt Richard sofort auf chase.
export const STATES = ['calm', 'annoyed', 'shove', 'throw', 'chase', 'banned', 'grudge'];
export const BRAWL = {
  HIT_GAP: 0.45, // zwei Treffer innerhalb dieser Zeit zählen als einer
  DECAY: 25, // annoyed/shove -> calm ohne weiteren Treffer
  THROW_MAX: 9, // Wurfphase höchstens so lang, dann chase
  CHASE_MAX: 45, // danach gibt Richard auf (grudge ohne Hausverbot)
  BAN: 30, // Hausverbot
  GRUDGE: 600, // ca. 10 min spitz
};

export function createBrawlFsm(opts = {}) {
  const cfg = { ...BRAWL, ...opts };
  let state = 'calm';
  let hits = 0;
  let lastHit = -Infinity;
  let since = 0; // Beginn des aktuellen Zustands
  let until = 0; // Ende von banned/grudge

  function go(to, t, reason, extra = {}) {
    const from = state;
    state = to;
    since = t;
    if (to === 'calm') hits = 0;
    if (to === 'banned') until = t + cfg.BAN;
    if (to === 'grudge') until = t + (extra.sec !== undefined ? extra.sec : cfg.GRUDGE);
    return { from, to, reason };
  }

  return {
    get state() { return state; },
    get hits() { return hits; },
    isBanned: () => state === 'banned',
    isHostile: () => state === 'shove' || state === 'throw' || state === 'chase',
    banRemaining: (t) => (state === 'banned' ? Math.max(0, until - t) : 0),
    grudgeRemaining: (t) => (state === 'grudge' ? Math.max(0, until - t) : 0),
    /** Treffer; source 'player' | 'object'. Rückgabe { accepted, transition|null }. */
    hit(source, t) {
      if (state === 'throw' || state === 'chase' || state === 'banned') return { accepted: false, transition: null };
      if (t - lastHit < cfg.HIT_GAP) return { accepted: false, transition: null };
      lastHit = t;
      if (state === 'grudge') { hits = 3; return { accepted: true, transition: go('chase', t, 'grudgeHit') }; }
      hits++;
      const to = hits >= 3 ? 'throw' : hits === 2 ? 'shove' : 'annoyed';
      return { accepted: true, transition: go(to, t, source === 'object' ? 'objectHit' : 'hit') };
    },
    /** Ereignisse: 'throwDone' | 'expelled' | 'giveUp'. */
    event(name, t) {
      if (name === 'throwDone' && state === 'throw') return go('chase', t, name);
      if (name === 'expelled' && state === 'chase') return go('banned', t, name);
      if (name === 'giveUp' && state === 'chase') return go('grudge', t, name);
      return null;
    },
    /** Zeitablauf; Rückgabe Übergang oder null. */
    update(t) {
      if ((state === 'annoyed' || state === 'shove') && t - lastHit > cfg.DECAY) return go('calm', t, 'decay');
      if (state === 'throw' && t - since > cfg.THROW_MAX) return go('chase', t, 'throwTimeout');
      if (state === 'chase' && t - since > cfg.CHASE_MAX) return go('grudge', t, 'chaseTimeout');
      if (state === 'banned' && t >= until) return go('grudge', t, 'banEnd');
      if (state === 'grudge' && t >= until) return go('calm', t, 'grudgeEnd');
      return null;
    },
    /** Spitze Phase direkt starten (Wiederherstellung aus sessionStorage). */
    startGrudge(t, sec) { return go('grudge', t, 'restore', { sec }); },
    reset(t = 0) { state = 'calm'; hits = 0; lastHit = -Infinity; since = t; until = 0; },
    /** Netzformat (1.16.0): Restzeit statt absoluter Zeit. */
    getNetState(t) { return { v: 1, s: STATES.indexOf(state), h: hits, r: Math.max(0, Math.round((until - t) * 10) / 10) }; },
    applyRemote(net, t) {
      if (!net || net.v !== 1 || !STATES[net.s]) return false;
      state = STATES[net.s];
      hits = Math.max(0, net.h | 0);
      since = t;
      until = t + (Number.isFinite(net.r) ? net.r : 0);
      return true;
    },
  };
}
