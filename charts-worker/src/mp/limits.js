// Token-Buckets je Verbindung (rein, Uhr wird eingespeist). Werte laut docs/mp-api.md §5.
// n Nachrichten je `per` ms, `burst` = Eimergröße. fail: was bei Überschreitung passiert
// ('drop' verwerfen, sonst `er <fail>` an den Sender).
export const LIMITS = {
  frame: { n: 12, per: 1000, burst: 20 },
  p: { n: 10, per: 1000, burst: 10 },
  ps: { n: 12, per: 1000, burst: 12 },
  pc: { n: 10, per: 1000, burst: 10, fail: 'deny' },
  rs: { n: 6, per: 1000, burst: 6 },
  m: { n: 5, per: 10000, burst: 5, fail: 'rate' },
  e: { n: 1, per: 1500, burst: 1 },
  pu: { n: 2, per: 1000, burst: 2 },
  kc: { n: 2, per: 1000, burst: 2 },
  kb: { n: 4, per: 1000, burst: 4 },
  ks: { n: 1, per: 1000, burst: 1 },
  kj: { n: 1, per: 1000, burst: 1 },
  kl: { n: 1, per: 1000, burst: 1 },
  f: { n: 2, per: 1000, burst: 2 },
  hd: { n: 2, per: 1000, burst: 2 },
  ck: { n: 2, per: 1000, burst: 2 },
  rn: { n: 1, per: 60000, burst: 1 },
  ki: { n: 1, per: 5000, burst: 1, fail: 'perm' },
  lk: { n: 1, per: 2000, burst: 3 },
  mc: { n: 1, per: 5000, burst: 2 },
  wp: { n: 2, per: 1000, burst: 2 },
  fh: { n: 3, per: 1000, burst: 3 },
  lz: { n: 4, per: 1000, burst: 4 },
  lb: { n: 2, per: 1000, burst: 2 }, // je Ziel zusätzlich 1 je 4 s (fight.js)
  gc: { n: 1, per: 1000, burst: 1, fail: 'deny' },
  gs: { n: 6, per: 1000, burst: 6 },
  gr: { n: 2, per: 1000, burst: 2 },
  gh: { n: 4, per: 1000, burst: 4 },
};
export const FRAME_OVER_MS = 3000; // so lange darüber -> 4429

// rl: Objekt je Verbindung (name -> {tok, at}). true = erlaubt.
export function take(rl, name, now, spec = LIMITS[name]) {
  if (!spec) return true;
  let b = rl[name];
  if (!b) b = rl[name] = { tok: spec.burst, at: now };
  const dt = Math.max(0, now - b.at);
  b.tok = Math.min(spec.burst, b.tok + (dt * spec.n) / spec.per);
  b.at = now;
  if (b.tok >= 1) { b.tok -= 1; return true; }
  return false;
}

// Frame-Eimer plus 3-s-Regel: 'ok' | 'drop' | 'close'. Ein Verstoß-Strom gilt als beendet,
// wenn 1 s lang kein Frame mehr verworfen wurde.
export function frameGate(rl, now) {
  if (take(rl, 'frame', now)) {
    if (rl.over && now - rl.lastDrop > 1000) rl.over = 0;
    return 'ok';
  }
  rl.lastDrop = now;
  if (!rl.over) rl.over = now;
  return now - rl.over >= FRAME_OVER_MS ? 'close' : 'drop';
}
