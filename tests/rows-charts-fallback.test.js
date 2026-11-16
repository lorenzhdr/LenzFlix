// @vitest-environment jsdom
// Ersatzzeile bei fehlenden Charts darf nicht 10 min gecacht werden (nur mit Charts-URL).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = { url: 'https://c.example', charts: null };
vi.mock('../src/js/core/charts.js', () => ({
  getChartsUrl: () => state.url,
  getCharts: async () => state.charts,
  resolveChartItems: async (list) => (list || []).map((x) => ({ Id: x.id, Type: 'Movie' })),
}));
const getItems = vi.fn(async () => ({ Items: Array.from({ length: 10 }, (_, i) => ({ Id: `n${i}`, Type: 'Movie' })) }));
vi.mock('../src/js/core/api.js', () => ({
  getUserId: () => 'u1', getItems: (...a) => getItems(...a), getViews: async () => ({ Items: [] }),
  getJson: async () => ({ Items: [] }), getResume: async () => ({ Items: [] }), getNextUp: async () => ({ Items: [] }),
  getLatest: async () => [], getSimilar: async () => ({ Items: [] }),
}));

const { wrapRow, buildRowDefs, peekRowDefs } = await import('../src/js/features/rows/sources.js');
const { clearCache } = await import('../src/js/core/cache.js');

beforeEach(() => { clearCache(); getItems.mockClear(); state.url = 'https://c.example'; state.charts = null; });

describe('Ersatz bei fehlenden Charts', () => {
  it('wrapRow: Ersatz mit noCache wird neu geladen', async () => {
    const mk = () => wrapRow({
      id: 'top10', title: 't', kind: 'top10',
      async load(d) { d.noCache = !!state.url && !state.charts; return state.charts ? [{ Id: 'c' }] : [{ Id: 'fb' }]; },
    });
    const def = mk();
    expect((await def.load())[0].Id).toBe('fb');
    state.charts = {};
    expect((await def.load())[0].Id).toBe('c');
  });
  it('wrapRow: ohne noCache bleibt gecacht', async () => {
    const load = vi.fn(async () => [{ Id: 'x' }]);
    const def = wrapRow({ id: 'a', title: 't', kind: 'top10', load });
    await def.load(); await def.load();
    expect(load).toHaveBeenCalledTimes(1);
  });
  it('buildRowDefs: null-Charts nicht gecacht', async () => {
    const defs = await buildRowDefs({ seed: 's' });
    expect(defs.some((d) => d.id === 'top10')).toBe(true);
    await Promise.resolve();
    expect(peekRowDefs({ seed: 's' })).toBeUndefined();
  });
  it('buildRowDefs: ohne Charts-URL bleibt der Ersatz gecacht', async () => {
    state.url = '';
    await buildRowDefs({ seed: 's' });
    await Promise.resolve();
    expect(peekRowDefs({ seed: 's' })).toBeDefined();
  });
  it('deferred: Platzhalterzeile mit Ersatz wird nach Erholung neu geladen', async () => {
    const defs = await buildRowDefs({ seed: 's2', deferCharts: true });
    const ph = defs.find((d) => d.kind === 'top10');
    await ph.load();
    expect(ph.title).toMatch(/^Top 10: Neu auf/);
    const n = getItems.mock.calls.length;
    await ph.load();
    expect(getItems.mock.calls.length).toBeGreaterThan(n);
  });
});
