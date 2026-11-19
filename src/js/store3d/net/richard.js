// VIDEOTHEK LENZ · Mehrspieler (lfx-mp.1, Welle c): Richard für alle sichtbar. Teil „richard“ des Moduls net (Fabrik createRichard, net/parts.js).
// Autorität gibt es NUR im Streit (W12): Im Ruhezustand (calm) und in der spitzen Phase (grudge, W14: Grudge/Hausverbot pro Verbindung) läuft
// Richard überall lokal wie in 1.15. Wer ihn schlägt (Treffer außerhalb der Autorität), sendet `rc`; das DO vergibt `ra {c,g,tg}`.
//   Rolle 'owner' (ra.c = ich): brawl.js läuft normal, dieser Teil sendet `rs` im gemeinsamen Sende-Takt (≤ 5 Hz bei Änderung, 1 Hz solange
//     nicht calm). Endet der Streit (calm/grudge) oder gehe ich in VR/offline: Abschluss-`rs` (s = calm) und `rr`.
//   Rolle 'mirror' (ra.c = anderer): brawl.js zeigt nur an (applyRemote glättet Ort, Hausverbot/Tür/HUD nur bei tg = ich, kein Treffer auf mich).
//     60 s ohne `rs`, `ra` mit c = 0, `rs` mit calm/grudge, `stop()` oder Disconnect → zurück auf 'local'.
//   Rolle 'local': wie 1.15 (auch ohne Mehrspieler, ohne Fähigkeit `rich` oder wenn rc nicht gesendet werden kann).
// In VR: nie Autorität, nie rc (brawl.setNetRole('owner') verweigert), aber Spiegeln bleibt sichtbar.
// Drahtformat rs.q = [s, h, r, x, y, z, yaw, a(, k)] (k nur mit Fähigkeit rich2: 1 = Laser-Treffer, a bleibt dann 'stagger'): r in ds, x/y/z in cm über core.frame (Katalogbreite), yaw in cRad, a = Index brawl-pose ANIMS.
// brawl-Provider: getNetState() (Meter/Sekunden), applyRemote(net, { self }), setNetRole(role, { self }), setNet({ claim, aim }), resetLocal().
//   createRichard(core) → { welcome(wl), tick(dt), stop(), dispose(), role() }
import { build } from './proto.js';

const RS_MIN_MS = 200; // ≤ 5 Hz bei Änderung
export const RS_KEEP_MS = 1000; // 1 Hz solange nicht calm
export const MIRROR_TIMEOUT_MS = 60000;
export const CLAIM_TIMEOUT_MS = 4000;
const GRUDGE = 6; // Index in brawl-fsm STATES
const MOVE_M = 0.04;
const YAW_RAD = 0.05;

const warn = (what, err) => { try { console.warn('[LenzFlix Store3D] mp richard', what, err && err.message ? err.message : ''); } catch { /* egal */ } };

export function createRichard(core) {
  const ctx = core.ctx;
  const nowMs = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const brawl = () => { const b = ctx.use('brawl'); return b && typeof b.setNetRole === 'function' ? b : null; };
  const myC = () => { const m = core.me(); return m ? m.c : 0; };
  const vr = () => !!(ctx.xr && ctx.xr.presenting && ctx.xr.presenting());
  const enabled = () => core.active() && core.cap('rich');

  let ra = { c: 0, g: 0, tg: 0 };
  let role = 'local'; // 'local' | 'owner' | 'mirror'
  let pending = false; // rc gesendet, ra mit mir noch nicht da
  let pendingAt = 0;
  let lastRs = null; // letzter empfangener Stand der Autorität { c, g, tg, q }
  let lastRxAt = 0;
  let lastSentAt = -Infinity;
  let lastSig = '';
  let lastSigPos = null; // letzter gesendeter Ort { x, z, yaw }
  let hooked = null; // brawl-Provider, an dem der Haken hängt
  let unhook = null;

  // ---------------------------------------------------------------- Kodierung
  function encode(st) {
    const f = st.f;
    const s = f.s === GRUDGE ? 0 : f.s; // spitze Phase bleibt lokal (W14): auf der Leitung calm
    const calm = s === 0;
    const [x, y, z] = core.frame.enc(st.x, st.y || 0, st.z, 0);
    const q = [s, calm ? 0 : f.h, calm ? 0 : Math.round(f.r * 10), x, y, z, core.frame.encYaw(st.yaw || 0), st.a | 0];
    if (core.cap('rich2')) q.push(st.k === 1 ? 1 : 0); // 1.19.0: 9. Element nur, wenn der Server es versteht (alter Worker prüft q.length === 8)
    return q;
  }
  function decode(q) {
    const [x, y, z] = core.frame.dec(q[3], q[4], q[5], 0);
    return { v: 1, f: { v: 1, s: q[0], h: q[1], r: q[2] / 10 }, x, z, y, yaw: core.frame.decYaw(q[6]), a: q[7], ...(q[8] === 1 ? { k: 1 } : {}) };
  }

  // ---------------------------------------------------------------- Haken in brawl.js
  function aim() {
    const tg = ra.tg || ra.c;
    const p = tg ? core.peers.get(tg) : null;
    const root = p && p.figure && p.figure.root;
    if (!root || !root.position) return null;
    return { x: root.position.x, y: root.position.y, z: root.position.z };
  }
  function claim() {
    if (!enabled() || vr()) return false;
    if (!core.send(build.rc())) return false;
    role = 'owner';
    pending = true;
    pendingAt = nowMs();
    lastSig = '';
    lastSentAt = -Infinity;
    return true;
  }
  function ensureHook() {
    const b = brawl();
    if (b === hooked) return b;
    if (unhook) { try { unhook(); } catch { /* egal */ } unhook = null; }
    hooked = b;
    if (b && typeof b.setNet === 'function') unhook = b.setNet({ claim, aim });
    return b;
  }

  // ---------------------------------------------------------------- Rollenwechsel
  function toLocal() {
    const b = brawl();
    if (b) { try { b.setNetRole('local'); } catch (err) { warn('local', err); } }
    role = 'local';
    pending = false;
    lastRs = null;
  }
  function toMirror() {
    const b = brawl();
    if (!b) return false;
    const me = myC();
    b.setNetRole('mirror', { self: !!me && ra.tg === me });
    role = 'mirror';
    pending = false;
    lastRxAt = nowMs();
    return true;
  }
  /** Autorität abgeben: Abschluss-rs (calm) und rr; Richard bleibt lokal wie er ist. */
  function release() {
    const b = brawl();
    if (role === 'owner' && !pending && ra.c === myC() && ra.g > 0) {
      if (b) { const st = b.getNetState(); if (st && st.f) core.send(build.rs(ra.g, [0, 0, 0, ...core.frame.enc(st.x, st.y || 0, st.z, 0), core.frame.encYaw(st.yaw || 0), st.a | 0], myC()), { urgent: true }); }
      core.send(build.rr(ra.g), { urgent: true });
    }
    if (b) { try { b.setNetRole('local'); } catch (err) { warn('release', err); } }
    role = 'local';
    pending = false;
  }

  // ---------------------------------------------------------------- Ereignisse
  function onRa(e) {
    if (!e || !Number.isInteger(e.c)) return;
    const me = myC();
    const next = { c: e.c | 0, g: Number.isFinite(e.g) ? e.g | 0 : 0, tg: e.tg | 0 };
    if (next.g < ra.g && ra.c !== 0) return; // veraltet
    ra = next;
    if (!brawl()) return;
    if (ra.c === 0) { if (role === 'mirror') toLocal(); else { role = 'local'; pending = false; } return; }
    if (ra.c === me) {
      if (role === 'owner') { pending = false; return; }
      if (vr()) { core.send(build.rr(ra.g), { urgent: true }); return; } // in VR nie Autorität
      const b = brawl();
      if (b.setNetRole('owner')) { role = 'owner'; pending = false; lastSig = ''; lastSentAt = -Infinity; }
      return;
    }
    // fremde Autorität
    if (role === 'owner') {
      toMirror();
      if (lastRs && lastRs.c === ra.c) applyRs(lastRs);
    } else if (role !== 'mirror') toMirror();
    else { const b = brawl(); b.setNetRole('mirror', { self: !!me && ra.tg === me }); }
  }
  function applyRs(r) {
    const b = brawl();
    if (!b) return;
    const q = r.q;
    if (!Array.isArray(q) || q.length < 8) return;
    try { b.applyRemote(decode(q), { self: !!myC() && r.tg === myC() }); } catch (err) { warn('rs', err); }
    if (q[0] === 0 || q[0] === GRUDGE) { role = 'local'; pending = false; lastRs = null; } // brawl ist bereits auf lokal zurück
  }
  function onRs(e) {
    if (!e || !Array.isArray(e.q) || e.q.length < 8 || !Number.isInteger(e.c)) return;
    const me = myC();
    if (e.c === me) return;
    const g = Number.isFinite(e.g) ? e.g | 0 : 0;
    if (g < ra.g) return; // veraltete Autorität
    if (role !== 'mirror' && (e.q[0] === 0 || e.q[0] === GRUDGE)) { if (ra.c === e.c) ra = { c: 0, g: ra.g, tg: 0 }; return; } // Abschluss-rs nach schon erfolgter Rückkehr
    if (ra.c !== e.c || g > ra.g) onRa({ c: e.c, g, tg: e.tg });
    if (role !== 'mirror') { if (!brawl() || (role === 'owner' && ra.c === me)) return; toMirror(); }
    lastRxAt = nowMs();
    lastRs = { c: e.c, g, tg: e.tg | 0, q: e.q };
    applyRs(lastRs);
  }
  function onEr(e) {
    if (!e || e.y !== 'rc') return;
    if (role !== 'owner') return;
    if (e.c === 'deny' && ra.c !== 0 && ra.c !== myC()) {
      // Richard ist gegen einen anderen feindlich: zurück auf Anzeige
      const had = lastRs && lastRs.c === ra.c;
      toMirror();
      if (had) applyRs(lastRs);
    } else {
      // Fähigkeit/Server aus: lokal weiterspielen
      const b = brawl();
      if (b) b.setNetRole('local');
      role = 'local';
      pending = false;
    }
  }

  const offs = [core.on('ra', onRa), core.on('rs', onRs), core.on('er', onEr)];

  // ---------------------------------------------------------------- Sende-Takt
  function sendOwner(b, now) {
    const st = b.getNetState();
    if (!st || !st.f) return;
    const q = encode(st);
    if (q[0] === 0) { release(); return; } // Streit vorbei (calm oder spitze Phase)
    const sig = `${q[0]}|${q[1]}|${q[7]}|${q[8] | 0}`;
    const moved = lastSigPos === null || Math.hypot(st.x - lastSigPos.x, st.z - lastSigPos.z) > MOVE_M || Math.abs(st.yaw - lastSigPos.yaw) > YAW_RAD;
    const changed = sig !== lastSig || moved;
    if (!((changed && now - lastSentAt >= RS_MIN_MS) || now - lastSentAt >= RS_KEEP_MS)) return;
    const m = build.rs(ra.g, q, myC());
    if (!m) return;
    if (core.send(m, { urgent: false })) {
      lastSentAt = now;
      lastSig = sig;
      lastSigPos = { x: st.x, z: st.z, yaw: st.yaw };
    }
  }
  return {
    role: () => role,
    welcome(wl) {
      lastSigPos = null;
      ra = { c: 0, g: 0, tg: 0 };
      if (wl && wl.ra && Number.isInteger(wl.ra.c) && wl.ra.c !== 0) onRa(wl.ra);
    },
    tick() {
      const b = ensureHook();
      if (!b) return;
      if (!enabled()) { if (role !== 'local') { toLocal(); } return; }
      const now = nowMs();
      if (role === 'mirror') {
        if (now - lastRxAt > MIRROR_TIMEOUT_MS) toLocal();
        return;
      }
      if (role !== 'owner') return;
      if (vr()) { release(); return; }
      if (pending) {
        if (now - pendingAt > CLAIM_TIMEOUT_MS) { b.setNetRole('local'); role = 'local'; pending = false; }
        return;
      }
      if (ra.c !== myC()) return;
      sendOwner(b, now);
    },
    /** Verbindung weg oder Aussetzen: Richard läuft wieder rein lokal (1.15). */
    stop() {
      if (role !== 'local') toLocal();
      ra = { c: 0, g: 0, tg: 0 };
      lastSigPos = null;
    },
    dispose() {
      offs.forEach((o) => { try { o(); } catch { /* egal */ } });
      if (unhook) { try { unhook(); } catch { /* egal */ } unhook = null; }
      hooked = null;
      if (role !== 'local') toLocal();
    },
  };
}
