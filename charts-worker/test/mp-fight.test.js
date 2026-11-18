import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createState, step, SERVER_CAPS, STORE_PREFIXES } from '../src/mp/room.js';
import fight, { V, GS_TIMEOUT_MS, PU_S, G_MAX } from '../src/mp/fight.js';
import { CAPS, T_CAP } from '../src/mp/protocol.js';
import { LIMITS } from '../src/mp/limits.js';

const golden = JSON.parse(readFileSync(new URL('./fixtures/mp-golden/fight.json', import.meta.url), 'utf8'));
const NOW0 = 1_700_000_000_000;
const K = (ch) => ch.repeat(12);
const FIGHT = ['pres', 'push', 'fight'];
const GS = (g, x = 0, z = 0) => ({ t: 'gs', g, q: [1, 9, 1, 2, x, 0, z, 0, 0, 0, 100] });

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
  w.join = (ch, { cap = FIGHT, f = 1 } = {}) => {
    const c = w.ev({ type: 'open', claims: { k: K(ch), n: 'N' + ch, a: 0, e: NOW0 + 3_600_000, j: 'j-' + ch } }).c;
    w.msg(c, [{ t: 'hi', pv: 1, cap, f, cv: '1.18.0' }]);
    return c;
  };
  w.pose = (c, x, z) => w.msg(c, [{ t: 'p', q: [x, 0, z, 0, 0, 0, 0] }]);
  w.take = (c) => { const f = w.frames[c] || []; w.frames[c] = []; return f; };
  w.xev = (c, t) => w.take(c).filter((f) => f.t === 'x').flatMap((f) => f.ev).filter((e) => e.t === t);
  w.wl = (c) => w.take(c).find((f) => f.t === 'wl');
  return w;
}

describe('mp-fight: Vertrag', () => {
  it('Server kuendigt fight an, Tabellen stimmen', () => {
    expect(SERVER_CAPS).toContain('fight');
    expect(CAPS[CAPS.length - 1]).toBe('fight');
    for (const t of ['wp', 'fh', 'lz', 'lb', 'gc', 'gs', 'gr', 'gh']) expect(T_CAP[t]).toBe('fight');
    expect(STORE_PREFIXES).toContain('fg:');
    expect(fight.cap).toBe('fight');
  });
  for (const c of golden.c2s) it('Golden c2s: ' + c.name, () => expect(V[c.in.t](c.in)).toEqual(c.out));
  it('Golden limits', () => {
    for (const [k, v] of Object.entries(golden.limits)) expect(LIMITS[k]).toEqual(v);
  });
});

describe('mp-fight: Waffenwahl und Speicher', () => {
  it('wp wird gespeichert, an andere fight-Peers gesendet und im Welcome geliefert', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    const old = w.join('e', { cap: ['pres'] });
    w.take(a); w.take(b); w.take(old);
    w.store.length = 0;
    w.msg(a, [{ t: 'wp', w: 2 }]);
    expect(w.store).toEqual([{ op: 'put', key: 'fg:' + a, val: 2 }]);
    expect(w.xev(b, 'wp')).toEqual([{ t: 'wp', c: a, w: 2 }]);
    expect(w.xev(a, 'wp')).toEqual([]);
    expect(w.take(old)).toEqual([]);
    const c = w.join('c');
    expect(w.wl(c).wp).toEqual({ [a]: 2 });
    const o2 = w.join('9', { cap: ['pres'] });
    expect(w.wl(o2).wp).toBeUndefined();
  });
  it('wp 0 loescht den Eintrag; ungueltig/ohne cap/VR wird verworfen', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b', { cap: ['pres'] });
    w.msg(a, [{ t: 'wp', w: 1 }]);
    w.msg(a, [{ t: 'wp', w: 0 }], 1000);
    expect(w.st.store['fg:' + a]).toBeUndefined();
    w.msg(a, [{ t: 'wp', w: 9 }], 1000);
    expect(w.st.store['fg:' + a]).toBeUndefined();
    w.take(b);
    w.msg(b, [{ t: 'wp', w: 1 }]);
    expect(w.xev(b, 'er').map((e) => e.c)).toEqual(['cap']);
    expect(w.st.store['fg:' + b]).toBeUndefined();
    w.msg(a, [{ t: 'f', f: 9 }], 1000); // VR
    w.msg(a, [{ t: 'wp', w: 3 }], 1000);
    expect(w.st.store['fg:' + a]).toBeUndefined();
    expect(w.closes).toEqual([]);
  });
  it('Rate wp: Burst 2', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    w.take(b);
    for (let i = 0; i < 5; i++) w.msg(a, [{ t: 'wp', w: 1 + (i % 3) }]);
    expect(w.xev(b, 'wp')).toHaveLength(2);
  });
  it('Storage-Aufraeumen: Schliessen, VR, alte Reste, verwaiste Schluessel im Alarm', () => {
    const w = world();
    const a = w.join('a');
    w.msg(a, [{ t: 'wp', w: 1 }]);
    w.ev({ type: 'close', c: a });
    expect(w.st.store['fg:' + a]).toBeUndefined();
    const b = w.join('b');
    w.msg(b, [{ t: 'wp', w: 2 }]);
    w.msg(b, [{ t: 'f', f: 9 }]);
    expect(w.st.store['fg:' + b]).toBeUndefined();
    const store = { sv: 1, 'fg:1': 2, 'fg:7': 3 };
    const att = { c: 1, k: K('a'), n: 'Na', a: 0, f: 1, cap: FIGHT, jti: 'j-a', x: NOW0 + 600000, t0: NOW0, live: true };
    const w2 = world(createState({ now: NOW0, store, atts: [att] }));
    expect(w2.wl(w2.join('b')).wp).toEqual({ 1: 2 });
    w2.ev({ type: 'alarm' }, 1000);
    expect(w2.st.store['fg:7']).toBeUndefined();
    expect(w2.st.store['fg:1']).toBe(2);
    const w3 = world();
    w3.st.store['fg:1'] = 3; // Rest eines frueheren Laufs
    expect(w3.join('a')).toBe(1);
    expect(w3.st.store['fg:1']).toBeUndefined();
  });
});

describe('mp-fight: Treffer fh', () => {
  it('mit fight: Ereignis fh an das Ziel, Abstand <= 3,6 m', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    w.pose(a, 0, 0); w.pose(b, 300, 100); // ca. 3,16 m
    w.take(b);
    w.msg(a, [{ t: 'fh', c: b, w: 1, d: [100, 0] }]);
    expect(w.xev(b, 'fh')).toEqual([{ t: 'fh', c: a, w: 1, d: [100, 0] }]);
    w.pose(b, 400, 0); // 4 m
    w.take(b);
    w.msg(a, [{ t: 'fh', c: b, w: 1, d: [100, 0] }], 400);
    expect(w.take(b)).toEqual([]);
  });
  it('alter Client (ohne fight, mit push) bekommt nur pu mit Rueckstoss', () => {
    const w = world();
    const a = w.join('a');
    const old = w.join('e', { cap: ['pres', 'push'] });
    w.pose(a, 0, 0); w.pose(old, 100, 0);
    w.take(old);
    w.msg(a, [{ t: 'fh', c: old, w: 2, d: [100, 0] }]);
    expect(w.xev(old, 'pu')).toEqual([{ t: 'pu', c: a, d: [100, 0], s: PU_S[2] }]);
    const none = w.join('f', { cap: ['pres'] });
    w.pose(none, 100, 0);
    w.take(none);
    w.msg(a, [{ t: 'fh', c: none, w: 2, d: [100, 0] }], 400);
    expect(w.take(none)).toEqual([]);
  });
  it('VR-Sperre in beide Richtungen, nicht an sich selbst, unbekanntes Ziel, ohne Pose', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b', { f: 9 });
    const c = w.join('c');
    w.pose(a, 0, 0); w.pose(b, 50, 0); w.pose(c, 50, 0);
    w.take(b); w.take(c);
    w.msg(a, [{ t: 'fh', c: b, w: 0, d: [1, 0] }]);
    expect(w.take(b)).toEqual([]);
    w.msg(b, [{ t: 'fh', c: c, w: 0, d: [1, 0] }]);
    expect(w.take(c)).toEqual([]);
    w.take(a);
    w.msg(a, [{ t: 'fh', c: a, w: 0, d: [1, 0] }, { t: 'fh', c: 999, w: 0, d: [1, 0] }]);
    expect(w.take(a)).toEqual([]);
    const d = w.join('d'); // ohne Pose
    w.take(d);
    w.msg(a, [{ t: 'fh', c: d, w: 0, d: [1, 0] }], 400);
    expect(w.take(d)).toEqual([]);
  });
  it('Rate: Burst 3, ungueltig wird verworfen, ohne cap: er cap', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    w.pose(a, 0, 0); w.pose(b, 100, 0);
    w.take(b);
    for (let i = 0; i < 6; i++) w.msg(a, [{ t: 'fh', c: b, w: 0, d: [1, 0] }]);
    expect(w.xev(b, 'fh')).toHaveLength(3);
    w.msg(a, [{ t: 'fh', c: b, w: 7, d: [1, 0] }], 5000);
    expect(w.take(b)).toEqual([]);
    const o = w.join('e', { cap: ['pres'] });
    w.take(o);
    w.msg(o, [{ t: 'fh', c: b, w: 0, d: [1, 0] }]);
    expect(w.xev(o, 'er').map((e) => e.c)).toEqual(['cap']);
    expect(w.closes).toEqual([]);
  });
  it('src=1 nur vom Bandenfuehrer, geprueft gegen die gemeldeten Mitglieder', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    w.pose(a, 0, 0); w.pose(b, 1000, 1000);
    w.msg(a, [{ t: 'gc' }]);
    const g = w.st.gang.g;
    w.take(b);
    w.msg(b, [{ t: 'fh', c: a, w: 0, d: [1, 0], src: 1 }]); // kein Fuehrer
    w.msg(a, [{ t: 'fh', c: b, w: 0, d: [1, 0], src: 1 }]); // noch kein gs
    expect(w.xev(b, 'fh')).toEqual([]);
    w.msg(a, [GS(g, 1500, 1000)]); // Mitglied 5 m entfernt
    w.msg(a, [{ t: 'fh', c: b, w: 0, d: [1, 0], src: 1 }], 400);
    expect(w.xev(b, 'fh')).toEqual([]);
    w.msg(a, [GS(g, 1200, 1000)], 400); // 2 m
    w.take(b);
    w.msg(a, [{ t: 'fh', c: b, w: 1, d: [1, 0], src: 1 }], 400);
    expect(w.xev(b, 'fh')).toEqual([{ t: 'fh', c: a, w: 1, d: [1, 0], src: 1 }]);
  });
});

describe('mp-fight: Laser', () => {
  it('lz geht nur an andere fight-Peers; VR sendet nichts', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    const old = w.join('e', { cap: ['pres'] });
    w.take(a); w.take(b); w.take(old);
    w.msg(a, [{ t: 'lz', on: 1, q: [100, 150, 200] }]);
    expect(w.xev(b, 'lz')).toEqual([{ t: 'lz', c: a, on: 1, q: [100, 150, 200] }]);
    expect(w.xev(a, 'lz')).toEqual([]);
    expect(w.take(old)).toEqual([]);
    w.msg(b, [{ t: 'f', f: 9 }]);
    w.take(a);
    w.msg(b, [{ t: 'lz', on: 1, q: [0, 0, 0] }]);
    expect(w.take(a)).toEqual([]);
  });
  it('lb: je Ziel 1 je 4 s, nicht an VR, nicht an Peers ohne fight', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    const v = w.join('7', { f: 9 });
    const old = w.join('e', { cap: ['pres'] });
    w.take(b); w.take(v); w.take(old);
    w.msg(a, [{ t: 'lb', c: b }]);
    w.msg(a, [{ t: 'lb', c: b }], 1000);
    expect(w.xev(b, 'lb')).toEqual([{ t: 'lb', c: a }]);
    w.msg(a, [{ t: 'lb', c: v }, { t: 'lb', c: old }]);
    expect(w.take(v)).toEqual([]);
    expect(w.take(old)).toEqual([]);
    w.msg(a, [{ t: 'lb', c: b }], 4000);
    expect(w.xev(b, 'lb')).toHaveLength(1);
  });
});

describe('mp-fight: Bandenfuehrung', () => {
  it('gc vergibt die Fuehrung nur wenn frei; gs nur vom Fuehrer; Welcome zeigt gl/gs', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    w.take(a); w.take(b);
    w.msg(a, [{ t: 'gc' }]);
    expect(w.xev(b, 'ga')).toEqual([{ t: 'ga', c: a, g: 1 }]);
    w.msg(b, [{ t: 'gc' }], 1000);
    expect(w.xev(b, 'er')).toEqual([{ t: 'er', c: 'deny', y: 'gc' }]);
    w.msg(b, [GS(1)]);
    expect(w.xev(b, 'er')[0]).toEqual({ t: 'er', c: 'stale', y: 'gs' });
    w.take(b);
    w.msg(a, [GS(1, 10, 20)]);
    expect(w.xev(b, 'gs')).toEqual([{ t: 'gs', c: a, g: 1, q: [1, 9, 1, 2, 10, 0, 20, 0, 0, 0, 100] }]);
    expect(w.xev(a, 'gs')).toEqual([]);
    w.msg(a, [GS(2)], 1000); // falsches g
    expect(w.xev(a, 'er')[0].c).toBe('stale');
    const c = w.join('c');
    const wc = w.wl(c);
    expect(wc.gl).toBe(a);
    expect(wc.gs).toEqual({ g: 1, q: [1, 9, 1, 2, 10, 0, 20, 0, 0, 0, 100] });
    const old = w.join('e', { cap: ['pres'] });
    expect(w.wl(old).gl).toBeUndefined();
  });
  it('Welcome ohne Fuehrer: gl null, gs null', () => {
    const w = world();
    const a = w.join('a');
    const wa = w.wl(a);
    expect(wa.gl).toBeNull();
    expect(wa.gs).toBeNull();
    expect(wa.wp).toEqual({});
  });
  it('gr gibt frei, danach kann ein anderer Peer uebernehmen (g steigt)', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    w.msg(a, [{ t: 'gc' }]);
    w.msg(b, [{ t: 'gr' }], 1000);
    expect(w.st.gang.c).toBe(a);
    w.take(b);
    w.msg(a, [{ t: 'gr' }], 1000);
    expect(w.xev(b, 'ga')).toEqual([{ t: 'ga', c: 0, g: 1 }]);
    w.msg(b, [{ t: 'gc' }], 1000);
    expect(w.xev(b, 'ga')).toEqual([{ t: 'ga', c: b, g: 2 }]);
  });
  it('Fuehrer schliesst oder wechselt in VR: Freigabe', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    w.msg(a, [{ t: 'gc' }]);
    w.take(b);
    w.ev({ type: 'close', c: a });
    expect(w.xev(b, 'ga')).toEqual([{ t: 'ga', c: 0, g: 1 }]);
    w.msg(b, [{ t: 'gc' }], 1000);
    w.take(b);
    w.msg(b, [{ t: 'f', f: 9 }]);
    expect(w.st.gang.c).toBe(0);
    w.msg(b, [{ t: 'gc' }], 1000);
    expect(w.xev(b, 'er')[0]).toEqual({ t: 'er', c: 'deny', y: 'gc' });
  });
  it('60 s ohne gs: frei (Alarm, nextDeadline); gs haelt die Fuehrung', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    w.msg(a, [{ t: 'gc' }]);
    expect(fight.nextDeadline(w.st, w.now)).toBe(w.now + GS_TIMEOUT_MS);
    w.msg(a, [GS(1)], 30000);
    expect(fight.nextDeadline(w.st, w.now)).toBe(w.now + GS_TIMEOUT_MS);
    w.take(b);
    w.ev({ type: 'alarm', auto: { [a]: w.now + 60000, [b]: w.now + 60000 } }, GS_TIMEOUT_MS);
    expect(w.xev(b, 'ga')).toEqual([{ t: 'ga', c: 0, g: 1 }]);
    expect(fight.nextDeadline(w.st, w.now)).toBeNull();
    w.msg(b, [{ t: 'gc' }], 1000);
    expect(w.st.gang.c).toBe(b);
  });
  it('VR darf die Fuehrung nicht anfordern', () => {
    const w = world();
    const a = w.join('a', { f: 9 });
    w.take(a);
    w.msg(a, [{ t: 'gc' }]);
    expect(w.xev(a, 'er')).toEqual([{ t: 'er', c: 'deny', y: 'gc' }]);
  });
  it('Kaltstart: weiterlaufender Fuehrer uebernimmt still wieder, Fremder mit zu kleinem g nicht', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    w.msg(a, [GS(5)]);
    expect(w.st.gang.c).toBe(a);
    expect(w.st.gang.g).toBe(5);
    w.msg(a, [{ t: 'gr' }], 1000);
    w.take(b);
    w.msg(b, [GS(2)], 1000); // g < bekanntem Zaehler
    expect(w.xev(b, 'er')[0].c).toBe('stale');
  });
  it('Zaehler-Vergiftung: gs mit g=0x7fffffff uebernimmt keine freie Fuehrung; gc vergibt nie > G_MAX', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    w.take(b);
    w.msg(a, [GS(0x7fffffff)]);
    expect(w.xev(a, 'er')[0]).toEqual({ t: 'er', c: 'stale', y: 'gs' });
    expect(w.st.gang.c).toBe(0);
    expect(w.st.gang.g).toBe(0);
    w.msg(b, [{ t: 'gc' }], 1000);
    expect(w.st.gang.c).toBe(b);
    expect(w.st.gang.g).toBe(1);
    w.msg(b, [{ t: 'gr' }], 1000);
    w.st.gang.g = G_MAX;
    w.msg(a, [{ t: 'gc' }], 1000);
    expect(w.st.gang.c).toBe(a);
    expect(w.st.gang.g).toBeGreaterThanOrEqual(1);
    expect(w.st.gang.g).toBeLessThanOrEqual(G_MAX);
  });
  it('gh geht nur an den Fuehrer, nie an sich selbst; Rate 4/s', () => {
    const w = world();
    const a = w.join('a');
    const b = w.join('b');
    w.msg(b, [{ t: 'gh', i: 0, w: 1 }]); // kein Fuehrer
    w.msg(a, [{ t: 'gc' }]);
    w.take(a);
    w.msg(a, [{ t: 'gh', i: 0, w: 1 }]);
    expect(w.take(a)).toEqual([]);
    for (let i = 0; i < 6; i++) w.msg(b, [{ t: 'gh', i: i % 3, w: 0 }]);
    expect(w.xev(a, 'gh')).toHaveLength(3); // Burst 4, einer schon beim fuehrerlosen Versuch verbraucht
    w.msg(b, [{ t: 'gh', i: 3, w: 0 }], 2000);
    expect(w.take(a)).toEqual([]);
  });
});
