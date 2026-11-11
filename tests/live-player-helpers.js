// Gemeinsame Test-Helfer für tests/live-player-*.test.js (kein Test selbst).
import { vi } from 'vitest';

export const SECRET = 'SECRET-TOKEN-123';

export const flush = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

/** <video> mit gestubbten Medienfunktionen. caps: { mkv, mp4, hls }. log: gemeinsames Ereignisprotokoll. */
export function makeVideo({ mkv = true, mp4 = true, hls = true, hevc = false, hevcMkv = hevc, log = [] } = {}) {
  const v = document.createElement('video');
  let ct = 0;
  let vol = 1;
  Object.defineProperty(v, 'currentTime', { get: () => ct, set: (x) => { ct = x; log.push(['currentTime', x]); }, configurable: true });
  Object.defineProperty(v, 'volume', { get: () => vol, set: (x) => { vol = x; }, configurable: true });
  Object.defineProperty(v, 'duration', { get: () => v.__duration ?? NaN, configurable: true });
  Object.defineProperty(v, 'ended', { get: () => !!v.__ended, configurable: true });
  v.play = vi.fn(() => { log.push(['play']); return Promise.resolve(); });
  v.pause = vi.fn(() => { log.push(['pause']); });
  v.load = vi.fn(() => { log.push(['load']); });
  v.canPlayType = vi.fn((t) => {
    if (/hvc1/.test(t)) return /matroska/.test(t) ? (hevcMkv ? 'probably' : '') : (hevc ? 'probably' : '');
    if (/matroska/.test(t)) return mkv ? 'maybe' : '';
    if (/mpegurl/.test(t)) return hls ? 'maybe' : '';
    if (/mp4/.test(t)) return mp4 ? 'probably' : '';
    return '';
  });
  const rm = v.removeAttribute.bind(v);
  v.removeAttribute = (n) => { if (n === 'src') log.push(['removeSrc']); rm(n); };
  return v;
}

export const fire = (el, name) => el.dispatchEvent(new Event(name));

export function ms({ id = 'ms1', direct = true, def = 1, streams, transcodingUrl, reasons } = {}) {
  return {
    Id: id,
    SupportsDirectPlay: direct,
    DefaultAudioStreamIndex: def,
    TranscodingUrl: transcodingUrl,
    TranscodeReasons: reasons,
    MediaStreams: streams || [
      { Index: 0, Type: 'Video', Codec: 'h264' },
      { Index: 1, Type: 'Audio', Codec: 'aac', Language: 'eng', IsDefault: true, DisplayTitle: 'English - AAC' },
      { Index: 2, Type: 'Audio', Codec: 'aac', Language: 'ger', DisplayTitle: 'Deutsch - AAC' },
      { Index: 3, Type: 'Subtitle', Codec: 'subrip', Language: 'ger', DisplayTitle: 'Deutsch' },
      { Index: 4, Type: 'Subtitle', Codec: 'PGSSUB', Language: 'eng' },
      { Index: 5, Type: 'Subtitle', Codec: 'ass', Language: 'eng', IsForced: true },
    ],
  };
}

export const hlsUrl = (extra = '') => `/videos/it1/master.m3u8?MediaSourceId=ms1&PlaySessionId=ps1&ApiKey=${SECRET}${extra}`;

/** deps mit gemocktem request; respond(method, path, opts) → json. */
export function makeDeps({ respond, log = [], user } = {}) {
  const request = vi.fn(async (method, path, opts) => {
    log.push([method, path]);
    return respond ? respond(method, path, opts) : null;
  });
  return {
    request,
    user: { id: 'u1', name: 'T', isAdmin: false, audioLang: '', subLang: '', subMode: 'Default', ...user },
    server: { deviceId: 'dev1' },
    streamUrl: vi.fn((path, params) => `http://srv:8096${path}?${new URLSearchParams({ ...params, ApiKey: SECRET })}`),
  };
}

export const info = (source, extra = {}) => ({ MediaSources: [source], PlaySessionId: 'ps1', ...extra });
