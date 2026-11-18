// Unter-Reducer "fight" (1.18.0 „NPCs und Raufen“, docs/mp-api.md §12; Vertrag .tmp/v118/contracts.md §3).
// Waffenwahl (`wp`), Treffer (`fh`), Laser (`lz`, `lb`) und die geteilte Rowdy-Bande (`gc`, `gs`, `gr`, `gh`).
// Waffenwahl: `st.store['fg:<c>']` = w (1..3; 0 = kein Eintrag), gleichlautend im DO-Storage (Präfix `fg:`).
// Bande: Führung nur im Speicher (`st.gang`), Muster rich.js: `gc` vergibt sie nur, wenn frei; `gs` nur vom Führer;
// `gr`, Disconnect, VR oder 60 s ohne `gs` geben sie frei. Nach Kaltstart (Führer unbekannt) übernimmt ein
// weiterlaufender Führer mit `g` >= bekanntem Zähler (und <= G_TAKEOVER_MAX) still wieder (wie phys.js); Zähler höchstens G_MAX.
// Treffer `fh`: Abstand <= 3,6 m über die letzte Pose; Peers OHNE Fähigkeit `fight` bekommen nur den Rückstoß als `pu`.
import { FLAG, RANGE, isNum, clampInt } from './protocol.js';
import { take } from './limits.js';

export const cap = 'fight';
export const GS_TIMEOUT_MS = 60000;
export const HIT_RANGE = 360; // cm (3,6 m, horizontal)
export const LB_PER_TARGET = { n: 1, per: 4000, burst: 1 };
export const PU_S = [25, 45, 60, 10]; // Rückstoß-Stärke je Waffe (hand, belt, whip, laser) für `pu` an alte Clients
export const G_MAX = 0x7ffffffe; // Zähler nie darüber (gc vergibt r.g + 1, 2^31 wäre ungültig)
export const G_TAKEOVER_MAX = 1 << 20; // stille Übernahme einer freien Führung per gs nur mit vernünftigem g (sonst Zähler vergiftet)
const PREFIX = 'fg:';
const MAX_MEMBERS = 3;

const isInt = (v) => isNum(v) && Number.isInteger(v);
const isC = (v) => isInt(v) && v >= 1 && v <= 65535;

// Validatoren: roh -> normalisiert | null (verwerfen).
export const V = {
  wp(m) {
    return isInt(m.w) && m.w >= 0 && m.w <= 3 ? { t: 'wp', w: m.w } : null;
  },
  fh(m) {
    if (!isC(m.c) || !isInt(m.w) || m.w < 0 || m.w > 3) return null;
    const d = m.d;
    if (!Array.isArray(d) || d.length !== 2 || !isNum(d[0]) || !isNum(d[1])) return null;
    const dx = clampInt(d[0], -100, 100);
    const dz = clampInt(d[1], -100, 100);
    if (dx === 0 && dz === 0) return null;
    let src = 0;
    if (m.src !== undefined) {
      if (m.src !== 0 && m.src !== 1) return null;
      src = m.src;
    }
    return { t: 'fh', c: m.c, w: m.w, d: [dx, dz], src };
  },
  lz(m) {
    if (m.on !== 0 && m.on !== 1) return null;
    const q = m.q;
    if (!Array.isArray(q) || q.length !== 3 || !q.every(isNum)) return null;
    return { t: 'lz', on: m.on, q: [clampInt(q[0], ...RANGE.x), clampInt(q[1], ...RANGE.y), clampInt(q[2], ...RANGE.z)] };
  },
  lb(m) {
    return isC(m.c) ? { t: 'lb', c: m.c } : null;
  },
  gc() { return { t: 'gc' }; },
  gr() { return { t: 'gr' }; },
  // gs: g = Führungs-Zähler, q = [phase, seed, n, (st,x,y,z,yaw,a,tgt,hp) x n], n <= 3
  gs(m) {
    const q = m.q;
    if (!isInt(m.g) || m.g < 0 || m.g > 0x7fffffff || !Array.isArray(q) || q.length < 3 || !q.every(isNum)) return null;
    const n = q[2];
    if (!Number.isInteger(n) || n < 0 || n > MAX_MEMBERS || q.length !== 3 + 8 * n) return null;
    const out = [clampInt(q[0], 0, 255), clampInt(q[1], 0, 0xffffff), n];
    for (let i = 0; i < n; i++) {
      const o = 3 + 8 * i;
      out.push(
        clampInt(q[o], 0, 9), clampInt(q[o + 1], ...RANGE.x), clampInt(q[o + 2], ...RANGE.y), clampInt(q[o + 3], ...RANGE.z),
        clampInt(q[o + 4], ...RANGE.yaw), clampInt(q[o + 5], 0, 15), clampInt(q[o + 6], 0, 65535), clampInt(q[o + 7], 0, 100),
      );
    }
    return { t: 'gs', g: m.g, q: out };
  },
  gh(m) {
    return isInt(m.i) && m.i >= 0 && m.i <= 2 && isInt(m.w) && m.w >= 0 && m.w <= 3 ? { t: 'gh', i: m.i, w: m.w } : null;
  },
};

// ---------------------------------------------------------------- Hilfen

const key = (c) => PREFIX + c;
const isVR = (p) => !!(p.f & FLAG.VR);
const hasFight = (p) => p.live && p.cap.includes('fight');
const fightPeers = (st, except) => Object.values(st.peers).filter((q) => hasFight(q) && q !== except);

// Nur der jüngste gs je Empfänger und Flush (Spiegel von rich.js `rs`).
function sendGs(cx, c, ev) {
  const lst = cx.st.xq[c];
  const i = lst ? lst.findIndex((e) => e.t === 'gs') : -1;
  if (i >= 0) lst[i] = ev; else cx.sendTo(c, ev);
  cx.st.flushNow = true;
}

function dist2(a, b) {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return dx * dx + dz * dz;
}

// ---------------------------------------------------------------- Bande (nur Speicher)

function G(st, now) {
  return st.gang || (st.gang = { g: 0, c: 0, q: null, at: now });
}

function holderOf(st, now) {
  const r = G(st, now);
  const p = r.c ? st.peers[r.c] : null;
  return p && p.live ? p : null;
}

function release(cx) {
  const r = G(cx.st, cx.now);
  r.c = 0;
  r.q = null;
  for (const q of fightPeers(cx.st)) cx.sendTo(q.c, { t: 'ga', c: 0, g: r.g });
  cx.flushNow();
}

function expired(st, cx) {
  const h = holderOf(st, cx.now);
  if (h && cx.now - G(st, cx.now).at >= GS_TIMEOUT_MS) { release(cx); return true; }
  if (!h && G(st, cx.now).c) { G(st, cx.now).c = 0; G(st, cx.now).q = null; }
  return false;
}

function grant(st, cx, p, g) {
  const r = G(st, cx.now);
  r.g = g;
  r.c = p.c;
  r.q = null;
  r.at = cx.now;
  for (const q of fightPeers(st)) cx.sendTo(q.c, { t: 'ga', c: p.c, g });
}

// ---------------------------------------------------------------- Waffenwahl-Speicher

function entry(st, c) {
  const w = st.store[key(c)];
  return isInt(w) && w >= 1 && w <= 3 ? w : 0;
}

// ---------------------------------------------------------------- Handler

export const handlers = {
  wp(st, p, raw, cx) {
    const m = V.wp(raw);
    if (!m || isVR(p)) return;
    if (m.w) { if (entry(st, p.c) !== m.w) cx.put(key(p.c), m.w); } else if (st.store[key(p.c)] !== undefined) cx.del(key(p.c));
    for (const q of fightPeers(st, p)) cx.sendTo(q.c, { t: 'wp', c: p.c, w: m.w });
  },

  // Treffer. Ziel muss leben, nicht der Sender sein, kein VR (Sender oder Ziel), Abstand <= 3,6 m.
  fh(st, p, raw, cx) {
    const m = V.fh(raw);
    if (!m) return;
    const t = cx.peer(m.c);
    if (!t || !t.live || t.c === p.c || isVR(t)) return;
    if (isVR(p)) return;
    if (m.src === 1) {
      // NPC-Treffer der Bande: nur vom Führer; Prüfung gegen die zuletzt gemeldeten Bandenmitglieder (gs) statt gegen die Führer-Pose.
      expired(st, cx);
      const h = holderOf(st, cx.now);
      if (!h || h !== p) return;
      const g = G(st, cx.now).q;
      if (!g || !t.q) return;
      const n = g[2];
      let near = false;
      for (let i = 0; i < n && !near; i++) near = dist2([g[4 + 8 * i], 0, g[6 + 8 * i]], t.q) <= HIT_RANGE * HIT_RANGE;
      if (!near) return;
    } else {
      if (!p.q || !t.q) return;
      if (dist2(p.q, t.q) > HIT_RANGE * HIT_RANGE) return;
    }
    if (t.cap.includes('fight')) {
      const ev = { t: 'fh', c: p.c, w: m.w, d: m.d };
      if (m.src === 1) ev.src = 1;
      cx.sendTo(t.c, ev);
    } else if (t.cap.includes('push')) {
      cx.sendTo(t.c, { t: 'pu', c: p.c, d: m.d, s: PU_S[m.w] });
    }
  },

  // Laser-Zeiger: an alle anderen Peers mit fight.
  lz(st, p, raw, cx) {
    const m = V.lz(raw);
    if (!m || isVR(p)) return;
    for (const q of fightPeers(st, p)) cx.sendTo(q.c, { t: 'lz', c: p.c, on: m.on, q: m.q });
  },

  // Blenden: nur an das Ziel, höchstens 1 je Ziel und 4 s, Ziel nicht VR.
  lb(st, p, raw, cx) {
    const m = V.lb(raw);
    if (!m || isVR(p)) return;
    const t = cx.peer(m.c);
    if (!t || !hasFight(t) || t.c === p.c || isVR(t)) return;
    if (!take(p.rl, 'lb:' + t.c, cx.now, LB_PER_TARGET)) return;
    cx.sendTo(t.c, { t: 'lb', c: p.c });
  },

  // Führung anfordern: nur wenn frei (oder schon eigen), nie aus VR.
  gc(st, p, raw, cx) {
    if (!V.gc(raw)) return;
    if (isVR(p)) { cx.sendTo(p.c, { t: 'er', c: 'deny', y: 'gc' }); return; }
    expired(st, cx);
    const r = G(st, cx.now);
    const h = holderOf(st, cx.now);
    if (h && h === p) { r.at = cx.now; return; }
    if (h) { cx.sendTo(p.c, { t: 'er', c: 'deny', y: 'gc' }); return; }
    grant(st, cx, p, r.g >= G_MAX ? 1 : r.g + 1);
    cx.flushNow();
  },

  // Zustand: nur der Führer mit aktuellem g (nach Kaltstart übernimmt ein weiterlaufender Führer still wieder).
  gs(st, p, raw, cx) {
    const m = V.gs(raw);
    if (!m) return;
    expired(st, cx);
    const r = G(st, cx.now);
    const h = holderOf(st, cx.now);
    if (!h && !isVR(p) && m.g >= 1 && m.g <= G_TAKEOVER_MAX && m.g >= r.g) grant(st, cx, p, m.g);
    else if (!h || h !== p || m.g !== r.g) { cx.sendTo(p.c, { t: 'er', c: 'stale', y: 'gs' }); return; }
    r.q = m.q;
    r.at = cx.now;
    const ev = { t: 'gs', c: p.c, g: r.g, q: m.q };
    for (const q of fightPeers(st, p)) sendGs(cx, q.c, ev);
  },

  gr(st, p, raw, cx) {
    if (!V.gr(raw)) return;
    const h = holderOf(st, cx.now);
    if (h && h === p) release(cx);
  },

  // Treffer der Spieler auf Bandenmitglieder: an den Führer (er führt die Lebenspunkte).
  gh(st, p, raw, cx) {
    const m = V.gh(raw);
    if (!m || isVR(p)) return;
    expired(st, cx);
    const h = holderOf(st, cx.now);
    if (!h || h === p) return;
    cx.sendTo(h.c, { t: 'gh', c: p.c, i: m.i, w: m.w });
  },
};

export default {
  cap,
  handlers,
  // Alter Eintrag gleicher Verbindungsnummer (Kaltstart-Rest) weg.
  onOpen(st, p, cx) {
    if (st.store[key(p.c)] !== undefined) cx.del(key(p.c));
  },
  onClose(st, p, cx) {
    if (st.store[key(p.c)] !== undefined) cx.del(key(p.c));
    const r = st.gang;
    if (r && r.c === p.c) release(cx);
  },
  onFlags(st, p, old, now, cx) {
    if (now & FLAG.VR) {
      if (st.store[key(p.c)] !== undefined) cx.del(key(p.c));
      const r = st.gang;
      if (r && r.c === p.c) release(cx);
    }
  },
  welcome(st, p, cx) {
    if (!p.cap.includes('fight')) return {};
    expired(st, cx);
    const wp = {};
    for (const q of Object.values(st.peers)) {
      if (!q.live || q === p) continue;
      const w = entry(st, q.c);
      if (w) wp[q.c] = w;
    }
    const h = holderOf(st, cx.now);
    const r = G(st, cx.now);
    return { wp, gl: h ? h.c : null, gs: h && r.q ? { g: r.g, q: r.q } : null };
  },
  nextDeadline(st, now) {
    if (!holderOf(st, now)) return null;
    return G(st, now).at + GS_TIMEOUT_MS;
  },
  onAlarm(st, now, cx) {
    expired(st, cx);
    for (const k of Object.keys(st.store)) {
      if (!k.startsWith(PREFIX)) continue;
      const p = st.peers[k.slice(PREFIX.length)];
      if (!p || !p.live) cx.del(k);
    }
  },
  storeKeys: [PREFIX],
};
