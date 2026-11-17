/* global process */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { createState, step, SERVER_CAPS } from '../src/mp/room.js';
import { V } from '../src/mp/protocol.js';
import { LIMITS } from '../src/mp/limits.js';
import { BAN_MS } from '../src/mp/chat.js';

const GOLDEN = new URL('./fixtures/mp-golden/chat.json', import.meta.url);
const NOW0 = 1_700_000_000_000;
const K = (ch) => ch.repeat(12);
const CAPS = ['pres', 'chat', 'emote', 'admin'];

function world() {
  const w = { now: NOW0, frames: {}, closes: [], store: {}, rand: () => 0.5 };
  w.st = createState({ now: w.now });
  w.ev = (e, dt = 0) => {
    w.now += dt;
    const r = step(w.st, e, w.now, w.rand);
    for (const o of r.out) {
      if (o.kind !== 'send') continue;
      const f = o.data === 'pong' ? 'pong' : JSON.parse(o.data);
      for (const c of o.to) (w.frames[c] ||= []).push(f);
    }
    for (const s of r.store) { if (s.op === 'put') w.store[s.key] = s.val; else delete w.store[s.key]; }
    for (const c of r.close) w.closes.push(c);
    return r;
  };
  w.msg = (c, arr, dt = 0) => w.ev({ type: 'message', c, data: JSON.stringify(arr) }, dt);
  w.join = (ch, n, { f = 5, a = 0, cap = CAPS, j = '' } = {}, dt = 0) => {
    const c = w.ev({ type: 'open', claims: { k: K(ch), n, a, e: NOW0 + 3_600_000, j: 'j-' + ch + j } }, dt).c;
    w.msg(c, [{ t: 'hi', pv: 1, cap, f, cv: '1.16.0' }]);
    return c;
  };
  w.take = (c) => { const f = w.frames[c] || []; w.frames[c] = []; return f; };
  w.xev = (c, t) => w.take(c).filter((f) => f.t === 'x').flatMap((f) => f.ev).filter((e) => e.t === t);
  w.bevs = (c, t) => w.take(c).filter((f) => f.t === 'b').flatMap((f) => f.ev || []).filter((e) => e.t === t);
  w.closed = (c) => w.closes.filter((x) => x.c === c).map((x) => x.code);
  return w;
}

describe('mp-chat: Vertrag', () => {
  it('Server-Faehigkeiten enthalten chat, emote, admin', () => {
    expect(SERVER_CAPS).toEqual(expect.arrayContaining(['chat', 'emote', 'admin']));
  });
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  for (const c of golden.c2s) {
    it('Golden c2s: ' + c.name, () => expect(V[c.in.t](c.in)).toEqual(c.out));
  }
  it('Golden limits', () => {
    for (const t of ['m', 'e', 'ki']) expect(LIMITS[t]).toEqual(golden.limits[t]);
  });
  it('Bereinigung: NFC, Steuer-/Bidi-Zeichen raus, 200 Zeichen', () => {
    expect(V.m({ x: 'é‮a​b\u0007c' }).x).toBe('éabc');
    expect(Array.from(V.m({ x: 'x'.repeat(500) }).x)).toHaveLength(200);
    expect(V.m({ x: ' ​ ' })).toBeNull();
    expect(V.m({ x: 5 })).toBeNull();
  });
});

describe('mp-chat: Chat', () => {
  it('Verteilung an Peers mit Chat-Flag, auch an den Absender, Inhalt bereinigt', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    const c = w.join('c', 'Cleo', { f: 1 }); // Chat aus
    const d = w.join('d', 'Dora', { cap: ['pres'] }); // ohne cap chat
    for (const x of [a, b, c, d]) w.take(x);
    w.msg(a, [{ t: 'm', x: ' hallo‮  welt ' }], 50);
    const ev = { t: 'm', c: a, x: 'hallo welt', s: w.now };
    expect(w.xev(a, 'm')).toEqual([ev]);
    expect(w.xev(b, 'm')).toEqual([ev]);
    expect(w.xev(c, 'm')).toEqual([]);
    expect(w.xev(d, 'm')).toEqual([]);
  });
  it('Absender ohne Chat-Flag oder aus VR: er perm, nichts verteilt', () => {
    const w = world();
    const a = w.join('a', 'Anna', { f: 1 });
    const b = w.join('b', 'Ben');
    const v = w.join('e', 'Vera', { f: 4 | 8 });
    for (const x of [a, b, v]) w.take(x);
    w.msg(a, [{ t: 'm', x: 'hi' }], 50);
    expect(w.xev(a, 'er')).toEqual([{ t: 'er', c: 'perm', y: 'm' }]);
    w.msg(v, [{ t: 'm', x: 'hi' }], 50);
    expect(w.xev(v, 'er')).toEqual([{ t: 'er', c: 'perm', y: 'm' }]);
    expect(w.xev(b, 'm')).toEqual([]);
  });
  it('Flag-Wechsel wirkt sofort (f aus -> keine Auslieferung mehr)', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.take(a); w.take(b);
    w.msg(b, [{ t: 'f', f: 1 }], 600);
    w.take(a); w.take(b);
    w.msg(a, [{ t: 'm', x: 'noch da?' }], 600);
    expect(w.xev(b, 'm')).toEqual([]);
    expect(w.xev(a, 'm')).toHaveLength(1);
  });
  it('Flood: 5 je 10 s, danach er rate, Verbindung bleibt; Erholung nach Wartezeit', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.take(a); w.take(b);
    for (let i = 0; i < 20; i++) w.msg(a, [{ t: 'm', x: 'spam' + i }], 120);
    const got = w.xev(b, 'm');
    expect(got.length).toBeGreaterThanOrEqual(5);
    expect(got.length).toBeLessThan(10);
    expect(w.xev(a, 'er').some((e) => e.c === 'rate' && e.y === 'm')).toBe(true);
    expect(w.closed(a)).toEqual([]);
    w.msg(a, [{ t: 'm', x: 'wieder' }], 10000);
    expect(w.xev(b, 'm').map((e) => e.x)).toEqual(['wieder']);
  });
  it('Frame-Flut: Schliessen mit 4429 statt Absturz', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    for (let i = 0; i < 200; i++) w.msg(a, [{ t: 'm', x: 'x' }], 20);
    expect(w.closed(a)).toContain(4429);
  });
  it('keine Inhalte im Storage', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    w.join('b', 'Ben');
    w.msg(a, [{ t: 'm', x: 'GEHEIM-TEXT-123' }, { t: 'e', e: 2 }], 50);
    expect(JSON.stringify(w.store)).not.toContain('GEHEIM');
    expect(JSON.stringify(w.st)).not.toContain('GEHEIM');
  });
});

describe('mp-chat: Emotes', () => {
  it('Emote geht als Ereignis an alle, ungueltige Codes werden verworfen, Cooldown 1.5 s', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben', { f: 1 });
    w.take(a); w.take(b);
    w.msg(a, [{ t: 'e', e: 5 }], 50);
    expect(w.bevs(b, 'e')).toEqual([{ t: 'e', c: a, e: 5 }]);
    w.msg(a, [{ t: 'e', e: 0 }, { t: 'e', e: 9 }, { t: 'e', e: 'x' }], 2000);
    expect(w.bevs(b, 'e')).toEqual([]);
    w.msg(a, [{ t: 'e', e: 6 }, { t: 'e', e: 7 }], 2000); // zweites im selben Frame: Cooldown
    expect(w.bevs(b, 'e')).toEqual([{ t: 'e', c: a, e: 6 }]);
  });
  it('ohne cap emote: er cap', () => {
    const w = world();
    const a = w.join('a', 'Anna', { cap: ['pres'] });
    w.take(a);
    w.msg(a, [{ t: 'e', e: 1 }], 50);
    expect(w.xev(a, 'er')).toEqual([{ t: 'er', c: 'cap', y: 'e' }]);
  });
});

describe('mp-chat: Admin-Kick', () => {
  it('Admin kickt: Ban 10 min, alle Verbindungen des k mit bye ban + 4403, l mit r kick', () => {
    const w = world();
    const adm = w.join('a', 'Admin', { a: 1 });
    const u1 = w.join('b', 'Ben');
    const u2 = w.join('b', 'Ben2', { j: '2' });
    const o = w.join('c', 'Cleo');
    for (const x of [adm, u1, u2, o]) w.take(x);
    w.msg(adm, [{ t: 'ki', c: u1 }], 100);
    const until = w.now + BAN_MS;
    expect(w.store['b:' + K('b')]).toBe(until);
    for (const x of [u1, u2]) expect(w.closed(x)).toEqual([4403]);
    expect(w.take(u1).find((f) => f.t === 'bye')).toEqual({ t: 'bye', c: 'ban', u: until });
    expect(w.take(u2).find((f) => f.t === 'bye')).toEqual({ t: 'bye', c: 'ban', u: until });
    const ls = w.bevs(o, 'l');
    expect(ls).toEqual(expect.arrayContaining([{ t: 'l', c: u1, r: 'kick' }, { t: 'l', c: u2, r: 'kick' }]));
    expect(w.closed(o)).toEqual([]);
    expect(w.closed(adm)).toEqual([]);
  });
  it('Wiederkehr: gesperrt bis Ablauf (4403 bye ban), danach moeglich', () => {
    const w = world();
    const adm = w.join('a', 'Admin', { a: 1 });
    const u = w.join('b', 'Ben');
    w.take(adm);
    w.msg(adm, [{ t: 'ki', c: u }], 100);
    const until = w.store['b:' + K('b')];
    const open = (j) => w.ev({ type: 'open', claims: { k: K('b'), n: 'Ben', a: 0, e: w.now + 3_600_000, j } });
    const r1 = open('re1');
    expect(w.closed(r1.c)).toEqual([4403]);
    expect(w.take(r1.c).find((f) => f.t === 'bye')).toEqual({ t: 'bye', c: 'ban', u: until });
    w.now = until + 1;
    const r2 = open('re2');
    expect(w.closed(r2.c)).toEqual([]);
    expect(w.st.peers[r2.c]).toBeTruthy();
  });
  it('Nicht-Admin: er perm, kein Ban', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.take(a); w.take(b);
    w.msg(a, [{ t: 'ki', c: b }], 100);
    expect(w.xev(a, 'er')).toEqual([{ t: 'er', c: 'perm', y: 'ki' }]);
    expect(w.store['b:' + K('b')]).toBeUndefined();
    expect(w.closed(b)).toEqual([]);
  });
  it('Admin nicht kickbar, unbekanntes Ziel, Ziel = Selbst: er perm', () => {
    const w = world();
    const a = w.join('a', 'Admin', { a: 1 });
    const b = w.join('b', 'Admin2', { a: 1 });
    w.take(a);
    w.msg(a, [{ t: 'ki', c: b }], 100);
    w.msg(a, [{ t: 'ki', c: 999 }], 6000);
    w.msg(a, [{ t: 'ki', c: a }], 6000);
    expect(w.xev(a, 'er')).toHaveLength(3);
    expect(w.closed(b)).toEqual([]);
    expect(Object.keys(w.store).filter((k) => k.startsWith('b:'))).toEqual([]);
  });
  it('Kick-Rate 1 je 5 s: zweiter Kick sofort -> er perm', () => {
    const w = world();
    const adm = w.join('a', 'Admin', { a: 1 });
    const u1 = w.join('b', 'Ben');
    const u2 = w.join('c', 'Cleo');
    w.take(adm);
    w.msg(adm, [{ t: 'ki', c: u1 }], 100);
    w.msg(adm, [{ t: 'ki', c: u2 }], 100);
    expect(w.closed(u2)).toEqual([]);
    expect(w.xev(adm, 'er')).toEqual([{ t: 'er', c: 'perm', y: 'ki' }]);
  });
  it('ohne cap admin: er cap', () => {
    const w = world();
    const adm = w.join('a', 'Admin', { a: 1, cap: ['pres', 'chat'] });
    const u = w.join('b', 'Ben');
    w.take(adm);
    w.msg(adm, [{ t: 'ki', c: u }], 100);
    expect(w.xev(adm, 'er')).toEqual([{ t: 'er', c: 'cap', y: 'ki' }]);
  });
});

describe('mp-chat: Golden s2c', () => {
  function scenario() {
    const w = world();
    const out = {};
    const a = w.join('a', 'Anna', { a: 1 });
    const b = w.join('b', 'Ben');
    w.take(a); w.take(b);
    w.msg(a, [{ t: 'm', x: 'Hallo!' }], 100);
    out.chat_x = w.xev(b, 'm')[0];
    w.msg(b, [{ t: 'e', e: 5 }], 2000);
    out.emote_b = w.bevs(a, 'e')[0];
    w.take(a);
    w.msg(a, [{ t: 'ki', c: b }], 2000);
    out.kick_bye = w.take(b).find((f) => f.t === 'bye');
    out.kick_l = w.bevs(a, 'l')[0];
    return out;
  }
  it('Beispielframes entsprechen dem Reducer', () => {
    const actual = scenario();
    if (process.env.MP_GOLDEN_WRITE) {
      const g = JSON.parse(readFileSync(GOLDEN, 'utf8'));
      g.s2c = actual;
      writeFileSync(GOLDEN, JSON.stringify(g, null, 2) + '\n');
    }
    expect(actual).toEqual(JSON.parse(readFileSync(GOLDEN, 'utf8')).s2c);
  });
});
