// VIDEOTHEK LENZ · Mehrspieler (lfx-mp.1, Welle c): Physik-Sync, Teil „phys“ des Moduls net (Fabrik createPhys, siehe net/parts.js).
// Besitzer-Prinzip (docs/mp-api.md §8.1): Wer ein Ding anstößt, hält oder wirft, beansprucht es (pc) und simuliert es sofort selbst (optimistisch),
// sendet dann im gemeinsamen Takt ps (höchstens 8 Einträge, Rate cf.ph); alle anderen bekommen den Körper als „fremdgesteuert“ (world.setRemote) und
// interpolieren ihn (250 ms hinterher, kurze Extrapolation). Ruhe → ps s=1 → das DO gibt frei (po o=0) → wieder lokal. Ablehnung (po mit fremdem o)
// schaltet zurück auf fremdgesteuert. Netz-Id = props.netIdOf(body): data.id statischer Requisiten bzw. "<c>.<n>" geworfener Hüllen (pn/px).
// Geworfene Hüllen anderer: Körper kind 'tape' (nie in throw.js `tapes`, also nicht aufhebbar), Cover nur nach Rechte-Filter des eigenen Katalogs
// (net/heldcover.js, unverändert wiederverwendet), sonst neutral; bei low/VR neutral und höchstens 2 sichtbar (sonst 4), insgesamt höchstens 6.
// Ohne Verbindung/Fähigkeit `phys` ist alles aus (Verhalten wie 1.15). Alle Provider-Zugriffe mit Guard.
//   createPhys(core) → { welcome(wl), ev(frame b), tick(dt), stop(), dispose(), gate(body) → bool, stats() }
import { Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import { createHeldCover } from './heldcover.js';
import { build } from './proto.js';
import * as L from './phys-logic.js';

const warn = (what, err) => { try { console.warn('[LenzFlix Store3D] mp phys', what, err && err.message ? err.message : ''); } catch { /* egal */ } };

export function createPhys(core) {
  const ctx = core.ctx;
  const frame = core.frame;
  const clock = typeof core.now === 'function' ? core.now : () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const owners = L.createOwners();
  const lim = L.createLimiter(L.CLAIM_PER_S, 4);
  const tracks = new Map(); // Netz-Id → Interpolationsspur fremdgesteuerter Körper
  const pending = new Map(); // Netz-Id → ms (Anspruch gestellt, `po` steht aus)
  const deny = new Map(); // Netz-Id → ms bis zu denen kein neuer Anspruch gestellt wird
  const rtapes = new Map(); // Netz-Id → { c, body, outer, inner, seq } fremde geworfene Hüllen
  const mineTapes = new Set(); // eigene geworfene Hüllen (Körper), deren Netz-Id gilt
  let seq = 0;
  let tapeN = 0;
  let ph = 8;
  let acc = 0;
  let chainAcc = 0;
  let off = null;
  let attached = null;
  let disposed = false;
  let cover = null;
  let geo = null;
  let mat = null;

  const phys = () => { try { return ctx.use('physics') || null; } catch { return null; } };
  const me = () => { try { return core.me() || null; } catch { return null; } };
  const on = () => !disposed && !!core.active() && !!core.cap('phys') && !!me();
  const worldOf = () => { const p = phys(); return (p && p.world) || null; };
  const byId = (id) => { const p = phys(); return p && typeof p.byNetId === 'function' ? p.byNetId(id) : null; };
  const idOf = (b) => { const p = phys(); return p && typeof p.netIdOf === 'function' ? p.netIdOf(b) : null; };
  const lowish = () => { let q = 'mid'; try { q = ctx.quality ? ctx.quality() : 'mid'; } catch { /* mid */ } return q === 'low' || !!(ctx.xr && ctx.xr.presenting && ctx.xr.presenting()); };

  function remote(b, flag) {
    const w = worldOf();
    if (w && typeof w.setRemote === 'function') w.setRemote(b, flag); else if (b) b.netRemote = !!flag;
  }
  const release = (b) => { if (b) remote(b, false); };

  // ------------------------------------------------------------------ Ansprüche
  function claim(id, b, t) {
    const m = me();
    const seen = owners.claim(id, m.c, t);
    pending.set(id, t);
    tracks.delete(id);
    remote(b, false);
    if (!core.send(build.pc(id, seen))) { owners.free(id); pending.delete(id); }
  }

  function claimFor(b, force) {
    const id = idOf(b);
    if (!id) return;
    if (b.held && !force) return;
    const m = me();
    const t = clock();
    if (!L.claimAllowed(owners, id, m.c, t, deny.get(id))) return;
    if (!lim.take(t)) return;
    claim(id, b, t);
  }

  /** Reset-Gate (props → net.physGate): erst Anspruch, dann zurücksetzen. true = jetzt zurücksetzen erlaubt. */
  function gate(b) {
    if (!on()) return true;
    const id = idOf(b);
    if (!id) return true;
    if (b.netRemote) return false;
    const o = owners.get(id);
    if (o) return o.o === me().c && !pending.has(id);
    const t = clock();
    if (L.claimAllowed(owners, id, me().c, t, deny.get(id)) && lim.take(t)) claim(id, b, t);
    return false;
  }

  // ------------------------------------------------------------------ Weltereignisse
  function onSpawn(b) {
    if (b.netRemote || !b.data || b.data.net || b.data.tapeId === undefined || b.owner !== 'player') return;
    const m = me();
    const t = clock();
    const id = `${m.c}.${++tapeN}`;
    const st = L.bodyState(b);
    let film = false;
    try { film = !!core.prefs().film; } catch { /* aus */ }
    const it = film && L.ITEM_ID.test(String(b.data.tapeId)) ? b.data.tapeId : null;
    const p = frame.enc(st.x, st.y, st.z, 2);
    const v = frame.encVec(st.x, st.z, st.vx, st.vz, 2);
    const q = [p[0], p[1], p[2], v[0], Math.round(st.vy * 100), v[1], frame.encYaw(st.yaw), Math.round((b.spin || 0) * 100)];
    b.data.net = id;
    const msg = build.pn(id, it, q);
    if (msg && core.send(msg)) {
      owners.set(id, m.c, 1, 0, t);
      const e = owners.get(id);
      e.last = st;
      e.sentAt = t;
      b.data.mine = true;
      mineTapes.add(b);
    } else delete b.data.net;
  }

  function onRemove(b) {
    const id = b && b.data && b.data.net;
    if (!id) return;
    if (rtapes.has(id)) { dropTape(id); return; }
    if (b.data.mine) {
      b.data.mine = false;
      mineTapes.delete(b);
      owners.free(id);
      if (on()) core.send(build.px(id));
    }
  }

  function onWorld(ev) {
    try {
      if (!ev || !ev.body) return;
      if (ev.type === 'remove') { onRemove(ev.body); return; }
      if (!on()) return;
      if (ev.type === 'touch') claimFor(ev.body, false);
      else if (ev.type === 'hold') claimFor(ev.body, true); // aufgehoben: sofort beanspruchen; losgelassen: erneut, falls inzwischen ein anderer Besitzer eingetragen wurde
      else if (ev.type === 'spawn') onSpawn(ev.body);
    } catch (err) { warn('Welt', err); }
  }

  function attach() {
    const w = worldOf();
    if (!w || typeof w.on !== 'function') return false;
    if (attached === w) return true;
    detach();
    attached = w;
    off = w.on(onWorld);
    return true;
  }
  function detach() {
    if (off) { try { off(); } catch { /* egal */ } }
    off = null;
    attached = null;
  }

  // ------------------------------------------------------------------ Fremde geworfene Hüllen
  function neutralMesh() {
    if (!geo) { geo = new BoxGeometry(0.14, 0.2, 0.03); mat = new MeshBasicMaterial({ color: 0x3a4a78 }); }
    return new Mesh(geo, mat);
  }
  function makeVisual(id, it) {
    const outer = new Group();
    outer.name = 'lfx-mp-tape';
    const inner = new Group();
    outer.add(inner);
    if (it && L.ITEM_ID.test(it)) {
      if (!cover) cover = createHeldCover(ctx);
      cover.set(id, { root: inner, bones: null, disposed: false }, it, lowish() ? 'neutral' : 'cover');
      const ch = inner.children[0];
      if (ch) { ch.position.set(0, 0, 0); ch.rotation.set(0, Math.PI, 0); } // Vorderseite (Cover) auf +z wie bei der eigenen Hülle
    }
    if (!inner.children.length) inner.add(neutralMesh());
    return { outer, inner };
  }
  function applyVis() {
    const list = [...rtapes.values()].sort((a, b) => a.seq - b.seq);
    const n = lowish() ? L.VISIBLE_TAPES.low : L.VISIBLE_TAPES.other;
    list.forEach((t, i) => { t.inner.visible = i >= list.length - n; });
  }
  function dropTape(id) {
    const t = rtapes.get(id);
    if (!t) return;
    rtapes.delete(id);
    tracks.delete(id);
    owners.free(id);
    pending.delete(id);
    if (cover) cover.clear(id);
    if (t.outer.parent) t.outer.parent.remove(t.outer);
    if (t.body && !t.body.removed) t.body.remove();
    applyVis();
  }
  function spawnTape(c, id, it, q) {
    const P = phys();
    if (!P || typeof P.spawn !== 'function' || rtapes.has(id) || byId(id)) return;
    while (rtapes.size >= L.MAX_REMOTE_TAPES) dropTape(rtapes.keys().next().value);
    const t = clock();
    const pos = frame.dec(q[0], q[1], q[2], 2);
    const v = frame.decVec(q[0], q[2], q[3], q[5], 2);
    const vis = makeVisual(id, it);
    const yaw = q[6] / 100;
    const vy = q[4] / 100;
    const body = P.spawn({
      kind: 'tape', shape: 'box', size: [0.14, 0.2, 0.03], rr: 0.1, mass: 0.2, owner: 'remote', mesh: vis.outer, tipLocal: true,
      pos: { x: pos[0], y: pos[1], z: pos[2] }, vel: { x: v[0], y: vy, z: v[1] }, yaw, spin: q[7] / 100, tumble: 11, ttl: 60, netRemote: true, data: { net: id },
    });
    rtapes.set(id, { c, body, outer: vis.outer, inner: vis.inner, seq: ++seq });
    owners.set(id, c, 1, 0, t);
    const tr = L.createTrack();
    L.pushSample(tr, { t, x: pos[0], y: pos[1], z: pos[2], vx: v[0], vy, vz: v[1], yaw, tip: 0, ax: 0, az: 0, s: 0 });
    tracks.set(id, tr);
    applyVis();
  }

  // ------------------------------------------------------------------ Nachrichten
  function onPo(i, o, g, h) {
    if (typeof i !== 'string' || !L.OBJ_ID.test(i) || !Number.isInteger(o)) return;
    const m = me();
    const t = clock();
    const b = byId(i);
    if (!o) {
      // Frei nach dem Schlaf des Besitzers: den Ruhestand sofort übernehmen (die Interpolation läuft 250 ms hinterher), dann lokal weiter
      const tr = tracks.get(i);
      const last = tr && tr.s.length ? tr.s[tr.s.length - 1] : null;
      const w = worldOf();
      if (b && w && last && last.s === 1 && b.netRemote) w.applyRemote([L.worldEntry(b.id, { p: [last.x, last.y, last.z], v: [0, 0, 0], y: last.yaw, tip: last.tip, ax: last.ax, az: last.az, s: 1 })]);
      owners.free(i); pending.delete(i); tracks.delete(i); release(b);
      return;
    }
    if (!Number.isInteger(g)) return;
    if (o === m.c) { owners.set(i, o, g, h, t); pending.delete(i); if (b && !b.held) release(b); return; }
    if (pending.has(i)) { deny.set(i, t + L.DENY_PAUSE_MS); pending.delete(i); }
    owners.set(i, o, g, h, t);
    if (b && !b.held) remote(b, true); // ein gehaltenes Ding bleibt in der Hand; beim Loslassen wird neu beansprucht (hold-Ereignis)
  }

  function onPs(c, list) {
    const m = me();
    if (!m || c === m.c || !Array.isArray(list)) return;
    const w = worldOf();
    if (!w) return;
    const t = clock();
    for (const e of list) {
      if (!Array.isArray(e) || e.length < 13) continue;
      const id = e[0];
      const b = byId(id);
      if (!b || b.held) continue;
      const cur = owners.get(id);
      if (cur && cur.o !== c) continue;
      if (!cur) owners.set(id, c, e[1], 0, t); else if (cur.g !== e[1]) cur.g = e[1];
      if (!b.netRemote) remote(b, true);
      const st = L.decodeEntry(frame, e, L.isTapeId(id) ? 2 : frame.area(b.pos.x, b.pos.z, b.pos.y));
      let tr = tracks.get(id);
      if (!tr) { tr = L.createTrack(); tracks.set(id, tr); L.pushSample(tr, { ...L.bodyState(b), s: 0, t: t - 120 }); } // sanft vom lokalen Stand aus
      L.pushSample(tr, { ...st, t });
      const rt = rtapes.get(id);
      if (rt && rt.body) rt.body.ttl = 60;
    }
  }

  function applyRest(r) {
    if (!Array.isArray(r) || r.length < 8) return;
    const b = byId(r[0]);
    const w = worldOf();
    if (!b || !w || b.held) return;
    const cur = owners.get(r[0]);
    if (cur && cur.o !== me().c) return;
    const st = L.decodeEntry(frame, [r[0], 0, r[1], r[2], r[3], 0, 0, 0, r[4], r[5], r[6], r[7], 1], frame.area(b.pos.x, b.pos.z, b.pos.y));
    w.applyRemote([L.worldEntry(b.id, { p: [st.x, st.y, st.z], v: [0, 0, 0], y: st.yaw, tip: st.tip, ax: st.ax, az: st.az, s: 1 })]);
  }

  function resetAll() {
    for (const b of mineTapes) if (b.data) { delete b.data.net; b.data.mine = false; } // alte Netz-Ids gelten nach einem Neuaufbau nicht mehr (kein px)
    mineTapes.clear();
    for (const id of [...rtapes.keys()]) dropTape(id);
    for (const [id] of owners.entries()) release(byId(id));
    for (const id of tracks.keys()) release(byId(id));
    owners.clear();
    tracks.clear();
    pending.clear();
    deny.clear();
    lim.reset();
    acc = 0;
    chainAcc = 0;
  }

  function onLeave(c) {
    for (const id of owners.ownedBy(c)) {
      owners.free(id);
      tracks.delete(id);
      pending.delete(id);
      if (rtapes.has(id)) dropTape(id); else release(byId(id));
    }
    for (const [id, t] of [...rtapes]) if (t.c === c) dropTape(id);
  }

  // ------------------------------------------------------------------ Takt
  function sendOwn(t) {
    const m = me();
    const cands = [];
    let pose = null;
    for (const [id, e] of owners.entries()) {
      if (e.o !== m.c) continue;
      const b = byId(id);
      if (!b || b.removed) { cands.push({ id, e, drop: true }); continue; }
      let st;
      let fin = 0;
      if (b.held) {
        if (!pose) { try { pose = ctx.player.getPose(); } catch { pose = null; } }
        if (!pose) continue;
        st = L.handState(pose);
      } else { st = L.bodyState(b); fin = st.s === 1 ? 1 : 0; }
      if (!fin && !L.moved(e.last, st) && !(b.held && t - e.sentAt >= L.HELD_RESEND_MS)) continue;
      cands.push({ id, e, st, final: fin, sentAt: e.sentAt });
    }
    const gone = cands.filter((c) => c.drop);
    for (const c of gone) owners.free(c.id);
    const pick = L.pickSend(cands.filter((c) => !c.drop));
    if (!pick.length) return;
    const entries = pick.map((c) => L.encodeEntry(frame, c.id, c.e.g, c.st, L.isTapeId(c.id)));
    const msg = build.ps(entries);
    if (!msg) return;
    if (!core.send(msg)) return;
    for (const c of pick) {
      c.e.last = c.st;
      c.e.sentAt = t;
      if (c.final) owners.free(c.id); // das DO gibt bei s=1 frei; ein neuer Anstoß beansprucht neu
    }
  }

  function interpolate(t) {
    const w = worldOf();
    if (!w) return;
    for (const [id, tr] of [...tracks]) {
      const b = byId(id);
      if (!b || b.removed || !b.netRemote) { tracks.delete(id); continue; }
      const s = L.sampleTrack(tr, t - L.PH_DELAY_MS);
      if (!s) continue;
      if (s.final) {
        if (!tr.applied) { w.applyRemote([L.worldEntry(b.id, s)]); tr.applied = true; }
        if (s.over > L.FINAL_MS) { owners.free(id); tracks.delete(id); release(b); }
      } else if (s.over > L.STALE_MS) { owners.free(id); tracks.delete(id); release(b); } else w.applyRemote([L.worldEntry(b.id, s)]);
    }
  }

  function chain(t) {
    const w = worldOf();
    const m = me();
    if (!w || !m) return;
    let n = 0;
    for (const b of w.bodies) {
      if (n >= L.CHAIN_MAX) break;
      if (b.sleeping || b.held || b.netRemote || b.removed) continue;
      const id = idOf(b);
      if (!id || !L.claimAllowed(owners, id, m.c, t, deny.get(id))) continue;
      if (!lim.take(t)) break;
      claim(id, b, t);
      n++;
    }
  }

  const api = {
    welcome(wl) {
      if (disposed || !wl) return;
      resetAll();
      if (wl.cf && Number.isFinite(wl.cf.ph)) ph = Math.max(1, Math.min(8, wl.cf.ph));
      if (!on() || !attach()) return;
      for (const e of Array.isArray(wl.po) ? wl.po : []) if (Array.isArray(e)) onPo(e[0], e[1], e[2], e[3]);
      for (const r of Array.isArray(wl.pr) ? wl.pr : []) applyRest(r);
    },
    ev(m) {
      if (disposed || !m || !Array.isArray(m.ev)) return;
      for (const e of m.ev) {
        if (!e || typeof e.t !== 'string') continue;
        if (e.t === 'cf') { if (Number.isFinite(e.ph)) ph = Math.max(1, Math.min(8, e.ph)); continue; }
        if (!on()) continue;
        const mi = me();
        try {
          if (e.t === 'po') onPo(e.i, e.o, e.g, e.h);
          else if (e.t === 'ps') onPs(e.c, e.l);
          else if (e.t === 'pn') {
            if (e.c !== mi.c && typeof e.i === 'string' && L.OBJ_ID.test(e.i) && Array.isArray(e.q) && e.q.length >= 8) spawnTape(e.c, e.i, typeof e.it === 'string' ? e.it : null, e.q);
          } else if (e.t === 'px') { if (typeof e.i === 'string') dropTape(e.i); } else if (e.t === 'l') onLeave(e.c);
        } catch (err) { warn(e.t, err); }
      }
    },
    tick(dt) {
      if (disposed || !(dt > 0) || !on()) return;
      attach();
      const t = clock();
      interpolate(t);
      for (const [id, t0] of [...pending]) {
        if (t - t0 <= L.PEND_MS) continue;
        pending.delete(id);
        deny.set(id, t + L.DENY_PAUSE_MS);
        const e = owners.get(id);
        if (e && e.opt) owners.free(id); // keine Antwort: Anspruch zurücknehmen (weiter lokal, später neuer Versuch)
      }
      chainAcc += dt * 1000;
      if (chainAcc >= L.CHAIN_MS) { chainAcc = 0; chain(t); }
      acc += dt;
      if (acc >= 1 / ph) { acc = 0; sendOwn(t); }
    },
    gate,
    /** Verbindung weg: alles fremdgesteuerte lokal weiter simulieren, fremde Hüllen entfernen, Tabellen leeren (1.15-Verhalten). */
    stop() {
      detach();
      resetAll();
    },
    dispose() {
      if (disposed) return;
      api.stop();
      disposed = true;
      if (cover) { cover.dispose(); cover = null; }
      if (geo) { geo.dispose(); geo = null; }
      if (mat) { mat.dispose(); mat = null; }
    },
    stats() { return { owned: owners.ownedBy(me() ? me().c : -1).length, tracks: tracks.size, tapes: rtapes.size, pending: pending.size }; },
  };
  return api;
}
