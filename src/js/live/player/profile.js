// LENZ LIVE Player: DeviceProfile aus den Fähigkeiten des Browsers (nur was wirklich abspielbar ist).
const MKV = 'video/x-matroska; codecs="avc1.64001f, mp4a.40.2"';
const MP4 = 'video/mp4; codecs="avc1.64001f, mp4a.40.2"';
const HEVC_MP4 = 'video/mp4; codecs="hvc1.1.6.L120.90"';
const HEVC_MKV = 'video/x-matroska; codecs="hvc1.1.6.L120.90"';
const HLS ='application/vnd.apple.mpegurl';
const AC3 = 'audio/mp4; codecs="ac-3"';
const EAC3 = 'audio/mp4; codecs="ec-3"';

function can(video, type) {
  try { return !!(video && typeof video.canPlayType === 'function' && video.canPlayType(type)); } catch { return false; }
}

/** Spielt der Browser HLS nativ? (kein hls.js) */
export function canHls(video) { return can(video, HLS); }

/** Spielt der Browser HEVC? (MediaSource oder canPlayType; Safari/iOS hat oft kein MediaSource) */
export function canHevc(video) {
  try {
    if (typeof MediaSource !== 'undefined' && MediaSource && typeof MediaSource.isTypeSupported === 'function'
      && MediaSource.isTypeSupported(HEVC_MP4)) return true;
  } catch { /* weiter */ }
  return can(video, HEVC_MP4);
}

/** Zusätzliche Ton-Codecs (Safari: AC-3/E-AC-3), nur wenn canPlayType sie bejaht. */
export function extraAudioCodecs(video) {
  const out = [];
  if (can(video, AC3)) out.push('ac3');
  if (can(video, EAC3)) out.push('eac3');
  return out;
}

// Alle Untertitelformate als External melden: sonst brennt der Server Formate ohne Profil ein (Video-Umwandlung),
// auch bei SubtitleStreamIndex -1. Angezeigt werden weiterhin nur Text-Untertitel (tracks.js).
const SUB_FORMATS = ['vtt', 'srt', 'subrip', 'ass', 'ssa', 'pgssub', 'dvdsub', 'dvbsub', 'sub'];

/** opts.noHevc: HEVC nicht anbieten (Rückfall auf ts/h264, wenn fMP4-HLS im <video> scheitert). */
export function buildDeviceProfile(video, opts = {}) {
  const hevc = !(opts && opts.noHevc) && canHevc(video);
  const extra = extraAudioCodecs(video);
  const directAudio = ['aac', 'mp3', ...extra].join(',');
  const direct = [];
  if (can(video, MKV)) {
    direct.push({ Container: 'mkv', Type: 'Video', VideoCodec: hevc && can(video, HEVC_MKV) ? 'h264,hevc' : 'h264', AudioCodec: directAudio });
  }
  if (can(video, MP4) || hevc) {
    direct.push({ Container: 'mp4,m4v', Type: 'Video', VideoCodec: hevc ? 'h264,hevc' : 'h264', AudioCodec: directAudio });
  }
  return {
    Name: 'LenzLive',
    MaxStreamingBitrate: 120000000,
    MaxStaticBitrate: 100000000,
    DirectPlayProfiles: direct,
    TranscodingProfiles: [{
      Container: hevc ? 'mp4' : 'ts', Type: 'Video', Protocol: 'hls', Context: 'Streaming',
      VideoCodec: hevc ? 'hevc,h264' : 'h264', AudioCodec: ['aac', ...extra].join(','),
      MaxAudioChannels: extra.length ? '6' : '2', BreakOnNonKeyFrames: true, MinSegments: 1,
    }],
    SubtitleProfiles: SUB_FORMATS.map((Format) => ({ Format, Method: 'External' })),
  };
}
