// @vitest-environment jsdom
// Charts: Fehler nur kurz merken, Erfolg 5 min.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearCache } from '../src/js/core/cache.js';
import { getCharts } from '../src/js/core/charts.js';

const GOOD = {
  version: 1, generatedAt: '2026-11-08T19:00:00Z', windowDays: 30, metric: 'viewers',
  movies: [{ id: 'm1', viewers: 3, plays: 5, seconds: 1 }], series: [{ id: 's1', viewers: 2, plays: 4, seconds: 1 }], all: [],
};

function client(extra = {}) {
  window.ApiClient = {
    serverId: () => 'srv', getCurrentUserId: () => 'u1', accessToken: () => 'tok', serverAddress: () => 'http://x', ...extra,
  };
}

beforeEach(() => { clearCache(); client(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Charts-Fehler nur kurz merken', () => {
  it('null nach Fehler wird nach 30 s neu abgerufen, Erfolg bleibt 5 min', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-16T10:00:00Z'));
    window.LenzFlixConfig = { chartsUrl: 'https://charts.example.com' };
    const f = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValue({ ok: true, status: 200, json: async () => GOOD });
    vi.stubGlobal('fetch', f);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(await getCharts()).toBeNull();
    expect(await getCharts()).toBeNull();
    expect(f).toHaveBeenCalledTimes(1);
    vi.setSystemTime(new Date('2026-11-16T10:00:31Z'));
    expect(await getCharts()).not.toBeNull();
    vi.setSystemTime(new Date('2026-11-16T10:03:00Z'));
    expect(await getCharts()).not.toBeNull();
    expect(f).toHaveBeenCalledTimes(2);
    delete window.LenzFlixConfig;
  });
});

