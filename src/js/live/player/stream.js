// LENZ LIVE Player: Stream-Auflösung (PlaybackInfo → direkt / HLS-Remux / nicht empfangbar).
// Stream-URLs enthalten das Token: nie loggen, nie in Fehlertexte oder Ereignisse.
import { buildDeviceProfile, canHls } from './profile.js';
import { buildTracks, pickAudio, serverDefaultAudio, isPlainAudioCodec } from './tracks.js';

export const VIDEO_REASONS = new Set([
  'VideoCodecNotSupported', 'VideoProfileNotSupported', 'VideoLevelNotSupported', 'VideoResolutionNotSupported',
  'VideoBitDepthNotSupported', 'VideoFramerateNotSupported', 'RefFramesNotSupported', 'AnamorphicVideoNotSupported',
  'InterlacedVideoNotSupported', 'VideoBitrateNotSupported', 'VideoRangeTypeNotSupported', 'VideoCodecTagNotSupported',
  'ContainerBitrateExceedsLimit', 'SubtitleCodecNotSupported',
]);

const fail = (reason) => ({ ok: false, mode: 'none', reason });

function reasonsOf(ms) {
  const out = [];
  const add = (v) => {
    const list = Array.isArray(v) ? v : String(v || '').split(',');
    for (const r of list) { const t = String(r).trim(); if (t) out.push(t); }
  };
  add(ms.TranscodeReasons);
  if (ms.TranscodingUrl) {
    try { add(new URL(ms.TranscodingUrl, 'http://x.invalid').searchParams.get('TranscodeReasons')); } catch { /* ignorieren */ }
  }
  return out;
}

function absolute(deps, rel) {
  let origin = '';
  try { origin = new URL(deps.streamUrl('/')).origin; } catch { /* Fallback unten */ }
  try { return new URL(rel, origin || undefined).href; } catch { return null; }
}

/**
 * → { ok, mode:'direct'|'hls'|'none', reason?, url?, playSessionId?, mediaSource?, mediaSourceId?, audioIndex?, tracks? }
 * audioIndex (optional): gewünschte Tonspur; weicht sie vom Server-Standard ab, wird per Remux umgeschaltet.
 */
export async function resolveStream({ deps, video, itemId, audioIndex, signal }) {
  const post = async (extra) => {
    const body = {
      UserId: deps.user.id,
      DeviceProfile: buildDeviceProfile(video),
      StartTimeTicks: 0,
      SubtitleStreamIndex: -1,
      EnableDirectPlay: true,
      EnableDirectStream: true,
      EnableTranscoding: true,
      AllowVideoStreamCopy: true,
      AllowAudioStreamCopy: true,
      AutoOpenLiveStream: false,
      ...extra,
    };
    return deps.request('POST', `/Items/${encodeURIComponent(itemId)}/PlaybackInfo`, { params: { userId: deps.user.id }, body, signal });
  };
  try {
    let info = await post({});
    const sources = info && Array.isArray(info.MediaSources) ? info.MediaSources : [];
    if (!sources.length) return fail(info && info.ErrorCode ? 'video' : 'network');
    const first = sources[0];
    const tr = buildTracks(first);
    const def = serverDefaultAudio(first, tr.audio);
    const want = tr.audio.some((a) => a.index === audioIndex) ? audioIndex : pickAudio(tr.audio, def, deps.user);
    const remux = want != null && def != null && want !== def;
    let ms = first;
    if (remux) {
      info = await post({ AudioStreamIndex: want, MediaSourceId: first.Id, EnableDirectPlay: false });
      const list = info && Array.isArray(info.MediaSources) ? info.MediaSources : [];
      ms = list.find((s) => s.Id === first.Id) || list[0];
      if (!ms) return fail('network');
    }
    const audioIdx = want != null ? want : def;
    const base = { mediaSource: ms, mediaSourceId: ms.Id, playSessionId: info.PlaySessionId, audioIndex: audioIdx, tracks: tr };

    if (ms.SupportsDirectPlay && !remux) {
      const url = deps.streamUrl(`/Videos/${encodeURIComponent(itemId)}/stream`, { static: true, MediaSourceId: ms.Id });
      return { ok: true, mode: 'direct', url, ...base };
    }
    const reasons = reasonsOf(ms);
    if (reasons.some((r) => VIDEO_REASONS.has(r))) return fail('video');
    // Schutz: Einbrennen von Untertiteln wäre eine Video-Umwandlung.
    if (ms.TranscodingUrl && /[?&]SubtitleMethod=Encode(?:&|$)/i.test(ms.TranscodingUrl)) return fail('video');
    if (!ms.TranscodingUrl) {
      const a = tr.audio.find((x) => x.index === audioIdx);
      return fail(a && !isPlainAudioCodec(a.codec) ? 'audio' : 'video');
    }
    if (!canHls(video)) return fail('browser');
    const url = absolute(deps, ms.TranscodingUrl);
    if (!url) return fail('network');
    return { ok: true, mode: 'hls', url, ...base };
  } catch {
    return fail(signal && signal.aborted ? 'aborted' : 'network');
  }
}
