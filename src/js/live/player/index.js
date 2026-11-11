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

  const failure = (reason) => {
    em.emit('state', { phase: 'error', reason });
    em.emit('error', { reason });
  };

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

    let r;
    try {
      r = await resolveStream({ deps, video, itemId, audioIndex: opts.audioIndex, signal });
    } catch {
      r = { ok: false, mode: 'none', reason: signal.aborted ? 'aborted' : 'network' };
    }
    if (my !== gen) return aborted();
    if (!r.ok) {
      failure(r.reason);
      return { ok: false, mode: 'none', reason: r.reason };
    }

    session = { kind: 'item', itemId, mode: r.mode, playSessionId: r.playSessionId, mediaSourceId: r.mediaSourceId };
    tr = { audio: r.tracks.audio, subs: r.tracks.subs, audioIndex: r.audioIndex, subtitleIndex: -1 };
    const sub = typeof opts.subtitleIndex === 'number' ? opts.subtitleIndex : pickSubtitle(tr.subs, deps.user);
    const subTrack = tr.subs.find((s) => s.index === sub);
    if (subTrack) {
      tr.subtitleIndex = sub;
      vc.setSubtitle({ url: subUrl(itemId, r.mediaSourceId, sub), label: subTrack.label, lang: subTrack.lang });
    }

    const res = await vc.start(r.url, offsetMs);
    if (my !== gen) return aborted();
    if (!res.ok) {
      teardown();
      return { ok: false, mode: 'none', reason: res.reason };
    }
    return { ok: true, mode: r.mode };
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
      return { ok: false, mode: 'none', reason: res.reason };
    }
    return { ok: true, mode: 'direct' };
  }

  return {
    unlock: () => vc.unlock(),
    play,
    playUrl,
    async stop() {
      gen++;
      cancelRequests();
      tr = { audio: [], subs: [], audioIndex: null, subtitleIndex: -1 };
      await teardown();
    },
    syncTo: (ms) => vc.syncTo(ms),
    setVolume: (v) => vc.setVolume(v),
    setMuted: (b) => vc.setMuted(b),
    volumeSupported: vc.volumeSupported,
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
      em.clear();
    },
  };
}
