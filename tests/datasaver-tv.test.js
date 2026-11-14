// @vitest-environment jsdom
// Datensparmodus im TV-Modus: zapWarm/zapPrefetch-Getter, Controller sperrt die Nachbar-Vorauflösung, releaseWarm.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ds = vi.hoisted(() => ({ on: false }));
vi.mock('../src/js/core/datasaver.js', () => ({
  isDataSaver: () => ds.on,
  onDataSaverChange: () => () => {},
}));

import { createEmitter } from '../src/js/live/player/events.js';
import { createTvController, NEIGHBOR_MS, WARM_TICK_MS } from '../src/js/live/tvmode/controller.js';
import { zapWarmEnabled, defineZapWarm } from '../src/js/features/live/zapflag.js';

describe('zapflag: Datensparmodus', () => {
  beforeEach(() => { ds.on = false; localStorage.clear(); window.location.hash = ''; });
  afterEach(() => { ds.on = false; });

  it('zapWarmEnabled: aus bei aktivem Datensparmodus, sonst unverändert an', () => {
    expect(zapWarmEnabled()).toBe(true);
    ds.on = true;
    expect(zapWarmEnabled()).toBe(false);
    ds.on = false;
    expect(zapWarmEnabled()).toBe(true);
  });

  it('defineZapWarm: zapWarm und zapPrefetch sind Getter, auch nach {...deps}-Spread neu definiert', () => {
    const deps = defineZapWarm({ a: 1 });
    expect(deps.zapWarm).toBe(true);
    expect(deps.zapPrefetch).toBe(true);
    ds.on = true;
    expect(deps.zapWarm).toBe(false);
    expect(deps.zapPrefetch).toBe(false);
    ds.on = false;
    const spread = { ...deps };
    ds.on = true;
    expect(spread.zapPrefetch).toBe(true); // Spread friert ein (die Falle) ...
    const again = defineZapWarm({ ...deps });
    expect(again.zapPrefetch).toBe(false); // ... erneutes defineZapWarm macht wieder live
    ds.on = false;
    expect(again.zapPrefetch).toBe(true);
    expect(Object.keys(again)).toEqual(expect.arrayContaining(['a', 'zapWarm', 'zapPrefetch']));
  });
});

const HOUR = 3600000;
const T0 = Date.UTC(2026, 10, 11, 18, 0, 0);

function makeEnv(deps) {
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
    prefetch: vi.fn(async () => ({ ok: true })), prewarm: vi.fn(async () => ({ ok: true })), warmNote: vi.fn(),
    releaseWarm: vi.fn(),
    tracks: vi.fn(() => ({ audio: [], subs: [], audioIndex: 0, subtitleIndex: -1 })),
    on: em.on, dispose: vi.fn(),
  };
  const ctl = createTvController({ scheduler, player, watch: null, deps, now: () => Date.now(), opts: { lastChannel: 5 } });
  return { ctl, player };
}
const flush = (ms = 0) => vi.advanceTimersByTimeAsync(ms);

describe('TV-Controller: Nachbarn bei zapPrefetch=false', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(T0); });
  afterEach(() => vi.useRealTimers());

  it('ohne Vorwärmen und zapPrefetch=false: weder prefetch noch prewarm der Nachbarn', async () => {
    const { ctl, player } = makeEnv({ zapWarm: false, zapPrefetch: false });
    ctl.start();
    await flush(NEIGHBOR_MS + WARM_TICK_MS * 3);
    expect(player.prefetch).not.toHaveBeenCalled();
    expect(player.prewarm).not.toHaveBeenCalled();
  });

  it('zapPrefetch=true (und undefiniert) bleibt wie bisher: prefetch der Nachbarn', async () => {
    for (const deps of [{ zapWarm: false, zapPrefetch: true }, {}]) {
      const { ctl, player } = makeEnv(deps);
      ctl.start();
      await flush(NEIGHBOR_MS + 100);
      expect(player.prefetch).toHaveBeenCalled();
      ctl.dispose();
    }
  });

  it('Vorwärmen läuft über den Delegations-Player weiter (prewarm, warmNote), auch bei zapPrefetch=false', async () => {
    const { ctl, player } = makeEnv({ zapWarm: true, zapPrefetch: false });
    ctl.start();
    await flush(NEIGHBOR_MS + 1);
    expect(player.prewarm.mock.calls.map((c) => c[0]).sort()).toEqual(['it-4', 'it-6']);
    expect(player.prefetch).not.toHaveBeenCalled();
  });

  it('live ausgewertet: Getter wechselt zur Laufzeit', async () => {
    const deps = defineZapWarm({});
    const { ctl, player } = makeEnv(deps);
    ds.on = true;
    ctl.start();
    await flush(NEIGHBOR_MS + 100);
    expect(player.prefetch).not.toHaveBeenCalled();
    expect(player.prewarm).not.toHaveBeenCalled();
    ds.on = false;
  });

  it('Auswahl eines Zielsenders löst dessen PlaybackInfo weiter vor (Nutzeraktion)', async () => {
    const { ctl, player } = makeEnv({ zapWarm: false, zapPrefetch: false });
    ctl.start();
    await flush(100);
    player.prefetch.mockClear();
    ctl.tune(9);
    expect(player.prefetch).toHaveBeenCalledTimes(1);
    expect(player.prefetch.mock.calls[0][0]).toBe('it-9');
  });

  it('releaseWarm: ruft player.releaseWarm und stoppt den Nachbar-Takt', async () => {
    const { ctl, player } = makeEnv({ zapWarm: true, zapPrefetch: true });
    ctl.start();
    await flush(NEIGHBOR_MS + 1);
    player.prewarm.mockClear();
    ctl.releaseWarm();
    expect(player.releaseWarm).toHaveBeenCalledTimes(1);
    await flush(WARM_TICK_MS * 3);
    expect(player.prewarm).not.toHaveBeenCalled();
  });

  it('releaseWarm ohne player.releaseWarm wirft nicht', () => {
    const { ctl, player } = makeEnv({});
    delete player.releaseWarm;
    expect(() => ctl.releaseWarm()).not.toThrow();
  });
});
