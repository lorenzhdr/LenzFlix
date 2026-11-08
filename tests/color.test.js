import { describe, it, expect } from 'vitest';
import { dominantColor, clampAmbient, rgbToHsl, ambientFromPixels, DEFAULT_AMBIENT } from '../src/js/core/color.js';

const px = (r, g, b, n) => Array.from({ length: n }, () => [r, g, b, 255]).flat();

describe('color', () => {
  it('dominantColor: bevorzugt gesättigte Farbe vor Grau', () => {
    const data = [...px(128, 128, 128, 50), ...px(0, 180, 180, 20)];
    const [r, g, b] = dominantColor(data);
    expect(r).toBeLessThan(20);
    expect(g).toBeGreaterThan(150);
    expect(b).toBeGreaterThan(150);
  });
  it('ignoriert sehr dunkle, helle und transparente Pixel', () => {
    expect(dominantColor([...px(0, 0, 0, 10), ...px(255, 255, 255, 10), 200, 0, 0, 0])).toBeNull();
  });
  it('clampAmbient: Helligkeit 0.18-0.24, Sättigung <= 0.55', () => {
    const [, s, l] = rgbToHsl(...clampAmbient([0, 180, 180]));
    expect(l).toBeGreaterThanOrEqual(0.17);
    expect(l).toBeLessThanOrEqual(0.25);
    expect(s).toBeLessThanOrEqual(0.56);
    const [, , l2] = rgbToHsl(...clampAmbient([10, 5, 5]));
    expect(l2).toBeGreaterThanOrEqual(0.17);
  });
  it('Teal bleibt Teal', () => {
    const [r, g, b] = ambientFromPixels(px(0, 200, 190, 30));
    expect(g).toBeGreaterThan(r + 30);
    expect(b).toBeGreaterThan(r + 30);
  });
  it('Fallback bei leeren Pixeln', () => {
    expect(ambientFromPixels([])).toEqual(DEFAULT_AMBIENT);
  });
});
