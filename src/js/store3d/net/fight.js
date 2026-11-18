// VIDEOTHEK LENZ · Mehrspieler 1.18.0 (Fähigkeit `fight`): Waffenwahl, Treffer, Laser, Bandenführung. Teil „fight“ des Moduls net (Fabrik createFightNet, net/parts.js).
// Der Teil bietet den Provider-Anteil `ctx.use('net').fight` (Vertrag der Welle 6, A/B/C); alles in LOKALEN Einheiten (Meter, rad), die Umrechnung
// in den Netzrahmen (cm, Bereich r der Sender-Pose) macht dieser Teil. Ohne ausgehandelte Fähigkeit `fight` oder in VR sendet nichts (false).
//
//   fight.has() → bool                    Fähigkeit ausgehandelt und Verbindung live
//   fight.send(type, payload) → bool      Formen (lokal):
//       'wp' { w:0..3 }                       Waffenwahl; entprellt (300 ms nach der letzten Änderung), gleiche Wahl wird nicht doppelt gesendet
//       'fh' { c, w:0..3, dir:{x,z}, src?:0|1, from?:{x,z} }   Treffer auf Peer c; dir = Richtung (Einheitsvektor), from = Ort des Schlägers (Standard: eigene Pose);
//                                              src=1 nur als Bandenführer; höchstens 3/s (zu früh = false, nicht gepuffert)
//       'lz' { on:bool, point?:{x,y,z} }      Laser-Zeiger; nur bei Änderung (> 5 cm oder on/off), höchstens 4/s, der neueste Stand wird nachgereicht
//       'lb' { c }                            Blenden von Peer c; je Ziel 1 je 4 s
//       'gc' {}                               Bandenführung anfordern; höchstens 1/s
//       'gs' { g, phase, seed, members:[{st,x,y?,z,yaw,a?,tgt?,hp}] }   Bandenzustand (nur als Führer, g = Führungszähler aus `ga`); höchstens 6/s
//       'gr' {}                               Führung abgeben
//       'gh' { i:0..2, w:0..3 }               Treffer auf Bandenmitglied i (an den Führer); höchstens 4/s
//   fight.on(type, fn) → off              type 'wp' fn({c,w}) · 'fh' fn({c,w,dir:{x,z},src,from}) · 'lz' fn({c,on,point}) · 'lb' fn({c}) ·
//                                          'gs' fn({c,g,phase,tod,seed,members}) · 'gh' fn({c,i,w}) · 'ga' fn({c,g}) (c 0 = Führung frei) · 'pu' fn({c,d,s})
//                                          Das Willkommen speist wp/ga/gs der Anwesenden wie Ereignisse ein.
//   fight.leader() → c | null · fight.isLeader() → bool · fight.gen() → letzter Führungszähler · fight.peerPos(c) → {x,y,z} | null (Anzeigeort, auch ohne Figur)
// Nebenwirkung: wp und lz der Peers gehen an core.peers (setWeapon/setLaser; Handgegenstand, Laserpunkt).
//   createFightNet(core) → { welcome(wl), tick(dt), stop(), dispose(), fight }
import { build } from './proto.js';
import { encodeGs, decodeGs } from './gang.js';

export const WP_DEBOUNCE_MS = 300;
export const LZ_GAP_MS = 250;
export const GS_GAP = 170;
export const FH_GAP_MS = 340;
export const GH_GAP_MS = 260;
export const GC_GAP_MS = 1000;
export const LB_GAP_MS = 4000;
export const LZ_EPS_CM = 5;
const TYPES = ['wp', 'fh', 'lz', 'lb', 'gs', 'gh', 'ga', 'pu'];

const warn = (what, err) => { try { console.warn('[LenzFlix Store3D] mp fight', what, err && err.message ? err.message : ''); } catch { /* egal */ } };
const isInt = (v) => Number.isInteger(v);

export function createFightNet(core) {
  const ctx = core.ctx;
  const frame = core.frame;
  const clock = typeof core.now === 'function' ? core.now : () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const listeners = new Map(); // Typ → Set<fn>
  let disposed = false;
  let leaderC = 0;
  let gen = 0;
  let sentWp = -1;
  let pendingWp = null; // { w, at }
  let lastLz = null; // { on, q }
  let pendingLz = null; // { on, q }
  const last = { lz: -1e9, gs: -1e9, fh: -1e9, gh: -1e9, gc: -1e9 };
  const lastLb = new Map(); // c → ms

  const xrOn = () => !!(ctx.xr && ctx.xr.presenting && ctx.xr.presenting());
  const myC = () => { const m = core.me(); return m ? m.c : 0; };
  const poseOf = () => { try { return ctx.player.getPose(); } catch { return null; } };
  const has = () => !disposed && core.active() && core.cap('fight');

  function dispatch(type, msg) {
    const l = listeners.get(type);
    if (!l) return;
    for (const fn of [...l]) { try { fn(msg); } catch (err) { warn('Hörer ' + type, err); } }
  }

  // ---------------------------------------------------------------- Senden
  const out = (m) => (m ? core.send(m) : false);
  function flushLz(t) {
    if (!pendingLz || t - last.lz < LZ_GAP_MS) return;
    const p = pendingLz;
    pendingLz = null;
    if (out(build.lz(p.on, p.q))) { last.lz = t; lastLz = p; }
  }
  function sendLz(payload, t) {
    const pose = poseOf();
    const on = payload && payload.on ? 1 : 0;
    const r = pose ? frame.area(pose.x, pose.z, pose.y || 0) : 2;
    const pt = payload && payload.point && Number.isFinite(payload.point.x) ? payload.point : pose;
    if (!pt) return false;
    const q = frame.enc(pt.x, Number.isFinite(pt.y) ? pt.y : 0, pt.z, r);
    if (lastLz && lastLz.on === on && (!on || Math.hypot(q[0] - lastLz.q[0], q[1] - lastLz.q[1], q[2] - lastLz.q[2]) <= LZ_EPS_CM)) { pendingLz = null; return true; }
    pendingLz = { on, q };
    flushLz(t);
    return true;
  }

  function send(type, payload) {
    if (!has() || typeof type !== 'string') return false;
    const t = clock();
    const p = payload && typeof payload === 'object' ? payload : {};
    if (xrOn() && type !== 'gr') return false;
    switch (type) {
      case 'wp': {
        const w = Number.isInteger(p.w) ? p.w : -1;
        if (w < 0 || w > 3) return false;
        if (w === sentWp && !pendingWp) return true;
        pendingWp = { w, at: t };
        return true;
      }
      case 'fh': {
        if (!isInt(p.c) || !isInt(p.w)) return false;
        if (t - last.fh < FH_GAP_MS) return false;
        const pose = poseOf();
        const from = p.from && Number.isFinite(p.from.x) ? p.from : pose;
        if (!from) return false;
        let d = null;
        if (p.dir && pose) d = frame.encDir(from.x, from.z, p.dir.x, p.dir.z, frame.area(pose.x, pose.z, pose.y || 0));
        if (!d || (!d[0] && !d[1])) return false;
        if (!out(build.fh(p.c, p.w, d, p.src === 1 || p.src === true))) return false;
        last.fh = t;
        return true;
      }
      case 'lz': return sendLz(p, t);
      case 'lb': {
        if (!isInt(p.c)) return false;
        if (t - (lastLb.get(p.c) ?? -1e9) < LB_GAP_MS) return false;
        if (!out(build.lb(p.c))) return false;
        lastLb.set(p.c, t);
        return true;
      }
      case 'gc': {
        if (t - last.gc < GC_GAP_MS) return false;
        if (!out(build.gc())) return false;
        last.gc = t;
        return true;
      }
      case 'gs': {
        if (!isInt(p.g) || t - last.gs < GS_GAP) return false;
        const q = encodeGs(frame, p);
        if (!q || !out(build.gs(p.g, q))) return false;
        last.gs = t;
        return true;
      }
      case 'gr': return out(build.gr());
      case 'gh': {
        if (!isInt(p.i) || !isInt(p.w)) return false;
        if (t - last.gh < GH_GAP_MS) return false;
        if (!out(build.gh(p.i, p.w))) return false;
        last.gh = t;
        return true;
      }
      default: return false;
    }
  }

  // ---------------------------------------------------------------- Empfangen
  const peerR = (c) => { const i = core.peers && core.peers.get ? core.peers.get(c) : null; return i && Number.isInteger(i.r) ? i.r : 2; };
  const peerPos = (c) => { try { const v = core.peers && typeof core.peers.pos === 'function' ? core.peers.pos(c) : null; return v ? { x: v.x, y: v.y, z: v.z } : null; } catch { return null; } };

  function onWp(e) {
    if (!e || !isInt(e.c) || !isInt(e.w)) return;
    if (core.peers && typeof core.peers.setWeapon === 'function') { try { core.peers.setWeapon(e.c, e.w); } catch (err) { warn('setWeapon', err); } }
    dispatch('wp', { c: e.c, w: e.w });
  }
  function onLz(e) {
    if (!e || !isInt(e.c) || !Array.isArray(e.q) || e.q.length < 3) return;
    const [x, y, z] = frame.dec(e.q[0], e.q[1], e.q[2], peerR(e.c));
    const on = !!e.on;
    const point = { x, y, z };
    if (core.peers && typeof core.peers.setLaser === 'function') { try { core.peers.setLaser(e.c, on, point); } catch (err) { warn('setLaser', err); } }
    dispatch('lz', { c: e.c, on, point });
  }
  function onFh(e) {
    if (!e || !isInt(e.c) || !isInt(e.w) || !Array.isArray(e.d) || e.d.length < 2) return;
    const pose = poseOf();
    let dir = { x: Number(e.d[0]) / 100, z: Number(e.d[1]) / 100 };
    if (pose) {
      const r = frame.area(pose.x, pose.z, pose.y || 0);
      const p = frame.enc(pose.x, pose.y || 0, pose.z, r);
      const d = frame.decDir(p[0], p[2], Number(e.d[0]), Number(e.d[1]), r);
      dir = { x: d[0], z: d[1] };
    }
    dispatch('fh', { c: e.c, w: e.w, dir, src: e.src === 1 ? 1 : 0, from: peerPos(e.c) });
  }
  function onGa(e) {
    if (!e || !Number.isInteger(e.c)) return;
    leaderC = e.c > 0 ? e.c : 0;
    if (e.c > 0 && e.c === myC() && Number.isFinite(e.g)) gen = e.g | 0;
    dispatch('ga', { c: e.c, g: Number.isFinite(e.g) ? e.g | 0 : 0 });
  }
  function onGs(e) {
    if (!e || !Array.isArray(e.q)) return;
    const d = decodeGs(frame, e.q);
    if (!d) return;
    if (isInt(e.c) && e.c > 0) leaderC = e.c;
    dispatch('gs', { c: e.c | 0, g: Number.isFinite(e.g) ? e.g | 0 : 0, ...d });
  }
  const handlers = {
    wp: onWp, lz: onLz, fh: onFh, ga: onGa, gs: onGs,
    lb: (e) => { if (e && isInt(e.c)) dispatch('lb', { c: e.c }); },
    gh: (e) => { if (e && isInt(e.c) && isInt(e.i) && isInt(e.w)) dispatch('gh', { c: e.c, i: e.i, w: e.w }); },
    pu: (e) => { if (e && isInt(e.c)) dispatch('pu', { c: e.c, d: e.d, s: e.s }); },
  };
  const offs = TYPES.map((t) => core.on(t, (e) => { if (!disposed && core.active()) { try { handlers[t](e); } catch (err) { warn(t, err); } } }));

  function reset() {
    leaderC = 0;
    gen = 0;
    sentWp = -1;
    pendingWp = null;
    lastLz = null;
    pendingLz = null;
    lastLb.clear();
    for (const k of Object.keys(last)) last[k] = -1e9;
  }

  const fight = {
    has,
    send,
    on(type, fn) {
      if (!TYPES.includes(type) || typeof fn !== 'function') return () => {};
      const l = listeners.get(type) || new Set();
      l.add(fn);
      listeners.set(type, l);
      return () => l.delete(fn);
    },
    leader: () => (leaderC > 0 ? leaderC : null),
    isLeader: () => leaderC > 0 && leaderC === myC(),
    gen: () => gen,
    peerPos,
  };

  return {
    fight,
    /** Willkommen: wl.wp { c: w }, wl.gl (Führer oder null), wl.gs { g, q }. */
    welcome(wl) {
      reset();
      if (!wl || !core.cap('fight')) return;
      if (wl.wp && typeof wl.wp === 'object') for (const k of Object.keys(wl.wp)) onWp({ c: Number(k), w: wl.wp[k] });
      if (Number.isInteger(wl.gl) && wl.gl > 0) {
        leaderC = wl.gl;
        onGa({ c: wl.gl, g: wl.gs && Number.isFinite(wl.gs.g) ? wl.gs.g : 0 });
        if (wl.gs && Array.isArray(wl.gs.q)) onGs({ c: wl.gl, g: wl.gs.g, q: wl.gs.q });
      }
    },
    tick() {
      if (disposed || !has()) return;
      const t = clock();
      if (pendingWp && t - pendingWp.at >= WP_DEBOUNCE_MS) {
        const w = pendingWp.w;
        pendingWp = null;
        if (w !== sentWp && out(build.wp(w))) sentWp = w;
      }
      flushLz(t);
    },
    /** Verbindung weg: Führer und Zustände vergessen (Peers räumt peers.clear()). */
    stop() { reset(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const o of offs) { try { o(); } catch { /* egal */ } }
      listeners.clear();
      reset();
    },
  };
}
