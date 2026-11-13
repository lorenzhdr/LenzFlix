// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApp } from '../src/js/live/ui/app.js';
import { createEmitter } from '../src/js/live/player/events.js';

const HOUR = 3600000;
const T0 = Date.UTC(2026, 10, 11, 18, 0, 0);
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

function makeEnv({ warm = true, lastChannel = 5, typeOf = () => 'program', play } = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const channels = Array.from({ length: 18 }, (_, i) => ({ no: i + 1, key: `k${i}`, name: `LIVE ${i + 1}`, kind: 'movies' }));
  const scheduler = {
    channels: () => channels,
    prepare: vi.fn(async () => {}),
    nowOn: vi.fn((no, t) => {
      const start = Math.floor(t / HOUR) * HOUR;
      const type = typeOf(no);
      return { entry: { start, end: start + HOUR, type, itemId: type === 'program' ? `it-${no}` : null }, offsetMs: t - start, D: 1 };
    }),
    item: vi.fn((id) => ({ title: `Titel ${id}`, year: 2001, genres: [], durMs: 5400000, age: 12 })),
    planDay: vi.fn(() => []),
  };
  const em = createEmitter();
  const player = {
    unlock: vi.fn(), play: vi.fn(play || (async () => ({ ok: true, mode: 'direct' }))), playUrl: vi.fn(async () => ({ ok: true })), stop: vi.fn(async () => {}),
    syncTo: vi.fn(), setVolume: vi.fn(), setMuted: vi.fn(), volumeSupported: true,
    prefetch: vi.fn(async () => ({})), prewarm: vi.fn(async () => ({})), warmNote: vi.fn(),
    tracks: vi.fn(() => ({ audio: [], subs: [], audioIndex: 0, subtitleIndex: -1 })),
    on: em.on, dispose: vi.fn(),
  };
  const deps = { user: { id: 'u', name: 'T', isAdmin: false }, previousThemeName: 'LENZFLIX', savePrefs: vi.fn(), leaveToLibrary: vi.fn(async () => {}), toast: vi.fn(), ...(warm ? { zapWarm: true } : {}) };
  const opts = { style: 'crt80', volume: 0.5, muted: false, lastChannel, now: () => Date.now() };
  const app = createApp(host, { scheduler, player, watch: null, pickFiller: vi.fn(async () => ({ kind: 'card' })), overlays: {}, deps, opts, time: {} });
  return { host, scheduler, player, deps, app, em };
}
const btn = (env, key) => env.host.querySelector(`.lfx-live-remote button[data-key="${key}"]`);
const ids = (env) => env.player.prewarm.mock.calls.map((c) => c[0]).sort();

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); HTMLCanvasElement.prototype.getContext = () => null; });
afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; delete window.__lfxLive; });

describe('LENZ LIVE: Nachbarsender vorwärmen', () => {
  it('nach stabilem playing: Sender ±1, Umlauf bei 1 und 18; Takt 35 s', async () => {
    const env = makeEnv({ lastChannel: 1 });
    btn(env, 'power').click();
    await flush(500);
    expect(env.player.prewarm).not.toHaveBeenCalled();
    await flush(600);
    expect(ids(env)).toEqual(['it-18', 'it-2']);
    env.player.prewarm.mockClear();
    await flush(35000);
    expect(env.player.prewarm).toHaveBeenCalledTimes(2);
    env.app.tune(18);
    await flush(1000 + 400 + 100);
    env.player.prewarm.mockClear();
    await flush(35000);
    expect(ids(env)).toEqual(['it-1', 'it-17']);
  });

  it('ohne Vorwärmen: nur prefetch der Nachbarn', async () => {
    const env = makeEnv({ warm: false });
    btn(env, 'power').click();
    await flush(1200);
    expect(env.player.prewarm).not.toHaveBeenCalled();
    expect(env.player.prefetch).toHaveBeenCalledTimes(2);
  });

  it('Füller/Testbild/Sendepause des eigenen Senders: kein Vorwärmen', async () => {
    for (const t of ['filler', 'closedown', 'fill']) {
      const env = makeEnv({ typeOf: (no) => (no === 5 ? t : 'program') });
      btn(env, 'power').click();
      await flush(40000);
      expect(env.player.prewarm, t).not.toHaveBeenCalled();
    }
  });

  it('Puffern zum Zeitpunkt: wartet auf playing', async () => {
    const env = makeEnv();
    btn(env, 'power').click();
    await flush(10);
    env.em.emit('state', { phase: 'loading' });
    await flush(3000);
    expect(env.player.prewarm).not.toHaveBeenCalled();
    env.em.emit('state', { phase: 'playing' });
    await flush(1000);
    expect(ids(env)).toEqual(['it-4', 'it-6']);
  });

  it('Zappen, Ausschalten und dispose stoppen den Takt', async () => {
    const env = makeEnv();
    btn(env, 'power').click();
    await flush(1100);
    env.app.tune(9);
    env.player.prewarm.mockClear();
    await flush(34000); // alter Takt (Nachbarn 4/6) wäre fällig; der neue Zyklus warb Sender 8/10
    expect(ids(env).every((x) => ['it-8', 'it-10'].includes(x))).toBe(true);
    btn(env, 'power').click(); // aus
    env.player.prewarm.mockClear();
    await flush(70000);
    expect(env.player.prewarm).not.toHaveBeenCalled();

    const e2 = makeEnv();
    btn(e2, 'power').click();
    await flush(1100);
    e2.app.dispose();
    e2.player.prewarm.mockClear();
    await flush(70000);
    expect(e2.player.prewarm).not.toHaveBeenCalled();
  });

  it('Fehlerkarte (video, hint): Grund auf der Karte, nach 2 s Vorwärmen; Netzwerkfehler nicht', async () => {
    const env = makeEnv({ play: async () => ({ ok: false, reason: 'video', code: 'M3', hint: 'Bildformat h264 10 Bit' }) });
    btn(env, 'power').click();
    await flush(50);
    expect(env.host.querySelector('.lfx-live-card__hint').textContent).toBe('Bildformat h264 10 Bit wird von diesem Gerät nicht unterstützt');
    expect(env.player.prewarm).not.toHaveBeenCalled();
    await flush(2100);
    expect(ids(env)).toEqual(['it-4', 'it-6']);

    const net = makeEnv({ play: async () => ({ ok: false, reason: 'network' }) });
    btn(net, 'power').click();
    await flush(5000);
    expect(net.player.prewarm).not.toHaveBeenCalled();
  });
});
