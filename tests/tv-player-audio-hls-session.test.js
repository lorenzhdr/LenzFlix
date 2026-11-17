// @vitest-environment jsdom
// Live-Player: Tonspurwahl ohne Bildverlust, Startposition einholen, HLS unter Unterpfad,
// Media-Session, srclang, Nachbar-Vorauflösung im Datensparmodus.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPlayer } from '../src/js/tv/player/index.js';
import { resolveStream } from '../src/js/tv/player/stream.js';
import { createNeighbors, NEIGHBOR_MS, WARM_TICK_MS } from '../src/js/tv/player/neighbors.js';
import { makeVideo, makeDeps, ms, info, flush, fire, hlsUrl, SECRET } from './tv-player-helpers.js';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); delete navigator.mediaSession; });

const streams = [
  { Index: 0, Type: 'Video', Codec: 'h264' },
  { Index: 1, Type: 'Audio', Codec: 'aac', Language: 'eng', IsDefault: true, DisplayTitle: 'English - AAC' },
  { Index: 2, Type: 'Audio', Codec: 'ac3', Language: 'ger', DisplayTitle: 'Deutsch - AC3' },
];

describe('setAudio mit nicht auflösbarer Tonspur', () => {
  it('laufendes Bild bleibt bestehen, kein error-Zustand/-Ereignis', async () => {
    const log = [];
    const video = makeVideo({ log });
    const deps = makeDeps({
      log,
      respond: (m, p, o) => (o && o.body && o.body.AudioStreamIndex === 2 ? info(ms({ direct: false, streams })) : info(ms({ streams }))),
    });
    const player = createPlayer({ video, deps });
    const p0 = player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(video, 'loadedmetadata');
    fire(video, 'playing');
    expect((await p0).ok).toBe(true);

    const states = [];
    const errors = [];
    player.on('state', (s) => states.push(s.phase));
    player.on('error', (e) => errors.push(e));
    const res = await player.setAudio(2);
    await flush();

    expect(res.ok).toBe(false);
    expect(errors).toEqual([]);
    expect(states).not.toContain('error');
    expect(video.hasAttribute('src')).toBe(true);
    expect(player.tracks().audio.length).toBeGreaterThan(0);
  });
});

describe('Startposition holt die Auflösungszeit ein', () => {
  it('Start liegt um die Dauer der PlaybackInfo hinter dem Aufrufzeitpunkt', async () => {
    const clock = { t: 1000000 };
    const log = [];
    const video = makeVideo({ log });
    const deps = makeDeps({ log, respond: () => { clock.t += 5000; return info(ms()); } });
    const player = createPlayer({ video, deps, now: () => clock.t });
    const p = player.play({ itemId: 'it1', offsetMs: 60000 });
    await flush();
    fire(video, 'loadedmetadata');
    fire(video, 'playing');
    await p;
    expect(log.find((x) => x[0] === 'currentTime')[1]).toBe(65);
  });
});

describe('HLS-Adresse unter Server-Unterpfad', () => {
  const url = async (base) => {
    const deps = makeDeps({ respond: () => info(ms({ direct: false, transcodingUrl: hlsUrl(), reasons: ['ContainerNotSupported'] })) });
    deps.streamUrl = (path, params) => `${base}${path}?${new URLSearchParams({ ...params, ApiKey: SECRET })}`;
    return (await resolveStream({ deps, video: makeVideo(), itemId: 'it1' })).url;
  };
  it('behält /jellyfin', async () => {
    expect((await url('http://srv/jellyfin')).startsWith('http://srv/jellyfin/videos/it1/master.m3u8')).toBe(true);
    expect((await url('http://srv/jellyfin/')).startsWith('http://srv/jellyfin/videos/it1/master.m3u8')).toBe(true);
  });
  it('ohne Unterpfad unverändert', async () => {
    expect((await url('http://srv:8096')).startsWith('http://srv:8096/videos/it1/master.m3u8')).toBe(true);
  });
});

describe('Media-Session', () => {
  it('Player setzt keine Handler und entfernt keine (Jellyfins bleiben)', () => {
    const setActionHandler = vi.fn();
    Object.defineProperty(navigator, 'mediaSession', { value: { setActionHandler }, configurable: true });
    const player = createPlayer({ video: makeVideo(), deps: makeDeps() });
    player.dispose();
    expect(setActionHandler).not.toHaveBeenCalled();
  });
});

describe('srclang als BCP-47', () => {
  it('ger -> de, eng -> en', async () => {
    const video = makeVideo();
    const player = createPlayer({ video, deps: makeDeps({ respond: () => info(ms()) }) });
    const p = player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(video, 'loadedmetadata');
    fire(video, 'playing');
    await p;
    await player.setSubtitle(3); // Language 'ger'
    expect(video.querySelector('track').getAttribute('srclang')).toBe('de');
    await player.setSubtitle(5); // 'eng'
    expect(video.querySelector('track').getAttribute('srclang')).toBe('en');
  });
});

describe('Nachbar-Vorauflösung im Datensparmodus', () => {
  it('verbraucht den Schlüssel nicht und holt nach dem Ausschalten nach', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(Date.UTC(2026, 10, 11, 18, 0, 0));
    const scheduler = { nowOn: vi.fn((no, t) => ({ entry: { start: t - 1000, end: t + 1e6, type: 'program', itemId: `it-${no}` }, offsetMs: 1000 })) };
    const player = { prefetch: vi.fn(async () => ({})), warmNote: vi.fn() };
    const deps = { zapPrefetch: false };
    const nb = createNeighbors({ player, scheduler, clock: () => Date.now(), deps, getChannel: () => 5, getPhase: () => 'playing', nch: 18 });
    nb.arm('play');
    await vi.advanceTimersByTimeAsync(NEIGHBOR_MS + 1);
    expect(player.prefetch).not.toHaveBeenCalled();
    deps.zapPrefetch = true;
    await vi.advanceTimersByTimeAsync(WARM_TICK_MS + 1);
    expect(player.prefetch).toHaveBeenCalledTimes(2);
  });
});
