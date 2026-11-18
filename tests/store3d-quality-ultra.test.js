// @vitest-environment jsdom
// Qualitätsstufe „ultra“ (1.19.0): Rang, Preset, Automatik mit Decke, Pause-Zyklus, Prefs, Klemmung ohne Freigabe.
import { describe, it, expect, vi } from 'vitest';
import { LEVELS, rank, atLeast, presetFor, AutoQuality } from '../src/js/store3d/engine/quality.js';
import { createPause } from '../src/js/store3d/ui/pause.js';
import { StoreApp, resolveLevel } from '../src/js/store3d/store.js';
import * as prefs from '../src/js/features/store/prefs.js';
import { mirrorHz } from '../src/js/store3d/world/mirror.js';
import { lodFor } from '../src/js/store3d/net/peers-logic.js';
import { shelfRange } from '../src/js/store3d/modules/city.js';

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

describe('rank / atLeast', () => {
  it('Reihenfolge low < mid < high < ultra', () => {
    expect(LEVELS).toEqual(['low', 'mid', 'high', 'ultra']);
    expect(['low', 'mid', 'high', 'ultra'].map(rank)).toEqual([0, 1, 2, 3]);
  });
  it('unbekannt zählt wie mid', () => {
    expect(rank('quatsch')).toBe(rank('mid'));
    expect(rank(undefined)).toBe(1);
    expect(atLeast('xyz', 'mid')).toBe(true);
    expect(atLeast('xyz', 'high')).toBe(false);
  });
  it('atLeast trifft high und ultra', () => {
    expect(atLeast('ultra', 'high')).toBe(true);
    expect(atLeast('high', 'high')).toBe(true);
    expect(atLeast('mid', 'high')).toBe(false);
    expect(atLeast('high', 'ultra')).toBe(false);
  });
});

describe('presetFor ultra', () => {
  it('Desktop übertrifft high in Dichten, Anisotropie, Pixeldichte und Budget', () => {
    const h = presetFor('high', false);
    const u = presetFor('ultra', false);
    expect(u.level).toBe('ultra');
    expect(u.anisotropy).toBeGreaterThan(h.anisotropy);
    expect(u.pixelRatio).toBeGreaterThan(h.pixelRatio);
    expect(u.maxAtlases).toBeGreaterThan(h.maxAtlases);
    expect(u.loadRadius).toBeGreaterThan(h.loadRadius);
    expect(u.shadows).toBe(true);
    for (const k of ['npcMax', 'carsMax', 'propsMax', 'birds', 'precip']) expect(u[k], k).toBeGreaterThan(h[k]);
    expect(u.hiMax).toBeGreaterThan(4);
  });
  it('Handy und XR-Budget: exakt wie high', () => {
    expect(presetFor('ultra', true)).toEqual(presetFor('high', true));
    expect(presetFor('ultra', true).level).toBe('high');
  });
  it('abhängige Tabellen kennen ultra (mindestens wie high)', () => {
    expect(mirrorHz('ultra')).toBeGreaterThan(mirrorHz('high'));
    expect(lodFor('ultra', false, false).max).toBeGreaterThan(lodFor('high', false, false).max);
    expect(lodFor('ultra', false, false).coverDist).toBeGreaterThan(lodFor('high', false, false).coverDist);
    expect(shelfRange('ultra')).toBeGreaterThan(shelfRange('high'));
  });
});

describe('AutoQuality mit ultra', () => {
  it('steigt von high bis ultra und bleibt dort', () => {
    const q = new AutoQuality('mid');
    let r = run(q, 60, 40, 0);
    expect(r.changes).toEqual(['high', 'ultra']);
    r = run(q, 60, 30, r.now);
    expect(r.changes).toEqual([]);
    expect(q.level).toBe('ultra');
  });
  it('respektiert max high (Decke) und klemmt setLevel', () => {
    const q = new AutoQuality('mid', { max: 'high' });
    const r = run(q, 60, 60, 0);
    expect(r.changes).toEqual(['high']);
    q.setLevel('ultra');
    expect(q.level).toBe('high');
    expect(new AutoQuality('ultra', { max: 'high' }).level).toBe('high');
  });
  it('fällt von ultra bei < 50 fps um eine Stufe und sperrt nach schnellem Rückfall die Decke', () => {
    const q = new AutoQuality('high');
    let r = run(q, 60, 12, 0);
    expect(r.changes).toEqual(['ultra']);
    r = run(q, 40, 3, r.now);
    expect(r.changes).toEqual(['high']);
    r = run(q, 60, 60, r.now);
    expect(r.changes).toEqual([]);
    expect(q.level).toBe('high');
  });
  it('Einschwingen nach reset() ist zeitbasiert (>= 1,5 s Echtzeit, nicht 3 Frames)', () => {
    const q = new AutoQuality('mid');
    q.reset();
    let now = 0;
    // 100 Frames à 10 ms = 1 s: noch Einschwingen, danach 20 Hänger-Frames à 0,3 s würden sonst sofort „low“ auslösen
    for (let i = 0; i < 100; i++) expect(q.sample(0.01, (now += 10))).toBeNull();
    expect(q.settleLeft).toBeGreaterThan(0);
    // Nachlade-Hänger direkt nach dem Stufenwechsel: 0,45 s Einschwingen übrig, ein 0,6-s-Hänger verbraucht es
    expect(q.sample(0.6, (now += 600))).toBeNull();
    expect(q.settleLeft).toBeLessThanOrEqual(0);
    let changed = null;
    for (let i = 0; i < 100 && !changed; i++) changed = q.sample(0.016, (now += 16));
    expect(changed).toBeNull();
  });
});

describe('Pause-Menü Zyklus', () => {
  function cycle(canUltra) {
    const host = document.createElement('div');
    document.body.appendChild(host);
    let cur = 'auto';
    const noop = () => {};
    const p = createPause(host, {
      onResume: noop, onSearch: noop, onClassic: noop, onQuality: (x) => { cur = x; }, onSound: noop, onFps: noop, onBigCovers: noop, onTheme: noop, onMenu: noop,
      getQuality: () => cur, getSound: () => true, getFps: () => false, getBigCovers: () => false,
      ...(canUltra === undefined ? {} : { canUltra: () => canUltra }),
    });
    const btn = [...host.querySelectorAll('.lfx-store-pause-panel > button')].find((b) => b.textContent.startsWith('Qualität'));
    const seq = [btn.textContent];
    for (let i = 0; i < 5; i++) { btn.click(); seq.push(btn.textContent); }
    p.destroy();
    return seq;
  }
  it('mit canUltra: auto → Niedrig → Mittel → Hoch → Ultra → Auto', () => {
    expect(cycle(true)).toEqual(['Qualität: Auto', 'Qualität: Niedrig', 'Qualität: Mittel', 'Qualität: Hoch', 'Qualität: Ultra', 'Qualität: Auto']);
  });
  it('ohne canUltra (false oder fehlend): Hoch → Auto', () => {
    expect(cycle(false)).toEqual(['Qualität: Auto', 'Qualität: Niedrig', 'Qualität: Mittel', 'Qualität: Hoch', 'Qualität: Auto', 'Qualität: Niedrig']);
    expect(cycle(undefined).slice(0, 5)).toEqual(cycle(false).slice(0, 5));
  });
});

describe('Prefs', () => {
  it('QUALITIES enthält ultra, Speichern und Lesen von ultra funktionieren', () => {
    expect(prefs.QUALITIES).toContain('ultra');
    prefs.savePrefs({ quality: 'ultra' });
    expect(prefs.getQuality()).toBe('ultra');
    prefs.savePrefs({ quality: 'auto' });
  });
});

describe('Klemmung im Store ohne ultraOk', () => {
  it('resolveLevel: ultra nur mit Freigabe, sonst high', () => {
    expect(resolveLevel('ultra', true)).toBe('ultra');
    expect(resolveLevel('ultra', false)).toBe('high');
    expect(resolveLevel('auto', true)).toBe('mid');
  });
  const fake = (ultraOk) => {
    const engine = { setAuto: vi.fn(), setLevel: vi.fn((l) => ({ level: l })), preset: { level: 'mid' } };
    return Object.assign(Object.create(StoreApp.prototype), { engine, ultraOk, xr: null, applyPreset: vi.fn(), qualitySetting: 'auto' });
  };
  it('setQuality("ultra") ohne ultraOk wird high', () => {
    const a = fake(false);
    a.setQuality('ultra');
    expect(a.qualitySetting).toBe('high');
    expect(a.engine.setLevel).toHaveBeenCalledWith('high');
  });
  it('setQuality("ultra") mit ultraOk bleibt ultra', () => {
    const a = fake(true);
    a.setQuality('ultra');
    expect(a.qualitySetting).toBe('ultra');
    expect(a.engine.setLevel).toHaveBeenCalledWith('ultra');
  });
  it('in VR nur low/mid, auch bei ultra', () => {
    const a = fake(true);
    a.xr = { presenting: true };
    a.setQuality('ultra');
    expect(a.qualitySetting).toBe('mid');
  });
});

describe('Ultra-Sichtweite vs. Himmelskuppel', () => {
  it('Nebelende liegt vor der Kuppel (kein harter Horizont)', async () => {
    const { FAR_R } = await import('../src/js/store3d/modules/outdoor.js');
    for (const lv of LEVELS) {
      const c = presetFor(lv, false);
      expect(c.fogNear).toBeLessThan(c.fogFar);
      expect(c.fogFar).toBeLessThanOrEqual(FAR_R - 1);
    }
  });
});
