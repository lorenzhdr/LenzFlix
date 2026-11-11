// LENZ LIVE Player: Ton- und Untertitelspuren aus den MediaStreams der PlaybackInfo.
const TEXT_SUBS = new Set(['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'vtt', 'mov_text', 'text']);

const LANG = {
  de: 'ger', deu: 'ger', ger: 'ger', en: 'eng', eng: 'eng', fr: 'fra', fre: 'fra', fra: 'fra',
  es: 'spa', spa: 'spa', it: 'ita', ita: 'ita', nl: 'nld', dut: 'nld', nld: 'nld',
  zh: 'zho', chi: 'zho', zho: 'zho', cs: 'ces', cze: 'ces', ces: 'ces', ja: 'jpn', jpn: 'jpn',
  pt: 'por', por: 'por', ru: 'rus', rus: 'rus', tr: 'tur', tur: 'tur', pl: 'pol', pol: 'pol',
};

export function normLang(l) {
  const s = String(l || '').trim().toLowerCase();
  return LANG[s] || s;
}

function labelOf(s, n) {
  return String(s.DisplayTitle || s.Title || s.Language || `Spur ${n}`);
}

/** → { audio: Track[], subs: Track[] }, Track = { index, label, lang, isDefault, forced?, codec } */
export function buildTracks(mediaSource) {
  const streams = (mediaSource && mediaSource.MediaStreams) || [];
  const audio = [];
  const subs = [];
  for (const s of streams) {
    if (!s || typeof s.Index !== 'number') continue;
    if (s.Type === 'Audio') {
      audio.push({ index: s.Index, label: labelOf(s, audio.length + 1), lang: s.Language || '', isDefault: !!s.IsDefault, codec: String(s.Codec || '').toLowerCase() });
    } else if (s.Type === 'Subtitle' && TEXT_SUBS.has(String(s.Codec || '').toLowerCase())) {
      subs.push({ index: s.Index, label: labelOf(s, subs.length + 1), lang: s.Language || '', isDefault: !!s.IsDefault, forced: !!s.IsForced, codec: String(s.Codec).toLowerCase() });
    }
  }
  return { audio, subs };
}

/** Index der Tonspur, die der Server als Standard liefert. */
export function serverDefaultAudio(mediaSource, audio) {
  const d = mediaSource && mediaSource.DefaultAudioStreamIndex;
  if (typeof d === 'number') return d;
  const def = audio.find((a) => a.isDefault) || audio[0];
  return def ? def.index : null;
}

/** Gewünschte Tonspur: Sprache des Nutzers, sonst Server-Standard. */
export function pickAudio(audio, defaultIndex, user) {
  const want = normLang(user && user.audioLang);
  if (want) {
    const m = audio.filter((a) => normLang(a.lang) === want);
    if (m.length) return (m.find((a) => a.isDefault) || m[0]).index;
  }
  return defaultIndex;
}

/** Standard-Untertitel nach Nutzerwahl; -1 = aus. */
export function pickSubtitle(subs, user) {
  const mode = String((user && user.subMode) || '');
  const want = normLang(user && user.subLang);
  if (mode === 'Always') {
    const m = subs.filter((s) => want && normLang(s.lang) === want);
    return m.length ? (m.find((s) => !s.forced) || m[0]).index : -1;
  }
  if (mode === 'OnlyForced') {
    const f = subs.filter((s) => s.forced);
    const m = f.filter((s) => want && normLang(s.lang) === want);
    const pick = m[0] || (want ? null : f[0]);
    return pick ? pick.index : -1;
  }
  return -1;
}

export function isPlainAudioCodec(codec) {
  const c = String(codec || '').toLowerCase();
  return c === 'aac' || c === 'mp3';
}
