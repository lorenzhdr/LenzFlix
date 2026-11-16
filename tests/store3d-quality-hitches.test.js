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
  it('ein Einzelhänger direkt nach reset() (Shader-Kompilierung) senkt die Stufe nicht', () => {
    const q = new AutoQuality('mid');
    q.reset();
    let now = 0;
    let changed = null;
    changed = q.sample(0.6, now += 600) || changed;
    for (let i = 0; i < 125 && !changed; i++) { now += 16; changed = q.sample(0.016, now); }
    expect(changed).toBeNull();
  });
});
