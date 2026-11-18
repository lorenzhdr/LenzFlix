// VIDEOTHEK LENZ · Mehrspieler (lfx-mp.1, Welle a): Fremdfiguren. Je Verbindung `c` ein Peer mit Remote-Körper (controls/body.js, netDelay 250 ms),
// Pose-Zeitleiste (Animationscodes), Figur über den npc-Provider (npc/figure.js, Aussehen deterministisch aus k), Namensschild (net/tags.js),
// Hülle in der Hand (net/heldcover.js, Rechte-Filter) und im Palast-Saal sitzend (palast/seatnet.js). Reine Teile: net/peers-logic.js.
//   createPeers(core) → { welcome(wl), ev(e), tick(dt), list(), name(c), get(c), count(), onFigure(fn) → off, setActive(on), onQuality(),
//                         clear(), dispose(), stats() }
// 1.17.0 (Fähigkeit look): wl.lk {c: l} / wl.mc {c: m} und Ereignisse lk {c,l} / mc {c,m} je Peer; Figur mit eigenem Look (look2), sonst Seed-Look; Interaktion
//   „Ausweis ansehen“ (noClick, Box läuft mit) für Peers mit mc; list() trägt card, dazu card(c) und showCard(c). core.cap?(name) → bool (Wartezeit nur mit look).
//   core = { ctx, frame, serverNow() → ms|null, me() → { c, k }|null, cap?(name) }   frame = net/frame.js createFrame(layout): dec(cx, cy, cz, r) → [x, y, z] Meter
//   ev(e) versteht { t:'b', s, p:[[c,x,y,z,yaw,pitch,a,r,d,se?]], ev:[…] } sowie einzeln j (Peer), l {c}, pf {c,f,n,h}, e {c,e} (Emote, Welle b); fremde Typen werden ignoriert.
// Emote (net/emotes.js): läuft bis zur Dauer oder bis eine Pose nach dem Empfang mit a ∈ {1,2,3,4,6,8} eintrifft; überstimmt nur die Gehanimation, nie den Kinosessel.
// Keine Timer: Takt kommt von tick(dt). Der Provider-Zugriff (npc, areas, city, palast, cinema2d) ist überall mit Guard.
import { Body } from '../controls/body.js';
import { makeLook } from '../npc/looks.js';
import { seeded } from '../modules/m4-util.js';
import { createSeatNet } from '../palast/seatnet.js';
import { createTags } from './tags.js';
import { createHeldCover } from './heldcover.js';
import * as L from './peers-logic.js';
import { startRemote, stepRemote, endedByPose } from './emotes.js';
import { F } from './proto.js';
import { decode as decodeLook, toRender as lookToRender, defaultCode } from '../char/look2.js';
import { fromWire } from '../char/card.js';

/** Höchstens so lange (s) wartet eine neue Fremdfigur auf ihren lk, bevor die Seed-Figur gebaut wird (kein Flackern Seed → eigene Figur). */
export const LOOK_WAIT_S = 0.6;
const IA_HALF = 0.45; // halbe Breite der Ausweis-Box (m)

const warn = (what, err) => { try { console.warn('[LenzFlix Store3D] mp peers', what, err && err.message ? err.message : ''); } catch { /* egal */ } };

export function createPeers(core) {
  const ctx = core.ctx;
  const peers = new Map(); // c → Peer
  const figListeners = new Set();
  const tags = createTags(ctx);
  const held = createHeldCover(ctx);
  let seatnet = null;
  let myC = 0;
  let active = true;
  let acc = L.EVAL_S; // sofort bewerten
  let dirty = true;
  let disposed = false;
  let lastReserve = -1;
  let batchS = null; // Server-ms des gerade verarbeiteten Frames b (Zeitbezug der Emotes darin)

  const xrOn = () => !!(ctx.xr && ctx.xr.presenting());
  const myInfo = () => { try { return (core.me && core.me()) || null; } catch { return null; } };
  const isMe = (c) => c === myC || (myInfo() && myInfo().c === c);
  const npc = () => ctx.use('npc');
  const nowMs = () => { try { const v = core.serverNow && core.serverNow(); return Number.isFinite(v) ? v : null; } catch { return null; } };

  function seats() {
    if (seatnet) return seatnet;
    const pal = ctx.use('palast');
    const list = pal && pal.plan && pal.plan.seats;
    if (list && list.length) seatnet = createSeatNet(list);
    return seatnet;
  }

  // ------------------------------------------------------------------ Peers
  const pub = (p) => ({ c: p.c, k: p.k, n: p.n, r: p.r, f: p.f });
  function emitFig(kind, p, fig) { for (const fn of [...figListeners]) { try { fn(kind, pub(p), fig); } catch (err) { warn('onFigure', err); } } }

  function makePeer(d) {
    return {
      c: d.c, k: String(d.k || ''), n: typeof d.n === 'string' ? d.n : '', f: d.f | 0, j: d.j, ad: !!d.ad, h: d.h || null,
      r: 0, a: 0, se: null, body: new Body({ src: [], netDelay: L.PEER_DELAY_MS }), last: null, tl: [],
      fig: null, emote: null, lk: null, lkSig: '', mc: null, wait: 0, ia: null, speed: 0, lastA: -1, pos: null, prev: null, seatKey: '', vis: false, dist: 1e9,
    };
  }

  function feedPose(p, e, t) {
    const pose = L.decodePose(core.frame, e);
    if (!pose) return;
    if (!L.pushTimeline(p.tl, t, pose)) return; // veraltet/doppelt
    const st = L.bodyState(pose, p.last, t);
    if (p.last && L.needRefeed(p.last.t, t)) p.body.applyRemote(p.last.st, t - L.REFEED_MS);
    p.body.applyRemote(st, t);
    p.last = { t, s: pose, st };
    p.r = pose.r;
    dirty = true;
  }

  function addPeer(d, t) {
    if (!d || !Number.isInteger(d.c) || isMe(d.c)) return null;
    let p = peers.get(d.c);
    if (p) {
      p.k = String(d.k || p.k); if (typeof d.n === 'string') p.n = d.n; if (Number.isInteger(d.f)) p.f = d.f;
      p.h = d.h || null;
    } else {
      p = makePeer(d);
      p.wait = core.cap && core.cap('look') ? LOOK_WAIT_S : 0;
      peers.set(d.c, p);
    }
    if (Array.isArray(d.q) && Number.isFinite(t)) {
      const q = d.q;
      feedPose(p, { x: q[0], y: q[1], z: q[2], yaw: q[3], pitch: q[4], a: q[5], r: q[6], se: d.se }, t);
    }
    dirty = true;
    return p;
  }

  function removePeer(c) {
    const p = peers.get(c);
    if (!p) return;
    destroyFig(p);
    if (seatnet) seatnet.stand(c);
    peers.delete(c);
    dirty = true;
  }

  // ------------------------------------------------------------------ Look und Ausweis (Fähigkeit look)
  function setLk(p, l) {
    if (!Array.isArray(l) || l.length < 4) return;
    const code = decodeLook(l); // tolerant: Unbekanntes wird je Feld zum Standard
    const sig = code.join(',');
    p.wait = 0;
    if (sig === p.lkSig) return;
    p.lkSig = sig;
    p.lk = code;
    dirty = true;
    if (p.fig && !p.fig.disposed && typeof p.fig.setLook === 'function') { try { p.fig.setLook(lookToRender(code)); } catch (err) { warn('setLook', err); } }
  }
  function setMc(p, m) {
    p.mc = Array.isArray(m) && fromWire(m) ? m.slice() : null;
    dirty = true;
  }
  /** CardData eines Peers (Leitung + Look-Code + Name, nur wenn dessen Name-Flag gilt) oder null ohne Ausweis. */
  function cardOf(p) {
    const c = p && p.mc ? fromWire(p.mc) : null;
    if (!c) return null;
    c.name = (p.f & F.NAME) && p.n ? p.n : null;
    c.code = p.lk ? p.lk.slice() : defaultCode();
    return c;
  }
  function showCard(c) {
    const p = peers.get(c);
    const d = cardOf(p);
    const m = ctx.use('member');
    if (!d || !m || typeof m.showCard !== 'function') return false;
    try { Promise.resolve(m.showCard(d, { mode: 'peer' })).catch((err) => warn('showCard', err)); } catch (err) { warn('showCard', err); return false; }
    return true;
  }
  const iaLabel = (p) => { const n = L.displayName(p.n, p.f); return n === 'Jemand' ? 'Mitgliedsausweis' : 'Ausweis von ' + n; };
  function dropIa(p) {
    if (!p.ia) return;
    const ia = p.ia;
    p.ia = null;
    try { ia.rm(); } catch { /* egal */ }
  }
  /** Box der Ausweis-Interaktion an die Figur setzen (die Box-Objekte werden mutiert; runtime.addInteractable hält die Referenzen). */
  function moveIa(p) {
    const ia = p.ia;
    if (!ia || !p.pos) return;
    const top = p.fig && Number.isFinite(p.fig.topY) && p.fig.topY > 0 ? p.fig.topY : 1.9;
    ia.min.x = p.pos.x - IA_HALF; ia.max.x = p.pos.x + IA_HALF;
    ia.min.z = p.pos.z - IA_HALF; ia.max.z = p.pos.z + IA_HALF;
    ia.min.y = p.pos.y; ia.max.y = p.pos.y + top + 0.1;
  }
  /** Interaktion „Ausweis ansehen“ anlegen/ändern/entfernen (nur Peers mit Figur und gültigem Ausweis). */
  function syncIa(p) {
    const want = !disposed && active && !!p.fig && !!p.mc && !!cardOf(p) && typeof ctx.addInteractable === 'function';
    if (!want) { dropIa(p); return; }
    const label = iaLabel(p);
    if (p.ia && p.ia.label === label) return;
    dropIa(p);
    const min = { x: 0, y: 0, z: 0 };
    const max = { x: 0, y: 0, z: 0 };
    let rm;
    try {
      rm = ctx.addInteractable({
        box: { min, max }, label, hint: 'E: Ausweis ansehen', noClick: true,
        enabled: () => !!p.fig && !!p.mc && p.vis && !xrOn(),
        onUse: () => { showCard(p.c); },
      });
    } catch (err) { warn('ausweis', err); return; }
    p.ia = { min, max, label, rm: typeof rm === 'function' ? rm : () => {} };
    moveIa(p);
  }

  // ------------------------------------------------------------------ Figuren
  function makeFig(p) {
    const n = npc();
    if (!n || typeof n.figure !== 'function') return false;
    try {
      const look = p.lk ? lookToRender(p.lk) : makeLook(seeded(L.lookSeed(p.k)), {});
      const fig = n.figure({ look, parent: ctx.scene });
      p.fig = fig;
      p.lastA = -1;
      if (p.emote) p.emote.shown = false;
      if (p.pos) { fig.root.position.set(p.pos.x, p.pos.y, p.pos.z); fig.root.rotation.y = p.pos.yaw; }
      emitFig('add', p, fig);
      return true;
    } catch (err) { warn('figure', err); return false; }
  }
  function destroyFig(p) {
    if (!p.fig) return;
    held.clear(p.c);
    dropIa(p);
    const fig = p.fig;
    p.fig = null;
    emitFig('remove', p, fig);
    if (!fig.disposed) { try { fig.dispose(); } catch (err) { warn('dispose', err); } }
  }

  // ------------------------------------------------------------------ Zustand je Frame
  /** Anzeigepose bestimmen: Remote-Körper oder (sitzend im Saal) der zugewiesene Sitz. */
  function resolve(p, dt) {
    const b = p.body;
    const e = L.entryAt(p.tl, b.netClock);
    if (!e) return;
    p.a = e.a;
    let x = b.x; let y = b.y; let z = b.z; let yaw = b.yaw;
    let seated = false;
    const sn = e.a === 7 && e.r === 1 ? seats() : null;
    if (sn) {
      const key = e.se ? e.se[0] + ':' + e.se[1] : '';
      if (key !== p.seatKey) { p.seatKey = key; sn.sit(p.c, e.se); }
      const s = sn.seatOf(p.c);
      if (s) { x = s.x; y = s.y; z = s.z; yaw = s.yaw; seated = true; }
    } else if (p.seatKey && seatnet) { seatnet.stand(p.c); p.seatKey = ''; }
    const prev = p.pos;
    p.pos = { x, y, z, yaw, seated };
    if (prev && dt > 0) {
      const d = Math.hypot(x - prev.x, z - prev.z);
      p.speed = d > 3 || seated ? 0 : L.smoothSpeed(p.speed, d, dt);
    }
  }

  /** Abstand (m, waagerecht), unter dem eine Fremdfigur vor der eigenen Kamera ausgeblendet wird. */
  const NEAR_HIDE = 0.6;
  function applyFig(p) {
    const fig = p.fig;
    if (!fig || fig.disposed || !p.pos) return;
    // Steht eine Fremdfigur (fast) in der eigenen Kamera, wird sie ausgeblendet statt ins Bild zu ragen
    const cam = ctx.camera && ctx.camera.position;
    const near = !!cam && Math.hypot(cam.x - p.pos.x, cam.z - p.pos.z) < NEAR_HIDE && cam.y > p.pos.y - 0.2 && cam.y < p.pos.y + 2.2;
    fig.root.visible = p.vis && !near;
    fig.root.position.set(p.pos.x, p.pos.y, p.pos.z);
    fig.root.rotation.y = p.pos.yaw;
    moveIa(p);
    if (!p.vis) return;
    if (p.emote && !p.pos.seated) {
      if (!p.emote.shown) { fig.setAnim(p.emote.name, { restart: true, then: 'idle' }); p.emote.shown = true; }
      p.lastA = p.a;
      return;
    }
    const af = p.pos.seated ? { name: 'sit', speed: 0, restart: false, apply: true } : L.animFor(p.a, p.lastA, p.speed);
    if (af.apply) fig.setAnim(af.name, { speed: af.speed, restart: af.restart, then: 'idle' });
    p.lastA = p.a;
  }

  // ------------------------------------------------------------------ Bewertung (alle EVAL_S)
  function evaluate() {
    dirty = false;
    const xr = xrOn();
    const level = ctx.quality ? ctx.quality() : 'mid';
    const lod = L.lodFor(level, ctx.isPhone, xr);
    const cityP = ctx.use('city');
    const vis = cityP && cityP.visible ? cityP.visible() : null;
    const areas = ctx.use('areas');
    const cam = ctx.camera.position;
    const ci = ctx.use('cinema2d');
    if (seatnet) seatnet.setOwn(ci && ci.seated && ci.active !== false ? ci.seatId : null);
    const cands = [];
    for (const p of peers.values()) {
      if (!p.pos) { p.vis = false; continue; }
      let area = 'street';
      if (areas && areas.at) { try { area = areas.at(p.pos.x, p.pos.z, p.pos.y) || 'street'; } catch { area = 'street'; } }
      p.area = area;
      p.dist = Math.hypot(cam.x - p.pos.x, cam.z - p.pos.z);
      p.vis = active && (xr || L.regionVisible(area, vis)) && p.dist <= L.FAR;
      if (p.vis) cands.push({ c: p.c, d: p.dist, has: !!p.fig });
    }
    // Überlauf anderer Reservierungen (Salon, …) senkt das Limit. Der eigene Anteil (lastReserve) zählt nicht mit, sonst schwingt das Limit.
    let over = 0;
    const nn = npc();
    if (nn && typeof nn.overflow === 'function') { try { over = Math.max(0, (nn.overflow() | 0) - Math.max(0, lastReserve)); } catch { over = 0; } }
    const chosen = active ? L.pickFigures(cands, Math.max(0, lod.max - over)) : new Set();
    let figs = 0;
    const tagItems = [];
    for (const p of peers.values()) {
      const want = chosen.has(p.c);
      if (want && !p.fig) { if (p.wait <= 0 || p.lk) makeFig(p); }
      else if (!want && p.fig) destroyFig(p);
      if (!p.fig) continue;
      figs++;
      syncIa(p);
      const id = L.cleanItemId(p.h);
      const mode = lod.hand === 'none' ? 'none' : (lod.hand === 'neutral' || p.dist > lod.coverDist ? 'neutral' : 'cover');
      held.set(p.c, p.fig, id && (p.f & F.FILM) ? id : null, mode);
      if ((p.f & F.NAME) && p.n) tagItems.push({ c: p.c, fig: p.fig, text: p.n, dist: p.dist });
      applyFig(p);
    }
    tags.sync(tagItems, lod);
    // Draw-Call-Ausgleich: bei low (und in VR) je sichtbarer Fremdfigur ein Passant weniger
    const want = level === 'low' || xr ? figs : 0;
    if (want !== lastReserve) {
      const n = npc();
      if (n && typeof n.reserve === 'function') { try { n.reserve(want); lastReserve = want; } catch (err) { warn('reserve', err); } }
    }
  }

  // ------------------------------------------------------------------ API
  const api = {
    /** wl: { c, s, peers:[{c,k,n,f,j,ad?,q?,se?,h?}] } */
    welcome(wl) {
      if (disposed || !wl) return;
      for (const c of [...peers.keys()]) removePeer(c);
      if (seatnet) seatnet.clear();
      if (Number.isInteger(wl.c)) myC = wl.c;
      const t = Number.isFinite(wl.s) ? wl.s : nowMs();
      for (const d of Array.isArray(wl.peers) ? wl.peers : []) {
        const p = addPeer(d, t);
        if (!p) continue;
        if (wl.lk && Array.isArray(wl.lk[p.c])) setLk(p, wl.lk[p.c]);
        if (wl.mc && Array.isArray(wl.mc[p.c])) setMc(p, wl.mc[p.c]);
      }
      acc = L.EVAL_S;
    },
    ev(e) {
      if (disposed || !e) return false;
      switch (e.t) {
        case 'b': {
          const s = Number.isFinite(e.s) ? e.s : nowMs();
          for (const q of Array.isArray(e.p) ? e.p : []) {
            if (!Array.isArray(q) || isMe(q[0])) continue;
            const p = peers.get(q[0]);
            if (!p || !Number.isFinite(s)) continue;
            feedPose(p, { x: q[1], y: q[2], z: q[3], yaw: q[4], pitch: q[5], a: q[6], r: q[7], se: q[9] }, s - (Number.isFinite(q[8]) ? q[8] : 0));
          }
          batchS = s;
          try { for (const x of Array.isArray(e.ev) ? e.ev : []) api.ev(x); } finally { batchS = null; }
          return true;
        }
        case 'j': addPeer(e.peer || e.p || e, nowMs()); return true;
        case 'l': removePeer(e.c); return true;
        case 'pf': {
          const p = peers.get(e.c);
          if (!p) return true;
          if (Number.isInteger(e.f)) p.f = e.f;
          if (typeof e.n === 'string') p.n = e.n;
          if ('h' in e) p.h = e.h || null;
          dirty = true;
          return true;
        }
        case 'lk': {
          const p = peers.get(e.c);
          if (p && !isMe(e.c)) setLk(p, e.l);
          return true;
        }
        case 'mc': {
          const p = peers.get(e.c);
          if (p && !isMe(e.c)) setMc(p, e.m);
          return true;
        }
        case 'e': {
          const p = peers.get(e.c);
          if (!p || isMe(e.c)) return true;
          const t0 = Number.isFinite(batchS) ? batchS : nowMs();
          const em = startRemote(e.e, Number.isFinite(t0) ? t0 : (p.tl.length ? p.tl[p.tl.length - 1].t : 0));
          if (!em) return true;
          p.emote = em;
          p.lastA = -1;
          return true;
        }
        default: return false;
      }
    },
    tick(dt) {
      if (disposed || !(dt > 0)) return;
      dt = Math.min(dt, 0.1);
      const now = nowMs();
      for (const p of peers.values()) {
        if (p.wait > 0) { p.wait -= dt; if (p.wait <= 0) dirty = true; }
        if (!p.last) continue;
        if (now !== null) p.body.syncNetClock(now - dt * 1000);
        p.body.step(dt);
        resolve(p, dt);
        if (p.emote && (!stepRemote(p.emote, dt) || endedByPose(p.emote, p.tl))) { p.emote = null; p.lastA = -1; }
        if (p.fig) applyFig(p);
      }
      acc += dt;
      if (acc >= L.EVAL_S || (dirty && acc >= 0.1)) { acc = 0; evaluate(); }
      tags.update();
    },
    list() {
      const me = myInfo();
      const counts = L.deviceCounts([...peers.values()], me && me.k);
      return [...peers.values()].map((p) => ({ c: p.c, k: p.k, n: p.n, r: p.r, f: p.f, ad: !!p.ad, area: p.area || '', devs: counts.get(p.k) || 1, card: !!(p.mc && fromWire(p.mc)) }));
    },
    /** Anzeigename mit Namens-Regel (leer oder ohne Namens-Flag → „Jemand“). */
    name(c) { const p = peers.get(c); return p ? L.displayName(p.n, p.f) : 'Jemand'; },
    get: (c) => { const p = peers.get(c); return p ? { ...pub(p), figure: p.fig, devs: 1 } : null; },
    count: () => peers.size,
    /** Ausweis (CardData) des Peers c oder null. */
    card: (c) => cardOf(peers.get(c)),
    /** member.showCard(…, { mode: 'peer' }) für Peer c; false ohne Ausweis/Provider. */
    showCard,
    onFigure(fn) { figListeners.add(fn); return () => figListeners.delete(fn); },
    /** false = Figuren und DOM weg (Aussetzen, VR-Kino), Peer-Daten bleiben; true = wieder zeigen. */
    setActive(on) {
      active = !!on;
      if (!active) { for (const p of peers.values()) destroyFig(p); tags.clear(); if (lastReserve !== 0) { const n = npc(); if (n && n.reserve) n.reserve(0); lastReserve = 0; } }
      acc = L.EVAL_S;
    },
    onQuality() { acc = L.EVAL_S; },
    /** Alles entfernen (Peers, Figuren, DOM, reserve(0)). */
    clear() {
      for (const c of [...peers.keys()]) removePeer(c);
      tags.clear();
      if (seatnet) seatnet.clear();
      const n = npc();
      if (n && typeof n.reserve === 'function') { try { n.reserve(0); } catch { /* egal */ } }
      lastReserve = 0;
    },
    stats() { let figs = 0; for (const p of peers.values()) if (p.fig) figs++; return { peers: peers.size, figures: figs, tags: tags.stats(), held: held.stats(), reserved: lastReserve, seats: seatnet ? seatnet.count() : 0 }; },
    dispose() {
      if (disposed) return;
      api.clear();
      disposed = true;
      tags.dispose();
      held.dispose();
      figListeners.clear();
    },
  };
  return api;
}
