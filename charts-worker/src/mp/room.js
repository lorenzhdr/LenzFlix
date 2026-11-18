// Mehrspieler lfx-mp.1: reiner Reducer des Raums (docs/mp-api.md §4, §5, §7, §9, §12).
// Browserfähiges ESM: keine Cloudflare-/Node-APIs, keine Timer. Uhr (`now`, ms) und Zufall
// (`rand`, () => [0,1)) werden eingespeist. Der Zustand ist ein einfaches, klonbares Objekt;
// `step` verändert ihn in place und gibt ihn mit den Effekten zurück.
//
// Nutzung (DO-Hülle bzw. Fake-Welt):
//   const st = createState({ cfg, store, atts, now });          // Kaltstart
//   const res = step(st, { type:'open', claims }, now, rand);   // -> { state, out, close, store, alarmAt, c }
// Effekte, in dieser Reihenfolge anzuwenden: out[] (inkl. bye vor dem Close), close[], store[], alarm.
import { PV, MIN_PV, CAPS, FLAG, T_CAP, CORE_T, V, parseFrame, cleanText, isKey } from './protocol.js';
import { LIMITS, take, frameGate } from './limits.js';
import chat from './chat.js';
import phys from './phys.js';
import rich from './rich.js';
import kino from './kino.js';
import look from './look.js';
import fight from './fight.js';

export const SUBS = [chat, phys, rich, kino, look, fight];
const capsOf = (s) => (s.cap == null ? [] : Array.isArray(s.cap) ? s.cap : [s.cap]);
export const SERVER_CAPS = ['pres', 'wx', ...SUBS.flatMap(capsOf)].filter((c, i, a) => CAPS.includes(c) && a.indexOf(c) === i);
// Storage-Präfixe, die der Kaltstart lädt (Kern + Unter-Reducer).
export const STORE_PREFIXES = [...new Set(['sv', 'seed', 'quota', 'b:', 'j:', ...SUBS.flatMap((s) => s.storeKeys || [])])];

export const HI_TIMEOUT_MS = 10000;
export const DEAD_MS = 90000;
export const RENEW_MS = 15 * 60000;
export const ALARM_MS = 60000;
export const FLUSH_GAP_MS = 100;
export const MAX_PER_K = 4;
export const QUOTA_PERSIST_FRAMES = 500;
export const CF_LEVELS = [{ pr: 8, ph: 8 }, { pr: 4, ph: 5 }, { pr: 2, ph: 2 }];
const FRAME_COST = 1 / 20;
// Nachrichtentypen, nach denen sofort geflusht wird (Vertrag §7.3).
const IMMEDIATE = new Set(['e', 'm', 'pu', 'pc', 'pn', 'px', 'rc', 'rr', 'kc', 'kb', 'ks', 'kj', 'kl', 'ki', 'f', 'hd']);
const KNOWN = new Set([...CORE_T, ...Object.keys(T_CAP)]);

const dayOf = (now) => new Date(now).toISOString().slice(0, 10);

// ---------------------------------------------------------------- Zustand

export function attOf(p) {
  return {
    c: p.c, k: p.k, n: p.n, a: p.a, f: p.f, cap: p.cap, jti: p.jti, x: p.x, t0: p.t0, live: p.live,
    q: p.q, se: p.se, h: p.h, ra: p.ra || null, pv: p.pv || 0,
  };
}

function peerFromAtt(att, now) {
  return {
    c: att.c, k: att.k, n: att.n || '', a: att.a ? 1 : 0, f: att.f | 0, cap: Array.isArray(att.cap) ? att.cap : [],
    jti: att.jti || '', x: att.x || now + RENEW_MS, t0: att.t0 || now, live: !!att.live,
    q: att.q || null, se: att.se || null, h: att.h || null, ra: att.ra || null, pv: att.pv || 0,
    qAt: now, lastMsg: now, rl: {}, unk: { n: 0, at: now },
  };
}

export function createState({ cfg = {}, store = {}, atts = [], now = 0 } = {}) {
  const st = {
    cfg: {
      maxConn: cfg.maxConn > 0 ? Math.floor(cfg.maxConn) : 16,
      dailyReq: cfg.dailyReq > 0 ? Number(cfg.dailyReq) : 80000,
    },
    store: { ...store },
    peers: {},
    nextC: 1,
    seed: Number.isFinite(store.seed) ? store.seed : null,
    qd: '', qn: 0, qSince: 0, lvl: 0,
    lastFlush: 0, dirty: {}, evq: [], xq: {}, flushNow: false, att: {},
  };
  const q = store.quota;
  if (q && typeof q.d === 'string' && Number.isFinite(q.n)) { st.qd = q.d; st.qn = q.n; }
  let max = 0;
  for (const a of atts) {
    if (!a || !Number.isInteger(a.c) || !isKey(a.k)) continue;
    st.peers[a.c] = peerFromAtt(a, now);
    if (a.c > max) max = a.c;
  }
  st.nextC = max >= 65535 ? 1 : max + 1;
  st.lvl = levelOf(st);
  return st;
}

function levelOf(st) {
  const r = st.qn / st.cfg.dailyReq;
  return r >= 0.95 ? 2 : r >= 0.6 ? 1 : 0;
}

function allocC(st) {
  for (let i = 0; i < 65535; i++) {
    const c = st.nextC;
    st.nextC = c >= 65535 ? 1 : c + 1;
    if (!st.peers[c]) return c;
  }
  return 0;
}

const liveList = (st) => Object.values(st.peers).filter((p) => p.live);

// Öffentliche Sicht auf einen Peer (Privatsphäre erzwungen: Name nur mit Bit 1, Film nur mit Bit 2).
function pubPeer(p) {
  const o = { c: p.c, k: p.k, n: p.f & FLAG.NAME ? p.n : '', f: p.f, j: p.t0 };
  if (p.a) o.ad = 1;
  if (p.q) o.q = p.q;
  if (p.se) o.se = p.se;
  if (p.h && p.f & FLAG.FILM) o.h = p.h;
  return o;
}

// ---------------------------------------------------------------- Kontext für Handler/Unter-Reducer

function makeCtx(st, now, rand, res) {
  const cx = {
    st, now, rand, res,
    emit(ev) { st.evq.push(ev); },
    sendTo(c, xev) { (st.xq[c] || (st.xq[c] = [])).push(xev); st.flushNow = true; },
    flushNow() { st.flushNow = true; },
    markAtt(c) { st.att[c] = true; },
    put(key, val) { st.store[key] = val; res.store.push({ op: 'put', key, val }); },
    del(key) { delete st.store[key]; res.store.push({ op: 'del', key }); },
    peer(c) { return st.peers[c] || null; },
    peers() { return liveList(st); },
    level() { return st.lvl; },
    cf() { return { ...CF_LEVELS[st.lvl] }; },
    // bye = {c, u?} (vor dem Close gesendet), lreason = Grund im ev `l` (z. B. 'kick')
    close(c, code, bye, lreason) { closePeer(cx, c, code, bye, lreason); },
  };
  return cx;
}

function send(cx, to, obj) {
  cx.res.out.push({ kind: 'send', to, data: JSON.stringify(obj) });
}

function er(cx, c, code, y) {
  const e = { t: 'er', c: code };
  if (y) e.y = y; // Abweichung vom Vertrag: `t?` kollidiert mit dem Typfeld
  cx.sendTo(c, e);
}

function closePeer(cx, c, code, bye, lreason, silent) {
  const { st, res } = cx;
  if (bye) send(cx, [c], { t: 'bye', ...bye });
  if (!silent && !res.close.some((x) => x.c === c)) res.close.push({ c, code });
  const p = st.peers[c];
  if (!p) return;
  delete st.peers[c];
  delete st.dirty[c];
  delete st.xq[c];
  delete st.att[c];
  st.flushNow = true;
  if (p.live) {
    st.evq.push(lreason ? { t: 'l', c, r: lreason } : { t: 'l', c });
    for (const s of SUBS) { try { s.onClose(st, p, cx, code); } catch { /* Unter-Reducer darf den Raum nicht kippen */ } }
  }
}

// ---------------------------------------------------------------- Ausgang

function flush(cx) {
  const { st, now } = cx;
  const live = liveList(st);
  const to = live.map((p) => p.c);
  const pe = [];
  for (const c of Object.keys(st.dirty)) {
    const p = st.peers[c];
    if (!p || !p.live || !p.q) continue;
    const e = [p.c, ...p.q, Math.max(0, now - p.qAt)];
    if (p.se) e.push(p.se);
    pe.push(e);
  }
  const b = { t: 'b', s: now };
  if (pe.length) b.p = pe;
  if (st.evq.length) b.ev = st.evq;
  if (to.length && (pe.length || st.evq.length)) send(cx, to, b);
  for (const c of Object.keys(st.xq)) {
    const p = st.peers[c];
    if (p && p.live && st.xq[c].length) send(cx, [p.c], { t: 'x', ev: st.xq[c] });
  }
  st.dirty = {};
  st.evq = [];
  st.xq = {};
  st.lastFlush = now;
  st.flushNow = false;
}

function emitPf(cx, p) {
  if (!p.live) return;
  cx.emit({ t: 'pf', c: p.c, f: p.f, n: p.f & FLAG.NAME ? p.n : '', h: p.f & FLAG.FILM ? p.h : null });
  cx.flushNow();
}

// ---------------------------------------------------------------- Kontingent / Sparwächter

function persistQuota(cx) {
  const { st } = cx;
  cx.put('quota', { d: st.qd, n: Math.round(st.qn * 100) / 100 });
  st.qSince = 0;
}

function evalQuota(cx) {
  const { st, now } = cx;
  const d = dayOf(now);
  let changed = false;
  if (st.qd !== d) { st.qd = d; st.qn = 0; changed = true; }
  const lvl = levelOf(st);
  if (lvl !== st.lvl) {
    st.lvl = lvl;
    cx.emit({ t: 'cf', ...CF_LEVELS[lvl] });
    cx.flushNow();
    changed = true;
  }
  if (changed || st.qSince >= QUOTA_PERSIST_FRAMES) persistQuota(cx);
}

// ---------------------------------------------------------------- Fristen

function sweep(cx) {
  const { st, now } = cx;
  for (const p of Object.values(st.peers)) {
    if (!p.live && now - p.t0 > HI_TIMEOUT_MS) closePeer(cx, p.c, 4408, { c: 'hello' });
    else if (p.x <= now) closePeer(cx, p.c, 4401, { c: 'auth' });
  }
}

function cleanup(cx) {
  const { st, now } = cx;
  for (const key of Object.keys(st.store)) {
    if ((key.startsWith('j:') || key.startsWith('b:')) && !(st.store[key] > now)) cx.del(key);
  }
}

// ---------------------------------------------------------------- Kern-Handler

function negotiate(cap) {
  const out = ['pres'];
  for (const c of cap) if (SERVER_CAPS.includes(c) && !out.includes(c)) out.push(c);
  return out;
}

const CORE = Object.create(null);

CORE.hi = (st, p, raw, cx) => {
  const m = V.hi(raw);
  if (!m) { cx.close(p.c, 4000, { c: 'bad' }); return; }
  if (m.pv < MIN_PV) { cx.close(p.c, 4001, { c: 'pv' }); return; }
  p.cap = negotiate(m.cap);
  p.f = m.f;
  p.pv = Math.min(m.pv, PV);
  // `j` an die Bisherigen, bevor der Neue als live gilt (er bekommt es nicht doppelt).
  cx.emit({ t: 'j', ...pubPeer(p) });
  flush(cx);
  const wl = {
    t: 'wl', pv: PV, c: p.c, k: p.k, s: cx.now, ad: p.a ? 1 : 0, cap: p.cap, cf: cx.cf(),
    peers: liveList(st).map(pubPeer),
  };
  if (p.cap.includes('wx') && st.seed !== null) wl.wx = { sd: st.seed, l: 1800 }; // Wetter-Seed (cap wx, §8.3)
  for (const s of SUBS) {
    let w = null;
    try { w = s.welcome(st, p, cx); } catch { /* ignorieren */ }
    if (w && typeof w === 'object') Object.assign(wl, w);
  }
  p.live = true;
  cx.markAtt(p.c);
  send(cx, [p.c], wl);
  for (const s of SUBS) { try { s.onOpen(st, p, cx); } catch { /* ignorieren */ } }
};

CORE.p = (st, p, raw, cx) => {
  const m = V.p(raw);
  if (!m) return;
  p.q = m.q;
  p.se = m.se || null;
  p.qAt = cx.now;
  st.dirty[p.c] = true;
  cx.markAtt(p.c);
  if (m.q[5] === 0 || m.q[5] === 7) st.flushNow = true; // Abschluss-Pose
};

CORE.hd = (st, p, raw, cx) => {
  const m = V.hd(raw);
  if (!m || m.i === p.h) return;
  p.h = m.i;
  cx.markAtt(p.c);
  emitPf(cx, p);
};

CORE.f = (st, p, raw, cx) => {
  const m = V.f(raw);
  if (!m || m.f === p.f) return;
  const old = p.f;
  p.f = m.f;
  cx.markAtt(p.c);
  emitPf(cx, p);
  for (const s of SUBS) { try { s.onFlags(st, p, old, m.f, cx); } catch { /* ignorieren */ } }
};

CORE.ck = (st, p, raw, cx) => {
  const m = V.ck(raw);
  if (m) send(cx, [p.c], { t: 'ck', a: m.a, s: cx.now });
};

CORE.rn = (st, p, raw, cx) => {
  const m = V.rn(raw);
  if (m) cx.res.out.push({ kind: 'renew', c: p.c, tk: m.tk });
};

// Dispatch: Kern + Unter-Reducer (Vertrag §12).
const HANDLERS = Object.assign(Object.create(null), CORE, ...SUBS.map((s) => s.handlers || {}));

// ---------------------------------------------------------------- Ereignisse

function onOpen(cx, claims) {
  const { st, now } = cx;
  const c = allocC(st);
  cx.res.c = c;
  st.qn += 1;
  cleanup(cx);
  if (!precheck(st, claims, now).ok) { // sollte die Hülle schon vor dem accept abgefangen haben
    closePeer(cx, c, 4401, { c: 'auth' });
    return;
  }
  cx.put('j:' + claims.j, claims.e);
  const ban = st.store['b:' + claims.k];
  let code = 0;
  let bye = null;
  if (ban > now) { code = 4403; bye = { c: 'ban', u: ban }; }
  else if (Object.keys(st.peers).length >= st.cfg.maxConn) { code = 4503; bye = { c: 'full' }; }
  else if (Object.values(st.peers).filter((p) => p.k === claims.k).length >= MAX_PER_K) { code = 4409; bye = { c: 'dup' }; }
  else if (st.lvl >= 2) { code = 4503; bye = { c: 'quota' }; }
  if (code) { closePeer(cx, c, code, bye); return; }
  st.peers[c] = {
    c, k: claims.k, n: cleanText(claims.n, 24) || 'Gast', a: claims.a ? 1 : 0, f: 0, cap: [], jti: claims.j,
    x: now + RENEW_MS, t0: now, live: false, q: null, se: null, h: null, ra: null, pv: 0,
    qAt: now, lastMsg: now, rl: {}, unk: { n: 0, at: now },
  };
  cx.markAtt(c);
}

function onMessage(cx, c, data) {
  const { st, now } = cx;
  const p = st.peers[c];
  if (!p) return;
  p.lastMsg = now;
  if (data === 'ping') { cx.res.out.push({ kind: 'send', to: [c], data: 'pong' }); return; }
  st.qn += FRAME_COST;
  st.qSince += 1;
  sweep(cx);
  if (st.peers[c] !== p) return;
  const gate = frameGate(p.rl, now);
  if (gate === 'close') { closePeer(cx, c, 4429, { c: 'rate' }); return; }
  if (gate === 'drop') return;
  const fr = parseFrame(data);
  if (!fr.ok) { closePeer(cx, c, fr.code, { c: 'bad' }); return; }
  for (const raw of fr.msgs) {
    if (st.peers[c] !== p) return;
    const t = raw && typeof raw === 'object' && !Array.isArray(raw) && typeof raw.t === 'string' ? raw.t : null;
    if (t === null || !KNOWN.has(t)) {
      const u = p.unk;
      if (now - u.at >= 60000) { u.at = now; u.n = 0; }
      if (++u.n > 30) { closePeer(cx, c, 4000, { c: 'bad' }); return; }
      continue;
    }
    if (t === 'hi' ? p.live : !p.live) continue; // doppeltes hi bzw. Nachricht vor hi
    const spec = LIMITS[t];
    if (spec && !take(p.rl, t, now)) { if (spec.fail) er(cx, c, spec.fail, t); continue; }
    const h = HANDLERS[t];
    const need = T_CAP[t];
    if (need && (!h || !p.cap.includes(need))) { er(cx, c, 'cap', t); continue; }
    if (!h) continue;
    try { h(st, p, raw, cx); } catch { /* ungültige Nachricht verwerfen */ }
    if (IMMEDIATE.has(t)) st.flushNow = true;
  }
}

function onRenew(cx, c, claims) {
  const { st, now } = cx;
  const p = st.peers[c];
  if (!p) return;
  if (!claims || claims.k !== p.k || !precheck(st, claims, now).ok) { closePeer(cx, c, 4401, { c: 'auth' }); return; }
  cx.put('j:' + claims.j, claims.e);
  p.x = now + RENEW_MS;
  p.jti = claims.j;
  p.a = claims.a ? 1 : 0;
  const n = cleanText(claims.n, 24) || 'Gast';
  if (n !== p.n) { p.n = n; emitPf(cx, p); }
  cx.markAtt(c);
}

function onAlarm(cx, auto) {
  const { st, now } = cx;
  st.qn += 1;
  sweep(cx);
  for (const p of Object.values(st.peers)) {
    const seen = Math.max(p.lastMsg, auto && Number.isFinite(auto[p.c]) ? auto[p.c] : 0);
    if (now - seen > DEAD_MS) closePeer(cx, p.c, 1011);
  }
  cleanup(cx);
  for (const s of SUBS) { try { s.onAlarm(st, now, cx); } catch { /* ignorieren */ } }
}

// Hülle vor dem accept: Ticket-Claims prüfen (jti einmalig, nicht abgelaufen). -> {ok} | {ok:false,status:401}
export function precheck(st, claims, now) {
  const ok = claims && isKey(claims.k) && typeof claims.j === 'string' && claims.j.length > 0 && claims.j.length <= 64
    && typeof claims.e === 'number' && claims.e > now && st.store['j:' + claims.j] === undefined;
  return ok ? { ok: true } : { ok: false, status: 401 };
}

// Ereignisse: open{claims} | message{c,data} | close{c} / error{c} | alarm{auto?:{c:ts}} | renew-ok{c,claims} | renew-fail{c}
export function step(st, event, now, rand = Math.random) {
  const res = { state: st, out: [], close: [], store: [], alarmAt: null, c: 0 };
  const cx = makeCtx(st, now, rand, res);
  if (!(st.store.sv >= 1)) cx.put('sv', 1);
  if (st.seed === null) { st.seed = Math.floor(rand() * 4294967296) >>> 0; cx.put('seed', st.seed); }
  evalQuota(cx);
  switch (event && event.type) {
    case 'open': onOpen(cx, event.claims); break;
    case 'message': onMessage(cx, event.c, event.data); break;
    case 'close': case 'error': closePeer(cx, event.c, 1000, null, null, true); break;
    case 'alarm': onAlarm(cx, event.auto); break;
    case 'renew-ok': onRenew(cx, event.c, event.claims); break;
    case 'renew-fail': closePeer(cx, event.c, 4401, { c: 'auth' }); break;
    default: break;
  }
  evalQuota(cx);
  if (st.flushNow || ((st.evq.length || Object.keys(st.dirty).length || Object.keys(st.xq).length) && now - st.lastFlush >= FLUSH_GAP_MS)) flush(cx);
  for (const c of Object.keys(st.att)) {
    const p = st.peers[c];
    if (p) res.out.push({ kind: 'att', c: p.c, att: attOf(p) });
  }
  st.att = {};
  if (Object.keys(st.peers).length) {
    let at = now + ALARM_MS;
    for (const s of SUBS) {
      let d = null;
      try { d = s.nextDeadline(st, now); } catch { /* ignorieren */ }
      if (Number.isFinite(d) && d < at) at = Math.max(now, d);
    }
    res.alarmAt = at;
  }
  return res;
}
