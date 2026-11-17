// VIDEOTHEK LENZ · VR-Kino: Streulicht aus dem Bild. Das Video wird 8× pro Sekunde auf 16×9 Pixel verkleinert,
// der Mittelwert färbt das Saallicht (hall.setSpill). averageColor/smoothColor sind rein.

/** Mittelwert der RGB-Werte eines ImageData (0..1, sRGB). */
export function averageColor(img) {
  const d = img && img.data;
  if (!d || d.length < 4) return { r: 0, g: 0, b: 0 };
  let r = 0;
  let g = 0;
  let b = 0;
  const n = Math.floor(d.length / 4);
  for (let i = 0; i < n; i++) { r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2]; }
  const k = 1 / (n * 255);
  return { r: r * k, g: g * k, b: b * k };
}

/** Exponentielle Glättung; ohne prev sofort next. tau in Sekunden. */
export function smoothColor(prev, next, dt, tau = 0.6) {
  if (!next) return prev || { r: 0, g: 0, b: 0 };
  if (!prev) return { r: next.r, g: next.g, b: next.b };
  const a = 1 - Math.exp(-Math.max(0, dt) / Math.max(0.001, tau));
  return { r: prev.r + (next.r - prev.r) * a, g: prev.g + (next.g - prev.g) * a, b: prev.b + (next.b - prev.b) * a };
}

export const BLACK = Object.freeze({ MIN_VIDEO_S: 10, WINDOW_MS: 90000 });

/** Neuer Zustand für trackBlack (einer pro Wiedergabe-Lauf). */
export const newBlackState = () => ({ t0: null, since: null, ct0: 0, fired: false, seen: false });

/**
 * Erkennung „Leinwand bleibt schwarz“ (rein, z. B. iPhone mit nativem HLS: Textur bzw. drawImage liefert nur Nullen).
 * sample = ImageData ({ data }) oder Farbe ({ r, g, b }) des Abtasters; nur exakt 0 zählt als schwarz.
 * opts: { ready: readyState >= 2, currentTime }. Wahr genau einmal je Lauf (state.fired), wenn das Video bei
 * BLACK.MIN_VIDEO_S Sekunden Videozeit ununterbrochen exakt schwarz war, innerhalb der ersten BLACK.WINDOW_MS ms der Beobachtung.
 * Nur für Leinwände, die nie Bild liefern: wurde in diesem Lauf je eine nicht-schwarze Probe gesehen (state.seen), feuert
 * die Erkennung nie mehr (Filme mit schwarzen Szenen wären sonst grundlos im Rückfall).
 */
export function trackBlack(sample, now, state, { ready = true, currentTime = 0 } = {}) {
  if (!state || state.fired || !sample) return false;
  if (state.t0 == null) state.t0 = now;
  if (now - state.t0 > BLACK.WINDOW_MS || !ready) { state.since = null; return false; }
  let zero;
  if (sample.data) { zero = true; const d = sample.data; for (let i = 0; i < d.length; i += 4) { if (d[i] || d[i + 1] || d[i + 2]) { zero = false; break; } } } else zero = !sample.r && !sample.g && !sample.b;
  if (!zero) { state.seen = true; state.since = null; return false; }
  if (state.seen) return false;
  if (state.since == null) { state.since = now; state.ct0 = Number(currentTime) || 0; return false; }
  if ((Number(currentTime) || 0) - state.ct0 >= BLACK.MIN_VIDEO_S) { state.fired = true; return true; }
  return false;
}

/**
 * Abtaster für ein <video>. update(now) → neue Farbe oder null (nicht an der Reihe/Fehler).
 * Fehler (z. B. nicht lesbares Video) schalten den Abtaster dauerhaft ab (failed).
 */
export function createAmbientSampler({ video, doc = typeof document !== 'undefined' ? document : null, hz = 8, w = 16, h = 9 } = {}) {
  let g = null;
  try {
    const canvas = doc && doc.createElement('canvas');
    if (canvas) { canvas.width = w; canvas.height = h; g = canvas.getContext('2d', { willReadFrequently: true }); }
  } catch { g = null; }
  let last = -1e9;
  let failed = !g;
  let tainted = false;
  const gap = 1000 / Math.max(1, hz);
  return {
    get failed() { return failed; },
    /** getImageData hat geworfen (nicht lesbares Video): zweites Signal für „Leinwand nicht verfügbar“. */
    get tainted() { return tainted; },
    update(now) {
      if (failed || !video || (Number(video.readyState) || 0) < 2) return null;
      if (now - last < gap) return null;
      last = now;
      try {
        g.drawImage(video, 0, 0, w, h);
        return averageColor(g.getImageData(0, 0, w, h));
      } catch {
        failed = true;
        tainted = true;
        return null;
      }
    },
    dispose() { failed = true; g = null; },
  };
}
