// @vitest-environment jsdom
// VIDEOTHEK LENZ · 1.18.0 Modul gang (modules/gang.js): Bereiche, Spawn, Figuren-Budget (low ≤ 2, reserve 'gang'), Ablauf ansprechen → drohen → angreifen,
// Treffer auf Rowdys, Flucht (Entdeckung gang-flee), K.O.-Spruch, VR, und die Mehrspieler-Rollen (lokal, Führer mit gs, Mitläufer mit gh) gegen einen Fake-net.fight.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Object3D, Scene, PerspectiveCamera, Vector3 } from 'three';
import gang, { gangEnv, rowdyLook, STALE_S, LEAD_NEAR_M, HIT_PRIO } from '../src/js/store3d/modules/gang.js';
import { buildCity } from '../src/js/store3d/world/city.js';
import { gangAreaOk } from '../src/js/store3d/npc/gang-logic.js';
import { createFrame } from '../src/js/store3d/net/frame.js';
import { encodeGs, decodeGs } from '../src/js/store3d/net/gang.js';

const W = 12.5;
const D = 18;
const city = buildCity({ w: W, d: D, door: { x0: W / 2 - 1.1, x1: W / 2 + 1.1 } });
const layout = { w: W, d: D, city };
const frame = createFrame(layout);

function fakeFig(o) {
  const root = new Object3D();
  root.visible = true;
  if (o.pos) root.position.set(o.pos.x, o.pos.y || 0, o.pos.z);
  const f = { root, look: o.look, disposed: false, setAnim: vi.fn(), hitReact: vi.fn(), dispose: vi.fn(() => { f.disposed = true; }) };
  return f;
}

function setup(o = {}) {
  const st = { xr: false, quality: o.quality || 'mid', pose: { x: 0, z: 0, y: 0 }, protectedNow: false, tod: o.tod || 'night' };
  const providers = {};
  const actions = [];
  const listeners = new Map();
  const figs = [];
  const said = [];
  const bubbles = [];
  let koFn = null;
  providers.npc = { figure: vi.fn((fo) => { const f = fakeFig(fo); figs.push(f); return f; }), reserve: vi.fn(), say: vi.fn((h, t) => bubbles.push(t)) };
  providers.weather = { tod: st.tod };
  providers.city = { visible: () => ({ street: true, yard: true, shopShell: true }) };
  providers.areas = { at: () => 'yard' };
  providers.fight = { protected: () => st.protectedNow, hitPlayer: vi.fn(() => !st.protectedNow), onKO: vi.fn((fn) => { koFn = fn; return () => { koFn = null; }; }) };
  providers.discover = { found: vi.fn(() => true) };
  providers.cashier = { speaker: vi.fn(() => ({ say: vi.fn((t) => { said.push(t); return Promise.resolve(o.spoken === false ? 'bubble' : 'spoken'); }), cancel: vi.fn(), release: vi.fn() })) };
  const camera = new PerspectiveCamera(70, 1.5, 0.05, 90);
  const ctx = {
    layout, opts: { debug: true, gang: o.n ?? 2, ...(o.opts || {}) }, scene: new Scene(), camera,
    isTouch: false, quality: () => st.quality, xr: { presenting: () => st.xr },
    player: { getPose: () => st.pose },
    provide: (n, impl) => { providers[n] = impl; return () => { if (providers[n] === impl) delete providers[n]; }; },
    use: (n) => providers[n],
    on: (ev, fn) => { const l = listeners.get(ev) || []; l.push(fn); listeners.set(ev, l); return () => { const i = l.indexOf(fn); if (i >= 0) l.splice(i, 1); }; },
    input: { onAction: vi.fn((n, fn, op) => { const a = { n, fn, op }; actions.push(a); return () => { const i = actions.indexOf(a); if (i >= 0) actions.splice(i, 1); }; }) },
  };
  const h = gang.init(ctx);
  const g = providers.gang;
  const enter = () => { for (const fn of listeners.get('enter') || []) fn(); };
  const run = (steps, dt = 0.1) => { for (let i = 0; i < steps; i++) h.update(dt, 0); };
  const putPlayerNear = (k = 0, dx = 1.6) => {
    const m = g.members()[k];
    st.pose = { x: m.pos.x + dx, z: m.pos.z, y: 0 };
    camera.position.set(st.pose.x, 1.6, st.pose.z);
  };
  return { ctx, h, g, st, providers, actions, figs, said, bubbles, enter, run, putPlayerNear, koFn: () => koFn };
}

const hitAction = (t) => t.actions.find((a) => a.n === 'hit');
const aimAt = (t, k = 0) => {
  const m = t.g.members()[k];
  const p = t.st.pose;
  const dx = m.pos.x - p.x; const dz = m.pos.z - p.z; const l = Math.hypot(dx, dz) || 1;
  return { origin: new Vector3(p.x, 1.6, p.z), dir: new Vector3(dx / l, 0, dz / l) };
};

describe('modules/gang: Stub und Bereiche', () => {
  it('ohne Stadtlayout (Test-Ctx) bleibt der Provider ein No-op', () => {
    const m = {};
    const h = gang.init({ provide: (n, i) => { m[n] = i; return () => { delete m[n]; }; } });
    expect(m.gang.active()).toBe(false);
    expect(m.gang.members()).toEqual([]);
    expect(m.gang.hit(0, 'hand')).toBe(false);
    h.dispose();
    expect(m.gang).toBeUndefined();
  });

  it('gangEnv: Gasse/Hof/Feuertreppe erlaubt, Laden und Tür verboten, Startpunkte nie im Laden und immer im erlaubten Bereich', () => {
    const e = gangEnv(city);
    expect(e.allowed).toHaveLength(3);
    expect(e.spots.length).toBeGreaterThan(10);
    const store = city.zones.store.rect;
    for (const s of e.spots) {
      expect(gangAreaOk(s.x, s.z, e.allowed, e.forbidden)).toBe(true);
      expect(s.x > store.x0 && s.x < store.x1 && s.z > store.z0 && s.z < store.z1).toBe(false);
    }
    const mid = { x: (store.x0 + store.x1) / 2, z: (store.z0 + store.z1) / 2 };
    expect(gangAreaOk(mid.x, mid.z, e.allowed, e.forbidden)).toBe(false);
    const door = city.zones.doorway.rect;
    expect(gangAreaOk((door.x0 + door.x1) / 2, (door.z0 + door.z1) / 2, e.allowed, e.forbidden)).toBe(false);
    expect(gangEnv(null)).toBeNull();
  });

  it('rowdyLook: deterministisch, derb (Mütze, dunkle Jacke), nie ein Freischalt-Teil (kein look v2)', () => {
    expect(rowdyLook(5, 1)).toEqual(rowdyLook(5, 1));
    expect(rowdyLook(5, 1)).not.toEqual(rowdyLook(5, 2));
    const l = rowdyLook(9, 0);
    expect(l.v).toBeUndefined();
    expect(['beanie', 'cap']).toContain(l.hat);
    expect(Math.max(...l.top)).toBeLessThan(0.2);
    expect(l.bag).toBeNull();
  });
});

describe('modules/gang: Spawn, Figuren, Budget', () => {
  it('Nacht: 2 Rowdys, Figuren über npc.figure, npc.reserve(2, gang); dispose gibt frei', () => {
    const t = setup({ n: 2 });
    t.run(2);
    expect(t.g.active()).toBe(true);
    expect(t.g.members()).toHaveLength(2);
    t.putPlayerNear(0, 3);
    t.run(2);
    expect(t.providers.npc.figure).toHaveBeenCalledTimes(2);
    expect(t.providers.npc.reserve).toHaveBeenLastCalledWith(2, 'gang');
    expect(t.g.members().every((m) => m.handle && m.hp === 60)).toBe(true);
    t.h.dispose();
    expect(t.providers.npc.reserve).toHaveBeenLastCalledWith(0, 'gang');
    expect(t.providers.gang).toBeUndefined();
    expect(t.actions.find((a) => a.n === 'hit')).toBeUndefined();
    expect(t.figs.every((f) => f.disposed)).toBe(true);
  });

  it('low: höchstens 2 Rowdys (auch bei 3 geplanten); mid: 3', () => {
    const lo = setup({ n: 3, quality: 'low' });
    lo.run(2);
    expect(lo.g.members()).toHaveLength(2);
    const mid = setup({ n: 3, quality: 'mid' });
    mid.run(2);
    expect(mid.g.members()).toHaveLength(3);
    mid.putPlayerNear(0, 3);
    mid.run(2);
    expect(mid.providers.npc.reserve).toHaveBeenLastCalledWith(3, 'gang');
  });

  it('fern der Bande keine Figuren (die Logik besteht weiter)', () => {
    const t = setup({ n: 3 });
    t.st.pose = { x: 200, z: 200, y: 0 };
    t.ctx.camera.position.set(200, 1.6, 200);
    t.run(5);
    expect(t.providers.npc.figure).not.toHaveBeenCalled();
    expect(t.g.members()).toHaveLength(3); // die Logik besteht weiter
  });

  it('VR: keine Bande, keine Figuren, reserve 0', () => {
    const t = setup({ n: 2 });
    t.run(2);
    t.putPlayerNear(0, 3);
    t.run(2);
    t.st.xr = true;
    t.run(2);
    expect(t.g.active()).toBe(false);
    expect(t.providers.npc.reserve).toHaveBeenLastCalledWith(0, 'gang');
    expect(hitAction(t).fn({ weapon: 'hand', origin: new Vector3(), dir: new Vector3(0, 0, -1) })).toBe(false);
  });

  it('?npc=0 schaltet die Bande ab', () => {
    const t = setup({ opts: { devFlags: { npc: false } } });
    expect(t.g.active()).toBe(false);
    expect(t.g.members()).toEqual([]);
    t.h.dispose();
    expect(t.providers.gang).toBeUndefined();
  });
});

describe('modules/gang: Ablauf', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('vor „enter“ greift niemand an; danach ansprechen, drohen (Pose), angreifen: hitPlayer src gang mit Richtung', () => {
    const t = setup({ n: 1 });
    t.run(2);
    t.putPlayerNear(0, 5);
    t.run(40);
    expect(t.providers.fight.hitPlayer).not.toHaveBeenCalled();
    expect(t.g.members()[0].st).toBe('idle');
    t.enter();
    t.run(400);
    expect(t.said.length).toBeGreaterThanOrEqual(2); // ansprechen + drohen (+ angreifen)
    expect(t.providers.cashier.speaker).toHaveBeenCalledTimes(1);
    const anims = t.figs[0].setAnim.mock.calls.map((c) => c[0]);
    expect(anims).toContain('sleeves');
    expect(anims).toContain('threat');
    expect(anims).toContain('swing');
    const call = t.providers.fight.hitPlayer.mock.calls[0][0];
    expect(call).toMatchObject({ src: 'gang', dmg: 8 });
    expect(Math.hypot(call.knock.x, call.knock.z)).toBeCloseTo(1, 3);
    expect(call.from).toMatchObject({ x: expect.any(Number) });
  });

  it('Schutz (fight.protected) und Bereich: kein Angriff; Spieler im Laden bleibt unbehelligt', () => {
    const t = setup({ n: 1 });
    t.enter();
    t.run(2);
    t.putPlayerNear(0, 3);
    t.st.protectedNow = true;
    t.run(300);
    expect(t.providers.fight.hitPlayer).not.toHaveBeenCalled();
    t.st.protectedNow = false;
    t.st.pose = { x: W / 2, z: D / 2, y: 0 };
    t.run(300);
    expect(t.providers.fight.hitPlayer).not.toHaveBeenCalled();
    const m = t.g.members()[0];
    expect(gangAreaOk(m.pos.x, m.pos.z, gangEnv(city).allowed, gangEnv(city).forbidden)).toBe(true);
  });

  it('Sprüche: spricht die Regie nicht („bubble“), erscheint die Blase über der Figur', async () => {
    const t = setup({ n: 1, spoken: false });
    t.enter();
    t.run(2);
    t.putPlayerNear(0, 4);
    t.run(300);
    await Promise.resolve();
    await Promise.resolve();
    expect(t.bubbles.length).toBeGreaterThan(0);
  });

  it('Hit-Aktion (Prio 25): trifft im Kegel, hitReact, Reichweite je Waffe; Laser und Ferne nicht', () => {
    const t = setup({ n: 1 });
    t.run(2);
    t.putPlayerNear(0, 1.2);
    t.run(2);
    expect(hitAction(t).op).toEqual({ prio: HIT_PRIO });
    expect(hitAction(t).fn({ weapon: 'laser', ...aimAt(t) })).toBe(false);
    const ev = { weapon: 'hand', ...aimAt(t) };
    expect(hitAction(t).fn(ev)).toBe(true);
    expect(t.figs[0].hitReact).toHaveBeenCalled();
    expect(t.g.members()[0].hp).toBe(48); // hand 12
    expect(hitAction(t).fn(ev)).toBe(false); // Entprellung 0,25 s
    t.run(3);
    expect(hitAction(t).fn(ev)).toBe(true);
    t.st.pose = { x: t.st.pose.x + 8, z: t.st.pose.z, y: 0 };
    expect(hitAction(t).fn({ weapon: 'hand', ...aimAt(t) })).toBe(false); // zu weit
  });

  it('Prügel bis zur Flucht: Entdeckung gang-flee nur bei eigenen Treffern und wenn alle weg sind', () => {
    const t = setup({ n: 1 });
    t.enter();
    t.run(2);
    t.putPlayerNear(0, 1.2);
    t.run(2);
    for (let i = 0; i < 8 && t.g.members()[0].st !== 'flee' && t.g.members()[0].st !== 'beaten'; i++) {
      const p = t.g.members()[0].pos;
      t.st.pose = { x: p.x + 1.2, z: p.z, y: 0 };
      hitAction(t).fn({ weapon: 'belt', ...aimAt(t) });
      t.run(4);
    }
    t.run(2);
    expect(['flee', 'beaten']).toContain(t.g.members()[0].st);
    expect(t.providers.discover.found).toHaveBeenCalledWith('gang-flee');
    expect(t.providers.discover.found).toHaveBeenCalledTimes(1);
    expect(t.bubbles.length + t.said.length).toBeGreaterThan(0);
  });

  it('K.O. des Spielers: nächster Rowdy spricht rowdyWin, die Bande beruhigt sich', () => {
    const t = setup({ n: 1 });
    t.enter();
    t.run(2);
    t.putPlayerNear(0, 5);
    t.run(160);
    expect(['approach', 'taunt', 'threaten', 'attack']).toContain(t.g.members()[0].st);
    const before = t.said.length;
    t.koFn()();
    expect(t.said.length).toBe(before + 1);
    expect(t.g.members()[0].st).toBe('idle');
  });
});

describe('modules/gang: Mehrspieler (Fake net.fight)', () => {
  function fakeFight(o = {}) {
    const hs = new Map();
    const f = {
      state: { has: o.has !== false, leader: o.leader ?? null, me: o.me ?? 7, gen: 3 },
      sent: [],
      has: () => f.state.has,
      leader: () => f.state.leader,
      isLeader: () => f.state.leader !== null && f.state.leader === f.state.me,
      gen: () => f.state.gen,
      peerPos: (c) => (c === 9 ? { x: 0, y: 0, z: 0 } : null),
      send: vi.fn((type, p) => { f.sent.push({ type, p }); return o.sendOk !== false; }),
      on: (t, fn) => { const l = hs.get(t) || new Set(); l.add(fn); hs.set(t, l); return () => l.delete(fn); },
      emit: (t, e) => { for (const fn of [...(hs.get(t) || [])]) fn(e); },
      listeners: (t) => (hs.get(t) ? hs.get(t).size : 0),
    };
    return f;
  }
  const withNet = (t, f, peers = []) => { t.providers.net = { fight: f, active: () => true, serverNow: () => null, me: () => ({ c: f.state.me }), peers: () => peers }; };

  it('ohne Führer, aber mit Fähigkeit: Rolle lokal, in der Nähe fordert der Client die Führung an (höchstens alle 1,5 s)', () => {
    const t = setup({ n: 2 });
    const f = fakeFight();
    withNet(t, f);
    t.run(2);
    t.putPlayerNear(0, 3);
    t.run(30);
    expect(t.g.role()).toBe('local');
    const gcs = f.sent.filter((s) => s.type === 'gc');
    expect(gcs.length).toBeGreaterThanOrEqual(1);
    expect(gcs.length).toBeLessThanOrEqual(3);
    // weit weg: keine Anforderung
    const f2 = fakeFight();
    const u = setup({ n: 2 });
    withNet(u, f2);
    u.st.pose = { x: 500, z: 500, y: 0 };
    u.run(40);
    expect(f2.sent.filter((s) => s.type === 'gc')).toHaveLength(0);
    expect(LEAD_NEAR_M).toBeGreaterThan(20);
  });

  it('Führer: sendet gs mit Seed, Phase und allen Mitgliedern (≈6/s), Treffer eines Peers (gh) wirken, Peer-Ziel bekommt fh src 1', () => {
    const t = setup({ n: 2 });
    const f = fakeFight({ leader: 7, me: 7 });
    withNet(t, f, [{ c: 9, k: 'x', f: 1 }]);
    t.enter();
    t.run(2);
    expect(t.g.role()).toBe('leader');
    t.run(12);
    const gs = f.sent.filter((s) => s.type === 'gs');
    expect(gs.length).toBeGreaterThanOrEqual(5);
    expect(gs[0].p).toMatchObject({ g: 3, phase: 2, seed: 1 });
    expect(gs[0].p.members).toHaveLength(2);
    // gh eines Mitspielers
    const hp0 = t.g.members()[0].hp;
    t.putPlayerNear(0, 20);
    t.run(1);
    f.emit('gh', { c: 9, i: 0, w: 1 });
    expect(t.g.members()[0].hp).toBe(hp0 - 20); // Gürtel
    // Peer als Ziel: der Spieler selbst ist weit weg, der Peer steht beim Rowdy
    const m = t.g.members()[1];
    f.peerPos = () => ({ x: m.pos.x + 2, y: 0, z: m.pos.z });
    t.run(400);
    const fh = f.sent.filter((s) => s.type === 'fh');
    expect(fh.length).toBeGreaterThan(0);
    expect(fh[0].p).toMatchObject({ c: 9, w: 0, src: 1 });
    expect(Math.hypot(fh[0].p.dir.x, fh[0].p.dir.z)).toBeCloseTo(1, 3);
  });

  it('Führer ohne Figuren: der Hieb-Code a=6 im gs klingt ab (striking unabhängig von der Figur)', () => {
    const t = setup({ n: 2 });
    t.st.pose = { x: 200, z: 200, y: 0 };
    t.ctx.camera.position.set(200, 1.6, 200);
    const f = fakeFight({ leader: 7, me: 7 });
    withNet(t, f, [{ c: 9, k: 'x', f: 1 }]);
    t.enter();
    t.run(2);
    const m = t.g.members()[1];
    f.peerPos = () => ({ x: m.pos.x + 2, y: 0, z: m.pos.z });
    t.run(400);
    expect(t.providers.npc.figure).not.toHaveBeenCalled();
    const gs = f.sent.filter((s) => s.type === 'gs');
    let streak = 0; let max = 0; let sixes = 0;
    for (const g of gs) { const a = g.p.members[1].a; if (a === 6) { streak++; sixes++; max = Math.max(max, streak); } else streak = 0; }
    expect(sixes).toBeGreaterThan(0);
    expect(max).toBeLessThanOrEqual(5);
  });
  it('Führer ohne Mitglieder (Tag) gibt die Führung ab; dispose gibt sie ebenfalls ab', () => {
    const t = setup({ n: 0 });
    const f = fakeFight({ leader: 7, me: 7 });
    withNet(t, f);
    t.run(3);
    expect(f.sent.filter((s) => s.type === 'gr')).toHaveLength(1);
    const u = setup({ n: 2 });
    const f2 = fakeFight({ leader: 7, me: 7 });
    withNet(u, f2);
    u.run(3);
    u.h.dispose();
    expect(f2.sent.some((s) => s.type === 'gr')).toBe(true);
    expect(f2.listeners('gs')).toBe(0);
  });

  it('Mitläufer: baut die Bande aus gs (Seed, Anzahl, Orte, Zustand), nimmt VR-Peers nie als Ziel, sendet Treffer als gh; ohne gs verschwindet sie', () => {
    const t = setup({ n: 0 }); // lokal gäbe es nichts: alles kommt vom Führer
    const f = fakeFight({ leader: 9, me: 7 });
    withNet(t, f);
    t.enter();
    t.run(2);
    expect(t.g.role()).toBe('follower');
    expect(t.g.active()).toBe(false);
    const spot = gangEnv(city).spots[0];
    const gsOf = (st0) => ({ c: 9, g: 1, ...decodeGs(frame, encodeGs(frame, { phase: 2, seed: 77, members: [{ st: st0, x: spot.x, z: spot.z, yaw: 0, a: 0, tgt: 7, hp: 60 }, { st: 'idle', x: spot.x + 1, z: spot.z, yaw: 0, a: 0, tgt: 0, hp: 60 }] })) });
    f.emit('gs', gsOf('idle'));
    t.st.pose = { x: spot.x + 1.2, z: spot.z, y: 0 };
    t.ctx.camera.position.set(spot.x + 1.2, 1.6, spot.z);
    t.run(5);
    expect(t.g.members()).toHaveLength(2);
    expect(t.g.members()[0].pos.x).toBeCloseTo(spot.x, 1);
    expect(t.providers.npc.figure).toHaveBeenCalled();
    f.emit('gs', gsOf('taunt'));
    t.run(3);
    expect(t.g.members()[0].st).toBe('taunt');
    expect(t.said.length).toBeGreaterThanOrEqual(1); // Zustandswechsel → ansprechen
    // eigener Treffer geht an den Führer, kein lokaler Schaden
    t.st.pose = { x: spot.x - 1.2, z: spot.z, y: 0 };
    const hp = t.g.members()[0].hp;
    expect(hitAction(t).fn({ weapon: 'whip', ...aimAt(t) })).toBe(true);
    expect(f.sent.find((s) => s.type === 'gh').p).toEqual({ i: 0, w: 2 });
    expect(t.g.members()[0].hp).toBe(hp);
    // Zustand folgt dem nächsten gs (flee), kein eigener Angriff vom Mitläufer
    f.emit('gs', { c: 9, g: 1, ...decodeGs(frame, encodeGs(frame, { phase: 2, seed: 77, members: [{ st: 'flee', x: spot.x, z: spot.z, yaw: 0, a: 2, tgt: 0, hp: 10 }, { st: 'flee', x: spot.x + 1, z: spot.z, yaw: 0, a: 2, tgt: 0, hp: 10 }] })) });
    t.run(3);
    expect(t.g.members().map((m) => m.st)).toEqual(['flee', 'flee']);
    expect(t.providers.fight.hitPlayer).not.toHaveBeenCalled();
    // Führer schweigt: nach STALE_S ist die Bande weg
    t.run(Math.ceil((STALE_S + 1) / 0.1));
    expect(t.g.active()).toBe(false);
  });

  it('gs fremder Absender (nicht der Führer) wird ignoriert', () => {
    const t = setup({ n: 0 });
    const f = fakeFight({ leader: 9, me: 7 });
    withNet(t, f);
    t.run(2);
    f.emit('gs', { c: 5, g: 1, ...decodeGs(frame, encodeGs(frame, { phase: 2, seed: 1, members: [{ st: 'idle', x: -1, z: 5, yaw: 0, hp: 60 }] })) });
    t.run(3);
    expect(t.g.active()).toBe(false);
  });

  it('Führung geht verloren: lokal weiterrechnen mit denselben Mitgliedern', () => {
    const t = setup({ n: 0 });
    const f = fakeFight({ leader: 9, me: 7 });
    withNet(t, f);
    t.run(2);
    const spot = gangEnv(city).spots[0];
    f.emit('gs', { c: 9, g: 1, ...decodeGs(frame, encodeGs(frame, { phase: 2, seed: 77, members: [{ st: 'idle', x: spot.x, z: spot.z, yaw: 0, hp: 60 }] })) });
    t.run(3);
    expect(t.g.role()).toBe('follower');
    f.state.leader = null;
    t.run(3);
    expect(t.g.role()).toBe('local');
    expect(t.g.members()).toHaveLength(1);
  });
});

describe('modules/gang: Dev-Parameter ?gang', () => {
  it("'0' schaltet aus, '1' erzwingt Bande, 'day' mindestens einen Rowdy bei Tag", () => {
    const o = (g) => ({ tod: 'day', opts: { debug: false, gang: undefined, dev: { gang: g } } });
    expect(setup(o('0')).g.members()).toHaveLength(0);
    const one = setup(o('1'));
    one.enter(); one.run(2);
    expect(one.g.members().length).toBeGreaterThan(0);
    const day = setup(o('day'));
    day.enter(); day.run(2);
    expect(day.g.members().length).toBeGreaterThan(0);
  });
});
