// LENZ LIVE Player: öffentliche API (Vertrag: docs/live.md „Player“). Nie Fortschritt melden, nie URLs/Token loggen.
import { createEmitter } from './events.js';
import { createVideoControl } from './video.js';
import { resolveStream } from './stream.js';
import { pickSubtitle } from './tracks.js';
import { createFakePlayer } from './fake.js';
import { parseMaster, parseMedia, pickSegment, resourceStats } from './warm.js';

export { createWatchTracker } from './watch.js';
export { pickFiller } from './filler.js';
export { createFakePlayer } from './fake.js';

const aborted = () => ({ ok: false, mode: 'none', reason: 'aborted' });
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX = 24;
const MAX_ATTEMPTS = 3;
const RETRY_DELAY_MS = 500;
const DF_KEY = 'lfx-directfailed'; // dauerhaft gemerkte Direct-Fehler (deps.storage): { id: Zeitstempel }
const DF_TTL_MS = 7 * 24 * 3600 * 1000;
const DF_MAX = 200;
const WARM_TTL_MS = 40 * 1000; // Vorwärmen (Test): der Server beendet untätige HLS-Jobs nach ~60 s
const WARM_MAX = 2;
const WARM_REFRESH_MAX = 10;
const WARM_PENDING_MAX_MS = 25 * 1000; // ein hängender Vorwärm-Vorgang (Pi unter Last) wird abgebrochen

/**
 * createPlayer({ video, deps, now, fake, canvas, getInfo }) → Player
 * (getInfo: nur für fake, liefert { channel, title } für das Testbild.)
 */
export function createPlayer({ video, deps, now = Date.now, fake = false, canvas, getInfo } = {}) {
  if (fake) return createFakePlayer({ canvas, now, getInfo });

  const em = createEmitter();
  // Erzwungenes HLS (deps.forceHls, Hash lfxhls, nur mit Messanzeige): docs/live.md „Startablauf“.
  const forceHls = !!(deps && deps.forceHls);
  const vc = createVideoControl(video, { now, emit: em.emit });
  const wantNoDirect = (itemId) => forceHls || directFailed.has(itemId);
  let gen = 0;
  let ac = null;
  let session = null; // { kind:'item'|'url', itemId?, mode, playSessionId?, mediaSourceId? }
  let tr = { audio: [], subs: [], audioIndex: null, subtitleIndex: -1 };
  let disposed = false;
  let tsOnly = false; // fMP4-HLS scheiterte bei h264 schon einmal: für h264-Quellen gleich ts/h264 anfordern
  // Auflösungs-Cache: nur Direct-Ergebnisse (statische URL) werden wiederverwendet; bei HLS merkt er nur „HLS nötig“.
  const directFailed = new Set(); // Items, deren Direktwiedergabe im <video> scheiterte: gleich per Remux (noDirect) anfragen
  const rememberDirectFailed = (itemId) => {
    if (directFailed.size >= DF_MAX) directFailed.clear();
    directFailed.add(itemId);
    cache.delete(itemId);
  };
  // Dauerhaft (deps.storage, z. B. localStorage): nur Direct mit Medienfehler (M3/M4), dessen Remux danach lief. Max. 200 IDs, 7 Tage.
  const store = deps && deps.storage && typeof deps.storage.getItem === 'function' ? deps.storage : null;
  const readDf = () => {
    try {
      const o = JSON.parse(store.getItem(DF_KEY) || '{}');
      return o && typeof o === 'object' && !Array.isArray(o) ? o : {};
    } catch { return {}; }
  };
  if (store) {
    const t = now();
    for (const [id, at] of Object.entries(readDf())) if (typeof at === 'number' && t - at < DF_TTL_MS && directFailed.size < DF_MAX) directFailed.add(id);
  }
  const persistDirectFailed = (itemId) => {
    if (!store) return;
    try {
      const t = now();
      const all = readDf();
      all[itemId] = t;
      const live = Object.entries(all).filter(([, at]) => typeof at === 'number' && t - at < DF_TTL_MS).sort((a, b) => b[1] - a[1]).slice(0, DF_MAX);
      store.setItem(DF_KEY, JSON.stringify(Object.fromEntries(live)));
    } catch { /* Speicher gesperrt/voll */ }
  };
  let lastCached = false; // resolveFor: Ergebnis aus Cache/Vorauflösung wiederverwendet
  let lastWarm = null;    // resolveFor: vorgewärmter HLS-Eintrag übernommen { ageMs, timing }
  let lastTiming = null;
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
    cache.set(itemId, { at: now(), mode: r.mode, r: r.mode === 'direct' && !directFailed.has(itemId) ? r : null });
    while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  }

  /** Löst PlaybackInfo vorab auf (Zappen). Cached nur Direct-Ergebnisse; HLS-Ergebnisse werden nie wiederverwendet. */
  function prefetch(itemId, { signal } = {}) {
    if (disposed || !itemId) return Promise.resolve({ ok: false, reason: 'aborted' });
    if (fresh(cache.get(itemId))) return Promise.resolve({ ok: true, cached: true });
    const running = inflight.get(itemId);
    if (running) return running;
    const p = resolveStream({ deps, video, itemId, signal, noHevc: false, noDirect: wantNoDirect(itemId) })
      .then((r) => { if (!(signal && signal.aborted)) remember(itemId, r); return { ok: !!r.ok, mode: r.mode }; }, () => ({ ok: false, reason: 'network' }))
      .finally(() => { if (inflight.get(itemId) === p) inflight.delete(itemId); });
    inflight.set(itemId, p);
    return p;
  }

  // ---------- Vorwärmen (Test, deps.zapWarm; docs/live.md „Vorwärmen“) ----------
  // Nachbarsender: PlaybackInfo, dann master → Variante → Init → erstes Byte des Zielsegments, damit der Server den Remux schon begonnen hat.
  // Der Eintrag (URL mit Token nur im Speicher) wird beim Umschalten EINMAL übernommen (wird die aktive Sitzung); sonst endet der
  // Server-Job nach WARM_TTL_MS/Verdrängung/dispose per DELETE.
  const warm = new Map(); // itemId → { r, at, offsetMs, timing, refreshes, segments }
  const warmPending = new Map(); // itemId → { ac, p, r?, part?, at?, taken? } (r/part: schon aufgelöstes HLS-Ergebnis und bisherige Messwerte)
  let warmStarted = 0;
  let warmDone = 0;
  let warmSkip = null; // letzter Grund, warum nicht (weiter) vorgewärmt wurde: pending|direct|err|timeout|max|phase|filler (nur Messanzeige)
  const noteSkip = (c) => { warmSkip = c || null; };
  /** Pending-Vorgang nach WARM_PENDING_MAX_MS abbrechen (Grund 'timeout'); liefert die Aufräumfunktion. */
  function armPendingTimeout(itemId, rec) {
    const t = setTimeout(() => {
      if (warmPending.get(itemId) !== rec || rec.taken) return;
      warmSkip = 'timeout';
      abortWarmPending(itemId);
    }, WARM_PENDING_MAX_MS);
    return () => clearTimeout(t);
  }
  let warmTimer = null;
  const warmFresh = (e) => now() - e.at < WARM_TTL_MS;

  const doFetch = (url, o) => {
    const f = (deps && deps.fetch) || (typeof fetch === 'function' ? fetch : null);
    if (!f) throw new Error('kein fetch');
    return f(url, o);
  };
  async function getText(url, signal) {
    const res = await doFetch(url, { signal });
    if (!res.ok) throw new Error('http');
    return res.text();
  }
  /** Erstes Byte (ein Chunk), danach Abbruch: { ok, ms }. */
  async function firstByte(url, signal) {
    const c = new AbortController();
    const onAbort = () => c.abort();
    signal.addEventListener('abort', onAbort, { once: true });
    const t = now();
    try {
      const res = await doFetch(url, { signal: c.signal });
      if (!res.ok) return { ok: false };
      const reader = res.body && typeof res.body.getReader === 'function' ? res.body.getReader() : null;
      if (reader) await reader.read();
      return { ok: true, ms: Math.max(0, now() - t) };
    } finally {
      signal.removeEventListener('abort', onAbort);
      try { c.abort(); } catch { /* egal */ }
    }
  }
  async function warmFetch(r, offsetMs, signal, part) {
    const t0 = now();
    const text = await getText(r.url, signal);
    const variantUrl = parseMaster(text, r.url);
    const mediaText = variantUrl ? await getText(variantUrl, signal) : text;
    const playlistMs = Math.max(0, now() - t0);
    part.playlistMs = playlistMs;
    const { init, segments } = parseMedia(mediaText, variantUrl || r.url);
    let initMs = null;
    if (init) {
      const t1 = now();
      const res = await doFetch(init, { signal });
      if (!res.ok) throw new Error('http');
      await res.arrayBuffer();
      initMs = Math.max(0, now() - t1);
      part.initMs = initMs;
    }
    const seg = pickSegment(segments, offsetMs / 1000);
    let segFirstByteMs = null;
    if (seg) {
      const fb = await firstByte(seg.url, signal);
      if (fb.ok) { segFirstByteMs = fb.ms; part.segFirstByteMs = fb.ms; }
    }
    return { r, at: now(), offsetMs, timing: { playlistMs, initMs, segFirstByteMs }, refreshes: 0, segments };
  }
  function deleteWarmSession(r) {
    if (!r || !r.playSessionId) return;
    try {
      Promise.resolve(deps.request('DELETE', '/Videos/ActiveEncodings', {
        params: { deviceId: deps.server && deps.server.deviceId, playSessionId: r.playSessionId },
      })).then(() => {}, () => {});
    } catch { /* egal */ }
  }
  function abortWarmPending(itemId) {
    const rec = warmPending.get(itemId);
    if (!rec) return;
    warmPending.delete(itemId);
    try { rec.ac.abort(); } catch { /* egal */ }
  }
  /** Eintrag verwerfen, laufende Abrufe abbrechen, Server-Job beenden. */
  function dropWarm(itemId) {
    const e = warm.get(itemId);
    warm.delete(itemId);
    abortWarmPending(itemId);
    if (e) deleteWarmSession(e.r);
  }
  function armWarmTimer() {
    clearTimeout(warmTimer);
    warmTimer = null;
    if (disposed || !warm.size) return;
    const t = now();
    let next = Infinity;
    for (const e of warm.values()) next = Math.min(next, e.at + WARM_TTL_MS - t);
    warmTimer = setTimeout(() => {
      warmTimer = null;
      const t2 = now();
      for (const [id, e] of [...warm]) if (t2 - e.at >= WARM_TTL_MS) dropWarm(id);
      armWarmTimer();
    }, Math.max(50, next + 20));
  }
  function storeWarm(itemId, entry) {
    warm.set(itemId, entry);
    while (warm.size > WARM_MAX) {
      let oldest = null;
      for (const [id, e] of warm) if (id !== itemId && (oldest == null || e.at < warm.get(oldest).at)) oldest = id;
      if (oldest == null) break;
      dropWarm(oldest);
    }
    armWarmTimer();
  }
  /** Frischen Eintrag übernehmen (er wird zur aktiven Sitzung, kein DELETE); sonst null. */
  function takeWarm(itemId) {
    const e = warm.get(itemId);
    const rec = warmPending.get(itemId);
    const fits = (r) => !(tsOnly && r.offeredHevc && r.videoCodec === 'h264');
    if (!e && rec && rec.r && fits(rec.r)) {
      // Vorwärmen noch unterwegs, PlaybackInfo aber da: die (evtl. schon gestartete) Sitzung übernehmen, Abrufe abbrechen, nicht löschen.
      rec.taken = true;
      warmPending.delete(itemId);
      try { rec.ac.abort(); } catch { /* egal */ }
      return { r: rec.r, at: rec.at, timing: { ...rec.part }, partial: true };
    }
    abortWarmPending(itemId);
    if (!e) return null;
    if (!warmFresh(e) || !fits(e.r)) { dropWarm(itemId); return null; }
    warm.delete(itemId);
    armWarmTimer();
    return e;
  }
  async function runWarm(itemId, offsetMs, rec) {
    const signal = rec.ac.signal;
    const pf = inflight.get(itemId);
    if (pf) { try { await pf; } catch { /* egal */ } }
    if (signal.aborted || disposed) return aborted();
    const c = cache.get(itemId);
    if (fresh(c) && c.mode === 'direct' && !directFailed.has(itemId)) { noteSkip('direct'); return { ok: true, mode: 'direct' }; } // Direct braucht kein Vorwärmen
    // rec.resolving: play() wartet darauf, statt den Vorgang abzubrechen und neu aufzulösen (rec.r ist dann schon gesetzt).
    rec.resolving = resolveStream({ deps, video, itemId, signal, noHevc: tsOnly, noDirect: wantNoDirect(itemId) }).then((x) => {
      if (x.ok && x.mode === 'hls' && !signal.aborted && !disposed) {
        rec.r = x;
        rec.at = now();
        rec.part = {};
        warmStarted++;
        warmSkip = null;
      }
      return x;
    });
    const r = await rec.resolving;
    if (signal.aborted || disposed) return aborted();
    remember(itemId, r);
    if (!r.ok) { noteSkip('err'); return { ok: false, mode: r.mode }; }
    if (r.mode !== 'hls') { noteSkip('direct'); return { ok: true, mode: r.mode }; }
    let stored = false;
    try {
      const entry = await warmFetch(r, offsetMs, signal, rec.part);
      if (signal.aborted || disposed) return aborted();
      storeWarm(itemId, entry);
      warmDone++;
      stored = true;
      return { ok: true, mode: 'hls', warmed: true };
    } finally {
      if (!stored && !rec.taken) deleteWarmSession(r); // Abbruch/Fehler: der Job könnte schon laufen (übernommen: bleibt die aktive Sitzung)
    }
  }
  function refreshWarm(itemId, e, offsetMs) {
    const running = warmPending.get(itemId);
    if (running) { noteSkip('pending'); return running.p; }
    const seg = pickSegment(e.segments, offsetMs / 1000);
    if (e.refreshes >= WARM_REFRESH_MAX || !seg) { noteSkip('max'); return Promise.resolve({ ok: true, skipped: true }); }
    const ac = new AbortController();
    const rec = { ac, p: null };
    const clearTo = armPendingTimeout(itemId, rec);
    rec.p = (async () => {
      try {
        const fb = await firstByte(seg.url, ac.signal);
        if (ac.signal.aborted || disposed || warm.get(itemId) !== e) return aborted();
        if (!fb.ok) { noteSkip('err'); dropWarm(itemId); return { ok: false, reason: 'network' }; }
        e.at = now();
        e.offsetMs = offsetMs;
        e.refreshes++;
        armWarmTimer();
        return { ok: true, refreshed: true };
      } catch { if (!ac.signal.aborted) noteSkip('err'); return { ok: false, reason: 'network' }; }
    })().finally(() => { clearTo(); if (warmPending.get(itemId) === rec) warmPending.delete(itemId); });
    warmPending.set(itemId, rec);
    return rec.p;
  }
  /** Nachbarsender vorwärmen (nur mit deps.zapWarm; sonst no-op ohne jeden Request). offsetMs = Planposition in der laufenden Sendung. */
  function prewarm(itemId, offsetMs = 0) {
    if (!(deps && deps.zapWarm) || disposed || !itemId) return Promise.resolve({ ok: false, reason: 'off' });
    const off = Number(offsetMs) || 0;
    const e = warm.get(itemId);
    if (e && warmFresh(e)) return refreshWarm(itemId, e, off);
    if (e) dropWarm(itemId);
    const running = warmPending.get(itemId);
    if (running) { noteSkip('pending'); return running.p; }
    const ac = new AbortController();
    const rec = { ac, p: null };
    const clearTo = armPendingTimeout(itemId, rec);
    rec.p = runWarm(itemId, off, rec)
      .catch(() => { if (!ac.signal.aborted) noteSkip('err'); return { ok: false, reason: 'network' }; })
      .finally(() => { clearTo(); if (warmPending.get(itemId) === rec) warmPending.delete(itemId); });
    warmPending.set(itemId, rec);
    return rec.p;
  }

  async function resolveFor(itemId, opts, signal) {
    if (opts.audioIndex == null && !opts.noCache) {
      const rec0 = warmPending.get(itemId);
      if (rec0 && rec0.resolving && !rec0.r && !warm.has(itemId)) {
        // Vorwärmen löst gerade PlaybackInfo auf: darauf warten statt abbrechen und neu zu fragen (dann Teilübernahme).
        try { await rec0.resolving; } catch { /* egal */ }
        if (signal.aborted) return { ok: false, mode: 'none', reason: 'aborted' };
      }
      const w = takeWarm(itemId);
      if (w) { lastWarm = { ageMs: Math.max(0, now() - w.at), timing: w.timing, partial: !!w.partial }; return w.r; }
      const pf = inflight.get(itemId);
      if (pf) { try { await pf; } catch { /* egal */ } if (signal.aborted) return { ok: false, mode: 'none', reason: 'aborted' }; }
      const c = cache.get(itemId);
      if (fresh(c) && c.mode === 'direct' && c.r && !directFailed.has(itemId)) { lastCached = true; return c.r; }
    }
    let r;
    try {
      r = await resolveStream({ deps, video, itemId, audioIndex: opts.audioIndex, signal, noHevc: !!opts.noHevc, noDirect: wantNoDirect(itemId) });
    } catch {
      r = { ok: false, mode: 'none', reason: signal.aborted ? 'aborted' : 'network', ...(signal.aborted ? {} : { code: 'NET' }) };
    }
    if (opts.audioIndex == null) remember(itemId, r);
    return r;
  }

  /** Messung des letzten play() (Messanzeige): keine URLs/Token. */
  function makeTiming(tm) {
    const ph = vc.phases();
    const dur = (a, b) => (a != null && b != null ? Math.max(0, b - a) : null);
    return {
      totalMs: Math.max(0, now() - tm.t0),
      infoMs: tm.infoAt != null ? Math.max(0, tm.infoAt - tm.t0) : null,
      loadMs: dur(ph.src, ph.meta),
      startMs: dur(ph.meta, ph.playing),
      chain: tm.chain.join('>'),
      cached: tm.cached,
      mode: tm.mode,
      ...extraTiming(tm.info || null, tm.warm),
    };
  }

  /** Zusatzfelder der Messanzeige (Zeitpunkte nach den Metadaten, Puffer, Quelle, Vorwärmen, Ressourcen): nie URL/Token. */
  function extraTiming(src, wm) {
    return {
      ...vc.metrics(),
      forced: forceHls,
      src: src ? { container: src.container, v: src.v, a: src.a, reasons: [...src.reasons] } : null,
      warm: warmTiming(wm),
      res: resTiming(),
    };
  }
  function warmTiming(wm) {
    if (!(deps && deps.zapWarm)) return { on: false };
    const t = (wm && wm.timing) || {};
    return { on: true, used: !!wm, skip: warmSkip, partial: !!(wm && wm.partial), started: warmStarted, done: warmDone, ageMs: wm ? wm.ageMs : null, playlistMs: t.playlistMs ?? null, initMs: t.initMs ?? null, segFirstByteMs: t.segFirstByteMs ?? null };
  }
  /** Best effort: Anzahl Playlist-/Segment-Abrufe seit src-Setzen und Zeit bis zum ersten Segment-Byte (nur Zahlen, nie Namen). */
  function resTiming() {
    try {
      const at = vc.phases().src;
      if (at == null || typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') return null;
      return resourceStats(performance, performance.now() - (now() - at));
    } catch { return null; }
  }

  async function play(opts = {}) {
    if (disposed) return aborted();
    const tm = { t0: now(), infoAt: null, chain: [], cached: false, mode: 'none', info: null };
    const res = await playCore(opts, tm);
    if (res.reason === 'aborted') return res;
    lastTiming = makeTiming(tm);
    return { ...res, timing: lastTiming };
  }

  async function playCore(opts, tm) {
    if (disposed) return aborted();
    const { itemId, offsetMs = 0 } = opts;
    const my = ++gen;
    cancelRequests();
    ac = new AbortController();
    const signal = ac.signal;
    teardown(); // nicht abwarten: das Zappen soll nicht auf das DELETE warten
    tr = { audio: [], subs: [], audioIndex: null, subtitleIndex: -1 };
    em.emit('state', { phase: 'loading' });

    lastCached = false;
    lastWarm = null;
    let r = await resolveFor(itemId, opts, signal);
    if (my !== gen) return aborted();
    tm.cached = lastCached;
    tm.warm = lastWarm;
    tm.infoAt = now();
    // Rückfall gemerkt: h264 mit fMP4-HLS lief hier nicht → gleich ohne HEVC anfragen.
    if (r.ok && r.mode === 'hls' && tsOnly && r.offeredHevc && r.videoCodec === 'h264') {
      r = await resolveFor(itemId, { ...opts, audioIndex: opts.audioIndex ?? r.audioIndex, noHevc: true, noCache: true }, signal);
      if (my !== gen) return aborted();
    }
    if (!r.ok) {
      failure(r.reason, r.code);
      return failResult(r);
    }

    // Rückfallkette (max. MAX_ATTEMPTS Starts): Direct → Remux (noDirect) → fMP4 → ts → ein ts-Neuversuch.
    // Nie eine echte Video-Umwandlung erzwingen: HEVC-Quellen bekommen keinen ts-Rückfall (Safari).
    const chain = tm.chain;
    let cur = r;
    let noHevc = !!opts.noHevc;
    let res;
    let fromFmp4 = false;
    let tsRetried = false;
    let directMediaError = false;
    for (let attempt = 1; ; attempt++) {
      chain.push(attemptLetter(cur));
      tm.mode = cur.mode;
      tm.info = cur.info || null;
      res = await launch(cur, opts, offsetMs, itemId, my);
      if (my !== gen) return aborted();
      if (res.ok) {
        if (fromFmp4) tsOnly = true;
        if (directMediaError) persistDirectFailed(itemId); // Remux nach M3/M4 im Direct lief: dauerhaft merken
        return res;
      }
      if ((res.reason !== 'video' && res.reason !== 'browser') || attempt >= MAX_ATTEMPTS) break;
      let delay = 0;
      if (cur.mode === 'direct') {
        if (res.reason === 'video' && (res.code === 'M3' || res.code === 'M4')) directMediaError = true;
        rememberDirectFailed(itemId);
      } else if (cur.mode === 'hls' && cur.offeredHevc && cur.videoCodec === 'h264') {
        noHevc = true;
        fromFmp4 = true;
      } else if (cur.mode === 'hls' && !cur.offeredHevc && !tsRetried) {
        tsRetried = true;
        noHevc = true; // war ts wegen Rückfall: nicht wieder fMP4 anbieten
        delay = RETRY_DELAY_MS; // ts-HLS: genau ein Neuversuch mit frischer Sitzung
      } else {
        break;
      }
      await teardown(); // DELETE der gescheiterten Sitzung abwarten, bevor neu aufgelöst wird
      if (my !== gen) return aborted();
      if (delay) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (my !== gen) return aborted();
      }
      const next = await resolveFor(itemId, { ...opts, audioIndex: opts.audioIndex ?? cur.audioIndex, noHevc, noCache: true }, signal);
      if (my !== gen) return aborted();
      if (!next.ok) break; // gemeldet wird der letzte Startfehler (aussagekräftiger als „Auflösung gescheitert“)
      cur = next;
    }
    teardown();
    if (res.reason !== 'aborted') {
      const code = res.code && /^(M\d+|B-PLAY)$/.test(res.code) ? `${res.code}·${chain.join('>')}` : res.code;
      failure(res.reason, code);
      return failResult({ ...res, code });
    }
    return failResult(res);
  }

  // D = Direktwiedergabe, F = fMP4-HLS (HEVC angeboten), T = ts-HLS.
  const attemptLetter = (x) => (x.mode === 'direct' ? 'D' : x.offeredHevc ? 'F' : 'T');

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
    const t0 = now();
    const res = await vc.start(url, offsetMs);
    if (my !== gen) return aborted();
    const ph = vc.phases();
    const dur = (a, b) => (a != null && b != null ? Math.max(0, b - a) : null);
    lastTiming = { totalMs: Math.max(0, now() - t0), infoMs: null, loadMs: dur(ph.src, ph.meta), startMs: dur(ph.meta, ph.playing), chain: 'D', cached: false, mode: 'direct', ...extraTiming(null, null) };
    if (!res.ok) {
      teardown();
      return { ...failResult(res), timing: lastTiming };
    }
    return { ok: true, mode: 'direct', timing: lastTiming };
  }

  return {
    unlock: () => vc.unlock(),
    play,
    playUrl,
    prefetch,
    prewarm,
    /** Vom Controller: Grund, warum gerade nicht vorgewärmt wird (Messanzeige 'Grund'). */
    warmNote: noteSkip,
    async stop() {
      gen++;
      cancelRequests();
      tr = { audio: [], subs: [], audioIndex: null, subtitleIndex: -1 };
      await teardown();
    },
    syncTo: (ms) => vc.syncTo(ms),
    setVolume: (v) => vc.setVolume(v),
    setMuted: (b) => vc.setMuted(b),
    // Lautstärke: 'native' | 'mute-only' (iOS: video.volume ist fest, nur Stumm/Ton an). setVolume wirkt nur bei 'native'.
    get volumeSupported() { return vc.volumeSupported; },
    volumeMode: () => vc.volumeMode(),
    /** Messung des letzten play()/playUrl(): { totalMs, infoMs, loadMs, startMs, chain, cached, mode } oder null. */
    lastTiming: () => (lastTiming ? { ...lastTiming } : null),
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
      for (const rec of warmPending.values()) { try { rec.ac.abort(); } catch { /* egal */ } }
      warmPending.clear();
      for (const id of [...warm.keys()]) dropWarm(id);
      clearTimeout(warmTimer);
      warmTimer = null;
      vc.dispose();
      cache.clear();
      inflight.clear();
      em.clear();
    },
  };
}
