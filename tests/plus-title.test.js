// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const themeState = vi.hoisted(() => ({ id: 'plus' }));
vi.mock('../src/js/core/theme.js', () => ({
  getTheme: () => themeState.id,
  isTheme: (id) => themeState.id === id,
  brandName: () => 'LENZ+',
}));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    isReady: () => true,
    getUserId: () => 'u1',
    getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }),
  };
});
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isMobile: () => false }));
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn().mockResolvedValue(true) }));
vi.mock('../src/js/core/download.js', () => ({ canDownload: vi.fn().mockResolvedValue(false), startDownload: vi.fn(), isChooserOpen: () => false }));
vi.mock('../src/js/core/itemmenu.js', () => ({ openItemMenu: vi.fn(), onItemsChanged: vi.fn(() => () => {}) }));
vi.mock('../src/js/shared/titleactions.js', () => ({
  togglePlayed: vi.fn().mockResolvedValue(true),
  toggleFavorite: vi.fn().mockResolvedValue(true),
  startDownloadFor: vi.fn(),
  openTitleMenu: vi.fn(),
}));
vi.mock('../src/js/shared/trailer.js', () => ({
  loadLocalTrailer: vi.fn().mockResolvedValue(null),
  trailerUrl: (id) => `http://x/trailer/${id}`,
  directRemoteTrailerUrl: vi.fn().mockReturnValue(null),
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

import title from '../src/js/features/plus/title.js';
import { parseHash } from '../src/js/core/router.js';
import * as data from '../src/js/features/modal/data.js';
import { play } from '../src/js/core/playback.js';
import { toggleFavorite } from '../src/js/shared/titleactions.js';
import { directRemoteTrailerUrl } from '../src/js/shared/trailer.js';

const route = (hash) => parseHash(hash);
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

const movie = { Id: 'm1', Name: 'Film', Type: 'Movie', Overview: 'Beschreibung', Genres: ['Drama'], ProductionYear: 2020, OfficialRating: 'FSK-12', RunTimeTicks: 6_000_000_000, UserData: {} };
const series = { Id: 's1', Name: 'Serie', Type: 'Series', Overview: 'Serienbeschreibung', ChildCount: 2, ProductionYear: 2019, UserData: {} };
const ep = (id, n, extra = {}) => ({ Id: id, Name: `Folge ${n}`, Type: 'Episode', IndexNumber: n, ParentIndexNumber: 1, SeriesId: 's1', SeasonId: 'se1', UserData: {}, ...extra });

beforeEach(() => {
  themeState.id = 'plus';
  window.scrollTo = vi.fn();
  document.documentElement.className = '';
  document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections">nativ</div></div></div>';
  for (const f of Object.values(data)) if (f.mockReset) f.mockReset();
  data.getStoredItem.mockReturnValue(null);
  data.loadSimilar.mockResolvedValue([]);
  data.loadSeasons.mockResolvedValue([]);
  data.loadEpisodes.mockResolvedValue([]);
  data.loadNextUp.mockResolvedValue(null);
  vi.mocked(play).mockClear();
});
afterEach(() => { title.unmount(); document.body.innerHTML = ''; });

describe('match', () => {
  it('nur plus, nur lfx=title mit id', () => {
    expect(title.match(route('#/home?lfx=title&id=m1'))).toBe(true);
    expect(title.match(route('#/home?lfx=title'))).toBe(false);
    expect(title.match(route('#/home?lfx=browse&lib=1'))).toBe(false);
    themeState.id = 'flix';
    expect(title.match(route('#/home?lfx=title&id=m1'))).toBe(false);
  });
});

describe('Film', () => {
  beforeEach(() => { data.loadItem.mockImplementation(async (id) => (id === 'm1' ? movie : null)); });

  it('rendert Kopf, Tabs ohne Folgen und räumt beim Unmount auf', async () => {
    title.mount(route('#/home?lfx=title&id=m1'));
    await flush();
    const root = document.getElementById('lfx-plus-title');
    expect(root).toBeTruthy();
    expect(document.documentElement.classList.contains('lfx-plus-title-on')).toBe(true);
    expect(root.querySelector('.lfx-plus-title__name').textContent).toBe('Film');
    expect(root.querySelector('.lfx-plus-age').textContent).toBe('12');
    const tabs = [...root.querySelectorAll('.lfx-plus-title__tab')].map((t) => t.textContent);
    expect(tabs).toEqual(['Empfehlungen', 'Details']);
    expect(root.querySelector('.lfx-plus-pill--primary').textContent).toBe('Abspielen');
    title.unmount();
    expect(document.getElementById('lfx-plus-title')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-plus-title-on')).toBe(false);
  });

  it('Fortsetzen bei Position; Klick spielt mit resume', async () => {
    data.loadItem.mockResolvedValue({ ...movie, UserData: { PlaybackPositionTicks: 1000 } });
    title.mount(route('#/home?lfx=title&id=m1'));
    await flush();
    const btn = document.querySelector('.lfx-plus-pill--primary');
    expect(btn.textContent).toBe('Fortsetzen');
    btn.click();
    await flush();
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ Id: 'm1' }), { resume: true });
  });

  it('Meine Liste schaltet Zustand und Beschriftung', async () => {
    title.mount(route('#/home?lfx=title&id=m1'));
    await flush();
    const fav = document.querySelector('.lfx-plus-circle--fav');
    expect(fav.getAttribute('aria-label')).toBe('Zu Meine Liste hinzufügen');
    fav.click();
    await flush();
    expect(toggleFavorite).toHaveBeenCalled();
    expect(fav.getAttribute('aria-label')).toBe('Aus Meine Liste entfernen');
    expect(fav.classList.contains('is-on')).toBe(true);
  });

  it('Trailer-Knopf nur mit Quelle; Overlay schließt per Escape', async () => {
    title.mount(route('#/home?lfx=title&id=m1'));
    await flush();
    expect(document.querySelector('.lfx-plus-circle--trailer').hidden).toBe(true);
    title.unmount();
    vi.mocked(directRemoteTrailerUrl).mockReturnValue('http://x/t.mp4');
    title.mount(route('#/home?lfx=title&id=m1'));
    await flush();
    const tb = document.querySelector('.lfx-plus-circle--trailer');
    expect(tb.hidden).toBe(false);
    tb.click();
    const ov = document.getElementById('lfx-plus-trailer');
    expect(ov).toBeTruthy();
    expect(ov.querySelector('video').getAttribute('src')).toBe('http://x/t.mp4');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('lfx-plus-trailer')).toBeNull();
    vi.mocked(directRemoteTrailerUrl).mockReturnValue(null);
  });

  it('Wechsel id->id lädt neu, alte Antwort wird verworfen', async () => {
    let resolveFirst;
    data.loadItem.mockImplementation((id) => (id === 'm1'
      ? new Promise((r) => { resolveFirst = () => r(movie); })
      : Promise.resolve({ ...movie, Id: 'm2', Name: 'Zweiter' })));
    title.mount(route('#/home?lfx=title&id=m1'));
    await flush();
    title.update(route('#/home?lfx=title&id=m2'));
    await flush();
    resolveFirst();
    await flush();
    expect(document.querySelectorAll('#lfx-plus-title').length).toBe(1);
    expect(document.querySelector('.lfx-plus-title__name').textContent).toBe('Zweiter');
  });

  it('Fehler: Hinweis statt Absturz', async () => {
    data.loadItem.mockRejectedValue(new Error('nope'));
    title.mount(route('#/home?lfx=title&id=zz'));
    await flush();
    expect(document.querySelector('.lfx-plus-title__error')).toBeTruthy();
  });
});

describe('Serie und Episode', () => {
  beforeEach(() => {
    data.loadItem.mockImplementation(async (id) => (id === 's1' ? series : null));
    data.getStoredItem.mockImplementation((id) => (id === 'e2' ? ep('e2', 2) : null));
    data.loadSeasons.mockResolvedValue([{ Id: 'se0', Name: 'Specials', IndexNumber: 0 }, { Id: 'se1', Name: 'Staffel 1', IndexNumber: 1 }]);
    data.loadEpisodes.mockResolvedValue([ep('e1', 1), ep('e2', 2, { UserData: { PlaybackPositionTicks: 500, PlayedPercentage: 30 }, RunTimeTicks: 3_000_000_000 })]);
    data.loadNextUp.mockResolvedValue(ep('e2', 2, { UserData: { PlaybackPositionTicks: 500 } }));
  });

  it('hat Folgen-Tab, wählt die erste reguläre Staffel und zeigt Folgen', async () => {
    title.mount(route('#/home?lfx=title&id=s1'));
    await flush();
    const tabs = [...document.querySelectorAll('.lfx-plus-title__tab')].map((t) => t.textContent);
    expect(tabs).toEqual(['Folgen', 'Empfehlungen', 'Details']);
    expect(data.loadEpisodes).toHaveBeenCalledWith('s1', 'se1');
    expect(document.querySelectorAll('.lfx-plus-ep').length).toBe(2);
    expect(document.querySelector('.lfx-plus-season').textContent).toContain('Staffel 1');
    expect(document.querySelector('.lfx-plus-pill--primary').textContent).toBe('S1:F2 fortsetzen');
  });

  it('Episoden-Id löst zur Serie auf und markiert die Folge', async () => {
    title.mount(route('#/home?lfx=title&id=e2'));
    await flush();
    expect(data.loadItem).toHaveBeenCalledWith('s1');
    expect(document.querySelector('.lfx-plus-ep.is-selected').dataset.id).toBe('e2');
  });

  it('Klick auf Folge spielt sie ab', async () => {
    title.mount(route('#/home?lfx=title&id=s1'));
    await flush();
    document.querySelector('.lfx-plus-ep[data-id="e1"]').click();
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ Id: 'e1' }), { resume: false });
  });
});

describe('Sammlung', () => {
  it('zeigt das Titel-Raster', async () => {
    data.loadItem.mockResolvedValue({ Id: 'b1', Name: 'Box', Type: 'BoxSet', UserData: {} });
    data.loadCollection.mockResolvedValue([{ Id: 'x1', Name: 'Eins', Type: 'Movie' }, { Id: 'x2', Name: 'Zwei', Type: 'Movie' }]);
    title.mount(route('#/home?lfx=title&id=b1'));
    await flush();
    expect([...document.querySelectorAll('.lfx-plus-title__tab')].map((t) => t.textContent)).toEqual(['Titel', 'Details']);
    expect(document.querySelectorAll('.lfx-card[data-lfx-id]').length).toBe(2);
  });
});
