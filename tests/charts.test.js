// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    getAuth: () => ({ address: 'http://x', userId: 'u1', token: 'SECRET-TOKEN', serverId: 's' }),
    getItems: vi.fn(),
  };
});

import * as api from '../src/js/core/api.js';
import { clearCache } from '../src/js/core/cache.js';
import { getChartsUrl, getCharts, resolveChartItems, resetChartsWarning } from '../src/js/core/charts.js';

const GOOD = {
  version: 1, generatedAt: '2026-11-08T19:00:00Z', windowDays: 30, metric: 'viewers',
  movies: [{ id: 'm1', viewers: 3, plays: 5, seconds: 1 }], series: [{ id: 's1', viewers: 2, plays: 4, seconds: 1 }], all: [],
};
const okRes = (body, status = 200) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

function setVar(v) {
  document.documentElement.style.setProperty('--lfx-charts-url', v);
}

beforeEach(() => {
  delete window.LenzFlixConfig;
  document.documentElement.removeAttribute('style');
  clearCache();
  resetChartsWarning();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('getChartsUrl', () => {
  it('null ohne Konfiguration', () => {
    expect(getChartsUrl()).toBeNull();
  });
  it('liest CSS-Variable, entfernt Quotes/Leerzeichen/Slash', () => {
    setVar(' "https://charts.example.com/" ');
    expect(getChartsUrl()).toBe('https://charts.example.com');
  });
  it('Config hat Vorrang vor CSS', () => {
    setVar('"https://css.example.com"');
    window.LenzFlixConfig = { chartsUrl: 'https://cfg.example.com//' };
    expect(getChartsUrl()).toBe('https://cfg.example.com');
  });
  it('nur https', () => {
    setVar('"http://charts.example.com"');
    expect(getChartsUrl()).toBeNull();
    window.LenzFlixConfig = { chartsUrl: 'javascript:alert(1)' };
    expect(getChartsUrl()).toBeNull();
  });
});

describe('getCharts', () => {
  beforeEach(() => { window.LenzFlixConfig = { chartsUrl: 'https://charts.example.com' }; });

  it('null ohne URL, ohne Request', async () => {
    window.LenzFlixConfig = {};
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await getCharts()).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it('sendet Token-Header, cached 5 min', async () => {
    const f = vi.fn().mockResolvedValue(okRes(GOOD));
    vi.stubGlobal('fetch', f);
    const a = await getCharts();
    const b = await getCharts();
    expect(a.movies[0].id).toBe('m1');
    expect(b).toBe(a);
    expect(f).toHaveBeenCalledTimes(1);
    expect(f.mock.calls[0][0]).toBe('https://charts.example.com/charts');
    expect(f.mock.calls[0][1].headers['X-Emby-Token']).toBe('SECRET-TOKEN');
  });
  it.each([401, 502, 503])('HTTP %i -> null, Warnung ohne Token', async (status) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okRes({ error: 'x' }, status)));
    expect(await getCharts()).toBeNull();
    expect(JSON.stringify(console.warn.mock.calls)).not.toContain('SECRET-TOKEN');
  });
  it('Netzwerkfehler -> null, Warnung nur einmal', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('boom SECRET-TOKEN')));
    expect(await getCharts()).toBeNull();
    clearCache();
    expect(await getCharts()).toBeNull();
    expect(console.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(console.warn.mock.calls)).not.toContain('SECRET-TOKEN');
  });
  it('ungültiges JSON/Schema -> null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('bad'); } }));
    expect(await getCharts()).toBeNull();
    clearCache();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okRes({ version: 2, movies: [], series: [], all: [] })));
    expect(await getCharts()).toBeNull();
    clearCache();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(okRes({ version: 1, movies: 'x' })));
    expect(await getCharts()).toBeNull();
  });
});

describe('resolveChartItems', () => {
  beforeEach(() => api.getItems.mockReset());
  const entries = ['a', 'b', 'c', 'd'].map((id, i) => ({ id, viewers: 4 - i, plays: 10 - i }));

  it('behält Chart-Reihenfolge, verwirft fehlende, hängt Zähler an', async () => {
    api.getItems.mockResolvedValue({ Items: [{ Id: 'd' }, { Id: 'b' }, { Id: 'a' }] });
    const out = await resolveChartItems(entries);
    expect(out.map((i) => i.Id)).toEqual(['a', 'b', 'd']);
    expect(out[0]._lfxViewers).toBe(4);
    expect(out[0]._lfxPlays).toBe(10);
    const p = api.getItems.mock.calls[0][0];
    expect(p.Ids).toBe('a,b,c,d');
    expect(p.Fields).toContain('Overview');
  });
  it('kürzt auf limit', async () => {
    api.getItems.mockResolvedValue({ Items: entries.map((e) => ({ Id: e.id })) });
    expect((await resolveChartItems(entries, { limit: 2 })).map((i) => i.Id)).toEqual(['a', 'b']);
  });
  it('filtert nach type, leere Liste ohne Request', async () => {
    api.getItems.mockResolvedValue({ Items: [{ Id: 'x' }] });
    const mixed = [{ id: 'x', type: 'Series' }, { id: 'y', type: 'Movie' }];
    expect((await resolveChartItems(mixed, { type: 'Series' })).map((i) => i.Id)).toEqual(['x']);
    api.getItems.mockClear();
    expect(await resolveChartItems([])).toEqual([]);
    expect(api.getItems).not.toHaveBeenCalled();
  });
});
