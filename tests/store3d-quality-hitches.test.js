// @vitest-environment jsdom
// Qualitätsautomatik: Hänger (300-ms-Frames) senken die Stufe.
import { describe, it, expect } from 'vitest';
import { AutoQuality } from '../src/js/store3d/engine/quality.js';

describe('Hänger zählen in der Qualitätsautomatik', () => {
  it('Dauerruckeln mit 300-ms-Frames senkt die Stufe', () => {
    const q = new AutoQuality('mid');
    let changed = null;
    let now = 0;
    for (let i = 0; i < 20 && !changed; i++) { now += 300; changed = q.sample(0.3, now); }
    expect(changed).toBe('low');
  });
});

