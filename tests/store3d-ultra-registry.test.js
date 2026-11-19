// @vitest-environment jsdom
// Ultra-Registry (engine/ultra.js): lazy Bau im Leerlauf, Sichtbarkeit je Stufe, ufx-Filter, dispose, update nur sichtbar.
import { describe, it, expect, vi } from 'vitest';
import { createUltra, parseUfx } from '../src/js/store3d/engine/ultra.js';

function node() {
  const o = { visible: true, parent: null, children: [], add(c) { this.children.push(c); c.parent = this; }, removeFromParent() { if (this.parent) this.parent.children = this.parent.children.filter((x) => x !== this); this.parent = null; } };
  return o;
}
function setup(level = 'mid', dev, extra = {}) {
  const state = { level };
  const scene = node();
  const ctx = { scene, quality: () => state.level, opts: { ultraOk: true, ...(dev ? { dev } : {}), ...(extra.opts || {}) }, isPhone: !!extra.isPhone };
  const jobs = [];
  const schedule = (fn) => { const j = { fn, cancelled: false, cancel() { this.cancelled = true; } }; jobs.push(j); return j; };
  const u = createUltra(ctx, { schedule });
  const flush = (avail = 100) => { while (jobs.length) { const j = jobs.shift(); if (!j.cancelled) j.fn(avail); } };
  const setLevel = (l) => { state.level = l; u.onQuality(l); };
  return { state, scene, u, jobs, flush, setLevel };
}
const entry = () => { const object = node(); const api = { object, update: vi.fn(), dispose: vi.fn() }; return { api, build: vi.fn(() => api) }; };

describe('Ultra-Registry', () => {
  it('baut nichts auf mid/low, lazy ab high im Leerlauf', () => {
    const t = setup('mid');
    const e = entry();
    t.u.api.register('a', e.build);
    expect(t.jobs.length).toBe(0);
    t.flush();
    expect(e.build).not.toHaveBeenCalled();
    t.setLevel('high');
    expect(e.build).not.toHaveBeenCalled(); // erst im Leerlauf-Häppchen, nicht synchron
    t.flush();
    expect(e.build).toHaveBeenCalledTimes(1);
    expect(t.u.api.list()[0]).toMatchObject({ key: 'a', built: true, visible: false });
  });
  it('ohne ultraOk (Handy/TV laut Hülle) wird auf high nichts vorab gebaut', () => {
    for (const extra of [{ opts: { ultraOk: false } }, { opts: { ultraOk: false }, isPhone: true }]) {
      const t = setup('high', undefined, extra);
      const e = entry();
      t.u.api.register('a', e.build);
      t.flush();
      t.setLevel('high');
      t.flush();
      expect(e.build).not.toHaveBeenCalled();
      expect(t.jobs.length).toBe(0);
    }
  });
  it('ultraAuto false (Absturzschutz): Einstellung auto baut auf high nichts vorab, Einstellung ultra schon', () => {
    const mk = (setting) => {
      const state = { level: 'high' };
      const ctx = { scene: { add() {} }, quality: () => state.level, qualitySetting: () => setting, opts: { ultraOk: true, ultraAuto: false } };
      const jobs = [];
      const u = createUltra(ctx, { schedule: (fn) => { const j = { fn, cancel() {} }; jobs.push(j); return j; } });
      const e = entry();
      u.api.register('a', e.build);
      while (jobs.length) jobs.shift().fn(100);
      return e.build;
    };
    expect(mk('auto')).not.toHaveBeenCalled();
    expect(mk(undefined)).not.toHaveBeenCalled();
    expect(mk('ultra')).toHaveBeenCalledTimes(1);
  });
  it('Tablet (isPhone, aber ultraOk) baut auf high vorab', () => {
    const t = setup('high', undefined, { isPhone: true });
    const e = entry();
    t.u.api.register('a', e.build);
    t.flush();
    expect(e.build).toHaveBeenCalledTimes(1);
  });
  it('Sichtbarkeit nur auf ultra; Umschalten baut nie neu', () => {
    const t = setup('high');
    const e = entry();
    t.u.api.register('a', e.build);
    t.flush();
    expect(e.api.object.visible).toBe(false);
    t.setLevel('ultra');
    expect(e.api.object.visible).toBe(true);
    expect(t.u.api.isActive()).toBe(true);
    t.setLevel('high');
    expect(e.api.object.visible).toBe(false);
    t.setLevel('ultra');
    expect(e.build).toHaveBeenCalledTimes(1);
  });
  it('baut ab ultra auch direkt (ohne vorheriges high) und hängt das Objekt in die Szene', () => {
    const t = setup('ultra');
    const e = entry();
    t.u.api.register('a', e.build);
    t.flush();
    expect(e.api.object.visible).toBe(true);
    expect(t.scene.children).toContain(e.api.object);
  });
  it('Häppchen: mehrere Einträge werden über mehrere Leerlauf-Läufe verteilt, wenn das Zeitbudget fehlt', () => {
    const t = setup('high');
    const es = [entry(), entry(), entry()];
    es.forEach((e, i) => t.u.api.register('k' + i, e.build));
    const j = t.jobs.shift();
    j.fn(0); // kein Zeitbudget: genau ein Eintrag
    expect(es.filter((e) => e.build.mock.calls.length).length).toBe(1);
    expect(t.jobs.length).toBe(1); // Rest geplant
    t.flush();
    expect(es.every((e) => e.build.mock.calls.length === 1)).toBe(true);
  });
  it('update nur für gebaute, sichtbare Einträge', () => {
    const t = setup('high');
    const e = entry();
    t.u.api.register('a', e.build);
    t.u.update(0.016, 1);
    t.flush();
    t.u.update(0.016, 1);
    expect(e.api.update).not.toHaveBeenCalled(); // high: gebaut, aber unsichtbar
    t.setLevel('ultra');
    t.u.update(0.016, 2);
    expect(e.api.update).toHaveBeenCalledWith(0.016, 2);
    t.setLevel('mid');
    t.u.update(0.016, 3);
    expect(e.api.update).toHaveBeenCalledTimes(1);
  });
  it('ufx: -key schaltet aus, only:key zeigt nur dieses', () => {
    expect(parseUfx('-a, -b')).toEqual({ off: new Set(['a', 'b']), only: null });
    expect(parseUfx('only:c').only).toBe('c');
    const t = setup('ultra', { ufx: '-a' });
    const a = entry(); const b = entry();
    t.u.api.register('a', a.build);
    t.u.api.register('b', b.build);
    t.flush();
    expect(a.build).not.toHaveBeenCalled();
    expect(b.api.object.visible).toBe(true);
    const t2 = setup('ultra', { ufx: 'only:b' });
    const a2 = entry(); const b2 = entry();
    t2.u.api.register('a', a2.build);
    t2.u.api.register('b', b2.build);
    t2.flush();
    expect(a2.build).not.toHaveBeenCalled();
    expect(b2.api.object.visible).toBe(true);
  });
  it('has/keys/list und doppelte Schlüssel', () => {
    const t = setup('mid');
    const e = entry();
    t.u.api.register('a', e.build);
    t.u.api.register('a', entry().build);
    expect(t.u.api.has('a')).toBe(true);
    expect(t.u.api.keys()).toEqual(['a']);
    expect(t.u.api.list()).toEqual([{ key: 'a', built: false, visible: false, ms: 0, warm: false }]);
  });
  it('fehlerhafter Bau wird übersprungen, andere Einträge laufen weiter', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const t = setup('high');
    const good = entry();
    t.u.api.register('bad', () => { throw new Error('x'); });
    t.u.api.register('good', good.build);
    t.flush();
    expect(good.build).toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
  it('dispose und remove räumen auf, danach wird nichts mehr gebaut', () => {
    const t = setup('high');
    const a = entry(); const b = entry();
    const rm = t.u.api.register('a', a.build);
    t.u.api.register('b', b.build);
    t.flush();
    rm();
    expect(a.api.dispose).toHaveBeenCalledTimes(1);
    expect(t.u.api.has('a')).toBe(false);
    const c = entry();
    t.u.api.register('c', c.build);
    t.u.dispose();
    expect(b.api.dispose).toHaveBeenCalledTimes(1);
    t.flush();
    expect(c.build).not.toHaveBeenCalled();
    expect(t.u.api.keys()).toEqual([]);
  });
});

describe('Ultra-Registry: Vorab-Kompilierung', () => {
  function mk(renderer) {
    const ctx = { scene: node(), quality: () => 'ultra', opts: { ultraOk: true }, isPhone: false, renderer, camera: { cam: 1 } };
    const jobs = [];
    const u = createUltra(ctx, { schedule: (fn) => { const j = { fn, cancel() {} }; jobs.push(j); return j; } });
    return { u, jobs };
  }
  it('warmt nach dem Bau in einem eigenen Häppchen, stellt Sichtbarkeit wieder her und lädt api.textures hoch', async () => {
    const seen = [];
    const renderer = { compileAsync: vi.fn((obj) => { seen.push([obj.visible, obj.children[0].visible]); return Promise.resolve(); }), initTexture: vi.fn() };
    const { u, jobs } = mk(renderer);
    const tex = { isTexture: true };
    const child = node(); child.visible = false;
    const object = node(); object.add(child);
    object.traverse = (f) => { f(object); f(child); };
    u.api.register('a', () => ({ object, textures: [tex] }));
    jobs.shift().fn(100); // Bau-Häppchen
    expect(renderer.compileAsync).not.toHaveBeenCalled();
    expect(object.visible).toBe(true);
    expect(jobs.length).toBe(1);
    jobs.shift().fn(100); // Warm-Häppchen
    expect(renderer.compileAsync).toHaveBeenCalledTimes(1);
    expect(renderer.compileAsync.mock.calls[0][0]).toBe(object);
    expect(seen).toEqual([[true, true]]);
    expect(renderer.initTexture).toHaveBeenCalledWith(tex);
    expect(child.visible).toBe(false); // wie vorher
    await Promise.resolve();
    expect(u.api.list()[0].warm).toBe(true);
    expect(jobs.length).toBe(0); // nur einmal
  });
  it('ein Eintrag je Warm-Häppchen; Renderer-Fehler werden geschluckt', async () => {
    const renderer = { compileAsync: vi.fn(() => { throw new Error('boom'); }), initTexture: vi.fn() };
    const { u, jobs } = mk(renderer);
    for (const k of ['a', 'b']) u.api.register(k, () => ({ object: node() }));
    jobs.shift().fn(100); // baut beide (Budget groß)
    expect(renderer.compileAsync).not.toHaveBeenCalled();
    jobs.shift().fn(100);
    expect(renderer.compileAsync).toHaveBeenCalledTimes(1);
    while (jobs.length) jobs.shift().fn(100);
    expect(renderer.compileAsync).toHaveBeenCalledTimes(2);
    await Promise.resolve(); await Promise.resolve();
    expect(u.api.list().map((e) => e.warm)).toEqual([false, false]);
  });
});
