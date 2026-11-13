// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createEmitter } from '../src/js/live/player/events.js';
import { createTvController, NEIGHBOR_MS, WARM_TICK_MS } from '../src/js/live/tvmode/controller.js';

const HOUR = 3600000;
const T0 = Date.UTC(2026, 10, 11, 18, 0, 0);

function makeEnv({ warm = true, lastChannel = 5 } = {}) {
  const scheduler = {
    prepare: vi.fn(async () => {}),
    nowOn: vi.fn((no, t) => {
      const start = Math.floor(t / HOUR) * HOUR;
      return { entry: { start, end: start + HOUR, type: 'program', itemId: `it-${no}` }, offsetMs: t - start, D: 1 };
    }),
    item: vi.fn((id) => ({ id, kind: 'movie' })),
  };
  const em = createEmitter();
  const player = {
    unlock: vi.fn(), play: vi.fn(async () => ({ ok: true, mode: 'hls' })), playUrl: vi.fn(), stop: vi.fn(async () => {}),
    syncTo: vi.fn(), setVolume: vi.fn(), setMuted: vi.fn(), volumeSupported: true,
    prefetch: vi.fn(async () => ({ ok: true })), prewarm: vi.fn(async () => ({ ok: true })),
    tracks: vi.fn(() => ({ audio: [], subs: [], audioIndex: 0, subtitleIndex: -1 })),
    on: em.on, dispose: vi.fn(),
  };
  const ctl = createTvController({ scheduler, player, watch: null, deps: warm ? { zapWarm: true } : {}, now: () => Date.now(), opts: { lastChannel } });
  return { ctl, scheduler, player, em };
}
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
afterEach(() => vi.useRealTimers());

describe('Vorwärmen der Nachbarsender (Test)', () => {
  it('ohne deps.zapWarm nie prewarm', async () => {
    const env = makeEnv({ warm: false });
    env.ctl.start();
    await flush(NEIGHBOR_MS + WARM_TICK_MS * 3);
    expect(env.player.prefetch).toHaveBeenCalled();
    expect(env.player.prewarm).not.toHaveBeenCalled();
  });

  it('nach NEIGHBOR_MS: prewarm der Sender ±1 mit deren Planposition (Offset in der laufenden Sendung)', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush(NEIGHBOR_MS - 1);
    expect(env.player.prewarm).not.toHaveBeenCalled();
    await flush(2);
    expect(env.player.prewarm.mock.calls.map((c) => c[0]).sort()).toEqual(['it-4', 'it-6']);
    const off = env.player.prewarm.mock.calls[0][1];
    expect(off).toBe(NEIGHBOR_MS); // Planposition zum Zeitpunkt des Aufrufs (Sendung begann zur vollen Stunde = T0)
  });

  it('Takt alle 35 s mit aktueller Planposition, höchstens 10 Wiederholungen', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush(NEIGHBOR_MS + 1);
    env.player.prewarm.mockClear();
    await flush(WARM_TICK_MS);
    expect(env.player.prewarm).toHaveBeenCalledTimes(2);
    expect(env.player.prewarm.mock.calls[0][1]).toBe(NEIGHBOR_MS + WARM_TICK_MS);
    env.player.prewarm.mockClear();
    await flush(WARM_TICK_MS * 12);
    expect(env.player.prewarm).toHaveBeenCalledTimes(9 * 2); // 1 + 10 Läufe insgesamt, einer schon verbraucht
  });

  it('Zappen stoppt den Takt; der neue Sender startet einen eigenen', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush(NEIGHBOR_MS + 1);
    env.ctl.zap(1);
    env.player.prewarm.mockClear();
    await flush(WARM_TICK_MS); // Takt des alten Senders 5 wäre jetzt fällig (Nachbarn 4/6)
    const ids = env.player.prewarm.mock.calls.map((c) => c[0]).sort();
    expect(ids).toEqual(['it-5', 'it-7']); // nur der neue Zyklus (Sender 6: Nachbarn 5/7), einmal
  });

  it('stop und dispose beenden den Takt', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush(NEIGHBOR_MS + 1);
    env.ctl.stop();
    env.player.prewarm.mockClear();
    await flush(WARM_TICK_MS * 3);
    expect(env.player.prewarm).not.toHaveBeenCalled();

    const e2 = makeEnv();
    e2.ctl.start();
    await flush(NEIGHBOR_MS + 1);
    e2.ctl.dispose();
    e2.player.prewarm.mockClear();
    await flush(WARM_TICK_MS * 3);
    expect(e2.player.prewarm).not.toHaveBeenCalled();
  });

  it('kein Takt bei Sendepause/Füllprogramm des laufenden Senders', async () => {
    const env = makeEnv();
    env.scheduler.nowOn.mockImplementation((no, t) => {
      const start = Math.floor(t / HOUR) * HOUR;
      return { entry: { start, end: start + HOUR, type: no === 5 ? 'closedown' : 'program', itemId: no === 5 ? null : `it-${no}` }, offsetMs: t - start, D: 1 };
    });
    env.ctl.start();
    await flush(NEIGHBOR_MS + WARM_TICK_MS * 2);
    expect(env.player.prewarm).not.toHaveBeenCalled();
  });

  it('kurzes Puffern (phase loading) zum NEIGHBOR_MS-Zeitpunkt: Vorwärmen und Nachbar-Prefetch laufen nach dem Puffern trotzdem an', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush(100);
    env.em.emit('state', { phase: 'loading' });
    env.player.prefetch.mockClear();
    await flush(NEIGHBOR_MS + 2500);
    expect(env.player.prewarm).not.toHaveBeenCalled();
    expect(env.player.prefetch).not.toHaveBeenCalled();
    env.em.emit('state', { phase: 'playing' });
    await flush(1000);
    expect(env.player.prewarm.mock.calls.map((c) => c[0]).sort()).toEqual(['it-4', 'it-6']);
    expect(env.player.prefetch).not.toHaveBeenCalled(); // mit Vorwärmen löst prewarm selbst auf (kein doppeltes PlaybackInfo)
  });

  it('ohne Vorwärmen: Nachbar-Prefetch wird beim Puffern ebenfalls erneut versucht', async () => {
    const env = makeEnv({ warm: false });
    env.ctl.start();
    await flush(100);
    env.em.emit('state', { phase: 'loading' });
    env.player.prefetch.mockClear();
    await flush(NEIGHBOR_MS + 2500);
    expect(env.player.prefetch).not.toHaveBeenCalled();
    env.em.emit('state', { phase: 'playing' });
    await flush(1000);
    expect(env.player.prefetch).toHaveBeenCalledTimes(2);
  });

  it('meldet Gründe an den Player: phase beim Puffern, filler bei Nachbarn ohne Programm', async () => {
    const env = makeEnv();
    env.player.warmNote = vi.fn();
    env.ctl.start();
    await flush(100);
    env.em.emit('state', { phase: 'loading' });
    await flush(NEIGHBOR_MS + 100);
    expect(env.player.warmNote).toHaveBeenCalledWith('phase');
    env.player.warmNote.mockClear();
    env.em.emit('state', { phase: 'playing' });
    env.scheduler.nowOn.mockImplementation((no, t) => {
      const start = Math.floor(t / HOUR) * HOUR;
      return { entry: { start, end: start + HOUR, type: no === 5 ? 'program' : 'filler', itemId: no === 5 ? 'it-5' : null }, offsetMs: t - start, D: 1 };
    });
    await flush(1100);
    expect(env.player.warmNote).toHaveBeenCalledWith('filler');
  });

  it('Puffern vor einem Takt: der 35-s-Takt wird erneut versucht und der Zähler nicht verbraucht', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush(NEIGHBOR_MS + 1);
    env.player.prewarm.mockClear();
    await flush(WARM_TICK_MS - 500);
    env.em.emit('state', { phase: 'loading' });
    await flush(1500); // Takt fällig, aber gerade Puffern
    expect(env.player.prewarm).not.toHaveBeenCalled();
    env.em.emit('state', { phase: 'playing' });
    await flush(1000);
    expect(env.player.prewarm).toHaveBeenCalledTimes(2);
  });

  it('gibt nach 20 Versuchen auf', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush(100);
    env.em.emit('state', { phase: 'loading' });
    await flush(NEIGHBOR_MS + 25000);
    env.em.emit('state', { phase: 'playing' });
    await flush(5000);
    expect(env.player.prewarm).not.toHaveBeenCalled();
  });
});

describe('Vorwärmen nach Fehlerkarte und Grund auf der Karte', () => {
  const fail = (env, res) => { env.player.play.mockResolvedValue({ ok: false, ...res }); };

  it('Fehlerkarte (video): nach 2 s Nachbarn vorwärmen, mit Takt; hint steht auf der Karte', async () => {
    const env = makeEnv();
    fail(env, { reason: 'video', code: 'M3', hint: 'Bildformat h264 HDR' });
    env.ctl.start();
    await flush(10);
    const c = env.ctl.state().card;
    expect(c.kind).toBe('error');
    expect(c.hint).toBe('Bildformat h264 HDR wird von diesem Gerät nicht unterstützt');
    expect(c.code).toBe('M3');
    await flush(1900);
    expect(env.player.prewarm).not.toHaveBeenCalled();
    await flush(200);
    expect(env.player.prewarm.mock.calls.map((x) => x[0]).sort()).toEqual(['it-4', 'it-6']);
    env.player.prewarm.mockClear();
    await flush(WARM_TICK_MS);
    expect(env.player.prewarm).toHaveBeenCalledTimes(2);
  });

  it('ohne hint keine hint-Eigenschaft (Karte wie bisher)', async () => {
    const env = makeEnv();
    fail(env, { reason: 'video', code: 'M3' });
    env.ctl.start();
    await flush(10);
    expect('hint' in env.ctl.state().card).toBe(false);
  });

  it('Netzwerkfehler und Tippen-Karte: nicht vorwärmen', async () => {
    for (const reason of ['network', 'gesture']) {
      const env = makeEnv();
      fail(env, { reason });
      env.ctl.start();
      await flush(5000);
      expect(env.ctl.state().card.kind).toBe('error');
      expect(env.player.prewarm, reason).not.toHaveBeenCalled();
    }
  });

  it('Fehlerkarte ohne Vorwärmen: nichts', async () => {
    const env = makeEnv({ warm: false });
    fail(env, { reason: 'browser', code: 'B' });
    env.ctl.start();
    await flush(5000);
    expect(env.player.prewarm).not.toHaveBeenCalled();
  });

  it('Zappen von der Fehlerkarte stoppt das Vorwärmen des alten Senders', async () => {
    const env = makeEnv();
    fail(env, { reason: 'audio' });
    env.ctl.start();
    await flush(1000);
    env.player.play.mockResolvedValue({ ok: true, mode: 'direct' });
    env.ctl.zap(1);
    await flush(1100); // Fehler-Vorwärmen des Senders 5 wäre jetzt fällig; der neue Sender startet erst 1 s nach dem Start
    expect(env.player.prewarm).not.toHaveBeenCalled();
  });

  it('error-Ereignis während der Wiedergabe: auch hier hint und Vorwärmen', async () => {
    const env = makeEnv();
    env.ctl.start();
    await flush(10);
    env.player.prewarm.mockClear();
    env.em.emit('error', { reason: 'video', code: 'M4', hint: 'Auflösung 7680×4320' });
    expect(env.ctl.state().card.hint).toBe('Auflösung 7680×4320 wird von diesem Gerät nicht unterstützt');
    await flush(2100);
    expect(env.player.prewarm).toHaveBeenCalledTimes(2);
  });
});
