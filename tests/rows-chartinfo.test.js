// @vitest-environment jsdom
// Info-Knopf an den echten Top-10-Chart-Zeilen: nur mit rules, nie am Rückfall, Kennzeichen übersteht den Zeilen-Cache.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const RULES = { halfLifeDays: 7, minSecondsMovie: 800, minSecondsEpisode: 300 };
const state = { url: 'https://c.example', charts: null, type: 'Movie' };
vi.mock('../src/js/core/charts.js', () => ({
  getChartsUrl: () => state.url,
  getCharts: async () => state.charts,
  resolveChartItems: async (list) => (list || []).map((x) => ({ Id: x.id, Type: state.type })),
}));
const getItems = vi.fn(async () => ({ Items: Array.from({ length: 10 }, (_, i) => ({ Id: `n${i}`, Type: 'Movie' })) }));
vi.mock('../src/js/core/api.js', async () => ({
  ...(await vi.importActual('../src/js/core/api.js')),
  isReady: () => true,
  getUserId: () => 'u1', getItems: (...a) => getItems(...a), getViews: async () => ({ Items: [] }),
  getJson: async () => ({ Items: [] }), getResume: async () => ({ Items: [] }), getNextUp: async () => ({ Items: [] }),
  getLatest: async () => [], getSimilar: async () => ({ Items: [] }),
  getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }),
}));
vi.mock('../src/js/features/rows/prefetch.js', () => ({
  startRowPrefetch: vi.fn(() => ({ stop: vi.fn(), notify: vi.fn() })),
  allowPrefetch: () => true,
  heroSettled: () => true,
}));

const { wrapRow, buildRowDefs, chartMeta } = await import('../src/js/features/rows/sources.js');
const { buildLibraryRowDefs } = await import('../src/js/features/library/sources.js');
const { render } = await import('../src/js/features/rows.js');
const { clearCache } = await import('../src/js/core/cache.js');

const list = (n = 6) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, viewers: 9, plays: 9 }));
const charts = (withRules = true) => ({ version: 1, windowDays: 30, movies: list(), series: list(), all: list(), ...(withRules ? { rules: RULES } : {}) });

let slot;
beforeEach(() => {
  clearCache(); getItems.mockClear();
  state.url = 'https://c.example'; state.charts = null; state.type = 'Movie';
  document.body.innerHTML = '<div id="slot"></div>';
  slot = document.getElementById('slot');
});
afterEach(() => { document.body.innerHTML = ''; });

const row = (id) => slot.querySelector(`[data-lfx-row="${id}"]`);
const btnIn = (id) => row(id)?.querySelector('.lfx-chartinfo-btn') || null;
async function showRows(opts) {
  const off = render(slot, opts);
  await vi.waitFor(() => expect(slot.querySelector('.lfx-row:not(.is-loading)')).not.toBeNull());
  await new Promise((r) => setTimeout(r, 20));
  return off;
}

describe('chartMeta', () => {
  it('nur mit rules als Objekt', () => {
    expect(chartMeta({ rules: RULES, windowDays: 30 }, 'series')).toEqual({ kind: 'series', rules: RULES, windowDays: 30 });
    expect(chartMeta({ windowDays: 30 }, 'series')).toBeNull();
    expect(chartMeta({ rules: 'x' }, 'series')).toBeNull();
    expect(chartMeta(null, 'series')).toBeNull();
  });
});

describe('Startseite', () => {
  it('Knopf an Top 10 Serien/Filme, direkt hinter dem Titel', async () => {
    state.charts = charts();
    const off = await showRows();
    for (const [id, kind] of [['top10-series', 'series'], ['top10-movies', 'movies']]) {
      const b = btnIn(id);
      expect(b).not.toBeNull();
      expect(b.previousElementSibling.classList.contains('lfx-row__title')).toBe(true);
      expect(b.nextElementSibling.classList.contains('lfx-row__pages')).toBe(true);
      b.click();
      expect(document.querySelector('.lfx-chartinfo-sheet').textContent).toContain(kind === 'series' ? 'Viel schauen' : 'höchstens 1 Punkt');
      document.querySelector('.lfx-chartinfo__close').click();
    }
    off();
  });

  it('ohne rules (alter Worker): kein Knopf', async () => {
    state.charts = charts(false);
    const off = await showRows();
    expect(row('top10-series')).not.toBeNull();
    expect(slot.querySelector('.lfx-chartinfo-btn')).toBeNull();
    off();
  });

  it('Rückfall (keine Charts, Platzhalter wird zur „Neu auf“-Zeile): kein Knopf', async () => {
    state.charts = null;
    const off = await showRows();
    expect(row('top10')).not.toBeNull();
    expect(slot.querySelector('.lfx-chartinfo-btn')).toBeNull();
    off();
  });

  it('Rückfall-Snapshot überschreibt das Kennzeichen eines früheren Chart-Laufs', async () => {
    let call = 0;
    const def = wrapRow({
      id: 'top10-x', title: 't', kind: 'top10', chart: chartMeta(charts(), 'series'),
      async load(d) {
        call++;
        if (call > 1) { d.chart = null; d.noCache = true; }
        return [{ Id: 'a' }];
      },
    });
    await def.load();
    expect(def.chart).not.toBeNull();
    clearCache();
    await def.load();
    expect(def.chart).toBeNull();
  });

  it('Kennzeichen übersteht den Zeilen-Cache (zweiter Aufruf aus dem Cache)', async () => {
    state.charts = charts();
    const first = await showRows();
    expect(btnIn('top10-movies')).not.toBeNull();
    first();
    slot.textContent = '';
    const second = await showRows(); // Zeilen und Listen kommen jetzt aus dem Cache
    expect(btnIn('top10-movies')).not.toBeNull();
    expect(btnIn('top10-series')).not.toBeNull();
    second();
  });

  it('nicht deferred: Defs tragen chart nur mit rules', async () => {
    state.charts = charts();
    const defs = await buildRowDefs({ seed: 'a' });
    expect(defs.find((d) => d.id === 'top10-series').chart).toMatchObject({ kind: 'series', windowDays: 30 });
    clearCache();
    state.charts = charts(false);
    const defs2 = await buildRowDefs({ seed: 'b' });
    expect(defs2.find((d) => d.id === 'top10-series').chart).toBeNull();
  });
});

describe('Bibliotheksseite', () => {
  const top10 = async (kind) => (await buildLibraryRowDefs(kind)).find((d) => d.id.endsWith(':top10'));

  it('mit Charts und rules: chart gesetzt, Knopf in der Zeile', async () => {
    state.charts = charts();
    state.type = 'Series';
    const defs = await buildLibraryRowDefs('series');
    const def = defs.find((d) => d.id.endsWith(':top10'));
    const off = await showRows({ defs: { build: async () => [def] }, prefetch: false });
    expect(def.chart).toMatchObject({ kind: 'series' });
    expect(btnIn(def.id)).not.toBeNull();
    off();
  });

  it('Filme-Seite: kind movies', async () => {
    state.charts = charts();
    state.type = 'Movie';
    const def = await top10('movies');
    await def.load(def);
    expect(def.chart).toMatchObject({ kind: 'movies' });
  });

  it('ohne rules oder ohne Charts: kein Kennzeichen, Rückfall ohne Knopf', async () => {
    state.type = 'Series';
    state.charts = charts(false);
    let def = await top10('series');
    await def.load(def);
    expect(def.chart).toBeNull();

    clearCache();
    state.charts = null;
    def = await top10('series');
    const off = await showRows({ defs: { build: async () => [def] }, prefetch: false });
    expect(def.chart).toBeNull();
    expect(slot.querySelector('.lfx-chartinfo-btn')).toBeNull();
    off();
  });

  it('zu dünne Chart-Liste (Rückfall) nach früherem Chart-Lauf: Kennzeichen wird zurückgesetzt', async () => {
    state.type = 'Series';
    state.charts = charts();
    const def = await top10('series');
    await def.load(def);
    expect(def.chart).not.toBeNull();
    clearCache();
    state.charts = { ...charts(), series: list(2) };
    await def.load(def);
    expect(def.chart).toBeNull();
  });
});
