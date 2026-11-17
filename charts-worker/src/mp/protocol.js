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

export const VMAX = 1600; // cm/s, Geschwindigkeitsklemme (docs/mp-api.md §5)
export const SPINMAX = 2000; // cRad/s, Drehung geworfener Hüllen
export const PS_MAX = 8; // Einträge je ps
export const RE_NETID = /^[1-9][0-9]{0,4}\.[0-9]{1,6}$/; // Spawn-Id "<c>.<n>"

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
  // Chat (Welle b): Text bereinigt, höchstens 200 Zeichen; leer -> verwerfen.
  m(m) {
    const x = cleanText(m.x, 200);
    return x ? { t: 'm', x } : null;
  },
  // Emote: Code 1..8, sonst verwerfen.
  e(m) {
    return isNum(m.e) && Number.isInteger(m.e) && m.e >= 1 && m.e <= 8 ? { t: 'e', e: m.e } : null;
  },
  // Admin-Kick: Ziel = Verbindungsnummer 1..65535.
  ki(m) {
    return isNum(m.c) && Number.isInteger(m.c) && m.c >= 1 && m.c <= 65535 ? { t: 'ki', c: m.c } : null;
  },
  // Physik (Welle c). pc: Besitz-Anspruch, g = zuletzt gesehene Vergabe-Nummer (0 = keine).
  pc(m) {
    if (!isObjId(m.i)) return null;
    const g = m.g === undefined ? 0 : m.g;
    if (!isNum(g) || g < 0) return null;
    return { t: 'pc', i: m.i, g: clampInt(g, 0, 65535) };
  },
  // ps: bis 8 Einträge [i,g,x,y,z,vx,vy,vz,yaw,tip,ax,az,s]; s 0 wach / 1 schläft; ax/az nur bei tip>0.
  ps(m) {
    const l = m.l;
    if (!Array.isArray(l) || l.length < 1 || l.length > PS_MAX) return null;
    const out = [];
    for (const e of l) {
      if (!Array.isArray(e) || e.length !== 13 || !isObjId(e[0]) || !e.slice(1).every(isNum)) return null;
      const tip = clampInt(e[9], ...RANGE.tip);
      out.push([
        e[0], clampInt(e[1], 0, 65535),
        clampInt(e[2], ...RANGE.x), clampInt(e[3], ...RANGE.y), clampInt(e[4], ...RANGE.z),
        clampInt(e[5], -VMAX, VMAX), clampInt(e[6], -VMAX, VMAX), clampInt(e[7], -VMAX, VMAX),
        clampInt(e[8], ...RANGE.yaw), tip,
        tip > 0 ? clampInt(e[10], ...RANGE.ax) : 0, tip > 0 ? clampInt(e[11], ...RANGE.az) : 0,
        Math.round(e[12]) === 1 ? 1 : 0,
      ]);
    }
    return { t: 'ps', l: out };
  },
  // pn: Spawn einer geworfenen Hülle. i = "<c>.<n>", it = Item-ID oder null, q = [x,y,z,vx,vy,vz,yaw,spin].
  pn(m) {
    if (typeof m.i !== 'string' || !RE_NETID.test(m.i)) return null;
    if (m.it !== null && m.it !== undefined && !isItemId(m.it)) return null;
    const q = m.q;
    if (!Array.isArray(q) || q.length !== 8 || !q.every(isNum)) return null;
    return {
      t: 'pn', i: m.i, it: m.it || null,
      q: [
        clampInt(q[0], ...RANGE.x), clampInt(q[1], ...RANGE.y), clampInt(q[2], ...RANGE.z),
        clampInt(q[3], -VMAX, VMAX), clampInt(q[4], -VMAX, VMAX), clampInt(q[5], -VMAX, VMAX),
        clampInt(q[6], ...RANGE.yaw), clampInt(q[7], -SPINMAX, SPINMAX),
      ],
    };
  },
  px(m) {
    return typeof m.i === 'string' && RE_NETID.test(m.i) ? { t: 'px', i: m.i } : null;
  },
  // pu: Schubs. c = Ziel-Verbindung, d = [dx,dz] (Einheitsvektor x100), s = Stärke 1..100.
  pu(m) {
    if (!isNum(m.c) || !Number.isInteger(m.c) || m.c < 1 || m.c > 65535) return null;
    const d = m.d;
    if (!Array.isArray(d) || d.length !== 2 || !isNum(d[0]) || !isNum(d[1]) || !isNum(m.s)) return null;
    const dx = clampInt(d[0], -100, 100);
    const dz = clampInt(d[1], -100, 100);
    if (dx === 0 && dz === 0) return null;
    return { t: 'pu', c: m.c, d: [dx, dz], s: clampInt(m.s, 1, 100) };
  },
  rn(m) {
    return typeof m.tk === 'string' && RE_TK.test(m.tk) ? { t: 'rn', tk: m.tk } : null;
  },
};
