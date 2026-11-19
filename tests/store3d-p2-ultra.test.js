// @vitest-environment jsdom
// W7 p2: Ultra-Registry (Vorbau nur bei erreichbarem Ultra, Teilschritte, Gate, Warm-Guard), Allokationsfreiheit im Frame-Pfad.
import { describe, it, expect, vi } from 'vitest';
import { createUltra } from '../src/js/store3d/engine/ultra.js';
import { fogTarget } from '../src/js/store3d/modules/city.js';
import { weatherOf } from '../src/js/store3d/world/build-ultra-light.js';

function node() {
  return { visible: true, parent: null, children: [], add(c) { this.children.push(c); c.parent = this; }, removeFromParent() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; } };
}
function setup(level = 'high', { setting, withSetting = true, renderer } = {}) {
  const state = { level, setting: setting || 'auto' };
  const ctx = { scene: node(), quality: () => state.level, opts: { ultraOk: true }, isPhone: false, renderer: renderer || null, camera: renderer ? {} : null };
  if (withSetting) ctx.qualitySetting = () => state.setting;
  const jobs = [];
  const schedule = (fn) => { const j = { fn, cancelled: false, cancel() { this.cancelled = true; } }; jobs.push(j); return j; };
  const u = createUltra(ctx, { schedule });
  const flush = (avail = 100) => { while (jobs.length) { const j = jobs.shift(); if (!j.cancelled) j.fn(avail); } };
  const runOne = (avail = 100) => { const j = jobs.shift(); if (j && !j.cancelled) j.fn(avail); return !!j; };
  return { state, ctx, u, jobs, flush, runOne };
}
const entry = () => { const object = node(); const api = { object, update: vi.fn(), dispose: vi.fn() }; return { api, build: vi.fn(() => api) }; };

describe('Ultra-Vorbau nur bei erreichbarem Ultra (P9)', () => {
  it('fest gewähltes high/mid/low: kein Vorbau, kein Job', () => {
    for (const setting of ['high', 'mid', 'low']) {
      const t = setup('high', { setting });
      const e = entry();
      t.u.api.register('a', e.build);
      t.flush();
      expect(e.build, setting).not.toHaveBeenCalled();
      expect(t.jobs.length).toBe(0);
    }
  });
  it('auto und ultra bauen auf high vor; Wechsel von high auf auto holt den Vorbau nach', () => {
    for (const setting of ['auto', 'ultra']) {
      const t = setup('high', { setting });
      const e = entry();
      t.u.api.register('a', e.build);
      t.flush();
      expect(e.build, setting).toHaveBeenCalledTimes(1);
    }
    const t = setup('high', { setting: 'high' });
    const e = entry();
    t.u.api.register('a', e.build);
    t.flush();
    expect(e.build).not.toHaveBeenCalled();
    t.state.setting = 'auto';
    t.u.onQuality('high');
    t.flush();
    expect(e.build).toHaveBeenCalledTimes(1);
  });
  it('ohne ctx.qualitySetting (ältere Hülle/Tests) gilt wie auto', () => {
    const t = setup('high', { withSetting: false });
    const e = entry();
    t.u.api.register('a', e.build);
    t.flush();
    expect(e.build).toHaveBeenCalledTimes(1);
  });
  it('bereits Gebautes bleibt beim Wechsel auf fest high bestehen, Vorwärmen läuft nicht weiter', () => {
    const renderer = { compileAsync: vi.fn(() => Promise.resolve()), initTexture: vi.fn() };
    const t = setup('high', { setting: 'auto', renderer });
    const e = entry();
    const e2 = entry();
    t.u.api.register('a', e.build);
    t.runOne(); // baut a
    t.u.api.register('b', e2.build);
    t.state.setting = 'high';
    t.u.onQuality('high');
    t.flush();
    expect(e.build).toHaveBeenCalledTimes(1);
    expect(e2.build).not.toHaveBeenCalled();
  });
});

describe('Teilschritte (api.more)', () => {
  it('ein Teilschritt je Häppchen, auch bei Budget 0; Vorwärmen erst nach dem letzten Schritt', async () => {
    const renderer = { compileAsync: vi.fn(() => Promise.resolve()), initTexture: vi.fn() };
    const t = setup('high', { renderer });
    const parts = [];
    let left = 3;
    const object = node();
    const build = vi.fn(() => ({ object, more: () => { parts.push('m'); left -= 1; return left > 0; }, get textures() { return parts.map(() => ({ isTexture: true })); } }));
    t.u.api.register('tex', build);
    t.runOne(0); // Bau
    expect(build).toHaveBeenCalledTimes(1);
    expect(parts.length).toBe(0);
    t.runOne(0);
    expect(parts.length).toBe(1);
    t.runOne(0);
    expect(parts.length).toBe(2);
    expect(renderer.compileAsync).not.toHaveBeenCalled();
    t.runOne(0);
    expect(parts.length).toBe(3);
    expect(renderer.compileAsync).not.toHaveBeenCalled(); // Vorwärmen ist ein EIGENES späteres Häppchen
    t.runOne(0);
    expect(renderer.compileAsync).toHaveBeenCalledTimes(1);
    expect(renderer.initTexture).toHaveBeenCalledTimes(3);
    await Promise.resolve();
    await Promise.resolve();
    expect(t.u.api.list()[0].warm).toBe(true);
    expect(t.jobs.length).toBe(0);
  });
  it('mehrere Teilschritte teilen sich ein Häppchen nur, solange das Budget reicht', () => {
    const t = setup('high');
    let n = 0;
    t.u.api.register('a', () => ({ object: node(), more: () => { n += 1; return n < 4; } }));
    t.runOne(100); // großes Budget: Bau + Teilschritte, bis das Zeitbudget (6 ms) verbraucht oder nichts mehr offen ist
    expect(n).toBe(4);
    expect(t.jobs.length).toBeLessThanOrEqual(1);
  });
  it('Fehler in more() beendet nur die Teilschritte (Eintrag bleibt gebaut)', () => {
    const t = setup('high');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    t.u.api.register('a', () => ({ object: node(), more: () => { throw new Error('x'); } }));
    t.flush();
    expect(t.u.api.list()[0].built).toBe(true);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('Gate (Bereichs-Culling)', () => {
  it('Gate false: unsichtbar und kein update; Wechsel wirkt im nächsten Frame ohne Neubau', () => {
    const t = setup('ultra');
    let open = false;
    const e = entry();
    const onVisible = vi.fn();
    e.api.onVisible = onVisible;
    t.u.api.register('a', e.build, { gate: () => open });
    t.flush();
    expect(e.build).toHaveBeenCalledTimes(1);
    expect(e.api.object.visible).toBe(false);
    t.u.update(0.016, 1);
    expect(e.api.update).not.toHaveBeenCalled();
    open = true;
    t.u.update(0.016, 1.1);
    expect(e.api.object.visible).toBe(true);
    expect(e.api.update).toHaveBeenCalledTimes(1);
    open = false;
    t.u.update(0.016, 1.2);
    expect(e.api.object.visible).toBe(false);
    expect(e.api.update).toHaveBeenCalledTimes(1);
    expect(e.build).toHaveBeenCalledTimes(1);
    expect(onVisible.mock.calls.map((c) => c[0])).toEqual([true, false]);
  });
  it('Gate wirkt nur auf Ultra; ein werfendes Gate zählt als offen', () => {
    const t = setup('high');
    const e = entry();
    t.u.api.register('a', e.build, { gate: () => { throw new Error('x'); } });
    t.flush();
    expect(e.api.object.visible).toBe(false); // high: nie sichtbar
    t.state.level = 'ultra';
    t.u.onQuality('ultra');
    expect(e.api.object.visible).toBe(true);
  });
});

describe('Frame-Pfad ohne Allokation', () => {
  it('fogTarget schreibt in das übergebene Objekt (gleiche Instanz, gleiche Werte wie ohne)', () => {
    const base = { near: 38, far: 58 };
    const out = { near: 0, far: 0 };
    for (const [fog, indoor] of [[0, false], [1, true], [0.5, false], [1, false], [NaN, false]]) {
      const r = fogTarget(base, fog, indoor, out);
      expect(r).toBe(out);
      expect(r).toEqual(fogTarget(base, fog, indoor));
    }
  });
  it('weatherOf liefert je ctx dieselbe Instanz mit aktuellen Werten', () => {
    const w = { tod: 'night', raining: true, cover: 0.4, fog: 0.2 };
    const ctx = { use: (n) => (n === 'weather' ? w : undefined) };
    const a = weatherOf(ctx);
    expect(a).toEqual({ tod: 'night', raining: true, cover: 0.4, fog: 0.2 });
    w.tod = 'day'; w.raining = false; w.cover = NaN; w.fog = 0.9;
    const b = weatherOf(ctx);
    expect(b).toBe(a);
    expect(b).toEqual({ tod: 'day', raining: false, cover: 0, fog: 0.9 });
    expect(weatherOf({ use: () => undefined })).not.toBe(a); // eigene Instanz je ctx
    expect(weatherOf({ use: () => undefined })).toEqual({ tod: 'day', raining: false, cover: 0, fog: 0 });
  });
});
