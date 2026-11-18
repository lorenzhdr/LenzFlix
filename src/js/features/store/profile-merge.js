// VIDEOTHEK LENZ: Konto-Profil zusammenführen (rein, 1.17.0; Vertrag .tmp/v117/contracts.md §4).
// fig.slots/set/seen: letzter Schreiber (t) gewinnt, ein Konto-Slot ohne prov schlägt einen lokalen prov-Slot immer; mem: kleineres since;
// cnt.rent/cine: je Gerät max, höchstens 8 Geräte (Rest in '_'); disc/evt: Vereinigung, früherer bzw. größerer Zeitstempel; cnt.last bleibt lokal.
export const MAX_CHARS = 6000;
const KEEP_DEV = 8;
const MAX_CODE = 0x1ffffff;

const isObj = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);
const nat = (v) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

function map(src, re, cap, val = nat) {
  const out = {};
  let n = 0;
  if (isObj(src)) {
    for (const k of Object.keys(src)) {
      const v = n < cap && re.test(k) ? val(src[k]) : 0;
      if (v) { out[k] = v; n += 1; }
    }
  }
  return out;
}

function slot(s) {
  if (!isObj(s) || !Array.isArray(s.l) || s.l.length !== 26 || !s.l.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_CODE)) return null;
  const o = { l: s.l.slice(), t: nat(s.t) };
  if (s.prov === true) o.prov = true;
  return o;
}

export const emptyProfile = () => normalize(null);

/** Müll tolerant: jedes Feld einzeln auf einen gültigen Wert bringen. */
export function normalize(p) {
  const o = isObj(p) ? p : {};
  const f = isObj(o.fig) ? o.fig : {};
  const s = isObj(o.set) ? o.set : {};
  const m = isObj(o.mem) ? o.mem : {};
  const c = isObj(o.cnt) ? o.cnt : {};
  const e = isObj(o.seen) ? o.seen : {};
  const seen = { t: nat(e.t) };
  for (const k of ['richard', 'gabi', 'ronny']) if (typeof e[k] === 'string' && e[k].length <= 16) seen[k] = e[k];
  return {
    v: 1,
    fig: { act: Number.isInteger(f.act) && f.act >= 0 && f.act < 3 ? f.act : 0, slots: [0, 1, 2].map((i) => slot(Array.isArray(f.slots) ? f.slots[i] : null)) },
    set: { cam: s.cam === 'third' ? 'third' : 'ego', t: nat(s.t) },
    mem: typeof m.no === 'string' && /^\d{1,9}$/.test(m.no) && nat(m.since) ? { no: m.no, since: nat(m.since) } : {},
    cnt: { rent: map(c.rent, /^[\w-]{1,8}$/, 16), cine: map(c.cine, /^[\w-]{1,8}$/, 16), last: map(c.last, /^.{1,48}$/, 300) },
    disc: map(o.disc, /^[\w:.-]{1,40}$/, 64),
    seen,
    evt: map(o.evt, /^\w{1,24}$/, 8),
  };
}

function pickSlot(a, b) {
  if (!a || !b) return a || b;
  if (Boolean(a.prov) !== Boolean(b.prov)) return a.prov ? b : a;
  return b.t > a.t ? b : a;
}

const score = (p) => Math.max(0, ...p.fig.slots.map((s) => (s && !s.prov ? s.t : 0)));

function mergeDev(a, b) {
  const o = { ...a };
  for (const k of Object.keys(b)) o[k] = Math.max(o[k] || 0, b[k]);
  const ks = Object.keys(o).filter((k) => k !== '_').sort((x, y) => o[y] - o[x] || (x < y ? -1 : 1));
  let rest = 0;
  for (const k of ks.slice(KEEP_DEV)) { rest += o[k]; delete o[k]; }
  if (rest) o._ = (o._ || 0) + rest;
  return o;
}

/** local, remote → zusammengeführtes Profil; bei Gleichstand gewinnt local. cnt.last kommt nur aus local. */
export function mergeProfiles(local, remote) {
  const a = normalize(local);
  const b = normalize(remote);
  const slots = a.fig.slots.map((s, i) => pickSlot(s, b.fig.slots[i]));
  let act = score(b) > score(a) ? b.fig.act : a.fig.act;
  if (!slots[act]) act = Math.max(0, slots.findIndex(Boolean));
  const disc = { ...b.disc };
  for (const k of Object.keys(a.disc)) disc[k] = disc[k] ? Math.min(disc[k], a.disc[k]) : a.disc[k];
  const evt = { ...b.evt };
  for (const k of Object.keys(a.evt)) evt[k] = Math.max(evt[k] || 0, a.evt[k]);
  return {
    v: 1,
    fig: { act, slots },
    set: b.set.t > a.set.t ? b.set : a.set,
    mem: !b.mem.since || (a.mem.since && a.mem.since <= b.mem.since) ? a.mem : b.mem,
    cnt: { rent: mergeDev(a.cnt.rent, b.cnt.rent), cine: mergeDev(a.cnt.cine, b.cnt.cine), last: a.cnt.last },
    disc,
    seen: b.seen.t > a.seen.t ? b.seen : a.seen,
    evt,
  };
}

/** Hochlade-Text: ohne cnt.last, höchstens MAX_CHARS (sonst stufenweise kürzen: seen/evt, Geräte, disc). */
export function serialize(p) {
  const c = normalize(p);
  delete c.cnt.last;
  const stages = [
    () => { c.seen = { t: 0 }; c.evt = {}; },
    () => { c.cnt = { rent: {}, cine: {} }; },
    () => { c.disc = {}; },
    () => { c.fig.slots = c.fig.slots.map((s, i) => (i === c.fig.act ? s : null)); },
  ];
  let s = JSON.stringify(c);
  for (const st of stages) {
    if (s.length <= MAX_CHARS) break;
    st();
    s = JSON.stringify(c);
  }
  return s;
}
