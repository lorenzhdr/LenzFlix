import { describe, it, expect } from 'vitest';
import { shelfSpec } from '../src/js/store3d/world/layout.js';
import { BASE, SWATCH_Y, SWATCH_W, SWATCH_H, SWATCH_COLORS, cellUV, slotCell, swatchUV } from '../src/js/store3d/covers/atlasmap.js';

describe('store3d atlasmap', () => {
  for (const big of [false, true]) {
    const spec = shelfSpec(big);
    describe(big ? 'große Hüllen (6 Spalten)' : 'normale Hüllen (7 Spalten)', () => {
      it('Zellen liegen innerhalb 1024 und kollidieren nicht mit dem Farbfeldstreifen', () => {
        expect(spec.cols * spec.cellW).toBeLessThanOrEqual(BASE);
        for (const rows of [spec.rowsTall, spec.rowsLow]) expect(rows * spec.cellH).toBeLessThanOrEqual(SWATCH_Y);
        expect(SWATCH_Y + SWATCH_H).toBeLessThanOrEqual(BASE);
        expect(SWATCH_COLORS.length * SWATCH_W).toBeLessThanOrEqual(BASE);
      });

      it('cellUV: alle Slots in [0,1], überlappungsfrei, V-Bereich über dem Streifen', () => {
        const swV = 1 - SWATCH_Y / BASE; // obere Streifenkante in UV
        const seen = [];
        for (let idx = 0; idx < spec.cols * spec.rowsTall; idx++) {
          const { col, row } = slotCell(idx, spec);
          expect(col).toBeLessThan(spec.cols);
          const [u0, v0, u1, v1] = cellUV(col, row, spec);
          expect(u0).toBeGreaterThanOrEqual(0);
          expect(u1).toBeLessThanOrEqual(1);
          expect(v1).toBeLessThanOrEqual(1);
          expect(v0).toBeGreaterThanOrEqual(swV - 1e-9);
          for (const o of seen) expect(u0 < o[2] - 1e-9 && u1 > o[0] + 1e-9 && v0 < o[3] - 1e-9 && v1 > o[1] + 1e-9).toBe(false);
          seen.push([u0, v0, u1, v1]);
        }
        // Farbfeld-Mittelpunkte liegen im Streifen, nicht in einer Zelle
        for (let i = 0; i < SWATCH_COLORS.length; i++) {
          const [u, v] = swatchUV(i);
          expect(v).toBeLessThan(swV);
          expect(seen.some((o) => u > o[0] && u < o[2] && v > o[1] && v < o[3])).toBe(false);
        }
      });

      it('Zellen-Seitenverhältnis passt zur Hülle', () => {
        const ratioCell = spec.cellW / spec.cellH;
        const ratioCover = spec.cover.w / spec.cover.h;
        expect(Math.abs(ratioCell - ratioCover) / ratioCover).toBeLessThan(0.06);
      });
    });
  }
});
