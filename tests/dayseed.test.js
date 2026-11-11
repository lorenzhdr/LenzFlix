import { describe, it, expect } from 'vitest';
import { dayKey, hashString, seededRandom, seededShuffle } from '../src/js/core/dayseed.js';

describe('dayseed', () => {
  it('dayKey: lokales Datum YYYY-MM-DD', () => {
    expect(dayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(dayKey(new Date(2026, 10, 11))).toBe('2026-11-11');
  });
  it('hashString ist stabil', () => {
    expect(hashString('a')).toBe(hashString('a'));
    expect(hashString('a')).not.toBe(hashString('b'));
  });
  it('seededRandom: deterministisch, in [0,1)', () => {
    const a = seededRandom('x');
    const b = seededRandom('x');
    for (let i = 0; i < 20; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
  it('seededShuffle: Permutation, deterministisch, Original unverändert', () => {
    const list = Array.from({ length: 20 }, (_, i) => i);
    const s1 = seededShuffle(list, '2026-11-11');
    expect(s1).toEqual(seededShuffle(list, '2026-11-11'));
    expect([...s1].sort((x, y) => x - y)).toEqual(list);
    expect(s1).not.toEqual(seededShuffle(list, '2026-11-12'));
    expect(list[0]).toBe(0);
    expect(seededShuffle(null, 'x')).toEqual([]);
  });
});
