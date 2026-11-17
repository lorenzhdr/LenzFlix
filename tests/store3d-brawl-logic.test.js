// Richard wehrt sich: Zustandsautomat, Trefferkegel, Pfadfolge, Sprungbogen, Wurfbahn, Ausleihen, Diebstahlsicherung, Sprüche.
import { describe, it, expect } from 'vitest';
import { createBrawlFsm, BRAWL, STATES } from '../src/js/store3d/modules/brawl-fsm.js';
import { inCone, stepAlong, hopPoint, aimVelocity, ballisticStep, createRentLedger, createTheftGuard, crossedGate } from '../src/js/store3d/modules/brawl-logic.js';
import { poseFor, NEUTRAL, ANIMS } from '../src/js/store3d/modules/brawl-pose.js';
import { LINES, pickLine } from '../src/js/store3d/modules/cashier-lines.js';

describe('Brawl-Zustandsautomat', () => {
  it('Treffer eskalieren calm -> annoyed -> shove -> throw', () => {
    const f = createBrawlFsm();
    expect(f.state).toBe('calm');
    expect(f.hit('player', 1).transition).toMatchObject({ from: 'calm', to: 'annoyed' });
    expect(f.hit('player', 3).transition).toMatchObject({ to: 'shove' });
    expect(f.hit('player', 5).transition).toMatchObject({ to: 'throw' });
    expect(f.isHostile()).toBe(true);
  });
  it('zwei Treffer im selben Augenblick zählen einmal', () => {
    const f = createBrawlFsm();
    f.hit('player', 1);
    const r = f.hit('player', 1.2);
    expect(r.accepted).toBe(false);
    expect(f.state).toBe('annoyed');
  });
  it('annoyed/shove fallen nach 25 s auf calm zurück', () => {
    const f = createBrawlFsm();
    f.hit('player', 1);
    expect(f.update(20)).toBeNull();
    expect(f.update(1 + BRAWL.DECAY + 0.1)).toMatchObject({ to: 'calm', reason: 'decay' });
    expect(f.hits).toBe(0);
    f.hit('player', 100); f.hit('player', 101);
    expect(f.state).toBe('shove');
    expect(f.update(101 + BRAWL.DECAY + 1).to).toBe('calm');
  });
  it('throw -> chase (Wurf fertig) -> banned (rausgeworfen) -> grudge (Ablauf) -> calm', () => {
    const f = createBrawlFsm();
    f.hit('player', 1); f.hit('player', 2); f.hit('player', 3);
    expect(f.event('throwDone', 8).to).toBe('chase');
    expect(f.event('expelled', 12).to).toBe('banned');
    expect(f.isBanned()).toBe(true);
    expect(f.banRemaining(12)).toBe(BRAWL.BAN);
    expect(f.update(30)).toBeNull();
    expect(f.banRemaining(30)).toBeCloseTo(12, 5);
    expect(f.update(12 + BRAWL.BAN)).toMatchObject({ to: 'grudge', reason: 'banEnd' });
    expect(f.grudgeRemaining(12 + BRAWL.BAN)).toBe(BRAWL.GRUDGE);
    expect(f.update(12 + BRAWL.BAN + BRAWL.GRUDGE - 1)).toBeNull();
    expect(f.update(12 + BRAWL.BAN + BRAWL.GRUDGE).to).toBe('calm');
  });
  it('Wurfphase und Verfolgung haben Zeitlimits', () => {
    const f = createBrawlFsm();
    f.hit('player', 1); f.hit('player', 2); f.hit('player', 3);
    expect(f.update(3 + BRAWL.THROW_MAX + 0.1)).toMatchObject({ to: 'chase', reason: 'throwTimeout' });
    expect(f.update(3 + BRAWL.THROW_MAX + 0.1 + BRAWL.CHASE_MAX + 1)).toMatchObject({ to: 'grudge', reason: 'chaseTimeout' });
    const g = createBrawlFsm();
    g.hit('player', 1); g.hit('player', 2); g.hit('player', 3); g.event('throwDone', 4);
    expect(g.event('giveUp', 10).to).toBe('grudge');
  });
  it('Treffer in throw/chase/banned zählen nicht; in grudge sofort chase', () => {
    const f = createBrawlFsm();
    f.hit('player', 1); f.hit('player', 2); f.hit('player', 3);
    expect(f.hit('player', 5).accepted).toBe(false);
    f.event('throwDone', 6);
    expect(f.hit('player', 8).accepted).toBe(false);
    f.event('expelled', 9);
    expect(f.hit('player', 10).accepted).toBe(false);
    f.update(9 + BRAWL.BAN);
    expect(f.state).toBe('grudge');
    expect(f.hit('player', 50).transition).toMatchObject({ to: 'chase' });
  });
  it('Objekt-Treffer zählen wie Schläge', () => {
    const f = createBrawlFsm();
    expect(f.hit('object', 1).transition).toMatchObject({ to: 'annoyed', reason: 'objectHit' });
    expect(f.hit('object', 2).transition.to).toBe('shove');
  });
  it('Ereignisse in falschen Zuständen tun nichts', () => {
    const f = createBrawlFsm();
    expect(f.event('expelled', 1)).toBeNull();
    expect(f.event('throwDone', 1)).toBeNull();
    expect(f.state).toBe('calm');
  });
  it('startGrudge (Wiederherstellung) läuft mit Restzeit', () => {
    const f = createBrawlFsm();
    f.startGrudge(5, 120);
    expect(f.state).toBe('grudge');
    expect(f.grudgeRemaining(65)).toBe(60);
    expect(f.update(125).to).toBe('calm');
  });
  it('Netzformat: getNetState / applyRemote Rundlauf', () => {
    const a = createBrawlFsm();
    a.hit('player', 1); a.hit('player', 2); a.hit('player', 3); a.event('throwDone', 4); a.event('expelled', 5);
    const net = a.getNetState(10);
    expect(net).toEqual({ v: 1, s: STATES.indexOf('banned'), h: 3, r: 25 });
    const b = createBrawlFsm();
    expect(b.applyRemote(net, 100)).toBe(true);
    expect(b.state).toBe('banned');
    expect(b.banRemaining(100)).toBe(25);
    expect(b.applyRemote({ v: 2 }, 0)).toBe(false);
    expect(b.applyRemote({ v: 1, s: 99 }, 0)).toBe(false);
  });
});

describe('Trefferkegel', () => {
  const origin = { x: 0, y: 1.65, z: 0 };
  const target = { x: 0, y: 1.0, z: -1.4 };
  it('trifft geradeaus innerhalb 1,6 m', () => {
    expect(inCone(origin, { x: 0, y: 0, z: -1 }, target).hit).toBe(true);
  });
  it('trifft nicht jenseits der Reichweite', () => {
    expect(inCone(origin, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: -2.4 }).hit).toBe(false);
  });
  it('trifft nicht, wenn man wegschaut (>25 Grad)', () => {
    const a = (50 * Math.PI) / 180;
    expect(inCone(origin, { x: Math.sin(a), y: 0, z: -Math.cos(a) }, target).hit).toBe(false);
  });
  it('Randwinkel knapp innerhalb', () => {
    const a = (20 * Math.PI) / 180;
    expect(inCone(origin, { x: Math.sin(a), y: 0, z: -Math.cos(a) }, target).hit).toBe(true);
  });
  it('trifft nicht, wenn Richard hinter einem steht', () => {
    expect(inCone(origin, { x: 0, y: 0, z: 1 }, target).hit).toBe(false);
  });
  it('steiler Blick nach oben trifft nicht', () => {
    expect(inCone(origin, { x: 0, y: 0.95, z: -0.3 }, target).hit).toBe(false);
  });
});

describe('Bewegung und Wurf', () => {
  it('stepAlong folgt Wegpunkten und meldet das Ende', () => {
    const path = [{ x: 1, z: 0 }, { x: 1, z: 1 }];
    let pos = { x: 0, z: 0 };
    let i = 0;
    let r = stepAlong(pos, path, i, 1, 1.5);
    expect(r.x).toBeCloseTo(1); expect(r.z).toBeCloseTo(0.5); expect(r.i).toBe(1); expect(r.done).toBe(false);
    pos = r; i = r.i;
    r = stepAlong(pos, path, i, 1, 1);
    expect(r.done).toBe(true); expect(r.z).toBeCloseTo(1);
  });
  it('hopPoint: Start/Ende am Boden, Scheitel in der Mitte über dem Tresen', () => {
    const a = { x: 0, z: 0 };
    const b = { x: 0, z: -2 };
    expect(hopPoint(a, b, 0, 1.5).y).toBe(0);
    expect(hopPoint(a, b, 1, 1.5).y).toBeCloseTo(0);
    const mid = hopPoint(a, b, 0.5, 1.5);
    expect(mid.y).toBeCloseTo(1.5);
    expect(mid.z).toBeCloseTo(-1);
    expect(hopPoint(a, b, 0.25, 1.5).y).toBeGreaterThan(1.05); // Tresenhöhe schon früh überwunden
  });
  it('aimVelocity + ballisticStep landen am Ziel', () => {
    const from = { x: 0, y: 1.5, z: 0 };
    const to = { x: 3, y: 1.3, z: -4 };
    const T = 0.6;
    const v = aimVelocity(from, to, T);
    const p = { ...from };
    const n = 600;
    for (let i = 0; i < n; i++) ballisticStep(p, v, T / n, -10);
    expect(p.x).toBeCloseTo(to.x, 1); expect(p.z).toBeCloseTo(to.z, 1); expect(p.y).toBeCloseTo(to.y, 1);
  });
  it('ballisticStep meldet Bodenkontakt', () => {
    const p = { x: 0, y: 0.1, z: 0 };
    expect(ballisticStep(p, { x: 0, y: -3, z: 0 }, 0.1)).toBe(true);
    expect(p.y).toBe(0.04);
  });
  it('Posen: alle Animationen liefern vollständige, endliche Werte', () => {
    for (const a of ANIMS) {
      const p = poseFor(a, 0.3);
      for (const k of Object.keys(NEUTRAL)) expect(Number.isFinite(p[k])).toBe(true);
    }
    expect(poseFor('cross', 0).armLx).toBeGreaterThan(1);
    expect(poseFor('run', 0.2).legL).not.toBe(poseFor('run', 0.2).legR);
  });
});

describe('Ausleihen und Diebstahlsicherung', () => {
  const mem = () => { const m = {}; return { getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = v; }, m }; };
  it('rent merkt Hüllen (nur neu = true) und lädt aus dem Speicher', () => {
    const st = mem();
    const l = createRentLedger(st);
    expect(l.isRented('a')).toBe(false);
    expect(l.rent('a')).toBe(true);
    expect(l.rent('a')).toBe(false);
    expect(l.isRented('a')).toBe(true);
    expect(createRentLedger(st).isRented('a')).toBe(true);
  });
  it('ohne Speicher oder mit kaputtem Speicher kein Absturz', () => {
    expect(createRentLedger(null).rent('x')).toBe(true);
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(createRentLedger(bad).rent('x')).toBe(true);
  });
  it('Alarm höchstens einmal je Hülle und Minute', () => {
    const g = createTheftGuard(60);
    expect(g.shouldAlarm('a', 0)).toBe(true);
    expect(g.shouldAlarm('a', 30)).toBe(false);
    expect(g.shouldAlarm('b', 30)).toBe(true);
    expect(g.shouldAlarm('a', 61)).toBe(true);
  });
  it('crossedGate: nur nach außen und nur durch die Tür', () => {
    const gate = { x0: 4, x1: 6.4, z: 10 };
    expect(crossedGate({ x: 5, z: 9.8 }, { x: 5, z: 10.2 }, gate)).toBe(true);
    expect(crossedGate({ x: 5, z: 10.2 }, { x: 5, z: 9.8 }, gate)).toBe(false); // hinein
    expect(crossedGate({ x: 1, z: 9.8 }, { x: 1, z: 10.2 }, gate)).toBe(false); // neben der Tür
    expect(crossedGate({ x: 5, z: 9 }, { x: 5, z: 9.5 }, gate)).toBe(false);
  });
});

describe('Richards neue Sprüche', () => {
  const CATS = ['hit1', 'hit2', 'hit3', 'shove', 'throwLine', 'throwHit', 'hitObject', 'chase', 'ban', 'banGlass', 'banEnd', 'backHome', 'grudgeGreet', 'grudgeIdle', 'rentOk', 'rentAlready', 'theftShout'];
  it('alle Kategorien vorhanden, gefüllt, ohne Auslassungspunkte und ohne offene Platzhalter nach dem Füllen', () => {
    for (const c of CATS) {
      expect(Array.isArray(LINES[c]), c).toBe(true);
      expect(LINES[c].length, c).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < LINES[c].length; i++) {
        const r = pickLine(LINES[c], () => i / LINES[c].length, { name: 'Max', title: 'Titel' });
        expect(r.text).not.toMatch(/\{|\}|\.\.\./);
      }
    }
  });
});
