// @vitest-environment jsdom
// LENZPRIME Titelseite: ItemsUpdated (Titelmenü, z. B. Metadaten aktualisieren) leert den 60-s-Cache der nächsten Folge.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const cbs = vi.hoisted(() => ({ fns: [] }));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, isReady: () => true, getUserId: () => 'u1', getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }) };
});
vi.mock('../src/js/core/theme.js', () => ({ isTheme: (id) => id === 'prime', getTheme: () => 'prime', brandName: () => 'LENZPRIME' }));
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isMobile: () => false }));
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn(async () => true) }));
vi.mock('../src/js/core/download.js', () => ({ canDownload: vi.fn(async () => false), startDownload: vi.fn(), isChooserOpen: vi.fn(() => false) }));
vi.mock('../src/js/core/itemmenu.js', () => ({
  openItemMenu: vi.fn(),
  isMenuOpen: vi.fn(() => false),
  onItemsChanged: vi.fn((fn) => { cbs.fns.push(fn); return () => {}; }),
}));
vi.mock('../src/js/features/modal/data.js', () => ({
  loadItem: vi.fn(),
  loadSeasons: vi.fn(),
  loadEpisodes: vi.fn(),
  loadNextUp: vi.fn(),
  loadSimilar: vi.fn(),
  loadCollection: vi.fn(),
  getStoredItem: vi.fn(() => null),
}));
vi.mock('../src/js/shared/trend.js', () => ({ getTrendInfo: vi.fn(async () => ({ available: true, rank: new Map() })), heroTrendLine: vi.fn(() => ''), cardBadge: vi.fn(() => null) }));
vi.mock('../src/js/shared/newcontent.js', () => ({ getNewContentInfo: vi.fn(async () => null) }));
vi.mock('../src/js/shared/trailer.js', () => ({ loadLocalTrailer: vi.fn(async () => null), trailerUrl: vi.fn(() => null), directRemoteTrailerUrl: vi.fn(() => null), applyStartAt: vi.fn() }));

import * as data from '../src/js/features/modal/data.js';
import { cached, clearCache, peekCached } from '../src/js/core/cache.js';
import { putItems, clearItemStore } from '../src/js/core/itemstore.js';
import feature from '../src/js/features/prime/title.js';

const series = { Id: 's1', Name: 'Serie', Type: 'Series', Overview: 'B', People: [], Genres: [], UserData: {} };

describe('prime-title: ItemsUpdated und Nächste-Folge-Cache', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections"></div></div></div>';
    window.scrollTo = vi.fn();
    vi.clearAllMocks();
    cbs.fns.length = 0;
    clearItemStore();
    clearCache('lfx:');
    data.loadItem.mockResolvedValue(series);
    data.loadSimilar.mockResolvedValue([]);
    data.loadSeasons.mockResolvedValue([]);
    data.loadEpisodes.mockResolvedValue([]);
    data.loadNextUp.mockResolvedValue(null);
    data.loadCollection.mockResolvedValue([]);
  });
  afterEach(() => feature.unmount());

  it('updated: [Serien-Id] leert lfx:modal:next:<id> vor dem Neuzeichnen des Abspielknopfs', async () => {
    feature.mount({ path: '/home', params: new URLSearchParams('lfx=title&id=s1') });
    for (let i = 0; i < 14; i++) await Promise.resolve();
    await cached('lfx:modal:next:s1', async () => ({ Id: 'alt' }));
    expect(peekCached('lfx:modal:next:s1')).toBeTruthy();
    putItems([{ ...series }]);
    for (const fn of cbs.fns) fn({ updated: ['s1'] });
    expect(peekCached('lfx:modal:next:s1')).toBeFalsy();
  });
});
