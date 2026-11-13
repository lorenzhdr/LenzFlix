// LENZ LIVE Player: Stream-Auflösung (PlaybackInfo → direkt / HLS-Remux / nicht empfangbar).
// Stream-URLs enthalten das Token: nie loggen, nie in Fehlertexte oder Ereignisse.
import { buildDeviceProfile, canHls, canHevc } from './profile.js';
import { buildTracks, pickAudio, serverDefaultAudio, isPlainAudioCodec } from './tracks.js';

export const VIDEO_REASONS = new Set([
  'VideoCodecNotSupported', 'VideoProfileNotSupported', 'VideoLevelNotSupported', 'VideoResolutionNotSupported',
  'VideoBitDepthNotSupported', 'VideoFramerateNotSupported', 'RefFramesNotSupported', 'AnamorphicVideoNotSupported',
  'InterlacedVideoNotSupported', 'VideoBitrateNotSupported', 'VideoRangeTypeNotSupported', 'VideoCodecTagNotSupported',
  'ContainerBitrateExceedsLimit', 'SubtitleCodecNotSupported',
]);

const fail = (reason, code) => (code ? { ok: false, mode: 'none', reason, code } : { ok: false, mode: 'none', reason });

// Kurzcodes für die Fehlerkarte (nie URL/Token): V-* Video, A-* Ton, B-* Browser, NET/TIMEOUT, M<n> = MediaError am <video>.
const CODE_BY_REASON = [
  ['VideoCodecNotSupported', 'V-CODEC'], ['VideoCodecTagNotSupported', 'V-CODEC'], ['VideoProfileNotSupported', 'V-CODEC'],
  ['VideoRangeTypeNotSupported', 'V-RANGE'], ['VideoBitDepthNotSupported', 'V-10BIT'], ['SubtitleCodecNotSupported', 'V-SUB'],
];
function videoCode(reasons) {
  for (const [r, c] of CODE_BY_REASON) if (reasons.includes(r)) return c;
  return 'V-OTHER';
}

const videoOf = (ms) => (ms && ms.MediaStreams || []).find((s) => s && s.Type === 'Video');
function videoCodecOf(ms) {
  const v = videoOf(ms);
  return v && v.Codec ? String(v.Codec).toLowerCase() : '';
}

/** HDR-Kennzeichnung des Videostreams: 'HDR10', 'HLG', 'DOVI…' usw.; '' bei SDR/unbekannt. */
function rangeOf(v) {
  const t = String(v.VideoRangeType || '');
  if (/^(HDR|HLG|DOVI)/i.test(t)) return short(t, 16).toUpperCase();
  if (/smpte2084/i.test(v.ColorTransfer || '')) return 'HDR10';
  if (/arib-std-b67/i.test(v.ColorTransfer || '')) return 'HLG';
  return String(v.VideoRange || '').toUpperCase() === 'HDR' ? 'HDR' : '';
}

/** Für Apple-/Browser-Decoder bekannt ungeeignetes Bildformat (h264 10 Bit/4:2:2/4:4:4/Level > 5.2, Breite > 4096) → kurzer Grund oder null. */
export function videoFormatHint(ms) {
  const v = videoOf(ms);
  if (!v) return null;
  const prof = String(v.Profile || '').toLowerCase();
  const pf = String(v.PixelFormat || '').toLowerCase();
  const bd = Number(v.BitDepth) || 0;
  const lv = Number(v.Level) || 0;
  const w = Number(v.Width) || 0;
  if (videoCodecOf(ms) === 'h264') {
    if (bd > 8 || /high ?10|hi10/.test(prof)) return `Bildformat h264 ${bd > 8 ? bd : 10} Bit`;
    if (/4:2:2/.test(prof) || /422/.test(pf)) return 'Bildformat h264 4:2:2';
    if (/4:4:4/.test(prof) || /444/.test(pf)) return 'Bildformat h264 4:4:4';
    if (pf && !/420|nv12|nv21/.test(pf)) return `Bildformat h264 ${short(pf)}`;
    const hdr = rangeOf(v);
    if (hdr) return `Bildformat h264 ${hdr === 'HLG' ? 'HLG' : 'HDR'}`;
    if (lv > 52) return `Bildformat h264 Level ${(lv / 10).toFixed(1)}`;
  }
  return w > 4096 ? `Auflösung ${w}×${Number(v.Height) || '?'}` : null;
}

/** Dateiinfos für die Messanzeige, z. B. „High 10 L5.1 10 Bit 3840×1600“ (fehlende Werte entfallen). */
function formatInfo(ms) {
  const v = videoOf(ms);
  if (!v) return '';
  const lv = Number(v.Level) || 0;
  const pf = String(v.PixelFormat || '').toLowerCase();
  const w = Number(v.Width) || 0;
  const h = Number(v.Height) || 0;
  return [
    v.Profile ? String(v.Profile).replace(/[^\w :.-]/g, '').slice(0, 16) : '',
    lv > 0 ? `L${videoCodecOf(ms) === 'h264' ? +(lv / 10).toFixed(1) : lv}` : '',
    Number(v.BitDepth) > 0 ? `${Number(v.BitDepth)} Bit` : '',
    pf && !/^yuvj?420p(10|12)?(le|be)?$/.test(pf) ? short(pf, 12) : '',
    w && h ? `${w}×${h}` : '',
    v.IsInterlaced ? 'interlaced' : '',
    rangeOf(v),
  ].filter(Boolean).join(' ');
}

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

/** Kurzinfo zur Quelle für die Messanzeige: { container, v, a, reasons } (nur Kürzel, nie URL/Token/Pfade). */
const short = (x, n = 12) => String(x == null ? '' : x).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, n);
function sourceInfo(ms, audioIdx, reasons) {
  const a = (ms.MediaStreams || []).find((s) => s && s.Type === 'Audio' && s.Index === audioIdx);
  return {
    container: short(String(ms.Container || '').split(',')[0]),
    v: short(videoCodecOf(ms)),
    a: short(a && a.Codec),
    fmt: formatInfo(ms),
    reasons: reasons.slice(0, 2).map((r) => String(r).replace(/NotSupported$/, '').replace(/[^A-Za-z0-9]/g, '').slice(0, 24)).filter(Boolean),
  };
}


function absolute(deps, rel) {
  let origin = '';
  try { origin = new URL(deps.streamUrl('/')).origin; } catch { /* Fallback unten */ }
  try { return new URL(rel, origin || undefined).href; } catch { return null; }
}

/**
 * → { ok, mode:'direct'|'hls'|'none', reason?, url?, playSessionId?, mediaSource?, mediaSourceId?, audioIndex?, tracks? }
 * audioIndex (optional): gewünschte Tonspur; weicht sie vom Server-Standard ab, wird per Remux umgeschaltet.
 * noHevc (optional): Profil ohne HEVC (ts/h264) – Rückfall, wenn fMP4-HLS im <video> scheiterte.
 * noDirect (optional): keine Direktwiedergabe (leere DirectPlayProfiles, EnableDirectPlay false) → Remux (Rückfall, wenn Direct im <video> scheiterte).
 * Erfolg trägt `info` (Kürzel für die Messanzeige). Fehler tragen zusätzlich `code` (Kurzcode); Erfolg bei HLS trägt `videoCodec` und `offeredHevc`.
 */
export async function resolveStream({ deps, video, itemId, audioIndex, signal, noHevc = false, noDirect = false }) {
  const post = async (extra) => {
    const body = {
      UserId: deps.user.id,
      DeviceProfile: buildDeviceProfile(video, { noHevc, noDirect }),
      StartTimeTicks: 0,
      SubtitleStreamIndex: -1,
      EnableDirectPlay: !noDirect,
      EnableDirectStream: true,
      EnableTranscoding: true,
      AllowVideoStreamCopy: true,
      AllowAudioStreamCopy: true,
      AutoOpenLiveStream: false,
      ...extra,
    };
    if (body.SubtitleStreamIndex === undefined) delete body.SubtitleStreamIndex;
    return deps.request('POST', `/Items/${encodeURIComponent(itemId)}/PlaybackInfo`, { params: { userId: deps.user.id }, body, signal });
  };
  try {
    let info = await post({});
    const sources = info && Array.isArray(info.MediaSources) ? info.MediaSources : [];
    if (!sources.length) return info && info.ErrorCode ? fail('video', 'V-NOSRC') : fail('network', 'NET');
    const first = sources[0];
    const tr = buildTracks(first);
    const def = serverDefaultAudio(first, tr.audio);
    const want = tr.audio.some((a) => a.index === audioIndex) ? audioIndex : pickAudio(tr.audio, def, deps.user);
    const remux = want != null && def != null && want !== def;
    let ms = first;
    if (remux) {
      // MediaSourceId ist nötig, sonst ignoriert der Server AudioStreamIndex (liefert die Standardspur). Zusammen mit
      // SubtitleStreamIndex -1 brennt Jellyfin aber die erzwungene Standard-Untertitelspur ein (SubtitleMethod=Encode → V-SUB);
      // ohne SubtitleStreamIndex nicht (live geprüft 13.11.2026, Babylon Berlin + 24 Titel mit Untertiteln).
      info = await post({ AudioStreamIndex: want, MediaSourceId: first.Id, EnableDirectPlay: false, SubtitleStreamIndex: undefined });
      const list = info && Array.isArray(info.MediaSources) ? info.MediaSources : [];
      ms = list.find((s) => s.Id === first.Id) || list[0];
      if (!ms) return fail('network', 'NET');
    }
    const audioIdx = want != null ? want : def;
    const reasons0 = ms.SupportsDirectPlay && !remux && !noDirect ? [] : reasonsOf(ms);
    const base = { mediaSource: ms, mediaSourceId: ms.Id, playSessionId: info.PlaySessionId, audioIndex: audioIdx, tracks: tr, info: sourceInfo(ms, audioIdx, reasons0) };

    if (ms.SupportsDirectPlay && !remux && !noDirect) {
      const url = deps.streamUrl(`/Videos/${encodeURIComponent(itemId)}/stream`, { static: true, MediaSourceId: ms.Id });
      return { ok: true, mode: 'direct', url, ...base };
    }
    const reasons = reasonsOf(ms);
    if (reasons.some((r) => VIDEO_REASONS.has(r))) return fail('video', videoCode(reasons));
    // Schutz: Einbrennen von Untertiteln wäre eine Video-Umwandlung.
    if (ms.TranscodingUrl && /[?&]SubtitleMethod=Encode(?:&|$)/i.test(ms.TranscodingUrl)) return fail('video', 'V-SUB');
    if (!ms.TranscodingUrl) {
      const a = tr.audio.find((x) => x.index === audioIdx);
      return a && !isPlainAudioCodec(a.codec) ? fail('audio', 'A-CODEC') : fail('video', 'V-NOURL');
    }
    if (!canHls(video)) return fail('browser', 'B-HLS');
    const url = absolute(deps, ms.TranscodingUrl);
    if (!url) return fail('network', 'NET');
    return { ok: true, mode: 'hls', url, videoCodec: videoCodecOf(ms), offeredHevc: !noHevc && canHevc(video), ...base };
  } catch {
    return signal && signal.aborted ? fail('aborted') : fail('network', 'NET');
  }
}
