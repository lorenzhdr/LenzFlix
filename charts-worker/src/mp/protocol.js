// Mehrspieler lfx-mp.1: Protokoll-Kern (rein, browserfähig, ohne Node-/CF-APIs).
// Validierung und Klemmen laut docs/mp-api.md (§5, §6, §7). Kein Logging.

export const PV = 1;
export const MIN_PV = 1;
export const SUB = 'lfx-mp.1';
export const MAX_FRAME = 2048;
export const MAX_MSGS = 32;
export const CAPS = ['pres', 'chat', 'emote', 'push', 'phys', 'rich', 'wx', 'kino', 'admin'];
export const FLAG = { NAME: 1, FILM: 2, CHAT: 4, VR: 8 };

// Nachrichtentyp -> benötigte Fähigkeit (Client -> Server, nur Nicht-Kern).
export const T_CAP = Object.assign(Object.create(null), {
  m: 'chat', e: 'emote', ki: 'admin',
  pu: 'push', pc: 'phys', ps: 'phys', pn: 'phys', px: 'phys',
  rc: 'rich', rs: 'rich', rr: 'rich',
  ks: 'kino', kj: 'kino', kl: 'kino', kc: 'kino', kb: 'kino',
});
export const CORE_T = ['hi', 'p', 'hd', 'f', 'ck', 'rn'];

export const RE_ITEM = /^[0-9a-f]{32}$/;
export const RE_OBJ = /^[A-Za-z0-9._-]{1,24}$/;
export const RE_K = /^[0-9a-f]{12}$/;
const RE_TK = /^[A-Za-z0-9_-]{1,1200}\.[A-Za-z0-9_-]{1,600}$/;
const RE_BAD_TEXT = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}\p{Co}]/gu;

// Klemmbereiche (Netzrahmen, cm / cRad).
export const RANGE = {
  x: [-3000, 5000], y: [-200, 1200], z: [-1600, 5400],
  yaw: [-315, 315], pitch: [-157, 157], tip: [0, 157], ax: [-100, 100], az: [-100, 100],
  kinoPos: [0, 12 * 3600 * 1000],
};

export const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
export const clampInt = (v, lo, hi) => Math.min(hi, Math.max(lo, Math.round(v)));
export const isItemId = (v) => typeof v === 'string' && RE_ITEM.test(v);
export const isObjId = (v) => typeof v === 'string' && RE_OBJ.test(v);
export const isKey = (v) => typeof v === 'string' && RE_K.test(v);

// NFC, Steuer-/Bidi-/Zero-Width-Zeichen raus, Leerraum zusammenfassen, höchstens `max` Codepoints.
export function cleanText(s, max) {
  if (typeof s !== 'string') return '';
  let t = s.length > max * 8 ? s.slice(0, max * 8) : s;
  try { t = t.normalize('NFC'); } catch { /* ignorieren */ }
  t = t.replace(/[\t\n\r\u2028\u2029]/g, ' ').replace(RE_BAD_TEXT, '').replace(/\s+/g, ' ').trim();
  const cp = Array.from(t);
  return cp.length > max ? cp.slice(0, max).join('').trim() : t;
}

// Rohtext -> { ok, msgs } | { ok:false, code:4000 }. Nur Text, höchstens 2 kB, JSON-Array.
export function parseFrame(data) {
  if (typeof data !== 'string' || data.length > MAX_FRAME) return { ok: false, code: 4000 };
  let a;
  try { a = JSON.parse(data); } catch { return { ok: false, code: 4000 }; }
  if (!Array.isArray(a) || a.length > MAX_MSGS) return { ok: false, code: 4000 };
  return { ok: true, msgs: a };
}

const flags = (v) => (isNum(v) ? clampInt(v, 0, 15) : null);

// Validatoren der Kern-Nachrichten: roh -> normalisiert | null (verwerfen).
export const V = {
  hi(m) {
    if (!isNum(m.pv) || !Number.isInteger(m.pv) || m.pv < 0) return null;
    if (m.cap !== undefined && !Array.isArray(m.cap)) return null;
    const cap = [];
    for (const c of m.cap || []) if (CAPS.includes(c) && !cap.includes(c)) cap.push(c);
    let f = 0;
    if (m.f !== undefined) { f = flags(m.f); if (f === null) return null; }
    if (m.cv !== undefined && typeof m.cv !== 'string') return null;
    return { t: 'hi', pv: m.pv, cap, f, cv: cleanText(m.cv || '', 16) };
  },
  p(m) {
    const q = m.q;
    if (!Array.isArray(q) || q.length !== 7 || !q.every(isNum)) return null;
    const a = Math.round(q[5]);
    const r = Math.round(q[6]);
    const o = {
      t: 'p',
      q: [
        clampInt(q[0], ...RANGE.x), clampInt(q[1], ...RANGE.y), clampInt(q[2], ...RANGE.z),
        clampInt(q[3], ...RANGE.yaw), clampInt(q[4], ...RANGE.pitch),
        a >= 0 && a <= 8 ? a : 0, r >= 0 && r <= 2 ? r : 0,
      ],
    };
    if (m.se !== undefined) {
      const s = m.se;
      if (!Array.isArray(s) || s.length !== 2 || !isNum(s[0]) || !isNum(s[1])) return null;
      if (o.q[5] === 7) o.se = [clampInt(s[0], 0, 5), clampInt(s[1], 0, 1000)];
    }
    return o;
  },
  hd(m) {
    if (m.i === null) return { t: 'hd', i: null };
    return isItemId(m.i) ? { t: 'hd', i: m.i } : null;
  },
  f(m) {
    const f = flags(m.f);
    return f === null ? null : { t: 'f', f };
  },
  ck(m) {
    return isNum(m.a) && Math.abs(m.a) <= 2 ** 53 ? { t: 'ck', a: m.a } : null;
  },
  rn(m) {
    return typeof m.tk === 'string' && RE_TK.test(m.tk) ? { t: 'rn', tk: m.tk } : null;
  },
};
