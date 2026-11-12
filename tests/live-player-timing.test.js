// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createPlayer } from '../src/js/live/player/index.js';
import { makeVideo, makeDeps, ms, info, hlsUrl, fire, flush } from './live-player-helpers.js';

const mediaError = (video, code) => {
  Object.defineProperty(video, 'error', { value: { code }, configurable: true });
  fire(video, 'error');
};
const noError = (video) => Object.defineProperty(video, 'error', { value: null, configurable: true });
const directThenHls = () => (m, p, o) => (o.body.EnableDirectPlay === false
  ? info(ms({ direct: false, transcodingUrl: hlsUrl('&SegmentContainer=ts&TranscodeReasons=ContainerNotSupported') }))
  : info(ms()));
const posts = (ctx) => ctx.deps.request.mock.calls.filter((c) => c[0] === 'POST');

function setup({ respond = directThenHls(), storage, clock } = {}) {
  const video = makeVideo({ hevc: false });
  const deps = makeDeps({ respond });
  if (storage !== undefined) deps.storage = storage;
  const now = clock ? () => clock.t : undefined;
  return { video, deps, player: createPlayer({ video, deps, ...(now ? { now } : {}) }) };
}
const memStore = (init = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: vi.fn((k) => (m.has(k) ? m.get(k) : null)), setItem: vi.fn((k, v) => { m.set(k, String(v)); }), m };
};
/** Direct scheitert mit Medienfehler `code`, danach läuft der Remux. */
async function directFailsThenRemux(ctx, code = 3, id = 'it1') {
  const p = ctx.player.play({ itemId: id, offsetMs: 0 });
  await flush();
  fire(ctx.video, 'loadedmetadata');
  mediaError(ctx.video, code);
  await flush();
  noError(ctx.video);
  fire(ctx.video, 'loadedmetadata');
  fire(ctx.video, 'playing');
  return p;
}

describe('Timing im Player', () => {
  it('Erfolg: timing mit Phasen, Kette D, cached=false; lastTiming() liefert dieselben Werte', async () => {
    const clock = { t: 1000 };
    const ctx = setup({ clock });
    expect(ctx.player.lastTiming()).toBeNull();
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    clock.t += 300; // PlaybackInfo
    await flush();
    clock.t += 1100; // Laden
    fire(ctx.video, 'loadedmetadata');
    clock.t += 200; // Start
    fire(ctx.video, 'playing');
    const res = await p;
    expect(res).toMatchObject({ ok: true, mode: 'direct' });
    expect(res.timing).toEqual({ totalMs: 1600, infoMs: 300, loadMs: 1100, startMs: 200, chain: 'D', cached: false, mode: 'direct' });
    expect(ctx.player.lastTiming()).toEqual(res.timing);
    expect(JSON.stringify(res.timing)).not.toMatch(/http|ApiKey|SECRET/);
  });

  it('Kette D>T nach M3: chain, mode hls; Fehler tragen timing ebenfalls', async () => {
    const ctx = setup();
    const res = await directFailsThenRemux(ctx);
    expect(res.ok).toBe(true);
    expect(res.timing.chain).toBe('D>T');
    expect(res.timing.mode).toBe('hls');

    const bad = setup({ respond: () => { throw new Error('x'); } });
    const r = await bad.player.play({ itemId: 'it1', offsetMs: 0 });
    expect(r).toMatchObject({ ok: false, reason: 'network', code: 'NET' });
    expect(r.timing).toMatchObject({ chain: '', mode: 'none', infoMs: expect.any(Number) });
  });

  it('cached=true, wenn das Direct-Ergebnis aus der Vorauflösung stammt', async () => {
    const ctx = setup();
    await ctx.player.prefetch('it1');
    ctx.deps.request.mockClear();
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    expect(posts(ctx).length).toBe(0);
    fire(ctx.video, 'loadedmetadata');
    fire(ctx.video, 'playing');
    const res = await p;
    expect(res.timing.cached).toBe(true);
  });
});

describe('directFailed dauerhaft (deps.storage)', () => {
  it('M3 + erfolgreicher Remux: gespeichert, nach Neuerzeugen gleich noDirect', async () => {
    const storage = memStore();
    const a = setup({ storage });
    expect((await directFailsThenRemux(a)).ok).toBe(true);
    const saved = JSON.parse(storage.m.get('lfx-directfailed'));
    expect(Object.keys(saved)).toEqual(['it1']);

    const b = setup({ storage });
    const p = b.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    expect(posts(b)).toHaveLength(1);
    expect(posts(b)[0][2].body.EnableDirectPlay).toBe(false);
    fire(b.video, 'loadedmetadata');
    fire(b.video, 'playing');
    expect((await p).ok).toBe(true);
  });

  it('M4 zählt ebenfalls', async () => {
    const storage = memStore();
    await directFailsThenRemux(setup({ storage }), 4);
    expect(storage.m.has('lfx-directfailed')).toBe(true);
  });

  it('scheitert auch der Remux: nichts gespeichert', async () => {
    const storage = memStore();
    const ctx = setup({ storage });
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(ctx.video, 'loadedmetadata');
    mediaError(ctx.video, 3);
    await flush();
    fire(ctx.video, 'loadedmetadata');
    mediaError(ctx.video, 3);
    ctx.player.stop();
    await p;
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('B-PLAY (Browser lehnt play() ab): nur Sitzung, nicht gespeichert', async () => {
    const storage = memStore();
    const ctx = setup({ storage });
    ctx.video.play = vi.fn()
      .mockImplementationOnce(() => Promise.reject(Object.assign(new Error('x'), { name: 'NotSupportedError' })))
      .mockReturnValue(Promise.resolve());
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(ctx.video, 'loadedmetadata');
    await flush();
    fire(ctx.video, 'loadedmetadata');
    fire(ctx.video, 'playing');
    expect((await p).ok).toBe(true);
    expect(storage.setItem).not.toHaveBeenCalled();
  });

  it('abgelaufene Einträge (7 Tage) werden ignoriert, frische geladen', async () => {
    const clock = { t: 10 * 24 * 3600 * 1000 };
    const storage = memStore({ 'lfx-directfailed': JSON.stringify({ old: clock.t - 8 * 24 * 3600 * 1000, fresh: clock.t - 1000 }) });
    const ctx = setup({ storage, clock });
    let p = ctx.player.play({ itemId: 'old', offsetMs: 0 });
    await flush();
    expect(posts(ctx)[0][2].body.EnableDirectPlay).toBe(true);
    ctx.player.stop();
    await p;
    ctx.deps.request.mockClear();
    p = ctx.player.play({ itemId: 'fresh', offsetMs: 0 });
    await flush();
    expect(posts(ctx)[0][2].body.EnableDirectPlay).toBe(false);
    ctx.player.stop();
    await p;
  });

  it('kaputter Speicher/ohne Speicher: kein Fehler', async () => {
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect((await directFailsThenRemux(setup({ storage: bad }))).ok).toBe(true);
    expect((await directFailsThenRemux(setup({ storage: null }))).ok).toBe(true);
  });
});
