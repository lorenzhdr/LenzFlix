import { describe, expect, it } from 'vitest';
import {
  RANGES, assertUid, buildQ1, buildQ2, buildQ2b, buildQ3, buildQ4, buildQ5a, buildQ5b, buildQ6a, buildQ6b, buildQ7, normUserId,
} from '../src/stats-sql.js';

const UID = '0123456789abcdef0123456789abcdef';
const builders = [buildQ1, buildQ2, buildQ2b, buildQ3, buildQ4, buildQ5a, buildQ5b, buildQ6a, buildQ6b, buildQ7];

describe('stats-sql', () => {
  it('normUserId entfernt Bindestriche und macht klein', () => {
    expect(normUserId('01234567-89AB-CDEF-0123-456789ABCDEF')).toBe(UID);
  });

  it('assertUid akzeptiert nur 32 Hex klein', () => {
    expect(assertUid(UID)).toBe(UID);
    for (const bad of ["x'; DROP TABLE a;--", UID.toUpperCase(), UID + 'a', UID.slice(1), '', null, undefined, `${UID.slice(0, 31)}g`]) {
      expect(() => assertUid(bad)).toThrow();
    }
  });

  it('alle Builder lehnen Nicht-Hex-UIDs und unbekannte Ranges ab', () => {
    for (const b of builders) {
      expect(() => b("a' OR '1'='1", '30d')).toThrow();
      expect(() => b(UID, "30d'--")).toThrow();
      expect(() => b(UID, 'toString')).toThrow();
    }
  });

  it('alle Builder: nur UID/Range-Fragment als Variablen, ein Statement', () => {
    for (const b of builders) {
      for (const range of Object.keys(RANGES)) {
        const sql = b(UID, range);
        expect(sql).toContain(RANGES[range].where);
        expect(sql).not.toMatch(/;/);
        // UID ist der einzige Literalwert
        const lits = [...sql.matchAll(/'([^']*)'/g)].map((m) => m[1]);
        expect(lits.filter((l) => /^[0-9a-f]{32}$/.test(l)).every((l) => l === UID)).toBe(true);
      }
    }
  });

  it('Q3-Bucket je Range', () => {
    expect(buildQ3(UID, '7d')).toContain('substr(DateCreated,1,10) AS bucket');
    expect(buildQ3(UID, 'year')).toContain("strftime('%Y-%W', substr(DateCreated,1,19)) AS bucket");
    expect(buildQ3(UID, 'all')).toContain('substr(DateCreated,1,7) AS bucket');
  });

  it('Schwelle 300 als Zahl', () => {
    expect(buildQ2(UID, 'all')).toContain('HAVING SUM(PlayDuration) >= 300');
    expect(buildQ5b(UID, 'all')).toContain('LIMIT 3000');
  });
});
