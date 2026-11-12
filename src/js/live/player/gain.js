// LENZ LIVE Player: optionale WebAudio-Lautstärke für Geräte, auf denen <video>.volume ignoriert wird (iOS).
// Modus: 'gain' (aktiv) | 'mute-only' (nur Stumm). Der Ton darf nie dauerhaft stumm bleiben:
//  - der Pfad wird nur gebaut, wenn der AudioContext nach resume() wirklich 'running' ist,
//  - ein Selbsttest (AnalyserNode vor dem Gain) misst ~1,5 s Wiedergabe; nur Stille → gain=1 und Rückfall auf 'mute-only'.
// Eine MediaElementSource lässt sich nicht trennen: Der Graph bleibt je <video> bestehen (WeakMap) und wird bei
// einem neuen Player auf demselben <video> wiederverwendet; der Kontext wird nie geschlossen.
const graphs = new WeakMap(); // video → { ctx, gain, analyser, failed, checked }
export const RESUME_MS = 1000;
export const SAMPLE_MS = 250;
export const CHECK_MS = 1500;

const audioCtor = () => (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) || null;

export function createGainControl(video, { emit = () => {} } = {}) {
  let wanted = 1;
  let activating = false;
  let disposed = false;
  let checkIv = null;
  let quietMs = 0;

  const st = () => graphs.get(video) || null;
  const active = () => { const s = st(); return !!(s && s.gain && !s.failed); };

  const stopCheck = () => { if (checkIv) { clearInterval(checkIv); checkIv = null; } };

  function markFailed() {
    stopCheck();
    const s = st() || {};
    s.failed = true;
    if (s.gain) { try { s.gain.gain.value = 1; } catch { /* egal */ } }
    graphs.set(video, s);
    emit('volume-mode', { mode: 'mute-only' });
  }

  function sampleLoud(s) {
    try {
      const buf = new Uint8Array(s.analyser.fftSize || 256);
      s.analyser.getByteTimeDomainData(buf);
      for (let i = 0; i < buf.length; i++) if (Math.abs(buf[i] - 128) > 1) return true;
    } catch { return true; } // Messung unmöglich: nicht abwerten
    return false;
  }

  // Selbsttest: zählt nur Zeit, in der wirklich Ton erwartet wird (spielt, nicht stumm, gain > 0).
  function poke() {
    if (disposed) return;
    const s = st();
    if (!s || !s.gain || s.failed) return;
    if (s.ctx && s.ctx.state !== 'running') { try { s.ctx.resume(); } catch { /* egal */ } }
    if (s.checked || checkIv) return;
    quietMs = 0;
    checkIv = setInterval(() => {
      const cur = st();
      if (!cur || cur.failed || cur.checked) { stopCheck(); return; }
      if (video.paused || video.muted || wanted <= 0) { quietMs = 0; return; }
      if (sampleLoud(cur)) { cur.checked = true; stopCheck(); return; }
      quietMs += SAMPLE_MS;
      if (quietMs >= CHECK_MS) markFailed();
    }, SAMPLE_MS);
  }

  function build(ctx) {
    try {
      const source = ctx.createMediaElementSource(video);
      const gain = ctx.createGain();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(gain);
      gain.connect(ctx.destination);
      source.connect(analyser);
      gain.gain.value = wanted;
      graphs.set(video, { ctx, gain, analyser, source, failed: false, checked: false });
      emit('volume-mode', { mode: 'gain' });
      poke();
    } catch {
      try { ctx.close(); } catch { /* egal */ }
      markFailed(); // z. B. Element schon an einem anderen Kontext
    }
  }

  function activate() {
    const A = audioCtor();
    if (!A) { markFailed(); return; }
    let ctx;
    try { ctx = new A(); } catch { markFailed(); return; }
    activating = true;
    let settled = false;
    let timer = null;
    const done = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      activating = false;
      if (ok && !disposed && ctx.state === 'running') { build(ctx); return; }
      try { ctx.close(); } catch { /* egal */ } // keine Geste / nicht gelaufen: gar nicht erst aktivieren, später erneut
    };
    timer = setTimeout(() => done(false), RESUME_MS);
    let p = null;
    try { p = ctx.resume(); } catch { /* egal */ }
    if (p && typeof p.then === 'function') p.then(() => done(true), () => done(false));
    else done(true);
  }

  return {
    /** v 0..1. Aktiviert den Pfad erst beim ersten Pegel < 1 (Aufruf idealerweise in einer Nutzergeste). */
    setLevel(v) {
      wanted = Math.min(1, Math.max(0, Number(v)));
      if (!Number.isFinite(wanted)) wanted = 1;
      const s = st();
      if (s && s.failed) return;
      if (s && s.gain) { try { s.gain.gain.value = wanted; } catch { /* egal */ } poke(); return; }
      if (wanted >= 1 || activating || disposed) return;
      activate();
    },
    mode: () => (active() ? 'gain' : 'mute-only'),
    /** Lohnt sich ein Versuch? (nicht gescheitert, kein Graph, AudioContext vorhanden) */
    canTry() {
      const s = st();
      return !(s && (s.failed || s.gain)) && !!audioCtor();
    },
    poke,
    dispose() {
      disposed = true;
      stopCheck();
      const s = st();
      if (s && s.gain) { try { s.gain.gain.value = 1; } catch { /* egal */ } } // der nächste Player startet bei 1
    },
  };
}
