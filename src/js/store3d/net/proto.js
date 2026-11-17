// VIDEOTHEK LENZ · Mehrspieler: Protokoll lfx-mp.1 (rein, ohne three/DOM). Eingefrorene Codes, Builder je Nachrichtentyp,
// Klemmen, Bereinigung und der Regen-Würfel. Vertrag: docs/mp-api.md (§5 Klemmen, §6.2 Codes, §7 Nachrichten).
// Alle Builder liefern ein normalisiertes Objekt oder null (ungültig, wird nie gesendet). `normalizeOut(msg)` ist dieselbe
// Prüfung für fertige Nachrichten (Gegenstück zum Server-Validator; die Golden-Dateien des Workers prüfen beides).

export const SUB = 'lfx-mp.1';
export const PV = 1;
export const CAPS = ['pres', 'chat', 'emote', 'push', 'phys', 'rich', 'wx', 'kino', 'admin'];

/** Flag-Bits `f`. */
export const F = { NAME: 1, FILM: 2, CHAT: 4, VR: 8 };

/** Pose-`a` auf der Leitung (0–6 wertgleich zu Body.ANIM, 7 Sitzen, 8 Wurf). Tabellen nur am Ende ergänzen. */
export const NET_A = { STAND: 0, WALK: 1, RUN: 2, AIR: 3, KNOCK: 4, MANTLE: 5, HIT: 6, SIT: 7, THROW: 8 };
/** Body.ANIM-Wert -> Leitungscode (bewusst eine Tabelle, nie Identität annehmen). Schlüssel = Body.ANIM.STAND … HIT. */
export const BODY_TO_NET = { 0: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 };
/** Leitungscode (Index) -> Name in npc/anim.js ANIMS beim Empfänger. */
export const NET_A_ANIM = ['idle', 'walk', 'run', 'idle', 'stagger', 'idle', 'hit', 'sit', 'throw'];

/** Emote-`e` (1..8) und Namen in ANIMS beim Empfänger (dance/clap/thumbs/bow kommen in Welle b hinzu). */
export const EMOTE = { WAVE: 1, CHEER: 2, POINT: 3, SIT: 4, DANCE: 5, CLAP: 6, THUMBS: 7, BOW: 8 };
export const EMOTE_ANIM = [null, 'wave', 'cheer', 'point', 'sit', 'dance', 'clap', 'thumbs', 'bow'];

/** Pose-`a`, bei denen ein laufendes Emote beim Empfänger endet. */
export const EMOTE_END_A = [1, 2, 3, 4, 6, 8];

/** Ort `r`: 0 Laden, 1 Palast (Halle, Foyer), 2 draußen. */
export const R = { SHOP: 0, PALAST: 1, OUT: 2 };

/** Fähigkeit je Nachrichtentyp (Client -> Server). */
export const CAP_OF = {
  hi: null, ck: null, rn: null, p: 'pres', hd: 'pres', f: 'pres', e: 'emote', m: 'chat', ki: 'admin',
  pu: 'push', pc: 'phys', ps: 'phys', pn: 'phys', px: 'phys', rc: 'rich', rs: 'rich', rr: 'rich',
  ks: 'kino', kj: 'kino', kl: 'kino', kc: 'kino', kb: 'kino',
};

/** Klemmen im Netzrahmen (cm, cRad, cm/s). */
export const LIM = {
  x: [-3000, 5000], y: [-200, 1200], z: [-1600, 5400], v: 1600, yaw: 315, pitch: 157, tip: [0, 157], ax: 100,
  kinoP: [0, 12 * 3600 * 1000], textMax: 200, nameMax: 24, frameChars: 2048,
};

export const ITEM_RE = /^[0-9a-f]{32}$/;
export const OBJ_RE = /^[A-Za-z0-9._-]{1,24}$/;
const TK_RE = /^[A-Za-z0-9_-]{1,1200}\.[A-Za-z0-9_-]{1,400}$/; // b64url(Nutzlast).b64url(HMAC)

const num = (v) => typeof v === 'number' && Number.isFinite(v);
const clampN = (v, a, b) => (v < a ? a : v > b ? b : v);
/** Zahl -> geklemmter int (kein -0) oder null bei nicht-endlicher Zahl. */
const ci = (v, a, b) => (num(v) ? clampN(Math.round(v), a, b) + 0 : null);

// --- Bereinigung ---------------------------------------------------------------------------------------------------
// eslint-disable-next-line no-control-regex
const CTRL_RE = /[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/g;

/** Text bereinigen: NFC, Whitespace zu Leerzeichen, Steuer-/Bidi-/Zero-Width-Zeichen raus, auf `max` Codepoints kürzen. */
export function sanitize(s, max = LIM.textMax) {
  if (typeof s !== 'string') return '';
  let t = s;
  try { t = t.normalize('NFC'); } catch { /* ungültige Surrogate: unverändert */ }
  t = t.replace(/[\t\n\r\u2028\u2029]+/g, ' ').replace(CTRL_RE, '').replace(/ {2,}/g, ' ').trim();
  const cp = Array.from(t);
  return cp.length > max ? cp.slice(0, max).join('').trim() : t;
}
export const sanitizeName = (s) => sanitize(s, LIM.nameMax);

// --- Anim-/Emote-Zuordnung ---------------------------------------------------------------------------------------
export function bodyAnimToNet(a) { return Object.prototype.hasOwnProperty.call(BODY_TO_NET, a) ? BODY_TO_NET[a] : 0; }
export function netAnimName(a) { return NET_A_ANIM[a] || 'idle'; }
export function emoteName(e) { return EMOTE_ANIM[e] || null; }
export function emoteEndsOn(a) { return EMOTE_END_A.includes(a); }

// --- Wetter ------------------------------------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const WX_SLOT_MS = 1800000;
export const WX_RAIN_BELOW = 0.35;
/** Regen-Würfel [0,1) für Server-ms und Seed `sd` (alle Clients gleich). */
export function wxRoll(sd, serverMs) {
  const slot = Math.floor(serverMs / WX_SLOT_MS);
  return mulberry32((sd ^ Math.imul(slot, 0x9e3779b1)) >>> 0)();
}
export const wxRain = (sd, serverMs) => wxRoll(sd, serverMs) < WX_RAIN_BELOW;

// --- Normalisierer je Nachrichtentyp ------------------------------------------------------------------------------
const posQ = (q, o) => {
  // q ab Index o: x, y, z (cm)
  const x = ci(q[o], ...LIM.x);
  const y = ci(q[o + 1], ...LIM.y);
  const z = ci(q[o + 2], ...LIM.z);
  return x === null || y === null || z === null ? null : [x, y, z];
};
const yawI = (v) => ci(v, -LIM.yaw, LIM.yaw);
const velI = (v) => ci(v, -LIM.v, LIM.v);
const intIn = (v, a, b) => (num(v) && Number.isInteger(Math.round(v)) ? clampN(Math.round(v), a, b) + 0 : null);
const itemOrNull = (v) => (v === null || v === undefined ? null : typeof v === 'string' && ITEM_RE.test(v) ? v : undefined);
const sidOk = (v) => (typeof v === 'string' ? (OBJ_RE.test(v) ? v : null) : num(v) && v >= 0 ? Math.round(v) : null);

const NORM = {
  hi(m) {
    // wie der Server-Validator: pv Ganzzahl, cap Array (Reihenfolge der Eingabe, ohne Doppelte/Unbekannte), f 0..15, cv gekürzt
    const pv = m.pv === undefined ? PV : Number.isInteger(m.pv) ? m.pv : null;
    if (pv === null || (m.cap !== undefined && !Array.isArray(m.cap))) return null;
    const cap = [];
    for (const c of m.cap || []) if (CAPS.includes(c) && !cap.includes(c)) cap.push(c);
    return { t: 'hi', pv, cap, f: intIn(m.f, 0, 15) ?? 0, cv: sanitize(typeof m.cv === 'string' ? m.cv : '', 16) };
  },
  p(m) {
    const q = m.q;
    if (!Array.isArray(q) || q.length < 7) return null;
    const pos = posQ(q, 0);
    const yaw = yawI(q[3]);
    const pitch = ci(q[4], -LIM.pitch, LIM.pitch);
    if (!pos || yaw === null || pitch === null) return null;
    if (!num(q[5]) || !num(q[6])) return null;
    const ra = Math.round(q[5]);
    const rr = Math.round(q[6]);
    const a = ra >= 0 && ra <= 8 ? ra : 0; // unbekannte Codes -> 0
    const r = rr >= 0 && rr <= 2 ? rr : 0;
    const out = { t: 'p', q: [pos[0], pos[1], pos[2], yaw, pitch, a, r] };
    if (a === 7 && m.se !== undefined && m.se !== null) { // se nur beim Sitzen; kaputt = ganze Nachricht verwerfen
      if (!Array.isArray(m.se) || m.se.length < 2) return null;
      const row = ci(m.se[0], 0, 5);
      const share = ci(m.se[1], 0, 1000);
      if (row === null || share === null) return null;
      out.se = [row, share];
    }
    return out;
  },
  hd(m) { if (!('i' in m)) return null; const i = itemOrNull(m.i); return i === undefined ? null : { t: 'hd', i }; },
  f(m) { const f = intIn(m.f ?? m.b, 0, 15); return f === null ? null : { t: 'f', f }; }, // Feldname `f` (wie hi/pf), `b` nur Eingabe-Alias
  e(m) { const e = intIn(m.e, 1, 8); return e === null ? null : { t: 'e', e }; },
  m(m) { const x = sanitize(m.x, LIM.textMax); return x ? { t: 'm', x } : null; },
  pu(m) {
    const c = intIn(m.c, 1, 65535);
    const s = intIn(m.s, 1, 100);
    const d = Array.isArray(m.d) && m.d.length >= 2 ? [ci(m.d[0], -100, 100), ci(m.d[1], -100, 100)] : null;
    return c === null || s === null || !d || d[0] === null || d[1] === null ? null : { t: 'pu', c, d, s };
  },
  pc(m) { const g = intIn(m.g ?? 0, 0, 0x7fffffff); return typeof m.i === 'string' && OBJ_RE.test(m.i) && g !== null ? { t: 'pc', i: m.i, g } : null; },
  ps(m) {
    if (!Array.isArray(m.l)) return null;
    const l = [];
    for (const e of m.l.slice(0, 8)) {
      if (!Array.isArray(e) || e.length < 13 || typeof e[0] !== 'string' || !OBJ_RE.test(e[0])) continue;
      const g = intIn(e[1], 0, 0x7fffffff);
      const pos = posQ(e, 2);
      const vx = velI(e[5]); const vy = velI(e[6]); const vz = velI(e[7]);
      const yaw = yawI(e[8]);
      const tip = ci(e[9], ...LIM.tip);
      const s = Number.isFinite(e[12]) ? (Math.round(e[12]) === 1 ? 1 : 0) : null; // wie Server: nur 1 = schläft, sonst 0
      if (g === null || !pos || vx === null || vy === null || vz === null || yaw === null || tip === null || s === null) continue;
      const ax = tip > 0 ? (ci(e[10], -LIM.ax, LIM.ax) ?? 0) : 0;
      const az = tip > 0 ? (ci(e[11], -LIM.ax, LIM.ax) ?? 0) : 0;
      l.push([e[0], g, pos[0], pos[1], pos[2], vx, vy, vz, yaw, tip, ax, az, s]);
    }
    return l.length ? { t: 'ps', l } : null;
  },
  pn(m) {
    if (typeof m.i !== 'string' || !OBJ_RE.test(m.i)) return null;
    const it = itemOrNull(m.it);
    const q = m.q;
    if (it === undefined || !Array.isArray(q) || q.length < 8) return null;
    const pos = posQ(q, 0);
    const vx = velI(q[3]); const vy = velI(q[4]); const vz = velI(q[5]);
    const yaw = yawI(q[6]);
    const spin = ci(q[7], -2000, 2000); // SPINMAX des Servers
    if (!pos || vx === null || vy === null || vz === null || yaw === null || spin === null) return null;
    return { t: 'pn', i: m.i, it, q: [pos[0], pos[1], pos[2], vx, vy, vz, yaw, spin] };
  },
  px(m) { return typeof m.i === 'string' && OBJ_RE.test(m.i) ? { t: 'px', i: m.i } : null; },
  rc() { return { t: 'rc' }; },
  rs(m) {
    const g = intIn(m.g, 0, 0x7fffffff);
    const tg = intIn(m.tg ?? 0, 0, 65535);
    const q = m.q;
    if (g === null || tg === null || !Array.isArray(q) || q.length < 8) return null;
    const s = intIn(q[0], 0, 6); const h = intIn(q[1], 0, 255); const r = intIn(q[2], 0, 36000);
    const pos = posQ(q, 3);
    const yaw = yawI(q[6]);
    const a = intIn(q[7], 0, 9);
    if (s === null || h === null || r === null || !pos || yaw === null || a === null) return null;
    return { t: 'rs', g, q: [s, h, r, pos[0], pos[1], pos[2], yaw, a], tg };
  },
  rr(m) { const g = intIn(m.g, 0, 0x7fffffff); return g === null ? null : { t: 'rr', g }; },
  ks(m) {
    if (typeof m.i !== 'string' || !ITEM_RE.test(m.i)) return null;
    const p = intIn(m.p ?? 0, ...LIM.kinoP);
    if (p === null) return null;
    const out = { t: 'ks', i: m.i, p };
    if (m.dur !== undefined) { const d = intIn(m.dur, 0, LIM.kinoP[1]); if (d !== null) out.dur = d; }
    return out;
  },
  kj(m) { const sid = sidOk(m.sid); return sid === null ? null : { t: 'kj', sid }; },
  kl(m) { const sid = sidOk(m.sid); return sid === null ? null : { t: 'kl', sid }; },
  kc(m) {
    const sid = sidOk(m.sid);
    const v = intIn(m.v, 0, 0x7fffffff);
    const o = intIn(m.o, 1, 3);
    const p = intIn(m.p ?? 0, ...LIM.kinoP);
    return sid === null || v === null || o === null || p === null ? null : { t: 'kc', sid, v, o, p };
  },
  kb(m) { const sid = sidOk(m.sid); const b = intIn(m.b, 0, 1); return sid === null || b === null ? null : { t: 'kb', sid, b }; },
  ki(m) { const c = intIn(m.c, 1, 65535); return c === null ? null : { t: 'ki', c }; },
  ck(m) { return num(m.a) ? { t: 'ck', a: m.a } : null; },
  rn(m) { return typeof m.tk === 'string' && TK_RE.test(m.tk) ? { t: 'rn', tk: m.tk } : null; },
};

/** Fertige Client-Nachricht prüfen/klemmen. Unbekannter Typ oder ungültig -> null. */
export function normalizeOut(msg) {
  if (!msg || typeof msg !== 'object' || typeof msg.t !== 'string') return null;
  const fn = NORM[msg.t];
  return fn ? fn(msg) : null;
}

export const build = {
  hi: (o) => NORM.hi(o || {}),
  p: (q, se) => NORM.p({ q, se }),
  hd: (i) => NORM.hd({ i }),
  f: (bits) => NORM.f({ f: bits }),
  e: (e) => NORM.e({ e }),
  m: (x) => NORM.m({ x }),
  pu: (c, d, s) => NORM.pu({ c, d, s }),
  pc: (i, g) => NORM.pc({ i, g }),
  ps: (l) => NORM.ps({ l }),
  pn: (i, it, q) => NORM.pn({ i, it, q }),
  px: (i) => NORM.px({ i }),
  rc: () => NORM.rc({}),
  rs: (g, q, tg) => NORM.rs({ g, q, tg }),
  rr: (g) => NORM.rr({ g }),
  ks: (i, p, dur) => NORM.ks({ i, p, dur }),
  kj: (sid) => NORM.kj({ sid }),
  kl: (sid) => NORM.kl({ sid }),
  kc: (sid, v, o, p) => NORM.kc({ sid, v, o, p }),
  kb: (sid, b) => NORM.kb({ sid, b }),
  ki: (c) => NORM.ki({ c }),
  ck: (a) => NORM.ck({ a }),
  rn: (tk) => NORM.rn({ tk }),
};
