// @vitest-environment jsdom
// VIDEOTHEK LENZ · Mehrspieler Welle c (C1): Schubsen (net/push.js). Fake-npc/-Peers/-Spieler, echter Netzrahmen, kein Netzwerk.
import { describe, it, expect, vi } from 'vitest';
import { createPush, SEND_GAP_MS, RECV_GAP_MS, SEND_DIST } from '../src/js/store3d/net/push.js';
import { createFrame } from '../src/js/store3d/net/frame.js';
import { PUSH_KNOCK } from '../src/js/store3d/nav/collide.js';
import { normalizeOut, F } from '../src/js/store3d/net/proto.js';

function setup(o = {}) {
  let T = 1000;
  const regs = [];
  const figListeners = new Set();
  const fig = { root: { position: { x: 5, y: 0, z: 4 } }, hitReact: vi.fn(), disposed: false };
  const state = { xr: !!o.xr, playing: o.playing !== false };
  const pose = { x: 5, y: 0, z: 5, yaw: 0 };
  const peerInfo = { c: 7, k: 'kk', n: 'X', f: o.peerFlags || 1, r: 0, figure: o.noFigure ? null : fig };
  const npc = { registerPerson: vi.fn((e) => { regs.push(e); return () => { regs.splice(regs.indexOf(e), 1); }; }) };
  const sound = { play: vi.fn() };
  const ctx = {
    use: (n) => (n === 'npc' ? npc : n === 'sound' ? sound : undefined),
    xr: { presenting: () => state.xr },
    playing: () => state.playing,
    player: { getPose: () => pose, knock: vi.fn(() => true) },
  };
  const out = [];
  const core = {
    ctx, frame: createFrame({ w: 12.5, d: 18 }), now: () => T, active: () => o.active !== false, cap: (c) => (c === 'fight' ? !!o.fight : !(o.nocap === c)), me: () => ({ c: 1, k: 'me' }),
    send: vi.fn((m, opt) => { out.push({ m, opt }); return true; }),
    peers: { onFigure: (fn) => { figListeners.add(fn); return () => figListeners.delete(fn); }, get: (c) => (c === 7 ? peerInfo : null) },
  };
  const part = createPush(core);
  const emitFig = (kind) => { for (const fn of [...figListeners]) fn(kind, { c: 7, k: 'kk', n: 'X', r: 0, f: 1 }, fig); };
  return { part, core, ctx, npc, regs, fig, out, pose, state, emitFig, advance: (ms) => { T += ms; }, sound, figListeners };
}
const hit = (t, dir = { x: 0, z: -1 }) => t.regs[0].onHit(dir);

describe('push: Fremdfiguren als Personen (Schlag-Priorität 20 über npc.registerPerson)', () => {
  it('Figur erscheint → registerPerson(kind peer, handle); verschwindet → abgemeldet; dispose meldet alles ab', () => {
    const t = setup();
    t.emitFig('add');
    expect(t.regs).toHaveLength(1);
    expect(t.regs[0]).toMatchObject({ kind: 'peer', handle: t.fig });
    t.emitFig('add'); // doppelt: keine zweite Anmeldung
    expect(t.regs).toHaveLength(1);
    t.emitFig('remove');
    expect(t.regs).toHaveLength(0);
    t.emitFig('add');
    t.part.dispose();
    expect(t.regs).toHaveLength(0);
    expect(t.figListeners.size).toBe(0);
  });
  it('stop() meldet ab', () => {
    const t = setup();
    t.emitFig('add');
    t.part.stop();
    expect(t.regs).toHaveLength(0);
  });
});

describe('push: Senden (Schlag auf eine Fremdfigur)', () => {
  it('mit ausgehandelter Fähigkeit fight sendet push kein pu (das Modul fight sendet fh), die lokale Reaktion bleibt', () => {
    const t = setup({ fight: true });
    t.emitFig('add');
    hit(t);
    expect(t.fig.hitReact).toHaveBeenCalledTimes(1);
    expect(t.out).toHaveLength(0);
  });
  it('lokale Reaktion + pu {c, d (Einheitsvektor x100), s 100}; Nachricht besteht normalizeOut', () => {
    const t = setup();
    t.emitFig('add');
    hit(t, { x: 0, z: -1 });
    expect(t.fig.hitReact).toHaveBeenCalledWith({ x: 0, z: -1 });
    expect(t.out).toHaveLength(1);
    const m = t.out[0].m;
    expect(m).toEqual({ t: 'pu', c: 7, d: [0, -100], s: 100 });
    expect(normalizeOut(m)).toEqual(m);
  });
  it('Richtung wird mit der lokalen Steigung des Netzrahmens skaliert (normiert)', () => {
    const t = setup();
    t.emitFig('add');
    hit(t, { x: Math.SQRT1_2, z: -Math.SQRT1_2 });
    const [dx, dz] = t.out[0].m.d;
    expect(Math.hypot(dx, dz)).toBeGreaterThan(98);
    expect(Math.hypot(dx, dz)).toBeLessThan(102);
    expect(dx).toBeGreaterThan(0);
    expect(dz).toBeLessThan(0);
  });
  it('Drosselung: höchstens alle 500 ms (Server 2/s); die lokale Reaktion läuft trotzdem', () => {
    const t = setup();
    t.emitFig('add');
    hit(t); hit(t);
    expect(t.out).toHaveLength(1);
    expect(t.fig.hitReact).toHaveBeenCalledTimes(2);
    t.advance(SEND_GAP_MS - 1); hit(t);
    expect(t.out).toHaveLength(1);
    t.advance(2); hit(t);
    expect(t.out).toHaveLength(2);
  });
  it('nie in VR; nicht an VR-Ziele; nicht ohne Fähigkeit/Verbindung; nicht über 3,4 m', () => {
    const vr = setup({ xr: true });
    vr.emitFig('add'); hit(vr);
    expect(vr.out).toHaveLength(0);
    const tv = setup({ peerFlags: 1 | F.VR });
    tv.emitFig('add'); hit(tv);
    expect(tv.out).toHaveLength(0);
    expect(tv.fig.hitReact).toHaveBeenCalled();
    const nc = setup({ nocap: 'push' });
    nc.emitFig('add'); hit(nc);
    expect(nc.out).toHaveLength(0);
    const off = setup({ active: false });
    off.emitFig('add'); hit(off);
    expect(off.out).toHaveLength(0);
    const far = setup();
    far.emitFig('add');
    far.fig.root.position.z = 5 - SEND_DIST - 0.1;
    hit(far);
    expect(far.out).toHaveLength(0);
  });
  it('Nullvektor wird nicht gesendet', () => {
    const t = setup();
    t.emitFig('add');
    hit(t, { x: 0, z: 0 });
    expect(t.out).toHaveLength(0);
  });
});

describe('push: Empfang (x.pu → knock)', () => {
  const pu = (o = {}) => ({ t: 'x', ev: [{ t: 'pu', c: 7, d: [0, 100], s: 100, ...o }] });
  it('knock mit Richtung und Stärke aus collide.js (PUSH_KNOCK * s/100), ohne Sprung; Ton', () => {
    const t = setup();
    t.part.x(pu());
    expect(t.ctx.player.knock).toHaveBeenCalledTimes(1);
    const [dir, str] = t.ctx.player.knock.mock.calls[0];
    expect(dir.x).toBeCloseTo(0, 2);
    expect(dir.z).toBeCloseTo(1, 2);
    expect(dir.up).toBe(0);
    expect(str).toBeCloseTo(PUSH_KNOCK, 6);
    expect(t.sound.play).toHaveBeenCalled();
    t.advance(RECV_GAP_MS + 1);
    t.part.x(pu({ s: 50 }));
    expect(t.ctx.player.knock.mock.calls[1][1]).toBeCloseTo(PUSH_KNOCK / 2, 6);
  });
  it('Stärke wird auf 1..100 geklemmt', () => {
    const t = setup();
    t.part.x(pu({ s: 5000 }));
    expect(t.ctx.player.knock.mock.calls[0][1]).toBeCloseTo(PUSH_KNOCK, 6);
  });
  it('Rate: höchstens alle 350 ms', () => {
    const t = setup();
    t.part.x(pu()); t.part.x(pu());
    expect(t.ctx.player.knock).toHaveBeenCalledTimes(1);
    t.advance(RECV_GAP_MS + 1);
    t.part.x(pu());
    expect(t.ctx.player.knock).toHaveBeenCalledTimes(2);
  });
  it('ignoriert: in VR, nicht im Laufmodus, von mir selbst, kaputte Nutzlast, Sender weit weg, Verbindung weg', () => {
    const vr = setup({ xr: true }); vr.part.x(pu());
    expect(vr.ctx.player.knock).not.toHaveBeenCalled();
    const np = setup({ playing: false }); np.part.x(pu());
    expect(np.ctx.player.knock).not.toHaveBeenCalled();
    const self = setup(); self.part.x(pu({ c: 1 }));
    expect(self.ctx.player.knock).not.toHaveBeenCalled();
    const bad = setup();
    bad.part.x(pu({ d: 'x' })); bad.part.x(pu({ s: NaN })); bad.part.x(pu({ d: [0, 0] })); bad.part.x({ t: 'x' });
    expect(bad.ctx.player.knock).not.toHaveBeenCalled();
    const far = setup(); far.fig.root.position.z = 40; far.part.x(pu());
    expect(far.ctx.player.knock).not.toHaveBeenCalled();
    const off = setup({ active: false }); off.part.x(pu());
    expect(off.ctx.player.knock).not.toHaveBeenCalled();
    const gone = setup(); gone.part.dispose(); gone.part.x(pu());
    expect(gone.ctx.player.knock).not.toHaveBeenCalled();
  });
  it('ohne Fremdfigur des Senders (LOD) wird trotzdem angewandt (Server prüft den Abstand)', () => {
    const t = setup({ noFigure: true });
    t.part.x(pu());
    expect(t.ctx.player.knock).toHaveBeenCalledTimes(1);
  });
  it('Fehler in knock/Ton werfen nicht', () => {
    const t = setup();
    t.ctx.player.knock = vi.fn(() => { throw new Error('x'); });
    expect(() => t.part.x(pu())).not.toThrow();
  });
});
