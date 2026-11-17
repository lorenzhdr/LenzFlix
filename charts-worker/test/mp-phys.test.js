/* global process */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { createState, step, SERVER_CAPS } from '../src/mp/room.js';
import { V } from '../src/mp/protocol.js';
import { LIMITS } from '../src/mp/limits.js';
import { HOLD_MS, MAX_ENTRIES, MAX_SPAWNS, IDLE_OWNER_MS, SPAWN_TTL_MS } from '../src/mp/phys.js';

const GOLDEN = new URL('./fixtures/mp-golden/phys.json', import.meta.url);
const NOW0 = 1_700_000_000_000;
const K = (ch) => ch.repeat(12);
const CAPS = ['pres', 'chat', 'emote', 'push', 'phys'];
const ITEM = 'a'.repeat(32);

function world() {
  const w = { now: NOW0, frames: {}, closes: [], rand: () => 0.5 };
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
    return r;
  };
  w.msg = (c, arr, dt = 0) => w.ev({ type: 'message', c, data: JSON.stringify(arr) }, dt);
  w.join = (ch, n, { f = 3, cap = CAPS } = {}, dt = 0) => {
    const c = w.ev({ type: 'open', claims: { k: K(ch), n, a: 0, e: NOW0 + 3_600_000, j: 'j-' + ch } }, dt).c;
    w.msg(c, [{ t: 'hi', pv: 1, cap, f, cv: '1.16.0' }]);
    return c;
  };
  w.take = (c) => { const f = w.frames[c] || []; w.frames[c] = []; return f; };
  w.bevs = (c, t) => w.take(c).filter((f) => f.t === 'b').flatMap((f) => f.ev || []).filter((e) => e.t === t);
  w.xev = (c, t) => w.take(c).filter((f) => f.t === 'x').flatMap((f) => f.ev).filter((e) => e.t === t);
  w.wl = (c) => w.take(c).find((f) => f.t === 'wl');
  w.pose = (c, x, z, dt = 0) => w.msg(c, [{ t: 'p', q: [x, 0, z, 0, 0, 0, 0] }], dt);
  return w;
}
const PC = (i, g = 0) => ({ t: 'pc', i, g });
const E = (i, g, s = 0, x = 100, z = 200) => [i, g, x, 10, z, 5, 0, -5, 30, 0, 0, 0, s];
const PS = (...l) => ({ t: 'ps', l });

describe('mp-phys: Vertrag', () => {
  it('Server-Faehigkeiten enthalten phys und push', () => {
    expect(SERVER_CAPS).toEqual(expect.arrayContaining(['phys', 'push']));
  });
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  for (const c of golden.c2s) {
    it('Golden c2s: ' + c.name, () => expect(V[c.in.t](c.in)).toEqual(c.out));
  }
  it('Golden limits (Tabelle unveraendert, Server-Grenzen laut Vertrag)', () => {
    for (const t of ['pu', 'pc', 'ps']) expect(LIMITS[t]).toEqual(golden.limits[t]);
  });
  it('Validatoren: Klemmen, ax/az nur bei tip>0, s auf 0/1', () => {
    const o = V.ps({ l: [['b1', 1, 99999, 0, 0, 9999, -9999, 0, 0, 0, 50, 50, 1]] });
    expect(o.l[0].slice(2, 8)).toEqual([5000, 0, 0, 1600, -1600, 0]);
    expect(o.l[0].slice(9, 13)).toEqual([0, 0, 0, 1]);
    expect(V.ps({ l: [['b1', 1, 0, 0, 0, 0, 0, 0, 0, 40, 500, -500, 7]] }).l[0].slice(9)).toEqual([40, 100, -100, 0]);
    expect(V.ps({ l: Array.from({ length: 9 }, () => E('b', 1)) })).toBeNull();
    expect(V.ps({ l: [] })).toBeNull();
    expect(V.ps({ l: [E('b', 1).slice(0, 12)] })).toBeNull();
    expect(V.pn({ i: '3.1', q: [0, 0, 0, 0, 0, 0, 0, 0] })).toEqual({ t: 'pn', i: '3.1', it: null, q: [0, 0, 0, 0, 0, 0, 0, 0] });
    expect(V.pn({ i: 'ball', q: [0, 0, 0, 0, 0, 0, 0, 0] })).toBeNull();
    expect(V.pu({ c: 2, d: [0, 0], s: 5 })).toBeNull();
    expect(V.pu({ c: 2, d: [0, 70], s: 500 })).toEqual({ t: 'pu', c: 2, d: [0, 70], s: 100 });
  });
});

describe('mp-phys: Besitz', () => {
  it('erster Anspruch gewinnt mit g=1, po an alle', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.take(a); w.take(b);
    w.msg(a, [PC('ball1')], 100);
    expect(w.bevs(b, 'po')).toEqual([{ t: 'po', i: 'ball1', o: a, g: 1, h: 0 }]);
  });
  it('Konflikt: innerhalb der Haltezeit gewinnt der erste, danach der letzte Anstoss', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [PC('dose')], 100);
    w.take(a); w.take(b);
    w.msg(b, [PC('dose')], HOLD_MS - 50);
    const deny = w.bevs(a, 'po');
    expect(deny).toEqual([{ t: 'po', i: 'dose', o: a, g: 1, h: 0 }]);
    w.take(b);
    w.msg(b, [PC('dose')], 100); // jetzt 300 ms nach der Vergabe
    const grant = w.bevs(a, 'po');
    expect(grant).toEqual([{ t: 'po', i: 'dose', o: b, g: 2, h: 0 }]);
  });
  it('Anspruch des Besitzers selbst ist still', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [PC('x1')], 100);
    w.take(b);
    w.msg(a, [PC('x1', 1)], 500);
    expect(w.take(b).flatMap((f) => f.ev || [])).toEqual([]);
  });
  it('pc ohne cap phys: er cap; unbekannte Spawn-Id: er deny', () => {
    const w = world();
    const a = w.join('a', 'Anna', { cap: ['pres'] });
    const b = w.join('b', 'Ben');
    w.take(a); w.take(b);
    w.msg(a, [PC('ball1')], 100);
    expect(w.xev(a, 'er')).toEqual([{ t: 'er', c: 'cap', y: 'pc' }]);
    w.msg(b, [PC('3.4')], 100);
    expect(w.xev(b, 'er')).toEqual([{ t: 'er', c: 'deny', y: 'pc' }]);
  });
  it('pc-Rate: mehr als 10/s -> er deny', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    w.take(a);
    for (let k = 0; k < 14; k++) w.msg(a, [PC('o' + k)], 5);
    expect(w.xev(a, 'er').some((e) => e.c === 'deny')).toBe(true);
  });
  it('Tabelle ist auf 64 Eintraege begrenzt, freie werden verdraengt', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    for (let k = 0; k < MAX_ENTRIES; k++) w.msg(k % 2 ? a : b, [PC('o' + k)], 120);
    expect(Object.keys(w.st.ph.tab)).toHaveLength(MAX_ENTRIES);
    w.take(a);
    w.msg(a, [PC('neu')], 120);
    expect(w.xev(a, 'er')).toEqual([{ t: 'er', c: 'deny', y: 'pc' }]); // alle belegt
    // einen freigeben -> Platz
    const first = Object.entries(w.st.ph.tab)[0];
    const owner = first[1].o;
    w.msg(owner, [{ t: 'ps', l: [E(first[0], first[1].g, 1)] }], 120);
    w.msg(a, [PC('neu')], 120);
    expect(w.st.ph.tab.neu.o).toBe(a);
    expect(Object.keys(w.st.ph.tab)).toHaveLength(MAX_ENTRIES);
  });
});

describe('mp-phys: ps', () => {
  it('nur vom Besitzer mit aktuellem g; fremdes g/Nicht-Besitzer verworfen', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [PC('ball')], 100);
    w.take(a); w.take(b);
    w.msg(b, [PS(E('ball', 1))], 100); // Ben ist nicht Besitzer
    w.msg(a, [PS(E('ball', 7))], 150); // falsches g
    expect(w.bevs(b, 'ps')).toEqual([]);
    w.msg(a, [PS(E('ball', 1))], 150);
    const ps = w.bevs(b, 'ps');
    expect(ps).toEqual([{ t: 'ps', c: a, l: [E('ball', 1)] }]);
  });
  it('Klemmen und ax/az-Regel kommen beim Empfaenger normalisiert an', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [PC('t1')], 100);
    w.take(b);
    w.msg(a, [PS(['t1', 1, 999999, 0, 0, 0, 0, 0, 0, 0, 80, 80, 0])], 150);
    expect(w.bevs(b, 'ps')[0].l[0].slice(2, 5)).toEqual([5000, 0, 0]);
  });
  it('ps desselben Senders im Flush-Fenster werden je Id zusammengefasst', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [PC('p1'), PC('p2')], 100);
    w.take(b);
    w.msg(a, [PS(E('p1', 1, 0, 1))], 200);
    w.take(b);
    w.msg(a, [PS(E('p1', 1, 0, 2), E('p2', 1, 0, 9))], 10);
    w.msg(a, [PS(E('p1', 1, 0, 3))], 10);
    w.pose(a, 1, 1, 200); // Flush-Fenster schliessen
    const evs = w.take(b).filter((f) => f.t === 'b').flatMap((f) => f.ev || []).filter((e) => e.t === 'ps');
    const merged = evs.flatMap((e) => e.l);
    expect(merged.find((x) => x[0] === 'p1')[2]).toBe(3);
    expect(merged.find((x) => x[0] === 'p2')[2]).toBe(9);
  });
  it('Rate: hoechstens cf.ph Frames/s (plus Burst), Rest verworfen', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [PC('r1')], 100);
    w.take(b);
    let sent = 0;
    for (let k = 0; k < 12; k++) {
      w.msg(a, [PS(E('r1', 1, 0, k))], 20);
      sent++;
    }
    const got = w.take(b).filter((f) => f.t === 'b').flatMap((f) => f.ev || []).filter((e) => e.t === 'ps').flatMap((e) => e.l);
    expect(sent).toBe(12);
    expect(got.length).toBeGreaterThan(0);
    expect(got.length).toBeLessThanOrEqual(10); // ph 8 + Burst 2
  });
  it('s=1: Besitz frei, po o=0 sofort, Ruhelage fuer Spaetankoemmlinge (wl.pr)', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [PC('kegel')], 100);
    w.take(b);
    w.msg(a, [PS(E('kegel', 1, 1, 321, 654))], 300);
    const f = w.take(b).find((x) => x.t === 'b');
    expect(f.ev.filter((e) => e.t === 'po')).toEqual([{ t: 'po', i: 'kegel', o: 0, g: 1, h: 0 }]);
    expect(f.ev.find((e) => e.t === 'ps').l[0][12]).toBe(1);
    const c = w.join('c', 'Cleo');
    void c;
    // wl des Spaetankoemmlings steht in w.frames[c]; join hat es schon verbraucht -> frisch verbinden
    const d = w.join('d', 'Dora');
    const wl = w.frames[d].find((x) => x.t === 'wl');
    expect(wl.po).toEqual([]);
    expect(wl.pr).toEqual([['kegel', 321, 10, 654, 30, 0, 0, 0]]);
  });
  it('Spaetankoemmling bekommt laufende Besitzer in wl.po, nur mit cap phys', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    w.msg(a, [PC('fass')], 100);
    w.msg(a, [PS(E('fass', 1, 0))], 200);
    const b = w.join('b', 'Ben');
    expect(w.frames[b].find((x) => x.t === 'wl').po).toEqual([['fass', a, 1, 0]]);
    const c = w.join('c', 'Cleo', { cap: ['pres'] });
    const wl = w.frames[c].find((x) => x.t === 'wl');
    expect(wl.po).toBeUndefined();
    expect(wl.pr).toBeUndefined();
  });
  it('Wiederaufnahme nach leerer Tabelle (Hibernation): Besitzer uebernimmt still, Spawn-Ids nicht', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.take(b);
    w.msg(a, [PS(E('alt', 4))], 200);
    expect(w.bevs(b, 'po')).toEqual([{ t: 'po', i: 'alt', o: a, g: 4, h: 0 }]);
    w.take(b);
    w.msg(a, [PS(E(`${a}.1`, 1))], 200);
    expect(w.st.ph.tab[`${a}.1`]).toBeUndefined();
  });
  it('Ruhe-Timeout im Alarm: Besitzer ohne ps wird frei', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [PC('stumm')], 100);
    w.msg(a, [PS(E('stumm', 1))], 100);
    w.take(b);
    w.ev({ type: 'alarm' }, IDLE_OWNER_MS + 1000);
    expect(w.bevs(b, 'po')).toEqual([{ t: 'po', i: 'stumm', o: 0, g: 1, h: 0 }]);
  });
});

describe('mp-phys: Disconnect', () => {
  it('Besitz wird frei, Ruhelage bleibt, Spawns des Werfers verschwinden (px)', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [PC('ball')], 100);
    w.msg(a, [PS(E('ball', 1, 0, 11, 22))], 200);
    w.msg(a, [{ t: 'pn', i: `${a}.1`, it: null, q: [0, 0, 0, 0, 0, 0, 0, 0] }], 200);
    w.take(b);
    w.ev({ type: 'close', c: a }, 100);
    const evs = w.take(b).filter((f) => f.t === 'b').flatMap((f) => f.ev || []);
    expect(evs).toContainEqual({ t: 'po', i: 'ball', o: 0, g: 1, h: 0 });
    expect(evs).toContainEqual({ t: 'px', i: `${a}.1` });
    expect(w.st.ph.rest.ball).toEqual([11, 10, 22, 30, 0, 0, 0]);
    const c = w.join('c', 'Cleo');
    expect(w.frames[c].find((x) => x.t === 'wl').pr).toEqual([['ball', 11, 10, 22, 30, 0, 0, 0]]);
  });
  it('Uebernahme nach Disconnect: anderer kann sofort beanspruchen (g laeuft weiter)', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [PC('ball')], 100);
    w.ev({ type: 'close', c: a }, 50);
    w.take(b);
    w.msg(b, [PC('ball')], 10);
    expect(w.bevs(b, 'po')).toEqual([{ t: 'po', i: 'ball', o: b, g: 2, h: 0 }]);
  });
});

describe('mp-phys: geworfene Huellen', () => {
  const Q = [100, 120, 300, 10, 20, 30, 15, 5];
  it('pn: Id muss "<eigenes c>.<n>" sein, it nur bei geteiltem Film', () => {
    const w = world();
    const a = w.join('a', 'Anna', { f: 3 });
    const b = w.join('b', 'Ben', { f: 1 }); // Film privat
    w.take(a);
    w.msg(b, [{ t: 'pn', i: `${a}.1`, it: ITEM, q: Q }], 100); // fremde Id
    expect(w.bevs(a, 'pn')).toEqual([]);
    w.msg(b, [{ t: 'pn', i: `${b}.1`, it: ITEM, q: Q }], 100);
    expect(w.bevs(a, 'pn')).toEqual([{ t: 'pn', c: b, i: `${b}.1`, it: null, q: Q }]);
    w.msg(a, [{ t: 'pn', i: `${a}.7`, it: ITEM, q: Q }], 100);
    expect(w.bevs(b, 'pn').filter((e) => e.c === a)).toEqual([{ t: 'pn', c: a, i: `${a}.7`, it: ITEM, q: Q }]);
    expect(w.st.ph.tab[`${a}.7`]).toMatchObject({ o: a, g: 1, th: a });
  });
  it('pn aus VR: er perm, kein Spawn', () => {
    const w = world();
    const v = w.join('e', 'Vera', { f: 8 });
    w.take(v);
    w.msg(v, [{ t: 'pn', i: `${v}.1`, it: null, q: Q }], 100);
    expect(w.xev(v, 'er')).toEqual([{ t: 'er', c: 'perm', y: 'pn' }]);
    expect(Object.keys(w.st.ph.tab)).toEqual([]);
  });
  it('hoechstens 4 Huellen je Werfer, die aelteste wird per px entfernt', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    for (let n = 1; n <= MAX_SPAWNS; n++) w.msg(a, [{ t: 'pn', i: `${a}.${n}`, it: null, q: Q }], 400);
    w.take(b);
    w.msg(a, [{ t: 'pn', i: `${a}.9`, it: null, q: Q }], 400);
    const evs = w.take(b).filter((f) => f.t === 'b').flatMap((f) => f.ev || []);
    expect(evs.filter((e) => e.t === 'px')).toEqual([{ t: 'px', i: `${a}.1` }]);
    expect(Object.keys(w.st.ph.tab)).toHaveLength(MAX_SPAWNS);
  });
  it('px nur vom Werfer', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [{ t: 'pn', i: `${a}.1`, it: null, q: Q }], 400);
    w.take(a);
    w.msg(b, [{ t: 'px', i: `${a}.1` }], 100);
    expect(w.bevs(a, 'px')).toEqual([]);
    w.msg(a, [{ t: 'px', i: `${a}.1` }], 100);
    expect(w.bevs(b, 'px')).toEqual([{ t: 'px', i: `${a}.1` }]);
    expect(w.st.ph.tab[`${a}.1`]).toBeUndefined();
  });
  it('fremde Huelle laesst sich anstossen (pc), px bleibt beim Werfer, Werfer-Disconnect raeumt', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [{ t: 'pn', i: `${a}.1`, it: null, q: Q }], 400);
    w.msg(b, [PC(`${a}.1`)], 400);
    expect(w.st.ph.tab[`${a}.1`]).toMatchObject({ o: b, g: 2, th: a });
    w.take(b);
    w.ev({ type: 'close', c: a }, 10);
    expect(w.bevs(b, 'px')).toEqual([{ t: 'px', i: `${a}.1` }]);
  });
  it('Spawn ohne Aktivitaet wird im Alarm entfernt', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [{ t: 'pn', i: `${a}.1`, it: null, q: Q }], 400);
    w.take(b);
    w.ev({ type: 'alarm' }, SPAWN_TTL_MS + 1000);
    expect(w.bevs(b, 'px')).toEqual([{ t: 'px', i: `${a}.1` }]);
  });
});

describe('mp-phys: Schubsen (pu)', () => {
  const setup = (opts = {}) => {
    const w = world();
    const a = w.join('a', 'Anna', opts.a);
    const b = w.join('b', 'Ben', opts.b);
    w.pose(a, 1000, 1000, 50);
    w.pose(b, 1000 + (opts.dx ?? 200), 1000, 50);
    w.take(a); w.take(b);
    return { w, a, b };
  };
  it('geht nur an das Ziel (x), nicht an den Sender oder Dritte', () => {
    const { w, a, b } = setup();
    const c = w.join('c', 'Cleo');
    w.take(c);
    w.msg(a, [{ t: 'pu', c: b, d: [100, 0], s: 60 }], 100);
    expect(w.xev(b, 'pu')).toEqual([{ t: 'pu', c: a, d: [100, 0], s: 60 }]);
    expect(w.xev(a, 'pu')).toEqual([]);
    expect(w.xev(c, 'pu')).toEqual([]);
  });
  it('Abstand: 3,5 m ja, darueber nein', () => {
    const near = setup({ dx: 350 });
    near.w.msg(near.a, [{ t: 'pu', c: near.b, d: [100, 0], s: 60 }], 100);
    expect(near.w.xev(near.b, 'pu')).toHaveLength(1);
    const far = setup({ dx: 351 });
    far.w.msg(far.a, [{ t: 'pu', c: far.b, d: [100, 0], s: 60 }], 100);
    expect(far.w.xev(far.b, 'pu')).toHaveLength(0);
  });
  it('nicht an sich selbst, nicht aus/in VR, nicht ohne cap push, nicht an Unbekannte', () => {
    const { w, a, b } = setup();
    w.msg(a, [{ t: 'pu', c: a, d: [100, 0], s: 60 }], 100);
    w.msg(a, [{ t: 'pu', c: 999, d: [100, 0], s: 60 }], 100);
    expect(w.take(a).filter((f) => f.t === 'x')).toEqual([]);
    expect(w.take(b).filter((f) => f.t === 'x')).toEqual([]);
    const vr1 = setup({ a: { f: 8 } });
    vr1.w.msg(vr1.a, [{ t: 'pu', c: vr1.b, d: [100, 0], s: 60 }], 100);
    expect(vr1.w.xev(vr1.b, 'pu')).toEqual([]);
    const vr2 = setup({ b: { f: 8 } });
    vr2.w.msg(vr2.a, [{ t: 'pu', c: vr2.b, d: [100, 0], s: 60 }], 100);
    expect(vr2.w.xev(vr2.b, 'pu')).toEqual([]);
    const nc = setup({ b: { cap: ['pres', 'phys'] } });
    nc.w.msg(nc.a, [{ t: 'pu', c: nc.b, d: [100, 0], s: 60 }], 100);
    expect(nc.w.xev(nc.b, 'pu')).toEqual([]);
    const sc = setup({ a: { cap: ['pres'] } });
    sc.w.msg(sc.a, [{ t: 'pu', c: sc.b, d: [100, 0], s: 60 }], 100);
    expect(sc.w.xev(sc.a, 'er')).toEqual([{ t: 'er', c: 'cap', y: 'pu' }]);
  });
  it('Rate 2/s', () => {
    const { w, a, b } = setup();
    for (let k = 0; k < 6; k++) w.msg(a, [{ t: 'pu', c: b, d: [0, 100], s: 50 }], 10);
    expect(w.xev(b, 'pu').length).toBe(2);
  });
  it('Ohne Pose von Sender/Ziel: verworfen', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.take(b);
    w.msg(a, [{ t: 'pu', c: b, d: [0, 100], s: 50 }], 100);
    expect(w.xev(b, 'pu')).toEqual([]);
  });
});

describe('mp-phys: Quelltext', () => {
  it('keine Timer, keine Node-/CF-APIs', () => {
    const src = readFileSync(new URL('../src/mp/phys.js', import.meta.url), 'utf8');
    expect(src).not.toMatch(/setTimeout|setInterval|cloudflare:|node:|require\(|Math\.random\(|Date\.now/);
  });
});

describe('mp-phys: Golden s2c', () => {
  function scenario() {
    const w = world();
    const out = {};
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.pose(a, 1000, 1000, 50);
    w.pose(b, 1200, 1000, 50);
    w.take(a); w.take(b);
    w.msg(a, [PC('ball1')], 100);
    out.po_claim = w.bevs(b, 'po')[0];
    w.msg(b, [PC('ball1')], 100); // innerhalb der Haltezeit: verweigert
    out.po_deny = w.bevs(b, 'po')[0];
    w.msg(a, [PS(E('ball1', 1, 0, 120, 340))], 300);
    out.ps_b = w.bevs(b, 'ps')[0];
    w.msg(a, [PS(E('ball1', 1, 1, 130, 350))], 300);
    out.ps_rest = w.bevs(b, 'ps')[0];
    w.take(b);
    w.msg(a, [{ t: 'pn', i: `${a}.1`, it: ITEM, q: [100, 120, 300, 10, 20, 30, 15, 5] }], 300);
    out.pn_b = w.bevs(b, 'pn')[0];
    w.msg(a, [{ t: 'px', i: `${a}.1` }], 300);
    out.px_b = w.bevs(b, 'px')[0];
    w.take(a);
    w.msg(a, [{ t: 'pu', c: b, d: [100, 0], s: 60 }], 300);
    out.pu_x = w.xev(b, 'pu')[0];
    const c = w.join('c', 'Cleo');
    out.wl_phys = { po: w.frames[c].find((x) => x.t === 'wl').po, pr: w.frames[c].find((x) => x.t === 'wl').pr };
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
