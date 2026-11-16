// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', async () => ({
  getUserId: () => 'u1',
  getAuth: () => ({ serverId: 's' }),
  getItems: vi.fn(),
  imageUrl: () => null,
  landscapeImage: () => null,
  pickLandscape: () => null,
  logoImage: () => null,
  imageUrlFor: () => null,
}));
vi.mock('../src/js/core/datasaver.js', () => ({ isDataSaver: vi.fn(() => false) }));

import * as api from '../src/js/core/api.js';
import { isDataSaver } from '../src/js/core/datasaver.js';
import { createGrid, sortParams } from '../src/js/features/library/grid.js';
import { clearCache } from '../src/js/core/cache.js';

const page = (from, n, total) => ({ Items: Array.from({ length: n }, (_, i) => ({ Id: `i${from + i}`, Name: `T${from + i}`, Type: 'Movie' })), TotalRecordCount: total });
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
let ios;

beforeEach(() => {
  vi.clearAllMocks();
  clearCache();
  isDataSaver.mockReturnValue(false);
  ios = [];
  vi.stubGlobal('IntersectionObserver', class {
    constructor(cb, o) { this.cb = cb; this.opts = o; ios.push(this); }
    observe() {}
    unobserve() {}
    disconnect() { this.gone = true; }
  });
});
afterEach(() => { vi.unstubAllGlobals(); clearCache(); });

describe('sortParams', () => {
  it('Mapping', () => {
    expect(sortParams('az')).toEqual({ SortBy: 'SortName', SortOrder: 'Ascending' });
    expect(sortParams('za')).toEqual({ SortBy: 'SortName', SortOrder: 'Descending' });
    expect(sortParams('new', { IncludeItemTypes: 'Movie' }).SortBy).toBe('DateCreated');
    expect(sortParams('new', { IncludeItemTypes: 'Series' }).SortBy).toBe('DateLastContentAdded');
    expect(sortParams('new', { IncludeItemTypes: 'Movie,Series' }).SortBy).toBe('DateCreated');
    expect(sortParams('year')).toEqual({ SortBy: 'ProductionYear,SortName', SortOrder: 'Descending,Ascending' });
  });
});

describe('createGrid', () => {
  it('lädt Seite 1, nutzt Sort/Query und rendert Karten', async () => {
    api.getItems.mockResolvedValue(page(0, 3, 3));
    const onCount = vi.fn();
    const g = createGrid({ query: { IncludeItemTypes: 'Series', GenreIds: 'g1' }, sort: 'new', onCount });
    expect(g.el.classList.contains('lfx-grid')).toBe(true);
    expect(g.el.querySelector('.lfx-grid__skel')).toBeTruthy();
    await flush();
    const p = api.getItems.mock.calls[0][0];
    expect(p).toMatchObject({ IncludeItemTypes: 'Series', GenreIds: 'g1', SortBy: 'DateLastContentAdded', Limit: 40, StartIndex: 0, EnableTotalRecordCount: true });
    expect(g.el.querySelectorAll('.lfx-grid__item .lfx-card')).toHaveLength(3);
    expect(g.el.querySelector('.lfx-grid__skel')).toBeNull();
    expect(onCount).toHaveBeenCalledWith(3);
    g.destroy();
  });

  it('Paging über zwei Seiten, Ende erkannt', async () => {
    api.getItems.mockResolvedValueOnce(page(0, 40, 45)).mockResolvedValueOnce(page(40, 5, 45));
    const g = createGrid({ query: { IncludeItemTypes: 'Movie' } });
    await flush();
    expect(g.el.querySelectorAll('.lfx-grid__item')).toHaveLength(40);
    ios[0].cb([{ isIntersecting: true }]);
    await flush();
    expect(api.getItems.mock.calls[1][0].StartIndex).toBe(40);
    expect(g.el.querySelectorAll('.lfx-grid__item')).toHaveLength(45);
    ios[0].cb([{ isIntersecting: true }]);
    await flush();
    expect(api.getItems).toHaveBeenCalledTimes(2);
    g.destroy();
  });

  it('verwirft veraltete Antworten nach setSort', async () => {
    let resolveA;
    api.getItems.mockImplementationOnce(() => new Promise((r) => { resolveA = r; }));
    api.getItems.mockResolvedValueOnce({ Items: [{ Id: 'neu', Name: 'Neu', Type: 'Movie' }], TotalRecordCount: 1 });
    const g = createGrid({ query: { IncludeItemTypes: 'Movie' } });
    g.setSort('za');
    await flush();
    resolveA(page(0, 3, 3));
    await flush();
    const ids = [...g.el.querySelectorAll('.lfx-card')].map((c) => c.dataset.lfxId);
    expect(ids).toEqual(['neu']);
    expect(api.getItems.mock.calls[1][0].SortOrder).toBe('Descending');
    g.destroy();
  });

  it('Leerzustand', async () => {
    api.getItems.mockResolvedValue({ Items: [], TotalRecordCount: 0 });
    const g = createGrid({ query: {}, emptyText: 'Nichts da' });
    await flush();
    expect(g.el.querySelector('.lfx-grid__empty').textContent).toBe('Nichts da');
    g.destroy();
  });

  it('Datensparmodus: Rand 100 px, sonst 800 px', async () => {
    api.getItems.mockResolvedValue(page(0, 1, 1));
    const a = createGrid({ query: {} });
    expect(ios[0].opts.rootMargin).toBe('800px 0px');
    isDataSaver.mockReturnValue(true);
    const b = createGrid({ query: {} });
    expect(ios[1].opts.rootMargin).toBe('100px 0px');
    a.destroy();
    b.destroy();
  });

  describe('Seite-1-Cache (cacheKey)', () => {
    const ck = (s) => `home:u1:lib:movies:all:grid:${s || 'az'}`;

    it('zweiter Aufbau zeichnet synchron aus dem Cache, ohne Skelett/Abruf; erste 12 Karten eager', async () => {
      api.getItems.mockResolvedValue(page(0, 20, 20));
      const a = createGrid({ query: { IncludeItemTypes: 'Movie' }, cacheKey: ck });
      await flush();
      expect(api.getItems).toHaveBeenCalledTimes(1);
      a.destroy();
      const flags = [];
      const b = createGrid({ query: { IncludeItemTypes: 'Movie' }, cacheKey: ck, cardFactory: (it, o) => { flags.push(o.eager); return document.createElement('div'); } });
      expect(b.el.querySelectorAll('.lfx-grid__item')).toHaveLength(20);
      expect(flags.slice(0, 12).every(Boolean)).toBe(true);
      expect(flags.slice(12).some(Boolean)).toBe(false);
      expect(b.el.querySelector('.lfx-grid__skel')).toBeNull();
      expect(b.el.hasAttribute('aria-busy')).toBe(false);
      expect(api.getItems).toHaveBeenCalledTimes(1);
      b.destroy();
    });

    it('andere Sortierung hat eigenen Schlüssel', async () => {
      api.getItems.mockResolvedValue(page(0, 3, 3));
      const a = createGrid({ query: {}, cacheKey: ck });
      await flush();
      a.destroy();
      const b = createGrid({ query: {}, sort: 'za', cacheKey: ck });
      await flush();
      expect(api.getItems).toHaveBeenCalledTimes(2);
      b.destroy();
    });

    it('setSort nutzt den Treffer der neuen Sortierung', async () => {
      api.getItems.mockResolvedValue(page(0, 3, 3));
      const a = createGrid({ query: {}, sort: 'za', cacheKey: ck });
      await flush();
      a.destroy();
      const b = createGrid({ query: {}, cacheKey: ck });
      await flush();
      expect(api.getItems).toHaveBeenCalledTimes(2);
      b.setSort('za');
      expect(b.el.querySelectorAll('.lfx-card')).toHaveLength(3);
      expect(api.getItems).toHaveBeenCalledTimes(2);
      b.destroy();
    });

    it('ohne cacheKey wird immer neu abgefragt', async () => {
      api.getItems.mockResolvedValue(page(0, 3, 3));
      const a = createGrid({ query: {} });
      await flush();
      a.destroy();
      const b = createGrid({ query: {} });
      await flush();
      expect(api.getItems).toHaveBeenCalledTimes(2);
      b.destroy();
    });

    it('nach clearCache(home:) wird neu abgefragt', async () => {
      api.getItems.mockResolvedValue(page(0, 3, 3));
      const a = createGrid({ query: {}, cacheKey: ck });
      await flush();
      a.destroy();
      clearCache('home:');
      const b = createGrid({ query: {}, cacheKey: ck });
      expect(b.el.querySelector('.lfx-grid__skel')).toBeTruthy();
      await flush();
      expect(api.getItems).toHaveBeenCalledTimes(2);
      b.destroy();
    });

    it('nach synchronem Treffer lädt Seite 2 über den Sentinel nach', async () => {
      api.getItems.mockResolvedValueOnce(page(0, 40, 45)).mockResolvedValueOnce(page(40, 5, 45));
      const a = createGrid({ query: {}, cacheKey: ck });
      await flush();
      a.destroy();
      const b = createGrid({ query: {}, cacheKey: ck });
      expect(b.el.querySelectorAll('.lfx-grid__item')).toHaveLength(40);
      expect(api.getItems).toHaveBeenCalledTimes(1);
      ios[ios.length - 1].cb([{ isIntersecting: true }]);
      await flush();
      expect(api.getItems).toHaveBeenCalledTimes(2);
      expect(api.getItems.mock.calls[1][0].StartIndex).toBe(40);
      expect(b.el.querySelectorAll('.lfx-grid__item')).toHaveLength(45);
      b.destroy();
    });

    it('Fehler beim ersten Abruf hinterlässt keinen Cache-Eintrag', async () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      api.getItems.mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce(page(0, 2, 2));
      const a = createGrid({ query: {}, cacheKey: ck });
      await flush();
      expect(a.el.querySelector('.lfx-grid__retry')).toBeTruthy();
      a.destroy();
      const b = createGrid({ query: {}, cacheKey: ck });
      expect(b.el.querySelector('.lfx-grid__skel')).toBeTruthy();
      await flush();
      expect(api.getItems).toHaveBeenCalledTimes(2);
      expect(b.el.querySelectorAll('.lfx-card')).toHaveLength(2);
      b.destroy();
      warn.mockRestore();
    });
  });

  it('destroy trennt den Observer und entfernt das Element', async () => {
    api.getItems.mockResolvedValue(page(0, 1, 1));
    const root = document.createElement('div');
    const g = createGrid({ query: {} });
    root.append(g.el);
    g.destroy();
    expect(ios[0].gone).toBe(true);
    expect(root.children).toHaveLength(0);
  });
});

describe('createGrid: Fehlerzustand (A050)', () => {
  it('der Observer startet im Fehlerzustand keine neue Anfrage, Erneut versuchen schon', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    api.getItems.mockResolvedValueOnce(page(0, 40, 100)).mockRejectedValueOnce(new Error('boom')).mockResolvedValue(page(40, 40, 100));
    const g = createGrid({ query: {} });
    await flush();
    ios[0].cb([{ isIntersecting: true }]);
    await flush();
    expect(api.getItems).toHaveBeenCalledTimes(2);
    expect(g.el.querySelector('.lfx-grid__retry')).toBeTruthy();
    ios[0].cb([{ isIntersecting: true }]);
    await flush();
    expect(api.getItems).toHaveBeenCalledTimes(2);
    g.el.querySelector('.lfx-grid__retry').click();
    await flush();
    expect(api.getItems).toHaveBeenCalledTimes(3);
    g.destroy();
    warn.mockRestore();
  });
});
