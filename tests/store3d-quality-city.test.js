import { describe, it, expect } from 'vitest';
import { presetFor } from '../src/js/store3d/engine/quality.js';

const KEYS = ['npcMax', 'carsMax', 'propsMax', 'birds', 'rainLines', 'precip'];

describe('Qualitätsstufen: Dichte der Außenwelt', () => {
  for (const phone of [false, true]) {
    it(`Schlüssel steigen monoton low <= mid <= high (${phone ? 'Handy' : 'Desktop'})`, () => {
      const [lo, mid, hi] = ['low', 'mid', 'high'].map((l) => presetFor(l, phone));
      for (const k of KEYS) {
        expect(lo[k], k).toBeLessThanOrEqual(mid[k]);
        expect(mid[k], k).toBeLessThanOrEqual(hi[k]);
      }
      expect(lo.rainLines).toBe(0);
      expect(lo.precip).toBeGreaterThan(0); // Niederschlag auch auf low (1.19.0)
      expect(lo.precip).toBeLessThan(mid.precip);
      expect(mid.precip).toBeLessThan(hi.precip);
      expect(lo.birds).toBe(0);
      expect(lo.fogNear).toBeLessThanOrEqual(mid.fogNear);
      expect(mid.fogNear).toBeLessThanOrEqual(hi.fogNear);
    });
  }

  it('Handy <= Desktop je Stufe', () => {
    for (const l of ['low', 'mid', 'high']) {
      const d = presetFor(l, false);
      const p = presetFor(l, true);
      for (const k of KEYS) expect(p[k], `${l}.${k}`).toBeLessThanOrEqual(d[k]);
    }
  });

  it('Nebel endet vor der Himmelskuppel (60 m) und beginnt nach dem Laden-Innenraum', () => {
    for (const l of ['low', 'mid', 'high']) {
      const p = presetFor(l);
      expect(p.fogFar).toBeLessThan(60);
      expect(p.fogNear).toBeGreaterThan(30);
      expect(p.fogNear).toBeLessThan(p.fogFar);
    }
  });

  it('bestehende Felder bleiben unverändert', () => {
    expect(presetFor('low', false)).toMatchObject({ level: 'low', pixelRatio: 0.9, shadows: false, anisotropy: 1, atlas: 512, maxAtlases: 32, loadRadius: 11, signMips: false });
    expect(presetFor('mid', true)).toMatchObject({ level: 'mid', pixelRatio: 1.25, atlas: 1024, maxAtlases: 14, loadRadius: 13, signMips: true });
    expect(presetFor('high', false)).toMatchObject({ level: 'high', pixelRatio: 1.75, shadows: true, maxAtlases: 56, loadRadius: 28 });
  });
});
