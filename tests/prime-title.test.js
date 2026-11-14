// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    isReady: () => true,
    getUserId: () => 'u1',
    getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }),
  };
});
vi.mock('../src/js/core/theme.js', () => ({ isTheme: (id) => id === 'prime', getTheme: () => 'prime', brandName: () => 'LENZPRIME' }));
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isMobile: () => false }));
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn(async () => true) }));
vi.mock('../src/js/core/download.js', () => ({ canDownload: vi.fn(async () => true), startDownload: vi.fn(), isChooserOpen: vi.fn(() => false) }));
vi.mock('../src/js/core/itemmenu.js', () => ({ openItemMenu: vi.fn(), isMenuOpen: vi.fn(() => false), onItemsChanged: vi.fn(() => () => {}) }));
vi.mock('../src/js/features/modal/data.js', () => ({
  loadItem: vi.fn(),
  loadSeasons: vi.fn(),
  loadEpisodes: vi.fn(),
  loadNextUp: vi.fn(),
  loadSimilar: vi.fn(),
  loadCollection: vi.fn(),
  getStoredItem: vi.fn(() => null),
}));
vi.mock('../src/js/shared/trend.js', () => ({
  getTrendInfo: vi.fn(async () => ({ available: true, rank: new Map() })),
  heroTrendLine: vi.fn(() => 'Platz 2 der Top 10'),
  cardBadge: vi.fn(() => null),
}));
vi.mock('../src/js/shared/newcontent.js', () => ({ getNewContentInfo: vi.fn(async () => null) }));
vi.mock('../src/js/shared/trailer.js', () => ({
  loadLocalTrailer: vi.fn(async () => null),
  trailerUrl: vi.fn((id) => `http://x/Videos/${id}/stream.mp4`),
  directRemoteTrailerUrl: vi.fn(() => null),
  applyStartAt: vi.fn(),
}));
const ds = vi.hoisted(() => ({ on: false, subs: new Set() }));
vi.mock('../src/js/core/datasaver.js', () => ({
  isDataSaver: () => ds.on,
  onDataSaverChange: (cb) => { ds.subs.add(cb); return () => ds.subs.delete(cb); },
}));
vi.mock('../src/js/shared/titleactions.js', () => ({
  togglePlayed: vi.fn(async () => true),
  toggleFavorite: vi.fn(async (item) => {
    item.UserData = { ...(item.UserData || {}), IsFavorite: true };
    return true;
  }),
  startDownloadFor: vi.fn(),
  openTitleMenu: vi.fn(),
}));

import * as data from '../src/js/features/modal/data.js';
import { play } from '../src/js/core/playback.js';
import { loadLocalTrailer } from '../src/js/shared/trailer.js';
import { putItems, clearItemStore } from '../src/js/core/itemstore.js';
import feature from '../src/js/features/prime/title.js';
import {
  resolveTarget, ratingChip, playInfo, remainingLabel, detailTiles, metaItems, seasonName, episodeTitle,
} from '../src/js/features/prime/title-logic.js';

const route = (id, kind = 'title') => ({ path: '/home', params: new URLSearchParams(`lfx=${kind}&id=${id}`) });
const flush = async (n = 8) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

describe('title-logic', () => {
  it('resolveTarget: Folge und Staffel zeigen auf die Serie', () => {
    expect(resolveTarget({ Id: 'e1', Type: 'Episode', SeriesId: 's1', SeasonId: 'se2' }, 'e1')).toEqual({ targetId: 's1', sel: { seasonId: 'se2', episodeId: 'e1' } });
    expect(resolveTarget({ Id: 'se2', Type: 'Season', SeriesId: 's1' }, 'se2')).toEqual({ targetId: 's1', sel: { seasonId: 'se2', episodeId: null } });
    expect(resolveTarget({ Id: 'm1', Type: 'Movie' }, 'm1').targetId).toBe('m1');
  });
  it('ratingChip', () => {
    expect(ratingChip('FSK-16')).toEqual({ text: '16', tone: '16' });
    expect(ratingChip('FSK-12').tone).toBe('12');
    expect(ratingChip('FSK-0').tone).toBe('6');
    expect(ratingChip('')).toBeNull();
  });
  it('playInfo: Film, Fortsetzen, Serie', () => {
    expect(playInfo({ Type: 'Movie', RunTimeTicks: 100, UserData: {} }, null).label).toBe('Abspielen');
    const r = playInfo({ Type: 'Movie', RunTimeTicks: 1000, UserData: { PlaybackPositionTicks: 500 } }, null);
    expect(r.label).toBe('Fortsetzen');
    expect(r.progress).toBe(50);
    const ep = { Id: 'e3', IndexNumber: 3, ParentIndexNumber: 1, RunTimeTicks: 1000, UserData: {} };
    expect(playInfo({ Type: 'Series' }, ep)).toMatchObject({ label: 'Folge 3', sub: 'Jetzt ansehen', resume: false });
    const ep2 = { ...ep, UserData: { PlaybackPositionTicks: 250 } };
    expect(playInfo({ Type: 'Series' }, ep2)).toMatchObject({ label: 'Fortsetzen', sub: 'S1 F3', resume: true, progress: 25 });
    expect(playInfo({ Type: 'Series' }, null).label).toBe('Abspielen');
  });
  it('remainingLabel, Namen, Meta', () => {
    expect(remainingLabel({ RunTimeTicks: 600_000_000 * 46, UserData: { PlaybackPositionTicks: 600_000_000 * 3 } })).toBe('Noch 43 Min.');
    expect(remainingLabel({ RunTimeTicks: 10, UserData: {} })).toBe('');
    expect(seasonName({ IndexNumber: 2 })).toBe('Staffel 2');
    expect(seasonName({ IndexNumber: 0, Name: 'Specials' })).toBe('Specials');
    expect(episodeTitle({ IndexNumber: 4, Name: 'Fest' })).toBe('4. Fest');
    expect(metaItems({ Type: 'Series', ProductionYear: 2020, CommunityRating: 7.44 }, 3)).toEqual(['★ 7,4', '2020', '3 Staffeln']);
  });
  it('detailTiles lässt leere Kacheln weg', () => {
    const t = detailTiles({
      Name: 'X', Overview: 'o', Genres: ['Drama'], Type: 'Movie', RunTimeTicks: 600_000_000 * 90,
      People: [{ Type: 'Actor', Name: 'A', Role: 'R' }, { Type: 'Director', Name: 'D' }],
      MediaSources: [{ MediaStreams: [{ Type: 'Audio', DisplayLanguage: 'Deutsch' }, { Type: 'Subtitle', DisplayLanguage: 'Englisch' }] }],
    });
    expect(t.map((x) => x.id)).toEqual(['info', 'genres', 'cast', 'crew', 'audio', 'subs', 'runtime']);
    expect(detailTiles({ Name: 'Y' }).map((x) => x.id)).toEqual(['info']);
  });
});

describe('prime-title Feature', () => {
  const movie = { Id: 'm1', Name: 'Film', Type: 'Movie', Overview: 'Beschreibung', OfficialRating: 'FSK-16', ProductionYear: 2024, RunTimeTicks: 600_000_000 * 106, UserData: {}, People: [], Genres: ['Drama'] };
  const series = { Id: 's1', Name: 'Serie', Type: 'Series', Overview: 'S', ChildCount: 2, UserData: {} };
  const seasons = [{ Id: 'se1', IndexNumber: 1, Name: 'Staffel 1' }, { Id: 'se2', IndexNumber: 2, Name: 'Staffel 2' }];
  const eps = [
    { Id: 'e1', Name: 'Anfang', IndexNumber: 1, Type: 'Episode', RunTimeTicks: 600_000_000 * 40, UserData: {} },
    { Id: 'e2', Name: 'Mitte', IndexNumber: 2, Type: 'Episode', RunTimeTicks: 600_000_000 * 40, UserData: { PlaybackPositionTicks: 600_000_000 * 10 } },
  ];

  beforeEach(() => {
    document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections"></div></div></div>';
    document.documentElement.className = '';
    window.scrollTo = vi.fn();
    vi.clearAllMocks();
    clearItemStore();
    data.loadItem.mockImplementation(async (id) => ({ m1: movie, s1: series }[id] || null));
    data.loadSimilar.mockResolvedValue([{ Id: 'm2', Name: 'Ähnlich', Type: 'Movie', ImageTags: {} }, movie]);
    data.loadSeasons.mockResolvedValue(seasons);
    data.loadEpisodes.mockResolvedValue(eps);
    data.loadNextUp.mockResolvedValue(null);
    data.loadCollection.mockResolvedValue([]);
  });
  afterEach(() => feature.unmount());

  it('match nur für title-Route mit id', () => {
    expect(feature.match(route('m1'))).toBe(true);
    expect(feature.match(route('m1', 'hub'))).toBe(false);
    expect(feature.match({ path: '/home', params: new URLSearchParams('lfx=title') })).toBe(false);
    expect(feature.match({ path: '/movies', params: new URLSearchParams('lfx=title&id=m1') })).toBe(false);
  });

  it('rendert Film: Kopf, Tabs, Raster, Details; unmount räumt auf', async () => {
    feature.mount(route('m1'));
    await flush(12);
    const root = document.getElementById('lfx-prime-title');
    expect(root).toBeTruthy();
    expect(document.documentElement.classList.contains('lfx-prime-title-on')).toBe(true);
    expect(root.querySelector('.lfx-pt__title').textContent).toBe('Film');
    expect(root.querySelector('.lfx-pt__fsk').textContent).toBe('16');
    expect(root.querySelector('.lfx-pt__rank').textContent).toContain('Platz 2');
    expect([...root.querySelectorAll('.lfx-pt__tab')].map((b) => b.textContent)).toEqual(['Ähnliches', 'Details']);
    expect(root.querySelectorAll('#lfx-pt-panel-similar .lfx-card').length).toBe(1); // sich selbst ausgefiltert
    expect(root.querySelector('#lfx-pt-panel-details .lfx-pt__tile')).toBeTruthy();
    expect(root.querySelector('.lfx-pt__circle--dl').hidden).toBe(false);
    root.querySelector('.lfx-pt__play').click();
    expect(play).toHaveBeenCalledWith(movie, { resume: false });
    feature.unmount();
    expect(document.getElementById('lfx-prime-title')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-prime-title-on')).toBe(false);
  });

  it('Folge öffnet die Serie mit vorgewählter Staffel und markierter Folge', async () => {
    putItems([{ Id: 'ep9', Type: 'Episode', SeriesId: 's1', SeasonId: 'se2' }]);
    data.loadNextUp.mockResolvedValue({ ...eps[1], ParentIndexNumber: 2 });
    feature.mount(route('ep9'));
    await flush(14);
    const root = document.getElementById('lfx-prime-title');
    expect(data.loadItem).toHaveBeenCalledWith('s1');
    expect(data.loadEpisodes).toHaveBeenCalledWith('s1', 'se2');
    expect([...root.querySelectorAll('.lfx-pt__tab')].map((b) => b.textContent)).toEqual(['Folgen', 'Ähnliches', 'Details']);
    expect(root.querySelectorAll('.lfx-pt__ep').length).toBe(2);
    expect(root.querySelector('.lfx-pt__season-label').textContent).toBe('Staffel 2');
    expect(root.querySelector('.lfx-pt__ep-badge').textContent).toBe('Noch 30 Min.');
    expect(root.querySelector('.lfx-pt__play-label').textContent).toBe('Fortsetzen');
    expect(root.querySelector('.lfx-pt__progress')).toBeTruthy();
    root.querySelectorAll('.lfx-pt__ep-media')[0].click();
    expect(play).toHaveBeenCalledWith(eps[0], { resume: false });
  });

  it('update id->id lädt neu und verwirft die späte Antwort des alten Titels', async () => {
    let releaseOld;
    data.loadItem.mockImplementation((id) => (id === 'm1'
      ? new Promise((res) => { releaseOld = () => res(movie); })
      : Promise.resolve({ ...movie, Id: 'm9', Name: 'Neu' })));
    feature.mount(route('m1'));
    await flush(3);
    feature.update(route('m9'));
    await flush(10);
    releaseOld();
    await flush(10);
    const root = document.getElementById('lfx-prime-title');
    expect(root.querySelector('.lfx-pt__title').textContent).toBe('Neu');
    expect(root.querySelectorAll('.lfx-pt__title').length).toBe(1);
  });

  it('Fehler beim Laden zeigt Meldung mit Link', async () => {
    data.loadItem.mockRejectedValue(new Error('x'));
    feature.mount(route('m1'));
    await flush(8);
    const root = document.getElementById('lfx-prime-title');
    expect(root.querySelector('.lfx-pt__error')).toBeTruthy();
    expect(root.querySelector('.lfx-pt__back').getAttribute('href')).toBe('#/home');
  });

  it('Trailer: Video startet stumm, unmount stoppt und entfernt es', async () => {
    vi.useFakeTimers();
    try {
      loadLocalTrailer.mockResolvedValueOnce({ Id: 'tr1' });
      feature.mount(route('m1'));
      await vi.advanceTimersByTimeAsync(2000);
      const root = document.getElementById('lfx-prime-title');
      const v = root.querySelector('video.lfx-pt__video');
      expect(v).toBeTruthy();
      expect(v.muted).toBe(true);
      expect(root.querySelector('.lfx-pt__circle--trailer').hidden).toBe(false);
      feature.unmount();
      expect(document.querySelector('video')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('prime-title: Datensparmodus', () => {
  afterEach(() => { ds.on = false; });
  it('an: kein Trailer-Autoplay, der Trailer-Knopf bleibt sichtbar', async () => {
    vi.useFakeTimers();
    try {
      ds.on = true;
      loadLocalTrailer.mockResolvedValueOnce({ Id: 'tr1' });
      feature.mount(route('m1'));
      await vi.advanceTimersByTimeAsync(2500);
      const root = document.getElementById('lfx-prime-title');
      expect(root.querySelector('video.lfx-pt__video')).toBeNull();
      expect(root.querySelector('.lfx-pt__circle--trailer').hidden).toBe(false);
      feature.unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
