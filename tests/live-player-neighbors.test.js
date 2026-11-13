// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNeighbors, prefetchItem, NEIGHBOR_MS, ERROR_WARM_MS, WARM_TICK_MS, WARM_TICK_MAX, WARM_AFTER_ERROR } from '../src/js/live/player/neighbors.js';

const HOUR = 3600000;
const T0 = Date.UTC(2026, 10, 11, 18, 0, 0);
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

function make({ channel = 5, warm = true, phase = 'playing', type = () => 'program' } = {}) {
  const st = { channel, phase };
  const scheduler = {
    nowOn: vi.fn((no, t) => {
      const start = Math.floor(t / HOUR) * HOUR;
      return { entry: { start, end: start + HOUR, type: type(no), itemId: `it-${no}` }, offsetMs: t - start };
    }),
  };
  const player = { prefetch: vi.fn(async () => ({})), prewarm: vi.fn(async () => ({})), warmNote: vi.fn() };
  const deps = warm ? { zapWarm: true } : {};
  const nb = createNeighbors({ player, scheduler, clock: () => Date.now(), deps, getChannel: () => st.channel, getPhase: () => st.phase, nch: 18 });
  return { st, scheduler, player, deps, nb };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => vi.useRealTimers());

describe('createNeighbors', () => {
  it('Konstanten', () => {
    expect([NEIGHBOR_MS, ERROR_WARM_MS, WARM_TICK_MS, WARM_TICK_MAX]).toEqual([1000, 2000, 35000, 10]);
    expect(WARM_AFTER_ERROR).toEqual(['video', 'browser', 'audio']);
  });

  it('Umlauf: Sender 1 wärmt 18 und 2, Sender 18 wärmt 17 und 1', async () => {
    const a = make({ channel: 1 });
    a.nb.arm('play');
    await flush(NEIGHBOR_MS + 1);
    expect(a.player.prewarm.mock.calls.map((c) => c[0]).sort()).toEqual(['it-18', 'it-2']);
    const b = make({ channel: 18 });
    b.nb.arm('play');
    await flush(NEIGHBOR_MS + 1);
    expect(b.player.prewarm.mock.calls.map((c) => c[0]).sort()).toEqual(['it-1', 'it-17']);
  });

  it('ohne Vorwärmen: prefetch je Sendung einmal, nie prewarm; Fehlerkarte tut nichts', async () => {
    const e = make({ warm: false });
    e.nb.arm('play');
    await flush(NEIGHBOR_MS + WARM_TICK_MS * 2);
    expect(e.player.prefetch).toHaveBeenCalledTimes(2);
    expect(e.player.prewarm).not.toHaveBeenCalled();
    const f = make({ warm: false, phase: 'error' });
    f.nb.arm('error');
    await flush(ERROR_WARM_MS * 3);
    expect(f.player.prefetch).not.toHaveBeenCalled();
    expect(f.player.prewarm).not.toHaveBeenCalled();
  });

  it('Fehlerkarte: nach 2 s vorwärmen, Takt 35 s; Karte weg → Schluss', async () => {
    const e = make({ phase: 'error' });
    e.nb.arm('error');
    await flush(ERROR_WARM_MS - 1);
    expect(e.player.prewarm).not.toHaveBeenCalled();
    await flush(2);
    expect(e.player.prewarm).toHaveBeenCalledTimes(2);
    await flush(WARM_TICK_MS);
    expect(e.player.prewarm).toHaveBeenCalledTimes(4);
    e.st.phase = 'loading'; // Neuversuch
    await flush(WARM_TICK_MS * 3);
    expect(e.player.prewarm).toHaveBeenCalledTimes(4);
  });

  it('Nachbarn ohne Programm: nie vorwärmen, Grund filler', async () => {
    const e = make({ type: (no) => (no === 5 ? 'program' : 'filler') });
    e.nb.arm('play');
    await flush(NEIGHBOR_MS + 1);
    expect(e.player.prewarm).not.toHaveBeenCalled();
    expect(e.player.warmNote).toHaveBeenCalledWith('filler');
  });

  it('stop und dispose beenden den Takt', async () => {
    const e = make();
    e.nb.arm('play');
    await flush(NEIGHBOR_MS + 1);
    e.nb.stop();
    e.player.prewarm.mockClear();
    await flush(WARM_TICK_MS * 3);
    expect(e.player.prewarm).not.toHaveBeenCalled();
    e.nb.arm('play');
    e.nb.dispose();
    await flush(NEIGHBOR_MS * 3);
    expect(e.player.prewarm).not.toHaveBeenCalled();
  });

  it('Schalter zur Laufzeit: Getter deps.zapWarm wird bei jedem Lauf gelesen', async () => {
    const e = make({ warm: false });
    let on = true;
    Object.defineProperty(e.deps, 'zapWarm', { get: () => on });
    e.nb.arm('play');
    await flush(NEIGHBOR_MS + 1);
    expect(e.player.prewarm).toHaveBeenCalledTimes(2);
    on = false;
    e.player.prewarm.mockClear();
    await flush(WARM_TICK_MS);
    expect(e.player.prewarm).not.toHaveBeenCalled();
  });

  it('prefetchItem schluckt Würfe und Ablehnungen', async () => {
    expect(() => prefetchItem({ prefetch: () => { throw new Error('x'); } }, 'a')).not.toThrow();
    expect(() => prefetchItem({ prefetch: () => Promise.reject(new Error('x')) }, 'a')).not.toThrow();
    expect(() => prefetchItem(null, 'a')).not.toThrow();
  });
});
