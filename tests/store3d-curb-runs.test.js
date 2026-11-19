// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { curbRuns } from '../src/js/store3d/world/ultra-plan.js';

// Bordstein-Restlängen (1.19.0 W7): an Querungen unterbrochene Linien dürfen keine Teilstücke unter 0,5 m erzeugen.
const MIN = 0.5;
const blockedIn = (ranges) => ({ blocked: (x, z) => ranges.some(([a, b]) => z >= a && z <= b) });

describe('curbRuns: Mindestlänge und Ränder', () => {
  it('ohne Sperre ein einziger Abschnitt über die ganze Länge, auch bei krummem Ende', () => {
    expect(curbRuns({ blocked: () => false }, 0, 0, 5, 1)).toEqual([[0, 5]]);
    expect(curbRuns({ blocked: () => false }, 0, 0, 1.1, -1)).toEqual([[0, 1.1]]);
  });

  it('ein Rest unter der Mindestlänge am Anfang oder Ende entfällt, ein langer bleibt', () => {
    // Sperre bei 0,3..0,6: davor 0,25 m (entfällt), danach 4,4 m
    const r = curbRuns(blockedIn([[0.3, 0.6]]), 0, 0, 5, 1);
    expect(r.length).toBe(1);
    expect(r[0][0]).toBeGreaterThanOrEqual(0.6);
    expect(r[0][1]).toBe(5);
    // Sperre bei 4,6..5: davor 4,5 m bleibt, Rest am Ende ist leer
    const e = curbRuns(blockedIn([[4.6, 5]]), 0, 0, 5, 1);
    expect(e.length).toBe(1);
    expect(e[0][0]).toBe(0);
    expect(e[0][1]).toBeLessThanOrEqual(4.6);
  });

  it('Eigenschaft: bei vielen Sperrmustern ist jedes Stück >= 0,5 m, geordnet, überlappungsfrei und im Bereich', () => {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let t = 0; t < 200; t++) {
      const z0 = Math.round(rnd() * 20) / 4;
      const z1 = z0 + 0.3 + rnd() * 9;
      const ranges = [];
      for (let k = Math.floor(rnd() * 4); k > 0; k--) { const a = z0 + rnd() * (z1 - z0); ranges.push([a, a + rnd() * 1.5]); }
      const runs = curbRuns(blockedIn(ranges), 0, z0, z1, rnd() < 0.5 ? 1 : -1);
      let prevEnd = -Infinity;
      for (const [a, b] of runs) {
        expect(b - a).toBeGreaterThanOrEqual(MIN - 1e-9);
        expect(a).toBeGreaterThanOrEqual(z0 - 1e-9);
        expect(b).toBeLessThanOrEqual(z1 + 1e-9);
        expect(a).toBeGreaterThanOrEqual(prevEnd - 1e-9);
        prevEnd = b;
      }
    }
  });
});
