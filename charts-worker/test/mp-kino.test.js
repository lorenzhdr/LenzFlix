/* global process */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { createState, step, SERVER_CAPS, STORE_PREFIXES } from '../src/mp/room.js';
import kino, { V, BUF_WAIT_MS, LG_MS, MAX_SESSIONS } from '../src/mp/kino.js';
import { LIMITS } from '../src/mp/limits.js';

const GOLDEN = new URL('./fixtures/mp-golden/kino.json', import.meta.url);
const NOW0 = 1_700_000_000_000;
const K = (ch) => ch.repeat(12);
const CAPS = ['pres', 'kino'];
const ITEM = 'a1'.repeat(16);
const ITEM2 = 'b2'.repeat(16);
const GAP = 1100; // ueber den 1/s-Grenzen

function world() {
  const w = { now: NOW0, frames: {}, closes: [], store: {}, atts: {}, rand: () => 0.5, alarm: null };
  w.st = createState({ now: w.now });
  w.ev = (e, dt = 0) => {
    w.now += dt;
    const r = step(w.st, e, w.now, w.rand);
    for (const o of r.out) {
      if (o.kind === 'att') w.atts[o.c] = o.att;
      if (o.kind !== 'send') continue;
      const f = o.data === 'pong' ? 'pong' : JSON.parse(o.data);
      (w.raw ||= []).push(o.data);
      for (const c of o.to) (w.frames[c] ||= []).push(f);
    }
    for (const s of r.store) { if (s.op === 'put') w.store[s.key] = s.val; else delete w.store[s.key]; }
    for (const c of r.close) w.closes.push(c);
    w.alarm = r.alarmAt;
    return r;
  };
  w.msg = (c, arr, dt = GAP) => w.ev({ type: 'message', c, data: JSON.stringify(arr) }, dt);
  w.join = (ch, n, { f = 3, cap = CAPS } = {}, dt = 0) => {
    const c = w.ev({ type: 'open', claims: { k: K(ch), n, a: 0, e: NOW0 + 36_000_000, j: 'j-' + ch } }, dt).c;
    w.msg(c, [{ t: 'hi', pv: 1, cap, f, cv: '1.16.0' }], 0);
    return c;
  };
  w.tick = (dt) => w.ev({ type: 'alarm', auto: Object.fromEntries(Object.keys(w.st.peers).map((c) => [c, w.now + dt])) }, dt);
  w.take = (c) => { const f = w.frames[c] || []; w.frames[c] = []; return f; };
  w.bevs = (c, t) => w.take(c).filter((f) => f.t === 'b').flatMap((f) => f.ev || []).filter((e) => e.t === t);
  w.xev = (c, t) => w.take(c).filter((f) => f.t === 'x').flatMap((f) => f.ev).filter((e) => e.t === t);
  return w;
}

// Gastgeber a startet, Mitglied b schaut mit; gibt {w, a, b, sid} zurueck, Frames geleert.
function party({ f = 3 } = {}) {
  const w = world();
  const a = w.join('a', 'Anna', { f });
  const b = w.join('b', 'Ben');
  w.msg(a, [{ t: 'ks', i: ITEM, p: 5000 }]);
  const sid = w.xev(a, 'kx')[0].sid;
  w.msg(a, [{ t: 'kb', sid, b: 0 }]); // Gastgeber bereit -> st=1
  w.take(a); w.take(b);
  return { w, a, b, sid };
}
const kxOf = (w, c) => w.xev(c, 'kx').pop();

describe('mp-kino: Vertrag', () => {
  it('Server kuendigt kino an, Storage-Praefix hall', () => {
    expect(SERVER_CAPS).toContain('kino');
    expect(STORE_PREFIXES).toContain('hall');
    expect(kino.cap).toBe('kino');
  });
  const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
  for (const c of golden.c2s) it('Golden c2s: ' + c.name, () => expect(V[c.in.t](c.in)).toEqual(c.out));
  it('Golden limits', () => {
    for (const t of ['ks', 'kj', 'kl', 'kc', 'kb']) expect(LIMITS[t]).toEqual(golden.limits[t]);
  });
  it('Validatoren: Klemmen und Ablehnung', () => {
    expect(V.ks({ i: 'XYZ', p: 1 })).toBeNull();
    expect(V.ks({ i: ITEM, p: NaN })).toBeNull();
    expect(V.ks({ p: 1e12 }).p).toBe(12 * 3600 * 1000);
    expect(V.ks({ i: ITEM })).toEqual({ t: 'ks', i: ITEM, p: 0 });
    expect(V.kc({ sid: 1, v: 1, o: 4, p: 0 })).toBeNull();
    expect(V.kc({ sid: 1, v: 1.5, o: 1, p: 0 })).toBeNull();
    expect(V.kc({ sid: 0, v: 1, o: 1, p: 0 })).toBeNull();
    expect(V.kc({ sid: 1, v: 1, o: 3, p: -5 }).p).toBe(0);
    expect(V.kb({ sid: 1, b: 2 })).toBeNull();
    expect(V.kj({ sid: 'x' })).toBeNull();
    expect(V.kl({ sid: 70000 })).toBeNull();
  });
});

describe('mp-kino: Sitzung und Mitschauen', () => {
  it('ks legt Sitzung an (st=0, wartet), kb 0 des Gastgebers startet; kh und wl.kh', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.take(a); w.take(b);
    w.msg(a, [{ t: 'ks', i: ITEM, p: 5000, dur: 7200000 }]);
    const kx = kxOf(w, a);
    expect(kx).toMatchObject({ t: 'kx', st: 0, p: 5000, m: [a], lg: [], i: ITEM, v: 1 });
    expect(kx.w).toBeUndefined();
    expect(w.store.hall.s).toHaveLength(1);
    const t0 = w.now;
    w.msg(a, [{ t: 'kb', sid: kx.sid, b: 0 }]);
    const kx2 = kxOf(w, a);
    expect(kx2).toMatchObject({ st: 1, at: w.now, p: 5000, v: 2 });
    expect(w.now).toBeGreaterThan(t0);
    const kh = w.bevs(b, 'kh').pop();
    expect(kh.l).toEqual([[kx.sid, a, ITEM, 1, 1, [a], 5000, w.now]]);
    const cc = w.join('c', 'Cleo');
    expect(w.frames[cc].find((f) => f.t === 'wl').kh).toEqual(kh.l);
  });
  it('kj: Mitschauen oeffentlich, Neuer in lg, kx an alle, kh.anzahl', () => {
    const { w, a, b, sid } = party();
    w.msg(b, [{ t: 'kj', sid }]);
    expect(w.frames[a].filter((f) => f.t === 'b').flatMap((f) => f.ev).find((e) => e.t === 'kh').l[0][3]).toBe(2);
    const kxa = kxOf(w, a);
    expect(kxa.m).toEqual([a, b]);
    expect(kxa.lg).toEqual([b]);
    expect(kxa.i).toBe(ITEM);
    expect(kxa.v).toBe(2); // Beitritt aendert v nicht
    expect(kxOf(w, b).m).toEqual([a, b]);
  });
  it('kj auf unbekannte oder private Sitzung: er deny, keine Item-ID, kein kh', () => {
    const { w, a, b, sid } = party({ f: 1 });
    const priv = w.frames; // alle bisherigen Frames sind geleert; ks lief privat
    expect(priv[a]).toEqual([]);
    w.msg(b, [{ t: 'kj', sid }]);
    expect(w.xev(b, 'er')[0]).toMatchObject({ c: 'deny', y: 'kj' });
    w.msg(b, [{ t: 'kj', sid: 999 }]);
    expect(w.xev(b, 'er')[0]).toMatchObject({ c: 'deny' });
  });
  it('privat: kh leer, kx ohne i; Wechsel auf oeffentlich und zurueck folgt live (K2)', () => {
    const w = world();
    const a = w.join('a', 'Anna', { f: 1 });
    const b = w.join('b', 'Ben');
    w.take(a); w.take(b);
    w.msg(a, [{ t: 'ks', i: ITEM, p: 0 }]);
    const kx = kxOf(w, a);
    expect(kx.i).toBeUndefined();
    expect(w.bevs(b, 'kh')).toEqual([]);
    expect(w.frames[b] || []).toEqual([]);
    w.msg(a, [{ t: 'f', f: 3 }]); // Film sichtbar
    const kh = w.bevs(b, 'kh').pop();
    expect(kh.l[0][2]).toBe(ITEM);
    w.msg(b, [{ t: 'kj', sid: kx.sid }]);
    expect(kxOf(w, b).i).toBe(ITEM);
    w.take(b);
    const n0 = w.raw.length;
    w.msg(a, [{ t: 'f', f: 1 }]); // wieder privat
    expect(w.bevs(b, 'kh').pop().l).toEqual([]);
    expect(w.raw.length).toBeGreaterThan(n0);
    for (const raw of w.raw.slice(n0)) expect(raw).not.toContain(ITEM);
  });
  it('Datenschutz: ohne Film-Flag taucht die Item-ID nie auf der Leitung auf', () => {
    const w = world();
    const a = w.join('a', 'Anna', { f: 0 });
    const b = w.join('b', 'Ben');
    const before = w.raw.length;
    w.msg(a, [{ t: 'ks', i: ITEM, p: 100 }]);
    const sid = kxOf(w, a).sid;
    w.msg(a, [{ t: 'kb', sid, b: 0 }]);
    w.msg(a, [{ t: 'kc', sid, v: 2, o: 2, p: 300 }]);
    w.msg(b, [{ t: 'kj', sid }]);
    for (const raw of w.raw.slice(before)) expect(raw).not.toContain(ITEM);
  });
  it('Mitglied einer Sitzung, das ks sendet, verlaesst die alte; ks ueber 8 Sitzungen: er cap', () => {
    const w = world();
    const cs = [];
    for (let i = 0; i < MAX_SESSIONS; i++) cs.push(w.join('abcdef01'[i], 'N' + i));
    for (const c of cs) w.msg(c, [{ t: 'ks', i: ITEM, p: 0 }]);
    expect(w.st.kino.s).toHaveLength(MAX_SESSIONS);
    const x = w.join('2', 'Neu');
    w.take(x);
    w.msg(x, [{ t: 'ks', i: ITEM2, p: 0 }]);
    expect(w.xev(x, 'er')[0]).toMatchObject({ c: 'cap', y: 'ks' });
    expect(w.st.kino.s).toHaveLength(MAX_SESSIONS);
    w.msg(cs[0], [{ t: 'ks', i: ITEM2, p: 0 }]); // neuer Film: alte Sitzung leer -> frei
    expect(w.st.kino.s).toHaveLength(MAX_SESSIONS);
    expect(w.st.kino.s.find((s) => s.i === ITEM2).host).toBe(cs[0]);
  });
});

describe('mp-kino: Steuern (CAS, Server-Zeit)', () => {
  it('pause/play/seek setzen absoluten Zustand, v+1, kx an alle mit Server-Zeit', () => {
    const { w, a, b, sid } = party();
    w.msg(b, [{ t: 'kj', sid }]);
    w.take(a); w.take(b);
    let v = 2;
    w.msg(b, [{ t: 'kc', sid, v, o: 2, p: 61000 }]);
    let x = kxOf(w, a);
    expect(x).toMatchObject({ st: 2, p: 61000, at: w.now, v: 3 });
    v = 3;
    w.msg(a, [{ t: 'kc', sid, v, o: 3, p: 90000 }]);
    x = kxOf(w, b);
    expect(x).toMatchObject({ st: 2, p: 90000, v: 4 });
    v = 4;
    w.msg(a, [{ t: 'kc', sid, v, o: 1, p: 90000 }]);
    x = kxOf(w, b);
    expect(x).toMatchObject({ st: 1, p: 90000, at: w.now, v: 5 });
    w.msg(b, [{ t: 'kc', sid, v: 5, o: 3, p: 120000 }], 400 + 700);
    x = kxOf(w, a);
    expect(x).toMatchObject({ st: 1, p: 120000, at: w.now, v: 6 }); // Seek waehrend Lauf: at=jetzt
  });
  it('CAS: alte v -> er stale plus aktuelles kx an den Absender, Zustand unveraendert', () => {
    const { w, a, b, sid } = party();
    w.msg(b, [{ t: 'kj', sid }]);
    w.msg(a, [{ t: 'kc', sid, v: 2, o: 2, p: 1000 }]);
    w.take(a); w.take(b);
    w.msg(b, [{ t: 'kc', sid, v: 2, o: 1, p: 2000 }]); // veraltet
    const fr = w.take(b).find((f) => f.t === 'x').ev;
    expect(fr[0]).toMatchObject({ t: 'er', c: 'stale', y: 'kc' });
    expect(fr[1]).toMatchObject({ t: 'kx', v: 3, st: 2, p: 1000 });
    expect(w.take(a)).toEqual([]);
    expect(w.st.kino.s[0].st).toBe(2);
  });
  it('kc von Nichtmitglied oder falscher sid: er deny', () => {
    const { w, b, sid } = party();
    w.msg(b, [{ t: 'kc', sid, v: 2, o: 2, p: 0 }]);
    expect(w.xev(b, 'er')[0]).toMatchObject({ c: 'deny', y: 'kc' });
    w.msg(b, [{ t: 'kc', sid: 4242, v: 1, o: 2, p: 0 }]);
    expect(w.xev(b, 'er')[0]).toMatchObject({ c: 'deny' });
  });
});

describe('mp-kino: Puffern', () => {
  it('Einfrieren, w, Nachmelder ohne Verlaengerung, Weiter bei leerem Puffer', () => {
    const { w, a, b, sid } = party();
    const at = w.st.kino.s[0].at;
    w.msg(b, [{ t: 'kj', sid }]);
    w.tick(LG_MS + 1000);
    w.take(a); w.take(b);
    w.msg(b, [{ t: 'kb', sid, b: 1 }], 0);
    const x = kxOf(w, a);
    expect(x).toMatchObject({ st: 0, at: w.now, p: 5000 + (w.now - at), w: w.now + BUF_WAIT_MS });
    expect(x.lg).toEqual([]);
    const w0 = x.w;
    w.msg(a, [{ t: 'kb', sid, b: 1 }], GAP);
    const y = kxOf(w, b);
    expect(y.w).toBe(w0); // keine Verlaengerung
    expect(w.st.kino.s[0].buf).toEqual([b, a]);
    w.msg(b, [{ t: 'kb', sid, b: 0 }], 200);
    expect(w.st.kino.s[0].st).toBe(0);
    w.msg(a, [{ t: 'kb', sid, b: 0 }], 200);
    const z = kxOf(w, b);
    expect(z).toMatchObject({ st: 1, at: w.now, p: x.p });
    expect(z.w).toBeUndefined();
    expect(w.st.kino.s[0].v).toBe(x.v + 1);
  });
  it('Frist laeuft ab: st=1, Puffernde landen in lg (60 s), kb 1 aus lg verworfen; nextDeadline', () => {
    const { w, a, b, sid } = party();
    w.msg(b, [{ t: 'kj', sid }]);
    w.tick(LG_MS + 1000);
    w.msg(b, [{ t: 'kb', sid, b: 1 }], 0);
    const s0 = w.st.kino.s[0];
    expect(kino.nextDeadline(w.st, w.now)).toBe(s0.w);
    expect(w.alarm).toBeLessThanOrEqual(s0.w);
    w.take(a); w.take(b);
    w.tick(BUF_WAIT_MS + 5);
    const x = kxOf(w, a);
    expect(x).toMatchObject({ st: 1, at: w.now, lg: [b] });
    expect(x.w).toBeUndefined();
    expect(kino.nextDeadline(w.st, w.now)).toBeNull();
    w.msg(b, [{ t: 'kb', sid, b: 1 }], GAP);
    expect(w.st.kino.s[0].st).toBe(1); // kb 1 aus lg verworfen
    w.tick(LG_MS + 10);
    expect(kxOf(w, a).lg).toEqual([]);
    w.msg(b, [{ t: 'kb', sid, b: 1 }], GAP);
    expect(w.st.kino.s[0].st).toBe(0);
  });
  it('Fristablauf wird auch ohne Alarm bei der naechsten Nachricht angewandt', () => {
    const { w, a, b, sid } = party();
    w.msg(b, [{ t: 'kj', sid }]);
    w.tick(LG_MS + 1000);
    w.msg(b, [{ t: 'kb', sid, b: 1 }], 0);
    w.msg(a, [{ t: 'kc', sid, v: 99, o: 1, p: 0 }], BUF_WAIT_MS + 50); // stale, aber tick lief zuerst
    expect(w.st.kino.s[0].st).toBe(1);
  });
  it('kb bei Pause oder von Nichtmitglied wirkungslos', () => {
    const { w, a, b, sid } = party();
    w.msg(a, [{ t: 'kc', sid, v: 2, o: 2, p: 10 }]);
    w.msg(a, [{ t: 'kb', sid, b: 1 }]);
    expect(w.st.kino.s[0]).toMatchObject({ st: 2, buf: [] });
    w.msg(b, [{ t: 'kb', sid, b: 1 }]);
    expect(w.st.kino.s[0].st).toBe(2);
  });
  it('Gastgeber verlaesst waehrend Wartens: kein Dauerwarten (Puffer leer -> weiter)', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.msg(a, [{ t: 'ks', i: ITEM, p: 0 }]);
    const sid = kxOf(w, a).sid;
    w.msg(b, [{ t: 'kj', sid }]);
    w.take(b);
    w.ev({ type: 'close', c: a }, 100);
    expect(kxOf(w, b)).toMatchObject({ st: 1, m: [b] });
  });
});

describe('mp-kino: Gastgeber, Verlassen, Disconnect', () => {
  it('Gastgeber geht (kl): aeltestes Mitglied wird Host, pv folgt dem neuen Host', () => {
    const { w, a, b, sid } = party();
    w.msg(b, [{ t: 'kj', sid }]);
    w.take(a); w.take(b);
    w.msg(a, [{ t: 'f', f: 1 }]); // alter Host privat -> kh leer
    expect(w.bevs(b, 'kh').pop().l).toEqual([]);
    w.msg(a, [{ t: 'kl', sid }]);
    expect(w.st.kino.s[0].host).toBe(b);
    const kh = w.frames[b].filter((f) => f.t === 'b').flatMap((f) => f.ev).filter((e) => e.t === 'kh').pop(); // b hat Film-Flag (f=3) -> Sitzung wieder oeffentlich
    expect(kxOf(w, b)).toMatchObject({ m: [b] });
    expect(kh.l[0].slice(0, 4)).toEqual([sid, b, ITEM, 1]);
  });
  it('letztes Mitglied geht: Sitzung und hall weg, kh leer', () => {
    const { w, a, b, sid } = party();
    w.msg(a, [{ t: 'kl', sid }]);
    expect(w.st.kino.s).toEqual([]);
    expect(w.store.hall).toBeUndefined();
    expect(w.bevs(b, 'kh').pop().l).toEqual([]);
  });
  it('Disconnect entfernt das Mitglied (Host-Uebergabe), kl fremder sid wirkungslos', () => {
    const { w, a, b, sid } = party();
    w.msg(b, [{ t: 'kj', sid }]);
    w.msg(b, [{ t: 'kl', sid: 777 }]);
    expect(w.st.kino.s[0].m).toEqual([a, b]);
    w.take(b);
    w.ev({ type: 'close', c: a }, 100);
    expect(w.st.kino.s[0]).toMatchObject({ host: b, m: [b] });
    expect(w.store.hall.s[0].m).toEqual([b]);
    expect(kxOf(w, b).m).toEqual([b]);
  });
  it('kj in andere Sitzung verlaesst die bisherige', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    const c = w.join('c', 'Cleo');
    w.msg(a, [{ t: 'ks', i: ITEM, p: 0 }]);
    w.msg(b, [{ t: 'ks', i: ITEM2, p: 0 }]);
    const sids = w.st.kino.s.map((s) => s.sid);
    w.msg(c, [{ t: 'kj', sid: sids[0] }]);
    w.msg(c, [{ t: 'kj', sid: sids[1] }]);
    expect(w.st.kino.s.map((s) => s.m)).toEqual([[a], [b, c]]);
  });
});

describe('mp-kino: Kaltstart', () => {
  it('hall wird wiederhergestellt, Mitglieder bleiben, Tote fliegen raus', () => {
    const { w, a, b, sid } = party();
    w.msg(b, [{ t: 'kj', sid }]);
    const hall = JSON.parse(JSON.stringify(w.store.hall));
    expect(hall.s[0].m).toEqual([a, b]);
    const st2 = createState({ store: { hall }, atts: [w.atts[a], w.atts[b]].map((x) => structuredClone(x)), now: w.now });
    const r = step(st2, { type: 'message', c: a, data: JSON.stringify([{ t: 'kc', sid, v: 2, o: 2, p: 777 }]) }, w.now + 1000, () => 0.1);
    const xs = r.out.filter((o) => o.kind === 'send').map((o) => JSON.parse(o.data)).filter((f) => f.t === 'x').flatMap((f) => f.ev);
    expect(xs.find((e) => e.t === 'kx')).toMatchObject({ sid, v: 3, st: 2, p: 777, m: [a, b] });
    // nur a ueberlebt den Schlaf: b ist tot
    const st3 = createState({ store: { hall }, atts: [structuredClone(w.atts[a])], now: w.now });
    const r3 = step(st3, { type: 'alarm' }, w.now + 1000, () => 0.1);
    expect(st3.kino.s[0].m).toEqual([a]);
    expect(r3.store.some((s) => s.op === 'put' && s.key === 'hall')).toBe(true);
  });
  it('kein ueberfluessiges kh/hall nach Kaltstart ohne Aenderung', () => {
    const { w, a, b } = party();
    const hall = JSON.parse(JSON.stringify(w.store.hall));
    const st2 = createState({ store: { hall }, atts: [w.atts[a], w.atts[b]].map((x) => structuredClone(x)), now: w.now });
    const r = step(st2, { type: 'alarm' }, w.now + 1000, () => 0.1);
    expect(r.store.filter((s) => s.key === 'hall')).toEqual([]);
    const frames = r.out.filter((o) => o.kind === 'send').map((o) => JSON.parse(o.data));
    expect(frames.flatMap((f) => f.ev || []).filter((e) => e.t === 'kh')).toEqual([]);
  });
});

describe('mp-kino: Raten und Faehigkeit', () => {
  it('ks/kj/kl 1/s, kc 2/s, kb 4/s: Ueberschreitung wird verworfen', () => {
    const w = world();
    const a = w.join('a', 'Anna');
    w.msg(a, [{ t: 'ks', i: ITEM, p: 0 }], 0);
    w.msg(a, [{ t: 'ks', i: ITEM2, p: 0 }], 10); // zu schnell: verworfen
    expect(w.st.kino.s).toHaveLength(1);
    expect(w.st.kino.s[0].i).toBe(ITEM);
    const sid = w.st.kino.s[0].sid;
    w.msg(a, [{ t: 'kb', sid, b: 0 }], GAP);
    let v = w.st.kino.s[0].v;
    w.msg(a, [{ t: 'kc', sid, v, o: 2, p: 1 }], GAP);
    w.msg(a, [{ t: 'kc', sid, v: v + 1, o: 1, p: 2 }], 10);
    w.msg(a, [{ t: 'kc', sid, v: v + 2, o: 2, p: 3 }], 10); // dritter in 20 ms: Bucket leer
    expect(w.st.kino.s[0].v).toBe(v + 2);
    w.msg(a, [{ t: 'kl', sid }], GAP);
    expect(w.st.kino.s).toEqual([]);
    w.msg(a, [{ t: 'ks', i: ITEM, p: 0 }], 10); // ks nach 1 s Pause ok? nur 10 ms seit kl, aber ks hat eigenen Eimer
    expect(w.st.kino.s).toHaveLength(1);
  });
  it('ohne ausgehandelte Faehigkeit kino: er cap, keine Sitzung', () => {
    const w = world();
    const a = w.join('a', 'Anna', { cap: ['pres'] });
    expect(w.frames[a].find((f) => f.t === 'wl').kh).toBeUndefined();
    w.take(a);
    w.msg(a, [{ t: 'ks', i: ITEM, p: 0 }]);
    expect(w.xev(a, 'er')[0]).toMatchObject({ c: 'cap', y: 'ks' });
    expect(w.st.kino.s).toEqual([]);
  });
  it('Attachment bleibt klein (kein Kino-Zustand im Attachment)', () => {
    const { w, a } = party();
    expect(JSON.stringify(w.atts[a]).length).toBeLessThan(1000);
  });
});

describe('mp-kino: Golden s2c', () => {
  function scenario() {
    const w = world();
    const out = {};
    const a = w.join('a', 'Anna');
    const b = w.join('b', 'Ben');
    w.take(a); w.take(b);
    w.msg(a, [{ t: 'ks', i: ITEM, p: 5000 }]);
    const sid = w.xev(a, 'kx')[0].sid;
    w.msg(a, [{ t: 'kb', sid, b: 0 }]);
    out.kh = w.bevs(b, 'kh').pop();
    w.msg(b, [{ t: 'kj', sid }]);
    out.kx_join = w.xev(b, 'kx').pop();
    w.msg(b, [{ t: 'kc', sid, v: 2, o: 2, p: 61000 }]);
    out.kx_pause = w.xev(a, 'kx').pop();
    w.msg(a, [{ t: 'kc', sid, v: 2, o: 1, p: 0 }]);
    out.er_stale = w.take(a).find((f) => f.t === 'x').ev[0];
    w.take(a); w.take(b);
    const c = w.join('c', 'Cleo');
    out.wl_kh = w.frames[c].find((f) => f.t === 'wl').kh;
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
