// VIDEOTHEK LENZ: Qualitätsautomatik darf nach einem Hochschalten nicht bei 50–57 fps auf „high“ hängen bleiben.
import { describe, it, expect } from 'vitest';
import { AutoQuality } from '../src/js/store3d/engine/quality.js';

/** Simuliert `seconds` Sekunden mit konstanter Bildrate; gibt alle Stufenwechsel zurück. */
function run(q, fps, seconds, t0) {
  const dt = 1 / fps;
  const changes = [];
  let now = t0;
  for (let i = 0; i < Math.round(seconds * fps); i++) {
    now += dt * 1000;
    const c = q.sample(dt, now);
    if (c) changes.push(c);
  }
  return { changes, now };
}

describe('AutoQuality', () => {
  it('schaltet nach 10 s stabil ≥ 58 fps hoch und bei spürbarem Einbruch zurück, danach bleibt high gesperrt', () => {
    const q = new AutoQuality('mid');
    let r = run(q, 60, 12, 0);
    expect(r.changes).toEqual(['high']);
    r = run(q, 53, 6, r.now); // auf high nur 53 fps: über der 50er-Schwelle, aber deutlich schlechter
    expect(r.changes).toEqual(['mid']);
    r = run(q, 60, 60, r.now); // wieder flüssig: kein erneutes Hochschalten (Decke gesperrt)
    expect(r.changes).toEqual([]);
    expect(q.level).toBe('mid');
  });

  it('bleibt auf high, wenn es dort weiter flüssig läuft', () => {
    const q = new AutoQuality('mid');
    let r = run(q, 60, 12, 0);
    r = run(q, 59, 30, r.now);
    expect(q.level).toBe('high');
    expect(r.changes).toEqual([]);
  });

  it('schaltet unter 50 fps herunter', () => {
    const q = new AutoQuality('mid');
    const r = run(q, 30, 3, 0);
    expect(r.changes).toEqual(['low']);
  });
});
