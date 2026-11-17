import { describe, it, expect } from 'vitest';
import { createStartWatch, WATCH } from '../src/js/store3d/cinema/startwatch.js';

// Referenz: Cinema._checkStart/_progress vor dem Umbau (cinema.js, wortgleich bis auf Effekte → Liste; Saal: Vorhang immer zu).
class OldCheck {
  constructor() { this.startAt = null; this.baseTime = 0; this.marks = {}; this.prog = null; this.lastProgress = 0; this.pausedSince = null; this.prepareShown = false; }

  progress(v, now) {
    const rs = Number(v.readyState) || 0;
    let be = 0;
    try { const b = v.buffered; if (b && b.length) be = Number(b.end(b.length - 1)) || 0; } catch { /* egal */ }
    const ct = Number(v.currentTime) || 0;
    const p = this.prog;
    if (!p || p.v !== v) { this.prog = { v, rs, be, ct }; this.lastProgress = now; return; }
    if (rs > p.rs || be > p.be + 0.01 || Math.abs(ct - p.ct) > 0.01) this.lastProgress = now;
    p.rs = rs; p.be = be; p.ct = ct;
  }

  check(now, v, st, frames, hasFrame) {
    const fx = [];
    if (this.startAt == null) this.startAt = now;
    const el = now - this.startAt;
    const rs = v ? Number(v.readyState) || 0 : 0;
    const mark = (k) => { if (this.marks[k] == null) this.marks[k] = Math.round(el); };
    if (v) {
      mark('video');
      this.progress(v, now);
      if (rs >= 2) mark('ready');
      if (frames >= 1) mark('frame');
    }
    if (v && rs >= 2 && frames >= 3 && (Math.abs((Number(v.currentTime) || 0) - this.baseTime) >= 0.3 || st.phase === 'paused')) {
      mark('start');
      fx.push(st.phase === 'paused' ? 'start:paused' : 'start:playing');
      return fx;
    }
    const pausedNow = Boolean(v) && rs >= 2 && Boolean(hasFrame) && (st.phase === 'paused' || v.paused === true);
    if (pausedNow) {
      if (this.pausedSince == null) this.pausedSince = now;
      else if (now - this.pausedSince >= 1500) { mark('start'); fx.push('pausedStart'); return fx; }
    } else this.pausedSince = null;
    if (el > 3000) fx.push('curtain');
    if (el > 8000 && !this.prepareShown) { this.prepareShown = true; fx.push('prepare'); }
    if (!v) { if (el > 25000) fx.push('fail:T1'); return fx; }
    if (now - this.lastProgress > 15000 || el > 60000) fx.push('fail:T2');
    return fx;
  }
}

function effects(r) {
  const fx = [];
  if (r.event === 'start') return [r.paused ? 'start:paused' : 'start:playing'];
  if (r.event === 'pausedStart') return ['pausedStart'];
  if (r.slow) fx.push('curtain');
  if (r.prepare) fx.push('prepare');
  if (r.event === 'fail') fx.push(`fail:${r.code}`);
  return fx;
}

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

const vid = (o = {}) => ({ readyState: 0, currentTime: 0, paused: false, buffered: { length: 0, end: () => 0 }, ...o });

describe('startwatch · Paralleltest Alt = Neu', () => {
  it('zufällige Verläufe (Video fehlt/da, readyState, Fortschritt, Pause, Zeitsprünge) ergeben identische Effekte und Marken', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const r = rng(seed);
      const oldC = new OldCheck();
      const w = createStartWatch();
      let v = null;
      let now = Math.floor(r() * 5000);
      let frames = 0;
      let buf = 0;
      let phase = 'loading';
      for (let i = 0; i < 160; i++) {
        const big = r() < 0.04;
        now += big ? 2000 + Math.floor(r() * 20000) : 16 + Math.floor(r() * 400);
        if (!v && r() < 0.04) v = vid();
        if (v) {
          if (r() < 0.1) v.readyState = Math.min(4, v.readyState + 1);
          if (v.readyState >= 2 && r() < 0.5) { v.currentTime += r() * 0.5; frames += r() < 0.6 ? 1 : 0; }
          if (r() < 0.2) buf += r();
          const bb = buf;
          v.buffered = { length: bb > 0 ? 1 : 0, end: () => bb };
          if (r() < 0.05) v.paused = !v.paused;
        }
        if (r() < 0.05) phase = ['loading', 'playing', 'paused', 'error'][Math.floor(r() * 4)];
        const st = { phase };
        const hasFrame = frames >= 1;
        const a = oldC.check(now, v, st, frames, hasFrame);
        const b = effects(w.step({ now, video: v, state: st, frames, hasFrame, baseTime: 0 }));
        expect(b, `seed ${seed} step ${i}`).toEqual(a);
        if (a.some((x) => x.startsWith('start') || x === 'pausedStart')) break;
      }
      expect(w.marks).toEqual(oldC.marks);
      expect(w.lastProgress).toBe(oldC.lastProgress);
    }
  });
});

describe('startwatch · Entscheidungen', () => {
  const play = (o = {}) => vid({ readyState: 4, ...o });

  it('start: readyState >= 2, >= 3 Uploads, Zeit +0,3 s', () => {
    const w = createStartWatch();
    const v = play();
    expect(w.step({ now: 0, video: v, state: { phase: 'playing' }, frames: 3, hasFrame: true, baseTime: 0 }).event).toBeNull();
    v.currentTime = 0.31;
    const r = w.step({ now: 50, video: v, state: { phase: 'playing' }, frames: 3, hasFrame: true, baseTime: 0 });
    expect(r).toMatchObject({ event: 'start', paused: false });
  });

  it('start mit Zustand paused zählt als pausiert gestartet', () => {
    const w = createStartWatch();
    const r = w.step({ now: 0, video: play(), state: { phase: 'paused' }, frames: 3, hasFrame: true, baseTime: 0 });
    expect(r).toMatchObject({ event: 'start', paused: true });
  });

  it('pausedStart nach PAUSED_HOLD_MS mit Bild und pausiertem <video>', () => {
    const w = createStartWatch();
    const v = play({ paused: true });
    const s = { now: 0, video: v, state: { phase: 'loading' }, frames: 1, hasFrame: true, baseTime: 0 };
    expect(w.step(s).event).toBeNull();
    expect(w.step({ ...s, now: WATCH.PAUSED_HOLD_MS - 1 }).event).toBeNull();
    expect(w.step({ ...s, now: WATCH.PAUSED_HOLD_MS }).event).toBe('pausedStart');
  });

  it('slow ab 3 s, prepare einmalig ab 8 s', () => {
    const w = createStartWatch();
    const s = { video: null, state: {}, frames: 0, hasFrame: false, baseTime: 0 };
    expect(w.step({ ...s, now: 0 })).toMatchObject({ slow: false, prepare: false });
    expect(w.step({ ...s, now: 3001 })).toMatchObject({ slow: true, prepare: false });
    expect(w.step({ ...s, now: 8001 })).toMatchObject({ slow: true, prepare: true });
    expect(w.step({ ...s, now: 9000 })).toMatchObject({ slow: true, prepare: false });
    expect(w.prepareShown).toBe(true);
  });

  it('T1 nach 25 s ohne Video', () => {
    const w = createStartWatch();
    const s = { video: null, state: {}, frames: 0, hasFrame: false, baseTime: 0 };
    w.step({ ...s, now: 0 });
    expect(w.step({ ...s, now: 25000 }).event).toBeNull();
    expect(w.step({ ...s, now: 25001 })).toMatchObject({ event: 'fail', code: 'T1' });
  });

  it('T2 nach 15 s ohne Fortschritt, nicht mit Fortschritt', () => {
    const w = createStartWatch();
    const v = vid({ readyState: 1 });
    const s = { video: v, state: {}, frames: 0, hasFrame: false, baseTime: 0 };
    w.step({ ...s, now: 0 });
    expect(w.step({ ...s, now: 15000 }).event).toBeNull();
    expect(w.step({ ...s, now: 15001 })).toMatchObject({ event: 'fail', code: 'T2' });
    const w2 = createStartWatch();
    const v2 = vid({ readyState: 1 });
    for (let t = 0; t <= 40000; t += 1000) { v2.buffered = { length: 1, end: () => t / 1000 }; expect(w2.step({ video: v2, state: {}, frames: 0, hasFrame: false, baseTime: 0, now: t }).event).toBeNull(); }
  });

  it('T2 nach 60 s auch mit Fortschritt', () => {
    const w = createStartWatch();
    const v = vid({ readyState: 1 });
    let r;
    for (let t = 0; t <= 61000; t += 1000) { v.buffered = { length: 1, end: () => t / 1000 }; r = w.step({ video: v, state: {}, frames: 0, hasFrame: false, baseTime: 0, now: t }); if (r.event) break; }
    expect(r).toMatchObject({ event: 'fail', code: 'T2' });
    expect(w.startAt).toBe(0);
  });

  it('shiftClock: Hintergrund-Tab (20 s Lücke) löst kein falsches T2 aus', () => {
    const v = vid({ readyState: 1 });
    const s = { video: v, state: {}, frames: 0, hasFrame: false, baseTime: 0 };
    const plain = createStartWatch();
    plain.step({ ...s, now: 0 });
    plain.step({ ...s, now: 1000 });
    expect(plain.step({ ...s, now: 21000 })).toMatchObject({ event: 'fail', code: 'T2' }); // ohne Korrektur: Fehlalarm
    const w = createStartWatch();
    w.step({ ...s, now: 0 });
    w.step({ ...s, now: 1000 });
    w.shiftClock(20000);
    expect(w.step({ ...s, now: 21000 }).event).toBeNull();
    expect(w.startAt).toBe(20000);
  });

  it('marks: video, ready, frame, start (ms seit Start); reset leert sie', () => {
    const w = createStartWatch();
    const v = vid();
    const base = { video: v, state: {}, frames: 0, hasFrame: false, baseTime: 0 };
    w.step({ ...base, now: 100 });
    v.readyState = 3;
    w.step({ ...base, now: 600 });
    w.step({ ...base, now: 900, frames: 1 });
    v.currentTime = 1;
    w.step({ ...base, now: 1200, frames: 3, state: { phase: 'playing' } });
    expect(w.marks).toEqual({ video: 0, ready: 500, frame: 800, start: 1100 });
    w.reset();
    expect(w.marks).toEqual({});
    expect(w.startAt).toBeNull();
  });
});
