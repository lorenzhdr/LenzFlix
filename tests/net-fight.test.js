// @vitest-environment jsdom
// VIDEOTHEK LENZ · 1.18.0 Mehrspieler: Teil „fight“ (net/fight.js), gs-Kodierung (net/gang.js), Peers mit Waffe/„weg“/Laser, Emote-Rad ohne Mehrspieler.
// Fake-Core/-ctx, kein Netzwerk.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { Scene, PerspectiveCamera, Object3D } from 'three';
import { createFightNet, WP_DEBOUNCE_MS, LZ_GAP_MS, FH_GAP_MS, LB_GAP_MS, GC_GAP_MS } from '../src/js/store3d/net/fight.js';
import { encodeGs } from '../src/js/store3d/net/gang.js';
import { createFrame } from '../src/js/store3d/net/frame.js';
import { createPeers } from '../src/js/store3d/net/peers.js';
import { createPeerLasers, EXPIRE_S, MAX_LASERS } from '../src/js/store3d/net/peerlaser.js';
import { createLocalEmotes } from '../src/js/store3d/net/emote-ui.js';
import { PART_FACTORIES } from '../src/js/store3d/net/parts.js';
import { normalizeOut } from '../src/js/store3d/net/proto.js';

const frame = createFrame({ w: 12.5, d: 18 });

function setup(o = {}) {
  let T = 1000;
  const bus = new Map();
  const sent = [];
  const st = { live: o.live !== false, cap: o.cap !== false, vr: false, ok: true, me: { c: 7, k: 'aaaaaaaaaaaa' } };
  const peerSet = { setWeapon: vi.fn(), setLaser: vi.fn(), get: (c) => (c === 9 ? { c: 9, r: 2 } : null), pos: (c) => (c === 9 ? { x: 3, y: 0, z: 4 } : null) };
  const pose = { x: 5, y: 0, z: 5 };
  const core = {
    ctx: { xr: { presenting: () => st.vr }, player: { getPose: () => pose } },
    frame, now: () => T, active: () => st.live, cap: (n) => st.cap && n === 'fight', me: () => st.me, peers: peerSet,
    send: vi.fn((m) => { if (!st.ok) return false; sent.push(m); return true; }),
    on: (t, fn) => { const l = bus.get(t) || new Set(); l.add(fn); bus.set(t, l); return () => l.delete(fn); },
  };
  const part = createFightNet(core);
  const emit = (t, e) => { for (const fn of [...(bus.get(t) || [])]) fn(e); };
  return { part, f: part.fight, core, st, sent, emit, peerSet, pose, advance: (ms) => { T += ms; }, tick: (ms = 0) => { T += ms; part.tick(0.016); } };
}

describe('net/fight: Provider-Anteil', () => {
  it('ist als Teil fight registriert; ohne Fähigkeit oder Verbindung geht nichts raus', () => {
    expect(PART_FACTORIES.fight).toBe(createFightNet);
    const a = setup({ cap: false });
    expect(a.f.has()).toBe(false);
    expect(a.f.send('gc', {})).toBe(false);
    const b = setup({ live: false });
    expect(b.f.send('gr', {})).toBe(false);
    expect(a.sent).toEqual([]);
  });

  it('wp: entprellt (300 ms nach der letzten Änderung), gleiche Wahl nicht doppelt', () => {
    const t = setup();
    expect(t.f.send('wp', { w: 1 })).toBe(true);
    t.tick(WP_DEBOUNCE_MS - 1);
    expect(t.sent).toEqual([]);
    t.f.send('wp', { w: 2 }); // neuer Stand setzt die Frist neu
    t.tick(WP_DEBOUNCE_MS - 1);
    expect(t.sent).toEqual([]);
    t.tick(2);
    expect(t.sent).toEqual([{ t: 'wp', w: 2 }]);
    t.f.send('wp', { w: 2 });
    t.tick(WP_DEBOUNCE_MS + 1);
    expect(t.sent).toHaveLength(1);
    expect(t.f.send('wp', { w: 9 })).toBe(false);
  });

  it('fh: lokale Richtung → Netzrichtung, normalizeOut-fest, höchstens 3/s, src nur als 1/0', () => {
    const t = setup();
    expect(t.f.send('fh', { c: 9, w: 1, dir: { x: 0, z: -1 } })).toBe(true);
    expect(t.sent[0]).toEqual({ t: 'fh', c: 9, w: 1, d: [0, -100], src: 0 });
    expect(normalizeOut(t.sent[0])).toEqual(t.sent[0]);
    expect(t.f.send('fh', { c: 9, w: 1, dir: { x: 0, z: -1 } })).toBe(false);
    t.advance(FH_GAP_MS + 1);
    expect(t.f.send('fh', { c: 9, w: 0, dir: { x: 1, z: 0 }, src: 1, from: { x: 2, z: 2 } })).toBe(true);
    expect(t.sent[1]).toMatchObject({ t: 'fh', c: 9, src: 1 });
    expect(t.f.send('fh', { c: 9, w: 0, dir: { x: 0, z: 0 } })).toBe(false);
  });

  it('lz: nur bei Änderung, höchstens 4/s (neuester Stand wird nachgereicht), Aus-Meldung geht durch', () => {
    const t = setup();
    t.f.send('lz', { on: true, point: { x: 5, y: 1, z: 2 } });
    expect(t.sent).toHaveLength(1);
    expect(t.sent[0]).toMatchObject({ t: 'lz', on: 1 });
    t.f.send('lz', { on: true, point: { x: 5.01, y: 1, z: 2 } }); // < 5 cm: keine Änderung
    t.f.send('lz', { on: true, point: { x: 6, y: 1, z: 2 } }); // zu früh: wartet
    expect(t.sent).toHaveLength(1);
    t.tick(LZ_GAP_MS + 1);
    expect(t.sent).toHaveLength(2);
    t.f.send('lz', { on: false });
    t.tick(LZ_GAP_MS + 1);
    expect(t.sent[2]).toMatchObject({ t: 'lz', on: 0 });
    t.f.send('lz', { on: false }); // gleich
    t.tick(LZ_GAP_MS + 1);
    expect(t.sent).toHaveLength(3);
  });

  it('lb je Ziel 1 je 4 s, gc 1/s, gh 4/s, gr sofort; in VR nur gr', () => {
    const t = setup();
    expect(t.f.send('lb', { c: 9 })).toBe(true);
    expect(t.f.send('lb', { c: 9 })).toBe(false);
    expect(t.f.send('lb', { c: 8 })).toBe(true);
    t.advance(LB_GAP_MS + 1);
    expect(t.f.send('lb', { c: 9 })).toBe(true);
    expect(t.f.send('gc', {})).toBe(true);
    expect(t.f.send('gc', {})).toBe(false);
    t.advance(GC_GAP_MS + 1);
    expect(t.f.send('gc', {})).toBe(true);
    expect(t.f.send('gh', { i: 1, w: 2 })).toBe(true);
    expect(t.f.send('gh', { i: 1, w: 2 })).toBe(false);
    t.st.vr = true;
    expect(t.f.send('gc', {})).toBe(false);
    expect(t.f.send('gr', {})).toBe(true);
    expect(t.sent.at(-1)).toEqual({ t: 'gr' });
  });

  it('gs: kodiert gegen den Netzrahmen, g Pflicht, höchstens 6/s', () => {
    const t = setup();
    const members = [{ st: 'attack', x: 2, z: -3, yaw: 1, a: 2, tgt: 7, hp: 44 }];
    expect(t.f.send('gs', { phase: 2, seed: 5, members })).toBe(false); // ohne g
    expect(t.f.send('gs', { g: 3, phase: 2, seed: 5, members })).toBe(true);
    expect(t.sent[0]).toMatchObject({ t: 'gs', g: 3 });
    expect(t.sent[0].q.slice(0, 3)).toEqual([2, 5, 1]);
    expect(t.f.send('gs', { g: 3, phase: 2, seed: 5, members })).toBe(false);
  });

  it('Modul → Netz → Empfänger: lz-Punkt (Meter) und fh-Richtung (Welt) kommen unverändert an', () => {
    const t = setup();
    t.f.send('lz', { on: true, point: { x: 3, y: 1, z: 4 } });
    t.f.send('fh', { c: 9, w: 1, dir: { x: 0, z: -1 }, from: { x: 3, z: 4 } });
    const lz = t.sent.find((m) => m.t === 'lz');
    const fh = t.sent.find((m) => m.t === 'fh');
    const got = {};
    t.f.on('lz', (m) => { got.lz = m; });
    t.f.on('fh', (m) => { got.fh = m; });
    t.emit('lz', { ...lz, c: 9 });
    t.emit('fh', { ...fh, c: 9 });
    expect(got.lz.point.x).toBeCloseTo(3, 1);
    expect(got.lz.point.z).toBeCloseTo(4, 1);
    expect(got.fh.dir.x).toBeCloseTo(0, 1);
    expect(got.fh.dir.z).toBeCloseTo(-1, 1);
  });

  it('Empfang: wp/lz/fh/gs/gh/ga werden dekodiert, Peers bekommen Waffe und Laserpunkt, Führer wird gemerkt', () => {
    const t = setup();
    const got = {};
    for (const k of ['wp', 'lz', 'fh', 'gs', 'gh', 'ga', 'lb', 'pu']) t.f.on(k, (m) => { got[k] = m; });
    t.emit('wp', { t: 'wp', c: 9, w: 2 });
    expect(got.wp).toEqual({ c: 9, w: 2 });
    expect(t.peerSet.setWeapon).toHaveBeenCalledWith(9, 2);
    const q = frame.enc(3, 1, 4, 2);
    t.emit('lz', { t: 'lz', c: 9, on: 1, q });
    expect(got.lz.on).toBe(true);
    expect(got.lz.point.x).toBeCloseTo(3, 2);
    expect(t.peerSet.setLaser).toHaveBeenCalledWith(9, true, expect.objectContaining({ z: expect.any(Number) }));
    t.emit('fh', { t: 'fh', c: 9, w: 1, d: [0, -100], src: 1 });
    expect(got.fh).toMatchObject({ c: 9, w: 1, src: 1 });
    expect(got.fh.dir.z).toBeLessThan(-0.9);
    expect(got.fh.from).toEqual({ x: 3, y: 0, z: 4 });
    expect(t.f.leader()).toBeNull();
    t.emit('ga', { t: 'ga', c: 9, g: 4 });
    expect(t.f.leader()).toBe(9);
    expect(t.f.isLeader()).toBe(false);
    t.emit('ga', { t: 'ga', c: 7, g: 5 });
    expect(t.f.isLeader()).toBe(true);
    expect(t.f.gen()).toBe(5);
    t.emit('gs', { t: 'gs', c: 7, g: 5, q: encodeGs(frame, { phase: 1, seed: 9, members: [{ st: 'flee', x: 1, z: 2, yaw: 0, hp: 10 }] }) });
    expect(got.gs).toMatchObject({ c: 7, g: 5, tod: 'dusk', seed: 9 });
    expect(got.gs.members[0]).toMatchObject({ st: 'flee', hp: 10 });
    t.emit('gh', { t: 'gh', c: 9, i: 1, w: 2 });
    expect(got.gh).toEqual({ c: 9, i: 1, w: 2 });
    t.emit('ga', { t: 'ga', c: 0, g: 5 });
    expect(t.f.leader()).toBeNull();
    t.emit('pu', { t: 'pu', c: 9, d: [1, 0], s: 25 });
    expect(got.pu).toMatchObject({ c: 9, s: 25 });
    t.emit('gs', { t: 'gs', c: 9, g: 1, q: [1] }); // kaputt: kein Absturz, kein Ereignis
  });

  it('Willkommen speist wp, Führer und gs ein; stop() vergisst alles', () => {
    const t = setup();
    const got = [];
    t.f.on('wp', (m) => got.push(['wp', m.c, m.w]));
    t.f.on('ga', (m) => got.push(['ga', m.c]));
    t.f.on('gs', (m) => got.push(['gs', m.c, m.members.length]));
    t.part.welcome({ wp: { 9: 3 }, gl: 9, gs: { g: 2, q: encodeGs(frame, { phase: 2, seed: 1, members: [] }) } });
    expect(got).toEqual([['wp', 9, 3], ['ga', 9], ['gs', 9, 0]]);
    expect(t.f.leader()).toBe(9);
    t.part.stop();
    expect(t.f.leader()).toBeNull();
    const n = setup({ cap: false });
    n.part.welcome({ wp: { 9: 3 }, gl: 9 });
    expect(n.f.leader()).toBeNull();
  });

  it('dispose meldet die Hörer ab', () => {
    const t = setup();
    const fn = vi.fn();
    t.f.on('wp', fn);
    t.part.dispose();
    t.emit('wp', { t: 'wp', c: 9, w: 1 });
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('net/peerlaser', () => {
  it('Punkt + Strahl ab mid, bei low nur der Punkt; erlischt nach EXPIRE_S; höchstens MAX_LASERS', () => {
    let level = 'high';
    const scene = new Scene();
    const L = createPeerLasers({ scene, quality: () => level });
    for (let c = 1; c <= MAX_LASERS + 2; c++) L.set(c, true, { x: c, y: 1, z: 2 });
    expect(L.active()).toBe(MAX_LASERS);
    L.update(0.016, () => ({ x: 0, y: 1.2, z: 0 }));
    const meshes = scene.children.filter((o) => o.isInstancedMesh);
    expect(meshes).toHaveLength(2);
    expect(meshes.every((m) => m.visible && m.count === MAX_LASERS)).toBe(true);
    level = 'low';
    L.update(0.016, () => ({ x: 0, y: 1.2, z: 0 }));
    expect(meshes.find((m) => m.geometry.type === 'BoxGeometry').visible).toBe(false);
    expect(meshes.find((m) => m.geometry.type === 'SphereGeometry').visible).toBe(true);
    L.set(1, false);
    expect(L.active()).toBe(MAX_LASERS - 1);
    L.update(EXPIRE_S + 1, null);
    expect(L.active()).toBe(0);
    expect(meshes.every((m) => !m.visible)).toBe(true);
    L.dispose();
    expect(scene.children.filter((o) => o.isInstancedMesh)).toHaveLength(0);
  });
});

describe('net/peers 1.18.0: Waffe, „weg“, Laser', () => {
  let env = null;
  afterEach(() => { if (env) { env.peers.dispose(); env.dom.remove(); } env = null; });
  function make() {
    const dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    document.body.appendChild(dom);
    const figs = [];
    const state = { now: 10000 };
    const npc = {
      figure: vi.fn((fo) => {
        const root = new Object3D();
        root.visible = true;
        if (fo.parent) fo.parent.add(root);
        const f = { root, look: fo.look, disposed: false, setAnim: vi.fn(), setName: vi.fn(), setHandItem: vi.fn(), headWorld: (o) => o.set(root.position.x, 1.9, root.position.z), dispose: vi.fn(() => { f.disposed = true; }) };
        figs.push(f);
        return f;
      }),
      reserve: vi.fn(),
    };
    const ctx = {
      scene: new Scene(), camera: new PerspectiveCamera(70, 1.5, 0.05, 90), renderer: { domElement: canvas }, isPhone: false, isTouch: false, quality: () => 'high',
      xr: { presenting: () => false }, catalog: { items: new Map() }, deps: {},
      use: (n) => ({ npc, areas: { at: () => 'street' }, city: { visible: () => ({ street: true, yard: true, shopShell: true }) } })[n],
    };
    ctx.camera.position.set(0, 1.6, 0);
    const peers = createPeers({ ctx, frame, serverNow: () => state.now, me: () => ({ c: 1, k: 'aaaaaaaaaaaa' }) });
    env = { dom, peers, figs, state, ctx };
    return env;
  }
  const peer = (c, extra = {}) => ({ c, k: String(c).padStart(12, '0'), n: 'P' + c, f: 1, q: [300 + c * 10, 0, 400, 0, 0, 0, 0], ...extra });
  const run = (e, ms, step = 50) => { for (let t = 0; t < ms; t += step) { e.state.now += step; e.peers.tick(step / 1000); } };

  it('Waffenwahl (auch vor dem Beitritt gemeldet) setzt den Handgegenstand, 0 leert ihn', () => {
    const e = make();
    e.peers.setWeapon(2, 2); // vor dem Beitritt
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2)] });
    run(e, 150);
    expect(e.figs[0].setHandItem).toHaveBeenCalledWith('whip');
    e.peers.setWeapon(2, 3);
    run(e, 100);
    expect(e.figs[0].setHandItem).toHaveBeenLastCalledWith('laser');
    e.peers.setWeapon(2, 0);
    run(e, 100);
    expect(e.figs[0].setHandItem).toHaveBeenLastCalledWith(null);
  });

  it('Pose 15 zeigt idle und „⏸“ am Schild (auch ohne Namens-Flag); Pose 9 ko; Waffen-Schlag einmalig', () => {
    const e = make();
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2), peer(3, { f: 0, n: '' })] });
    run(e, 150);
    e.peers.ev({ t: 'b', s: 10200, p: [[2, 320, 0, 400, 0, 0, 15, 2, 0], [3, 330, 0, 400, 0, 0, 15, 2, 0]], ev: [] });
    run(e, 800);
    const tags = [...e.dom.querySelectorAll('.lfx-mp-tag')].map((x) => x.textContent);
    expect(tags).toContain('P2 ⏸');
    expect(tags).toContain('⏸');
    expect(e.figs[0].setAnim).toHaveBeenLastCalledWith('idle', expect.anything());
    e.peers.ev({ t: 'b', s: 11200, p: [[2, 320, 0, 400, 0, 0, 9, 2, 0]], ev: [] });
    run(e, 800);
    expect(e.figs[0].setAnim).toHaveBeenLastCalledWith('ko', expect.anything());
    expect(e.dom.querySelector('.lfx-mp-tag').textContent).not.toContain('⏸');
    e.peers.ev({ t: 'b', s: 12200, p: [[2, 320, 0, 400, 0, 0, 12, 2, 0]], ev: [] });
    run(e, 800);
    const belt = e.figs[0].setAnim.mock.calls.filter((c) => c[0] === 'belt');
    expect(belt).toHaveLength(1);
    expect(belt[0][1]).toMatchObject({ restart: true });
  });

  it('pos(c) liefert den Anzeigeort auch ohne Figur; Laser an/aus läuft über peerlaser', () => {
    const e = make();
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2)] });
    run(e, 150);
    expect(e.peers.pos(2)).toMatchObject({ x: expect.any(Number), z: expect.any(Number) });
    expect(e.peers.pos(99)).toBeNull();
    e.peers.setLaser(2, true, { x: 1, y: 1, z: 1 });
    run(e, 100);
    expect(e.ctx.scene.children.some((o) => o.isInstancedMesh && o.visible)).toBe(true);
    e.peers.setLaser(2, false);
    run(e, 100);
    expect(e.ctx.scene.children.filter((o) => o.isInstancedMesh).every((o) => !o.visible)).toBe(true);
  });
});

describe('Emote-Rad ohne Mehrspieler (createLocalEmotes)', () => {
  function mk(o = {}) {
    const st = { xr: false, playing: true, overlay: false, actions: [], anim: [] };
    const host = document.createElement('div');
    document.body.appendChild(host);
    const ctx = {
      isTouch: false, xr: { presenting: () => st.xr, toast: vi.fn() }, playing: () => st.playing,
      overlay: { open: vi.fn((el, op) => { host.appendChild(el); st.onClose = op.onClose; st.overlay = true; }), close: vi.fn(() => { st.overlay = false; st.onClose && st.onClose(); }), isOpen: () => st.overlay },
      input: { onAction: vi.fn((n, fn, op) => { st.actions.push({ n, fn, op }); return () => { st.actions = st.actions.filter((a) => a.fn !== fn); }; }) },
      use: (n) => (n === 'selfview' && !o.noSv ? { playAnim: (a) => st.anim.push(a) } : undefined),
    };
    return { st, ctx, host, le: createLocalEmotes(ctx) };
  }
  afterEach(() => { document.body.innerHTML = ''; });

  it('Aktion emote (prio 0) öffnet das Rad; Wahl spielt an der eigenen Figur und ruft onPlayerEmote', () => {
    const t = mk();
    const hook = vi.fn();
    t.le.onPlayerEmote(hook);
    const act = t.st.actions.find((a) => a.n === 'emote');
    expect(act.op).toEqual({ prio: 0 });
    expect(act.fn()).toBe(true);
    expect(t.le.isOpen()).toBe(true);
    t.host.querySelector('[data-emote="dance"]').click();
    expect(t.st.anim).toEqual(['dance']);
    expect(hook).toHaveBeenCalledWith({ name: 'dance', code: 5, anim: 'dance' });
    expect(t.le.isOpen()).toBe(false);
  });

  it('emote(x): Cooldown, nicht in VR und nicht außerhalb des Laufmodus; ohne selfview kein Absturz', () => {
    const t = mk({ noSv: true });
    const hook = vi.fn();
    t.le.onPlayerEmote(hook);
    expect(t.le.emote('wave')).toBe(true);
    expect(t.le.emote('wave')).toBe(false); // Cooldown
    expect(hook).toHaveBeenCalledTimes(1);
    t.st.xr = true;
    expect(t.le.usable()).toBe(false);
    expect(t.le.open()).toBe(false);
    expect(t.st.actions.find((a) => a.n === 'emote').fn()).toBe(false);
    t.st.xr = false;
    t.st.playing = false;
    expect(t.le.open()).toBe(false);
    expect(t.le.emote('nix')).toBe(false);
  });

  it('dispose meldet die Aktion ab und löscht die Hörer', () => {
    const t = mk();
    const hook = vi.fn();
    t.le.onPlayerEmote(hook);
    t.le.dispose();
    expect(t.st.actions).toHaveLength(0);
    t.le.notify({ id: 'wave', code: 1, anim: 'wave' });
    expect(hook).not.toHaveBeenCalled();
  });
});

describe('net/fight: Laser-Herzschlag', () => {
  it('stillgehaltener Laser wird alle 2 s erneut gesendet (Peers verfallen nach 6 s), nach Aus nicht mehr', () => {
    const t = setup();
    t.f.send('lz', { on: true, point: { x: 5, y: 1, z: 2 } });
    expect(t.sent).toHaveLength(1);
    t.f.send('lz', { on: true, point: { x: 5, y: 1, z: 2 } }); // unveraendert, zu frueh
    expect(t.sent).toHaveLength(1);
    t.tick(2001);
    expect(t.sent).toHaveLength(2);
    expect(t.sent[1]).toMatchObject({ t: 'lz', on: 1, q: t.sent[0].q });
    t.tick(1000);
    expect(t.sent).toHaveLength(2);
    t.tick(1100);
    expect(t.sent).toHaveLength(3);
    // auch wenn der Aufrufer jeden Frame denselben Punkt meldet
    t.advance(2100);
    t.f.send('lz', { on: true, point: { x: 5, y: 1, z: 2 } });
    expect(t.sent).toHaveLength(4);
    t.f.send('lz', { on: false });
    t.tick(300);
    const n = t.sent.length;
    expect(t.sent[n - 1]).toMatchObject({ t: 'lz', on: 0 });
    t.tick(5000);
    expect(t.sent).toHaveLength(n);
  });
});
