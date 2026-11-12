// LENZ TV-Modus · Controller: UI-freier Zustandsautomat nach dem Vorbild von live/ui/app.js (kein DOM).
// createTvController({ scheduler, player, watch, pickFiller, deps, now, opts }) → Controller (API: docs/tvmode.md).
//   player: createPlayer()-Instanz (injiziert) · watch: createWatchTracker() oder null · now(): ms.
//   opts: { lastChannel, volume (0..1 wie LIVE; Werte > 1 gelten als Prozent), muted }.
//   deps: wird an pickFiller durchgereicht (loadTrailer); deps.savePrefs({lastChannel|volume|muted}) optional.
// Meldet nie Fortschritt (kein /Sessions/Playing). Importiert nur Dateien aus src/js/live/.
import { broadcastDayOf, formatClock } from '../schedule/time.js';
import { createEmitter } from '../player/events.js';
import { nextProgram, titleOf } from './model.js';

export const DEBOUNCE_MS = 250;
export const NEIGHBOR_MS = 3000; // stabiles „playing“, danach Nachbarsender vorauflösen
export const PREFETCH_MAX_AGE_MS = 30000;
const NEIGHBOR_MAX = 2;
const STATS_MAX = 10;
export const RETRY_MS = 10000;
export const SYNC_MS = 30000;
export const STALL_MS = 60000;
const MAX_TIMEOUT = 2147483647;
const VOL_STEP = 5;
const PLAYABLE = ['program', 'fill', 'nightfill'];
const NCH = 18;

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

export const ERROR_TEXTS = {
  video: { title: 'Kein Empfang auf diesem Gerät', sub: 'Dieses Gerät kann den Sender nicht empfangen' },
  browser: { title: 'Kein Empfang auf diesem Gerät', sub: 'Bitte einen anderen Browser verwenden' },
  audio: { title: 'Ton auf diesem Gerät nicht empfangbar', sub: 'Dem Konto fehlt die Berechtigung zur Ton-Umwandlung' },
  gesture: { title: 'Zum Starten tippen', sub: 'Der Browser braucht einmal ein Tippen' },
  network: { title: 'Empfangsstörung – erneuter Versuch …', sub: '' },
};

const safe = (fn) => { try { return fn(); } catch { return undefined; } };

export function createTvController({ scheduler, player, watch = null, pickFiller = null, deps = {}, now = Date.now, opts = {} } = {}) {
  const em = createEmitter();
  const clock = typeof now === 'function' ? now : Date.now;
  const o = opts || {};

  let disposed = false;
  let on = false;
  let channel = clamp(Math.round(Number(o.lastChannel) || 1), 1, NCH);
  let entry = null; // laufende Sendung (Logik)
  let view = null;  // Eintrag für die Anzeige (beim Zappen sofort der Eintrag des neuen Senders)
  let gen = 0;
  let playing = false;
  let phase = 'off';
  let reason = null;
  let card = null;
  let banner = null;
  let needsTap = false;
  let mutedByPolicy = false;
  let stallArmed = false;
  let tickCount = 0;
  let lastDay = null;
  let tickIv = null;
  let snap = null;
  let pfAc = null;       // AbortController der Vorauflösung des Zielsenders (Entprellung)
  let tuneAt = 0;
  const zaps = [];       // letzte Umschaltungen: { channel, ms } (tune → playing)
  const neighborDone = new Set();
  const T = {};
  const offs = [];

  const volRaw = o.volume == null ? 1 : Number(o.volume);
  let vol = clamp(Math.round((volRaw > 1 ? volRaw / 100 : volRaw) * 100), 0, 100);
  let muted = !!o.muted;

  const later = (name, fn, ms) => { clearTimeout(T[name]); T[name] = setTimeout(fn, ms); };
  const unlater = (name) => { clearTimeout(T[name]); T[name] = null; };

  // ---------- Snapshot ----------
  function build() {
    return Object.freeze({
      on,
      channel,
      entry: view,
      phase,
      reason,
      card,
      banner,
      needsTap,
      mutedByPolicy,
      volume: vol,
      muted: muted || mutedByPolicy,
    });
  }
  function state() { return snap || (snap = build()); }
  function changed() {
    if (disposed) return;
    snap = null;
    em.emit('change', state());
  }
  const message = (text) => { if (!disposed) em.emit('message', text); };
  const frozen = (c) => Object.freeze(c);

  const savePrefs = (partial) => { if (deps && deps.savePrefs) safe(() => deps.savePrefs(partial)); };

  // ---------- Lautstärke ----------
  function applyVolume() {
    safe(() => player.setVolume && player.setVolume(vol / 100));
    safe(() => player.setMuted && player.setMuted(muted));
  }
  // iOS: ohne natives volume ist die Lautstärke per WebAudio-Gain möglich (player.volumeMode() === 'gain');
  // solange ein Versuch noch offen ist (volumeCanTry), wird sie optimistisch angeboten und bei Scheitern zurückgenommen.
  const volumeSupported = () => player.volumeSupported !== false || !!safe(() => player.volumeCanTry && player.volumeCanTry());

  function setVolume(v) {
    if (disposed) return;
    v = clamp(Math.round((Number(v) || 0) / VOL_STEP) * VOL_STEP, 0, 100);
    mutedByPolicy = false;
    if (!volumeSupported()) {
      muted = v < vol; // fester Pegel: alles darunter = stumm, sonst Ton an
      message('Lautstärke lässt sich hier nur stumm schalten');
      applyVolume();
      savePrefs({ muted });
      changed();
      return;
    }
    vol = v;
    muted = false;
    applyVolume();
    savePrefs({ volume: vol / 100, muted });
    changed();
  }

  function setMuted(b) {
    if (disposed) return;
    muted = !!b;
    mutedByPolicy = false;
    applyVolume();
    savePrefs({ muted });
    changed();
  }

  function toggleMute() {
    if (disposed) return;
    if (mutedByPolicy) {
      // Autoplay-Sperre: erste Stumm-Taste schaltet nur den Ton ein (wie LIVE), außer der Nutzer hatte selbst stumm geschaltet
      mutedByPolicy = false;
      applyVolume();
      if (!muted) { changed(); return; }
    }
    setMuted(!muted);
  }

  // ---------- Gesehen-Zählung ----------
  function watchTune() {
    if (!watch || !entry) return;
    const off = Math.max(0, clock() - entry.start);
    safe(() => watch.tune(entry, off));
  }
  const watchLeave = (silent) => { if (watch) safe(() => watch.leave(silent)); };
  function clearStall() { stallArmed = false; unlater('stall'); }

  // ---------- Karten ----------
  function nextTitle(e) {
    const nx = nextProgram(scheduler, channel, e);
    const nt = nx && PLAYABLE.includes(nx.type) ? titleOf(scheduler, nx).title : null;
    return { nx, nt };
  }

  function showPause(e) {
    const { nx, nt } = nextTitle(e);
    phase = 'pause';
    reason = null;
    card = nt && nx
      ? frozen({ kind: 'next', title: nt, at: formatClock(nx.start), atMs: nx.start })
      : frozen({ kind: 'pause', text: 'Gleich geht es weiter' });
    changed();
  }

  function showClosedown(e) {
    phase = 'closedown';
    reason = e.reason || null;
    if (e.reason === 'empty') {
      card = frozen({ kind: 'empty', text: 'Auf diesem Sender läuft gerade nichts' });
    } else {
      const nx = nextProgram(scheduler, channel, e);
      card = frozen({ kind: 'closedown', text: 'Sendepause', until: formatClock(nx ? nx.start : e.end) });
    }
    changed();
  }

  function showError(why, g, code) {
    playing = false;
    clearStall();
    watchLeave(true); // Störbild/Ausfall: nie als gesehen werten
    needsTap = why === 'gesture';
    const key = ERROR_TEXTS[why] ? why : 'network';
    phase = 'error';
    reason = key;
    const shown = code || (key === 'network' ? 'NET' : '');
    card = frozen({ kind: 'error', reason: key, title: ERROR_TEXTS[key].title, sub: ERROR_TEXTS[key].sub, ...(shown ? { code: String(shown) } : {}) });
    unlater('retry');
    if (key === 'network') later('retry', () => { if (g === gen && on) start(g, false); }, RETRY_MS);
    changed();
  }

  function handleResult(res, g, e) {
    if (g !== gen) return false;
    if (res && res.ok === false) {
      if (res.reason === 'aborted') return false;
      showError(res.reason || 'network', g, res.code);
      return false;
    }
    card = null;
    reason = null;
    phase = 'playing';
    playing = true;
    if (e === entry) watchTune();
    if (tuneAt) {
      zaps.push({ channel, ms: Math.max(0, clock() - tuneAt) });
      if (zaps.length > STATS_MAX) zaps.shift();
      tuneAt = 0;
    }
    if (e === entry && e.type === 'program') later('neigh', () => prefetchNeighbors(g), NEIGHBOR_MS);
    changed();
    return true;
  }

  // ---------- Vorauflösung (schnelleres Zappen) ----------
  function abortPrefetch() {
    if (pfAc) { try { pfAc.abort(); } catch { /* egal */ } pfAc = null; }
  }
  const prefetchItem = (itemId, signal) => {
    if (!player || typeof player.prefetch !== 'function') return;
    const p = safe(() => player.prefetch(itemId, signal ? { signal } : {}));
    if (p && typeof p.catch === 'function') p.catch(() => {});
  };
  // Nach stabilem „playing“: laufende Sendung der Sender ±1 vorauflösen (nur Programm, einmal je Sendung, max. 2 Anfragen).
  function prefetchNeighbors(g) {
    if (g !== gen || !on || disposed || !playing || phase !== 'playing') return;
    let n = 0;
    for (const ch of [((channel - 2 + NCH) % NCH) + 1, (channel % NCH) + 1]) {
      if (n >= NEIGHBOR_MAX || ch === channel) continue;
      const cur = safe(() => scheduler.nowOn(ch, clock()));
      const e = cur && cur.entry;
      if (!e || e.type !== 'program' || !e.itemId) continue;
      const key = `${ch}:${e.start}:${e.itemId}`;
      if (neighborDone.has(key)) continue;
      neighborDone.add(key);
      if (neighborDone.size > 200) neighborDone.delete(neighborDone.values().next().value);
      n++;
      prefetchItem(e.itemId, null);
    }
  }

  // ---------- Abspielen ----------
  function armAdvance(e, g) {
    later('advance', () => advance(g), clamp(e.end - clock() + 30, 50, MAX_TIMEOUT));
  }

  function advance(g) {
    if (g !== gen || !on) return;
    const t = clock();
    let n;
    try { n = scheduler.nowOn(channel, t); } catch { later('advance', () => advance(g), 1000); return; }
    if (entry && n.entry.start === entry.start && t < entry.end) { armAdvance(entry, g); return; }
    const ng = ++gen;
    watchLeave();
    playEntry(n.entry, n.offsetMs, ng);
  }

  async function playEntry(e, offsetMs, g) {
    entry = e;
    view = e;
    playing = false;
    unlater('retry');
    unlater('trailer');
    unlater('neigh');
    armAdvance(e, g);
    needsTap = false;
    clearStall();
    watchLeave(true); // erst nach erfolgreichem Start wieder tune (handleResult)
    banner = e.type === 'fill' ? 'Füllprogramm' : e.type === 'nightfill' ? (e.label || 'Füllprogramm – reguläres Programm ab 5:00') : null;

    if (PLAYABLE.includes(e.type) && e.itemId) {
      phase = 'loading'; reason = null; card = null;
      changed();
      let res;
      try { res = await player.play({ itemId: e.itemId, offsetMs }); } catch { res = { ok: false, reason: 'network' }; }
      handleResult(res, g, e);
      return;
    }
    if (e.type === 'filler') {
      phase = 'loading'; reason = null; card = null;
      changed();
      await runFiller(e, g);
      return;
    }
    safe(() => player.stop());
    if (e.type === 'fill' || e.type === 'nightfill') { showPause(e); return; } // Füllprogramm ohne Titel
    showClosedown(e); // closedown (oder Eintrag ohne itemId): kein Testbild, keine Musik
  }

  async function runFiller(e, g) {
    let next;
    try { next = scheduler.nowOn(channel, e.end).entry; } catch { next = null; }
    let pick = { kind: 'card' };
    if (pickFiller) { try { pick = await pickFiller(e, next, deps, clock); } catch { pick = { kind: 'card' }; } }
    if (g !== gen) return;
    if (pick && pick.kind === 'trailer') {
      let res;
      try { res = await player.playUrl(pick.url, pick.offsetMs || 0); } catch { res = { ok: false, reason: 'network' }; }
      if (g !== gen) return;
      if (res && res.ok !== false) { phase = 'playing'; reason = null; card = null; changed(); return; }
    }
    safe(() => player.stop());
    showPause(e);
    const ts = pick && pick.trailerStartMs;
    if (ts && ts > clock()) later('trailer', () => { if (g === gen && on) runFiller(e, g); }, clamp(ts - clock() + 20, 20, MAX_TIMEOUT));
  }

  async function start(g, save = true) {
    if (g !== gen || !on) return;
    if (save) savePrefs({ lastChannel: channel });
    let n;
    try { n = scheduler.nowOn(channel, clock()); } catch { showError('network', g); return; }
    await playEntry(n.entry, n.offsetMs, g);
  }

  function tune(no, { immediate = false } = {}) {
    if (!on || disposed) return;
    if (!Number.isFinite(Number(no))) return;
    no = ((((Math.round(Number(no)) - 1) % NCH) + NCH) % NCH) + 1;
    if (no === channel && entry) return;
    channel = no;
    const g = ++gen;
    for (const k of ['zap', 'advance', 'retry', 'trailer', 'neigh']) unlater(k);
    abortPrefetch();
    tuneAt = clock();
    clearStall();
    needsTap = false;
    watchLeave();
    if (!immediate) safe(() => player.stop());
    playing = false;
    entry = null;
    try { view = scheduler.nowOn(no, clock()).entry; } catch { view = null; }
    banner = null;
    card = null;
    reason = null;
    phase = 'loading';
    changed();
    if (immediate) start(g);
    else {
      // Schon während der Entprellung die PlaybackInfo des Ziels anstoßen (Folgedruck bricht ab).
      if (view && view.itemId && PLAYABLE.includes(view.type)) {
        pfAc = typeof AbortController === 'function' ? new AbortController() : null;
        prefetchItem(view.itemId, pfAc && pfAc.signal);
      }
      later('zap', () => start(g), DEBOUNCE_MS);
    }
  }

  function zap(delta) { tune(channel + (Number(delta) || 0)); }

  // ---------- Takt ----------
  function onTick() {
    if (!on || disposed) return;
    const t = clock();
    if (watch) safe(() => watch.tick());
    tickCount++;
    if (tickCount % (SYNC_MS / 1000) === 0 && playing && entry && PLAYABLE.includes(entry.type) && entry.itemId) {
      safe(() => player.syncTo(t - entry.start));
    }
    const D = broadcastDayOf(t);
    if (lastDay != null && D !== lastDay) {
      if (scheduler.prepare) Promise.resolve(safe(() => scheduler.prepare([0, 1, 2, 3, 4, 5, 6].map((i) => D + i)))).catch(() => {});
      em.emit('day', D);
    }
    lastDay = D;
    em.emit('tick', t);
  }

  // ---------- Ein/Aus ----------
  function start0() {
    if (disposed) return;
    // SYNCHRON in der Nutzergeste: Autoplay-Freigabe für das eine <video> (iOS).
    safe(() => player.unlock && player.unlock());
    if (on) return;
    on = true;
    tickCount = 0;
    lastDay = broadcastDayOf(clock());
    if (!tickIv) tickIv = setInterval(onTick, 1000);
    applyVolume();
    tune(channel, { immediate: true });
  }

  function stop() {
    if (!on) return;
    gen++;
    for (const k of ['zap', 'advance', 'retry', 'trailer', 'neigh']) unlater(k);
    abortPrefetch();
    tuneAt = 0;
    clearStall();
    if (tickIv) { clearInterval(tickIv); tickIv = null; }
    watchLeave();
    safe(() => player.stop());
    on = false;
    playing = false;
    needsTap = false;
    mutedByPolicy = false;
    entry = null;
    view = null;
    card = null;
    banner = null;
    reason = null;
    phase = 'off';
    changed();
  }

  // Nutzer-Geste nach Autoplay-Sperre: unlock (synchron), Ton an, neuer Versuch (nur wenn auch stumm abgelehnt).
  function gesture() {
    if (disposed) return;
    safe(() => player.unlock && player.unlock());
    if (!on) return;
    const retry = needsTap;
    const policy = mutedByPolicy;
    needsTap = false;
    mutedByPolicy = false;
    if (retry || policy) applyVolume(); // Nutzer-Stumm-Zustand wiederherstellen (der Versuch hat video.muted gesetzt)
    if (retry) {
      card = null; reason = null; phase = 'loading';
      changed();
      start(++gen, false);
    } else if (policy) changed();
  }

  function retry() {
    if (!on || disposed) return;
    for (const k of ['retry', 'trailer']) unlater(k);
    clearStall();
    card = null; reason = null; phase = 'loading';
    changed();
    start(++gen, false);
  }

  // ---------- Ton und Untertitel ----------
  function tracks() {
    const tr = safe(() => player.tracks && player.tracks());
    return tr || { audio: [], subs: [], audioIndex: null, subtitleIndex: -1 };
  }

  async function setAudio(i) {
    let res;
    try { res = await player.setAudio(i); } catch { res = { ok: false }; }
    if (res && res.ok === false && res.reason !== 'aborted') message('Diese Tonspur ist nicht verfügbar');
    return res;
  }

  async function setSubtitle(i) {
    try { await player.setSubtitle(i); } catch { message('Untertitel nicht verfügbar'); }
  }

  function restartTarget() {
    const e = view;
    if (!on || !e || !e.itemId || !PLAYABLE.includes(e.type)) return null;
    const it = safe(() => scheduler.item(e.itemId));
    const seriesId = e.seriesId || (it && it.seriesId) || null;
    const type = it && it.kind ? String(it.kind).toLowerCase() : (seriesId ? 'episode' : 'movie');
    return { itemId: e.itemId, type, seriesId };
  }

  // ---------- Player-Ereignisse ----------
  if (player && typeof player.on === 'function') {
    offs.push(player.on('state', (s) => {
      if (!on) return;
      const ph = s && s.phase;
      if (ph === 'stalled') {
        if (!stallArmed && entry) { stallArmed = true; later('stall', () => watchLeave(true), STALL_MS); } // Stillstand > 60 s: still verwerfen
        if (phase === 'playing') { phase = 'loading'; changed(); }
      } else if (ph === 'loading') {
        if (phase === 'playing') { phase = 'loading'; changed(); }
      } else if (ph === 'playing') {
        if (stallArmed) clearStall();
        if (playing) watchTune(); // idempotent; nach Stillstand wieder aufnehmen
        if (phase === 'loading' && playing) { phase = 'playing'; changed(); }
      } else if (ph === 'error') {
        clearStall();
        watchLeave(true);
      }
      if (ph === 'ended' && entry && entry.type === 'filler' && !card) showPause(entry); // Trailer-Ende → Pausenkarte
    }));
    // Autoplay-Sperre: Start nur stumm gelungen. Prefs-`muted` bleibt; Geste/Stumm-Taste schaltet den Ton wieder ein.
    offs.push(player.on('autoplay-muted', () => {
      if (!on) return;
      mutedByPolicy = true;
      if (!muted) message('Ton aus – zum Einschalten tippen');
      changed();
    }));
    offs.push(player.on('error', (err) => {
      if (!on || !entry || entry.type === 'filler' || phase === 'error') return;
      showError((err && err.reason) || 'network', gen, err && err.code);
    }));
    // Lautstärke-Modus kippt (Gain-Versuch gescheitert): Pegel zurück auf 100, Anzeige aktualisieren.
    offs.push(player.on('volume-mode', (m) => {
      if (disposed) return;
      if (m && m.mode === 'mute-only') {
        const had = vol !== 100;
        vol = 100;
        applyVolume();
        if (had) message('Lautstärke lässt sich hier nur stumm schalten');
      }
      changed();
    }));
  }

  return {
    start: start0,
    stop,
    tune,
    zap,
    gesture,
    retry,
    setVolume,
    setMuted,
    toggleMute,
    get volumeSupported() { return volumeSupported(); },
    tracks,
    setAudio,
    setSubtitle,
    restartTarget,
    state,
    /** Messung für das Debug-Fenster: letzte Umschaltungen (tune → playing) in ms. */
    stats() {
      const ms = zaps.map((z) => z.ms);
      return { zaps: zaps.map((z) => ({ ...z })), lastMs: ms.length ? ms[ms.length - 1] : null, avgMs: ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null };
    },
    on: (name, fn) => em.on(name, fn),
    dispose() {
      if (disposed) return;
      stop();
      disposed = true;
      abortPrefetch();
      for (const k of Object.keys(T)) clearTimeout(T[k]);
      if (tickIv) { clearInterval(tickIv); tickIv = null; }
      for (const off of offs) if (typeof off === 'function') safe(off);
      offs.length = 0;
      if (watch) safe(() => watch.dispose && watch.dispose());
      if (player) safe(() => player.dispose && player.dispose());
      em.clear();
    },
  };
}
