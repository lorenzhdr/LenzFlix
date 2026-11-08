// LenzFlix: Farbextraktion für die Ambient-Farbe (reine Funktionen, ohne DOM).

export const DEFAULT_AMBIENT = [27, 40, 41];

/** r,g,b (0..255) -> [h (0..360), s (0..1), l (0..1)] */
export function rgbToHsl(r, g, b) {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h;
  if (max === R) h = ((G - B) / d) % 6;
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  h *= 60;
  if (h < 0) h += 360;
  return [h, s, l];
}

/** [h (0..360), s, l] -> [r,g,b] (gerundet) */
export function hslToRgb(h, s, l) {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r, g, b;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return [r, g, b].map((v) => Math.round((v + m) * 255));
}

/**
 * Dominante, gesättigte Farbe aus RGBA-Pixeldaten (flaches Array/Uint8ClampedArray).
 * Quantisierung 4 Bit/Kanal, Gewicht = Häufigkeit x Sättigung; sehr dunkle/helle/transparente Pixel zählen nicht.
 * Rückgabe: [r,g,b] oder null, wenn keine verwertbaren Pixel.
 */
export function dominantColor(rgba) {
  const buckets = new Map();
  for (let i = 0; i + 3 < rgba.length; i += 4) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2], a = rgba[i + 3];
    if (a < 128) continue;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 510;
    if (l < 0.08 || l > 0.92) continue;
    const d = (max - min) / 255;
    const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
    const w = s + 0.05;
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    let e = buckets.get(key);
    if (!e) buckets.set(key, (e = { w: 0, r: 0, g: 0, b: 0 }));
    e.w += w;
    e.r += r * w;
    e.g += g * w;
    e.b += b * w;
  }
  let best = null;
  for (const e of buckets.values()) if (!best || e.w > best.w) best = e;
  if (!best) return null;
  return [Math.round(best.r / best.w), Math.round(best.g / best.w), Math.round(best.b / best.w)];
}

/** Klemmt eine Farbe für den dunklen Ambient-Verlauf: Helligkeit 0.18–0.24, Sättigung <= 0.55. */
export function clampAmbient([r, g, b], { lMin = 0.18, lMax = 0.24, sMax = 0.55 } = {}) {
  const [h, s, l] = rgbToHsl(r, g, b);
  return hslToRgb(h, Math.min(s, sMax), Math.min(lMax, Math.max(lMin, l)));
}

/** Kombination: Pixel -> geklemmte Ambient-Farbe (Fallback: neutrale Standardfarbe). */
export function ambientFromPixels(rgba) {
  const dom = dominantColor(rgba);
  return dom ? clampAmbient(dom) : DEFAULT_AMBIENT.slice();
}
