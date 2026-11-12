// LENZ LIVE Player: Steuerung des einen <video> (Start an Live-Position, Pause-Abwehr, Lautstärke, Untertitel-Track).
// Keine URLs in Ereignissen/Fehlern: Payloads tragen nur { phase, reason }.

const START_TIMEOUT_MS = 25000;
export const STALL_REPORT_MS = 1200; // 'waiting' zählt erst als Stall, wenn currentTime so lange nicht vorankommt
const MEDIA_ACTIONS = ['pause', 'play', 'seekbackward', 'seekforward', 'seekto', 'previoustrack', 'nexttrack'];

export function createVideoControl(video, { now = Date.now, emit = () => {} } = {}) {
  let armed = false;          // eine Quelle ist geladen/lädt
  let playedOnce = false;
  let base = { off: 0, at: 0 };
  let pending = null;         // resolve des laufenden start()
  let timer = null;
  let onMeta = null;
  let trackEl = null;
  let disposed = false;
  let quiet = false;          // während start(): Fehler nicht melden, der Aufrufer entscheidet (Rückfall)
  let waiting = false;        // 'waiting' ohne Fortschritt seit waitCt
  let waitCt = 0;
  let stallTimer = null;
  let stallShown = false;

  video.setAttribute('playsinline', '');
  video.setAttribute('disablepictureinpicture', '');
  video.setAttribute('x-webkit-airplay', 'deny');
  video.removeAttribute('controls');
  try { video.disablePictureInPicture = true; } catch { /* egal */ }

  const livePos = () => base.off + (now() - base.at);

  const settle = (result) => {
    quiet = false;
    clearTimeout(timer);
    timer = null;
    const p = pending;
    pending = null;
    if (p) p(result);
  };
  const fail = (reason, code) => {
    if (!armed || disposed) return;
    const extra = code ? { code } : {};
    if (!(quiet && pending)) {
      emit('state', { phase: 'error', reason, ...extra });
      emit('error', { reason, ...extra });
    }
    settle({ ok: false, reason, ...extra });
  };
  function resetStall() {
    clearTimeout(stallTimer);
    stallTimer = null;
    waiting = false;
    stallShown = false;
  }
  function recovered() {
    const was = stallShown;
    resetStall();
    if (was && armed) emit('state', { phase: 'playing' });
  }
  // Ablehnung je Name: AbortError (neue Quelle/Pause) ignorieren; NotAllowedError (Autoplay-Sperre) → einmal stumm
  // erneut versuchen (Ereignis 'autoplay-muted'), scheitert auch das → reason 'gesture' („Zum Starten tippen“);
  // alles andere (z. B. NotSupportedError) → 'browser'.
  const callPlay = (retried = false) => {
    const rejected = (e) => {
      if (!armed || disposed) return;
      const name = e && e.name;
      if (name === 'AbortError') return;
      const failPlay = (r, c) => fail(r, c);
      if (name === 'NotAllowedError') {
        if (retried) { failPlay('gesture'); return; }
        try { video.muted = true; } catch { /* egal */ }
        callPlay(true);
        return;
      }
      failPlay('browser', 'B-PLAY');
    };
    try {
      const p = video.play();
      if (p && p.then) {
        p.then(() => { if (retried && armed && !disposed) emit('autoplay-muted', {}); }, rejected);
      }
    } catch (e) { rejected(e); }
  };

  // Volumen-Probe: iOS ignoriert volume (dann nur Stumm/Ton an, 'mute-only'; WebAudio-Gain taugt dort in der Praxis nicht).
  let nativeVolume;
  try {
    const prev = video.volume;
    video.volume = 0.5;
    nativeVolume = video.volume === 0.5;
    video.volume = prev;
  } catch { nativeVolume = false; }

  const listeners = {
    playing: () => {
      if (!armed) return;
      playedOnce = true;
      resetStall();
      emit('state', { phase: 'playing' });
      settle({ ok: true });
    },
    // 'stalled' feuert auf iOS auch ohne echte Unterbrechung: ignorieren. 'waiting' erst nach ~1,2 s ohne Fortschritt melden.
    waiting: () => {
      if (!armed || !playedOnce || waiting || stallShown) return;
      waiting = true;
      waitCt = video.currentTime;
      stallTimer = setTimeout(() => {
        stallTimer = null;
        if (!armed || !waiting) return;
        if (video.currentTime > waitCt + 0.05) { waiting = false; return; }
        stallShown = true;
        emit('state', { phase: 'stalled' });
      }, STALL_REPORT_MS);
    },
    timeupdate: () => {
      if ((waiting || stallShown) && armed && video.currentTime > waitCt + 0.05) recovered();
    },
    canplay: () => { if (waiting || stallShown) recovered(); },
    ended: () => { if (armed) emit('state', { phase: 'ended' }); },
    error: () => {
      if (!armed) return;
      const code = video.error && video.error.code;
      fail(code === 2 ? 'network' : 'video', Number.isInteger(code) && code > 0 ? `M${code}` : 'M0');
    },
    pause: () => {
      // Nicht von uns (clear() setzt armed vorher zurück): zurück an die Live-Position und weiter.
      if (!armed || !playedOnce || video.ended) return;
      const d = video.duration;
      const pos = livePos() / 1000;
      if (Number.isFinite(d) && pos >= d - 0.5) return;
      try { video.currentTime = pos; } catch { /* egal */ }
      callPlay();
    },
  };
  for (const [name, fn] of Object.entries(listeners)) video.addEventListener(name, fn);

  const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : null;
  if (ms && typeof ms.setActionHandler === 'function') {
    for (const a of MEDIA_ACTIONS) {
      try { ms.setActionHandler(a, () => {}); } catch { /* Aktion nicht unterstützt */ }
    }
  }

  function clearSubtitles() {
    if (trackEl) {
      try { trackEl.remove(); } catch { /* egal */ }
      trackEl = null;
    }
  }

  /** Stoppt sofort und synchron (pause, src weg, load). Danach darf der Aufrufer ein DELETE schicken. */
  function clear(keepSubs) {
    armed = false;
    playedOnce = false;
    resetStall();
    if (onMeta) {
      video.removeEventListener('loadedmetadata', onMeta);
      onMeta = null;
    }
    settle({ ok: false, reason: 'aborted' });
    if (!keepSubs) clearSubtitles();
    try {
      video.pause();
      video.removeAttribute('src');
      if (typeof video.load === 'function') video.load();
    } catch { /* jsdom: nicht implementiert */ }
  }

  /** Lädt url und startet an offsetMs (absolute Zeitbasis). Löst bei „playing“ auf. */
  function start(url, offsetMs, { quiet: q = false } = {}) {
    clear(true); // gesetzten Untertitel-Track behalten
    armed = true;
    quiet = !!q;
    base = { off: Math.max(0, Number(offsetMs) || 0), at: now() };
    return new Promise((resolve) => {
      pending = resolve;
      timer = setTimeout(() => fail('network', 'TIMEOUT'), START_TIMEOUT_MS);
      onMeta = () => {
        onMeta = null;
        if (!armed) return;
        // Position zum jetzigen Zeitpunkt (Laden kann Sekunden dauern), nicht die vom Start.
        try { video.currentTime = livePos() / 1000; } catch { /* egal */ }
        callPlay();
      };
      video.addEventListener('loadedmetadata', onMeta, { once: true });
      video.src = url;
    });
  }

  return {
    get volumeSupported() { return nativeVolume; },
    /** 'native' | 'mute-only' (feste Gerätelautstärke, nur Stumm). */
    volumeMode: () => (nativeVolume ? 'native' : 'mute-only'),
    /** Synchron im Klick-Handler: Freigabe für das <video> (iOS). */
    unlock() {
      try {
        const p = video.play();
        if (p && p.catch) p.catch(() => {});
      } catch { /* egal */ }
    },
    start,
    clear: () => clear(false),
    positionMs: livePos,
    syncTo(offsetMs) {
      base = { off: Math.max(0, Number(offsetMs) || 0), at: now() };
      if (!armed || !playedOnce) return;
      if (Math.abs(video.currentTime * 1000 - base.off) > 10000) {
        try { video.currentTime = base.off / 1000; } catch { /* egal */ }
      }
    },
    setVolume(v) {
      const n = Number(v);
      if (!Number.isFinite(n)) return;
      const c = Math.min(1, Math.max(0, n));
      if (nativeVolume) { try { video.volume = c; } catch { /* egal */ } } // mute-only: volume bleibt fest (voller Ton)
    },
    setMuted(b) { video.muted = !!b; },
    setSubtitle({ url, label, lang }) {
      clearSubtitles();
      const el = document.createElement('track');
      el.kind = 'subtitles';
      el.label = label || '';
      if (lang) el.srclang = lang;
      el.default = true;
      el.src = url;
      video.appendChild(el);
      trackEl = el;
      try { if (el.track) el.track.mode = 'showing'; } catch { /* egal */ }
    },
    clearSubtitles,
    dispose() {
      if (disposed) return;
      clear(false);
      disposed = true;
      for (const [name, fn] of Object.entries(listeners)) video.removeEventListener(name, fn);
      if (ms && typeof ms.setActionHandler === 'function') {
        for (const a of MEDIA_ACTIONS) {
          try { ms.setActionHandler(a, null); } catch { /* egal */ }
        }
      }
    },
  };
}
