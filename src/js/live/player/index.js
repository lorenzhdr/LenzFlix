// LENZ LIVE Player: öffentliche API (Vertrag: docs/live.md „Player“). Nie Fortschritt melden, nie URLs/Token loggen.
import { createEmitter } from './events.js';
import { createVideoControl } from './video.js';
import { resolveStream } from './stream.js';
import { pickSubtitle } from './tracks.js';
import { createFakePlayer } from './fake.js';

export { createWatchTracker } from './watch.js';
export { pickFiller } from './filler.js';
export { createFakePlayer } from './fake.js';

const aborted = () => ({ ok: false, mode: 'none', reason: 'aborted' });
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 24;

/**
 * createPlayer({ video, deps, now, fake, canvas, getInfo }) → Player
 * (getInfo: nur für fake, liefert { channel, title } für das Testbild.)
 */
export function createPlayer({ video, deps, now = Date.now, fake = false, canvas, getInfo } = {}) {
  if (fake) return createFakePlayer({ canvas, now, getInfo });

  const em = createEmitter();
  const vc = createVideoControl(video, { now, emit: em.emit });
  let gen = 0;
  let ac = null;
  let session = null; // { kind:'item'|'url', itemId?, mode, playSessionId?, mediaSourceId? }
  let tr = { audio: [], subs: [], audioIndex: null, subtitleIndex: -1 };
  let disposed = false;
  let tsOnly = false; // fMP4-HLS scheiterte bei h264 schon einmal: für h264-Quellen gleich ts/h264 anfordern
  // Auflösungs-Cache: nur Direct-Ergebnisse (statische URL) werden wiederverwendet; bei HLS merkt er nur „HLS nötig“.
  const cache = new Map(); // itemId → { at, mode, r? }
  const inflight = new Map(); // itemId → Promise (laufende prefetch-Auflösung)

  const cancelRequests = () => {
    if (ac) { try { ac.abort(); } catch { /* egal */ } }
    ac = null;
  };

  /** <video> sofort leeren, DANACH (bei HLS) den Encoding-Job beenden. */
  function teardown() {
    const s = session;
    session = null;
    vc.clear();
    if (s && s.mode === 'hls' && s.playSessionId) {
      try {
        return Promise.resolve(deps.request('DELETE', '/Videos/ActiveEncodings', {
          params: { deviceId: deps.server && deps.server.deviceId, playSessionId: s.playSessionId },
        })).then(() => {}, () => {});
      } catch { /* egal */ }
    }
    return Promise.resolve();
  }

  const failure = (reason, code) => {
    const extra = code ? { code } : {};
    em.emit('state', { phase: 'error', reason, ...extra });
    em.emit('error', { reason, ...extra });
  };

  const fresh = (e) => !!e && now() - e.at < CACHE_TTL_MS;
  function remember(itemId, r) {
    if (!r || !r.ok) return;
    cache.set(itemId, { at: now(), mode: r.mode, r: r.mode === 'direct' ? r : null });
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  }

  /** Löst PlaybackInfo vorab auf (Zappen). Cached nur Direct-Ergebnisse; HLS-Ergebnisse werden nie wiederverwendet. */
  function prefetch(itemId, { signal } = {}) {
    if (disposed || !itemId) return Promise.resolve({ ok: false, reason: 'aborted' });
    if (fresh(cache.get(itemId))) return Promise.resolve({ ok: true, cached: true });
    const running = inflight.get(itemId);
    if (running) return running;
    const p = resolveStream({ deps, video, itemId, signal, noHevc: false })
      .then((r) => { if (!(signal && signal.aborted)) remember(itemId, r); return { ok: !!r.ok, mode: r.mode }; }, () => ({ ok: false, reason: 'network' }))
      .finally(() => { if (inflight.get(itemId) === p) inflight.delete(itemId); });
    inflight.set(itemId, p);
    return p;
  }

  async function resolveFor(itemId, opts, signal) {
    if (opts.audioIndex == null && !opts.noCache) {
      const pf = inflight.get(itemId);
      if (pf) { try { await pf; } catch { /* egal */ } if (signal.aborted) return { ok: false, mode: 'none', reason: 'aborted' }; }
      const c = cache.get(itemId);
      if (fresh(c) && c.mode === 'direct' && c.r) return c.r;
    }
    let r;
    try {
      r = await resolveStream({ deps, video, itemId, audioIndex: opts.audioIndex, signal, noHevc: !!opts.noHevc });
    } catch {
      r = { ok: false, mode: 'none', reason: signal.aborted ? 'aborted' : 'network', ...(signal.aborted ? {} : { code: 'NET' }) };
    }
    if (opts.audioIndex == null) remember(itemId, r);
    return r;
  }

  async function play(opts = {}) {
    if (disposed) return aborted();
    const { itemId, offsetMs = 0 } = opts;
    const my = ++gen;
    cancelRequests();
    ac = new AbortController();
    const signal = ac.signal;
    teardown(); // nicht abwarten: das Zappen soll nicht auf das DELETE warten
    tr = { audio: [], subs: [], audioIndex: null, subtitleIndex: -1 };
    em.emit('state', { phase: 'loading' });

    let r = await resolveFor(itemId, opts, signal);
    if (my !== gen) return aborted();
    // Rückfall gemerkt: h264 mit fMP4-HLS lief hier nicht → gleich ohne HEVC anfragen.
    if (r.ok && r.mode === 'hls' && tsOnly && r.offeredHevc && r.videoCodec === 'h264') {
      r = await resolveFor(itemId, { ...opts, audioIndex: opts.audioIndex ?? r.audioIndex, noHevc: true, noCache: true }, signal);
      if (my !== gen) return aborted();
    }
    if (!r.ok) {
      failure(r.reason, r.code);
      return failResult(r);
    }

    let res = await launch(r, opts, offsetMs, itemId, my);
    if (my !== gen) return aborted();
    const canFallback = !res.ok && (res.reason === 'video' || res.reason === 'browser')
      && r.mode === 'hls' && r.offeredHevc && r.videoCodec === 'h264';
    if (canFallback) {
      // EINMAL ohne HEVC (ts/h264) neu auflösen und starten; für HEVC-Quellen gibt es keinen ts-Rückfall (Safari).
      teardown();
      const r2 = await resolveFor(itemId, { ...opts, audioIndex: opts.audioIndex ?? r.audioIndex, noHevc: true, noCache: true }, signal);
      if (my !== gen) return aborted();
      if (r2.ok) {
        res = await launch(r2, opts, offsetMs, itemId, my);
        if (my !== gen) return aborted();
        if (res.ok) { tsOnly = true; return res; }
      }
    }
    if (!res.ok) {
      teardown();
      if (res.reason !== 'aborted') failure(res.reason, res.code);
      return failResult(res);
    }
    return res;
  }

  const failResult = (x) => (x.code ? { ok: false, mode: 'none', reason: x.reason, code: x.code } : { ok: false, mode: 'none', reason: x.reason });

  /** Quelle setzen, Spuren übernehmen, starten. Fehler werden NICHT gemeldet (quiet), das macht play(). */
  async function launch(r, opts, offsetMs, itemId, my) {
    session = { kind: 'item', itemId, mode: r.mode, playSessionId: r.playSessionId, mediaSourceId: r.mediaSourceId };
    tr = { audio: r.tracks.audio, subs: r.tracks.subs, audioIndex: r.audioIndex, subtitleIndex: -1 };
    const sub = typeof opts.subtitleIndex === 'number' ? opts.subtitleIndex : pickSubtitle(tr.subs, deps.user);
    const subTrack = tr.subs.find((s) => s.index === sub);
    if (subTrack) {
      tr.subtitleIndex = sub;
      vc.setSubtitle({ url: subUrl(itemId, r.mediaSourceId, sub), label: subTrack.label, lang: subTrack.lang });
    }
    const res = await vc.start(r.url, offsetMs, { quiet: true });
    if (my !== gen) return aborted();
    return res.ok ? { ok: true, mode: r.mode } : res;
  }

  const subUrl = (itemId, msid, index) => deps.streamUrl(`/Videos/${encodeURIComponent(itemId)}/${encodeURIComponent(msid)}/Subtitles/${index}/0/Stream.vtt`, {});

  async function playUrl(url, offsetMs = 0) {
    if (disposed) return aborted();
    const my = ++gen;
    cancelRequests();
    teardown();
    tr = { audio: [], subs: [], audioIndex: null, subtitleIndex: -1 };
    session = { kind: 'url', mode: 'direct' };
    em.emit('state', { phase: 'loading' });
    const res = await vc.start(url, offsetMs);
    if (my !== gen) return aborted();
    if (!res.ok) {
      teardown();
      return failResult(res);
    }
    return { ok: true, mode: 'direct' };
  }

  return {
    unlock: () => vc.unlock(),
    play,
    playUrl,
    prefetch,
    async stop() {
      gen++;
      cancelRequests();
      tr = { audio: [], subs: [], audioIndex: null, subtitleIndex: -1 };
      await teardown();
    },
    syncTo: (ms) => vc.syncTo(ms),
    setVolume: (v) => vc.setVolume(v),
    setMuted: (b) => vc.setMuted(b),
    // Lautstärke: 'native' | 'gain' (WebAudio, iOS) | 'mute-only'. setVolume wirkt in den ersten beiden Modi.
    get volumeSupported() { return vc.volumeSupported; },
    volumeMode: () => vc.volumeMode(),
    volumeCanTry: () => vc.volumeCanTry(),
    tracks() {
      return { audio: tr.audio.map((t) => ({ ...t })), subs: tr.subs.map((t) => ({ ...t })), audioIndex: tr.audioIndex, subtitleIndex: tr.subtitleIndex };
    },
    async setAudio(index) {
      if (!session || session.kind !== 'item') return aborted();
      if (index === tr.audioIndex) return { ok: true, mode: session.mode };
      return play({ itemId: session.itemId, offsetMs: vc.positionMs(), audioIndex: index, subtitleIndex: tr.subtitleIndex });
    },
    async setSubtitle(index) {
      if (!session || session.kind !== 'item') return;
      const t = tr.subs.find((s) => s.index === index);
      if (!t) {
        vc.clearSubtitles();
        tr.subtitleIndex = -1;
        return;
      }
      vc.setSubtitle({ url: subUrl(session.itemId, session.mediaSourceId, index), label: t.label, lang: t.lang });
      tr.subtitleIndex = index;
    },
    on: em.on,
    dispose() {
      if (disposed) return;
      disposed = true;
      gen++;
      cancelRequests();
      teardown();
      vc.dispose();
      cache.clear();
      inflight.clear();
      em.clear();
    },
  };
}
