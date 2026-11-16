// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/theme.js', () => ({
  getTheme: () => 'flix',
  isTheme: (id) => id === 'flix',
  brandName: () => 'LENZFLIX',
}));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, isReady: () => true, getUserId: () => 'u1', getItems: vi.fn() };
});
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isMobile: () => false }));
const bus = vi.hoisted(() => ({ fn: null }));
vi.mock('../src/js/core/itemmenu.js', () => ({
  onItemsChanged: (fn) => { bus.fn = fn; return () => { bus.fn = null; }; },
}));

import mylist from '../src/js/features/mylist.js';
import { parseHash } from '../src/js/core/router.js';
import * as api from '../src/js/core/api.js';

const route = (hash) => parseHash(hash);
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const mk = (from, n) => Array.from({ length: n }, (_, i) => ({ Id: `i${from + i}`, Name: `T${from + i}`, Type: 'Movie' }));
let ios;
let now;
const setVis = (v) => {
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
  document.dispatchEvent(new Event('visibilitychange'));
};

beforeEach(() => {
  ios = [];
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb) { this.cb = cb; ios.push(this); }
    observe() {}
    unobserve() {}
    disconnect() {}
  });
  document.documentElement.className = '';
  document.body.innerHTML = '<div id="indexPage"><div id="homeTab"></div></div>';
  api.getItems.mockReset();
  api.getItems.mockResolvedValue({ Items: mk(0, 40), TotalRecordCount: 45 });
  now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
});
afterEach(() => {
  mylist.unmount();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  setVis('visible');
  document.body.innerHTML = '';
});

describe('mylist: Tab-Rückkehr (A056/A045)', () => {
  it('kurzer Tab-Wechsel lädt nicht neu, ab 60 s schon', async () => {
    mylist.mount(route('#/home?lfx=mylist'));
    await flush();
    const calls = api.getItems.mock.calls.length;
    setVis('hidden');
    now += 5000;
    setVis('visible');
    await flush();
    expect(api.getItems.mock.calls.length).toBe(calls);
    setVis('hidden');
    now += 61000;
    setVis('visible');
    await flush();
    expect(api.getItems.mock.calls.length).toBe(calls + 1);
  });
});

describe('mylist: Art und Sortierung zugleich (A051)', () => {
  it('genau eine Anfrage mit neuer Art und neuer Sortierung', async () => {
    mylist.mount(route('#/home?lfx=mylist'));
    await flush();
    const calls = api.getItems.mock.calls.length;
    mylist.update(route('#/home?lfx=mylist&type=series&sort=year'));
    await flush();
    expect(api.getItems.mock.calls.length).toBe(calls + 1);
    expect(api.getItems.mock.calls.at(-1)[0]).toMatchObject({ IncludeItemTypes: 'Series', SortBy: 'ProductionYear,SortName' });
  });
});

describe('mylist: entfernte Karten (A057)', () => {
  it('Nachladen beginnt hinter den verbleibenden Titeln, Zähler sinkt', async () => {
    mylist.mount(route('#/home?lfx=mylist'));
    await flush();
    expect(document.querySelector('.lfx-ml__count').textContent).toBe('45 Titel');
    bus.fn({ removed: ['i0', 'i1'] });
    expect(document.querySelectorAll('.lfx-grid__item')).toHaveLength(38);
    expect(document.querySelector('.lfx-ml__count').textContent).toBe('43 Titel');
    api.getItems.mockResolvedValue({ Items: mk(40, 5), TotalRecordCount: 43 });
    ios[0].cb([{ isIntersecting: true }]);
    await flush();
    expect(api.getItems.mock.calls.at(-1)[0].StartIndex).toBe(38);
  });
});
