// @vitest-environment jsdom
// Vorab-Kompilierung (engine/warm.js, 1.19.0): warmObject (Sichtbarkeit, Texturen einmal, Fehler, Rückfall) und scheduleWarm (ok-Filter, retry, einmal je Objekt).
import { describe, it, expect, vi, afterEach } from 'vitest';
import { collectTextures, warmObject, scheduleWarm } from '../src/js/store3d/engine/warm.js';

const tex = (n) => ({ isTexture: true, n });
function node(name, visible = true, material = null) {
  return { name, visible, material, children: [], traverse(fn) { fn(this); this.children.forEach((c) => c.traverse(fn)); } };
}
function tree() {
  const root = node('root', false);
  const a = node('a', false, { map: tex('m1'), uniforms: { u: { value: tex('u1') } } });
  const b = node('b', true, [{ map: tex('m1'), emissiveMap: tex('e1') }, { alphaMap: tex('al') }]);
  root.children.push(a, b);
  return { root, a, b };
}

describe('warmObject', () => {
  it('collectTextures: jede Instanz einmal (map, uniforms, Material-Array, extra)', () => {
    const { root } = tree();
    const shared = tex('s');
    root.children[0].material.envMap = shared;
    const list = collectTextures(root, [shared, null, { notTexture: 1 }]);
    expect(list.length).toBe(new Set(list).size);
    expect(list.filter((t) => t === shared).length).toBe(1);
    expect(list.map((t) => t.n).sort()).toEqual(['al', 'e1', 'm1', 'm1', 's', 'u1']); // zwei verschiedene m1-Instanzen
  });

  it('Sichtbarkeit: während compile alles sichtbar, danach exakt wie vorher (auch Kinder, die aus waren)', async () => {
    const { root, a, b } = tree();
    const seen = [];
    const renderer = { compile: vi.fn(() => { seen.push([root.visible, a.visible, b.visible]); }) };
    const did = await warmObject(renderer, root, {}, {});
    expect(did).toBe(true);
    expect(seen).toEqual([[true, true, true]]);
    expect([root.visible, a.visible, b.visible]).toEqual([false, false, true]);
  });

  it('compileAsync wird bevorzugt, Sichtbarkeit steht schon synchron wieder (vor dem Promise)', async () => {
    const { root, a } = tree();
    let resolve;
    const renderer = { compileAsync: vi.fn(() => new Promise((r) => { resolve = r; })), compile: vi.fn() };
    const p = warmObject(renderer, root, {}, {});
    expect(root.visible).toBe(false);
    expect(a.visible).toBe(false);
    resolve();
    expect(await p).toBe(true);
    expect(renderer.compile).not.toHaveBeenCalled();
  });

  it('Rückfall auf compile, wenn es kein compileAsync gibt', async () => {
    const { root } = tree();
    const renderer = { compile: vi.fn() };
    expect(await warmObject(renderer, root, {}, null)).toBe(true);
    expect(renderer.compile).toHaveBeenCalledTimes(1);
    expect(renderer.compile.mock.calls[0][2]).toBe(root); // ohne Szene: das Objekt selbst
  });

  it('initTexture je Textur genau einmal (auch bei doppelt genannten extra-Texturen)', async () => {
    const { root } = tree();
    const x = tex('x');
    const renderer = { initTexture: vi.fn() };
    await warmObject(renderer, root, {}, {}, { textures: [x, x] });
    const calls = renderer.initTexture.mock.calls.map((c) => c[0]);
    expect(calls.length).toBe(new Set(calls).size);
    expect(calls.filter((t) => t === x).length).toBe(1);
    expect(calls.length).toBe(collectTextures(root, [x]).length);
  });

  it('nur Texturen (object null): lädt hoch, kompiliert nicht', async () => {
    const renderer = { compile: vi.fn(), compileAsync: vi.fn(), initTexture: vi.fn() };
    expect(await warmObject(renderer, null, {}, {}, { textures: [tex('t')] })).toBe(true);
    expect(renderer.compile).not.toHaveBeenCalled();
    expect(renderer.compileAsync).not.toHaveBeenCalled();
    expect(renderer.initTexture).toHaveBeenCalledTimes(1);
  });

  it('Fehler werden geschluckt: compile wirft, initTexture wirft, compileAsync lehnt ab; Sichtbarkeit bleibt korrekt', async () => {
    const { root, a } = tree();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const r1 = { compile: () => { throw new Error('x'); }, initTexture: () => { throw new Error('y'); } };
    expect(await warmObject(r1, root, {}, {})).toBe(false);
    expect(a.visible).toBe(false);
    expect(warn).not.toHaveBeenCalled(); // ohne debug still
    const r2 = { compileAsync: () => Promise.reject(new Error('z')) };
    expect(await warmObject(r2, root, {}, {}, { debug: true })).toBe(true); // did = Aufruf erfolgte
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('nichts zu tun gibt false (ohne Renderer oder Kamera)', async () => {
    expect(await warmObject(null, node('o'), {}, {})).toBe(false);
    expect(await warmObject({ compile: vi.fn() }, node('o'), null, {})).toBe(false);
  });
});

describe('scheduleWarm', () => {
  afterEach(() => { vi.useRealTimers(); });
  function setup(getList, extra = {}) {
    vi.useFakeTimers();
    const jobs = [];
    const sched = (fn) => { const j = { fn, off: false }; jobs.push(j); return () => { j.off = true; }; };
    const renderer = { compile: vi.fn() };
    const ctx = { renderer, camera: {}, scene: {}, ...extra };
    const cancel = scheduleWarm(ctx, getList, { delayMs: 100, sched });
    const idle = () => { while (jobs.length) { const j = jobs.shift(); if (!j.off) j.fn(); } };
    return { renderer, cancel, jobs, idle };
  }

  it('wärmt erst nach der Verzögerung, ein Objekt je Häppchen', () => {
    const o1 = node('1'); const o2 = node('2');
    const t = setup(() => [{ object: o1 }, { object: o2 }]);
    expect(t.jobs.length).toBe(0);
    vi.advanceTimersByTime(100);
    expect(t.jobs.length).toBe(1);
    t.jobs.shift().fn();
    expect(t.renderer.compile).toHaveBeenCalledTimes(1);
    t.idle();
    expect(t.renderer.compile).toHaveBeenCalledTimes(2);
  });

  it('ok() filtert: nicht erlaubte Objekte werden nicht kompiliert, retry holt sie nach (jedes Objekt nur einmal)', () => {
    const o1 = node('bolt'); const o2 = node('breath');
    let lvl = 'low';
    const list = [{ object: o1, ok: () => lvl !== 'low' }, { object: o2, ok: () => lvl === 'high' }];
    const t = setup(() => list);
    vi.advanceTimersByTime(100);
    t.idle();
    expect(t.renderer.compile).not.toHaveBeenCalled();
    lvl = 'mid'; t.cancel.retry(); t.idle();
    expect(t.renderer.compile.mock.calls.map((c) => c[0])).toEqual([o1]);
    t.cancel.retry(); t.idle(); // nichts Neues erlaubt
    expect(t.renderer.compile).toHaveBeenCalledTimes(1);
    lvl = 'high'; t.cancel.retry(); t.idle();
    expect(t.renderer.compile.mock.calls.map((c) => c[0])).toEqual([o1, o2]);
    t.cancel.retry(); t.idle();
    expect(t.renderer.compile).toHaveBeenCalledTimes(2);
  });

  it('ok() wird beim Wärmen erneut geprüft (Stufe fiel zwischen Einreihen und Lauf)', () => {
    const o1 = node('a'); const o2 = node('b');
    let allow = true;
    const t = setup(() => [{ object: o1 }, { object: o2, ok: () => allow }]);
    vi.advanceTimersByTime(100);
    t.jobs.shift().fn(); // o1
    allow = false;
    t.idle();
    expect(t.renderer.compile.mock.calls.map((c) => c[0])).toEqual([o1]);
    allow = true; t.cancel.retry(); t.idle();
    expect(t.renderer.compile).toHaveBeenCalledTimes(2);
  });

  it('retry mitten im Lauf wird nachgeholt; retry vor dem Start ist wirkungslos', () => {
    const o1 = node('a'); const o2 = node('b'); const o3 = node('c');
    let two = false;
    const t = setup(() => [{ object: o1 }, { object: o2, ok: () => two }, { object: o3 }]);
    t.cancel.retry();
    expect(t.jobs.length).toBe(0);
    vi.advanceTimersByTime(100); // Liste: a, c (b noch nicht erlaubt)
    t.jobs.shift().fn(); // a, danach noch c offen
    two = true; t.cancel.retry(); // mitten im Lauf: wird nach dem Ende der Liste nachgeholt
    t.idle();
    expect(t.renderer.compile).toHaveBeenCalledTimes(3);
  });

  it('cancel stoppt alles; ohne Renderer/Kamera passiert nichts; getList-Fehler werden geschluckt', () => {
    const o1 = node('a');
    const t = setup(() => [{ object: o1 }]);
    t.cancel();
    vi.advanceTimersByTime(500);
    t.idle();
    expect(t.renderer.compile).not.toHaveBeenCalled();
    const t2 = setup(() => { throw new Error('x'); });
    vi.advanceTimersByTime(100);
    expect(t2.jobs.length).toBe(0);
    const t3 = setup(() => [{ object: o1 }], { renderer: null });
    vi.advanceTimersByTime(100);
    expect(t3.jobs.length).toBe(0);
  });
});
