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
  const gap = 1000 / Math.max(1, hz);
  return {
    get failed() { return failed; },
    update(now) {
      if (failed || !video || (Number(video.readyState) || 0) < 2) return null;
      if (now - last < gap) return null;
      last = now;
      try {
        g.drawImage(video, 0, 0, w, h);
        return averageColor(g.getImageData(0, 0, w, h));
      } catch {
        failed = true;
        return null;
      }
    },
    dispose() { failed = true; g = null; },
  };
}
