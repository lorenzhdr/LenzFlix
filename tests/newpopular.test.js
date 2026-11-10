// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    isReady: () => true,
    getUserId: () => 'u1',
    getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }),
    getItems: vi.fn(),
    setFavorite: vi.fn(),
  };
});

vi.mock('../src/js/core/download.js', () => ({
  canDownload: vi.fn(async () => true),
  startDownload: vi.fn(),
  isChooserOpen: vi.fn(() => false),
}));
vi.mock('../src/js/core/itemmenu.js', () => ({
  openItemMenu: vi.fn(),
  isMenuOpen: vi.fn(() => false),
  onItemsChanged: vi.fn(() => () => {}),
}));
vi.mock('../src/js/features/modal.js', () => ({ openModal: vi.fn() }));

import * as api from '../src/js/core/api.js';
import { dateParts, sinceLabel, hasPlayCounts } from '../src/js/features/newpopular/format.js';
import feature, { loadMostWatched } from '../src/js/features/newpopular.js';
import { clearCache } from '../src/js/core/cache.js';
import { resetChartsWarning } from '../src/js/core/charts.js';
import { resetSourceCache } from '../src/js/features/rows/sources.js';
import { canDownload, startDownload } from '../src/js/core/download.js';
import { openItemMenu, onItemsChanged } from '../src/js/core/itemmenu.js';
import { openModal } from '../src/js/features/modal.js';
import { putItems } from '../src/js/core/itemstore.js';

const mk = (id, type, extra = {}) => ({ Id: id, Name: id, Type: type, DateCreated: '2026-11-08T12:00:00Z', ...extra });

describe('Format', () => {
  it('Datum deutsch', () => {
    expect(dateParts('2026-11-08T12:00:00Z')).toEqual({ month: 'NOV', day: '08' });
    expect(dateParts('2026-03-21T12:00:00Z')).toEqual({ month: 'MÄR', day: '21' });
    expect(dateParts('kaputt')).toBeNull();
  });
  it('sinceLabel', () => {
    const now = Date.parse('2026-11-09T00:00:00Z');
    expect(sinceLabel(mk('m', 'Movie'), new Set(), now)).toBe('Neu seit 8. November 2026');
    const old = mk('s', 'Series', { DateCreated: '2025-01-01T00:00:00Z' });
    expect(sinceLabel(old, new Set(['s']), now)).toBe('Neue Folgen');
  });
  it('hasPlayCounts', () => {
    expect(hasPlayCounts([{ UserData: { PlayCount: 0 } }, {}])).toBe(false);
    expect(hasPlayCounts([{ UserData: { PlayCount: 2 } }])).toBe(true);
  });
});

describe('PlayCount-Fallback', () => {
  beforeEach(() => api.getItems.mockReset());
  it('nutzt PlayCount, wenn vorhanden', async () => {
    api.getItems.mockResolvedValueOnce({ Items: [mk('a', 'Movie', { UserData: { PlayCount: 3 } })] });
    expect((await loadMostWatched()).map((i) => i.Id)).toEqual(['a']);
    expect(api.getItems).toHaveBeenCalledTimes(1);
  });
  it('fällt auf CommunityRating zurück, wenn alle 0', async () => {
    api.getItems
      .mockResolvedValueOnce({ Items: [mk('a', 'Movie', { UserData: { PlayCount: 0 } })] })
      .mockResolvedValueOnce({ Items: [mk('b', 'Movie')] });
    expect((await loadMostWatched()).map((i) => i.Id)).toEqual(['b']);
    expect(api.getItems.mock.calls[1][0].SortBy).toBe('CommunityRating');
  });
});

describe('Mount/Unmount', () => {
  beforeEach(() => {
    resetSourceCache();
    api.getItems.mockReset();
    api.getItems.mockImplementation(async (p) => {
      if (p.IncludeItemTypes === 'Episode') return { Items: [] };
      return { Items: [mk('i1', 'Movie', { UserData: { PlayCount: 1 } }), mk('i2', 'Series')] };
    });
    document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections"></div><div id="lfx-home"></div></div></div>';
  });
  afterEach(() => { feature.unmount(); document.body.innerHTML = ''; });

  it('match nur bei lfx=new', () => {
    const route = (q) => ({ path: '/home', params: new URLSearchParams(q) });
    expect(feature.match(route('lfx=new'))).toBe(true);
    expect(feature.match(route(''))).toBe(false);
  });

  it('baut Container, setzt Klasse, räumt auf', async () => {
    feature.mount();
    await vi.waitFor(() => expect(document.getElementById('lfx-newpopular')).not.toBeNull(), { timeout: 2000 });
    expect(document.documentElement.classList.contains('lfx-newpopular-on')).toBe(true);
    expect(document.getElementById('homeTab').firstElementChild.id).toBe('lfx-newpopular');
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-np__entry').length).toBe(2));
    expect(document.querySelector('.lfx-np__month').textContent).toMatch(/^[A-ZÄ]{3}$/);
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-card[data-lfx-id]').length).toBeGreaterThan(0));
    expect(document.querySelectorAll('.lfx-np__pill').length).toBe(4);
    feature.unmount();
    expect(document.getElementById('lfx-newpopular')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-newpopular-on')).toBe(false);
  });

  it('CSS blendet #lfx-home aus', () => {
    const css = fs.readFileSync('src/css/js-ui/newpopular.css', 'utf8');
    expect(css).toMatch(/lfx-newpopular-on[^{]*#lfx-home/);
  });
});

describe('Download- und Mehr-Button', () => {
  let unsub;
  beforeEach(() => {
    resetSourceCache();
    unsub = vi.fn();
    canDownload.mockReset();
    canDownload.mockResolvedValue(true);
    startDownload.mockReset();
    openItemMenu.mockReset();
    openModal.mockClear();
    onItemsChanged.mockReset();
    onItemsChanged.mockReturnValue(unsub);
    api.getItems.mockReset();
    api.getItems.mockImplementation(async (p) => {
      if (p.IncludeItemTypes === 'Episode') return { Items: [] };
      return { Items: [mk('i1', 'Movie', { UserData: { PlayCount: 1 } }), mk('i2', 'Series')] };
    });
    document.body.innerHTML = '<div id="indexPage"><div id="homeTab"></div></div>';
  });
  afterEach(() => { feature.unmount(); document.body.innerHTML = ''; });

  const entry = (id) => [...document.querySelectorAll('.lfx-np__entry')].find((e) => e.dataset.lfxId === id);

  it('Buttons vorhanden; Download erst nach canDownload sichtbar; Serie -> Episoden', async () => {
    let resolve;
    canDownload.mockImplementation((it) => (it.Id === 'i1' ? new Promise((r) => { resolve = r; }) : Promise.resolve(false)));
    feature.mount();
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-np__entry').length).toBe(2));
    const dl = entry('i1').querySelector('.lfx-np__btn--dl');
    expect(dl.hidden).toBe(true);
    expect(dl.getAttribute('aria-label')).toBe('Herunterladen');
    expect(entry('i2').querySelector('.lfx-np__btn--dl').getAttribute('aria-label')).toBe('Episoden herunterladen');
    const menu = entry('i1').querySelector('.lfx-np__btn--menu');
    expect(menu.getAttribute('aria-label')).toBe('Mehr');
    expect(menu.getAttribute('aria-haspopup')).toBe('menu');
    resolve(true);
    await vi.waitFor(() => expect(dl.hidden).toBe(false));
    expect(entry('i2').querySelector('.lfx-np__btn--dl').hidden).toBe(true);
  });

  it('Meine Liste: --fav, is-on, aria-pressed und Icon-Wechsel', async () => {
    api.setFavorite.mockReset();
    api.setFavorite.mockResolvedValue({});
    feature.mount();
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-np__entry').length).toBe(2));
    const fav = entry('i1').querySelector('.lfx-np__btn--fav');
    expect(fav).not.toBeNull();
    const plus = fav.querySelector('svg').innerHTML;
    expect(fav.classList.contains('is-on')).toBe(false);
    expect(fav.getAttribute('aria-pressed')).toBe('false');
    fav.click();
    await vi.waitFor(() => expect(fav.classList.contains('is-on')).toBe(true));
    expect(api.setFavorite).toHaveBeenCalledWith('i1', true);
    expect(fav.getAttribute('aria-pressed')).toBe('true');
    expect(fav.querySelector('svg').innerHTML).not.toBe(plus);
    fav.click();
    await vi.waitFor(() => expect(fav.classList.contains('is-on')).toBe(false));
    expect(fav.getAttribute('aria-pressed')).toBe('false');
    expect(fav.querySelector('svg').innerHTML).toBe(plus);
  });

  it('Klick ruft startDownload/openItemMenu mit Item + Button, öffnet kein Modal', async () => {
    feature.mount();
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-np__entry').length).toBe(2));
    const dl = entry('i1').querySelector('.lfx-np__btn--dl');
    const menu = entry('i1').querySelector('.lfx-np__btn--menu');
    dl.click();
    menu.click();
    expect(startDownload).toHaveBeenCalledWith(expect.objectContaining({ Id: 'i1' }), dl);
    expect(openItemMenu).toHaveBeenCalledWith(expect.objectContaining({ Id: 'i1' }), menu);
    expect(openModal).not.toHaveBeenCalled();
  });

  it('onItemsChanged: entfernt Einträge, zeichnet geänderte neu, meldet sich ab', async () => {
    feature.mount();
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-np__entry').length).toBe(2));
    const cb = onItemsChanged.mock.calls[0][0];
    putItems([mk('i1', 'Movie', { Name: 'Umbenannt' })]);
    cb({ removed: [], updated: ['i1'] });
    expect(entry('i1').querySelector('.lfx-np__name').textContent).toBe('Umbenannt');
    cb({ removed: ['i2'], updated: [] });
    expect(entry('i2')).toBeUndefined();
    expect(document.querySelectorAll('.lfx-np__entry').length).toBe(1);
    cb({ removed: ['i1'], updated: [] });
    expect(document.getElementById('lfx-np-new')).toBeNull();
    feature.unmount();
    expect(unsub).toHaveBeenCalled();
  });
});

describe('Charts in Neu und beliebt', () => {
  const chartsOf = (n) => Array.from({ length: n }, (_, i) => ({ id: `c${i}`, viewers: 9 - i, plays: 9 - i }));
  const body = (n) => ({ version: 1, windowDays: 14, movies: chartsOf(n), series: chartsOf(n), all: chartsOf(n) });

  beforeEach(() => {
    resetSourceCache();
    clearCache();
    resetChartsWarning();
    window.LenzFlixConfig = { chartsUrl: 'https://charts.example.com' };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    api.getItems.mockReset();
    api.getItems.mockImplementation(async (p) => {
      if (p.Ids) return { Items: p.Ids.split(',').map((id) => mk(id, 'Movie')) };
      if (p.IncludeItemTypes === 'Episode') return { Items: [] };
      return { Items: [mk('i1', 'Movie', { UserData: { PlayCount: 1 } }), mk('i2', 'Series')] };
    });
    document.body.innerHTML = '<div id="indexPage"><div id="homeTab"></div></div>';
  });
  afterEach(() => {
    feature.unmount();
    delete window.LenzFlixConfig;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    document.body.innerHTML = '';
  });

  const titles = () => [...document.querySelectorAll('.lfx-row__title')].map((t) => t.textContent);

  it('mit Charts: Top-10-Titel und Untertitel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body(5) }));
    feature.mount();
    await vi.waitFor(() => expect(titles()).toContain('Top 10 Serien'), { timeout: 3000 });
    expect(titles()).toContain('Top 10 Filme');
    const subs = [...document.querySelectorAll('.lfx-np__sub')].map((s) => s.textContent);
    expect(subs[0]).toBe('Meistgesehen auf LENZFLIX · letzte 14 Tage');
    expect(subs.length).toBe(3);
  });

  it('ohne Charts: ehrliche Fallback-Titel', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    feature.mount();
    await vi.waitFor(() => expect(titles()).toContain('Neueste Serien'), { timeout: 3000 });
    expect(titles()).toContain('Neueste Filme');
    expect(titles()).not.toContain('Top 10 Serien');
    expect(document.querySelector('.lfx-np__sub')).toBeNull();
    const pills = [...document.querySelectorAll('.lfx-np__pill')].map((p) => p.textContent);
    expect(pills.some((t) => t.includes('Neueste Serien'))).toBe(true);
  });

  it('Charts mit weniger als 3 Titeln: Fallback', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => body(2) }));
    feature.mount();
    await vi.waitFor(() => expect(titles()).toContain('Neueste Serien'), { timeout: 3000 });
    expect(titles()).not.toContain('Top 10 Filme');
  });
});
