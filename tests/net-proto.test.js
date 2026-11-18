// Protokoll lfx-mp.1 (net/proto.js): eingefrorene Codetabellen, ANIM-/ANIMS-Mapping, Builder, Klemmen, sanitize, Golden des Workers.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { ANIM } from '../src/js/store3d/controls/body.js';
import { ANIMS } from '../src/js/store3d/npc/anim.js';
import * as P from '../src/js/store3d/net/proto.js';

const ID = 'a'.repeat(32);

describe('eingefrorene Codes', () => {
  it('SUB, PV, CAPS, Flags', () => {
    expect(P.SUB).toBe('lfx-mp.1');
    expect(P.PV).toBe(1);
    expect(P.CAPS).toEqual(['pres', 'chat', 'emote', 'push', 'phys', 'rich', 'wx', 'kino', 'admin', 'look']);
    expect(P.F).toEqual({ NAME: 1, FILM: 2, CHAT: 4, VR: 8 });
    expect(P.R).toEqual({ SHOP: 0, PALAST: 1, OUT: 2 });
  });
  it('Pose-a und Emote-e', () => {
    expect(P.NET_A).toEqual({ STAND: 0, WALK: 1, RUN: 2, AIR: 3, KNOCK: 4, MANTLE: 5, HIT: 6, SIT: 7, THROW: 8 });
    expect(P.NET_A_ANIM).toEqual(['idle', 'walk', 'run', 'idle', 'stagger', 'idle', 'hit', 'sit', 'throw', 'ko', 'cover', 'whip', 'belt', 'aim', 'threat', 'idle']);
    expect(P.EMOTE_ANIM).toEqual([null, 'wave', 'cheer', 'point', 'sit', 'dance', 'clap', 'thumbs', 'bow']);
    expect(P.EMOTE_END_A).toEqual([1, 2, 3, 4, 6, 8]);
  });
  it('Body.ANIM -> Leitungscode ist eine Tabelle und trifft die vorgesehenen Werte', () => {
    expect(P.bodyAnimToNet(ANIM.STAND)).toBe(P.NET_A.STAND);
    expect(P.bodyAnimToNet(ANIM.WALK)).toBe(P.NET_A.WALK);
    expect(P.bodyAnimToNet(ANIM.RUN)).toBe(P.NET_A.RUN);
    expect(P.bodyAnimToNet(ANIM.AIR)).toBe(P.NET_A.AIR);
    expect(P.bodyAnimToNet(ANIM.KNOCK)).toBe(P.NET_A.KNOCK);
    expect(P.bodyAnimToNet(ANIM.MANTLE)).toBe(P.NET_A.MANTLE);
    expect(P.bodyAnimToNet(ANIM.HIT)).toBe(P.NET_A.HIT);
    expect(P.bodyAnimToNet(99)).toBe(0);
    expect(Object.keys(ANIM)).toHaveLength(7); // neue Body-Zustände brauchen einen Eintrag in BODY_TO_NET
  });
  it('Leitungscode -> ANIMS-Name existiert in npc/anim.js (Body.ANIM und ANIMS-Index sind NICHT gleich)', () => {
    for (const name of P.NET_A_ANIM) expect(ANIMS).toContain(name);
    expect(ANIMS.indexOf('sit')).not.toBe(P.NET_A.SIT);
    expect(P.netAnimName(3)).toBe('idle');
    expect(P.netAnimName(7)).toBe('sit');
    expect(P.netAnimName(99)).toBe('idle');
    for (const n of P.EMOTE_ANIM.slice(1, 5)) expect(ANIMS).toContain(n); // wave, cheer, point, sit; Rest folgt in Welle b
    expect(P.emoteName(5)).toBe('dance');
    expect(P.emoteName(0)).toBe(null);
    expect(P.emoteEndsOn(1)).toBe(true);
    expect(P.emoteEndsOn(0)).toBe(false);
  });
  it('Fähigkeit je Nachrichtentyp', () => {
    expect(P.CAP_OF.p).toBe('pres');
    expect(P.CAP_OF.m).toBe('chat');
    expect(P.CAP_OF.pu).toBe('push');
    expect(P.CAP_OF.ps).toBe('phys');
    expect(P.CAP_OF.rs).toBe('rich');
    expect(P.CAP_OF.kc).toBe('kino');
    expect(P.CAP_OF.ki).toBe('admin');
    expect(P.CAP_OF.ck).toBe(null);
    expect(P.CAP_OF.lk).toBe('look');
    expect(P.CAP_OF.mc).toBe('look');
  });
});

describe('Builder und Klemmen', () => {
  it('hi', () => {
    expect(P.build.hi({ cap: ['pres', 'nope', 'chat'], f: 5, cv: '1.16.0' })).toEqual({ t: 'hi', pv: 1, cap: ['pres', 'chat'], f: 5, cv: '1.16.0' });
    expect(P.build.hi({ cap: ['chat', 'pres', 'chat'] }).cap).toEqual(['chat', 'pres']);
    expect(P.normalizeOut({ t: 'hi', pv: 1.5 })).toBe(null);
    expect(P.normalizeOut({ t: 'hi', pv: 1, cap: 'pres' })).toBe(null);
    expect(P.build.hi({ cap: P.CAPS, f: 99, cv: 'x'.repeat(40) }).f).toBe(15);
    expect(P.build.hi({ cap: P.CAPS, f: 1, cv: 'x'.repeat(40) }).cv).toHaveLength(16);
    expect(P.build.hi().cap).toEqual([]);
  });
  it('p: Klemmen, Rundung, unbekannte a/r -> 0, se', () => {
    expect(P.build.p([1.4, 2, 3.6, 10, -5, 1, 2])).toEqual({ t: 'p', q: [1, 2, 4, 10, -5, 1, 2] });
    expect(P.build.p([9999, 9999, 9999, 999, 999, 99, 9]).q).toEqual([5000, 1200, 5400, 315, 157, 0, 0]); // unbekannte a/r -> 0
    expect(P.build.p([-9999, -9999, -9999, -999, -999, -1, -1]).q).toEqual([-3000, -200, -1600, -315, -157, 0, 0]);
    expect(P.build.p([0, 0, 0, 0, 0, 8, 2]).q.slice(5)).toEqual([8, 2]);
    expect(P.build.p([0, 0, 0, 0, 0, 3.4, 1.2]).q.slice(5)).toEqual([3, 1]);
    expect(P.build.p([0, 0, 0, 0, 0, 7, 1], [3, 500])).toEqual({ t: 'p', q: [0, 0, 0, 0, 0, 7, 1], se: [3, 500] });
    expect(P.build.p([0, 0, 0, 0, 0, 7, 1], [9, 9999]).se).toEqual([5, 1000]);
    expect(P.build.p([0, 0, 0, 0, 0, 1, 1], [3, 500]).se).toBeUndefined(); // se nur beim Sitzen
    expect(P.build.p([0, 0, 0, 0, 0, 7, 1], [3])).toBe(null);
    expect(Object.is(P.build.p([-0.2, 0, 0, 0, 0, 0, 0]).q[0], 0)).toBe(true);
  });
  it('nicht-endliche Zahlen und kaputte Formen verwerfen die Nachricht', () => {
    expect(P.build.p([NaN, 0, 0, 0, 0, 0, 0])).toBe(null);
    expect(P.build.p([0, Infinity, 0, 0, 0, 0, 0])).toBe(null);
    expect(P.build.p([0, 0, 0])).toBe(null);
    expect(P.build.p('x')).toBe(null);
    expect(P.build.ps([['bin', 1, NaN, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]])).toBe(null);
    expect(P.build.ck('x')).toBe(null);
    expect(P.normalizeOut(null)).toBe(null);
    expect(P.normalizeOut({ t: 'unbekannt' })).toBe(null);
    expect(P.normalizeOut({})).toBe(null);
  });
  it('hd/f/e/m/pu/pc', () => {
    expect(P.build.hd(ID)).toEqual({ t: 'hd', i: ID });
    expect(P.build.hd(null)).toEqual({ t: 'hd', i: null });
    expect(P.build.hd('ZZ')).toBe(null);
    expect(P.build.f(3)).toEqual({ t: 'f', f: 3 });
    expect(P.build.e(5)).toEqual({ t: 'e', e: 5 });
    expect(P.build.e(9).e).toBe(8);
    expect(P.build.e(0).e).toBe(1);
    expect(P.build.m('  hallo \n welt  ')).toEqual({ t: 'm', x: 'hallo welt' });
    expect(P.build.m('   ')).toBe(null);
    expect(P.build.pu(7, [60, -80], 60)).toEqual({ t: 'pu', c: 7, d: [60, -80], s: 60 });
    expect(P.build.pu(0, [1, 1], 5)).toEqual({ t: 'pu', c: 1, d: [1, 1], s: 5 });
    expect(P.build.pu(5, [500, -500], 500)).toEqual({ t: 'pu', c: 5, d: [100, -100], s: 100 });
    expect(P.build.pc('binL', 3)).toEqual({ t: 'pc', i: 'binL', g: 3 });
    expect(P.build.pc('a b', 3)).toBe(null);
    expect(P.build.pc('x'.repeat(25), 3)).toBe(null);
  });
  it('ps: 8 Einträge, tip/ax/az, s, Geschwindigkeit ±1600', () => {
    const e = (i) => [i, 2, 100, 0, 200, 5000, -5000, 0, 3, 20, 9, 9, 1];
    const m = P.build.ps(Array.from({ length: 12 }, (_, i) => e(`o${i}`)));
    expect(m.l).toHaveLength(8);
    expect(m.l[0]).toEqual(['o0', 2, 100, 0, 200, 1600, -1600, 0, 3, 20, 9, 9, 1]);
    const flat = P.build.ps([['x', 1, 0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 0]]);
    expect(flat.l[0].slice(9)).toEqual([0, 0, 0, 0]); // ax/az nur bei tip > 0
    expect(P.build.ps([['x', 1, 0, 0, 0, 0, 0, 0, 0, 999, 500, -500, 5]]).l[0].slice(9)).toEqual([157, 100, -100, 0]);
    expect(P.build.ps([])).toBe(null);
  });
  it('pn/px/rc/rs/rr', () => {
    expect(P.build.pn('3.1', ID, [1, 2, 3, 4, 5, 6, 7, 8])).toEqual({ t: 'pn', i: '3.1', it: ID, q: [1, 2, 3, 4, 5, 6, 7, 8] });
    expect(P.build.pn('3.1', null, [1, 2, 3, 4, 5, 6, 7, 8]).it).toBe(null);
    expect(P.build.pn('3.1', 'xyz', [1, 2, 3, 4, 5, 6, 7, 8])).toBe(null);
    expect(P.build.px('3.1')).toEqual({ t: 'px', i: '3.1' });
    expect(P.build.rc()).toEqual({ t: 'rc' });
    expect(P.build.rs(4, [2, 1, 30, 100, 0, 200, 50, 3], 7)).toEqual({ t: 'rs', g: 4, q: [2, 1, 30, 100, 0, 200, 50, 3], tg: 7 });
    expect(P.build.rs(4, [2, 1, 30, 100, 0, 200, 50, 3]).tg).toBe(0);
    expect(P.build.rr(9)).toEqual({ t: 'rr', g: 9 });
  });
  it('Kino ks/kj/kl/kc/kb, ki, ck, rn', () => {
    expect(P.build.ks(ID, 5000)).toEqual({ t: 'ks', i: ID, p: 5000 });
    expect(P.build.ks(ID, 5000, 7200000).dur).toBe(7200000);
    expect(P.build.ks(ID, 99999999999).p).toBe(12 * 3600 * 1000);
    expect(P.build.ks('nope', 0)).toBe(null);
    expect(P.build.kj(4)).toEqual({ t: 'kj', sid: 4 });
    expect(P.build.kl('s-1')).toEqual({ t: 'kl', sid: 's-1' });
    expect(P.build.kc(4, 3, 2, 1000)).toEqual({ t: 'kc', sid: 4, v: 3, o: 2, p: 1000 });
    expect(P.build.kc(4, 3, 7, 1000).o).toBe(3);
    expect(P.build.kb(4, 1)).toEqual({ t: 'kb', sid: 4, b: 1 });
    expect(P.build.ki(12)).toEqual({ t: 'ki', c: 12 });
    expect(P.build.ck(1234.5)).toEqual({ t: 'ck', a: 1234.5 });
    expect(P.build.rn('abc-_.def_-1')).toEqual({ t: 'rn', tk: 'abc-_.def_-1' });
    expect(P.build.rn('abcdef')).toBe(null);
    expect(P.build.rn('a b.c')).toBe(null);
    expect(P.build.rn('')).toBe(null);
  });
  it('Pose a bis 15 (1.18-Naht), darüber 0', () => {
    expect(P.build.p([0, 0, 0, 0, 0, 9, 1]).q[5]).toBe(9);
    expect(P.build.p([0, 0, 0, 0, 0, 15, 1]).q[5]).toBe(15);
    expect(P.build.p([0, 0, 0, 0, 0, 16, 1]).q[5]).toBe(0);
    expect(P.netAnimName(12)).toBe('belt');
    expect(P.netAnimName(15)).toBe('idle');
    expect(P.netAnimName(16)).toBe('idle');
  });
  it('look: lk/mc wie der Server', () => {
    expect(P.build.lk([2, 1, 2, 3])).toEqual({ t: 'lk', l: [2, 1, 2, 3] });
    expect(P.build.lk([1, 2, 3])).toBe(null);
    expect(P.build.lk([16, 1, 2, 3])).toBe(null);
    expect(P.build.lk([2, 0x2000000, 2, 3])).toBe(null);
    expect(P.build.lk([2, 1.5, 2, 3])).toBe(null);
    expect(P.build.lk(Array(49).fill(1))).toBe(null);
    expect(P.build.mc([1, 123456, 20400])).toEqual({ t: 'mc', m: [1, 123456, 20400] });
    expect(P.build.mc(null)).toEqual({ t: 'mc', m: null });
    expect(P.build.mc([1])).toBe(null);
    expect(P.build.mc(Array(13).fill(1))).toBe(null);
    expect(P.build.mc([1, -1])).toBe(null);
    expect(P.build.mc([1, 2 ** 31])).toBe(null);
  });
  it('normalizeOut ist idempotent', () => {
    const msgs = [P.build.p([1, 2, 3, 4, 5, 6, 1]), P.build.hd(ID), P.build.ps([['x', 1, 0, 0, 0, 0, 0, 0, 0, 9, 3, 4, 0]]), P.build.rs(1, [1, 1, 1, 1, 1, 1, 1, 1], 2), P.build.e(3)];
    for (const m of msgs) expect(P.normalizeOut(m)).toEqual(m);
  });
});

describe('sanitize', () => {
  it('NFC, Steuer-, Bidi- und Zero-Width-Zeichen, Länge in Codepoints', () => {
    expect(P.sanitize('é')).toBe('é');
    expect(P.sanitize('a‮b​c\u0007d⁦e﻿')).toBe('abcde');
    expect(P.sanitize('a\tb\nc\r\nd')).toBe('a b c d');
    expect(P.sanitize('x'.repeat(300))).toHaveLength(200);
    expect(Array.from(P.sanitize('\u{1F600}'.repeat(300))).length).toBe(200);
    expect(Array.from(P.sanitizeName('\u{1F600}'.repeat(40))).length).toBe(24);
    expect(P.sanitize(5)).toBe('');
    expect(P.sanitize('   ')).toBe('');
  });
});

describe('Golden-Datei des Workers (core.json)', () => {
  const file = new URL('../charts-worker/test/fixtures/mp-golden/core.json', import.meta.url);
  const exists = fs.existsSync(file);
  const MINE = new Set(['hi', 'p', 'hd', 'f', 'ck', 'rn']);
  const cases = exists ? JSON.parse(fs.readFileSync(file, 'utf8')).c2s || [] : [];
  (exists ? it : it.skip)('c2s: normalizeOut(in) == out (null = verworfen) für alle Typen des Clients', () => {
    let n = 0;
    for (const c of cases) {
      if (!c.in || !MINE.has(c.in.t)) continue;
      expect(P.normalizeOut(c.in), c.name).toEqual(c.out);
      n++;
    }
    expect(n, 'Golden leer oder Format geändert').toBeGreaterThan(10);
  });
  (exists ? it : it.skip)('c2s: Builder erzeugen Nachrichten, die unverändert bestehen (in == out)', () => {
    for (const c of cases) {
      if (!c.in || !MINE.has(c.in.t) || !c.out || JSON.stringify(c.in) !== JSON.stringify(c.out)) continue;
      const m = c.in;
      const built = m.t === 'hi' ? P.build.hi(m) : m.t === 'p' ? P.build.p(m.q, m.se) : m.t === 'hd' ? P.build.hd(m.i) : m.t === 'f' ? P.build.f(m.f)
        : m.t === 'ck' ? P.build.ck(m.a) : P.build.rn(m.tk);
      expect(built, c.name).toEqual(m);
    }
  });
});

describe('Golden-Datei des Workers (chat.json)', () => {
  const file = new URL('../charts-worker/test/fixtures/mp-golden/chat.json', import.meta.url);
  const exists = fs.existsSync(file);
  const cases = exists ? JSON.parse(fs.readFileSync(file, 'utf8')).c2s || [] : [];
  (exists ? it : it.skip)('c2s: normalizeOut(in) == out; Builder m/e/ki erzeugen gültige Nachrichten', () => {
    for (const c of cases) {
      // Der Client klemmt e/ki statt sie zu verwerfen (Aufrufer reichen nur gültige Werte); nur gültige Fälle sind vertragsrelevant.
      if (c.out) expect(P.normalizeOut(c.in), c.name).toEqual(c.out);
      if (c.out && JSON.stringify(c.in) === JSON.stringify(c.out)) {
        const m = c.in;
        const built = m.t === 'm' ? P.build.m(m.x) : m.t === 'e' ? P.build.e(m.e) : P.build.ki(m.c);
        expect(built, c.name).toEqual(m);
      }
    }
    expect(cases.length).toBeGreaterThan(5);
  });
});

describe('Golden-Dateien des Workers (phys.json, rich.json, look.json)', () => {
  for (const name of ['phys', 'rich', 'look']) {
    const file = new URL(`../charts-worker/test/fixtures/mp-golden/${name}.json`, import.meta.url);
    const exists = fs.existsSync(file);
    const cases = exists ? JSON.parse(fs.readFileSync(file, 'utf8')).c2s || [] : [];
    (exists ? it : it.skip)(`${name} c2s: Client-Normalisierer == Server-Ergebnis (gültige Fälle)`, () => {
      let n = 0;
      for (const c of cases) {
        if (!c.out) continue;
        n++;
        expect(P.normalizeOut(c.in), c.name).toEqual(c.out);
      }
      expect(n).toBeGreaterThan(3);
    });
  }
  it('look.json: auch verworfene Fälle werden vom Client verworfen', () => {
    const file = new URL('../charts-worker/test/fixtures/mp-golden/look.json', import.meta.url);
    const cases = JSON.parse(fs.readFileSync(file, 'utf8')).c2s;
    for (const c of cases) expect(P.normalizeOut(c.in), c.name).toEqual(c.out);
  });
});
