import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createState, step, SERVER_CAPS, STORE_PREFIXES } from '../src/mp/room.js';
import look, { V } from '../src/mp/look.js';
import { CAPS, T_CAP } from '../src/mp/protocol.js';
import { LIMITS } from '../src/mp/limits.js';

const golden = JSON.parse(readFileSync(new URL('./fixtures/mp-golden/look.json', import.meta.url), 'utf8'));
const NOW0 = 1_700_000_000_000;
const K = (ch) => ch.repeat(12);
const L26 = [2, 3, 10, 10, 1, 4, 5, 1, 2, 0, 3, 0x1000000 | 0xff8800, 0, 0, 1, 7, 0, 0, 2, 9, 3, 0, 0, 0, 0, 0];
const M = [1, 123456, 20400, 3, 2, 5];

function world(st0) {
  const w = { now: NOW0, frames: {}, closes: [], store: [], rand: () => 0.5 };
  w.st = st0 || createState({ now: w.now });
  w.ev = (e, dt = 0) => {
    w.now += dt;
    const r = step(w.st, e, w.now, w.rand);
    for (const o of r.out) {
      if (o.kind !== 'send') continue;
      const f = o.data === 'pong' ? 'pong' : JSON.parse(o.data);
      for (const c of o.to) (w.frames[c] ||= []).push(f);
    }
    for (const c of r.close) w.closes.push(c);
    w.store.push(...r.store);
    return r;
  };
  w.msg = (c, arr, dt = 0) => w.ev({ type: 'message', c, data: JSON.stringify(arr) }, dt);
  w.join = (ch, { cap = ['pres', 'look'], f = 1 } = {}) => {
    const c = w.ev({ type: 'open', claims: { k: K(ch), n: 'N' + ch, a: 0, e: NOW0 + 3_600_000, j: 'j-' + ch } }).c;
    w.msg(c, [{ t: 'hi', pv: 1, cap, f, cv: '1.17.0' }]);
    return c;
  };
  w.take = (c) => { const f = w.frames[c] || []; w.frames[c] = []; return f; };
  w.xev = (c, t) => w.take(c).filter((f) => f.t === 'x').flatMap((f) => f.ev).filter((e) => e.t === t);
  w.wl = (c) => w.take(c).find((f) => f.t === 'wl');
  return w;
}

describe('mp-look: Vertrag', () => {
  it('Server kuendigt look an, Tabellen stimmen', () => {
    expect(SERVER_CAPS).toContain('look');
    expect(CAPS).toContain('look');
    expect(T_CAP.lk).toBe('look');
    expect(T_CAP.mc).toBe('look');
    expect(STORE_PREFIXES).toContain('lk:');
    expect(look.cap).toBe('look');
  });
  for (const c of golden.c2s) it('Golden c2s: ' + c.name, () => expect(V[c.in.t](c.in)).toEqual(c.out));
  it('Golden limits', () => {
    expect(LIMITS.lk).toEqual(golden.limits.lk);
    expect(LIMITS.mc).toEqual(golden.limits.mc);
  });
});

describe('mp-look: Weitergabe', () => {
  it('lk geht an andere Peers mit look, nicht an den Absender, nicht an Peers ohne look', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    const c = w.join('c', { cap: ['pres'] });
    w.take(a); w.take(b); w.take(c);
    w.msg(a, [{ t: 'lk', l: L26 }]);
    expect(w.xev(b, 'lk')).toEqual([{ t: 'lk', c: a, l: L26 }]);
    expect(w.xev(a, 'lk')).toEqual([]);
    expect(w.take(c)).toEqual([]);
    w.msg(a, [{ t: 'mc', m: M }]);
    expect(w.xev(b, 'mc')).toEqual([{ t: 'mc', c: a, m: M }]);
    expect(w.take(c)).toEqual([]);
  });
  it('mc null wird weitergegeben und loescht den Ausweis im Speicher', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    w.msg(a, [{ t: 'mc', m: M }]);
    w.take(b);
    w.msg(a, [{ t: 'mc', m: null }]);
    expect(w.xev(b, 'mc')).toEqual([{ t: 'mc', c: a, m: null }]);
    expect(w.st.store['lk:' + a].m).toBeNull();
  });
  it('ungueltige Nachricht wird verworfen, kein Close', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    w.take(b);
    w.msg(a, [{ t: 'lk', l: [16, 1, 2, 3] }, { t: 'mc', m: [1] }]);
    expect(w.take(b)).toEqual([]);
    expect(w.st.store['lk:' + a]).toBeUndefined();
    expect(w.closes).toEqual([]);
  });
  it('lk/mc ohne ausgehandelte Faehigkeit: er cap, kein Close, nichts gespeichert', () => {
    const w = world();
    const a = w.join('a', { cap: ['pres'] });
    const b = w.join('b');
    w.take(a); w.take(b);
    w.msg(a, [{ t: 'lk', l: L26 }, { t: 'mc', m: M }]);
    const er = w.xev(a, 'er');
    expect(er.map((e) => e.y)).toEqual(['lk', 'mc']);
    expect(er.every((e) => e.c === 'cap')).toBe(true);
    expect(w.take(b)).toEqual([]);
    expect(w.closes).toEqual([]);
    expect(w.st.store['lk:' + a]).toBeUndefined();
  });
  it('Rate: lk Burst 3, mc Burst 2', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    w.take(b);
    for (let i = 0; i < 5; i++) w.msg(a, [{ t: 'lk', l: [1, i, 0, 0] }]);
    expect(w.xev(b, 'lk')).toHaveLength(3);
    for (let i = 0; i < 4; i++) w.msg(a, [{ t: 'mc', m: [1, i] }]);
    expect(w.xev(b, 'mc')).toHaveLength(2);
  });
});

describe('mp-look: Welcome, Speicher, Aufraeumen', () => {
  it('Welcome enthaelt Stand der anderen, nur fuer look-Clients', () => {
    const w = world();
    const a = w.join('a');
    w.msg(a, [{ t: 'lk', l: L26 }, { t: 'mc', m: M }]);
    const b = w.join('b');
    const wb = w.wl(b);
    expect(wb.lk).toEqual({ [a]: L26 });
    expect(wb.mc).toEqual({ [a]: M });
    const c = w.join('c', { cap: ['pres'] });
    const wc = w.wl(c);
    expect(wc.lk).toBeUndefined();
    expect(wc.mc).toBeUndefined();
    w.msg(b, [{ t: 'lk', l: [1, 2, 3, 4] }]);
    const d = w.join('d');
    expect(Object.keys(w.wl(d).lk).sort()).toEqual([String(a), String(b)].sort());
  });
  it('Storage: put bei jeder Aenderung, del beim Schliessen', () => {
    const w = world();
    const a = w.join('a');
    w.store.length = 0;
    w.msg(a, [{ t: 'lk', l: L26 }]);
    expect(w.store).toEqual([{ op: 'put', key: 'lk:' + a, val: { l: L26, m: null } }]);
    w.msg(a, [{ t: 'mc', m: M }]);
    expect(w.store[1]).toEqual({ op: 'put', key: 'lk:' + a, val: { l: L26, m: M } });
    w.ev({ type: 'close', c: a });
    expect(w.store.at(-1)).toEqual({ op: 'del', key: 'lk:' + a });
    expect(w.st.store['lk:' + a]).toBeUndefined();
    const b = w.join('b');
    expect(w.wl(b).lk).toEqual({});
  });
  it('Kaltstart: Welcome liest aus dem Storage, verwaiste Schluessel raeumt der Alarm weg', () => {
    const store = { sv: 1, 'lk:1': { l: L26, m: M }, 'lk:7': { l: [1, 2, 3, 4], m: null } };
    const att = { c: 1, k: K('a'), n: 'Na', a: 0, f: 1, cap: ['pres', 'look'], jti: 'j-a', x: NOW0 + 600000, t0: NOW0, live: true };
    const w = world(createState({ now: NOW0, store, atts: [att] }));
    const b = w.join('b');
    const wb = w.wl(b);
    expect(wb.lk).toEqual({ 1: L26 });
    expect(wb.mc).toEqual({ 1: M });
    w.store.length = 0;
    w.ev({ type: 'alarm' }, 1000);
    expect(w.store).toContainEqual({ op: 'del', key: 'lk:7' });
    expect(w.st.store['lk:1']).toBeDefined();
    expect(w.st.store['lk:7']).toBeUndefined();
  });
  it('onOpen loescht einen alten Eintrag gleicher Verbindungsnummer', () => {
    const w = world();
    w.st.store['lk:1'] = { l: [1, 9, 9, 9], m: null }; // Rest eines frueheren Laufs
    const a = w.join('a');
    expect(a).toBe(1);
    expect(w.st.store['lk:1']).toBeUndefined();
    const b = w.join('b');
    expect(w.wl(b).lk).toEqual({});
  });
});
