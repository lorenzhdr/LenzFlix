// @vitest-environment jsdom
// VIDEOTHEK LENZ · Mehrspieler Welle c (C1): Physik-Sync (net/phys.js, net/phys-logic.js). Reine Teile plus zwei Clients mit echter Physik-Welt
// und echtem Netzrahmen, verbunden über einen winzigen Fake-Vergeber (pc/po, ps, pn/px). Kein Netzwerk.
import { describe, it, expect, vi } from 'vitest';
import { Texture } from 'three';
import { createWorld, DT } from '../src/js/store3d/physics/world.js';
import { createFrame } from '../src/js/store3d/net/frame.js';
import { createPhys } from '../src/js/store3d/net/phys.js';
import { normalizeOut } from '../src/js/store3d/net/proto.js';
import { buildCity } from '../src/js/store3d/world/city.js';
import { netIdOf } from '../src/js/store3d/modules/props.js';
import * as L from '../src/js/store3d/net/phys-logic.js';

const HEX = 'a'.repeat(32);

// ------------------------------------------------------------------------------------------------ reine Teile
describe('phys-logic: Besitz, Anspruch, Eimer', () => {
  it('Besitztabelle: claim liefert zuletzt gesehenes g (der optimistische Wert steht nur im Eintrag), po ist maßgeblich (auch ein kleineres g)', () => {
    const o = L.createOwners();
    expect(o.claim('a', 1, 0)).toBe(0);
    expect(o.get('a')).toMatchObject({ o: 1, g: 1, opt: true });
    o.set('a', 1, 1, 0, 10);
    expect(o.get('a').opt).toBe(false);
    expect(o.g('a')).toBe(1); // nur po setzt das gesehene g
    o.set('a', 2, 5, 0, 20);
    expect(o.g('a')).toBe(5);
    o.free('a');
    expect(o.get('a')).toBeNull();
    expect(o.g('a')).toBe(5); // zuletzt gesehenes g bleibt für pc
    expect(o.claim('a', 1, 30)).toBe(5);
    expect(o.get('a').g).toBe(6);
    o.set('a', 1, 1, 0, 31); // Server hat neu angefangen: g 1 gilt
    expect(o.get('a').g).toBe(1);
    expect(o.g('a')).toBe(1);
  });
  it('set behält den Sendestand bei gleichem Besitzer', () => {
    const o = L.createOwners();
    o.set('a', 1, 1, 0, 0);
    o.get('a').last = { x: 1 };
    o.set('a', 1, 2, 0, 5);
    expect(o.get('a').last).toEqual({ x: 1 });
    o.set('a', 2, 3, 0, 6);
    expect(o.get('a').last).toBeNull();
  });
  it('claimAllowed: eigener Besitz, gehalten, Haltezeit 250 ms, Ablehnungspause', () => {
    const o = L.createOwners();
    expect(L.claimAllowed(o, 'a', 1, 0)).toBe(true);
    o.set('a', 2, 1, 0, 1000);
    expect(L.claimAllowed(o, 'a', 1, 1100)).toBe(false); // Haltezeit
    expect(L.claimAllowed(o, 'a', 1, 1000 + L.HOLD_MS)).toBe(true);
    o.set('a', 2, 2, 3, 1000);
    expect(L.claimAllowed(o, 'a', 1, 5000)).toBe(false); // von 3 gehalten
    o.set('a', 1, 3, 0, 1000);
    expect(L.claimAllowed(o, 'a', 1, 5000)).toBe(false); // schon meins
    o.free('a');
    expect(L.claimAllowed(o, 'a', 1, 5000, 6000)).toBe(false); // Pause
    expect(L.claimAllowed(o, 'a', 1, 7000, 6000)).toBe(true);
  });
  it('Token-Eimer: Burst, dann Rate', () => {
    const l = L.createLimiter(8, 4);
    expect([1, 2, 3, 4, 5].map(() => l.take(0))).toEqual([true, true, true, true, false]);
    expect(l.take(125)).toBe(true); // 8/s = 1 je 125 ms
    expect(l.take(126)).toBe(false);
  });
});

describe('phys-logic: Kodierung', () => {
  const lay = (w, d) => ({ w, d, city: buildCity({ w, d }) });
  const body = (x, y, z) => ({ pos: { x, y, z }, vel: { x: 1.5, y: -2, z: 0.5 }, yaw: 0.7, tipA: 0.5, tipAx: 0.6, tipAz: -0.8, sleeping: false });

  it('Hin und zurück bei W0/D0 ist cm-genau; Schlaf: Geschwindigkeit 0', () => {
    const f = createFrame(lay(12.5, 18));
    const b = body(5, 0.5, 7);
    const e = L.encodeEntry(f, 'can1', 3, L.bodyState(b));
    expect(e.length).toBe(13);
    expect(e[12]).toBe(0);
    const d = L.decodeEntry(f, e, f.area(5, 7, 0.5));
    expect(d).toMatchObject({ i: 'can1', g: 3, s: 0 });
    expect(Math.abs(d.x - 5)).toBeLessThan(0.011);
    expect(Math.abs(d.z - 7)).toBeLessThan(0.011);
    expect(d.vx).toBeCloseTo(1.5, 1);
    expect(d.vy).toBeCloseTo(-2, 2);
    expect(d.tip).toBeCloseTo(0.5, 2);
    expect(d.ax).toBeCloseTo(0.6, 2);
    b.sleeping = true;
    const s = L.encodeEntry(f, 'can1', 3, L.bodyState(b));
    expect(s[12]).toBe(1);
    expect([s[5], s[6], s[7]]).toEqual([0, 0, 0]);
  });
  it('ax/az nur bei tip > 0; tip auf 0..157 geklemmt; Ergebnis besteht normalizeOut', () => {
    const f = createFrame(lay(12.5, 18));
    const flat = { ...body(1, 1, 1), tipA: 0 };
    const e = L.encodeEntry(f, 'x1', 1, L.bodyState(flat));
    expect([e[9], e[10], e[11]]).toEqual([0, 0, 0]);
    const big = { ...body(1, 1, 1), tipA: 9 };
    const e2 = L.encodeEntry(f, 'x1', 1, L.bodyState(big));
    expect(e2[9]).toBe(157);
    const m = normalizeOut({ t: 'ps', l: [e, e2] });
    expect(m.l).toHaveLength(2);
    expect(m.l[0]).toEqual(e);
  });
  it('Bereichstreue über verschiedene Ladenmaße: Palast-Ball bleibt im Palast (W=12.5 → 28)', () => {
    for (const [wa, da, wb, db] of [[12.5, 18, 28, 30], [20, 24, 12.5, 18], [28, 30, 16, 22]]) {
      const A = lay(wa, da); const B = lay(wb, db);
      const fa = createFrame(A); const fb = createFrame(B);
      const pa = A.city.propSlots.find((s) => s.id === 'palastBall');
      const pb = B.city.propSlots.find((s) => s.id === 'palastBall');
      const ra = fa.area(pa.x, pa.z, 0.1);
      expect(ra).toBe(1);
      const e = L.encodeEntry(fa, 'palastBall', 1, { x: pa.x, y: 0.1, z: pa.z, vx: 0, vy: 0, vz: 0, yaw: 0, tip: 0, ax: 0, az: 0, s: 1 });
      const d = L.decodeEntry(fb, e, fb.area(pb.x, pb.z, 0.1));
      expect(fb.area(d.x, d.z, 0.1)).toBe(1);
      const back = L.decodeEntry(fa, e, ra);
      expect(Math.hypot(back.x - pa.x, back.z - pa.z)).toBeLessThan(0.011);
    }
  });
  it('Hüllen ("c.n") nutzen immer r = 2 (kein r auf der Leitung)', () => {
    const f = createFrame(lay(12.5, 18));
    const st = { x: 3, y: 1, z: 22, vx: 1, vy: 0, vz: 0, yaw: 0, tip: 0, ax: 0, az: 0, s: 0 };
    const e = L.encodeEntry(f, '4.1', 1, st, true);
    const d = L.decodeEntry(f, e, 2);
    expect(Math.hypot(d.x - 3, d.z - 22)).toBeLessThan(0.011);
  });
  it('pickSend: Endstände zuerst, dann am längsten nicht gesendet, höchstens 8', () => {
    const c = Array.from({ length: 12 }, (_, i) => ({ id: `i${i}`, final: i === 11 ? 1 : 0, sentAt: 100 - i }));
    const p = L.pickSend(c);
    expect(p).toHaveLength(8);
    expect(p[0].id).toBe('i11');
    expect(p[1].id).toBe('i10'); // am längsten nicht gesendet (kleinstes sentAt)
  });
});

describe('phys-logic: Interpolation', () => {
  const smp = (t, x, o = {}) => ({ t, x, y: 0.1, z: 0, vx: 0, vy: 0, vz: 0, yaw: 0, tip: 0, ax: 0, az: 0, s: 0, ...o });
  it('linear zwischen zwei Ständen; davor/dahinter; Extrapolation höchstens 150 ms', () => {
    const tr = L.createTrack();
    L.pushSample(tr, smp(1000, 0, { vx: 4 }));
    L.pushSample(tr, smp(1200, 1, { vx: 4 }));
    expect(L.sampleTrack(tr, 1100).p[0]).toBeCloseTo(0.5, 5);
    expect(L.sampleTrack(tr, 900).p[0]).toBe(0);
    const ex = L.sampleTrack(tr, 1200 + 100);
    expect(ex.p[0]).toBeCloseTo(1 + 4 * 0.1, 5);
    expect(ex.over).toBe(100);
    expect(L.sampleTrack(tr, 1200 + 1000).p[0]).toBeCloseTo(1 + 4 * 0.15, 5);
    expect(L.sampleTrack(tr, 1200 + 1000).over).toBe(1000);
  });
  it('Schlaf-Stand ist final und steht still; yaw nimmt den kurzen Weg; monotone Zeit', () => {
    const tr = L.createTrack();
    L.pushSample(tr, smp(1000, 0, { yaw: 3.0 }));
    L.pushSample(tr, smp(1100, 1, { yaw: -3.0 }));
    const m = L.sampleTrack(tr, 1050);
    expect(Math.abs(Math.abs(m.y) - Math.PI)).toBeLessThan(0.2); // nicht durch 0
    L.pushSample(tr, smp(1100, 2, { s: 1, vx: 9 }));
    const f = L.sampleTrack(tr, 5000);
    expect(f).toMatchObject({ final: true, s: 1, v: [0, 0, 0] });
    expect(f.p[0]).toBe(2);
    expect(tr.s.map((s) => s.t)).toEqual([1000, 1100, 1101]);
  });
});

// ------------------------------------------------------------------------------------------------ Zwei Clients
function makeSim() {
  const srv = { owners: new Map(), time: 0, grants: [] };
  const clients = [];
  let T = 100000;
  const clock = () => T;

  function mk(c, layout, opt = {}) {
    const world = createWorld({ src: [] });
    const statics = {};
    for (const [id, kind, x, z] of [['pyr0', 'can', 3, 4], ['hoopBall', 'basketball', 6, 5], ['binL', 'bin', 8, 8]]) {
      const b = world.spawn({ kind, pos: { x, y: kind === 'can' ? 0.06 : kind === 'bin' ? 0.475 : 0.12, z }, sleeping: true, owner: 'world', data: { id, group: 'x' } });
      world.setHome(b, b.pos.x, b.pos.y, b.pos.z, 0);
      statics[id] = b;
    }
    const added = [];
    const provider = {
      world,
      netIdOf,
      byNetId: (id) => world.bodies.find((b) => netIdOf(b) === id) || null,
      spawn: (spec) => { const b = world.spawn({ ...spec }); if (b.mesh) added.push(b.mesh); return b; },
    };
    const items = new Map();
    if (opt.catalog) items.set(HEX, { Id: HEX, ImageTags: { Primary: 'tg' } });
    const pose = { x: 5, y: 0, z: 5, yaw: 0 };
    const ctx = {
      use: (n) => (n === 'physics' ? provider : undefined),
      quality: () => opt.quality || 'mid',
      player: { getPose: () => pose },
      xr: { presenting: () => !!opt.xr },
      catalog: { items },
      deps: { imageUrl: () => '/img' },
      loadTexture: vi.fn(async () => new Texture()),
    };
    const out = [];
    const prefs = { film: opt.film !== false };
    const core = {
      ctx, frame: createFrame(layout), send: vi.fn((m) => { out.push(m); return true; }), me: () => ({ c, k: 'k' + c }), cap: () => !opt.nocap, active: () => true,
      prefs: () => prefs, now: clock,
    };
    const part = createPhys(core);
    const cl = { c, world, statics, provider, part, ctx, core, out, pose, added, layout };
    clients.push(cl);
    return cl;
  }

  /** Nachrichten eines Clients durch den Fake-Vergeber schicken; Rückgabe: Ereignisse je Empfänger. */
  function relay() {
    for (const cl of clients) {
      const msgs = cl.out.splice(0);
      for (const m of msgs) {
        const ev = [];
        const po = (i, e) => ({ t: 'po', i, o: e.o, g: e.g, h: 0 });
        if (m.t === 'pc') { // wie charts-worker/src/mp/phys.js: Einträge bleiben nach der Freigabe (o=0, g bleibt), g zählt je Vergabe
          let e = srv.owners.get(m.i);
          if (!e) { e = { o: cl.c, g: 1, at: T }; srv.owners.set(m.i, e); ev.push(po(m.i, e)); } else if (e.o === cl.c) { /* nichts */ } else if (e.o && T - e.at < 250) ev.push(po(m.i, e)); else {
            e.o = cl.c; e.g = e.g >= 65535 ? 1 : e.g + 1; e.at = T; ev.push(po(m.i, e));
          }
          deliver(null, ev);
        } else if (m.t === 'ps') {
          const ok = m.l.filter((e) => { const o = srv.owners.get(e[0]); return o && o.o === cl.c && o.g === e[1]; });
          const fwd = [];
          if (ok.length) deliver(cl, [{ t: 'ps', c: cl.c, l: ok }]);
          for (const e of ok) if (e[12] === 1) { const o = srv.owners.get(e[0]); o.o = 0; fwd.push(po(e[0], o)); }
          if (fwd.length) deliver(null, fwd);
        } else if (m.t === 'pn') {
          srv.owners.set(m.i, { o: cl.c, g: 1, at: T, th: true });
          deliver(cl, [{ t: 'pn', c: cl.c, i: m.i, it: m.it, q: m.q }]);
        } else if (m.t === 'px') {
          srv.owners.delete(m.i);
          deliver(cl, [{ t: 'px', i: m.i }]);
        }
      }
    }
  }
  function deliver(from, ev) { for (const cl of clients) if (cl !== from) cl.part.ev({ t: 'b', s: T, ev }); }
  /** Zeit voran: Welten, Teile, Vergeber. */
  function run(sec, step = 1 / 60) {
    const n = Math.round(sec / step);
    for (let i = 0; i < n; i++) {
      T += step * 1000;
      for (const cl of clients) { cl.world.step(step); cl.part.tick(step); }
      relay();
    }
  }
  const join = (cl) => cl.part.welcome({ t: 'wl', c: cl.c, cf: { pr: 8, ph: 8 }, po: [], pr: [] });
  return { mk, run, relay, srv, clients, join, deliver, now: clock, advance: (ms) => { T += ms; } };
}

const L0 = { w: 12.5, d: 18 };

describe('net/phys: Besitzer-Prinzip mit zwei Clients', () => {
  it('Anstoß: A beansprucht (pc), simuliert, sendet ps; B bekommt die Bewegung, am Ende sind beide gleich und B ist wieder lokal', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const B = sim.mk(2, L0);
    sim.join(A); sim.join(B);
    const ca = A.statics.hoopBall; const cb = B.statics.hoopBall;
    A.world.impulse(ca, { x: 3, y: 2, z: 0 });
    expect(A.out.find((m) => m.t === 'pc')).toEqual({ t: 'pc', i: 'hoopBall', g: 0 });
    expect(ca.netRemote).toBe(false);
    sim.relay();
    sim.run(0.5);
    expect(cb.netRemote).toBe(true); // B zeigt nur an
    expect(cb.pos.x).toBeGreaterThan(6.1);
    sim.run(14);
    expect(ca.sleeping).toBe(true);
    expect(cb.sleeping).toBe(true);
    expect(cb.netRemote).toBe(false); // po o=0
    expect(Math.hypot(ca.pos.x - cb.pos.x, ca.pos.z - cb.pos.z)).toBeLessThan(0.02);
    expect(Math.abs(ca.pos.y - cb.pos.y)).toBeLessThan(0.02);
    expect(A.part.stats().owned).toBe(0);
  });
  it('B beansprucht nach der Ruhe neu (g zählt weiter), Spielstoß über playerPush erzeugt den Anspruch', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const B = sim.mk(2, L0);
    sim.join(A); sim.join(B);
    A.world.impulse(A.statics.hoopBall, { x: 1, y: 2, z: 0 });
    sim.relay();
    sim.run(6);
    B.out.length = 0;
    const bb = B.statics.hoopBall;
    // Spieler B läuft in den Ball
    B.world.setPlayer({ x: bb.pos.x - 0.35, z: bb.pos.z, y: 0, vx: 3, vz: 0 });
    B.world.step(DT);
    const pc = B.out.find((m) => m.t === 'pc');
    expect(pc).toBeTruthy();
    expect(pc.g).toBe(1);
    expect(bb.netRemote).toBe(false);
  });
  it('Ablehnung innerhalb der Haltezeit: B stellt keinen Anspruch; kommt po mit fremdem Besitzer nach einem Anspruch, wird B wieder fremdgesteuert', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const B = sim.mk(2, L0);
    sim.join(A); sim.join(B);
    A.world.impulse(A.statics.hoopBall, { x: 3, y: 2, z: 0 });
    sim.relay();
    sim.run(0.1);
    const bb = B.statics.hoopBall;
    expect(bb.netRemote).toBe(true);
    B.out.length = 0;
    B.world.impulse(bb, { x: 0, y: 1, z: 1 });
    expect(B.out.filter((m) => m.t === 'pc')).toHaveLength(0); // Haltezeit 250 ms läuft noch (po kam bei T)
    sim.advance(300);
    B.world.impulse(bb, { x: 0, y: 1, z: 1 });
    expect(B.out.filter((m) => m.t === 'pc')).toHaveLength(1);
    expect(bb.netRemote).toBe(false); // optimistisch
    // der Vergeber lehnt ab (Besitzer hält): po mit A
    B.part.ev({ t: 'b', s: sim.now(), ev: [{ t: 'po', i: 'hoopBall', o: 1, g: 5, h: 1 }] });
    expect(bb.netRemote).toBe(true);
  });
  it('Stoßen, Ruhe, erneut Stoßen: die zweite Bewegung kommt wieder bei B an (g zählt weiter)', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const B = sim.mk(2, L0);
    sim.join(A); sim.join(B);
    A.world.impulse(A.statics.hoopBall, { x: 2, y: 2, z: 0 });
    sim.relay();
    sim.run(14);
    expect(A.statics.hoopBall.sleeping).toBe(true);
    expect(sim.srv.owners.get('hoopBall')).toMatchObject({ o: 0, g: 1 });
    const x1 = B.statics.hoopBall.pos.x;
    A.world.impulse(A.statics.hoopBall, { x: -2, y: 2, z: 0 });
    sim.relay();
    expect(sim.srv.owners.get('hoopBall')).toMatchObject({ o: 1, g: 2 });
    sim.run(0.6);
    expect(B.statics.hoopBall.netRemote).toBe(true);
    expect(B.statics.hoopBall.pos.x).toBeLessThan(x1 - 0.05);
    sim.run(14);
    expect(Math.hypot(A.statics.hoopBall.pos.x - B.statics.hoopBall.pos.x, A.statics.hoopBall.pos.z - B.statics.hoopBall.pos.z)).toBeLessThan(0.02);
  });
  it('Ablehnung mit unverändertem g (kleiner als der optimistische Wert) schaltet auf fremdgesteuert zurück', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const B = sim.mk(2, L0);
    sim.join(A); sim.join(B);
    A.world.impulse(A.statics.hoopBall, { x: 2, y: 2, z: 0 });
    sim.relay();
    sim.run(14); // Besitz frei, g = 1
    A.world.impulse(A.statics.hoopBall, { x: 1, y: 2, z: 0 }); // g = 2
    sim.relay();
    sim.advance(400);
    const bb = B.statics.hoopBall;
    B.out.length = 0;
    B.world.impulse(bb, { x: 0, y: 1, z: 1 });
    expect(B.out.find((m) => m.t === 'pc').g).toBe(2); // zuletzt gesehen
    expect(bb.netRemote).toBe(false);
    B.part.ev({ t: 'b', s: sim.now(), ev: [{ t: 'po', i: 'hoopBall', o: 1, g: 2, h: 0 }] }); // Antwort des DO: Besitzer unverändert
    expect(bb.netRemote).toBe(true);
    expect(B.part.stats().owned).toBe(0);
  });
  it('Neustart des DO (Tabelle leer, g beginnt bei 1): die Vergabe mit kleinerem g wird bestätigt, ps trägt es, A sieht die Bewegung', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const B = sim.mk(2, L0);
    sim.join(A); sim.join(B);
    for (let i = 0; i < 2; i++) { A.world.impulse(A.statics.hoopBall, { x: 1, y: 2, z: 0 }); sim.relay(); sim.run(14); }
    expect(sim.srv.owners.get('hoopBall').g).toBe(2);
    sim.srv.owners.clear(); // Hibernation/Neustart
    sim.advance(500);
    B.out.length = 0;
    const bb = B.statics.hoopBall;
    B.world.impulse(bb, { x: 0, y: 2, z: 2 });
    expect(B.out.find((m) => m.t === 'pc').g).toBe(2);
    sim.relay();
    expect(sim.srv.owners.get('hoopBall')).toMatchObject({ o: 2, g: 1 });
    expect(B.part.stats().pending).toBe(0); // bestätigt trotz kleinerem g
    const z0 = A.statics.hoopBall.pos.z;
    sim.run(0.8);
    expect(A.statics.hoopBall.netRemote).toBe(true);
    expect(Math.abs(A.statics.hoopBall.pos.z - z0)).toBeGreaterThan(0.05);
  });
  it('Anspruch ohne Antwort wird nach PEND_MS zurückgenommen, danach Pause', () => {
    const sim = makeSim();
    const B = sim.mk(2, L0);
    sim.join(B);
    B.world.impulse(B.statics.hoopBall, { x: 1, y: 2, z: 0 });
    expect(B.part.stats().pending).toBe(1);
    sim.advance(L.PEND_MS + 50);
    B.part.tick(0.02);
    expect(B.part.stats().pending).toBe(0);
    const n = B.out.filter((m) => m.t === 'pc').length;
    B.part.tick(0.2); // Kettenreaktion darf in der Pause nicht sofort erneut anfragen
    expect(B.out.filter((m) => m.t === 'pc').length).toBe(n);
  });
  it('Kettenreaktion: ein vom lokalen Stoß geweckter Nachbar (Dose) wird mit beansprucht, höchstens 3 je Durchlauf', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0);
    sim.join(A);
    const bin = A.statics.binL; const can = A.statics.pyr0;
    A.world.wake(bin); A.world.wake(can); A.world.wake(A.statics.hoopBall);
    A.part.tick(0.11);
    const ids = A.out.filter((m) => m.t === 'pc').map((m) => m.i).sort();
    expect(ids).toEqual(['binL', 'hoopBall', 'pyr0']);
  });
  it('Fremde Welt-Unterschiede: B mit W=28/D=30 sieht die Bewegung an der abgebildeten Stelle (Netzrahmen)', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const B = sim.mk(2, { w: 28, d: 30 });
    sim.join(A); sim.join(B);
    const ba = A.statics.hoopBall; const bb = B.statics.hoopBall;
    A.world.impulse(ba, { x: 2, y: 2, z: 1 });
    sim.relay();
    sim.run(14);
    expect(ba.sleeping).toBe(true);
    const fa = createFrame(L0); const fb = createFrame({ w: 28, d: 30 });
    const r = fa.area(ba.pos.x, ba.pos.z, ba.pos.y);
    const net = fa.enc(ba.pos.x, ba.pos.y, ba.pos.z, r);
    const want = fb.dec(net[0], net[1], net[2], r);
    expect(Math.abs(bb.pos.x - want[0])).toBeLessThan(0.03);
    expect(Math.abs(bb.pos.z - want[2])).toBeLessThan(0.03);
  });
  it('Disconnect des Besitzers (ev l) gibt frei: B simuliert vom letzten Stand weiter', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const B = sim.mk(2, L0);
    sim.join(A); sim.join(B);
    A.world.impulse(A.statics.hoopBall, { x: 3, y: 3, z: 0 });
    sim.relay();
    sim.run(0.4);
    const bb = B.statics.hoopBall;
    expect(bb.netRemote).toBe(true);
    B.part.ev({ t: 'b', s: sim.now(), ev: [{ t: 'l', c: 1, r: 'x' }] });
    expect(bb.netRemote).toBe(false);
    expect(B.part.stats().tracks).toBe(0);
  });
  it('Besitzer verstummt (3 s kein ps, wach): Körper wird lokal freigegeben', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const B = sim.mk(2, L0);
    sim.join(A); sim.join(B);
    A.world.impulse(A.statics.hoopBall, { x: 3, y: 3, z: 0 });
    sim.relay();
    sim.run(0.3);
    const bb = B.statics.hoopBall;
    expect(bb.netRemote).toBe(true);
    sim.clients.splice(sim.clients.indexOf(A), 1); // A sendet nichts mehr
    sim.run(4.5);
    expect(bb.netRemote).toBe(false);
  });
  it('welcome: po macht fremde Körper fremdgesteuert, pr setzt Ruhelagen (schlafend) und löscht frühere Tabellen', () => {
    const sim = makeSim();
    const B = sim.mk(2, L0);
    const bb = B.statics.hoopBall;
    const f = createFrame(L0);
    const home = { ...bb.pos };
    const net = f.enc(9, 0.12, 10, f.area(9, 10, 0.12));
    B.part.welcome({ t: 'wl', c: 2, cf: { ph: 5 }, po: [['pyr0', 1, 2, 0]], pr: [['hoopBall', net[0], net[1], net[2], 50, 0, 0, 0]] });
    expect(B.statics.pyr0.netRemote).toBe(true);
    expect(bb.sleeping).toBe(true);
    expect(bb.pos.x).toBeCloseTo(9, 1);
    expect(bb.pos.x).not.toBeCloseTo(home.x, 1);
    expect(bb.yaw).toBeCloseTo(0.5, 2);
    B.part.welcome({ t: 'wl', c: 2, po: [], pr: [] });
    expect(B.statics.pyr0.netRemote).toBe(false);
  });
  it('Reset-Gate: fremdgesteuert nie; frei → erst pc, false; nach po o=me true', () => {
    const sim = makeSim();
    const B = sim.mk(2, L0);
    sim.join(B);
    const bb = B.statics.hoopBall;
    expect(B.part.gate(bb)).toBe(false);
    expect(B.out.find((m) => m.t === 'pc')).toBeTruthy();
    B.part.ev({ t: 'b', s: 1, ev: [{ t: 'po', i: 'hoopBall', o: 2, g: 1, h: 0 }] });
    expect(B.part.gate(bb)).toBe(true);
    B.part.ev({ t: 'b', s: 1, ev: [{ t: 'po', i: 'pyr0', o: 1, g: 4, h: 0 }] });
    expect(B.part.gate(B.statics.pyr0)).toBe(false);
    expect(B.statics.pyr0.netRemote).toBe(true);
  });
  it('Reset nach dem Anspruch: ps s=1 an der Heimposition, danach frei', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const B = sim.mk(2, L0);
    sim.join(A); sim.join(B);
    const ba = A.statics.hoopBall;
    ba.pos.x += 3; // verschoben
    expect(A.part.gate(ba)).toBe(false);
    sim.relay();
    expect(A.part.gate(ba)).toBe(true);
    A.world.reset(ba);
    A.part.tick(0.2);
    const ps = A.out.find((m) => m.t === 'ps');
    expect(ps.l[0][12]).toBe(1);
    expect(A.part.stats().owned).toBe(0);
  });
  it('gehaltenes Ding: Anspruch beim Aufheben, ps zeigt es an der Hand statt am Platz', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const B = sim.mk(2, L0);
    sim.join(A); sim.join(B);
    const ba = A.statics.hoopBall;
    A.world.setHeld(ba, true);
    expect(A.out.find((m) => m.t === 'pc')).toBeTruthy();
    sim.relay();
    A.pose.x = 5; A.pose.z = 5; A.pose.yaw = 0;
    sim.run(0.6);
    const bb = B.statics.hoopBall;
    expect(bb.netRemote).toBe(true);
    expect(bb.pos.y).toBeGreaterThan(0.9);
    expect(Math.hypot(bb.pos.x - 5, bb.pos.z - 5)).toBeLessThan(0.7);
    expect(ba.pos.y).toBeLessThan(0.2); // eigener Körper bleibt unverändert
  });
  it('5 s gehalten, dann geworfen: Besitz bleibt beim Halter, Empfänger geben nicht frei, der Wurf kommt an', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const B = sim.mk(2, L0);
    sim.join(A); sim.join(B);
    const ba = A.statics.hoopBall;
    A.world.setHeld(ba, true);
    sim.relay();
    sim.run(5);
    const bb = B.statics.hoopBall;
    expect(bb.netRemote).toBe(true);
    expect(sim.srv.owners.get('hoopBall')).toMatchObject({ o: 1 });
    expect(B.part.stats().owned).toBe(0); // die Kettenreaktion von B hat sich nichts genommen
    expect(bb.pos.y).toBeGreaterThan(0.9);
    ba.pos.x = 5; ba.pos.y = 1.4; ba.pos.z = 5;
    ba.vel.x = 2; ba.vel.y = 1; ba.vel.z = 0;
    A.world.setHeld(ba, false);
    sim.run(1);
    expect(bb.pos.x).toBeGreaterThan(5.3);
    sim.run(30);
    expect(ba.sleeping).toBe(true);
    expect(Math.hypot(ba.pos.x - bb.pos.x, ba.pos.z - bb.pos.z)).toBeLessThan(0.02);
  });
  it('Fremdes po während man hält: Körper bleibt in der Hand, beim Loslassen wird neu beansprucht', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0);
    sim.join(A);
    const ba = A.statics.hoopBall;
    A.world.setHeld(ba, true);
    A.part.ev({ t: 'b', s: sim.now(), ev: [{ t: 'po', i: 'hoopBall', o: 2, g: 9, h: 0 }] });
    expect(ba.netRemote).toBe(false);
    expect(A.part.stats().owned).toBe(0);
    sim.advance(500); // Ablehnungspause (400 ms) nach dem verlorenen Anspruch
    A.out.length = 0;
    A.world.setHeld(ba, false);
    expect(A.out.find((m) => m.t === 'pc')).toEqual({ t: 'pc', i: 'hoopBall', g: 9 });
  });
  it('stop(): alles lokal, keine Weltereignisse mehr, Tabellen leer; ohne Fähigkeit/ohne Verbindung passiert nichts', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const B = sim.mk(2, L0);
    sim.join(A); sim.join(B);
    A.world.impulse(A.statics.hoopBall, { x: 3, y: 3, z: 0 });
    sim.relay();
    sim.run(0.3);
    expect(B.statics.hoopBall.netRemote).toBe(true);
    B.part.stop();
    expect(B.statics.hoopBall.netRemote).toBe(false);
    B.out.length = 0;
    B.world.impulse(B.statics.pyr0, { x: 1, y: 1, z: 0 });
    expect(B.out).toHaveLength(0);
    const C = sim.mk(3, L0, { nocap: true });
    sim.join(C);
    C.world.impulse(C.statics.pyr0, { x: 1, y: 1, z: 0 });
    C.part.tick(0.5);
    expect(C.out).toHaveLength(0);
    expect(C.statics.pyr0.netRemote).toBe(false);
  });
  it('Frame-Pflicht: gesendete Nachrichten bestehen normalizeOut unverändert', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0);
    sim.join(A);
    A.world.impulse(A.statics.hoopBall, { x: 3, y: 3, z: 0 });
    A.world.impulse(A.statics.pyr0, { x: 1, y: 1, z: 0 });
    A.part.tick(0.2);
    expect(A.out.length).toBeGreaterThan(1);
    for (const m of A.out) expect(normalizeOut(m)).toEqual(m);
  });
});

describe('net/phys: geworfene Hüllen', () => {
  const spawnTape = (cl, id = HEX, extra = {}) => cl.provider.spawn({ kind: 'tape', shape: 'box', size: [0.14, 0.2, 0.03], rr: 0.1, mass: 0.2, owner: 'player', tipLocal: true, pos: { x: 4, y: 1.4, z: 6 }, vel: { x: 2, y: 3, z: 1 }, spin: 4, data: { tapeId: id }, ...extra });

  it('Wurf: pn mit Item-ID nur bei Film-Flag; Netz-Id "<c>.<n>" im Körper; px beim Entfernen', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const A2 = sim.mk(3, L0, { film: false });
    sim.join(A); sim.join(A2);
    const b = spawnTape(A);
    const pn = A.out.find((m) => m.t === 'pn');
    expect(pn).toMatchObject({ t: 'pn', i: '1.1', it: HEX });
    expect(pn.q).toHaveLength(8);
    expect(b.data.net).toBe('1.1');
    b.remove();
    expect(A.out.find((m) => m.t === 'px')).toEqual({ t: 'px', i: '1.1' });
    // nach einem Neuaufbau (stop) gelten alte Netz-Ids nicht mehr: kein px
    const b2 = spawnTape(A);
    A.out.length = 0;
    A.part.stop();
    b2.remove();
    expect(A.out).toHaveLength(0);
    expect(b2.data.net).toBeUndefined();
    sim.join(A);
    spawnTape(A2);
    expect(A2.out.find((m) => m.t === 'pn').it).toBeNull();
    for (const m of [...A.out, ...A2.out]) expect(normalizeOut(m)).toEqual(m);
  });
  it('Empfänger: Hülle fremdgesteuert, fliegt wie beim Werfer, bleibt nicht in throw-Listen, px entfernt sie samt Mesh', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const B = sim.mk(2, L0);
    sim.join(A); sim.join(B);
    const ba = spawnTape(A);
    sim.relay();
    expect(B.part.stats().tapes).toBe(1);
    const bb = B.provider.byNetId('1.1');
    expect(bb).toBeTruthy();
    expect(bb.netRemote).toBe(true);
    expect(bb.mesh.name).toBe('lfx-mp-tape');
    expect(B.added).toHaveLength(1);
    sim.run(3);
    expect(Math.hypot(bb.pos.x - ba.pos.x, bb.pos.z - ba.pos.z)).toBeLessThan(0.05);
    expect(bb.sleeping).toBe(ba.sleeping);
    ba.remove();
    sim.relay();
    expect(B.part.stats().tapes).toBe(0);
    expect(bb.removed).toBe(true);
    expect(B.provider.byNetId('1.1')).toBeNull();
  });
  it('Rechte-Filter: ohne Katalogtreffer neutral (1 Mesh), mit Treffer Cover-Fläche; ohne Item-ID neutrale Box', async () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const Bn = sim.mk(2, L0); const Bc = sim.mk(3, L0, { catalog: true });
    for (const c of [A, Bn, Bc]) sim.join(c);
    spawnTape(A);
    sim.relay();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    const inner = (cl) => cl.provider.byNetId('1.1').mesh.children[0];
    const count = (g) => { let n = 0; g.traverse((o) => { if (o.isMesh) n++; }); return n; };
    expect(count(inner(Bn))).toBe(1);
    expect(count(inner(Bc))).toBe(2);
    const A2 = sim.mk(4, L0, { film: false });
    sim.join(A2);
    spawnTape(A2);
    sim.relay();
    expect(count(Bc.provider.byNetId('4.1').mesh.children[0])).toBe(1); // it = null
  });
  it('low: neutral und höchstens 2 sichtbar; sonst 4; insgesamt höchstens 6 (älteste fliegt raus)', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const Bl = sim.mk(2, L0, { quality: 'low' }); const Bm = sim.mk(3, L0, { catalog: true });
    for (const c of [A, Bl, Bm]) sim.join(c);
    for (let i = 0; i < 3; i++) spawnTape(A);
    sim.relay();
    const vis = (cl, from, to) => Array.from({ length: to - from + 1 }, (_, i) => cl.provider.byNetId(`1.${from + i}`).mesh.children[0].visible);
    expect(vis(Bl, 1, 3)).toEqual([false, true, true]);
    expect(vis(Bm, 1, 3)).toEqual([true, true, true]);
    for (let i = 0; i < 5; i++) spawnTape(A);
    sim.relay();
    expect(Bm.part.stats().tapes).toBe(L.MAX_REMOTE_TAPES);
    expect(Bm.provider.byNetId('1.1')).toBeNull();
    expect(Bm.provider.byNetId('1.8')).toBeTruthy();
    expect(vis(Bm, 5, 8)).toEqual([true, true, true, true]);
    expect(Bm.provider.byNetId('1.4').mesh.children[0].visible).toBe(false);
  });
  it('Werfer verlässt (ev l): seine Hüllen verschwinden; stop() entfernt alle fremden Hüllen', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const B = sim.mk(2, L0);
    sim.join(A); sim.join(B);
    spawnTape(A); spawnTape(A);
    sim.relay();
    expect(B.part.stats().tapes).toBe(2);
    B.part.ev({ t: 'b', s: 1, ev: [{ t: 'l', c: 1 }] });
    expect(B.part.stats().tapes).toBe(0);
    spawnTape(A);
    sim.relay();
    expect(B.part.stats().tapes).toBe(1);
    B.part.stop();
    expect(B.part.stats().tapes).toBe(0);
    expect(B.world.bodies.filter((b) => b.kind === 'tape')).toHaveLength(0);
  });
  it('Fremde Hülle anstoßen: Anspruch, danach simuliert B sie selbst und sendet ps', () => {
    const sim = makeSim();
    const A = sim.mk(1, L0); const B = sim.mk(2, L0);
    sim.join(A); sim.join(B);
    spawnTape(A);
    sim.relay();
    sim.advance(400);
    const bb = B.provider.byNetId('1.1');
    B.world.impulse(bb, { x: 0, y: 1, z: -2 });
    expect(B.out.find((m) => m.t === 'pc')).toEqual({ t: 'pc', i: '1.1', g: 1 });
    expect(bb.netRemote).toBe(false);
  });
  it('eigene Hülle eines Fremden (ps ohne vorheriges pn) wird ignoriert; ps vom falschen Besitzer ebenfalls', () => {
    const sim = makeSim();
    const B = sim.mk(2, L0);
    sim.join(B);
    const f = createFrame(L0);
    const e = L.encodeEntry(f, 'hoopBall', 4, { x: 7, y: 0.12, z: 6, vx: 1, vy: 0, vz: 0, yaw: 0, tip: 0, ax: 0, az: 0, s: 0 });
    B.part.ev({ t: 'b', s: 1, ev: [{ t: 'ps', c: 1, l: [['nix.1', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]] }] });
    expect(B.part.stats().tracks).toBe(0);
    B.part.ev({ t: 'b', s: 1, ev: [{ t: 'po', i: 'hoopBall', o: 1, g: 4, h: 0 }, { t: 'ps', c: 3, l: [e] }] });
    expect(B.part.stats().tracks).toBe(0); // c=3 ist nicht der Besitzer
    B.part.ev({ t: 'b', s: 1, ev: [{ t: 'ps', c: 1, l: [e] }] });
    expect(B.part.stats().tracks).toBe(1);
  });
});
