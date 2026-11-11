// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { resolveStream } from '../src/js/live/player/stream.js';
import { buildDeviceProfile } from '../src/js/live/player/profile.js';
import { buildTracks, pickAudio, pickSubtitle, serverDefaultAudio } from '../src/js/live/player/tracks.js';
import { makeVideo, makeDeps, ms, info, hlsUrl, SECRET } from './live-player-helpers.js';

const resolve = (deps, video, extra = {}) => resolveStream({ deps, video, itemId: 'it1', ...extra });

describe('DeviceProfile', () => {
  it('Chrome-Profil: mkv und mp4 direkt, HLS-Transcoding mit h264/aac/2 Kanälen', () => {
    const p = buildDeviceProfile(makeVideo());
    expect(p.MaxStreamingBitrate).toBe(120000000);
    expect(p.MaxStaticBitrate).toBe(100000000);
    expect(p.DirectPlayProfiles.map((d) => d.Container)).toEqual(['mkv', 'mp4,m4v']);
    expect(p.DirectPlayProfiles[0]).toMatchObject({ VideoCodec: 'h264', AudioCodec: 'aac,mp3' });
    expect(p.TranscodingProfiles).toEqual([{
      Container: 'ts', Type: 'Video', Protocol: 'hls', Context: 'Streaming', VideoCodec: 'h264', AudioCodec: 'aac',
      MaxAudioChannels: '2', BreakOnNonKeyFrames: true, MinSegments: 1,
    }]);
    expect(p.DirectPlayProfiles[0].VideoCodec).toBe('h264');
  });
  it('SubtitleProfiles: alle Formate (auch dvdsub, pgssub) als External', () => {
    const p = buildDeviceProfile(makeVideo());
    for (const f of ['vtt', 'srt', 'subrip', 'ass', 'ssa', 'pgssub', 'dvdsub', 'dvbsub', 'sub']) {
      expect(p.SubtitleProfiles).toContainEqual({ Format: f, Method: 'External' });
    }
    expect(p.SubtitleProfiles.every((s) => s.Method === 'External')).toBe(true);
  });
  it('mit HEVC: h264,hevc direkt, fMP4-HLS mit hevc,h264', () => {
    const p = buildDeviceProfile(makeVideo({ hevc: true }));
    expect(p.DirectPlayProfiles).toMatchObject([
      { Container: 'mkv', VideoCodec: 'h264,hevc' }, { Container: 'mp4,m4v', VideoCodec: 'h264,hevc' },
    ]);
    expect(p.TranscodingProfiles[0]).toMatchObject({ Container: 'mp4', Protocol: 'hls', VideoCodec: 'hevc,h264', AudioCodec: 'aac' });
  });
  it('HEVC nur in mp4 (mkv+hvc1 leer): mkv bleibt h264, mp4 bekommt hevc', () => {
    const p = buildDeviceProfile(makeVideo({ hevc: true, hevcMkv: false }));
    expect(p.DirectPlayProfiles).toMatchObject([
      { Container: 'mkv', VideoCodec: 'h264' }, { Container: 'mp4,m4v', VideoCodec: 'h264,hevc' },
    ]);
  });
  it('ohne HEVC: ts/h264', () => {
    const p = buildDeviceProfile(makeVideo({ hevc: false }));
    expect(p.TranscodingProfiles[0]).toMatchObject({ Container: 'ts', VideoCodec: 'h264' });
  });
  it('Safari-Profil: kein mkv', () => {
    const p = buildDeviceProfile(makeVideo({ mkv: false }));
    expect(p.DirectPlayProfiles.map((d) => d.Container)).toEqual(['mp4,m4v']);
  });
});

describe('resolveStream', () => {
  it('direkt (Chrome): PlaybackInfo-Body und static-URL', async () => {
    const deps = makeDeps({ respond: () => info(ms()) });
    const r = await resolve(deps, makeVideo());
    expect(r).toMatchObject({ ok: true, mode: 'direct', mediaSourceId: 'ms1', playSessionId: 'ps1' });
    expect(deps.streamUrl).toHaveBeenCalledWith('/Videos/it1/stream', { static: true, MediaSourceId: 'ms1' });
    expect(r.url).toContain('/Videos/it1/stream?');
    expect(deps.request).toHaveBeenCalledTimes(1);
    const [method, path, opts] = deps.request.mock.calls[0];
    expect([method, path]).toEqual(['POST', '/Items/it1/PlaybackInfo']);
    expect(opts.params).toEqual({ userId: 'u1' });
    expect(opts.body).toMatchObject({
      UserId: 'u1', StartTimeTicks: 0, SubtitleStreamIndex: -1, EnableDirectPlay: true, EnableDirectStream: true,
      EnableTranscoding: true, AllowVideoStreamCopy: true, AllowAudioStreamCopy: true, AutoOpenLiveStream: false,
    });
    expect(opts.body.DeviceProfile.DirectPlayProfiles.length).toBe(2);
  });

  it('mkv nicht abspielbar (Safari-Profil) → HLS, URL gegen Serveradresse aufgelöst, kein StartTimeTicks', async () => {
    const deps = makeDeps({ respond: () => info(ms({ direct: false, transcodingUrl: hlsUrl('&TranscodeReasons=ContainerNotSupported') })) });
    const r = await resolve(deps, makeVideo({ mkv: false }));
    expect(r.ok).toBe(true);
    expect(r.mode).toBe('hls');
    expect(r.url.startsWith('http://srv:8096/videos/it1/master.m3u8?')).toBe(true);
    expect(r.url).not.toMatch(/StartTimeTicks/i);
    expect(r.playSessionId).toBe('ps1');
    const body = deps.request.mock.calls[0][2].body;
    expect(body.DeviceProfile.DirectPlayProfiles.map((d) => d.Container)).toEqual(['mp4,m4v']);
  });

  it('HEVC mit VideoCodecNotSupported → none/video', async () => {
    const deps = makeDeps({ respond: () => info(ms({ direct: false, transcodingUrl: hlsUrl('&TranscodeReasons=VideoCodecNotSupported,AudioCodecNotSupported') })) });
    expect(await resolve(deps, makeVideo())).toEqual({ ok: false, mode: 'none', reason: 'video' });
  });

  it('Video-Grund im Feld TranscodeReasons (Array) → none/video', async () => {
    const deps = makeDeps({ respond: () => info(ms({ direct: false, transcodingUrl: hlsUrl(), reasons: ['VideoBitDepthNotSupported'] })) });
    expect((await resolve(deps, makeVideo())).reason).toBe('video');
  });

  it('SubtitleMethod=Encode in der TranscodingUrl (Groß-/Kleinschreibung egal) → none/video', async () => {
    for (const q of ['&SubtitleMethod=Encode', '&subtitlemethod=encode']) {
      const deps = makeDeps({ respond: () => info(ms({ direct: false, transcodingUrl: hlsUrl(`&TranscodeReasons=AudioCodecNotSupported${q}`) })) });
      expect(await resolve(deps, makeVideo())).toEqual({ ok: false, mode: 'none', reason: 'video' });
    }
  });

  it('nur AudioCodecNotSupported + SegmentContainer=mp4 → hls', async () => {
    const deps = makeDeps({ respond: () => info(ms({ direct: false, transcodingUrl: hlsUrl('&SegmentContainer=mp4&VideoCodec=hevc,h264&TranscodeReasons=AudioCodecNotSupported') })) });
    const r = await resolve(deps, makeVideo({ hevc: true }));
    expect(r).toMatchObject({ ok: true, mode: 'hls' });
    expect(r.url).toContain('SegmentContainer=mp4');
  });

  it('kein natives HLS → browser', async () => {
    const deps = makeDeps({ respond: () => info(ms({ direct: false, transcodingUrl: hlsUrl('&TranscodeReasons=AudioCodecNotSupported') })) });
    expect(await resolve(deps, makeVideo({ hls: false }))).toEqual({ ok: false, mode: 'none', reason: 'browser' });
  });

  it('fehlende TranscodingUrl + AC3 → audio; bei aac → video', async () => {
    const ac3 = ms({ direct: false, streams: [
      { Index: 0, Type: 'Video', Codec: 'h264' }, { Index: 1, Type: 'Audio', Codec: 'ac3', Language: 'eng', IsDefault: true },
    ] });
    let deps = makeDeps({ respond: () => info(ac3) });
    expect((await resolve(deps, makeVideo())).reason).toBe('audio');
    deps = makeDeps({ respond: () => info(ms({ direct: false })) });
    expect((await resolve(deps, makeVideo())).reason).toBe('video');
  });

  it('HTTP-Fehler / leere Antwort → network, Abbruch → aborted', async () => {
    let deps = makeDeps({ respond: () => { throw new Error(`HTTP 500 http://srv/?ApiKey=${SECRET}`); } });
    const r = await resolve(deps, makeVideo());
    expect(r).toEqual({ ok: false, mode: 'none', reason: 'network' });
    expect(JSON.stringify(r)).not.toContain(SECRET);
    deps = makeDeps({ respond: () => null });
    expect((await resolve(deps, makeVideo())).reason).toBe('network');
    const ac = new AbortController();
    ac.abort();
    deps = makeDeps({ respond: () => { throw new Error('x'); } });
    expect((await resolve(deps, makeVideo(), { signal: ac.signal })).reason).toBe('aborted');
  });

  it('Nutzersprache ger wählt Spur 2 (Nicht-Standard) → zweiter Request mit AudioStreamIndex und EnableDirectPlay:false', async () => {
    const calls = [];
    const deps = makeDeps({
      user: { audioLang: 'deu' },
      respond: (m, p, o) => {
        calls.push(o.body);
        return o.body.AudioStreamIndex === 2
          ? info(ms({ direct: false, transcodingUrl: hlsUrl('&AudioStreamIndex=2&TranscodeReasons=DirectPlayError') }))
          : info(ms());
      },
    });
    const r = await resolve(deps, makeVideo());
    expect(calls.length).toBe(2);
    expect(calls[1]).toMatchObject({ AudioStreamIndex: 2, MediaSourceId: 'ms1', EnableDirectPlay: false, SubtitleStreamIndex: -1 });
    expect(r).toMatchObject({ ok: true, mode: 'hls', audioIndex: 2 });
  });

  it('explizit gewählte Standardspur bleibt direkt', async () => {
    const deps = makeDeps({ user: { audioLang: 'ger' }, respond: () => info(ms()) });
    const r = await resolve(deps, makeVideo(), { audioIndex: 1 });
    expect(r.mode).toBe('direct');
    expect(deps.request).toHaveBeenCalledTimes(1);
  });
});

describe('Spuren', () => {
  const src = ms();
  it('Filter: nur Text-Untertitel, Bild-Untertitel (PGS) raus', () => {
    const t = buildTracks(src);
    expect(t.audio.map((a) => a.index)).toEqual([1, 2]);
    expect(t.subs.map((s) => s.index)).toEqual([3, 5]);
    expect(t.audio[0]).toMatchObject({ label: 'English - AAC', lang: 'eng', isDefault: true });
    expect(t.subs[1].forced).toBe(true);
  });
  it('Standard-Audio: Sprache (ger = deu) sonst Server-Standard', () => {
    const t = buildTracks(src);
    expect(serverDefaultAudio(src, t.audio)).toBe(1);
    expect(pickAudio(t.audio, 1, { audioLang: 'deu' })).toBe(2);
    expect(pickAudio(t.audio, 1, { audioLang: 'ger' })).toBe(2);
    expect(pickAudio(t.audio, 1, { audioLang: 'fra' })).toBe(1);
    expect(pickAudio(t.audio, 1, {})).toBe(1);
  });
  it('Untertitel-Standard nach subMode', () => {
    const { subs } = buildTracks(src);
    expect(pickSubtitle(subs, { subMode: 'Always', subLang: 'ger' })).toBe(3);
    expect(pickSubtitle(subs, { subMode: 'Always', subLang: 'jpn' })).toBe(-1);
    expect(pickSubtitle(subs, { subMode: 'OnlyForced', subLang: 'eng' })).toBe(5);
    expect(pickSubtitle(subs, { subMode: 'OnlyForced', subLang: '' })).toBe(5);
    expect(pickSubtitle(subs, { subMode: 'Default', subLang: 'ger' })).toBe(-1);
    expect(pickSubtitle(subs, {})).toBe(-1);
  });
});
