// @vitest-environment jsdom
// TV-Controller: Füller-Trailer, Phase kehrt nach stalled auf playing zurück.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createTvController } from '../src/js/tv/tvmode/controller.js';
import { createEmitter } from '../src/js/tv/player/events.js';

const HOUR = 3600000;
const T0 = Date.UTC(2026, 10, 11, 18, 0, 0);
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => vi.useRealTimers());

describe('tvmode controller: Füller-Trailer', () => {
  it('phase kehrt nach stalled -> playing wieder auf playing zurück', async () => {
    const entryFor = (no, t) => {
      const s0 = Math.floor(t / HOUR) * HOUR;
      if (t - s0 < 20 * 60000) return { start: s0, end: s0 + 20 * 60000, type: 'filler' };
      return { start: s0 + 20 * 60000, end: s0 + HOUR, type: 'program', itemId: `nx-${s0}` };
    };
    const channels = Array.from({ length: 18 }, (_, i) => ({ no: i + 1, key: `k${i}`, name: `LIVE ${i + 1}` }));
    const scheduler = {
      channels: () => channels,
      prepare: vi.fn(async () => {}),
      nowOn: vi.fn((no, t) => { const entry = entryFor(no, t); return { entry, offsetMs: t - entry.start, D: 1 }; }),
      item: vi.fn((id) => ({ id, kind: 'movie', title: id })),
    };
    const em = createEmitter();
    const player = {
      unlock: vi.fn(), play: vi.fn(async () => ({ ok: true, mode: 'direct' })),
      playUrl: vi.fn(async () => ({ ok: true, mode: 'direct' })),
      stop: vi.fn(async () => {}), syncTo: vi.fn(), setVolume: vi.fn(), setMuted: vi.fn(),
      volumeSupported: true,
      tracks: vi.fn(() => ({ audio: [], subs: [], audioIndex: 0, subtitleIndex: -1 })),
      setAudio: vi.fn(async () => ({ ok: true })), setSubtitle: vi.fn(async () => {}),
      on: em.on, dispose: vi.fn(),
    };
    const watch = { tune: vi.fn(), tick: vi.fn(), leave: vi.fn(), dispose: vi.fn() };
    const pickFiller = vi.fn(async () => ({ kind: 'trailer', url: 'http://x/t.mp4', offsetMs: 0 }));
    const ctl = createTvController({
      scheduler, player, watch, pickFiller, deps: { savePrefs: vi.fn() }, now: () => Date.now(),
      opts: { lastChannel: 1, volume: 1, muted: false },
    });
    ctl.start();
    await flush();
    expect(ctl.state().phase).toBe('playing');
    em.emit('state', { phase: 'stalled' });
    expect(ctl.state().phase).toBe('loading');
    em.emit('state', { phase: 'playing' });
    expect(ctl.state().phase).toBe('playing');
  });
});

