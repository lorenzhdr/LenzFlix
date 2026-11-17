/* global process */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import {
  createState, step, precheck, attOf, SERVER_CAPS, STORE_PREFIXES, SUBS, RENEW_MS, ALARM_MS,
} from '../src/mp/room.js';

const GOLDEN = new URL('./fixtures/mp-golden/core.json', import.meta.url);
const NOW0 = 1_700_000_000_000;
const K = (ch) => ch.repeat(12);
const claims = (ch, n, extra = {}) => ({ k: K(ch), n, a: 0, e: NOW0 + 3_600_000, j: 'jti-' + ch + (extra.j || ''), ...extra });

// Kleine Fake-Welt: wendet die Effekte an und sammelt die Frames je Verbindung.
function world(opts = {}) {
  const w = {
    now: NOW0, frames: {}, raw: [], closes: [], store: {}, atts: {}, alarmAt: null, renews: [],
    rand: () => 0.5,
  };
  w.st = createState({ cfg: opts.cfg, store: opts.store, now: w.now });
  w.ev = (e, dt = 0) => {
    w.now += dt;
    const r = step(w.st, e, w.now, w.rand);
    for (const o of r.out) {
      if (o.kind === 'send') {
        w.raw.push(o);
        const f = o.data === 'pong' ? 'pong' : JSON.parse(o.data);
        for (const c of o.to) (w.frames[c] ||= []).push(f);
      } else if (o.kind === 'att') w.atts[o.c] = o.att;
      else if (o.kind === 'renew') w.renews.push(o);
    }
    for (const s of r.store) { if (s.op === 'put') w.store[s.key] = s.val; else delete w.store[s.key]; }
    for (const c of r.close) w.closes.push(c);
    w.alarmAt = r.alarmAt;
    return r;
  };
  w.open = (cl, dt = 0) => w.ev({ type: 'open', claims: cl }, dt).c;
  w.msg = (c, arr, dt = 0) => w.ev({ type: 'message', c, data: typeof arr === 'string' ? arr : JSON.stringify(arr) }, dt);
  w.join = (ch, n, hi = {}, dt = 0) => {
    const c = w.open(claims(ch, n, hi.claims), dt);
    w.msg(c, [{ t: 'hi', pv: 1, cap: ['pres'], f: 3, cv: '1.16.0', ...hi.hi }]);
    return c;
  };
  w.take = (c) => { const f = w.frames[c] || []; w.frames[c] = []; return f; };
  w.closed = (c) => w.closes.filter((x) => x.c === c).map((x) => x.code);
  return w;
}
const bye = (frames) => frames.find((f) => f.t === 'bye');
const POSE = (x = 1250, a = 1) => ({ t: 'p', q: [x, 0, 800, -100, 20, a, 0] });

afterEach(() => vi.restoreAllMocks());

describe('mp-room: Handshake', () => {
  it('hi -> wl mit Schnittmenge der Faehigkeiten', () => {
    const w = world();
    const c = w.join('a', 'Anna', { hi: { cap: ['pres', 'chat', 'kino', 'zzz'] } });
    expect(c).toBe(1);
    const [wl] = w.take(c);
    expect(wl).toEqual({
      t: 'wl', pv: 1, c: 1, k: K('a'), s: NOW0, ad: 0, cap: ['pres', 'chat', 'kino'], cf: { pr: 8, ph: 8 }, kh: [], peers: [],
    });
    expect(SERVER_CAPS).toEqual(expect.arrayContaining(['pres', 'chat', 'emote', 'admin'])); // Unter-Reducer kuendigen ihre Faehigkeiten an (ab Welle c auch phys/push)
  });
  it('Admin-Kennung', () => {
    const w = world();
    const c = w.join('a', 'Anna', { claims: { a: 1 } });
    expect(w.take(c)[0].ad).toBe(1);
  });
  it('pv unter dem Minimum: 4001 pv', () => {
    const w = world();
    const c = w.open(claims('a', 'Anna'));
    w.msg(c, [{ t: 'hi', pv: 0 }]);
    expect(w.closed(c)).toEqual([4001]);
    expect(bye(w.take(c))).toEqual({ t: 'bye', c: 'pv' });
  });
  it('kaputtes hi: 4000 bad', () => {
    const w = world();
    const c = w.open(claims('a', 'Anna'));
    w.msg(c, [{ t: 'hi', pv: 'x' }]);
    expect(w.closed(c)).toEqual([4000]);
  });
  it('kein hi binnen 10 s: 4408 hello (bei der naechsten Nachricht und im Alarm)', () => {
    const w = world();
    const c = w.open(claims('a', 'Anna'));
    const d = w.join('b', 'Ben');
    w.msg(d, [POSE()], 11000);
    expect(w.closed(c)).toEqual([4408]);
    expect(bye(w.take(c))).toEqual({ t: 'bye', c: 'hello' });
    const w2 = world();
    const c2 = w2.open(claims('a', 'Anna'));
    w2.ev({ type: 'alarm' }, 61000);
    expect(w2.closed(c2)).toEqual([4408]);
  });
  it('Nachricht vor hi wird ignoriert, doppeltes hi auch', () => {
    const w = world();
    const c = w.open(claims('a', 'Anna'));
    w.msg(c, [POSE()]);
    expect(Object.keys(w.st.dirty)).toHaveLength(0);
    w.msg(c, [{ t: 'hi', pv: 1 }]);
    w.msg(c, [{ t: 'hi', pv: 1, f: 15 }]);
    expect(w.st.peers[c].f).toBe(0);
  });
  it('Text ping -> pong, ungebuendelt', () => {
    const w = world();
    const c = w.join('a', 'Anna');
    w.take(c);
    w.msg(c, 'ping');
    expect(w.take(c)).toEqual(['pong']);
  });
  it('ck wird sofort mit Serverzeit beantwortet', () => {
    const w = world();
    const c = w.join('a', 'Anna');
    w.take(c);
    w.msg(c, [{ t: 'ck', a: 555.5 }], 40);
    expect(w.take(c)).toEqual([{ t: 'ck', a: 555.5, s: NOW0 + 40 }]);
  });
});

describe('mp-room: Praesenz', () => {
  it('j an Bisherige, wl mit Peers fuer den Neuen, l beim Verlassen', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    w.take(a);
    w.ev({ type: 'message', c: a, data: JSON.stringify([POSE(1000, 0)]) }, 5);
    w.take(a);
    const b = w.join('b', 'Ben', { hi: { f: 1 } }, 10);
    const fa = w.take(a);
    expect(fa).toHaveLength(1);
    expect(fa[0].t).toBe('b');
    expect(fa[0].ev).toEqual([{ t: 'j', c: b, k: K('b'), n: 'Ben', f: 1, j: NOW0 + 15 }]);
    const fb = w.take(b);
    expect(fb).toHaveLength(1); // nur wl, nicht das eigene j
    expect(fb[0].peers).toEqual([{ c: a, k: K('a'), n: 'Anna', f: 3, j: NOW0, q: [1000, 0, 800, -100, 20, 0, 0] }]);
    w.ev({ type: 'close', c: b }, 20);
    expect(w.take(a)[0].ev).toEqual([{ t: 'l', c: b }]);
    expect(w.closes).toEqual([]); // Close vom Client: kein weiteres Close
  });
  it('Verlassen ohne hi erzeugt kein l', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.open(claims('b', 'Ben'));
    w.take(a);
    w.ev({ type: 'close', c: b });
    expect(w.take(a)).toEqual([]);
  });
  it('Pose-Relay: Eintrag [c,x,y,z,yaw,pitch,a,r,d,se?]', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.take(a); w.take(b);
    w.msg(a, [{ t: 'p', q: [500, 0, 4000, 0, 0, 7, 1], se: [3, 500] }], 300);
    const f = w.take(b)[0];
    expect(f).toEqual({ t: 'b', s: NOW0 + 300, p: [[a, 500, 0, 4000, 0, 0, 7, 1, 0, [3, 500]]] });
    expect(w.take(a)[0].p[0][0]).toBe(a); // auch der Absender bekommt den Frame (ignoriert eigenes c)
  });
});

describe('mp-room: Verbindungslimits', () => {
  it('gleiches k: vier ja, fuenfte 4409 dup', () => {
    const w = world();
    for (let i = 0; i < 4; i++) w.join('a', 'Anna', { claims: { j: 'x' + i } });
    const c = w.open(claims('a', 'Anna', { j: 'x5' }));
    expect(w.closed(c)).toEqual([4409]);
    expect(bye(w.take(c))).toEqual({ t: 'bye', c: 'dup' });
    expect(Object.keys(w.st.peers)).toHaveLength(4);
  });
  it('16 Verbindungen, die 17. 4503 full', () => {
    const w = world();
    for (let i = 0; i < 16; i++) w.join(i.toString(16).padStart(1, '0') + '', 'N' + i, { claims: { k: String(i).padStart(12, '0'), j: 'q' + i } });
    const c = w.open(claims('f', 'Extra', { k: 'ffffffffffff', j: 'q99' }));
    expect(w.closed(c)).toEqual([4503]);
    expect(bye(w.take(c))).toEqual({ t: 'bye', c: 'full' });
  });
  it('MP_MAX_CONN aus der Konfiguration', () => {
    const w = world({ cfg: { maxConn: 2 } });
    w.join('a', 'A'); w.join('b', 'B');
    expect(w.closed(w.open(claims('c', 'C')))).toEqual([4503]);
  });
  it('c ist laufende Nummer; nach Kaltstart max(c)+1', () => {
    const w = world();
    const a = w.join('a', 'A');
    const b = w.join('b', 'B');
    expect([a, b]).toEqual([1, 2]);
    const st2 = createState({ atts: Object.values(w.atts), now: NOW0 + 5 });
    expect(st2.nextC).toBe(3);
  });
});

describe('mp-room: jti und Bans', () => {
  it('jti ist einmalig (precheck und open)', () => {
    const w = world();
    const cl = claims('a', 'Anna');
    expect(precheck(w.st, cl, w.now)).toEqual({ ok: true });
    w.open(cl);
    expect(w.store['j:' + cl.j]).toBe(cl.e);
    expect(precheck(w.st, cl, w.now)).toEqual({ ok: false, status: 401 });
    const c2 = w.open(cl);
    expect(w.closed(c2)).toEqual([4401]);
  });
  it('precheck: abgelaufen oder kaputt', () => {
    const w = world();
    expect(precheck(w.st, { ...claims('a', 'A'), e: w.now - 1 }, w.now).ok).toBe(false);
    expect(precheck(w.st, { ...claims('a', 'A'), k: 'x' }, w.now).ok).toBe(false);
    expect(precheck(w.st, null, w.now).ok).toBe(false);
    expect(precheck(w.st, { ...claims('a', 'A'), j: '' }, w.now).ok).toBe(false);
  });
  it('Ban: 4403 mit bye u, abgelaufene Bans verschwinden im Alarm', () => {
    const until = NOW0 + 600000;
    const w = world({ store: { ['b:' + K('a')]: until } });
    const c = w.open(claims('a', 'Anna'));
    expect(w.closed(c)).toEqual([4403]);
    expect(bye(w.take(c))).toEqual({ t: 'bye', c: 'ban', u: until });
    w.join('b', 'B');
    w.ev({ type: 'alarm' }, 700000);
    expect(w.store['b:' + K('a')]).toBeUndefined();
    expect(w.st.store['b:' + K('a')]).toBeUndefined();
  });
  it('jti-Zeilen werden nach Ablauf geloescht', () => {
    const w = world();
    const a = w.join('a', 'A', { claims: { e: NOW0 + 1000 } });
    expect(w.store['j:jti-a']).toBeDefined();
    w.msg(a, [POSE()], 2000);
    w.ev({ type: 'alarm', auto: { [a]: NOW0 + 2000 } }, 10);
    expect(w.store['j:jti-a']).toBeUndefined();
  });
});

describe('mp-room: Flags und Privatsphaere', () => {
  const HID = '0123456789abcdef0123456789abcdef';
  it('ohne Namen-Bit kein Name, ohne Film-Bit keine Huelle', () => {
    const w = world();
    const a = w.join('a', 'GeheimerName', { hi: { f: 0 } });
    const b = w.join('b', 'Ben', { hi: { f: 3 } });
    w.msg(b, [{ t: 'hd', i: HID }]);
    w.take(a); w.take(b);
    const c = w.join('c', 'Cleo', { hi: { f: 0 } });
    const wl = w.take(c)[0];
    const pa = wl.peers.find((p) => p.c === a);
    const pb = wl.peers.find((p) => p.c === b);
    expect(pa.n).toBe('');
    expect(pa.h).toBeUndefined();
    expect(pb.n).toBe('Ben');
    expect(pb.h).toBe(HID);
    const all = JSON.stringify(w.raw.map((r) => r.data));
    expect(all).not.toContain('GeheimerName');
  });
  it('Wechsel per f: pf mit Name/Huelle, bei Film aus h=null', () => {
    const w = world();
    const a = w.join('a', 'Anna', { hi: { f: 3 } });
    const b = w.join('b', 'Ben');
    w.msg(a, [{ t: 'hd', i: HID }]);
    w.take(a); w.take(b);
    w.msg(a, [{ t: 'f', f: 1 }], 10);
    expect(w.take(b)[0].ev).toEqual([{ t: 'pf', c: a, f: 1, n: 'Anna', h: null }]);
    w.msg(a, [{ t: 'f', f: 2 }], 10);
    expect(w.take(b)[0].ev).toEqual([{ t: 'pf', c: a, f: 2, n: '', h: HID }]);
  });
  it('hd: Hueelle wird gespeichert, aber nur mit Film-Bit gesendet', () => {
    const w = world();
    const a = w.join('a', 'Anna', { hi: { f: 1 } });
    const b = w.join('b', 'Ben');
    w.take(b);
    w.msg(a, [{ t: 'hd', i: HID }]);
    expect(w.take(b)[0].ev).toEqual([{ t: 'pf', c: a, f: 1, n: 'Anna', h: null }]);
    expect(w.st.peers[a].h).toBe(HID);
  });
  it('Leitung enthaelt nie jti, Ablauf, uid oder Token-Felder', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben', { claims: { a: 1 } });
    w.msg(a, [POSE(), { t: 'hd', i: HID }, { t: 'f', f: 7 }]);
    w.ev({ type: 'close', c: b });
    const text = w.raw.map((r) => r.data).join('');
    expect(text).not.toMatch(/jti-|uid|token|"x":|"e":/i);
    expect(text).not.toContain(String(NOW0 + 3_600_000));
  });
  it('Name wird gesaeubert und gekuerzt', () => {
    const w = world();
    const a = w.join('a', 'x', { claims: { n: '‮Evil​' + 'y'.repeat(40) } });
    expect(w.st.peers[a].n).toHaveLength(24);
    expect(w.st.peers[a].n.startsWith('Evil')).toBe(true);
    const e = w.join('e', 'x', { claims: { n: ' ​ ' } });
    expect(w.st.peers[e].n).toBe('Gast');
  });
  it('onFlags wird mit alt/neu aufgerufen', () => {
    const w = world();
    const spy = vi.spyOn(SUBS[0], 'onFlags');
    const a = w.join('a', 'Anna', { hi: { f: 1 } });
    w.msg(a, [{ t: 'f', f: 3 }]);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0].slice(2, 4)).toEqual([1, 3]);
  });
});

describe('mp-room: Buendelung', () => {
  it('Posen innerhalb von 100 ms bleiben dirty und fahren im naechsten Flush mit', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.take(a); w.take(b);
    w.msg(a, [POSE(1000)], 200); // erster Flush
    expect(w.take(b)).toHaveLength(1);
    w.msg(a, [POSE(1100)], 30);
    w.msg(a, [POSE(1200)], 30);
    expect(w.take(b)).toEqual([]);
    w.msg(a, [POSE(1300)], 50); // 110 ms seit Flush
    const f = w.take(b);
    expect(f).toHaveLength(1);
    expect(f[0].p).toHaveLength(1);
    expect(f[0].p[0][1]).toBe(1300);
    expect(f[0].p[0][8]).toBe(0);
  });
  it('d = ms seit Empfang der Pose', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.take(b);
    w.msg(a, [POSE(1000)], 500);
    w.take(b);
    w.msg(a, [POSE(1100)], 10);
    w.msg(a, [POSE(1200)], 10);
    w.ev({ type: 'alarm', auto: { [a]: w.now, [b]: w.now } }, 100);
    const f = w.take(b)[0];
    expect(f.p[0][8]).toBe(100);
  });
  it('Abschluss-Pose (a=0 / a=7) flusht sofort', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [POSE(1000)], 500);
    w.take(b);
    w.msg(a, [POSE(1100, 1)], 10);
    expect(w.take(b)).toEqual([]);
    w.msg(a, [POSE(1150, 0)], 10);
    expect(w.take(b)[0].p[0][1]).toBe(1150);
    w.msg(a, [POSE(1160, 1)], 10);
    w.msg(a, [{ t: 'p', q: [1160, 0, 800, 0, 0, 7, 1], se: [0, 0] }], 10);
    expect(w.take(b)).toHaveLength(1);
  });
  it('Ereignis-Typen flushen sofort (hd, f)', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [POSE(1000)], 500);
    w.take(b);
    w.msg(a, [POSE(1100, 1)], 5);
    w.msg(a, [{ t: 'hd', i: null }, { t: 'f', f: 1 }], 5);
    const f = w.take(b);
    expect(f).toHaveLength(1);
    expect(f[0].p).toHaveLength(1); // wartende Pose faehrt mit
    expect(f[0].ev[0].t).toBe('pf');
  });
  it('b wird nur einmal serialisiert (ein Sendeauftrag fuer alle)', () => {
    const w = world();
    w.join('a', 'A'); w.join('b', 'B'); const c = w.join('c', 'C');
    w.raw.length = 0;
    w.msg(c, [POSE(1, 0)], 500);
    expect(w.raw).toHaveLength(1);
    expect(w.raw[0].to).toHaveLength(3);
  });
});

describe('mp-room: Fehlverhalten und Raten', () => {
  it('bekannte Nachricht ohne ausgehandelte Faehigkeit: er cap', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    w.take(a);
    w.msg(a, [{ t: 'm', x: 'hallo' }], 5);
    expect(w.take(a)).toEqual([{ t: 'x', ev: [{ t: 'er', c: 'cap', y: 'm' }] }]);
  });
  it('unbekannte t: ignoriert, mehr als 30/min -> 4000', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    for (let i = 0; i < 30; i++) w.msg(a, [{ t: 'zz' }], 200);
    expect(w.closed(a)).toEqual([]);
    w.msg(a, [{ t: 'zz' }, 5, null, 'x', { x: 1 }], 200);
    expect(w.closed(a)).toEqual([4000]);
  });
  it('t wie constructor/__proto__ ist unbekannt', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    expect(() => w.msg(a, [{ t: 'constructor' }, { t: '__proto__' }, { t: 'toString' }])).not.toThrow();
    expect(w.closed(a)).toEqual([]);
  });
  it('Frame zu gross / Binaer / kein Array: 4000 bye bad', () => {
    for (const data of ['[' + ' '.repeat(2060) + ']', new ArrayBuffer(4), 'xx', '{}']) {
      const w = world();
      const a = w.join('a', 'Anna');
      w.take(a);
      w.ev({ type: 'message', c: a, data });
      expect(w.closed(a)).toEqual([4000]);
      expect(bye(w.take(a))).toEqual({ t: 'bye', c: 'bad' });
    }
  });
  it('Frame-Rate: dauerhaft ueber 12/s -> 4429 rate nach 3 s', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    w.take(a);
    for (let i = 0; i < 400 && !w.closed(a).length; i++) w.msg(a, [{ t: 'zz' }], 20);
    // unbekannte t zaehlen zusaetzlich; sauber testen mit ck
    const w2 = world();
    const b = w2.join('b', 'Ben');
    let n = 0;
    while (!w2.closed(b).length && n++ < 400) w2.msg(b, [{ t: 'f', f: 1 }], 20);
    expect(w2.closed(b)).toEqual([4429]);
    expect(n).toBeGreaterThan(100);
    expect(n).toBeLessThan(250);
  });
  it('p: ueber 10/s wird verworfen, ohne Close', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    for (let i = 0; i < 40; i++) w.msg(a, [POSE(1000 + i)], 5);
    expect(w.closed(a)).toEqual([]);
    expect(w.st.peers[a].q[0]).toBeLessThan(1039);
  });
  it('f/hd: 2/s', () => {
    const w = world();
    const a = w.join('a', 'Anna', { hi: { f: 0 } });
    for (let i = 1; i <= 6; i++) w.msg(a, [{ t: 'f', f: i }], 10);
    expect(w.st.peers[a].f).toBe(2);
  });
  it('rn: 1/min, erzeugt Auftrag renew fuer die Huelle', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    w.msg(a, [{ t: 'rn', tk: 'abc.def' }], 10);
    w.msg(a, [{ t: 'rn', tk: 'abc.def' }], 10);
    expect(w.renews).toEqual([{ kind: 'renew', c: a, tk: 'abc.def' }]);
    w.msg(a, [{ t: 'rn', tk: 'ab.cd' }], 61000);
    expect(w.renews).toHaveLength(2);
  });
  it('Handler-Ausnahme eines Unter-Reducers kippt den Raum nicht', () => {
    const w = world();
    const spy = vi.spyOn(SUBS[1], 'onOpen').mockImplementation(() => { throw new Error('x'); });
    const a = w.join('a', 'Anna');
    expect(spy).toHaveBeenCalled();
    expect(w.st.peers[a].live).toBe(true);
  });
});

describe('mp-room: Renew und Fristen', () => {
  it('x laeuft ab: 4401 auth', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    w.take(a);
    w.ev({ type: 'alarm', auto: { [a]: NOW0 + RENEW_MS + 1000 } }, RENEW_MS + 1000);
    expect(w.closed(a)).toEqual([4401]);
    expect(bye(w.take(a))).toEqual({ t: 'bye', c: 'auth' });
  });
  it('renew-ok verlaengert, uebernimmt Name und Admin, meldet Namensaenderung', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.take(a); w.take(b);
    w.ev({ type: 'renew-ok', c: a, claims: { ...claims('a', 'Anna Neu', { j: 'r1' }), a: 1 } }, RENEW_MS - 60000);
    expect(w.st.peers[a].x).toBe(w.now + RENEW_MS);
    expect(w.st.peers[a].a).toBe(1);
    expect(w.take(b).flatMap((f) => f.ev || []).find((e) => e.t === 'pf').n).toBe('Anna Neu');
    expect(w.store['j:r1']).toBeDefined();
  });
  it('renew-ok mit anderem k oder gebrauchter jti: 4401; renew-fail: 4401', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    w.ev({ type: 'renew-ok', c: a, claims: claims('b', 'X') });
    expect(w.closed(a)).toEqual([4401]);
    const w2 = world();
    const b = w2.join('b', 'Ben');
    w2.ev({ type: 'renew-ok', c: b, claims: { ...claims('b', 'Ben'), j: 'jti-b' } });
    expect(w2.closed(b)).toEqual([4401]);
    const w3 = world();
    const c = w3.join('c', 'Cleo');
    w3.ev({ type: 'renew-fail', c });
    expect(w3.closed(c)).toEqual([4401]);
  });
  it('tote Sockets: 1011 ohne bye, Auto-Response haelt am Leben', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.take(a); w.take(b);
    w.ev({ type: 'alarm', auto: { [b]: NOW0 + 95000 } }, 100000);
    expect(w.closed(a)).toEqual([1011]);
    expect(w.closed(b)).toEqual([]);
    expect(bye(w.take(a))).toBeUndefined();
    expect(w.take(b)[0].ev).toEqual([{ t: 'l', c: a }]);
  });
  it('alarmAt: now+60 s solange Verbindungen bestehen, sonst null; Unter-Reducer-Frist frueher', () => {
    const w = world();
    expect(w.alarmAt).toBeNull();
    const a = w.join('a', 'Anna');
    expect(w.alarmAt).toBe(w.now + ALARM_MS);
    const spy = vi.spyOn(SUBS[3], 'nextDeadline').mockReturnValue(w.now + 5000);
    w.msg(a, [POSE()]);
    expect(w.alarmAt).toBe(NOW0 + 5000);
    spy.mockReturnValue(w.now + 999999);
    w.msg(a, [POSE()]);
    expect(w.alarmAt).toBe(w.now + ALARM_MS);
    w.ev({ type: 'close', c: a });
    expect(w.alarmAt).toBeNull();
  });
});

describe('mp-room: Kontingent-Sparwaechter', () => {
  it('60 %: cf pr4/ph5; 95 %: cf pr2/ph2, neue Verbindungen 4503 quota; neuer Tag: zurueck', () => {
    const w = world({ cfg: { dailyReq: 100 } });
    const a = w.join('a', 'Anna'); // 1 (Upgrade)
    w.take(a);
    for (let i = 0; i < 58; i++) w.ev({ type: 'alarm', auto: { [a]: w.now } });
    expect(w.st.lvl).toBe(0);
    w.ev({ type: 'alarm', auto: { [a]: w.now } });
    expect(w.st.lvl).toBe(1);
    expect(w.take(a).flatMap((f) => f.ev || [])).toContainEqual({ t: 'cf', pr: 4, ph: 5 });
    for (let i = 0; i < 36; i++) w.ev({ type: 'alarm', auto: { [a]: w.now } });
    expect(w.st.lvl).toBe(2);
    expect(w.take(a).flatMap((f) => f.ev || [])).toContainEqual({ t: 'cf', pr: 2, ph: 2 });
    const c = w.open(claims('c', 'Cleo'));
    expect(w.closed(c)).toEqual([4503]);
    expect(bye(w.take(c))).toEqual({ t: 'bye', c: 'quota' });
    w.ev({ type: 'alarm', auto: { [a]: w.now + 86400000 } }, 86400000);
    expect(w.st.lvl).toBe(0);
    expect(w.st.qn).toBeLessThan(5);
    expect(w.store.quota.d).toBe(new Date(w.now).toISOString().slice(0, 10));
  });
  it('wl traegt die aktuelle Stufe', () => {
    const w = world({ cfg: { dailyReq: 10 } });
    for (let i = 0; i < 7; i++) w.ev({ type: 'alarm' });
    const c = w.join('a', 'Anna');
    expect(w.take(c)[0].cf).toEqual({ pr: 4, ph: 5 });
  });
  it('Frames zaehlen 1/20; quota wird alle 500 Frames gespeichert', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const before = w.store.quota.n;
    for (let i = 0; i < 499; i++) w.msg(a, 'ping');
    for (let i = 0; i < 498; i++) w.msg(a, [{ t: 'ck', a: 1 }], 100);
    const mid = w.store.quota.n;
    w.msg(a, [{ t: 'ck', a: 1 }], 100);
    w.msg(a, [{ t: 'ck', a: 1 }], 100);
    expect(w.store.quota.n).toBeGreaterThan(mid);
    expect(w.store.quota.n - before).toBeGreaterThan(20);
  });
  it('Kaltstart liest quota und seed aus dem Speicher', () => {
    const w = world({ store: { quota: { d: '2023-11-14', n: 77 }, seed: 1234, sv: 1 } });
    expect(w.st.seed).toBe(1234);
    expect(w.st.qn).toBe(77);
    w.ev({ type: 'alarm' });
    expect(w.store.seed).toBeUndefined(); // nicht erneut geschrieben
  });
  it('seed und sv werden einmalig angelegt', () => {
    const w = world();
    w.join('a', 'A');
    expect(w.store.seed).toBe(2147483648);
    expect(w.store.sv).toBe(1);
  });
});

describe('mp-room: Attachments, Kaltstart, Unter-Reducer', () => {
  it('Attachment unter 1 kB, auch mit langem Namen und Pose', () => {
    const w = world();
    const a = w.join('a', 'Anna', { claims: { n: 'N'.repeat(24) }, hi: { cap: ['pres', 'chat', 'emote', 'push', 'phys', 'rich', 'wx', 'kino', 'admin'] } });
    w.msg(a, [{ t: 'p', q: [-3000, -200, 5400, -315, -157, 8, 2], se: [5, 1000] }, { t: 'hd', i: 'f'.repeat(32) }]);
    expect(JSON.stringify(w.atts[a]).length).toBeLessThan(1000);
    expect(JSON.stringify(attOf(w.st.peers[a])).length).toBeLessThan(1000);
  });
  it('Kaltstart aus Attachments: Peers live, Nachrichten gehen weiter', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [POSE(900)], 300);
    const st2 = createState({ store: w.store, atts: [w.atts[a], w.atts[b]].map((x) => structuredClone(x)), now: w.now });
    expect(Object.keys(st2.peers)).toHaveLength(2);
    const r = step(st2, { type: 'message', c: b, data: JSON.stringify([POSE(777, 0)]) }, w.now + 500, () => 0.1);
    const f = JSON.parse(r.out.find((o) => o.kind === 'send').data);
    expect(f.p[0].slice(0, 2)).toEqual([b, 777]);
    const o = step(st2, { type: 'open', claims: claims('c', 'Cleo') }, w.now + 600, () => 0.1);
    expect(o.c).toBe(3);
  });
  it('Unter-Reducer-Haken: welcome, onOpen, onClose, onAlarm, close mit Grund', () => {
    const w = world();
    const chat = SUBS[0];
    vi.spyOn(chat, 'welcome').mockReturnValue({ kh: [] });
    const onOpen = vi.spyOn(chat, 'onOpen');
    const onClose = vi.spyOn(chat, 'onClose');
    const onAlarm = vi.spyOn(chat, 'onAlarm');
    const a = w.join('a', 'Anna');
    expect(w.take(a)[0].kh).toEqual([]);
    expect(onOpen).toHaveBeenCalledTimes(1);
    const b = w.join('b', 'Ben');
    w.take(a);
    onClose.mockImplementation((st, p, cx) => { cx.sendTo(a, { t: 'er', c: 'off' }); });
    w.ev({ type: 'close', c: b });
    expect(onClose.mock.calls[0][1].c).toBe(b);
    expect(w.take(a).flatMap((f) => f.ev)).toEqual(expect.arrayContaining([{ t: 'l', c: b }]));
    w.ev({ type: 'alarm', auto: { [a]: w.now } });
    expect(onAlarm).toHaveBeenCalled();
    vi.spyOn(chat, 'onOpen').mockImplementation((st, p, cx) => { if (p.k === K('d')) cx.close(p.c, 4403, { c: 'ban', u: 5 }, 'kick'); });
    w.take(a);
    const k = w.join('d', 'Kick');
    expect(w.closed(k)).toEqual([4403]);
    expect(w.take(a).flatMap((f) => f.ev || [])).toContainEqual({ t: 'l', c: k, r: 'kick' });
  });
  it('STORE_PREFIXES enthaelt Kern und Unter-Reducer-Schluessel', () => {
    expect(STORE_PREFIXES).toEqual(expect.arrayContaining(['sv', 'seed', 'quota', 'b:', 'j:']));
  });
  it('room.js/protocol.js/limits.js: keine Timer, keine Node-/CF-APIs', () => {
    for (const f of ['room', 'protocol', 'limits', 'chat', 'phys', 'rich', 'kino']) {
      const src = readFileSync(new URL(`../src/mp/${f}.js`, import.meta.url), 'utf8');
      expect(src).not.toMatch(/setTimeout|setInterval|cloudflare:|node:|require\(|Math\.random\(|Date\.now/);
    }
  });
});

describe('mp-room: Golden s2c', () => {
  // Deterministisches Szenario; mit MP_GOLDEN_WRITE=1 wird die Golden-Datei neu geschrieben.
  function scenario() {
    const w = world();
    const out = {};
    const a = w.open({ k: 'aaaaaaaaaaaa', n: 'Anna', a: 0, e: NOW0 + 60000, j: 'g1' });
    w.msg(a, [{ t: 'hi', pv: 1, cap: ['pres', 'chat'], f: 3, cv: '1.16.0' }]);
    out.wl_first = w.take(a)[0];
    w.msg(a, [{ t: 'hd', i: '0123456789abcdef0123456789abcdef' }], 200);
    w.take(a);
    w.msg(a, [{ t: 'p', q: [1250, 0, 800, -100, 20, 1, 0] }], 100);
    const b = w.open({ k: 'bbbbbbbbbbbb', n: 'Ben', a: 1, e: NOW0 + 60000, j: 'g2' }, 50);
    w.msg(b, [{ t: 'hi', pv: 1, cap: ['pres'], f: 1, cv: '1.16.0' }]);
    out.wl_second = w.take(b)[0];
    out.b_join = w.take(a).find((f) => f.ev);
    w.msg(b, [{ t: 'p', q: [500, 0, 4000, 0, 0, 7, 1], se: [3, 500] }], 150);
    out.b_pose = w.take(a)[0];
    w.take(b);
    w.msg(a, [{ t: 'ck', a: 1234.5 }], 10);
    out.ck = w.take(a)[0];
    w.msg(a, [{ t: 'f', f: 2 }], 10);
    out.b_pf = w.take(b)[0];
    w.take(a);
    w.msg(b, [{ t: 'm', x: 'hi' }], 10);
    out.x_er_cap = w.take(b)[0];
    w.ev({ type: 'close', c: b }, 10);
    out.b_leave = w.take(a)[0];
    const c = w.open({ k: 'aaaaaaaaaaaa', n: 'Anna', a: 0, e: NOW0 + 60000, j: 'g3' }, 20);
    w.ev({ type: 'alarm' }, 20000);
    out.bye_hello = w.take(c)[0];
    return out;
  }
  it('Beispielframes entsprechen dem Reducer', () => {
    const actual = scenario();
    if (process.env.MP_GOLDEN_WRITE) {
      const g = JSON.parse(readFileSync(GOLDEN, 'utf8'));
      g.s2c = actual;
      writeFileSync(GOLDEN, JSON.stringify(g, null, 2) + '\n');
    }
    const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
    expect(actual).toEqual(golden.s2c);
  });
});
