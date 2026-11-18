// Unter-Reducer "look" (1.17.0): eigene Figur und Mitgliedsausweis der Mitspieler (docs/mp-api.md §12).
// `lk {l}` = Look-Code (Int-Array), `mc {m}` = Ausweisdaten oder null. Zustand je Verbindung in `st.store['lk:<c>']`
// = {l, m} (Speicher) und gleichlautend im DO-Storage (Kaltstart/Hibernation laden das Präfix `lk:`).
// Weitergabe nur an Peers mit Fähigkeit `look` (nie an den Absender). Welcome liefert den Stand aller anderen.
import { isNum } from './protocol.js';

export const cap = 'look';
const PREFIX = 'lk:';
const MAX_C = 0x1ffffff;
const MAX_I = 2 ** 31 - 1;

const isInt = (v) => isNum(v) && Number.isInteger(v);

// Validatoren: roh -> normalisiert | null (verwerfen).
export const V = {
  lk(m) {
    const l = m.l;
    if (!Array.isArray(l) || l.length < 4 || l.length > 48 || !l.every(isInt)) return null;
    if (l[0] < 1 || l[0] > 15) return null;
    for (let i = 1; i < l.length; i++) if (l[i] < 0 || l[i] > MAX_C) return null;
    return { t: 'lk', l: l.slice() };
  },
  mc(m) {
    if (m.m === null) return { t: 'mc', m: null };
    const a = m.m;
    if (!Array.isArray(a) || a.length < 2 || a.length > 12 || !a.every((v) => isInt(v) && v >= 0 && v <= MAX_I)) return null;
    return { t: 'mc', m: a.slice() };
  },
};

const key = (c) => PREFIX + c;

function entry(st, c) {
  const e = st.store[key(c)];
  return e && typeof e === 'object' ? e : null;
}

function others(st, p) {
  return Object.values(st.peers).filter((q) => q.live && q !== p && q.cap.includes('look'));
}

function save(cx, c, patch) {
  const e = { ...(entry(cx.st, c) || { l: null, m: null }), ...patch };
  cx.put(key(c), e);
}

export const handlers = {
  lk(st, p, raw, cx) {
    const m = V.lk(raw);
    if (!m) return;
    save(cx, p.c, { l: m.l });
    for (const q of others(st, p)) cx.sendTo(q.c, { t: 'lk', c: p.c, l: m.l });
  },
  mc(st, p, raw, cx) {
    const m = V.mc(raw);
    if (!m) return;
    save(cx, p.c, { m: m.m });
    for (const q of others(st, p)) cx.sendTo(q.c, { t: 'mc', c: p.c, m: m.m });
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
  },
  onFlags() {},
  welcome(st, p) {
    if (!p.cap.includes('look')) return {};
    const lk = {};
    const mc = {};
    for (const q of Object.values(st.peers)) {
      if (!q.live || q === p) continue;
      const e = entry(st, q.c);
      if (!e) continue;
      if (Array.isArray(e.l)) lk[q.c] = e.l;
      if (Array.isArray(e.m)) mc[q.c] = e.m;
    }
    return { lk, mc };
  },
  nextDeadline() { return null; },
  // Verwaiste Schlüssel (Verbindung weg, z. B. nach Hibernation/Neustart) aufräumen.
  onAlarm(st, now, cx) {
    for (const k of Object.keys(st.store)) {
      if (!k.startsWith(PREFIX)) continue;
      const p = st.peers[k.slice(PREFIX.length)];
      if (!p || !p.live) cx.del(k);
    }
  },
  storeKeys: [PREFIX],
};
