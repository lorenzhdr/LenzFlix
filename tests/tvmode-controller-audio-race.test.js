// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTvController } from '../src/js/tv/tvmode/controller.js';
import { createEmitter } from '../src/js/tv/player/events.js';

const HOUR = 3600000;
const T0 = Date.UTC(2026, 10, 11, 18, 0, 0);
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => vi.useRealTimers());

describe('Tonspurwahl während des Ladens', () => {
  it('übernimmt den erfolgreichen Start der Tonspurwahl (phase playing statt hängendem loading)', async () => {
    const channels = Array.from({ length: 18 }, (_, i) => ({ no: i + 1, key: `k${i}`, name: `L${i + 1}` }));
    const scheduler = {
      channels: () => channels,
      prepare: vi.fn(async () => {}),
      nowOn: vi.fn((no, t) => { const start = Math.floor(t / HOUR) * HOUR; return { entry: { start, end: start + HOUR, type: 'program', itemId: `it-${no}` }, offsetMs: t - start, D: 1 }; }),
      item: vi.fn((id) => ({ id, kind: 'movie', title: id })),
    };
    const em = createEmitter();
    let resolvePlay;
    const player = {
      unlock: vi.fn(), stop: vi.fn(async () => {}), syncTo: vi.fn(), setVolume: vi.fn(), setMuted: vi.fn(), volumeSupported: true,
      play: vi.fn(() => new Promise((r) => { resolvePlay = r; })),
      playUrl: vi.fn(async () => ({ ok: true })),
      tracks: vi.fn(() => ({ audio: [], subs: [], audioIndex: 0, subtitleIndex: -1 })),
      setAudio: vi.fn(async () => ({ ok: true, mode: 'direct' })),
      setSubtitle: vi.fn(async () => {}), on: em.on, dispose: vi.fn(),
    };
    const watch = { tune: vi.fn(), tick: vi.fn(), leave: vi.fn(), dispose: vi.fn() };
    const ctl = createTvController({ scheduler, player, watch, pickFiller: vi.fn(), deps: { savePrefs: vi.fn() }, now: () => Date.now(), opts: { lastChannel: 1, volume: 1, muted: false } });
    ctl.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(ctl.state().phase).toBe('loading');
    await ctl.setAudio(1); // Tonspurwahl im Ladefenster
    resolvePlay({ ok: false, reason: 'aborted' }); // ursprünglicher Start wurde von setAudio abgelöst
    await vi.advanceTimersByTimeAsync(0);
    expect(ctl.state().phase).toBe('playing');
    ctl.dispose();
  });
});

describe('Tonspurwahl auf die aktive Spur im Ladefenster', () => {
  it('lässt phase auf loading und ruft den Player nicht auf', async () => {
    const channels = Array.from({ length: 18 }, (_, i) => ({ no: i + 1, key: `k${i}`, name: `L${i + 1}` }));
    const scheduler = {
      channels: () => channels,
      prepare: vi.fn(async () => {}),
      nowOn: vi.fn((no, t) => { const start = Math.floor(t / HOUR) * HOUR; return { entry: { start, end: start + HOUR, type: 'program', itemId: `it-${no}` }, offsetMs: t - start, D: 1 }; }),
      item: vi.fn((id) => ({ id, kind: 'movie', title: id })),
    };
    const em = createEmitter();
    const player = {
      unlock: vi.fn(), stop: vi.fn(async () => {}), syncTo: vi.fn(), setVolume: vi.fn(), setMuted: vi.fn(), volumeSupported: true,
      play: vi.fn(() => new Promise(() => {})),
      playUrl: vi.fn(async () => ({ ok: true })),
      tracks: vi.fn(() => ({ audio: [], subs: [], audioIndex: 0, subtitleIndex: -1 })),
      setAudio: vi.fn(async () => ({ ok: true, mode: 'direct' })),
      setSubtitle: vi.fn(async () => {}), on: em.on, dispose: vi.fn(),
    };
    const watch = { tune: vi.fn(), tick: vi.fn(), leave: vi.fn(), dispose: vi.fn() };
    const ctl = createTvController({ scheduler, player, watch, pickFiller: vi.fn(), deps: { savePrefs: vi.fn() }, now: () => Date.now(), opts: { lastChannel: 1, volume: 1, muted: false } });
    ctl.start();
    await vi.advanceTimersByTimeAsync(0);
    await ctl.setAudio(0); // bereits aktive Spur
    expect(ctl.state().phase).toBe('loading');
    expect(watch.tune).not.toHaveBeenCalled();
    ctl.dispose();
  });
});
