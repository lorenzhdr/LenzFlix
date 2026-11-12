// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPlayer } from '../src/js/live/player/index.js';
import { resolveStream } from '../src/js/live/player/stream.js';
import { buildDeviceProfile } from '../src/js/live/player/profile.js';
import { makeVideo, makeDeps, ms, info, hlsUrl, fire, flush } from './live-player-helpers.js';

afterEach(() => { vi.restoreAllMocks(); });

const HEVC_STREAMS = [
  { Index: 0, Type: 'Video', Codec: 'hevc' },
  { Index: 1, Type: 'Audio', Codec: 'eac3', Language: 'eng', IsDefault: true },
];
const container = (o) => o.body.DeviceProfile.TranscodingProfiles[0].Container;

/** HLS-Antwort; Quelle h264 (Standard) oder hevc. */
const hlsRespond = (streams) => (m, p, o) => info(ms({
  direct: false, streams, transcodingUrl: hlsUrl(`&SegmentContainer=${container(o) === 'mp4' ? 'mp4' : 'ts'}&TranscodeReasons=ContainerNotSupported`),
}));

function setup({ respond, ...caps } = {}) {
  const video = makeVideo({ hevc: true, ...caps });
  const deps = makeDeps({ respond });
  return { video, deps, player: createPlayer({ video, deps }) };
}
const mediaError = (video, code) => {
  Object.defineProperty(video, 'error', { value: { code }, configurable: true });
  fire(video, 'error');
};

describe('Rückfall ts/h264', () => {
  it('h264 mit fMP4-HLS: video error → einmal ohne HEVC (ts) neu starten; kein Fehler-Ereignis dazwischen', async () => {
    const ctx = setup({ respond: hlsRespond() });
    const events = [];
    ctx.player.on('error', (e) => events.push(e));
    ctx.player.on('state', (s) => { if (s.phase === 'error') events.push(s); });
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    expect(ctx.deps.request.mock.calls[0][2].body.DeviceProfile.TranscodingProfiles[0].Container).toBe('mp4');
    fire(ctx.video, 'loadedmetadata');
    mediaError(ctx.video, 4);
    await flush();
    const posts = ctx.deps.request.mock.calls.filter((c) => c[0] === 'POST');
    expect(posts.length).toBe(2);
    expect(container(posts[1][2])).toBe('ts');
    expect(posts[1][2].body.DeviceProfile.TranscodingProfiles[0].VideoCodec).toBe('h264');
    expect(ctx.deps.request.mock.calls.some((c) => c[0] === 'DELETE')).toBe(true); // alter Job beendet
    expect(events).toEqual([]);
    Object.defineProperty(ctx.video, 'error', { value: null, configurable: true });
    fire(ctx.video, 'loadedmetadata');
    fire(ctx.video, 'playing');
    expect(await p).toEqual({ ok: true, mode: 'hls' });
    expect(events).toEqual([]);
  });

  it('Rückfall merkt sich: nächster h264-Titel wird gleich ohne HEVC angefragt', async () => {
    const ctx = setup({ respond: hlsRespond() });
    let p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(ctx.video, 'loadedmetadata');
    mediaError(ctx.video, 4);
    await flush();
    Object.defineProperty(ctx.video, 'error', { value: null, configurable: true });
    fire(ctx.video, 'loadedmetadata');
    fire(ctx.video, 'playing');
    await p;
    ctx.deps.request.mockClear();
    p = ctx.player.play({ itemId: 'it2', offsetMs: 0 });
    await flush();
    const posts = ctx.deps.request.mock.calls.filter((c) => c[0] === 'POST');
    expect(posts.map((c) => container(c[2]))).toEqual(['mp4', 'ts']);
    fire(ctx.video, 'loadedmetadata');
    fire(ctx.video, 'playing');
    expect((await p).ok).toBe(true);
  });

  it('scheitert auch der Rückfall: Fehler mit Code (M4), genau ein Fehler-Ereignis', async () => {
    const ctx = setup({ respond: hlsRespond() });
    const errors = [];
    ctx.player.on('error', (e) => errors.push(e));
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(ctx.video, 'loadedmetadata');
    mediaError(ctx.video, 4);
    await flush();
    fire(ctx.video, 'loadedmetadata');
    mediaError(ctx.video, 4);
    expect(await p).toEqual({ ok: false, mode: 'none', reason: 'video', code: 'M4' });
    expect(errors).toEqual([{ reason: 'video', code: 'M4' }]);
    expect(ctx.deps.request.mock.calls.filter((c) => c[0] === 'POST').length).toBe(2); // nur einmal wiederholt
  });

  it('HEVC-Quelle: kein ts-Rückfall', async () => {
    const ctx = setup({ respond: hlsRespond(HEVC_STREAMS) });
    const errors = [];
    ctx.player.on('error', (e) => errors.push(e));
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(ctx.video, 'loadedmetadata');
    mediaError(ctx.video, 4);
    expect(await p).toMatchObject({ ok: false, reason: 'video', code: 'M4' });
    expect(ctx.deps.request.mock.calls.filter((c) => c[0] === 'POST').length).toBe(1);
    expect(errors.length).toBe(1);
  });

  it('Browser ohne HEVC (Profil schon ts): kein zweiter Versuch', async () => {
    const ctx = setup({ respond: hlsRespond(), hevc: false });
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(ctx.video, 'loadedmetadata');
    mediaError(ctx.video, 4);
    expect((await p).reason).toBe('video');
    expect(ctx.deps.request.mock.calls.filter((c) => c[0] === 'POST').length).toBe(1);
  });

  it('play()-NotSupportedError im HLS-Modus löst den Rückfall ebenfalls aus', async () => {
    const ctx = setup({ respond: hlsRespond() });
    ctx.video.play = vi.fn()
      .mockImplementationOnce(() => Promise.reject(Object.assign(new Error('x'), { name: 'NotSupportedError' })))
      .mockReturnValue(Promise.resolve());
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(ctx.video, 'loadedmetadata');
    await flush();
    fire(ctx.video, 'loadedmetadata');
    fire(ctx.video, 'playing');
    expect((await p).ok).toBe(true);
    expect(ctx.deps.request.mock.calls.filter((c) => c[0] === 'POST').length).toBe(2);
  });

  it('Direktwiedergabe: kein Rückfall, Code M4', async () => {
    const ctx = setup({ respond: () => info(ms()) });
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    fire(ctx.video, 'loadedmetadata');
    mediaError(ctx.video, 4);
    expect(await p).toMatchObject({ reason: 'video', code: 'M4' });
    expect(ctx.deps.request.mock.calls.filter((c) => c[0] === 'POST').length).toBe(1);
  });
});

describe('Fehlercodes in resolveStream', () => {
  const run = (m, v = makeVideo()) => resolveStream({ deps: makeDeps({ respond: () => info(m) }), video: v, itemId: 'it1' });
  const t = (reasons) => ms({ direct: false, transcodingUrl: hlsUrl(`&TranscodeReasons=${reasons}`) });
  it('Gründe → Kurzcodes', async () => {
    expect((await run(t('VideoCodecNotSupported'))).code).toBe('V-CODEC');
    expect((await run(t('VideoRangeTypeNotSupported'))).code).toBe('V-RANGE');
    expect((await run(t('VideoBitDepthNotSupported'))).code).toBe('V-10BIT');
    expect((await run(t('SubtitleCodecNotSupported'))).code).toBe('V-SUB');
    expect((await run(t('RefFramesNotSupported'))).code).toBe('V-OTHER');
    expect((await run(ms({ direct: false }))).code).toBe('V-NOURL');
    expect((await run(t('AudioCodecNotSupported'), makeVideo({ hls: false }))).code).toBe('B-HLS');
  });
  it('Ton ohne Transcoding → A-CODEC; Codes enthalten keine URL', async () => {
    const ac3 = ms({ direct: false, streams: [{ Index: 0, Type: 'Video', Codec: 'h264' }, { Index: 1, Type: 'Audio', Codec: 'ac3', IsDefault: true }] });
    const r = await run(ac3);
    expect(r).toEqual({ ok: false, mode: 'none', reason: 'audio', code: 'A-CODEC' });
  });
  it('HLS-Erfolg trägt videoCodec und offeredHevc', async () => {
    const r = await run(t('ContainerNotSupported'), makeVideo({ hevc: true }));
    expect(r).toMatchObject({ ok: true, mode: 'hls', videoCodec: 'h264', offeredHevc: true });
  });
});

describe('Profil: Ton und noHevc', () => {
  it('Safari (ac-3/ec-3 per canPlayType): HLS-Ton aac,ac3,eac3 mit 6 Kanälen, Direktprofile ebenso', () => {
    const p = buildDeviceProfile(makeVideo({ ac3: true }));
    expect(p.TranscodingProfiles[0]).toMatchObject({ AudioCodec: 'aac,ac3,eac3', MaxAudioChannels: '6' });
    for (const d of p.DirectPlayProfiles) expect(d.AudioCodec).toBe('aac,mp3,ac3,eac3');
  });
  it('ohne ac3/eac3: nur aac, 2 Kanäle', () => {
    const p = buildDeviceProfile(makeVideo());
    expect(p.TranscodingProfiles[0]).toMatchObject({ AudioCodec: 'aac', MaxAudioChannels: '2' });
  });
  it('noHevc: ts/h264 trotz HEVC-Fähigkeit', () => {
    const p = buildDeviceProfile(makeVideo({ hevc: true }), { noHevc: true });
    expect(p.TranscodingProfiles[0]).toMatchObject({ Container: 'ts', VideoCodec: 'h264' });
    expect(p.DirectPlayProfiles.every((d) => d.VideoCodec === 'h264')).toBe(true);
  });
});

describe('prefetch und Cache', () => {

  it('Direct-Ergebnis wird gecacht: play() nach prefetch macht keine zweite Anfrage', async () => {
    const ctx = setup({ respond: () => info(ms()) });
    await ctx.player.prefetch('it1');
    expect(ctx.deps.request).toHaveBeenCalledTimes(1);
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    expect(ctx.deps.request).toHaveBeenCalledTimes(1);
    expect(ctx.video.getAttribute('src')).toContain('/Videos/it1/stream?');
    fire(ctx.video, 'loadedmetadata');
    fire(ctx.video, 'playing');
    expect(await p).toEqual({ ok: true, mode: 'direct' });
  });

  it('play() wartet auf eine laufende prefetch-Auflösung statt doppelt anzufragen', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const ctx = setup({ respond: async () => { await gate; return info(ms()); } });
    const pf = ctx.player.prefetch('it1');
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    release();
    await pf;
    await flush();
    expect(ctx.deps.request).toHaveBeenCalledTimes(1);
    fire(ctx.video, 'loadedmetadata');
    fire(ctx.video, 'playing');
    expect((await p).ok).toBe(true);
  });

  it('HLS-Ergebnis wird nie wiederverwendet: play() holt frisch (TranscodingUrl/PlaySessionId neu)', async () => {
    let n = 0;
    const ctx = setup({ respond: () => { n++; return info(ms({ direct: false, transcodingUrl: hlsUrl('&TranscodeReasons=ContainerNotSupported') }), { PlaySessionId: `ps${n}` }); } });
    await ctx.player.prefetch('it1');
    expect(n).toBe(1);
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    expect(n).toBe(2);
    fire(ctx.video, 'loadedmetadata');
    fire(ctx.video, 'playing');
    await p;
    await ctx.player.stop();
    const del = ctx.deps.request.mock.calls.find((c) => c[0] === 'DELETE');
    expect(del[2].params.playSessionId).toBe('ps2');
  });

  it('Cache läuft nach 10 min ab; abgebrochene prefetch-Anfrage cached nichts', async () => {
    let t = 1000000;
    const video = makeVideo();
    const deps = makeDeps({ respond: () => info(ms()) });
    const player = createPlayer({ video, deps, now: () => t });
    await player.prefetch('it1');
    t += 11 * 60 * 1000;
    const p = player.play({ itemId: 'it1', offsetMs: 0 });
    await flush();
    expect(deps.request).toHaveBeenCalledTimes(2);
    fire(video, 'loadedmetadata');
    fire(video, 'playing');
    await p;
    const ac = new AbortController();
    ac.abort();
    const d2 = makeDeps({ respond: () => { throw new Error('x'); } });
    const p2 = createPlayer({ video: makeVideo(), deps: d2 });
    expect((await p2.prefetch('z', { signal: ac.signal })).ok).toBe(false);
  });

  it('Tonspur-Wechsel (audioIndex) umgeht den Cache', async () => {
    const ctx = setup({ respond: (m, p, o) => (o.body.AudioStreamIndex === 2 ? info(ms({ direct: false, transcodingUrl: hlsUrl('&AudioStreamIndex=2') })) : info(ms())) });
    await ctx.player.prefetch('it1');
    ctx.deps.request.mockClear();
    const p = ctx.player.play({ itemId: 'it1', offsetMs: 0, audioIndex: 2 });
    await flush();
    expect(ctx.deps.request).toHaveBeenCalled();
    ctx.player.stop();
    await p;
  });
});
