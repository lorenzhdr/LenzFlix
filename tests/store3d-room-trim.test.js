import { describe, it, expect } from 'vitest';
import { buildLayout } from '../src/js/store3d/world/layout.js';
import { wallTrimSpans } from '../src/js/store3d/world/build-room.js';

function depts(total) {
  let n = 0;
  const take = (c) => Array.from({ length: c }, () => `i${n++}`);
  const out = [];
  ['Action', 'Komödie', 'Drama', 'Horror', 'Krimi'].forEach((g) => out.push({ id: `genre-${g}`, label: g, kind: 'genre', color: '#33aaff', itemIds: take(Math.round(total * 0.12)) }));
  ['Drama', 'Komödie', 'Krimi', 'Mystery', 'Animation', 'Mehr'].forEach((g) => out.push({ id: `series-${g}`, label: `Serien · ${g}`, kind: 'series', color: '#a070ff', itemIds: take(Math.round(total * 0.06)) }));
  return out;
}

describe('Wandleisten hinter Wandregalen', () => {
  for (const big of [true, false]) {
    it(`keine Leiste überlappt ein Wandregal (big=${big})`, () => {
      const L = buildLayout(depts(900), { big });
      const wallRuns = L.runs.filter((r) => r.style === 'wall');
      expect(wallRuns.length).toBeGreaterThan(0);
      for (const side of ['w', 'e']) {
        const spans = wallTrimSpans(L, side, L.d);
        const runs = wallRuns.filter((r) => (side === 'w' ? r.rect.x0 < L.w / 2 : r.rect.x1 > L.w / 2));
        for (const [a, b] of spans) {
          expect(b).toBeGreaterThan(a);
          for (const r of runs) expect(b <= r.rect.z0 || a >= r.rect.z1).toBe(true);
        }
        // Wand ohne Regal bleibt verkleidet
        if (!runs.length) expect(spans).toEqual([[0, L.d]]);
      }
    });
  }
});
