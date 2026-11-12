// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPlayer } from '../src/js/live/player/index.js';
import { makeVideo, makeDeps, ms, info, hlsUrl, fire, flush, SECRET } from './live-player-helpers.js';

afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); delete navigator.mediaSession; });

const directRespond = () => info(ms());
const hlsRespond = (m, p, o) => (o && o.body && o.body.AudioStreamIndex === 2
  ? info(ms({ direct: false, transcodingUrl: hlsUrl('&AudioStreamIndex=2') }))
  : info(ms({ direct: false, transcodingUrl: hlsUrl('&TranscodeReasons=AudioCodecNotSupported') })));

function setup({ respond = directRespond, user, now, ...caps } = {}) {
  const log = [];
  const video = makeVideo({ ...caps, log });
  const deps = makeDeps({ respond, log, user });
  const clock = { t: 1000000 };
  const player = createPlayer({ video, deps, now: now || (() => clock.t) });
  return { log, video, deps, player, clock };
}

/** play → loadedmetadata → playing */
async function begin(ctx, opts = { itemId: 'it1', offsetMs: 0 }) {
  const p = ctx.player.play(opts);
  await flush();
  fire(ctx.video, 'loadedmetadata');
  fire(ctx.video, 'playing');
  return p;
}

/** Wie begin(), aber mit Fake-Timern (flush nutzt echte Timer). */
async function beginT(ctx, opts = { itemId: 'it1', offsetMs: 0 }) {
  const p = ctx.player.play(opts);
  await vi.advanceTimersByTimeAsync(5);
  fire(ctx.video, 'loadedmetadata');
  fire(ctx.video, 'playing');
  return p;
}

describe('Element-Attribute', () => {
  it('setzt playsinline, disablepictureinpicture, airplay deny, kein controls', () => {
    const { video } = setup();
    video.setAttribute('controls', '');
    const v2 = makeVideo();
    v2.setAttribute('controls', '');
    createPlayer({ video: v2, deps: makeDeps() });
    expect(v2.hasAttribute('playsinline')).toBe(true);
    expect(v2.hasAttribute('disablepictureinpicture')).toBe(true);
    expect(v2.getAttribute('x-webkit-airplay')).toBe('deny');
    expect(v2.hasAttribute('controls')).toBe(false);
  });
});

describe('Start', () => {
  it('direkt: Startposition per currentTime nach loadedmetadata, danach play(); nie StartTimeTicks in der URL', async () => {
    const ctx = setup();
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 1800000 });
    await flush();
    expect(ctx.video.getAttribute('src')).toContain('/Videos/it1/stream?');
    expect(ctx.video.getAttribute('src')).not.toMatch(/StartTimeTicks/i);
    expect(ctx.log.some((e) => e[0] === 'currentTime')).toBe(false);
    ctx.log.length = 0;
    fire(ctx.video, 'loadedmetadata');
    expect(ctx.log).toEqual([['currentTime', 1800], ['play']]);
    fire(ctx.video, 'playing');
    expect(await p).toEqual({ ok: true, mode: 'direct' });
  });

  it('HLS: gleiche Regel, Position ist die Live-Position zum Zeitpunkt der Metadaten', async () => {
    const ctx = setup({ respond: hlsRespond });
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 600000 });
    await flush();
    expect(ctx.video.getAttribute('src')).toMatch(/^http:\/\/srv:8096\/videos\/it1\/master\.m3u8/);
    expect(ctx.video.getAttribute('src')).not.toMatch(/StartTimeTicks/i);
    ctx.clock.t += 8000; // Laden dauerte 8 s
    fire(ctx.video, 'loadedmetadata');
    expect(ctx.video.currentTime).toBe(608);
    fire(ctx.video, 'playing');
    expect(await p).toEqual({ ok: true, mode: 'hls' });
  });

  it('Zustände: loading → playing / stalled (erst nach 1,2 s ohne Fortschritt) / ended', async () => {
    vi.useFakeTimers();
    const ctx = setup();
    const phases = [];
    ctx.player.on('state', (s) => phases.push(s.phase));
    await beginT(ctx);
    fire(ctx.video, 'waiting');
    expect(phases).toEqual(['loading', 'playing']);
    await vi.advanceTimersByTimeAsync(1300);
    fire(ctx.video, 'playing');
    fire(ctx.video, 'ended');
    expect(phases).toEqual(['loading', 'playing', 'stalled', 'playing', 'ended']);
  });

  it('stalled-Ereignis wird ignoriert; waiting mit Fortschritt meldet keinen Stall', async () => {
    vi.useFakeTimers();
    const ctx = setup();
    const phases = [];
    ctx.player.on('state', (s) => phases.push(s.phase));
    await beginT(ctx);
    fire(ctx.video, 'stalled');
    await vi.advanceTimersByTimeAsync(3000);
    expect(phases).toEqual(['loading', 'playing']);
    fire(ctx.video, 'waiting');
    await vi.advanceTimersByTimeAsync(500);
    ctx.video.currentTime = 12; // läuft weiter
    fire(ctx.video, 'timeupdate');
    await vi.advanceTimersByTimeAsync(3000);
    expect(phases).toEqual(['loading', 'playing']);
  });

  it('echter Stall: timeupdate mit Fortschritt bzw. canplay meldet wieder playing', async () => {
    vi.useFakeTimers();
    const ctx = setup();
    const phases = [];
    ctx.player.on('state', (s) => phases.push(s.phase));
    await beginT(ctx);
    fire(ctx.video, 'waiting');
    await vi.advanceTimersByTimeAsync(1250);
    expect(phases.at(-1)).toBe('stalled');
    fire(ctx.video, 'timeupdate'); // currentTime unverändert: noch Stall
    expect(phases.at(-1)).toBe('stalled');
    ctx.video.currentTime = 5;
    fire(ctx.video, 'timeupdate');
    expect(phases.slice(-2)).toEqual(['stalled', 'playing']);
    fire(ctx.video, 'waiting');
    await vi.advanceTimersByTimeAsync(1250);
    expect(phases.at(-1)).toBe('stalled');
    fire(ctx.video, 'canplay');
    expect(phases.at(-1)).toBe('playing');
  });

  it('Seek (syncTo > 10 s) mit waiting folgt derselben Regel', async () => {
    vi.useFakeTimers();
    const ctx = setup();
    const phases = [];
    await beginT(ctx, { itemId: 'it1', offsetMs: 100000 });
    ctx.player.on('state', (s) => phases.push(s.phase));
    ctx.video.currentTime = 100;
    ctx.player.syncTo(130000);
    fire(ctx.video, 'waiting');
    await vi.advanceTimersByTimeAsync(300);
    fire(ctx.video, 'playing');
    await vi.advanceTimersByTimeAsync(3000);
    expect(phases).toEqual(['playing']);
  });

  it('Timeout: 25 s ohne playing → error/network', async () => {
    vi.useFakeTimers();
    const ctx = setup();
    const states = [];
    ctx.player.on('state', (s) => states.push(s));
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await vi.advanceTimersByTimeAsync(24000);
    expect(states.some((s) => s.phase === 'error')).toBe(false);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await p).toEqual({ ok: false, mode: 'none', reason: 'network', code: 'TIMEOUT' });
    expect(states.at(-1)).toEqual({ phase: 'error', reason: 'network', code: 'TIMEOUT' });
  });

  it('Aufgelöste Fehler werden gemeldet (video, ohne Stream zu starten)', async () => {
    const ctx = setup({ respond: () => info(ms({ direct: false, transcodingUrl: hlsUrl('&TranscodeReasons=VideoCodecNotSupported') })) });
    const errors = [];
    ctx.player.on('error', (e) => errors.push(e));
    expect(await ctx.player.play({ itemId: 'it1', offsetMs: 0 })).toEqual({ ok: false, mode: 'none', reason: 'video', code: 'V-CODEC' });
    expect(errors).toEqual([{ reason: 'video', code: 'V-CODEC' }]);
    expect(ctx.video.hasAttribute('src')).toBe(false);
  });

  it('Medienfehler im Element → error', async () => {
    const ctx = setup();
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    Object.defineProperty(ctx.video, 'error', { value: { code: 4 }, configurable: true });
    fire(ctx.video, 'error');
    expect(await p).toMatchObject({ ok: false, reason: 'video', code: 'M4·D' });
  });

  it('unlock(): play() synchron im Aufruf, Rejection wird geschluckt', async () => {
    const ctx = setup();
    ctx.video.play.mockImplementation(() => Promise.reject(new Error('NotSupportedError')));
    ctx.player.unlock();
    expect(ctx.video.play).toHaveBeenCalledTimes(1);
    await flush();
  });
});

describe('Stop und Zappen', () => {
  it('HLS-Stop: src leeren und load() VOR DELETE /Videos/ActiveEncodings, mit deviceId + playSessionId', async () => {
    const ctx = setup({ respond: hlsRespond });
    await begin(ctx);
    ctx.log.length = 0;
    await ctx.player.stop();
    const names = ctx.log.map((e) => e[0]);
    expect(names.indexOf('pause')).toBeLessThan(names.indexOf('removeSrc'));
    expect(names.indexOf('removeSrc')).toBeLessThan(names.indexOf('load'));
    expect(names.indexOf('load')).toBeLessThan(names.indexOf('DELETE'));
    const del = ctx.deps.request.mock.calls.find((c) => c[0] === 'DELETE');
    expect(del[1]).toBe('/Videos/ActiveEncodings');
    expect(del[2].params).toEqual({ deviceId: 'dev1', playSessionId: 'ps1' });
    expect(ctx.video.hasAttribute('src')).toBe(false);
  });

  it('Direkt-Stop: kein DELETE', async () => {
    const ctx = setup();
    await begin(ctx);
    await ctx.player.stop();
    expect(ctx.deps.request.mock.calls.some((c) => c[0] === 'DELETE')).toBe(false);
  });

  it('schnelles Zappen: spätere play() bricht frühere ab (aborted), nur die letzte Quelle läuft', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const ctx = setup({
      respond: async (m, path) => {
        if (path.includes('/Items/A/')) { await gate; return info(ms({ id: 'msA' })); }
        return info(ms({ id: 'msB' }));
      },
    });
    const a = ctx.player.play({ itemId: 'A', offsetMs: 0 });
    const b = ctx.player.play({ itemId: 'B', offsetMs: 0 });
    await flush();
    fire(ctx.video, 'loadedmetadata');
    fire(ctx.video, 'playing');
    release();
    expect(await a).toEqual({ ok: false, mode: 'none', reason: 'aborted' });
    expect(await b).toEqual({ ok: true, mode: 'direct' });
    expect(ctx.video.getAttribute('src')).toContain('/Videos/B/stream');
  });

  it('Abbruch während des Ladens (nach Auflösung) → aborted; Anfrage-Signal wird abgebrochen', async () => {
    const signals = [];
    const ctx = setup({ respond: (m, p, o) => { signals.push(o.signal); return info(ms()); } });
    const a = ctx.player.play({ itemId: 'A', offsetMs: 0 });
    await flush();
    const b = ctx.player.play({ itemId: 'B', offsetMs: 0 });
    expect(signals[0].aborted).toBe(true);
    await flush();
    fire(ctx.video, 'loadedmetadata');
    fire(ctx.video, 'playing');
    expect((await a).reason).toBe('aborted');
    expect((await b).ok).toBe(true);
  });

  it('Zappen von HLS auf HLS beendet den alten Job (DELETE)', async () => {
    const ctx = setup({ respond: hlsRespond });
    await begin(ctx);
    const p = ctx.player.play({ itemId: 'it2', offsetMs: 0 });
    await flush();
    expect(ctx.deps.request.mock.calls.filter((c) => c[0] === 'DELETE').length).toBe(1);
    ctx.player.stop();
    await p;
  });
});

describe('Pause-Abwehr und Sync', () => {
  it('fremdes pause → sofort an Live-Position und play()', async () => {
    const ctx = setup();
    await begin(ctx, { itemId: 'it1', offsetMs: 60000 });
    ctx.clock.t += 5000;
    ctx.video.play.mockClear();
    fire(ctx.video, 'pause');
    expect(ctx.video.currentTime).toBe(65);
    expect(ctx.video.play).toHaveBeenCalledTimes(1);
  });

  it('kein Eingriff beim Sendeende (ended) und nach stop()', async () => {
    const ctx = setup();
    await begin(ctx);
    ctx.video.__ended = true;
    ctx.video.play.mockClear();
    fire(ctx.video, 'pause');
    expect(ctx.video.play).not.toHaveBeenCalled();
    ctx.video.__ended = false;
    await ctx.player.stop();
    ctx.video.play.mockClear();
    fire(ctx.video, 'pause');
    expect(ctx.video.play).not.toHaveBeenCalled();
  });

  it('Media-Session-Handler sind No-ops und werden bei dispose entfernt', () => {
    const handlers = {};
    const setActionHandler = vi.fn((a, fn) => { handlers[a] = fn; });
    Object.defineProperty(navigator, 'mediaSession', { value: { setActionHandler }, configurable: true });
    const { player } = setup();
    for (const a of ['pause', 'play', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack']) {
      expect(typeof handlers[a]).toBe('function');
      expect(handlers[a]()).toBeUndefined();
    }
    player.dispose();
    for (const a of ['pause', 'play', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack']) {
      expect(handlers[a]).toBeNull();
    }
  });

  it('syncTo: springt nur bei Abweichung > 10 s', async () => {
    const ctx = setup();
    await begin(ctx, { itemId: 'it1', offsetMs: 100000 });
    ctx.video.currentTime = 100;
    ctx.player.syncTo(105000);
    expect(ctx.video.currentTime).toBe(100);
    ctx.player.syncTo(111000);
    expect(ctx.video.currentTime).toBe(111);
  });

  it('volumeSupported: true normal, false wenn volume ignoriert wird (iOS)', () => {
    expect(setup().player.volumeSupported).toBe(true);
    const video = makeVideo();
    Object.defineProperty(video, 'volume', { get: () => 1, set: () => {}, configurable: true });
    expect(createPlayer({ video, deps: makeDeps() }).volumeSupported).toBe(false);
  });

  it('setVolume/setMuted', () => {
    const { player, video } = setup();
    player.setVolume(0.3);
    expect(video.volume).toBe(0.3);
    player.setVolume(7);
    expect(video.volume).toBe(1);
    player.setMuted(true);
    expect(video.muted).toBe(true);
  });
});

describe('Spuren im Player', () => {
  it('Standardwahl: Nutzersprache + Untertitel; Track-Element mit VTT-URL, default, nur eine aktive Spur', async () => {
    const ctx = setup({ user: { audioLang: 'ger', subMode: 'Always', subLang: 'ger' }, respond: hlsRespond });
    await begin(ctx);
    const t = ctx.player.tracks();
    expect(t.audio.map((a) => a.index)).toEqual([1, 2]);
    expect(t.subs.map((s) => s.index)).toEqual([3, 5]);
    expect(t.audioIndex).toBe(2);
    expect(t.subtitleIndex).toBe(3);
    const els = ctx.video.querySelectorAll('track');
    expect(els.length).toBe(1);
    expect(els[0].getAttribute('src')).toContain('/Videos/it1/ms1/Subtitles/3/0/Stream.vtt');
    expect(els[0].hasAttribute('default')).toBe(true);
    expect(els[0].getAttribute('kind')).toBe('subtitles');
    await ctx.player.setSubtitle(5);
    expect(ctx.video.querySelectorAll('track').length).toBe(1);
    expect(ctx.video.querySelector('track').getAttribute('src')).toContain('/Subtitles/5/0/');
    await ctx.player.setSubtitle(-1);
    expect(ctx.video.querySelectorAll('track').length).toBe(0);
    expect(ctx.player.tracks().subtitleIndex).toBe(-1);
    await ctx.player.setSubtitle(3);
    await ctx.player.stop();
    expect(ctx.video.querySelectorAll('track').length).toBe(0);
  });

  it('setAudio(Nicht-Standard) → Remux-Request mit AudioStreamIndex, hält die Live-Position', async () => {
    const calls = [];
    const ctx = setup({
      respond: (m, p, o) => {
        if (m === 'POST') calls.push(o.body);
        return o.body && o.body.AudioStreamIndex === 2
          ? info(ms({ direct: false, transcodingUrl: hlsUrl('&AudioStreamIndex=2') }))
          : info(ms());
      },
    });
    await begin(ctx, { itemId: 'it1', offsetMs: 120000 });
    ctx.clock.t += 20000;
    const p = ctx.player.setAudio(2);
    await flush();
    expect(calls.at(-1)).toMatchObject({ AudioStreamIndex: 2, EnableDirectPlay: false, SubtitleStreamIndex: -1 });
    fire(ctx.video, 'loadedmetadata');
    expect(ctx.video.currentTime).toBe(140);
    fire(ctx.video, 'playing');
    expect(await p).toEqual({ ok: true, mode: 'hls' });
    expect(ctx.player.tracks().audioIndex).toBe(2);
  });
});

describe('Trailer und dispose', () => {
  it('playUrl: direkt mit Startposition', async () => {
    const ctx = setup();
    const p = ctx.player.playUrl('http://srv/trailer.mp4', 4000);
    await flush();
    fire(ctx.video, 'loadedmetadata');
    expect(ctx.video.currentTime).toBe(4);
    fire(ctx.video, 'playing');
    expect(await p).toEqual({ ok: true, mode: 'direct' });
    expect(ctx.video.getAttribute('src')).toBe('http://srv/trailer.mp4');
  });

  it('dispose räumt alles: Quelle, Listener, Tracks, Requests, DELETE bei HLS', async () => {
    const ctx = setup({ respond: hlsRespond, user: { audioLang: 'ger', subMode: 'Always', subLang: 'ger' } });
    await begin(ctx);
    const signal = ctx.deps.request.mock.calls[0][2].signal;
    ctx.player.dispose();
    await flush();
    expect(signal.aborted).toBe(true);
    expect(ctx.video.hasAttribute('src')).toBe(false);
    expect(ctx.video.querySelectorAll('track').length).toBe(0);
    expect(ctx.deps.request.mock.calls.some((c) => c[0] === 'DELETE')).toBe(true);
    ctx.video.play.mockClear();
    fire(ctx.video, 'pause');
    fire(ctx.video, 'playing');
    expect(ctx.video.play).not.toHaveBeenCalled();
    expect((await ctx.player.play({ itemId: 'x' })).reason).toBe('aborted');
  });
});

describe('Kein Token in Logs und Ereignissen', () => {
  it('weder console.* noch Ereignis-Payloads noch Ergebnisse enthalten ApiKey/Token', async () => {
    const spies = ['log', 'info', 'warn', 'error', 'debug'].map((k) => vi.spyOn(console, k).mockImplementation(() => {}));
    const seen = [];
    const record = (x) => seen.push(JSON.stringify(x));

    // erfolgreicher HLS-Lauf
    let ctx = setup({ respond: hlsRespond, user: { audioLang: 'ger', subMode: 'Always', subLang: 'ger' } });
    ctx.player.on('state', record);
    ctx.player.on('error', record);
    record(await begin(ctx));
    record(ctx.player.tracks());
    await ctx.player.stop();

    // Server-Fehler mit Token im Fehlertext
    ctx = setup({ respond: () => { throw new Error(`boom http://srv/x?ApiKey=${SECRET}&api_key=${SECRET}`); } });
    ctx.player.on('state', record);
    ctx.player.on('error', record);
    record(await ctx.player.play({ itemId: 'it1' }));

    // Medienfehler
    ctx = setup();
    ctx.player.on('state', record);
    ctx.player.on('error', record);
    const p = ctx.player.play({ itemId: 'it1' });
    await flush();
    fire(ctx.video, 'error');
    record(await p);

    expect(seen.length).toBeGreaterThan(4);
    for (const s of seen) expect(s).not.toMatch(/ApiKey|api_key|SECRET/i);
    for (const sp of spies) {
      for (const call of sp.mock.calls) expect(JSON.stringify(call)).not.toMatch(/ApiKey|api_key|SECRET/i);
    }
  });
});

describe('Autoplay-Sperre (NotAllowedError)', () => {
  const rejectWith = (name) => Object.assign(new Error(name), { name });

  it('erst abgelehnt, stumm gelungen: Ereignis autoplay-muted, kein Fehler', async () => {
    const ctx = setup();
    const events = [];
    ctx.player.on('autoplay-muted', () => events.push('muted'));
    ctx.player.on('error', () => events.push('error'));
    ctx.video.play = vi.fn()
      .mockImplementationOnce(() => Promise.reject(rejectWith('NotAllowedError')))
      .mockReturnValue(Promise.resolve());
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(ctx.video, 'loadedmetadata');
    await flush();
    expect(ctx.video.muted).toBe(true);
    expect(events).toEqual(['muted']);
    fire(ctx.video, 'playing');
    expect((await p).ok).toBe(true);
  });

  it('dauerhaft abgelehnt: reason gesture, nicht browser', async () => {
    const ctx = setup();
    ctx.video.play = vi.fn(() => Promise.reject(rejectWith('NotAllowedError')));
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(ctx.video, 'loadedmetadata');
    const res = await p;
    expect(res).toMatchObject({ ok: false, reason: 'gesture' });
  });

  it('NotSupportedError bleibt browser', async () => {
    const ctx = setup();
    ctx.video.play = vi.fn(() => Promise.reject(rejectWith('NotSupportedError')));
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(ctx.video, 'loadedmetadata');
    expect(await p).toMatchObject({ ok: false, reason: 'browser', code: 'B-PLAY·D' });
  });
});
