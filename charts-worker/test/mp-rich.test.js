/* global process */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { createState, step, SERVER_CAPS } from '../src/mp/room.js';
import rich, { V, RS_TIMEOUT_MS } from '../src/mp/rich.js';
import { LIMITS } from '../src/mp/limits.js';

const GOLDEN = new URL('./fixtures/mp-golden/rich.json', import.meta.url);
const NOW0 = 1_700_000_000_000;
const K = (ch) => ch.repeat(12);
const CAPS = ['pres', 'rich'];

function world() {
  const w = { now: NOW0, frames: {}, closes: [], rand: () => 0.5, alarm: null };
  w.st = createState({ now: w.now });
  w.ev = (e, dt = 0) => {
    w.now += dt;
    const r = step(w.st, e, w.now, w.rand);
    for (const o of r.out) {
      if (o.kind !== 'send') continue;
      const f = o.data === 'pong' ? 'pong' : JSON.parse(o.data);
      for (const c of o.to) (w.frames[c] ||= []).push(f);
    }
    for (const c of r.close) w.closes.push(c);
    w.alarm = r.alarmAt;
    return r;
  };
  w.msg = (c, arr, dt = 0) => w.ev({ type: 'message', c, data: JSON.stringify(arr) }, dt);
  w.join = (ch, n, { f = 1, cap = CAPS } = {}, dt = 0) => {
    const c = w.ev({ type: 'open', claims: { k: K(ch), n, a: 0, e: NOW0 + 3_600_000, j: 'j-' + ch } }, dt).c;
    w.msg(c, [{ t: 'hi', pv: 1, cap, f, cv: '1.16.0' }]);
    return c;
  };
  w.take = (c) => { const f = w.frames[c] || []; w.frames[c] = []; return f; };
  w.bevs = (c, t) => w.take(c).filter((f) => f.t === 'b').flatMap((f) => f.ev || []).filter((e) => e.t === t);
  w.xev = (c, t) => w.take(c).filter((f) => f.t === 'x').flatMap((f) => f.ev).filter((e) => e.t === t);
  return w;
}
const Q = (s, h = 1, r = 100) => [s, h, r, 500, 0, 600, 12, 0];

describe('mp-rich: Vertrag', () => {
  it('Server kuendigt rich an', () => expect(SERVER_CAPS).toContain('rich'));
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  for (const c of golden.c2s) it('Golden c2s: ' + c.name, () => expect(V[c.in.t](c.in)).toEqual(c.out));
  it('Golden limits', () => expect(LIMITS.rs).toEqual(golden.limits.rs));
  it('Klemmen und Ablehnung', () => {
    expect(V.rs({ g: 1, q: [9, 0, 0, 0, 0, 0, 0, 0] })).toBeNull();
    expect(V.rs({ g: 1, q: [1, 0, 0, 0, 0, 0, 0] })).toBeNull();
    expect(V.rs({ g: 1, q: [1, 0, 0, 0, 0, 0, 0, NaN] })).toBeNull();
    expect(V.rs({ g: 1.5, q: Q(1) })).toBeNull();
    expect(V.rs({ g: 1, q: [1, 999, 99999, 9e9, -9e9, 0, 1e6, 99] }).q).toEqual([1, 255, 36000, 5000, -200, 0, 315, 9]);
    expect(V.rr({ g: -1 })).toBeNull();
  });
  it('rich2 (1.19.0): Server kündigt an, rs nimmt 8 oder 9 Elemente, q[8] klemmt auf 0..1', () => {
    expect(SERVER_CAPS).toContain('rich2');
    expect(V.rs({ g: 1, q: [1, 0, 0, 0, 0, 0, 0, 1, 1] }).q).toEqual([1, 0, 0, 0, 0, 0, 0, 1, 1]);
    expect(V.rs({ g: 1, q: [1, 0, 0, 0, 0, 0, 0, 1, 9] }).q[8]).toBe(1);
    expect(V.rs({ g: 1, q: [1, 0, 0, 0, 0, 0, 0, 1, -3] }).q[8]).toBe(0);
    expect(V.rs({ g: 1, q: Q(1) }).q).toHaveLength(8);
    expect(V.rs({ g: 1, q: [...Q(1), 0, 0] })).toBeNull();
    expect(V.rs({ g: 1, q: [...Q(1), NaN] })).toBeNull();
  });
  it('rich2: neunter Eintrag wird an die Mitspieler weitergereicht', () => {
    const w = world();
    const a = w.join('a', 'Anna', { cap: ['pres', 'rich', 'rich2'] });
    const b = w.join('b', 'Ben', { cap: ['pres', 'rich', 'rich2'] });
    w.msg(b, [{ t: 'rc' }], 100);
    w.take(a);
    w.msg(b, [{ t: 'rs', g: 1, q: [...Q(1), 1] }], 200);
    expect(w.bevs(a, 'rs')[0].q).toHaveLength(9);
  });
});

describe('mp-rich: Autoritaet', () => {
  it('Streit vergibt Autoritaet, Welcome und Spaetzugang kennen sie', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.take(a); w.take(b);
    w.msg(a, [{ t: 'rc' }], 50);
    expect(w.bevs(b, 'ra')).toEqual([{ t: 'ra', c: a, g: 1, tg: a }]);
    w.msg(a, [{ t: 'rs', g: 1, q: Q(1), tg: a }], 150);
    w.take(b);
    const c = w.join('c', 'Cleo');
    const wl = w.frames[c].find((f) => f.t === 'wl');
    expect(wl.ra).toEqual({ c: a, g: 1, tg: a });
    expect(w.xev(c, 'rs')[0]).toMatchObject({ c: a, g: 1, q: Q(1), tg: a });
  });
  it('wl.ra ist 0 ohne Streit', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    expect(w.frames[a].find((f) => f.t === 'wl').ra).toEqual({ c: 0, g: 0, tg: 0 });
  });
  it('ohne cap rich: er cap, kein wl.ra', () => {
    const w = world();
    const a = w.join('a', 'Anna', { cap: ['pres'] });
    expect(w.frames[a].find((f) => f.t === 'wl').ra).toBeUndefined();
    w.take(a);
    w.msg(a, [{ t: 'rc' }]);
    expect(w.xev(a, 'er')[0]).toMatchObject({ c: 'cap', y: 'rc' });
  });
  it('rs nur vom Inhaber mit aktuellem g, calm flusht sofort', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [{ t: 'rc' }], 200);
    w.take(a); w.take(b);
    w.msg(b, [{ t: 'rs', g: 1, q: Q(1) }], 200);
    expect(w.bevs(a, 'rs')).toEqual([]);
    expect(w.xev(b, 'er')[0]).toMatchObject({ c: 'stale' });
    w.msg(a, [{ t: 'rs', g: 7, q: Q(1) }], 200);
    expect(w.xev(a, 'er')[0]).toMatchObject({ c: 'stale' });
    w.msg(a, [{ t: 'rs', g: 1, q: Q(1) }], 200);
    expect(w.bevs(b, 'rs')).toHaveLength(1);
    w.msg(a, [{ t: 'rs', g: 1, q: Q(0, 0, 0) }], 10); // innerhalb 100 ms: Endzustand trotzdem sofort
    expect(w.bevs(b, 'rs')[0].q[0]).toBe(0);
  });
  it('rs im Flush-Fenster wird zusammengefasst (nur der juengste Stand)', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [{ t: 'rc' }], 200);
    w.msg(a, [{ t: 'rs', g: 1, q: Q(1) }], 200);
    w.take(b);
    w.msg(a, [{ t: 'rs', g: 1, q: Q(1, 2, 90) }], 20);
    w.msg(a, [{ t: 'rs', g: 1, q: Q(2, 2, 80) }], 20);
    w.msg(a, [{ t: 'rs', g: 1, q: Q(2, 3, 70) }], 100);
    const rs = w.bevs(b, 'rs');
    expect(rs).toHaveLength(1);
    expect(rs[0].q[2]).toBe(70);
  });
  it('feindlicher Richard gegen anderes tg: er deny; sonst Uebergabe mit g+1', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [{ t: 'rc' }], 200);
    w.msg(a, [{ t: 'rs', g: 1, q: Q(4) }], 200); // chase
    w.take(a); w.take(b);
    w.msg(b, [{ t: 'rc' }], 200);
    expect(w.xev(b, 'er')[0]).toMatchObject({ c: 'deny' });
    expect(w.bevs(a, 'ra')).toEqual([]);
    w.msg(a, [{ t: 'rs', g: 1, q: Q(1) }], 200); // annoyed: nicht feindlich
    w.take(a);
    w.msg(b, [{ t: 'rc' }], 200);
    expect(w.bevs(a, 'ra')).toEqual([{ t: 'ra', c: b, g: 2, tg: b }]);
    w.msg(a, [{ t: 'rs', g: 1, q: Q(1) }], 200); // alter Inhaber: stale
    expect(w.xev(a, 'er')[0]).toMatchObject({ c: 'stale' });
  });
  it('rr gibt frei (ra.c=0), falsches g und Fremde wirkungslos; neuer Streit g+1', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [{ t: 'rc' }], 200);
    w.take(b);
    w.msg(b, [{ t: 'rr', g: 1 }], 200);
    w.msg(a, [{ t: 'rr', g: 9 }], 200);
    expect(w.bevs(b, 'ra')).toEqual([]);
    w.msg(a, [{ t: 'rr', g: 1 }], 200);
    expect(w.bevs(b, 'ra')).toEqual([{ t: 'ra', c: 0, g: 1, tg: 0 }]);
    w.take(a);
    w.msg(b, [{ t: 'rc' }], 200);
    expect(w.bevs(a, 'ra')).toEqual([{ t: 'ra', c: b, g: 2, tg: b }]);
  });
  it('Disconnect des Inhabers gibt frei', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [{ t: 'rc' }], 200);
    w.take(b);
    w.ev({ type: 'close', c: a }, 200);
    expect(w.bevs(b, 'ra')).toEqual([{ t: 'ra', c: 0, g: 1, tg: 0 }]);
  });
  it('VR: kein Anspruch, Wechsel in VR gibt Autoritaet ab', () => {
    const w = world();
    const a = w.join('a', 'Anna', { f: 9 });
    const b = w.join('b', 'Ben');
    w.take(a); w.take(b);
    w.msg(a, [{ t: 'rc' }], 200);
    expect(w.xev(a, 'er')[0]).toMatchObject({ c: 'deny' });
    w.msg(b, [{ t: 'rc' }], 200);
    w.take(a);
    w.msg(b, [{ t: 'f', f: 9 }], 600);
    expect(w.bevs(a, 'ra')).toContainEqual({ t: 'ra', c: 0, g: 1, tg: 0 });
  });
  it('60 s ohne rs: Alarm gibt frei, Frist in nextDeadline', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [{ t: 'rc' }], 200);
    expect(rich.nextDeadline(w.st, w.now)).toBe(w.now + RS_TIMEOUT_MS);
    expect(w.alarm).toBeLessThanOrEqual(w.now + RS_TIMEOUT_MS);
    w.take(b);
    w.ev({ type: 'alarm' }, RS_TIMEOUT_MS + 1);
    expect(w.bevs(b, 'ra')).toEqual([{ t: 'ra', c: 0, g: 1, tg: 0 }]);
    expect(rich.nextDeadline(w.st, w.now)).toBeNull();
    expect(a).toBeGreaterThan(0);
  });
  it('Attachment bleibt klein (ra)', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const r = w.msg(a, [{ t: 'rc' }], 200);
    const att = r.out.find((o) => o.kind === 'att' && o.c === a).att;
    expect(att.ra).toEqual({ g: 1, rf: 1, tg: a });
    expect(JSON.stringify(att).length).toBeLessThan(1000);
  });
});

describe('mp-rich: Golden s2c', () => {
  function scenario() {
    const w = world();
    const out = {};
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.take(a); w.take(b);
    w.msg(a, [{ t: 'rc' }], 100);
    out.ra_claim = w.bevs(b, 'ra')[0];
    w.msg(a, [{ t: 'rs', g: 1, q: Q(2, 3, 240), tg: a }], 150);
    out.rs = w.bevs(b, 'rs')[0];
    w.msg(a, [{ t: 'rr', g: 1 }], 150);
    out.ra_release = w.bevs(b, 'ra')[0];
    const c = w.join('c', 'Cleo');
    out.wl_ra = w.frames[c].find((f) => f.t === 'wl').ra;
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
