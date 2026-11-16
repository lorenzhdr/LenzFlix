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
  isDataSaver: (part) => ds.on && !(part && (ds.off || []).includes(part)),
  onDataSaverChange: (cb) => { ds.subs.add(cb); return () => ds.subs.delete(cb); },
  onDataSaverPartsChange: (cb) => { (ds.psubs ||= new Set()).add(cb); return () => ds.psubs.delete(cb); },
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
import { clearItemStore } from '../src/js/core/itemstore.js';
import feature from '../src/js/features/prime/title.js';

const route = (id) => ({ path: '/home', params: new URLSearchParams('lfx=title&id=' + id) });
const mk = () => ({ Id: 'm1', Name: 'Film', Type: 'Movie', Overview: 'B', OfficialRating: 'FSK-16', ProductionYear: 2024, RunTimeTicks: 600_000_000 * 106, UserData: { PlaybackPositionTicks: 600_000_000 * 30 }, People: [], Genres: ['Drama'] });

describe('prime-title: Datensparmodus und Gesehen-Knopf', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections"></div></div></div>';
    document.documentElement.className = '';
    window.scrollTo = vi.fn();
    vi.clearAllMocks();
    clearItemStore();
    data.loadItem.mockImplementation(async () => mk());
    data.loadSimilar.mockResolvedValue([]);
    data.loadSeasons.mockResolvedValue([]);
    data.loadEpisodes.mockResolvedValue([]);
    data.loadNextUp.mockResolvedValue(null);
    data.loadCollection.mockResolvedValue([]);
  });
  afterEach(() => { feature.unmount(); ds.on = false; ds.off = []; ds.subs.clear(); ds.psubs && ds.psubs.clear(); });

  it('Datensparmodus an waehrend der Trailer laeuft: Video wird entladen', async () => {
    vi.useFakeTimers();
    try {
      loadLocalTrailer.mockResolvedValueOnce({ Id: 'tr1' });
      feature.mount(route('m1'));
      await vi.advanceTimersByTimeAsync(2500);
      const root = document.getElementById('lfx-prime-title');
      expect(root.querySelector('video.lfx-pt__video')).not.toBeNull();
      ds.on = true;
      for (const cb of [...ds.subs]) cb(true);
      await vi.advanceTimersByTimeAsync(100);
      expect(root.querySelector('video.lfx-pt__video')).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('Datensparmodus innerhalb der Wartezeit: Trailer startet nicht mehr', async () => {
    vi.useFakeTimers();
    try {
      loadLocalTrailer.mockResolvedValueOnce({ Id: 'tr1' });
      feature.mount(route('m1'));
      await vi.advanceTimersByTimeAsync(600);
      ds.on = true;
      for (const cb of [...ds.subs]) cb(true);
      await vi.advanceTimersByTimeAsync(2500);
      expect(document.querySelector('video.lfx-pt__video')).toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('per Trailer-Knopf gestarteter Trailer bleibt beim Einschalten erhalten', async () => {
    vi.useFakeTimers();
    try {
      ds.on = true;
      loadLocalTrailer.mockResolvedValueOnce({ Id: 'tr1' });
      feature.mount(route('m1'));
      await vi.advanceTimersByTimeAsync(2500);
      expect(document.querySelector('video.lfx-pt__video')).toBeNull();
      document.querySelector('.lfx-pt__circles [class*="trailer"]').click();
      expect(document.querySelector('video.lfx-pt__video')).not.toBeNull();
      for (const cb of [...ds.subs]) cb(true);
      expect(document.querySelector('video.lfx-pt__video')).not.toBeNull();
    } finally { vi.useRealTimers(); }
  });

  it('nach Als-gesehen-markieren zeigt der Abspielknopf Abspielen ohne Balken', async () => {
    const { togglePlayed } = await import('../src/js/shared/titleactions.js');
    togglePlayed.mockImplementationOnce(async (item) => { item.UserData = { Played: true, PlaybackPositionTicks: 0 }; return true; });
    feature.mount(route('m1'));
    await vi.waitFor(() => expect(document.querySelector('.lfx-pt__play-label')).not.toBeNull());
    expect(document.querySelector('.lfx-pt__play-label').textContent).toBe('Fortsetzen');
    expect(document.querySelector('.lfx-pt__progress')).not.toBeNull();
    document.querySelector('.lfx-pt__circles [class*="seen"]').click();
    await vi.waitFor(() => expect(document.querySelector('.lfx-pt__play-label').textContent).toBe('Abspielen'));
    expect(document.querySelector('.lfx-pt__progress')).toBeNull();
    document.querySelector('.lfx-pt__play').click();
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ Id: 'm1' }), { resume: false });
  });
});
