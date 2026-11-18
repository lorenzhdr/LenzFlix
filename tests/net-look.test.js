// @vitest-environment jsdom
// VIDEOTHEK LENZ · Mehrspieler 1.17.0, Fähigkeit look: Teil net/look.js (eigener Look + Ausweis senden), Peers (Look/Ausweis anderer),
// Tag-Höhe und Kompatibilität mit altem Worker (Modul net). Kein Netzwerk: Provider, Frame und WebSocket sind Fakes.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Scene, PerspectiveCamera, Object3D } from 'three';
import { createLook, LK_GAP_S, MC_GAP_S } from '../src/js/store3d/net/look.js';
import { createPeers, LOOK_WAIT_S } from '../src/js/store3d/net/peers.js';
import { createTags } from '../src/js/store3d/net/tags.js';
import { createFrame } from '../src/js/store3d/net/frame.js';
import { defaultCode } from '../src/js/store3d/char/look2.js';
import { toWire } from '../src/js/store3d/char/card.js';
import net from '../src/js/store3d/modules/net.js';

const codeA = () => { const c = defaultCode(); c[5] = 3; return c; };
const codeB = () => { const c = defaultCode(); c[5] = 7; c[11] = 2; return c; };
const CARD = { name: 'Ich', no: '000123', since: 20000, rent: 3, cine: 2, stamps: 5, total: 20, tier: 'bronze', code: codeA() };

// ------------------------------------------------------------------ Sender (net/look.js)
function senderEnv(o = {}) {
  const st = { code: codeA(), card: { ...CARD }, prefs: { card: true }, caps: o.caps ?? ['look'], active: true, gate: false };
  const fns = { change: [], preview: [] };
  const avatar = {
    code: () => st.code.slice(), needsGate: () => st.gate,
    onChange: (fn) => { fns.change.push(fn); return () => { fns.change.splice(fns.change.indexOf(fn), 1); }; },
    onPreview: (fn) => { fns.preview.push(fn); return () => { fns.preview.splice(fns.preview.indexOf(fn), 1); }; },
  };
  const member = { cardData: () => st.card };
  const providers = { avatar, member, ...(o.providers || {}) };
  const sent = [];
  const core = { ctx: { use: (n) => providers[n] }, send: vi.fn((m) => { sent.push(m); return true; }), cap: (n) => st.caps.includes(n), active: () => st.active, prefs: () => st.prefs };
  const part = createLook(core);
  const types = (t) => sent.filter((m) => m.t === t);
  const run = (s) => { for (let i = 0; i < Math.round(s * 10); i++) part.tick(0.1); };
  return { st, fns, sent, core, part, types, run, providers };
}

describe('net/look.js: Senden', () => {
  it('nach wl mit Fähigkeit look: eigener Code und Ausweis (toWire)', () => {
    const e = senderEnv();
    e.part.welcome({ t: 'wl' });
    expect(e.types('lk')).toEqual([{ t: 'lk', l: codeA() }]);
    expect(e.types('mc')).toEqual([{ t: 'mc', m: toWire(CARD) }]);
    expect(e.types('mc')[0].m).toEqual([1, 123, 20000, 3, 2, 5]);
  });

  it('alter Worker (keine Fähigkeit look): nie lk/mc, auch nicht bei Änderung, Pref-Wechsel und Zeitablauf', () => {
    const e = senderEnv({ caps: ['pres', 'chat'] });
    e.part.welcome({ t: 'wl' });
    e.run(1);
    expect(e.fns.change.length).toBe(0);
    e.st.code = codeB();
    e.fns.change.forEach((f) => f());
    e.st.prefs = { card: false };
    e.part.prefs();
    e.run(30);
    expect(e.sent.length).toBe(0);
  });

  it('ohne Figur (Gate offen oder kein Code) wird kein lk gesendet', () => {
    const e = senderEnv();
    e.st.gate = true;
    e.part.welcome({ t: 'wl' });
    expect(e.types('lk').length).toBe(0);
    const e2 = senderEnv({ providers: { avatar: null } });
    e2.part.welcome({ t: 'wl' });
    expect(e2.types('lk').length).toBe(0);
  });

  it('onChange: erneut senden, aber höchstens alle 2 s; unveränderter Code nie doppelt', () => {
    const e = senderEnv();
    e.part.welcome({ t: 'wl' });
    e.st.code = codeB();
    e.fns.change.forEach((f) => f());
    e.run(LK_GAP_S - 0.5);
    expect(e.types('lk').length).toBe(1);
    e.run(1);
    expect(e.types('lk').length).toBe(2);
    expect(e.types('lk')[1].l).toEqual(codeB());
    e.fns.change.forEach((f) => f()); // gleicher Code
    e.run(5);
    expect(e.types('lk').length).toBe(2);
  });

  it('nie während der Live-Vorschau; danach nach Übernehmen', () => {
    const e = senderEnv();
    e.part.welcome({ t: 'wl' });
    e.run(3);
    e.fns.preview.forEach((f) => f({ v: 2 }));
    e.st.code = codeB(); // Vorschau-Zustand
    e.fns.change.forEach((f) => f());
    e.run(10);
    expect(e.types('lk').length).toBe(1);
    e.fns.preview.forEach((f) => f(null));
    e.run(0.2);
    expect(e.types('lk').length).toBe(2);
  });

  it('mc: Änderungen höchstens alle 5 s (Abgleich alle 5 s)', () => {
    const e = senderEnv();
    e.part.welcome({ t: 'wl' });
    e.st.card = { ...CARD, rent: 4 };
    e.run(MC_GAP_S - 1);
    expect(e.types('mc').length).toBe(1);
    e.run(2);
    expect(e.types('mc').length).toBe(2);
    expect(e.types('mc')[1].m[3]).toBe(4);
    e.run(30);
    expect(e.types('mc').length).toBe(2); // keine Änderung → nichts
  });

  it('Pref „Ausweis zeigen“ aus: mc null (sofort), wieder an: nach der Rate mit Daten', () => {
    const e = senderEnv();
    e.part.welcome({ t: 'wl' });
    e.run(1);
    e.st.prefs = { card: false };
    e.part.prefs();
    expect(e.types('mc').length).toBe(2);
    expect(e.types('mc')[1]).toEqual({ t: 'mc', m: null });
    e.run(10);
    expect(e.types('mc').length).toBe(2);
    e.st.prefs = { card: true };
    e.part.prefs();
    e.run(MC_GAP_S + 0.2);
    expect(e.types('mc').length).toBe(3);
    expect(e.types('mc')[2].m).toEqual([1, 123, 20000, 3, 2, 5]);
  });

  it('Pref aus schon beim Beitritt: mc null; ohne Ausweisnummer ebenfalls null', () => {
    const e = senderEnv();
    e.st.prefs = { card: false };
    e.part.welcome({ t: 'wl' });
    expect(e.types('mc')).toEqual([{ t: 'mc', m: null }]);
    const e2 = senderEnv();
    e2.st.card = { ...CARD, no: '000000' };
    e2.part.welcome({ t: 'wl' });
    expect(e2.types('mc')).toEqual([{ t: 'mc', m: null }]);
  });

  it('Pref fehlt (Standard) = zeigen; stop() beendet das Senden, neues wl sendet neu', () => {
    const e = senderEnv();
    e.st.prefs = {};
    e.part.welcome({ t: 'wl' });
    expect(e.types('mc')[0].m).not.toBeNull();
    e.part.stop();
    e.st.code = codeB();
    e.run(10);
    expect(e.sent.length).toBe(2);
    e.part.welcome({ t: 'wl' });
    expect(e.types('lk').length).toBe(2);
    e.part.dispose();
    expect(e.fns.change.length).toBe(0);
  });
});

// ------------------------------------------------------------------ Peers
const frame = createFrame({ w: 12.5, d: 18 });
function fakeFigure(o) {
  const root = new Object3D();
  root.visible = true;
  if (o.parent) o.parent.add(root);
  const f = {
    root, look: o.look, bones: { armR: new Object3D() }, disposed: false, topY: 1.9,
    setAnim: vi.fn(), setName: vi.fn(), setLook: vi.fn((l) => { f.look = l; }),
    headWorld: (out) => out.set(root.position.x, root.position.y + 1.9, root.position.z),
    dispose: vi.fn(() => { f.disposed = true; if (root.parent) root.parent.remove(root); }),
  };
  return f;
}

describe('createPeers: Look und Ausweis anderer', () => {
  let env = null;
  afterEach(() => { if (env) { env.peers.dispose(); env.dom.remove(); } env = null; });
  function setup(o = {}) {
    const dom = document.createElement('div');
    const canvas = document.createElement('canvas');
    dom.appendChild(canvas);
    document.body.appendChild(dom);
    const figs = [];
    const state = { now: 10000, overflow: 0, level: o.level || 'high' };
    const npc = { figure: vi.fn((fo) => { const f = fakeFigure(fo); figs.push(f); return f; }), reserve: vi.fn(), overflow: vi.fn(() => state.overflow) };
    const member = { showCard: vi.fn(() => Promise.resolve()) };
    const ias = [];
    const providers = { npc, member, areas: { at: () => 'street' }, city: { visible: () => ({ shopShell: true, palastInterior: true, yard: true }) } };
    const ctx = {
      scene: new Scene(), camera: new PerspectiveCamera(70, 1.5, 0.05, 90), renderer: { domElement: canvas }, isPhone: false, isTouch: false,
      quality: () => state.level, xr: { presenting: () => false }, catalog: { items: new Map() }, deps: {},
      use: (n) => providers[n],
      addInteractable: vi.fn((io) => { const r = { o: io, removed: false }; ias.push(r); return () => { r.removed = true; }; }),
    };
    ctx.camera.position.set(0, 1.6, 0);
    const core = { ctx, frame, serverNow: () => state.now, me: () => ({ c: 1, k: 'aaaaaaaaaaaa' }), cap: o.cap === false ? undefined : (n) => n === 'look' };
    const peers = createPeers(core);
    env = { dom, ctx, state, npc, figs, ias, member, peers };
    return env;
  }
  const peer = (c, extra = {}) => ({ c, k: String(c).padStart(12, '0'), n: 'P' + c, f: 1, q: [300 + c * 10, 0, 400, 0, 0, 0, 0], ...extra });
  const run = (e, ms, step = 50) => { for (let t = 0; t < ms; t += step) { e.state.now += step; e.peers.tick(step / 1000); } };

  it('wl.lk: Figur entsteht sofort mit dem Look v2 aus dem Code (kein Seed-Flackern)', () => {
    const e = setup();
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2)], lk: { 2: codeA() } });
    run(e, 150);
    expect(e.npc.figure).toHaveBeenCalledTimes(1);
    const look = e.npc.figure.mock.calls[0][0].look;
    expect(look.v).toBe(2);
    expect(look.hairStyle).toBe('tuft');
  });

  it('Ereignis lk: fig.setLook mit neuem Look (kein Neuaufbau); gleicher Code ohne Wirkung', () => {
    const e = setup();
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2)], lk: { 2: codeA() } });
    run(e, 150);
    e.peers.ev({ t: 'lk', c: 2, l: codeB() });
    expect(e.figs[0].setLook).toHaveBeenCalledTimes(1);
    expect(e.figs[0].setLook.mock.calls[0][0]).toMatchObject({ v: 2, hairStyle: 'curls' });
    e.peers.ev({ t: 'lk', c: 2, l: codeB() });
    expect(e.figs[0].setLook).toHaveBeenCalledTimes(1);
    expect(e.npc.figure).toHaveBeenCalledTimes(1);
    // über b.ev (Sammelrahmen) kommt es ebenfalls an
    e.peers.ev({ t: 'b', s: 10100, p: [], ev: [{ t: 'lk', c: 2, l: codeA() }] });
    expect(e.figs[0].setLook).toHaveBeenCalledTimes(2);
  });

  it('ohne lk: höchstens 600 ms warten, dann Seed-Figur (kein v2)', () => {
    const e = setup();
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2)] });
    run(e, (LOOK_WAIT_S - 0.15) * 1000);
    expect(e.npc.figure).not.toHaveBeenCalled();
    run(e, 600);
    expect(e.npc.figure).toHaveBeenCalledTimes(1);
    expect(e.npc.figure.mock.calls[0][0].look.v).toBeUndefined();
  });

  it('kommt lk innerhalb der Wartezeit, entsteht die Figur gleich mit dem eigenen Look', () => {
    const e = setup();
    e.peers.welcome({ c: 1, s: 10000, peers: [] });
    e.peers.ev({ t: 'j', ...peer(3) });
    run(e, 200);
    expect(e.npc.figure).not.toHaveBeenCalled();
    e.peers.ev({ t: 'lk', c: 3, l: codeB() });
    run(e, 150);
    expect(e.npc.figure).toHaveBeenCalledTimes(1);
    expect(e.npc.figure.mock.calls[0][0].look.v).toBe(2);
  });

  it('ohne Fähigkeit look (alter Worker): keine Wartezeit, Seed-Figur wie 1.16', () => {
    const e = setup({ cap: false });
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2)] });
    run(e, 150);
    expect(e.npc.figure).toHaveBeenCalledTimes(1);
    expect(e.npc.figure.mock.calls[0][0].look.v).toBeUndefined();
  });

  it('npc.overflow() senkt das Figurenlimit (min 0); der eigene Anteil zählt nicht mit', () => {
    const e = setup({ level: 'mid' }); // Limit 10
    e.state.overflow = 7;
    e.peers.welcome({ c: 1, s: 10000, peers: [1, 2, 3, 4, 5].map((i) => peer(i + 1)), lk: { 2: codeA(), 3: codeA(), 4: codeA(), 5: codeA(), 6: codeA() } });
    run(e, 200);
    expect(e.peers.stats().figures).toBe(3);
    e.state.overflow = 99;
    e.peers.onQuality();
    run(e, 400);
    expect(e.peers.stats().figures).toBe(0);
  });

  it('Ausweis: Interaktion mit noClick und mitlaufender Box; onUse → member.showCard (peer) mit Name, Code und Daten', () => {
    const e = setup();
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2)], lk: { 2: codeA() }, mc: { 2: [1, 77, 20000, 4, 1, 3] } });
    run(e, 200);
    expect(e.ctx.addInteractable).toHaveBeenCalledTimes(1);
    const io = e.ias[0].o;
    expect(io.noClick).toBe(true);
    expect(io.label).toBe('Ausweis von P2');
    expect(io.enabled()).toBe(true);
    const x0 = io.box.min.x;
    e.peers.ev({ t: 'b', s: 10300, p: [[2, 900, 0, 400, 0, 0, 0, 0, 0]], ev: [] });
    run(e, 600);
    expect(io.box.min.x).toBeGreaterThan(x0 + 1); // Box folgt der Figur (gleiches Objekt)
    expect(io.box.max.y).toBeGreaterThan(1.9);
    io.onUse();
    expect(e.member.showCard).toHaveBeenCalledTimes(1);
    const [card, opt] = e.member.showCard.mock.calls[0];
    expect(opt).toEqual({ mode: 'peer' });
    expect(card).toMatchObject({ name: 'P2', no: '000077', since: 20000, rent: 4, cine: 1, stamps: 3 });
    expect(card.code).toEqual(codeA());
    expect(e.peers.list()[0].card).toBe(true);
  });

  it('Ausweis: ohne Name-Flag kein Name; mc null entfernt die Interaktion; ungültiges mc wird verworfen', () => {
    const e = setup();
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2, { f: 0 })], mc: { 2: [1, 5, 1, 0, 0, 0] } });
    run(e, 800);
    expect(e.ias[0].o.label).toBe('Mitgliedsausweis');
    expect(e.peers.card(2).name).toBeNull();
    e.peers.ev({ t: 'mc', c: 2, m: null });
    run(e, 400);
    expect(e.ias[0].removed).toBe(true);
    expect(e.peers.list()[0].card).toBe(false);
    e.peers.ev({ t: 'mc', c: 2, m: ['x'] });
    expect(e.peers.card(2)).toBeNull();
  });

  it('Ausweis: Figur weg (Ferne/Entfernen/clear) räumt die Interaktion auf', () => {
    const e = setup();
    e.peers.welcome({ c: 1, s: 10000, peers: [peer(2)], mc: { 2: [1, 5, 1, 0, 0, 0] } });
    run(e, 800);
    expect(e.ias.filter((r) => !r.removed).length).toBe(1);
    e.peers.ev({ t: 'l', c: 2 });
    expect(e.ias.filter((r) => !r.removed).length).toBe(0);
  });
});

// ------------------------------------------------------------------ Tag-Höhe
describe('tags: Schildhöhe aus figure.topY', () => {
  it('höhere Figur (Hut) → Schild weiter oben (Projektion), alte Looks behalten headWorld', () => {
    const mk = () => {
      const dom = document.createElement('div');
      const canvas = document.createElement('canvas');
      dom.appendChild(canvas);
      Object.defineProperty(dom, 'clientWidth', { value: 400 });
      Object.defineProperty(dom, 'clientHeight', { value: 300 });
      const cam = new PerspectiveCamera(60, 4 / 3, 0.1, 50);
      cam.position.set(0, 1.5, 0);
      cam.updateMatrixWorld(true);
      cam.updateProjectionMatrix();
      return { ctx: { renderer: { domElement: canvas }, camera: cam, isTouch: false, xr: { presenting: () => false } }, dom };
    };
    const yOf = (topY, look) => {
      const { ctx, dom } = mk();
      const tags = createTags(ctx);
      const fig = fakeFigure({ look });
      fig.topY = topY;
      fig.root.position.set(0, 0, -5);
      tags.sync([{ c: 1, fig, text: 'Max', dist: 5 }], { tagDist: 16 });
      tags.update();
      const m = /translate\(([-\d.]+)px, ([-\d.]+)px\)/.exec(dom.querySelector('.lfx-mp-tag').style.transform);
      tags.dispose();
      return Number(m[2]);
    };
    const hat = yOf(2.3, { v: 2 });
    const plain = yOf(1.9, { v: 2 });
    expect(hat).toBeLessThan(plain); // kleineres y = weiter oben
    // alter Look (v ≠ 2): feste Kopfhöhe, unabhängig von topY
    expect(yOf(2.3, { v: 1 })).toBeCloseTo(yOf(1.9, { v: 1 }), 5);
  });
});

// ------------------------------------------------------------------ Modul net: Kompatibilität
let sockets;
class FakeWS {
  constructor(url, protocols) { this.url = url; this.protocols = protocols; this.sent = []; this.readyState = 0; sockets.push(this); }
  send(s) { this.sent.push(s); }
  close() { this.readyState = 3; }
  open() { this.readyState = 1; this.onopen && this.onopen({}); }
  recv(m) { this.onmessage && this.onmessage({ data: JSON.stringify(m) }); }
  frames() { return this.sent.filter((x) => x.startsWith('[')).flatMap((x) => JSON.parse(x)); }
}

describe('Modul net: look-Fähigkeit', () => {
  beforeEach(() => { vi.useFakeTimers(); sockets = []; });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  function setup(prefs = {}) {
    const provided = new Map();
    const listeners = new Map();
    const host = document.createElement('div');
    const canvas = document.createElement('canvas');
    host.appendChild(canvas);
    document.body.appendChild(host);
    const pr = { on: true, name: true, card: true, film: false, chat: true, mute: [], hint: true, ...prefs };
    const onPrefs = vi.fn((p) => { Object.assign(pr, p.mp); });
    const ctx = {
      scene: {}, camera: {}, renderer: { domElement: canvas }, layout: { w: 12.5, d: 18 }, isTouch: false, isPhone: false,
      deps: { mp: { uid: 'u1', cv: '1.17.0', prefs: () => pr, ticket: async () => ({ ok: true, tk: 'a.b', url: 'wss://x/mp', exp: 0, pv: [1], s: 5000000 }) }, onPrefs },
      opts: { debug: true, mpTransport: FakeWS }, quality: () => 'high', suspended: () => false, playing: () => true,
      player: { getNet: () => ({ x: 5, y: 0, z: 5, yaw: 0, pitch: 0, a: 0, vx: 0, vy: 0, vz: 0 }) },
      xr: { presenting: () => false, toast: vi.fn() },
      provide: (n, impl) => { provided.set(n, impl); return () => provided.delete(n); },
      use: (n) => provided.get(n),
      on: (ev, fn) => { const l = listeners.get(ev) || []; l.push(fn); listeners.set(ev, l); return () => {}; },
    };
    provided.set('avatar', { code: () => codeA(), needsGate: () => false, onChange: () => () => {}, onPreview: () => () => {} });
    provided.set('member', { cardData: () => CARD, showCard: vi.fn(() => Promise.resolve()) });
    return { ctx, provided, pr, onPrefs, emit: (ev) => (listeners.get(ev) || []).forEach((f) => f()) };
  }
  const WL = (cap, over = {}) => ({ t: 'wl', pv: 1, c: 1, k: 'aaaaaaaaaaaa', s: 5000000, ad: 0, cap, cf: { pr: 8, ph: 8 }, peers: [], ...over });
  async function live(t, wl) {
    t.emit('enter');
    await vi.advanceTimersByTimeAsync(0);
    const ws = sockets[sockets.length - 1];
    ws.open();
    ws.recv(wl);
    return ws;
  }
  const types = (ws) => ws.frames().map((m) => m.t);

  it('hello kündigt look an; Server mit look: lk und mc gehen nach dem wl raus', async () => {
    const t = setup();
    const h = net.init(t.ctx);
    const ws = await live(t, WL(['pres', 'look']));
    await vi.advanceTimersByTimeAsync(300);
    expect(ws.frames()[0].cap).toContain('look');
    const lk = ws.frames().find((m) => m.t === 'lk');
    const mc = ws.frames().find((m) => m.t === 'mc');
    expect(lk.l).toEqual(codeA());
    expect(mc.m).toEqual([1, 123, 20000, 3, 2, 5]);
    h.dispose();
  });

  it('alter Worker (wl ohne look): nie lk/mc, auch nicht nach Pref-Wechsel und Zeitablauf', async () => {
    const t = setup();
    const h = net.init(t.ctx);
    const ws = await live(t, WL(['pres', 'chat']));
    await vi.advanceTimersByTimeAsync(300);
    t.ctx.deps.onPrefs({ mp: { card: false } });
    h.update(0.1, 1);
    await vi.advanceTimersByTimeAsync(15000);
    for (let i = 0; i < 100; i++) h.update(0.1, i);
    await vi.advanceTimersByTimeAsync(2000);
    expect(types(ws)).not.toContain('lk');
    expect(types(ws)).not.toContain('mc');
    h.dispose();
  });

  it('x-Frame mit lk/mc anderer: Peer hat Ausweis (Spielerliste/Provider zeigen card)', async () => {
    const t = setup();
    const h = net.init(t.ctx);
    const ws = await live(t, WL(['pres', 'look'], { peers: [{ c: 2, k: 'bbbbbbbbbbbb', n: 'Gast', f: 1, j: 0 }] }));
    const net1 = t.provided.get('net');
    expect(net1.peers()[0].card).toBe(false);
    ws.recv({ t: 'x', ev: [{ t: 'mc', c: 2, m: [1, 9, 1, 0, 0, 0] }, { t: 'lk', c: 2, l: codeB() }] });
    expect(net1.peers()[0].card).toBe(true);
    ws.recv({ t: 'x', ev: [{ t: 'mc', c: 2, m: null }] });
    expect(net1.peers()[0].card).toBe(false);
    h.dispose();
  });

  it('Pref „Ausweis zeigen“ über das Panel aus: mc null geht sofort raus; Panel-Schalter und Ausweis-Knopf', async () => {
    const t = setup();
    const h = net.init(t.ctx);
    const ws = await live(t, WL(['pres', 'look'], { peers: [{ c: 2, k: 'bbbbbbbbbbbb', n: 'Gast', f: 1, j: 0 }], mc: { 2: [1, 9, 1, 0, 0, 0] } }));
    await vi.advanceTimersByTimeAsync(300);
    expect(ws.frames().filter((m) => m.t === 'mc').length).toBe(1);
    const el = document.createElement('div');
    t.provided.get('net').renderMenu(el);
    const sw = [...el.querySelectorAll('button')].find((b) => b.textContent.startsWith('Ausweis zeigen'));
    expect(sw.textContent).toBe('Ausweis zeigen: An');
    const ab = el.querySelector('.lfx-mp-card');
    expect(ab).not.toBeNull();
    ab.click();
    expect(t.provided.get('member').showCard).toHaveBeenCalledTimes(1);
    expect(t.provided.get('member').showCard.mock.calls[0][1]).toEqual({ mode: 'peer' });
    sw.click();
    expect(t.pr.card).toBe(false);
    await vi.advanceTimersByTimeAsync(300);
    const mcs = ws.frames().filter((m) => m.t === 'mc');
    expect(mcs.length).toBe(2);
    expect(mcs[1].m).toBeNull();
    h.dispose();
  });
});
