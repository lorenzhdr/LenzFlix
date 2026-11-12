// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    isReady: () => true,
    getUserId: () => 'u1',
    getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }),
    getViews: vi.fn(),
    getJson: vi.fn(),
    getItems: vi.fn(),
    getResume: vi.fn(),
    getNextUp: vi.fn(),
    getLatest: vi.fn(),
    getSimilar: vi.fn(),
  };
});

const themeState = vi.hoisted(() => ({ id: 'flix' }));
vi.mock('../src/js/core/theme.js', () => ({
  getTheme: () => themeState.id,
  brandName: () => ({ flix: 'LENZFLIX', plus: 'LENZ+', prime: 'LENZPRIME' })[themeState.id],
}));

import * as api from '../src/js/core/api.js';
import { badgeFor, selectTop10, pickGenres, seededShuffle, dayKey, progressPercent } from '../src/js/features/rows/logic.js';
import { createCard } from '../src/js/features/rows/card.js';
import { resetSourceCache, buildRowDefs, getNewSeriesIds } from '../src/js/features/rows/sources.js';
import { getStoredItem } from '../src/js/core/itemstore.js';
import { render } from '../src/js/features/rows.js';
import { startItemWatch, stopItemWatch } from '../src/js/core/itemmenu.js';
import { clearCache } from '../src/js/core/cache.js';
import { resetChartsWarning } from '../src/js/core/charts.js';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

describe('badgeFor', () => {
  it('Film: neu < 14 Tage', () => {
    expect(badgeFor({ Type: 'Movie', Id: 'm', DateCreated: daysAgo(3) }, new Set(), NOW)).toBe('Neu hinzugefügt');
    expect(badgeFor({ Type: 'Movie', Id: 'm', DateCreated: daysAgo(20) }, new Set(), NOW)).toBeNull();
  });
  it('Serie: Neue Folgen bei älterer Serie, sonst Neu hinzugefügt', () => {
    const ids = new Set(['s']);
    expect(badgeFor({ Type: 'Series', Id: 's', DateCreated: daysAgo(100) }, ids, NOW)).toBe('Neue Folgen');
    expect(badgeFor({ Type: 'Series', Id: 's', DateCreated: daysAgo(2) }, ids, NOW)).toBe('Neu hinzugefügt');
    expect(badgeFor({ Type: 'Series', Id: 'x', DateCreated: daysAgo(100) }, ids, NOW)).toBeNull();
    expect(badgeFor({ Type: 'Series', Id: 's', DateCreated: daysAgo(100) }, ['s'], NOW)).toBe('Neue Folgen');
  });
  it('Episode/null: kein Badge', () => {
    expect(badgeFor({ Type: 'Episode', Id: 'e', DateCreated: daysAgo(1) }, new Set(), NOW)).toBeNull();
    expect(badgeFor(null, null, NOW)).toBeNull();
  });
});

describe('selectTop10', () => {
  it('sortiert neueste zuerst, dedupliziert, max 10, nur Movie/Series', () => {
    const items = [];
    for (let i = 0; i < 14; i++) items.push({ Id: `i${i}`, Type: i % 2 ? 'Movie' : 'Series', DateCreated: daysAgo(i) });
    items.push({ Id: 'i0', Type: 'Series', DateCreated: daysAgo(0) }, { Id: 'ep', Type: 'Episode', DateCreated: daysAgo(0) });
    const out = selectTop10(items.reverse());
    expect(out).toHaveLength(10);
    expect(out.map((i) => i.Id)).toEqual(['i0', 'i1', 'i2', 'i3', 'i4', 'i5', 'i6', 'i7', 'i8', 'i9']);
  });
});

describe('Genre-Seed', () => {
  const genres = ['Action', 'Komödie', 'Drama', 'Horror', 'Thriller', 'Western', 'Krimi', 'Familie'];
  it('deterministisch pro Tag, unabhängig von Eingabereihenfolge', () => {
    const a = pickGenres(genres, { seed: '2026-11-08', count: 4 });
    const b = pickGenres([...genres].reverse(), { seed: '2026-11-08', count: 4 });
    expect(a).toEqual(b);
    expect(a).toHaveLength(4);
    expect(seededShuffle([1, 2, 3, 4, 5], 'x')).toEqual(seededShuffle([1, 2, 3, 4, 5], 'x'));
  });
  it('filtert Genres mit bekannter Anzahl < 8', () => {
    const out = pickGenres([{ Name: 'A', MovieCount: 2 }, { Name: 'B', MovieCount: 9 }], { seed: 's' });
    expect(out).toEqual(['B']);
  });
  it('dayKey formatiert lokal', () => {
    expect(dayKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});

describe('progressPercent', () => {
  it('nutzt PlayedPercentage, sonst Ticks', () => {
    expect(progressPercent({ UserData: { PlayedPercentage: 42 } })).toBe(42);
    expect(progressPercent({ RunTimeTicks: 100, UserData: { PlaybackPositionTicks: 25 } })).toBe(25);
    expect(progressPercent({})).toBe(0);
  });
});

describe('createCard', () => {
  it('Vertrag: data-lfx-id, href, Badge, Progress, Titel bei Nicht-Thumb', () => {
    const item = {
      Id: 'e1', Type: 'Episode', Name: 'Pilot', SeriesName: 'Show', SeriesId: 's1', ImageTags: { Primary: 'p' },
      RunTimeTicks: 100, UserData: { PlayedPercentage: 40 },
    };
    const el = createCard(item, { kind: 'resume', badge: 'Neue Folgen' });
    expect(el.dataset.lfxId).toBe('e1');
    expect(el.dataset.lfxType).toBe('Episode');
    expect(el.querySelector('a.lfx-card__link').getAttribute('href')).toBe('#/details?id=e1&serverId=srv');
    expect(el.querySelector('.lfx-badge').textContent).toBe('Neue Folgen');
    expect(el.querySelector('.lfx-progress__bar').style.width).toBe('40%');
    expect(el.querySelector('.lfx-card__title').textContent).toBe('Show');
  });
  it('Thumb: kein Titel; Top10 mit Rang', () => {
    const el = createCard({ Id: 'm', Type: 'Movie', Name: 'M', ImageTags: { Thumb: 't', Primary: 'p' } });
    expect(el.querySelector('.lfx-card__title')).toBeNull();
    expect(el.querySelector('.lfx-progress')).toBeNull();
    const t = createCard({ Id: 'm', Type: 'Movie', Name: 'M', ImageTags: { Primary: 'p' } }, { kind: 'top10', rank: 10 });
    expect(t.querySelector('.lfx-card__rank--wide').textContent).toBe('10');
    expect(t.querySelector('img').getAttribute('src')).toContain('/Images/Primary');
  });
});

describe('createCard Poster', () => {
  it('Poster-Zeile: picture mit source (max-width 799px) + img.lfx-card__img', () => {
    const el = createCard({ Id: 'm', Type: 'Movie', Name: 'M', ImageTags: { Thumb: 't', Primary: 'p' } });
    const src = el.querySelector('picture > source');
    expect(src.getAttribute('media')).toBe('(max-width: 799px)');
    expect(src.getAttribute('srcset')).toContain('/Items/m/Images/Primary');
    expect(src.getAttribute('srcset')).toContain('maxWidth=300');
    const img = el.querySelector('picture > img.lfx-card__img');
    expect(img.getAttribute('src')).toContain('/Images/Thumb');
  });
  it('Episode: Serien-Primary als Poster', () => {
    const el = createCard({ Id: 'e', Type: 'Episode', Name: 'E', SeriesId: 's1', SeriesPrimaryImageTag: 'st', ImageTags: { Primary: 'p' } });
    expect(el.querySelector('source').getAttribute('srcset')).toContain('/Items/s1/Images/Primary');
  });
  it('Weiterschauen und Top 10: kein picture', () => {
    const item = { Id: 'm', Type: 'Movie', Name: 'M', ImageTags: { Thumb: 't', Primary: 'p' } };
    expect(createCard(item, { kind: 'resume' }).querySelector('picture')).toBeNull();
    expect(createCard(item, { kind: 'top10', rank: 1 }).querySelector('picture')).toBeNull();
  });
});

describe('render', () => {
  const mk = (id, type = 'Movie', extra = {}) => ({ Id: id, Type: type, Name: id, ImageTags: { Thumb: 't' }, DateCreated: daysAgo(1), ...extra });
  beforeEach(() => {
    resetSourceCache();
    clearCache();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const many = (p) => Array.from({ length: 9 }, (_, i) => mk(`${p}${i}`));
    api.getViews.mockResolvedValue({ Items: [{ Id: 'vm', CollectionType: 'movies' }] });
    api.getJson.mockResolvedValue({ Items: [{ Name: 'Action' }] });
    api.getResume.mockResolvedValue({ Items: [mk('r1', 'Movie', { UserData: { PlayedPercentage: 30 } })] });
    api.getNextUp.mockResolvedValue({ Items: [] });
    api.getLatest.mockResolvedValue(many('l'));
    api.getSimilar.mockResolvedValue({ Items: [] });
    api.getItems.mockImplementation(async (p) => {
      if (p.IncludeItemTypes === 'Episode' && !p.Genres) return { Items: [] };
      return { Items: many('x') };
    });
  });

  it('erzeugt Zeilen, lässt leere weg, räumt auf', async () => {
    const slot = document.createElement('div');
    document.body.append(slot);
    const cleanup = render(slot);
    await vi.waitFor(() => expect(slot.querySelectorAll('.lfx-row:not(.is-loading)').length).toBeGreaterThan(3));
    const titles = [...slot.querySelectorAll('.lfx-row__title')].map((t) => t.textContent);
    expect(titles).toContain('Weiterschauen');
    expect(titles).toContain('Top 10: Neu auf LENZFLIX');
    expect(titles).toContain('Neu hinzugefügt: Filme');
    expect(titles).not.toContain('Als Nächstes');
    expect(titles).not.toContain('Neu hinzugefügt: Serien');
    const resume = slot.querySelector('[data-lfx-row="resume"]');
    expect(resume.querySelector('.lfx-progress__bar').style.width).toBe('30%');
    expect(resume.querySelector('.lfx-badge').textContent).toBe('Neu hinzugefügt');
    expect(getStoredItem('r1')).not.toBeNull();
    const top = slot.querySelector('[data-lfx-row="top10"]');
    expect(top.querySelectorAll('.lfx-card')).toHaveLength(9);
    expect(top.classList.contains('lfx-row--poster')).toBe(false);
    expect(resume.classList.contains('lfx-row--poster')).toBe(false);
    expect(slot.querySelector('[data-lfx-row="latest-movies"]').classList.contains('lfx-row--poster')).toBe(true);
    cleanup();
    expect(slot.children).toHaveLength(0);
  });

  it('Zeilen füllen sich, ohne auf die Neue-Folgen-Abfrage zu warten; Badge kommt nachträglich', async () => {
    let finish;
    const episodes = new Promise((r) => { finish = r; });
    const params = [];
    api.getResume.mockResolvedValue({ Items: [mk('s1', 'Series', { DateCreated: daysAgo(100) })] });
    api.getItems.mockImplementation(async (p) => {
      if (p.IncludeItemTypes === 'Episode' && !p.Genres && p.Limit !== 1) { params.push(p); return episodes; }
      if (p.IncludeItemTypes === 'Episode') return { Items: [] };
      return { Items: [mk('x0'), mk('x1'), mk('x2'), mk('x3'), mk('x4'), mk('x5'), mk('x6'), mk('x7'), mk('x8')] };
    });
    const slot = document.createElement('div');
    document.body.append(slot);
    const cleanup = render(slot);
    await vi.waitFor(() => expect(slot.querySelector('[data-lfx-row="resume"]:not(.is-loading)')).not.toBeNull());
    const card = slot.querySelector('[data-lfx-row="resume"] .lfx-card');
    expect(card.querySelector('.lfx-badge')).toBeNull();
    await vi.waitFor(() => expect(params).toHaveLength(1));
    expect(params[0].Limit).toBe(200);
    finish({ Items: [{ SeriesId: 's1', DateCreated: daysAgo(1), PremiereDate: daysAgo(5) }] });
    await vi.waitFor(() => expect(card.querySelector('.lfx-badge')?.textContent).toBe('Neue Folgen'));
    cleanup();
  });

  it('Neue-Folgen-Set kommt aus sessionStorage (kein /Items-Aufruf)', async () => {
    sessionStorage.setItem('lfx-newseries:u1', JSON.stringify({ at: Date.now(), ids: ['s9'] }));
    api.getItems.mockClear();
    const set = await getNewSeriesIds();
    expect(set.has('s9')).toBe(true);
    expect(api.getItems).not.toHaveBeenCalled();
    resetSourceCache();
  });

  it('Bibliotheken (/UserViews) werden nur einmal geladen', async () => {
    api.getViews.mockClear();
    await buildRowDefs();
    await buildRowDefs({ deferCharts: true });
    expect(api.getViews).toHaveBeenCalledTimes(1);
  });

  it('sendet lfx:rows-ready, sobald die erste Zeile gefüllt ist', async () => {
    const seen = vi.fn();
    document.addEventListener('lfx:rows-ready', seen);
    const slot = document.createElement('div');
    document.body.append(slot);
    const cleanup = render(slot);
    await vi.waitFor(() => expect(seen).toHaveBeenCalledTimes(1));
    expect(slot.querySelector('.lfx-row:not(.is-loading)')).not.toBeNull();
    document.removeEventListener('lfx:rows-ready', seen);
    cleanup();
  });

  it('entfernte Titel verschwinden aus den Zeilen, leere Zeilen auch', async () => {
    api.getResume.mockResolvedValue({ Items: [mk('r1', 'Movie', { UserData: { PlayedPercentage: 30 } })] });
    const slot = document.createElement('div');
    document.body.append(slot);
    const cleanup = render(slot);
    await vi.waitFor(() => expect(slot.querySelectorAll('.lfx-row:not(.is-loading)').length).toBeGreaterThan(3));
    let cb;
    window.ApiClient = { subscribe: (_t, fn) => { cb = fn; return () => {}; } };
    startItemWatch();
    const emitForTest = ({ removed }) => cb({ Data: { ItemsRemoved: removed } });
    expect(slot.querySelector('[data-lfx-row="resume"]')).not.toBeNull();
    emitForTest({ removed: ['r1', 'x0'], updated: [] });
    expect(slot.querySelector('[data-lfx-row="resume"]')).toBeNull();
    expect(slot.querySelectorAll('.lfx-card[data-lfx-id="x0"]')).toHaveLength(0);
    const top = slot.querySelector('[data-lfx-row="top10"]');
    if (top) expect(top.querySelectorAll('.lfx-card').length).toBeGreaterThan(0);
    cleanup();
    emitForTest({ removed: ['x1'], updated: [] });
    stopItemWatch();
    delete window.ApiClient;
  });

  it('API-Fehler: Zeile wird still weggelassen', async () => {
    api.getResume.mockRejectedValue(new Error('down'));
    const slot = document.createElement('div');
    const cleanup = render(slot);
    await vi.waitFor(() => expect(slot.querySelector('.lfx-row:not(.is-loading)')).not.toBeNull());
    expect(slot.querySelector('[data-lfx-row="resume"]')).toBeNull();
    cleanup();
  });
});

describe('Chart-Zeilen auf der Startseite', () => {
  const mk = (id, type = 'Movie') => ({ Id: id, Type: type, Name: id, ImageTags: { Thumb: 't' }, DateCreated: daysAgo(1) });
  const entries = (p, n) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i}`, viewers: 5, plays: 5 }));
  const run = async (charts) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(charts
      ? { ok: true, status: 200, json: async () => charts }
      : { ok: false, status: 503, json: async () => ({}) }));
    const slot = document.createElement('div');
    document.body.append(slot);
    const cleanup = render(slot);
    await vi.waitFor(() => {
      expect(slot.querySelectorAll('.lfx-row:not(.is-loading)').length).toBeGreaterThan(0);
      expect(slot.querySelectorAll('.lfx-row.is-loading')).toHaveLength(0);
    });
    const titles = [...slot.querySelectorAll('.lfx-row__title')].map((t) => t.textContent);
    cleanup();
    return titles;
  };
  const fiveNew = (i) => mk(`n${i}`);
  beforeEach(() => {
    resetSourceCache();
    clearCache();
    resetChartsWarning();
    window.LenzFlixConfig = { chartsUrl: 'https://charts.example.com' };
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    api.getViews.mockResolvedValue({ Items: [] });
    api.getJson.mockResolvedValue({ Items: [] });
    api.getResume.mockResolvedValue({ Items: [mk('r1')] });
    api.getNextUp.mockResolvedValue({ Items: [] });
    api.getLatest.mockResolvedValue([]);
    api.getSimilar.mockResolvedValue({ Items: [] });
    api.getItems.mockReset();
  });
  afterEach(() => { delete window.LenzFlixConfig; vi.unstubAllGlobals(); });

  it('Charts vorhanden: zwei Top-10-Zeilen statt Neu-Zeile', async () => {
    api.getItems.mockImplementation(async (p) => ({ Items: p.Ids ? p.Ids.split(',').map((id) => mk(id)) : [] }));
    const t = await run({ version: 1, windowDays: 30, series: entries('s', 6), movies: entries('m', 7), all: [] });
    expect(t).toContain('Top 10 Serien auf LENZFLIX');
    expect(t).toContain('Top 10 Filme auf LENZFLIX');
    expect(t).not.toContain('Top 10: Neu auf LENZFLIX');
  });

  it('Charts blockieren die Zeilen nicht: Skelett an fester Stelle, füllt sich nach', async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    api.getItems.mockImplementation(async (p) => ({ Items: p.Ids ? p.Ids.split(',').map((id) => mk(id)) : [] }));
    vi.stubGlobal('fetch', vi.fn(async () => {
      await gate;
      return { ok: true, status: 200, json: async () => ({ version: 1, windowDays: 30, series: entries('s', 6), movies: entries('m', 7), all: [] }) };
    }));
    const slot = document.createElement('div');
    document.body.append(slot);
    const cleanup = render(slot);
    await vi.waitFor(() => expect(slot.querySelector('[data-lfx-row="resume"]:not(.is-loading)')).not.toBeNull());
    const ids = () => [...slot.querySelectorAll('.lfx-row')].map((r) => r.dataset.lfxRow);
    expect(ids().slice(0, 3)).toEqual(['resume', 'top10-series', 'top10-movies']); // nextup leer -> entfernt
    expect(slot.querySelector('[data-lfx-row="top10-series"]').classList.contains('is-loading')).toBe(true);
    release();
    await vi.waitFor(() => expect(slot.querySelector('[data-lfx-row="top10-movies"]:not(.is-loading)')).not.toBeNull());
    expect(slot.querySelector('[data-lfx-row="top10-series"]:not(.is-loading) .lfx-card--top10')).not.toBeNull();
    expect(slot.querySelector('[data-lfx-row="top10-series"] .lfx-row__title').textContent).toBe('Top 10 Serien auf LENZFLIX');
    cleanup();
  });

  it('Charts nicht erreichbar: Platzhalter wird zur Neu-Zeile, zweiter entfällt', async () => {
    api.getItems.mockImplementation(async () => ({ Items: Array.from({ length: 5 }, (_, i) => fiveNew(i)) }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503, json: async () => ({}) }));
    const slot = document.createElement('div');
    document.body.append(slot);
    const cleanup = render(slot);
    await vi.waitFor(() => expect(slot.querySelector('[data-lfx-row="top10"]:not(.is-loading)')).not.toBeNull());
    await vi.waitFor(() => expect(slot.querySelector('[data-lfx-row="top10-movies"]')).toBeNull());
    expect(slot.querySelector('[data-lfx-row="top10"] .lfx-row__title').textContent).toBe('Top 10: Neu auf LENZFLIX');
    cleanup();
  });

  it('Theme plus: Markenname LENZ+ in den Titeln', async () => {
    themeState.id = 'plus';
    try {
      api.getItems.mockImplementation(async (p) => ({ Items: p.Ids ? p.Ids.split(',').map((id) => mk(id)) : [] }));
      const t = await run({ version: 1, windowDays: 30, series: entries('s', 6), movies: entries('m', 7), all: [] });
      expect(t).toContain('Top 10 Serien auf LENZ+');
      expect(t).toContain('Top 10 Filme auf LENZ+');
    } finally { themeState.id = 'flix'; }
  });

  it('Charts zu dünn: bisherige Neu-Zeile', async () => {
    api.getItems.mockImplementation(async (p) => ({
      Items: p.Ids ? p.Ids.split(',').map((id) => mk(id)) : Array.from({ length: 5 }, (_, i) => fiveNew(i)),
    }));
    const t = await run({ version: 1, windowDays: 30, series: entries('s', 4), movies: entries('m', 2), all: [] });
    expect(t).toContain('Top 10: Neu auf LENZFLIX');
    expect(t).not.toContain('Top 10 Serien auf LENZFLIX');
  });

  it('Charts nicht erreichbar: bisherige Neu-Zeile', async () => {
    api.getItems.mockImplementation(async () => ({ Items: Array.from({ length: 5 }, (_, i) => fiveNew(i)) }));
    expect(await run(null)).toContain('Top 10: Neu auf LENZFLIX');
  });
});

describe('newSeriesIdsFrom (Badge „Neue Folgen“)', () => {
  const now = Date.parse('2026-11-08T12:00:00Z');
  const daysAgo = (d) => new Date(now - d * 86400000).toISOString();
  it('zählt nur kürzlich hinzugefügte UND kürzlich erschienene Folgen', async () => {
    const { newSeriesIdsFrom } = await import('../src/js/features/rows/logic.js');
    const ids = newSeriesIdsFrom([
      { SeriesId: 'lupin', DateCreated: daysAgo(3), PremiereDate: daysAgo(17) },        // neue Staffel → ja
      { SeriesId: 'medicopter', DateCreated: daysAgo(2), PremiereDate: daysAgo(9000) }, // nachgeholt → nein
      { SeriesId: 'suits', DateCreated: daysAgo(2000), PremiereDate: daysAgo(30) },     // alt hinzugefügt → nein
      { SeriesId: 'ohnedatum', DateCreated: daysAgo(1) },                               // kein PremiereDate → nein
      { SeriesId: 'familyguy', DateCreated: daysAgo(5), PremiereDate: daysAgo(176) },   // < 12 Monate → ja
    ], now);
    expect([...ids].sort()).toEqual(['familyguy', 'lupin']);
  });
});
