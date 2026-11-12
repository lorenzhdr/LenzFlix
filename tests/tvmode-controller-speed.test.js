import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEmitter } from '../src/js/live/player/events.js';
import { createTvController, DEBOUNCE_MS, NEIGHBOR_MS } from '../src/js/live/tvmode/controller.js';

const HOUR = 3600000;
const T0 = Date.UTC(2026, 10, 11, 18, 0, 0);

function makeEnv({ entryFor, lastChannel = 5, player: over = {} } = {}) {
  const ef = entryFor || ((no, t) => { const start = Math.floor(t / HOUR) * HOUR; return { start, end: start + HOUR, type: 'program', itemId: `it-${no}` }; });
  const scheduler = {
    prepare: vi.fn(async () => {}),
    nowOn: vi.fn((no, t) => { const entry = ef(no, t); return { entry, offsetMs: t - entry.start, D: 1 }; }),
    item: vi.fn((id) => ({ id, kind: 'movie' })),
  };
  const em = createEmitter();
  const player = {
    unlock: vi.fn(), play: vi.fn(async () => ({ ok: true, mode: 'direct' })), playUrl: vi.fn(), stop: vi.fn(async () => {}),
    syncTo: vi.fn(), setVolume: vi.fn(), setMuted: vi.fn(), volumeSupported: true,
    prefetch: vi.fn(async () => ({ ok: true })),
    tracks: vi.fn(() => ({ audio: [], subs: [], audioIndex: 0, subtitleIndex: -1 })),
    on: em.on, dispose: vi.fn(),
    ...over,
  };
  const ctl = createTvController({ scheduler, player, watch: null, deps: {}, now: () => Date.now(), opts: { lastChannel } });
  return { ctl, scheduler, player, emit: em.emit };
}
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => vi.useRealTimers());

describe('Schnelleres Zappen', () => {
  it('Entprellung 250 ms', () => { expect(DEBOUNCE_MS).toBe(250); });

  it('tune stößt prefetch des Ziels sofort an; Folgedruck bricht die vorige Anfrage ab', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush();
    env.player.prefetch.mockClear();
    env.ctl.zap(1);
    expect(env.player.prefetch).toHaveBeenCalledTimes(1);
    expect(env.player.prefetch.mock.calls[0][0]).toBe('it-6');
    const sig1 = env.player.prefetch.mock.calls[0][1].signal;
    expect(sig1.aborted).toBe(false);
    env.ctl.zap(1);
    expect(sig1.aborted).toBe(true);
    expect(env.player.prefetch.mock.calls[1][0]).toBe('it-7');
    await flush(DEBOUNCE_MS);
    expect(env.player.play).toHaveBeenLastCalledWith(expect.objectContaining({ itemId: 'it-7' }));
  });

  it('kein prefetch bei Füller/Sendepause als Ziel', async () => {
    const env = makeEnv({ entryFor: (no, t) => { const start = Math.floor(t / HOUR) * HOUR; return { start, end: start + HOUR, type: no === 6 ? 'closedown' : 'program', itemId: no === 6 ? null : `it-${no}` }; } });
    env.ctl.start();
    await flush();
    env.player.prefetch.mockClear();
    env.ctl.zap(1);
    expect(env.player.prefetch).not.toHaveBeenCalled();
  });

  it('nach 3 s stabilem playing: Sender ±1 vorauflösen, max. 2, einmal je Sendung', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush(NEIGHBOR_MS - 100);
    expect(env.player.prefetch).not.toHaveBeenCalled();
    await flush(200);
    expect(env.player.prefetch.mock.calls.map((c) => c[0]).sort()).toEqual(['it-4', 'it-6']);
    env.player.prefetch.mockClear();
    env.ctl.zap(1); // 6: Ziel-prefetch (1) …
    await flush(DEBOUNCE_MS + NEIGHBOR_MS + 100);
    // … Nachbarn 5 und 7: 5 ist neu (nicht in done als Nachbar von 5 → war Zentrum), 7 neu
    const ids = env.player.prefetch.mock.calls.map((c) => c[0]);
    expect(ids.filter((x) => x === 'it-6').length).toBe(1); // Ziel einmal, nicht als Nachbar wiederholt (Zentrum)
    expect(ids).toEqual(expect.arrayContaining(['it-5', 'it-7']));
    expect(ids.length).toBeLessThanOrEqual(3);
  });

  it('keine Nachbar-Vorauflösung bei Füller/Pause auf dem Nachbarsender', async () => {
    const env = makeEnv({ entryFor: (no, t) => { const start = Math.floor(t / HOUR) * HOUR; return { start, end: start + HOUR, type: no === 5 ? 'program' : 'fill', itemId: `it-${no}` }; } });
    env.ctl.start();
    await flush(NEIGHBOR_MS + 100);
    expect(env.player.prefetch).not.toHaveBeenCalled();
  });

  it('Nachbarn werden bei Sender 18 → 17/1 umgebrochen', async () => {
    const env = makeEnv({ lastChannel: 18 });
    env.ctl.start();
    await flush(NEIGHBOR_MS + 100);
    const ids = env.player.prefetch.mock.calls.map((c) => c[0]);
    expect(ids).toEqual(expect.arrayContaining(['it-17', 'it-1']));
  });

  it('stats(): Zeit tune → playing der letzten Umschaltungen', async () => {
    const env = makeEnv({ player: { play: vi.fn(() => new Promise((r) => setTimeout(() => r({ ok: true, mode: 'direct' }), 400))) } });
    env.ctl.start();
    await flush(500);
    env.ctl.zap(1);
    await flush(DEBOUNCE_MS + 450);
    const st = env.ctl.stats();
    expect(st.zaps.length).toBe(2);
    expect(st.lastMs).toBeGreaterThanOrEqual(DEBOUNCE_MS + 400);
    expect(st.zaps.at(-1).channel).toBe(6);
    expect(st.avgMs).toBeGreaterThan(0);
  });
});

describe('Fehlerkarte mit Code', () => {
  it('Code aus play-Ergebnis steht in card.code; network ohne Code → NET', async () => {
    const env = makeEnv({ player: { play: vi.fn(async () => ({ ok: false, mode: 'none', reason: 'video', code: 'V-RANGE' })) } });
    env.ctl.start();
    await flush();
    expect(env.ctl.state().card).toMatchObject({ kind: 'error', reason: 'video', code: 'V-RANGE' });
    const e2 = makeEnv({ player: { play: vi.fn(async () => ({ ok: false, reason: 'network' })) } });
    e2.ctl.start();
    await flush();
    expect(e2.ctl.state().card.code).toBe('NET');
  });

  it('Code aus dem error-Ereignis des Players', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush();
    env.emit('error', { reason: 'video', code: 'M4' });
    expect(env.ctl.state().card).toMatchObject({ reason: 'video', code: 'M4' });
  });
});

describe('Lautstärke mit Gain (iOS)', () => {
  it('volumeSupported: optimistisch bei offenem Versuch, true bei gain, zurück bei Scheitern', async () => {
    const mode = { m: 'mute-only', can: true };
    const env = makeEnv({ player: { volumeSupported: false, volumeCanTry: () => mode.can, volumeMode: () => mode.m } });
    env.ctl.start();
    await flush();
    expect(env.ctl.volumeSupported).toBe(true);
    env.ctl.setVolume(50);
    expect(env.ctl.state().volume).toBe(50);
    expect(env.player.setVolume).toHaveBeenLastCalledWith(0.5);
    mode.can = false; // Versuch gescheitert
    env.emit('volume-mode', { mode: 'mute-only' });
    expect(env.ctl.volumeSupported).toBe(false);
    expect(env.ctl.state().volume).toBe(100);
    expect(env.player.setVolume).toHaveBeenLastCalledWith(1);
  });

  it('gain aktiv: volumeSupported über player.volumeSupported', async () => {
    const env = makeEnv({ player: { volumeSupported: true, volumeMode: () => 'gain' } });
    env.ctl.start();
    expect(env.ctl.volumeSupported).toBe(true);
  });
});
