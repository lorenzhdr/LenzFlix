// @vitest-environment jsdom
// Gesehen-Regel nur bei wirklich laufender Wiedergabe; Autoplay-Sperre (stumm starten / „Zum Starten tippen“).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/js/live/ui/app.js';
import { createWatchTracker } from '../src/js/live/player/watch.js';

const T0 = Date.UTC(2026, 10, 11, 18, 0, 0);
const HOUR = 3600000;

function setup({ play, withTracker = false, watchSpy } = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const clock = { t: T0 };
  const channels = Array.from({ length: 18 }, (_, i) => ({ no: i + 1, key: `k${i}`, name: `LIVE ${i + 1}` }));
  const entry = { start: T0, end: T0 + HOUR, type: 'program', itemId: 'film1' };
  const scheduler = {
    channels: () => channels,
    prepare: vi.fn(async () => {}),
    nowOn: vi.fn((no, t) => ({ entry, offsetMs: t - entry.start, D: 1 })),
    item: vi.fn(() => ({ title: 'Film', year: 2001, genres: [], durMs: HOUR })),
    planDay: vi.fn(() => []),
  };
  const handlers = {};
  const player = {
    unlock: vi.fn(),
    play: play || vi.fn(async () => ({ ok: true, mode: 'direct' })),
    playUrl: vi.fn(async () => ({ ok: true })),
    stop: vi.fn(async () => {}),
    syncTo: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    volumeSupported: true,
    tracks: vi.fn(() => ({ audio: [], subs: [], audioIndex: 0, subtitleIndex: -1 })),
    on: vi.fn((ev, fn) => { handlers[ev] = fn; return () => {}; }),
    dispose: vi.fn(),
  };
  const setPlayed = vi.fn(() => Promise.resolve());
  const watch = withTracker ? createWatchTracker({ setPlayed, now: () => clock.t }) : watchSpy;
  const deps = { savePrefs: vi.fn(), toast: vi.fn(), previousThemeName: 'LENZFLIX' };
  const opts = { style: 'crt80', volume: 0.5, muted: false, lastChannel: 1, now: () => clock.t };
  const app = createApp(host, { scheduler, player, watch, pickFiller: vi.fn(async () => ({ kind: 'card' })), overlays: {}, deps, opts, time: {} });
  return { host, clock, player, handlers, setPlayed, deps, app };
}

const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);
const q = (env, sel) => env.host.querySelector(sel);

beforeEach(() => {
  vi.useFakeTimers();
  HTMLCanvasElement.prototype.getContext = () => null;
});
afterEach(() => {
  vi.useRealTimers();
  document.body.innerHTML = '';
});

describe('Gesehen-Regel nur bei laufender Wiedergabe', () => {
  it('Störbild nach Einschalten: nie setPlayed, auch wenn die Uhr auf 95 % läuft', async () => {
    const env = setup({ withTracker: true, play: vi.fn(async () => ({ ok: false, mode: 'none', reason: 'browser' })) });
    env.app.press('power');
    await flush();
    expect(q(env, '.lfx-live-card').dataset.reason).toBe('browser');
    env.clock.t = T0 + 0.95 * HOUR;
    await flush(2000);
    env.app.press('power');
    expect(env.setPlayed).not.toHaveBeenCalled();
  });

  it('erfolgreich gestartet und durchgeschaut: setPlayed genau einmal', async () => {
    const env = setup({ withTracker: true });
    env.app.press('power');
    await flush();
    env.clock.t = T0 + 0.95 * HOUR;
    await flush(2000);
    env.app.press('power');
    await flush();
    expect(env.setPlayed).toHaveBeenCalledTimes(1);
    expect(env.setPlayed).toHaveBeenCalledWith('film1', true);
  });

  it('Stillstand länger als 60 s mitten in der Sendung: kein setPlayed', async () => {
    const env = setup({ withTracker: true });
    env.app.press('power');
    await flush();
    env.clock.t = T0 + 0.6 * HOUR;
    env.handlers.state({ phase: 'stalled' });
    await flush(61000);
    env.clock.t = T0 + 0.95 * HOUR;
    env.handlers.state({ phase: 'playing' });
    await flush(2000);
    env.app.press('power');
    expect(env.setPlayed).not.toHaveBeenCalled();
  });

  it('Fehler mitten in der Sendung (error-Ereignis) länger als 60 s: kein setPlayed', async () => {
    const env = setup({ withTracker: true });
    env.app.press('power');
    await flush();
    env.clock.t = T0 + 0.6 * HOUR;
    env.handlers.error({ reason: 'network' });
    env.clock.t = T0 + 0.6 * HOUR + 61000;
    await flush(1000);
    env.clock.t = T0 + 0.95 * HOUR;
    await flush(2000);
    env.app.press('power');
    expect(env.setPlayed).not.toHaveBeenCalled();
  });

  it('tune erst nach ok, mit Offset aus der Uhr zum Startzeitpunkt', async () => {
    let done;
    const watchSpy = { tune: vi.fn(), tick: vi.fn(), leave: vi.fn(), dispose: vi.fn() };
    const env = setup({ watchSpy, play: vi.fn(() => new Promise((r) => { done = r; })) });
    env.app.press('power');
    await flush();
    expect(watchSpy.tune).not.toHaveBeenCalled();
    env.clock.t = T0 + 5000;
    done({ ok: true, mode: 'direct' });
    await flush();
    expect(watchSpy.tune).toHaveBeenCalledTimes(1);
    expect(watchSpy.tune.mock.calls[0][1]).toBe(5000);
  });
});

describe('Autoplay-Sperre', () => {
  it('stummer Autostart: Hinweis, Prefs unberührt, Tippen schaltet den Ton wieder ein', async () => {
    const env = setup();
    env.app.press('power');
    await flush();
    env.handlers['autoplay-muted']({});
    expect(q(env, '.lfx-live-osd').textContent).toContain('Ton aus – zum Einschalten tippen oder Stumm-Taste drücken');
    expect(env.deps.savePrefs).not.toHaveBeenCalledWith(expect.objectContaining({ muted: true }));
    env.player.setMuted.mockClear();
    q(env, '.lfx-live-screen').click();
    expect(env.player.setMuted).toHaveBeenLastCalledWith(false);
    expect(env.deps.savePrefs).not.toHaveBeenCalledWith(expect.objectContaining({ muted: true }));
  });

  it('Stumm-Taste nach stummem Autostart schaltet den Ton ein (kein Umschalten auf stumm)', async () => {
    const env = setup();
    env.app.press('power');
    await flush();
    env.handlers['autoplay-muted']({});
    env.player.setMuted.mockClear();
    env.app.press('mute');
    expect(env.player.setMuted).toHaveBeenLastCalledWith(false);
    expect(env.deps.savePrefs).not.toHaveBeenCalledWith(expect.objectContaining({ muted: true }));
  });

  it('gesture: Karte „Zum Starten tippen“, Tippen ruft unlock synchron und startet neu', async () => {
    const play = vi.fn()
      .mockResolvedValueOnce({ ok: false, mode: 'none', reason: 'gesture' })
      .mockResolvedValue({ ok: true, mode: 'direct' });
    const env = setup({ play });
    env.app.press('power');
    await flush();
    expect(q(env, '.lfx-live-card').dataset.reason).toBe('gesture');
    expect(q(env, '.lfx-live-card').textContent).toContain('Zum Starten tippen');
    expect(env.player.unlock).toHaveBeenCalledTimes(1);
    q(env, '.lfx-live-screen').click();
    expect(env.player.unlock).toHaveBeenCalledTimes(2); // synchron
    await flush();
    expect(play).toHaveBeenCalledTimes(2);
    expect(q(env, '.lfx-live-card').textContent).not.toContain('Zum Starten tippen');
  });

  it('gesture: eine Fernbedienungstaste startet ebenfalls neu und wird verbraucht', async () => {
    const play = vi.fn()
      .mockResolvedValueOnce({ ok: false, mode: 'none', reason: 'gesture' })
      .mockResolvedValue({ ok: true, mode: 'direct' });
    const env = setup({ play });
    env.app.press('power');
    await flush();
    env.app.press('ch+');
    expect(env.player.unlock).toHaveBeenCalledTimes(2);
    await flush();
    expect(play).toHaveBeenCalledTimes(2);
    expect(env.app.channel()).toBe(1);
  });
});
