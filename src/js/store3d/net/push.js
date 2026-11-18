// VIDEOTHEK LENZ · Mehrspieler (lfx-mp.1, Welle c): Schubsen, Teil „push“ des Moduls net (Fabrik createPush, siehe net/parts.js).
// Schlagen auf eine Fremdfigur ist nur ein Stoß, kein Schaden: Jede Fremdfigur hängt per npc.registerPerson (Schlag-Priorität Personen 20) ein,
// onHit zeigt lokal die Reaktion und sendet pu {c, d (Richtung x100), s}; der Server reicht pu an das Ziel (Frame x), das ctx.player.knock(dir, Stärke)
// lokal anwendet. Mit ausgehandelter Fähigkeit `fight` (1.18.0) sendet dieser Teil NICHT mehr selbst (nur die lokale Reaktion und der Empfang bleiben). Stärke: nav/collide.js PUSH_KNOCK * s/100. Nie in VR (weder senden noch empfangen noch an VR-Ziele), nur im Laufmodus,
// gedrosselt (senden 2/s wie der Server, empfangen höchstens alle 350 ms), Abstand höchstens 3,4 m (Server 3,5 m). pu löst im Transport selbst höchstens einen vorgezogenen Takt aus.
//   createPush(core) → { x(frame x), stop(), dispose() }
import { PUSH_KNOCK } from '../nav/collide.js';
import { build, F } from './proto.js';

export const SEND_GAP_MS = 500;
export const RECV_GAP_MS = 350;
export const SEND_DIST = 3.4;
export const RECV_DIST = 4.5; // Toleranz: die Fremdfigur läuft 250 ms hinterher
export const PUSH_S = 100;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const warn = (what, err) => { try { console.warn('[LenzFlix Store3D] mp push', what, err && err.message ? err.message : ''); } catch { /* egal */ } };

export function createPush(core) {
  const ctx = core.ctx;
  const frame = core.frame;
  const clock = typeof core.now === 'function' ? core.now : () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const regs = new Map(); // Figur → off
  let lastSend = -1e9;
  let lastRecv = -1e9;
  let disposed = false;

  const xrOn = () => !!(ctx.xr && ctx.xr.presenting && ctx.xr.presenting());
  const poseOf = () => { try { return ctx.player.getPose(); } catch { return null; } };

  function hit(c, fig, dir) {
    try { if (typeof fig.hitReact === 'function') fig.hitReact(dir); } catch (err) { warn('hitReact', err); }
    if (disposed || xrOn() || !core.active() || !core.cap('push') || !dir) return;
    if (core.cap('fight')) return; // 1.18.0: mit Fähigkeit fight sendet das Modul fight den Hieb als `fh` (der Server macht für alte Peers selbst ein pu); kein doppelter Rückstoß
    const info = core.peers && core.peers.get ? core.peers.get(c) : null;
    if (info && (info.f & F.VR)) return; // VR-Ziele lassen sich nicht schubsen
    const t = clock();
    if (t - lastSend < SEND_GAP_MS) return;
    const pose = poseOf();
    if (!pose) return;
    const fp = fig.root && fig.root.position;
    if (fp && Math.hypot(pose.x - fp.x, pose.z - fp.z) > SEND_DIST) return;
    const r = frame.area(pose.x, pose.z, pose.y || 0);
    const d = frame.encDir(pose.x, pose.z, dir.x, dir.z, r);
    if (!d[0] && !d[1]) return;
    const m = build.pu(c, d, PUSH_S);
    if (m && core.send(m)) lastSend = t;
  }

  function onFigure(kind, pub, fig) {
    if (disposed || !fig) return;
    if (kind === 'remove') {
      const off = regs.get(fig);
      if (off) { regs.delete(fig); try { off(); } catch { /* egal */ } }
      return;
    }
    if (kind !== 'add' || regs.has(fig)) return;
    let n = null;
    try { n = ctx.use('npc'); } catch { /* ohne npc */ }
    if (!n || typeof n.registerPerson !== 'function') return;
    const c = pub.c;
    regs.set(fig, n.registerPerson({ kind: 'peer', handle: fig, onHit: (dir) => hit(c, fig, dir) }));
  }
  const offFig = core.peers && typeof core.peers.onFigure === 'function' ? core.peers.onFigure(onFigure) : null;

  function onPu(e) {
    if (xrOn() || !core.active()) return;
    if (typeof ctx.playing === 'function' && !ctx.playing()) return;
    const me = core.me();
    if (!me || e.c === me.c || !Array.isArray(e.d) || e.d.length < 2) return;
    const dx = Number(e.d[0]); const dz = Number(e.d[1]);
    const s = Number(e.s);
    if (!Number.isFinite(dx) || !Number.isFinite(dz) || !Number.isFinite(s)) return;
    const t = clock();
    if (t - lastRecv < RECV_GAP_MS) return;
    const pose = poseOf();
    if (!pose) return;
    const sender = core.peers && core.peers.get ? core.peers.get(e.c) : null;
    const f = sender && sender.figure;
    if (f && !f.disposed && f.root && f.root.position && Math.hypot(f.root.position.x - pose.x, f.root.position.z - pose.z) > RECV_DIST) return;
    const r = frame.area(pose.x, pose.z, pose.y || 0);
    const p = frame.enc(pose.x, pose.y || 0, pose.z, r);
    const dir = frame.decDir(p[0], p[2], dx, dz, r);
    if (!dir[0] && !dir[1]) return;
    lastRecv = t;
    try { ctx.player.knock({ x: dir[0], z: dir[1], up: 0 }, (clamp(s, 1, 100) / 100) * PUSH_KNOCK); } catch (err) { warn('knock', err); return; }
    try { const sd = ctx.use('sound'); if (sd && typeof sd.play === 'function') sd.play('thud', { k: 0.8 }); } catch { /* egal */ }
  }

  function unregisterAll() {
    for (const off of regs.values()) { try { off(); } catch { /* egal */ } }
    regs.clear();
  }

  return {
    /** Frame x (empfängerspezifisch): pu {c, d, s}. */
    x(m) {
      if (disposed || !m || !Array.isArray(m.ev)) return;
      for (const e of m.ev) {
        if (e && e.t === 'pu') { try { onPu(e); } catch (err) { warn('pu', err); } }
      }
    },
    stop() { unregisterAll(); },
    dispose() {
      if (disposed) return;
      disposed = true;
      if (offFig) { try { offFig(); } catch { /* egal */ } }
      unregisterAll();
    },
  };
}
