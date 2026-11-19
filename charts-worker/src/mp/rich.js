// Unter-Reducer "rich" (Welle c, W-C2): Richard gemeinsam (docs/mp-api.md §7, §8.2; Entscheidung W12/W14).
// Autorität gibt es nur im Streit: `rc` (Treffer) vergibt sie, `rs` (Zustand) darf nur der Inhaber senden,
// `rr` oder Disconnect/VR/60 s ohne `rs` geben sie frei (dann läuft Richard überall lokal, `ra.c = 0`).
// Der Inhaber steht im Attachment seiner Verbindung (`p.ra = {g, rf:1, tg}`), die zuletzt gesehene Richard-
// Pose und der g-Zähler liegen nur im Speicher (nach Hibernation: g = größter Attachment-Wert, `at` = jetzt).
// Hausverbot gilt pro Verbindung (`tg` = Ziel-Verbindung des Streits, Server vergibt es = Claimer).
// Die Validatoren stehen hier (nicht in protocol.js), damit W-C und W-C2 keine Datei teilen.
import { FLAG, RANGE, isNum, clampInt } from './protocol.js';

// 1.19.0: `rich2` = rs.q darf ein 9. Element tragen (Trefferart, 0 keine, 1 Laser); rein additiv, ohne eigene Nachricht.
export const cap = ['rich', 'rich2'];
export const RS_TIMEOUT_MS = 60000;
const HOSTILE = [2, 3, 4, 5]; // shove, throw, chase, banned (Indizes in STATES, modules/brawl-fsm.js)
const S_CALM = 0;

const isInt = (v) => isNum(v) && Number.isInteger(v);

// Validatoren: roh -> normalisiert | null (verwerfen).
export const V = {
  rc() { return { t: 'rc' }; },
  rs(m) {
    const q = m.q;
    if (!isInt(m.g) || m.g < 0 || !Array.isArray(q) || (q.length !== 8 && q.length !== 9) || !q.every(isNum)) return null;
    if (m.tg !== undefined && !(isInt(m.tg) && m.tg >= 0 && m.tg <= 65535)) return null;
    const s = Math.round(q[0]);
    if (s < 0 || s > 6) return null;
    return {
      t: 'rs', g: m.g, tg: m.tg === undefined ? 0 : m.tg,
      q: [
        s, clampInt(q[1], 0, 255), clampInt(q[2], 0, 36000),
        clampInt(q[3], ...RANGE.x), clampInt(q[4], ...RANGE.y), clampInt(q[5], ...RANGE.z),
        clampInt(q[6], ...RANGE.yaw), clampInt(q[7], 0, 9),
        ...(q.length === 9 ? [clampInt(q[8], 0, 1)] : []),
      ],
    };
  },
  rr(m) { return isInt(m.g) && m.g >= 0 ? { t: 'rr', g: m.g } : null; },
};

// ---------------------------------------------------------------- Zustand (nur Speicher)

function R(st, now) {
  let r = st.rich;
  if (!r) {
    let g = 0;
    for (const p of Object.values(st.peers)) if (p.ra && p.ra.g > g) g = p.ra.g;
    r = st.rich = { g, q: null, at: now };
  }
  return r;
}

function holderOf(st) {
  for (const p of Object.values(st.peers)) if (p.live && p.ra && p.ra.rf) return p;
  return null;
}

function release(st, cx, p) {
  const r = R(st, cx.now);
  if (p) { p.ra = null; if (st.peers[p.c] === p) cx.markAtt(p.c); }
  r.q = null;
  cx.emit({ t: 'ra', c: 0, g: r.g, tg: 0 });
  cx.flushNow();
}

function expired(st, cx) {
  const h = holderOf(st);
  if (h && cx.now - R(st, cx.now).at >= RS_TIMEOUT_MS) { release(st, cx, h); return true; }
  return false;
}

export const handlers = {
  // Treffer auf Richard: Autorität beanspruchen (nur wenn frei, eigener Besitz oder nicht feindlich gegen anderes tg).
  rc(st, p, raw, cx) {
    if (!V.rc(raw)) return;
    if (p.f & FLAG.VR) { cx.sendTo(p.c, { t: 'er', c: 'deny', y: 'rc' }); return; }
    expired(st, cx);
    const r = R(st, cx.now);
    const h = holderOf(st);
    if (h && h === p) { r.at = cx.now; return; }
    if (h) {
      const s = r.q ? r.q[0] : S_CALM;
      if (HOSTILE.includes(s) && h.ra.tg !== p.c) { cx.sendTo(p.c, { t: 'er', c: 'deny', y: 'rc' }); return; }
      h.ra = null;
      cx.markAtt(h.c);
    } else r.q = null;
    r.g += 1;
    r.at = cx.now;
    p.ra = { g: r.g, rf: 1, tg: p.c };
    cx.markAtt(p.c);
    cx.emit({ t: 'ra', c: p.c, g: r.g, tg: p.c });
    cx.flushNow();
  },
  // Zustand: nur der Inhaber mit aktuellem g.
  rs(st, p, raw, cx) {
    const m = V.rs(raw);
    if (!m) return;
    expired(st, cx);
    const r = R(st, cx.now);
    if (!p.ra || !p.ra.rf || p.ra.g !== m.g || m.g !== r.g) { cx.sendTo(p.c, { t: 'er', c: 'stale', y: 'rs' }); return; }
    r.q = m.q;
    r.at = cx.now;
    const ev = { t: 'rs', c: p.c, g: p.ra.g, q: m.q, tg: p.ra.tg };
    const i = st.evq.findIndex((e) => e.t === 'rs'); // nur der jüngste Stand je Flush
    if (i >= 0) st.evq[i] = ev; else cx.emit(ev);
    if (m.q[0] === S_CALM) cx.flushNow(); // Endzustand
  },
  // Freigabe durch den Inhaber (Rückkehr zu calm, Laden verlassen, Ende).
  rr(st, p, raw, cx) {
    const m = V.rr(raw);
    if (!m) return;
    if (!p.ra || !p.ra.rf || p.ra.g !== m.g) return;
    release(st, cx, p);
  },
};

export default {
  cap,
  handlers,
  onOpen(st, p, cx) {
    if (!p.cap.includes('rich')) return;
    const h = holderOf(st);
    const r = R(st, cx.now);
    if (h && r.q) cx.sendTo(p.c, { t: 'rs', c: h.c, g: h.ra.g, q: r.q, tg: h.ra.tg });
  },
  // Inhaber weg (p ist schon aus st.peers entfernt) -> Freigabe, Richard fällt auf calm/lokal.
  onClose(st, p, cx) {
    if (p.ra && p.ra.rf) { p.ra = null; release(st, cx, null); }
  },
  // VR-Verbindungen sind nie Autorität.
  onFlags(st, p, old, now, cx) {
    if (now & FLAG.VR && p.ra && p.ra.rf) release(st, cx, p);
  },
  welcome(st, p, cx) {
    if (!p.cap.includes('rich')) return {};
    expired(st, cx);
    const h = holderOf(st);
    const r = R(st, cx.now);
    return { ra: { c: h ? h.c : 0, g: h ? h.ra.g : r.g, tg: h ? h.ra.tg : 0 } };
  },
  nextDeadline(st, now) {
    if (!holderOf(st)) return null;
    return R(st, now).at + RS_TIMEOUT_MS;
  },
  onAlarm(st, now, cx) { expired(st, cx); },
  storeKeys: [],
};
