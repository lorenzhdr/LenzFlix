// VIDEOTHEK LENZ · net/richard.js (Welle c, C2): Autorität nur im Streit, Spiegel, Drahtformat, Rückfälle. Fake-Core und Fake-brawl, kein Netzwerk.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRichard, RS_KEEP_MS, MIRROR_TIMEOUT_MS, CLAIM_TIMEOUT_MS } from '../src/js/store3d/net/richard.js';
import { createFrame } from '../src/js/store3d/net/frame.js';

let now;
function setup(o = {}) {
  const bus = new Map();
  const sent = [];
  const st = { live: true, cap: o.cap !== false, vr: false, sendOk: true, me: { c: 7, k: 'aaaaaaaaaaaa', admin: false } };
  const net = { f: { v: 1, s: 0, h: 0, r: 0 }, x: 4.2, z: 16, y: 0, yaw: 0, a: 0 };
  const calls = [];
  let hook = null;
  const brawl = {
    setNetRole: vi.fn((r, opt) => { calls.push(['role', r, opt]); return true; }),
    getNetState: vi.fn(() => ({ ...net, f: { ...net.f } })),
    applyRemote: vi.fn((n, opt) => { calls.push(['apply', n, opt]); return true; }),
    setNet: vi.fn((h) => { hook = h; return () => { hook = null; }; }),
    resetLocal: vi.fn(),
  };
  const figs = new Map();
  const core = {
    ctx: { use: (n) => (n === 'brawl' ? brawl : null), xr: { presenting: () => st.vr } },
    frame: createFrame({ w: 12.5, d: 18 }),
    send: vi.fn((m) => { if (!st.sendOk) return false; sent.push(m); return true; }),
    me: () => st.me,
    cap: (n) => st.cap && n === 'rich',
    active: () => st.live,
    peers: { get: (c) => (figs.has(c) ? { figure: figs.get(c) } : null) },
    on: (t, fn) => { const l = bus.get(t) || new Set(); l.add(fn); bus.set(t, l); return () => l.delete(fn); },
  };
  const part = createRichard(core);
  const emit = (t, e) => { for (const fn of [...(bus.get(t) || [])]) fn(e); };
  const tickTo = (ms) => { now += ms; part.tick(0.016); };
  return { part, core, brawl, st, net, sent, calls, emit, tickTo, figs, hook: () => hook };
}

beforeEach(() => { now = 1000; vi.spyOn(performance, 'now').mockImplementation(() => now); });
afterEach(() => vi.restoreAllMocks());

describe('net/richard: Autorität nur im Streit', () => {
  it('ohne Fähigkeit rich oder ohne Verbindung bleibt Richard lokal (kein rc)', () => {
    const a = setup({ cap: false });
    a.part.tick(0.016);
    expect(a.hook().claim()).toBe(false);
    expect(a.sent).toEqual([]);
    const b = setup();
    b.st.live = false;
    b.part.tick(0.016);
    expect(b.hook().claim()).toBe(false);
  });

  it('Treffer außerhalb der Autorität: rc, danach ra mit mir macht mich zum Inhaber', () => {
    const s = setup();
    s.part.tick(0.016);
    expect(s.hook().claim()).toBe(true);
    expect(s.sent).toEqual([{ t: 'rc' }]);
    expect(s.part.role()).toBe('owner');
    s.net.f = { v: 1, s: 1, h: 1, r: 25 };
    s.tickTo(300);
    expect(s.sent.filter((m) => m.t === 'rs')).toEqual([]); // erst nach ra (g unbekannt)
    s.emit('ra', { c: 7, g: 3, tg: 7 });
    s.tickTo(300);
    const rs = s.sent.filter((m) => m.t === 'rs');
    expect(rs).toHaveLength(1);
    expect(rs[0].g).toBe(3);
    expect(rs[0].tg).toBe(7);
  });

  it('Drahtformat rs.q: [s,h,r(ds),x,y,z(cm im Netzrahmen),yaw(cRad),a]', () => {
    const s = setup();
    s.part.tick(0.016);
    s.hook().claim();
    s.emit('ra', { c: 7, g: 1, tg: 7 });
    s.net.f = { v: 1, s: 4, h: 3, r: 31.26 };
    s.net.x = 6.25; s.net.z = 9; s.net.y = 1.45; s.net.yaw = -1.57; s.net.a = 7;
    s.tickTo(300);
    const q = s.sent.find((m) => m.t === 'rs').q;
    const [cx, cy, cz] = s.core.frame.enc(6.25, 1.45, 9, 0);
    expect(q).toEqual([4, 3, 313, cx, cy, cz, -157, 7]);
  });

  it('Takt: ≤ 5 Hz bei Änderung, 1 Hz ohne Änderung, nichts ohne Änderung dazwischen', () => {
    const s = setup();
    s.part.tick(0.016);
    s.hook().claim();
    s.emit('ra', { c: 7, g: 1, tg: 7 });
    s.net.f = { v: 1, s: 5, h: 3, r: 20 };
    s.tickTo(250);
    expect(s.sent.filter((m) => m.t === 'rs')).toHaveLength(1);
    s.tickTo(100); // zu früh, keine Änderung
    expect(s.sent.filter((m) => m.t === 'rs')).toHaveLength(1);
    s.net.x = 8; // Änderung, aber < 200 ms seit dem letzten Senden
    s.tickTo(50);
    expect(s.sent.filter((m) => m.t === 'rs')).toHaveLength(1);
    s.tickTo(200);
    expect(s.sent.filter((m) => m.t === 'rs')).toHaveLength(2);
    s.tickTo(RS_KEEP_MS - 10); // keine Änderung: erst nach 1 s
    expect(s.sent.filter((m) => m.t === 'rs')).toHaveLength(2);
    s.tickTo(20);
    expect(s.sent.filter((m) => m.t === 'rs')).toHaveLength(3);
  });

  it('Ende des Streits (calm) und spitze Phase: Abschluss-rs mit s=0, dann rr; Richard bleibt lokal', () => {
    for (const end of [0, 6]) {
      const s = setup();
      s.part.tick(0.016);
      s.hook().claim();
      s.emit('ra', { c: 7, g: 4, tg: 7 });
      s.net.f = { v: 1, s: end, h: 0, r: end === 6 ? 500 : 0 };
      s.tickTo(300);
      const types = s.sent.map((m) => m.t);
      expect(types).toEqual(['rc', 'rs', 'rr']);
      expect(s.sent[1].q[0]).toBe(0);
      expect(s.sent[2].g).toBe(4);
      expect(s.part.role()).toBe('local');
      expect(s.calls.at(-1)).toEqual(['role', 'local', undefined]);
    }
  });

  it('VR: nie Autorität, Inhaber gibt beim Wechsel in VR ab', () => {
    const s = setup();
    s.part.tick(0.016);
    s.st.vr = true;
    expect(s.hook().claim()).toBe(false);
    s.st.vr = false;
    s.hook().claim();
    s.emit('ra', { c: 7, g: 2, tg: 7 });
    s.net.f = { v: 1, s: 3, h: 3, r: 5 };
    s.st.vr = true;
    s.tickTo(300);
    expect(s.sent.map((m) => m.t)).toEqual(['rc', 'rs', 'rr']);
    expect(s.part.role()).toBe('local');
  });

  it('rc nicht sendbar (Cap beim Aushandeln fehlt): lokal bleiben', () => {
    const s = setup();
    s.part.tick(0.016);
    s.st.sendOk = false;
    expect(s.hook().claim()).toBe(false);
    expect(s.part.role()).toBe('local');
  });

  it('Anspruch ohne ra-Echo läuft nach 4 s zurück auf lokal', () => {
    const s = setup();
    s.part.tick(0.016);
    s.hook().claim();
    s.tickTo(CLAIM_TIMEOUT_MS + 100);
    expect(s.part.role()).toBe('local');
  });
});

describe('net/richard: Spiegel', () => {
  const rs = (over = {}) => ({ t: 'rs', c: 3, g: 2, tg: 3, q: [4, 3, 300, 600, 0, 900, 157, 6], ...over });

  it('fremde ra/rs: Spiegel, applyRemote mit dekodierten Metern/Sekunden und self=false', () => {
    const s = setup();
    s.part.tick(0.016);
    s.emit('ra', { c: 3, g: 2, tg: 3 });
    expect(s.calls[0]).toEqual(['role', 'mirror', { self: false }]);
    s.emit('rs', rs());
    const [, n, opt] = s.calls.find((c) => c[0] === 'apply');
    const [x, , z] = s.core.frame.dec(600, 0, 900, 0);
    expect(n).toEqual({ v: 1, f: { v: 1, s: 4, h: 3, r: 30 }, x, z, y: 0, yaw: 1.57, a: 6 });
    expect(opt).toEqual({ self: false });
    expect(s.part.role()).toBe('mirror');
  });

  it('Hausverbot nur für den Täter: self=true nur bei tg = ich', () => {
    const s = setup();
    s.part.tick(0.016);
    s.emit('ra', { c: 3, g: 2, tg: 7 });
    s.emit('rs', rs({ tg: 7, q: [5, 3, 200, 600, 0, 900, 0, 8] }));
    expect(s.calls.find((c) => c[0] === 'apply')[2]).toEqual({ self: true });
    const t = setup();
    t.part.tick(0.016);
    t.emit('rs', rs({ tg: 9 }));
    expect(t.calls.find((c) => c[0] === 'apply')[2]).toEqual({ self: false });
  });

  it('veraltetes g wird ignoriert; eigene rs auch', () => {
    const s = setup();
    s.part.tick(0.016);
    s.emit('ra', { c: 3, g: 5, tg: 3 });
    s.emit('rs', rs({ g: 4 }));
    expect(s.calls.filter((c) => c[0] === 'apply')).toHaveLength(0);
    s.emit('rs', rs({ c: 7, g: 6 }));
    expect(s.calls.filter((c) => c[0] === 'apply')).toHaveLength(0);
  });

  it('rs mit calm/grudge, ra c=0, 60 s Stille, stop: zurück auf lokal', () => {
    const s = setup();
    s.part.tick(0.016);
    s.emit('rs', rs());
    s.emit('rs', rs({ q: [0, 0, 0, 600, 0, 900, 0, 0] }));
    expect(s.part.role()).toBe('local');
    s.emit('rs', rs({ q: [0, 0, 0, 600, 0, 900, 0, 0] })); // Nachzügler: kein erneutes Spiegeln
    expect(s.part.role()).toBe('local');

    const b = setup();
    b.part.tick(0.016);
    b.emit('rs', rs({ g: 9 }));
    b.emit('ra', { c: 0, g: 9, tg: 0 });
    expect(b.part.role()).toBe('local');
    expect(b.calls.at(-1)[1]).toBe('local');

    const c = setup();
    c.part.tick(0.016);
    c.emit('rs', rs());
    c.tickTo(MIRROR_TIMEOUT_MS - 1000);
    expect(c.part.role()).toBe('mirror');
    c.tickTo(2000);
    expect(c.part.role()).toBe('local');

    const d = setup();
    d.part.tick(0.016);
    d.emit('rs', rs());
    d.part.stop();
    expect(d.part.role()).toBe('local');
    expect(d.calls.at(-1)[1]).toBe('local');
  });

  it('Spiegeln funktioniert auch in VR (nur Anzeige)', () => {
    const s = setup();
    s.st.vr = true;
    s.part.tick(0.016);
    s.emit('rs', rs());
    expect(s.part.role()).toBe('mirror');
    expect(s.sent).toEqual([]);
  });

  it('er deny auf rc: zurück auf Spiegel, letzter Stand der Autorität wird wieder angewandt', () => {
    const s = setup();
    s.part.tick(0.016);
    s.emit('rs', rs());
    s.calls.length = 0;
    s.hook().claim();
    expect(s.part.role()).toBe('owner');
    s.emit('er', { c: 'deny', y: 'rc' });
    expect(s.part.role()).toBe('mirror');
    expect(s.calls.some((c) => c[0] === 'apply')).toBe(true);
    // andere er-Typen/Codes lassen die Rolle in Ruhe
    s.emit('er', { c: 'rate', y: 'm' });
    expect(s.part.role()).toBe('mirror');
  });

  it('Übernahme: ra mit mir nach fremder Autorität macht mich zum Inhaber, ra fremd danach wieder zum Spiegel', () => {
    const s = setup();
    s.part.tick(0.016);
    s.emit('rs', rs());
    s.hook().claim();
    s.emit('ra', { c: 7, g: 3, tg: 7 });
    expect(s.part.role()).toBe('owner');
    s.emit('ra', { c: 5, g: 4, tg: 5 });
    expect(s.part.role()).toBe('mirror');
  });

  it('wl.ra mit fremder Autorität startet als Spiegel; ohne ra bleibt alles lokal', () => {
    const s = setup();
    s.part.welcome({ ra: { c: 3, g: 2, tg: 3 } });
    expect(s.part.role()).toBe('mirror');
    const t = setup();
    t.part.welcome({ ra: { c: 0, g: 0, tg: 0 } });
    expect(t.part.role()).toBe('local');
    expect(t.calls).toEqual([]);
  });

  it('Kassetten-Ziel: Figur des Täters (tg) über core.peers', () => {
    const s = setup();
    s.figs.set(3, { root: { position: { x: 5, y: 0, z: 6 } } });
    s.part.tick(0.016);
    s.emit('ra', { c: 3, g: 1, tg: 3 });
    expect(s.hook().aim()).toEqual({ x: 5, y: 0, z: 6 });
    s.figs.clear();
    expect(s.hook().aim()).toBeNull();
  });

  it('dispose: Haken weg, Rolle lokal', () => {
    const s = setup();
    s.part.tick(0.016);
    s.emit('rs', rs());
    s.part.dispose();
    expect(s.hook()).toBeNull();
    expect(s.part.role()).toBe('local');
  });
});
