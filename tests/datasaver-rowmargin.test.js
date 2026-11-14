// @vitest-environment jsdom
// Datensparmodus: Lazy-Rand der Zeilen 600 px -> 100 px (flix, LENZ+, LENZPRIME).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const ds = vi.hoisted(() => ({ on: false }));
vi.mock('../src/js/core/datasaver.js', () => ({
  isDataSaver: () => ds.on,
  onDataSaverChange: () => () => {},
}));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, isReady: () => true, getUserId: () => 'u1' };
});
vi.mock('../src/js/features/rows/sources.js', () => ({
  buildRowDefs: vi.fn(async () => [{ id: 'a', title: 'A', kind: 'landscape', load: async () => [] }]),
  peekRowDefs: vi.fn(() => undefined),
  resetSourceCache: vi.fn(),
  getNewSeriesIds: vi.fn(async () => new Set()),
  peekNewSeriesIds: vi.fn(() => undefined),
}));
vi.mock('../src/js/features/rows/prefetch.js', () => ({
  startRowPrefetch: vi.fn(() => ({ stop: vi.fn(), notify: vi.fn() })),
  allowPrefetch: () => true,
  heroSettled: () => true,
}));

import { render as renderFlix } from '../src/js/features/rows.js';
import { renderRows as renderPlus } from '../src/js/features/plus/rows.js';
import { createRows as createPrimeRows } from '../src/js/features/prime/home-rows.js';
import { clearCache } from '../src/js/core/cache.js';

const defs = [{ id: 'a', title: 'A', kind: 'landscape', load: async () => [] }];
const flush = () => new Promise((r) => setTimeout(r, 0));
let margins;
let slot;

beforeEach(() => {
  ds.on = false;
  margins = [];
  clearCache();
  globalThis.IntersectionObserver = class {
    constructor(cb, opts) { margins.push(opts && opts.rootMargin); }
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  slot = document.createElement('div');
  document.body.append(slot);
});
afterEach(() => { delete globalThis.IntersectionObserver; document.body.innerHTML = ''; });

const cases = {
  flix: async () => { const c = renderFlix(slot); await flush(); await flush(); return c; },
  plus: async () => { const c = renderPlus(slot, async () => defs); await flush(); await flush(); return c; },
  prime: async () => { const r = createPrimeRows(slot); r.add(defs); await flush(); return () => r.destroy(); },
};

describe.each(Object.keys(cases))('Lazy-Rand (%s)', (name) => {
  it('Standard (aus): 600px', async () => {
    const cleanup = await cases[name]();
    expect(margins).toEqual(['600px 0px']);
    cleanup();
  });
  it('an: 100px', async () => {
    ds.on = true;
    const cleanup = await cases[name]();
    expect(margins).toEqual(['100px 0px']);
    cleanup();
  });
});
