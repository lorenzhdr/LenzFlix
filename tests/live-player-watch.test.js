// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createWatchTracker, pickFiller, createFakePlayer, createPlayer } from '../src/js/live/player/index.js';

const MIN = 60000;

function setup() {
  const clock = { t: 0 };
  const setPlayed = vi.fn(() => Promise.resolve());
  const w = createWatchTracker({ setPlayed, now: () => clock.t });
  return { clock, setPlayed, w };
}

describe('Gesehen-Regel', () => {
  const S = 1000000; // Sendebeginn (absolute Zeit)
  const e = (over = {}) => ({ start: S, end: S + 100 * MIN, type: 'program', itemId: 'a', ...over });
  const at = (ctx, off) => { ctx.clock.t = S + off; };
  const runTo = (ctx, from, to) => { for (let o = from; o < to; o += 5000) { at(ctx, o); ctx.w.tick(); } at(ctx, to); ctx.w.tick(); };

  it('pünktlich eingeschaltet: gesehen bei 90 % der Position, genau einmal', () => {
    const ctx = setup();
    at(ctx, 0);
    ctx.w.tune(e(), 0);
    runTo(ctx, 0, 90 * MIN - 1);
    expect(ctx.setPlayed).not.toHaveBeenCalled();
    runTo(ctx, 90 * MIN - 1, 90 * MIN);
    expect(ctx.setPlayed).toHaveBeenCalledWith('a', true);
    runTo(ctx, 90 * MIN, 100 * MIN);
    ctx.w.leave();
    expect(ctx.setPlayed).toHaveBeenCalledTimes(1);
  });

  it('leave bei 90 % genügt', () => {
    const ctx = setup();
    at(ctx, 0);
    ctx.w.tune(e(), 0);
    at(ctx, 90 * MIN);
    ctx.w.leave();
    expect(ctx.setPlayed).toHaveBeenCalledTimes(1);
  });

  it('Verspätung: 9:59 zählt, 10:01 nicht (Position bis 90 %)', () => {
    for (const [lateMs, expected] of [[10 * MIN - 1000, 1], [10 * MIN, 1], [10 * MIN + 1000, 0]]) {
      const ctx = setup();
      at(ctx, lateMs);
      ctx.w.tune(e(), lateMs);
      runTo(ctx, lateMs, 95 * MIN);
      expect(ctx.setPlayed.mock.calls.length).toBe(expected);
    }
  });

  it('Unterbrechung: 59 s erlaubt, 61 s verwirft', () => {
    for (const [gapMs, expected] of [[59000, 1], [60000, 0], [61000, 0]]) {
      const ctx = setup();
      at(ctx, 0);
      ctx.w.tune(e(), 0);
      runTo(ctx, 0, 20 * MIN);
      ctx.w.leave();
      at(ctx, 20 * MIN + gapMs);
      ctx.w.tune(e(), 20 * MIN + gapMs);
      runTo(ctx, 20 * MIN + gapMs, 95 * MIN);
      ctx.w.leave();
      expect(ctx.setPlayed.mock.calls.length).toBe(expected);
    }
  });

  it('Verwurf bleibt auch nach erneutem Wegzappen bestehen', () => {
    const ctx = setup();
    at(ctx, 0);
    ctx.w.tune(e(), 0);
    at(ctx, 10 * MIN);
    ctx.w.leave();
    at(ctx, 12 * MIN);
    ctx.w.tune(e(), 12 * MIN); // verworfen (Lücke 2 min)
    at(ctx, 13 * MIN);
    ctx.w.leave();
    at(ctx, 13 * MIN + 5000);
    ctx.w.tune(e(), 13 * MIN + 5000); // kurze Lücke heilt nicht
    runTo(ctx, 13 * MIN + 5000, 100 * MIN);
    expect(ctx.setPlayed).not.toHaveBeenCalled();
  });

  it('Typen: program/fill/nightfill mit itemId ja; filler/closedown/ohne itemId nein', () => {
    for (const [type, itemId, expected] of [['program', 'x', 1], ['fill', 'x', 1], ['nightfill', 'x', 1], ['filler', 'x', 0], ['closedown', 'x', 0], ['program', undefined, 0]]) {
      const ctx = setup();
      const en = e({ end: S + 30 * MIN, type, itemId });
      at(ctx, 0);
      ctx.w.tune(en, 0);
      runTo(ctx, 0, 30 * MIN);
      ctx.w.leave();
      expect(ctx.setPlayed.mock.calls.length).toBe(expected);
    }
  });

  it('einmal pro Ausstrahlung (itemId + start); neue Ausstrahlung zählt neu', () => {
    const ctx = setup();
    const e1 = e({ end: S + 30 * MIN });
    at(ctx, 0);
    ctx.w.tune(e1, 0);
    runTo(ctx, 0, 30 * MIN);
    ctx.w.leave();
    at(ctx, 30 * MIN + 1000);
    ctx.w.tune(e1, 30 * MIN + 1000);
    ctx.w.tick();
    ctx.w.leave();
    expect(ctx.setPlayed).toHaveBeenCalledTimes(1);
    const e2 = e({ start: S + 24 * 60 * MIN, end: S + 24 * 60 * MIN + 30 * MIN });
    ctx.clock.t = e2.start;
    ctx.w.tune(e2, 0);
    runTo(ctx, 24 * 60 * MIN, 24 * 60 * MIN + 30 * MIN);
    ctx.w.leave();
    expect(ctx.setPlayed).toHaveBeenCalledTimes(2);
  });

  it('Fehler von setPlayed werden geschluckt; dispose beendet das Zählen', async () => {
    const clock = { t: 0 };
    const setPlayed = vi.fn(() => Promise.reject(new Error('x')));
    const w = createWatchTracker({ setPlayed, now: () => clock.t });
    w.tune({ start: 0, end: 10 * MIN, type: 'program', itemId: 'q' }, 0);
    clock.t = 10 * MIN;
    w.tick();
    await Promise.resolve();
    expect(setPlayed).toHaveBeenCalledTimes(1);
    w.dispose();
    w.tick();
    expect(setPlayed).toHaveBeenCalledTimes(1);
  });
});

describe('pickFiller', () => {
  const entry = { start: 1000, end: 1000 + 10 * MIN, type: 'filler' };
  const next = { itemId: 'n', type: 'program' };
  const deps = (t) => ({ loadTrailer: vi.fn(async () => t) });

  it('Trailer im Fenster: offsetMs relativ zum Trailer, Start = entry.end - durMs', async () => {
    const d = deps({ url: 'http://x/t.mp4', durMs: 2 * MIN });
    const startAt = entry.end - 2 * MIN;
    expect(await pickFiller(entry, next, d, startAt + 5000)).toEqual({ kind: 'trailer', url: 'http://x/t.mp4', offsetMs: 5000 });
    expect(d.loadTrailer).toHaveBeenCalledWith('n');
  });
  it('vor dem Trailerfenster: Karte (mit trailerStartMs); nach Ende: Karte', async () => {
    const d = deps({ url: 'u', durMs: 2 * MIN });
    expect(await pickFiller(entry, next, d, entry.start + 1)).toEqual({ kind: 'card', trailerStartMs: entry.end - 2 * MIN });
    expect(await pickFiller(entry, next, d, entry.end)).toEqual({ kind: 'card' });
  });
  it('Karte: Trailer länger als Lücke, kein Trailer, kein itemId, Ladefehler, kein filler', async () => {
    expect((await pickFiller(entry, next, deps({ url: 'u', durMs: 11 * MIN }), entry.end - 1)).kind).toBe('card');
    expect((await pickFiller(entry, next, deps(null), entry.end - 1)).kind).toBe('card');
    expect((await pickFiller(entry, { type: 'closedown' }, deps({ url: 'u', durMs: 1000 }), entry.end - 500)).kind).toBe('card');
    expect((await pickFiller(entry, null, deps({ url: 'u', durMs: 1000 }), entry.end - 500)).kind).toBe('card');
    const bad = { loadTrailer: vi.fn(async () => { throw new Error('x'); }) };
    expect((await pickFiller(entry, next, bad, entry.end - 500)).kind).toBe('card');
    expect((await pickFiller({ ...entry, type: 'program' }, next, deps({ url: 'u', durMs: 1000 }), entry.end - 500)).kind).toBe('card');
  });
});

describe('Fake-Player', () => {
  function ctx2d() {
    const calls = [];
    const proxy = new Proxy({}, { get: (_t, k) => (k === 'textAlign' ? '' : (...a) => { calls.push([k, ...a]); }), set: () => true });
    return { proxy, calls };
  }

  it('zeichnet Testbild mit Sender, Titel und Zeitcode; kein Netzwerk', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const { proxy, calls } = ctx2d();
    const canvas = document.createElement('canvas');
    canvas.getContext = () => proxy;
    const clock = { t: 5000 };
    const p = createFakePlayer({ canvas, now: () => clock.t, getInfo: () => ({ channel: 'LIVE Kino', title: 'Testfilm' }) });
    const phases = [];
    p.on('state', (s) => phases.push(s.phase));
    expect(p.volumeSupported).toBe(true);
    expect(await p.play({ itemId: 'x', offsetMs: 3661000 })).toEqual({ ok: true, mode: 'direct' });
    expect(phases).toEqual(['loading', 'playing']);
    const texts = calls.filter((c) => c[0] === 'fillText').map((c) => c[1]);
    expect(texts).toContain('LIVE Kino');
    expect(texts).toContain('Testfilm');
    expect(texts).toContain('01:01:01');
    p.syncTo(7200000);
    const t = p.tracks();
    expect(t.audio.length).toBe(1);
    expect(t.subs.length).toBe(1);
    await p.stop();
    p.dispose();
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('createPlayer({ fake:true }) delegiert und braucht weder video noch deps', async () => {
    const canvas = document.createElement('canvas');
    canvas.getContext = () => null;
    const p = createPlayer({ fake: true, canvas });
    expect(await p.play({ itemId: 'x', offsetMs: 0 })).toMatchObject({ ok: true });
    expect(typeof p.unlock).toBe('function');
    p.dispose();
  });
});
