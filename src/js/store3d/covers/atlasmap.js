// VIDEOTHEK LENZ · Atlas-Layout (rein): Zellen laut Regal-Spezifikation (shelfSpec: normal 7 × 5 à 146 × 200 px, groß 6 × 4 à 170 × 240 px)
// auf einem 1024²-Raster (skaliert für andere Atlasgrößen), darunter (ab SWATCH_Y) ein Streifen mit Farbfeldern für
// Hüllenränder/Seiten (Mittelpunkt-Abtastung, deshalb keine Texturkanten nötig).
import { shelfSpec } from '../world/layout.js';

export const BASE = 1024;
export const CELL_W = 146; // Normal-Werte, andere Spezifikation: spec.cellW/cellH
export const CELL_H = 200;
export const SWATCH_Y = 1004;
export const SWATCH_W = 40;
export const SWATCH_H = 20;
// 0 VHS-Pappe, 1 DVD blau, 2 DVD schwarz, 3 Box-Set gold, 4 Hülle dunkel
export const SWATCH_COLORS = ['#e2d8bd', '#1d3f9c', '#101012', '#c9a227', '#1a1a20'];

/** UV-Rechteck [u0, v0, u1, v1] einer Zelle (Zeile 0 = oben). */
export function cellUV(col, row, spec = shelfSpec(false)) {
  const cw = spec.cellW;
  const ch = spec.cellH;
  return [(col * cw) / BASE, 1 - ((row + 1) * ch) / BASE, ((col + 1) * cw) / BASE, 1 - (row * ch) / BASE];
}

export function slotCell(idx, spec = shelfSpec(false)) {
  return { col: idx % spec.cols, row: Math.floor(idx / spec.cols) };
}

/** UV-Punkt (Mitte) eines Farbfelds. */
export function swatchUV(i) {
  return [(i * SWATCH_W + SWATCH_W / 2) / BASE, 1 - (SWATCH_Y + SWATCH_H / 2) / BASE];
}

/** Farbfeld-Index je Medientyp und Titel-Hash. */
export function swatchFor(media, h) {
  if (media === 'vhs') return 0;
  if (media === 'box') return 3;
  return h % 3 === 0 ? 2 : 1;
}
