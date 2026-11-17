// Unter-Reducer "kino" (Welle d, W-K): gemeinsames Kino im LENZ PALAST (docs/mp-api.md §7, §8.4, §12;
// Entwurf .tmp/v116/design/des-cinema.md). Sitzungen `ks` (Start), `kj` (Mitschauen), `kl` (Verlassen),
// `kc` (Steuerbefehl, absoluter Zielzustand mit CAS über `v`), `kb` (Puffern, gemeinsames Warten bis 10 s).
// Zustand: Speicher `st.kino` plus Storage `hall` (vollständig, bei jeder Änderung; Kaltstart-Wiederherstellung).
// Ausgang rein diff-basiert (`finish`): `hall` nur bei Änderung, `kh{l}` (öffentliche Liste, `ev` in b) nur bei
// Änderung, `kx` (empfängerspezifisch) an alle Mitglieder einer geänderten Sitzung.
// Datenschutz (vom Server erzwungen): Item-ID geht nur raus, solange der aktuelle Gastgeber `f&2` (Film sichtbar)
// hat. Private Sitzungen stehen nicht in `kh`, bieten kein Mitschauen und tragen kein `i` in `kx`. Titel gibt es
// auf der Leitung nie. Die Validatoren stehen hier (nicht in protocol.js).
import { FLAG, RANGE, isNum, isItemId, clampInt } from './protocol.js';

// Server kündigt `kino` nur an, wenn true. Notbremse/N6 des Entwurfs: auf false -> Palast verhält sich wie 1.15.
export const ANNOUNCE = true;
export const cap = ANNOUNCE ? 'kino' : null;
export const MAX_SESSIONS = 8;
export const BUF_WAIT_MS = 10000;
export const LG_MS = 60000;
const MAX_V = 2 ** 31;

const isInt = (v) => isNum(v) && Number.isInteger(v);
const sidOk = (v) => isInt(v) && v >= 1 && v <= 65535;

// Validatoren: roh -> normalisiert | null (verwerfen).
export const V = {
  ks(m) {
    if (m.i !== undefined && m.i !== null && !isItemId(m.i)) return null;
    if (m.p !== undefined && !isNum(m.p)) return null;
    const o = { t: 'ks', i: m.i || null, p: m.p === undefined ? 0 : clampInt(m.p, ...RANGE.kinoPos) };
    if (isNum(m.dur) && m.dur >= 0) o.dur = clampInt(m.dur, ...RANGE.kinoPos);
    return o;
  },
  kj(m) { return sidOk(m.sid) ? { t: 'kj', sid: m.sid } : null; },
  kl(m) { return sidOk(m.sid) ? { t: 'kl', sid: m.sid } : null; },
  kc(m) {
    if (!sidOk(m.sid) || !isInt(m.v) || m.v < 0 || m.v > MAX_V || !isInt(m.o) || m.o < 1 || m.o > 3 || !isNum(m.p)) return null;
    return { t: 'kc', sid: m.sid, v: m.v, o: m.o, p: clampInt(m.p, ...RANGE.kinoPos) };
  },
  kb(m) {
    if (!sidOk(m.sid) || !(m.b === 0 || m.b === 1)) return null;
    return { t: 'kb', sid: m.sid, b: m.b };
  },
};

// ---------------------------------------------------------------- Zustand

// Sitzung: {sid, host, i, v, st (0 wartet, 1 läuft, 2 pause), p, at, m[] (Beitrittsreihenfolge), buf[], lg{c: bis}, w}
function ensure(st) {
  if (st.kino) return st.kino;
  const raw = st.store && st.store.hall;
  const K = { n: 1, s: [], lastHall: null, lastKh: '', lastKx: {} };
  if (raw && typeof raw === 'object' && Array.isArray(raw.s)) {
    K.n = isInt(raw.n) && raw.n >= 1 ? raw.n : 1;
    for (const s of raw.s) {
      if (!s || !sidOk(s.sid) || !isInt(s.host) || !Array.isArray(s.m) || !s.m.every(isInt)) continue;
      K.s.push({
        sid: s.sid, host: s.host, i: isItemId(s.i) ? s.i : null, v: isInt(s.v) ? s.v : 0, st: s.st === 1 || s.st === 2 ? s.st : 0,
        p: isNum(s.p) ? s.p : 0, at: isNum(s.at) ? s.at : 0, m: s.m.slice(0, 16),
        buf: Array.isArray(s.buf) ? s.buf.filter(isInt) : [], lg: s.lg && typeof s.lg === 'object' ? { ...s.lg } : {},
        w: isNum(s.w) ? s.w : null,
      });
    }
  }
  K.lastHall = JSON.stringify(hallOf(K));
  K.lastKh = JSON.stringify(khList(st, K)); // Kaltstart: kein überflüssiges kh an alle
  st.kino = K;
  return K;
}

const hallOf = (K) => ({ n: K.n, s: K.s });
const sessOf = (K, sid) => K.s.find((s) => s.sid === sid) || null;
const sessOfPeer = (K, c) => K.s.find((s) => s.m.includes(c)) || null;
const pubOf = (st, s) => {
  const h = st.peers[s.host];
  return !!(h && h.f & FLAG.FILM);
};
export const expectedPos = (s, now) => Math.min(RANGE.kinoPos[1], s.st === 1 ? s.p + Math.max(0, now - s.at) : s.p);
const inLg = (s, c, now) => Number.isFinite(s.lg[c]) && s.lg[c] > now;

// Sicht eines Mitglieds: kx (i nur bei sichtbarem Film des Gastgebers).
function kxOf(st, s, now) {
  const x = { t: 'kx', sid: s.sid, v: s.v, st: s.st, p: Math.round(s.p), at: Math.round(s.at), m: s.m.slice(), lg: s.m.filter((c) => inLg(s, c, now)) };
  if (pubOf(st, s) && s.i) x.i = s.i;
  if (s.w) x.w = Math.round(s.w);
  return x;
}

function khList(st, K) {
  const l = [];
  for (const s of K.s) {
    if (!pubOf(st, s) || !s.i) continue;
    l.push([s.sid, s.host, s.i, s.m.length, s.st, s.m.slice(), Math.round(s.p), Math.round(s.at)]);
  }
  return l;
}

// Mitglied aus der Sitzung nehmen (Host geht an das älteste Mitglied, leere Sitzungen verschwinden).
function dropMember(s, c) {
  s.m = s.m.filter((x) => x !== c);
  s.buf = s.buf.filter((x) => x !== c);
  delete s.lg[c];
  if (s.host === c && s.m.length) s.host = s.m[0];
}

// Puffer leer bei st=0 -> weiter (st=1, at=now).
function resolve(s, now) {
  if (s.st === 0 && s.buf.length === 0) {
    s.st = 1; s.at = now; s.w = null; s.v += 1;
  }
}

// Fristen und Aufräumen: tote Mitglieder, abgelaufene lg, abgelaufenes `w`, leere Sitzungen.
function tick(st, now) {
  const K = ensure(st);
  for (const s of K.s) {
    for (const c of s.m.slice()) {
      const p = st.peers[c];
      if (!p || !p.live) dropMember(s, c);
    }
    for (const c of Object.keys(s.lg)) if (!(s.lg[c] > now) || !s.m.includes(Number(c))) delete s.lg[c];
    if (s.st === 0 && s.m.length) {
      if (s.w && now >= s.w) {
        for (const c of s.buf) s.lg[c] = now + LG_MS;
        s.buf = [];
        s.st = 1; s.at = now; s.w = null; s.v += 1;
      } else resolve(s, now);
    }
  }
  K.s = K.s.filter((s) => s.m.length > 0);
  return K;
}

// Ausgang: hall (Storage), kh (öffentlich, einmal an alle), kx (an Mitglieder geänderter Sitzungen).
function finish(st, cx) {
  const K = ensure(st);
  const now = cx.now;
  const hall = JSON.stringify(hallOf(K));
  if (hall !== K.lastHall) {
    if (K.s.length) cx.put('hall', JSON.parse(hall)); else cx.del('hall');
    K.lastHall = hall;
  }
  const kh = khList(st, K);
  const khs = JSON.stringify(kh);
  if (khs !== K.lastKh) { K.lastKh = khs; cx.emit({ t: 'kh', l: kh }); cx.flushNow(); }
  const seen = {};
  for (const s of K.s) {
    const x = kxOf(st, s, now);
    const j = JSON.stringify(x);
    seen[s.sid] = j;
    if (K.lastKx[s.sid] !== j) for (const c of s.m) cx.sendTo(c, x);
  }
  K.lastKx = seen;
}

function er(cx, p, code, y) { cx.sendTo(p.c, { t: 'er', c: code, y }); }

function leave(K, p, now) {
  const s = sessOfPeer(K, p.c);
  if (s) { dropMember(s, p.c); if (s.m.length) resolve(s, now); }
}

// ---------------------------------------------------------------- Handler

export const handlers = {
  ks(st, p, raw, cx) {
    const m = V.ks(raw);
    if (!m) return;
    const K = tick(st, cx.now);
    leave(K, p, cx.now);
    K.s = K.s.filter((s) => s.m.length > 0);
    if (K.s.length >= MAX_SESSIONS) { finish(st, cx); er(cx, p, 'cap', 'ks'); return; }
    let sid = K.n;
    for (let i = 0; i < 65535 && sessOf(K, sid); i++) sid = sid >= 65535 ? 1 : sid + 1;
    K.n = sid >= 65535 ? 1 : sid + 1;
    // wartet auf Start (st=0 ohne w): der Gastgeber meldet danach kb 0
    K.s.push({ sid, host: p.c, i: m.i, v: 1, st: 0, p: m.p, at: cx.now, m: [p.c], buf: [p.c], lg: {}, w: null });
    finish(st, cx);
  },
  kj(st, p, raw, cx) {
    const m = V.kj(raw);
    if (!m) return;
    const K = tick(st, cx.now);
    const s = sessOf(K, m.sid);
    if (!s || !pubOf(st, s) || !s.i) { finish(st, cx); er(cx, p, 'deny', 'kj'); return; }
    if (!s.m.includes(p.c)) {
      leave(K, p, cx.now);
      s.m.push(p.c);
      s.lg[p.c] = cx.now + LG_MS; // Neuer hält niemanden auf
    } else cx.sendTo(p.c, kxOf(st, s, cx.now));
    K.s = K.s.filter((x) => x.m.length > 0);
    finish(st, cx);
  },
  kl(st, p, raw, cx) {
    const m = V.kl(raw);
    if (!m) return;
    const K = tick(st, cx.now);
    const s = sessOf(K, m.sid);
    if (s && s.m.includes(p.c)) { dropMember(s, p.c); if (s.m.length) resolve(s, cx.now); }
    K.s = K.s.filter((x) => x.m.length > 0);
    finish(st, cx);
  },
  kc(st, p, raw, cx) {
    const m = V.kc(raw);
    if (!m) return;
    const K = tick(st, cx.now);
    const s = sessOf(K, m.sid);
    if (!s || !s.m.includes(p.c)) { finish(st, cx); er(cx, p, 'deny', 'kc'); return; }
    if (m.v !== s.v) { finish(st, cx); er(cx, p, 'stale', 'kc'); cx.sendTo(p.c, kxOf(st, s, cx.now)); return; }
    const now = cx.now;
    if (m.o === 3) { // Seek: Position setzen, Zustand bleibt (Warten läuft weiter)
      s.p = m.p;
      if (s.st === 1) s.at = now;
    } else { // play/pause überschreiben auch das gemeinsame Warten
      s.st = m.o === 1 ? 1 : 2;
      s.p = m.p; s.at = now; s.buf = []; s.w = null;
    }
    s.v += 1;
    finish(st, cx);
  },
  kb(st, p, raw, cx) {
    const m = V.kb(raw);
    if (!m) return;
    const K = tick(st, cx.now);
    const s = sessOf(K, m.sid);
    if (!s || !s.m.includes(p.c)) { finish(st, cx); return; }
    const now = cx.now;
    if (m.b === 1) {
      if (inLg(s, p.c, now)) { finish(st, cx); return; }
      if (s.st === 1) {
        s.p = expectedPos(s, now); s.at = now; s.st = 0; s.w = now + BUF_WAIT_MS; s.buf = [p.c]; s.v += 1;
      } else if (s.st === 0 && !s.buf.includes(p.c)) s.buf.push(p.c); // ohne w zu verlängern
    } else if (s.buf.includes(p.c)) {
      s.buf = s.buf.filter((c) => c !== p.c);
      resolve(s, now);
    }
    finish(st, cx);
  },
};

export default {
  cap,
  handlers,
  onOpen() {},
  // Verbindung weg (p schon aus st.peers entfernt): tick räumt Mitgliedschaft, Host-Übergabe, Puffer.
  onClose(st, p, cx) { tick(st, cx.now); finish(st, cx); },
  // Gastgeber schaltet "Film sichtbar": kh und kx.i folgen (pv wird nie gespeichert, immer live berechnet).
  onFlags(st, p, old, now, cx) {
    if ((old ^ now) & FLAG.FILM) { tick(st, cx.now); finish(st, cx); }
  },
  welcome(st, p, cx) {
    tick(st, cx.now);
    finish(st, cx);
    if (!p.cap.includes('kino')) return {};
    return { kh: khList(st, ensure(st)) };
  },
  nextDeadline(st) {
    let d = null;
    for (const s of ensure(st).s) if (s.st === 0 && s.w && (d === null || s.w < d)) d = s.w;
    return d;
  },
  onAlarm(st, now, cx) { tick(st, now); finish(st, cx); },
  storeKeys: ['hall'],
};
