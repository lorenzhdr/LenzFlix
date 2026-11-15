// @vitest-environment jsdom
// Zeilen: ctx.defs (build/peek), ctx.prefetch, ctx.hero, Lazy-Rand pro Teil. Ohne ctx = Startseite.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const pf = vi.hoisted(() => ({ start: vi.fn(() => ({ stop: vi.fn() })) }));
const ds = vi.hoisted(() => ({ parts: {}, all: false }));
vi.mock('../src/js/features/rows/prefetch.js', () => ({ startRowPrefetch: pf.start }));
vi.mock('../src/js/core/datasaver.js', () => ({
  isDataSaver: (part) => ds.all && (!part || ds.parts[part] !== false),
}));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, isReady: () => true, getUserId: () => 'u1' };
});
vi.mock('../src/js/features/rows/sources.js', () => ({
  buildRowDefs: vi.fn(async () => []),
  peekRowDefs: vi.fn(() => undefined),
  getNewSeriesIds: vi.fn(async () => new Set()),
  peekNewSeriesIds: vi.fn(() => new Set()),
}));

import { render } from '../src/js/features/rows.js';
import { buildRowDefs, peekRowDefs } from '../src/js/features/rows/sources.js';

const mk = (id) => ({ Id: id, Type: 'Movie', Name: id, ImageTags: { Thumb: 't' } });
const def = (id) => ({ id, title: id, kind: 'landscape', load: vi.fn(async () => [mk(`${id}1`), mk(`${id}2`)]) });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('rows ctx', () => {
  let slot;
  let ioOpts;
  beforeEach(() => {
    vi.clearAllMocks();
    ds.all = false; ds.parts = {};
    ioOpts = null;
    globalThis.IntersectionObserver = class {
      constructor(cb, o) { ioOpts = o; this.cb = cb; }
      observe(el) { this.cb([{ target: el, isIntersecting: true }]); }
      unobserve() {}
      disconnect() {}
    };
    document.body.innerHTML = '<div id="s"></div>';
    slot = document.getElementById('s');
  });
  afterEach(() => { delete globalThis.IntersectionObserver; });

  it('Standard: Startseiten-Defs (peek, dann build) und Vorladen mit lfx-billboard als Hero', async () => {
    const off = render(slot, { root: document.body });
    await tick();
    expect(peekRowDefs).toHaveBeenCalledWith({ deferCharts: true });
    expect(buildRowDefs).toHaveBeenCalledWith({ deferCharts: true });
    expect(pf.start).toHaveBeenCalledTimes(1);
    const bb = document.createElement('section');
    bb.id = 'lfx-billboard';
    document.body.append(bb);
    expect(pf.start.mock.calls[0][0].hero()).toBe(bb);
    off();
  });

  it('ctx.defs.build ersetzt buildRowDefs; peek hat Vorrang', async () => {
    const build = vi.fn(async () => [def('a')]);
    const off = render(slot, { defs: { build } });
    await tick();
    expect(buildRowDefs).not.toHaveBeenCalled();
    expect(peekRowDefs).not.toHaveBeenCalled();
    expect(slot.querySelector('[data-lfx-row="a"]')).not.toBeNull();
    off();

    const build2 = vi.fn(async () => []);
    const off2 = render(slot, { defs: { build: build2, peek: () => [def('b')] } });
    await tick();
    expect(build2).not.toHaveBeenCalled();
    expect(slot.querySelector('[data-lfx-row="b"]')).not.toBeNull();
    off2();
  });

  it('ctx.defs.peek liefert null: Rückfall auf build', async () => {
    const build = vi.fn(async () => [def('c')]);
    const off = render(slot, { defs: { build, peek: () => null } });
    await tick();
    expect(build).toHaveBeenCalled();
    off();
  });

  it('ctx.prefetch=false startet kein Vorladen', async () => {
    const off = render(slot, { defs: { build: async () => [def('d')] }, prefetch: false });
    await tick();
    expect(pf.start).not.toHaveBeenCalled();
    off();
  });

  it('ctx.hero als Element oder Getter', async () => {
    const el = document.createElement('div');
    const off = render(slot, { defs: { build: async () => [] }, hero: el });
    await tick();
    expect(pf.start.mock.calls[0][0].hero()).toBe(el);
    off();
    const off2 = render(slot, { defs: { build: async () => [] }, hero: () => el });
    await tick();
    expect(pf.start.mock.calls[1][0].hero()).toBe(el);
    off2();
  });

  it('Lazy-Rand: 600 px; Modus an = 100 px; Modus an, Teil lazy aus = 600 px', async () => {
    const run = async () => {
      const off = render(slot, { defs: { build: async () => [def('e')] } });
      await tick();
      off();
      return ioOpts.rootMargin;
    };
    expect(await run()).toBe('600px 0px');
    ds.all = true;
    expect(await run()).toBe('100px 0px');
    ds.parts = { lazy: false };
    expect(await run()).toBe('600px 0px');
  });
});
