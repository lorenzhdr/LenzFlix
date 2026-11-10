// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const themeState = vi.hoisted(() => ({ id: 'retro' }));
vi.mock('../src/js/core/theme.js', () => ({
  getTheme: () => themeState.id,
  isTheme: (id) => themeState.id === id,
  brandName: () => 'LENZ//84',
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

import title from '../src/js/features/retro/title.js';
import { episodeCode, tapeName, runtimeSticker } from '../src/js/features/retro/title-dom.js';
import { FX_EVENT } from '../src/js/features/retro/prefs.js';
import { parseHash } from '../src/js/core/router.js';
import * as data from '../src/js/features/modal/data.js';
import { play } from '../src/js/core/playback.js';
import { toggleFavorite, togglePlayed } from '../src/js/shared/titleactions.js';
import { directRemoteTrailerUrl } from '../src/js/shared/trailer.js';

const route = (hash) => parseHash(hash);
const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

const movie = {
  Id: 'm1', Name: 'Film', Type: 'Movie', Overview: 'Beschreibung des Films', Genres: ['Drama', 'Sci-Fi'], ProductionYear: 1984,
  OfficialRating: 'FSK-16', RunTimeTicks: 60_000_000_000, UserData: {},
  People: [{ Name: 'Anna', Type: 'Actor' }, { Name: 'Bert', Type: 'Director' }],
};
const series = { Id: 's1', Name: 'Serie', Type: 'Series', Overview: 'Serienbeschreibung', ChildCount: 2, ProductionYear: 1985, UserData: {} };
const ep = (id, n, extra = {}) => ({ Id: id, Name: `Folge ${n}`, Type: 'Episode', IndexNumber: n, ParentIndexNumber: 1, SeriesId: 's1', SeasonId: 'se1', UserData: {}, ...extra });

beforeEach(() => {
  themeState.id = 'retro';
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

describe('Hilfsfunktionen', () => {
  it('Episodencode, Tape-Namen, Laufzeit-Aufkleber', () => {
    expect(episodeCode({ ParentIndexNumber: 1, IndexNumber: 3 })).toBe('S01E03');
    expect(episodeCode({ IndexNumber: 3 })).toBe('E03');
    expect(episodeCode({})).toBe('');
    expect(tapeName({ IndexNumber: 2 }, 1)).toBe('TAPE 2');
    expect(tapeName({ IndexNumber: 0 }, 0)).toBe('EXTRAS');
    expect(runtimeSticker(60_000_000_000)).toBe('1H40');
    expect(runtimeSticker(6_000_000_000)).toBe('10 MIN');
    expect(runtimeSticker(1_800_000_000)).toBe('3 MIN');
    expect(runtimeSticker(0)).toBe('');
  });
});

describe('match', () => {
  it('nur retro, nur lfx=title mit id', () => {
    expect(title.match(route('#/home?lfx=title&id=m1'))).toBe(true);
    expect(title.match(route('#/home?lfx=title'))).toBe(false);
    expect(title.match(route('#/home?lfx=browse&lib=1'))).toBe(false);
    themeState.id = 'plus';
    expect(title.match(route('#/home?lfx=title&id=m1'))).toBe(false);
    themeState.id = 'flix';
    expect(title.match(route('#/home?lfx=title&id=m1'))).toBe(false);
  });
});

describe('Film', () => {
  beforeEach(() => { data.loadItem.mockImplementation(async (id) => (id === 'm1' ? movie : null)); });

  it('rendert Hülle mit Aufklebern, Meta, Beschreibung; räumt beim Unmount auf', async () => {
    const seen = [];
    const onFx = (e) => seen.push(e.detail.name);
    document.addEventListener(FX_EVENT, onFx);
    title.mount(route('#/home?lfx=title&id=m1'));
    await flush();
    const root = document.getElementById('lfx-retro-title');
    expect(root).toBeTruthy();
    expect(document.documentElement.classList.contains('lfx-retro-title-on')).toBe(true);
    expect(document.documentElement.classList.contains('lfx-retro-page-on')).toBe(true);
    expect(root.querySelector('.lfx-rt__chrome').textContent).toBe('Film');
    expect(root.querySelector('.lfx-rt__sticker--fsk .lfx-rt__fsk-num').textContent).toBe('16');
    expect(root.querySelector('.lfx-rt__sticker--time').textContent).toBe('1H40');
    expect(root.querySelector('.lfx-rt__sticker--stereo')).toBeTruthy();
    expect([...root.querySelectorAll('.lfx-rt__meta li')].map((l) => l.textContent)).toContain('1984');
    expect(root.querySelector('.lfx-rt__sr').textContent).toBe('Beschreibung des Films');
    expect(root.querySelector('.lfx-rt__cast').textContent).toContain('Anna');
    expect(root.querySelector('.lfx-rt__btn--play').textContent).toBe('Abspielen');
    expect(root.querySelector('.lfx-rt__tabs')).toBeNull();
    expect(seen).toContain('open');
    document.removeEventListener(FX_EVENT, onFx);
    title.unmount();
    expect(document.getElementById('lfx-retro-title')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-retro-title-on')).toBe(false);
    expect(document.documentElement.classList.contains('lfx-retro-page-on')).toBe(false);
  });

  it('Beschreibung tippt sich ein und ist danach vollständig', async () => {
    title.mount(route('#/home?lfx=title&id=m1'));
    await flush();
    await new Promise((r) => setTimeout(r, 1600));
    const p = document.querySelector('.lfx-rt__text');
    expect(p.querySelector('.lfx-rt__typed').textContent).toBe('Beschreibung des Films');
    expect(p.classList.contains('lfx-retro-caret')).toBe(false);
  });

  it('Fortsetzen bei Position; Klick spielt mit resume, Neu starten ohne', async () => {
    data.loadItem.mockResolvedValue({ ...movie, UserData: { PlaybackPositionTicks: 1000 } });
    title.mount(route('#/home?lfx=title&id=m1'));
    await flush();
    const btn = document.querySelector('.lfx-rt__btn--play');
    expect(btn.textContent).toBe('Fortsetzen');
    btn.click();
    await flush();
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ Id: 'm1' }), { resume: true });
    const restart = document.querySelector('.lfx-rt__btn--restart');
    expect(restart.hidden).toBe(false);
    restart.click();
    await flush();
    expect(play).toHaveBeenLastCalledWith(expect.objectContaining({ Id: 'm1' }), { resume: false });
  });

  it('Meine Liste und Gesehen schalten Zustand (gemockte Aktionen)', async () => {
    title.mount(route('#/home?lfx=title&id=m1'));
    await flush();
    const fav = document.querySelector('.lfx-rt__btn--fav');
    expect(fav.getAttribute('aria-pressed')).toBe('false');
    fav.click();
    await flush();
    expect(toggleFavorite).toHaveBeenCalled();
    expect(fav.getAttribute('aria-pressed')).toBe('true');
    expect(fav.classList.contains('is-on')).toBe(true);
    const seen = document.querySelector('.lfx-rt__btn--seen');
    seen.click();
    await flush();
    expect(togglePlayed).toHaveBeenCalled();
    expect(seen.classList.contains('is-on')).toBe(true);
  });

  it('Trailer-Knopf nur mit Quelle; Overlay schließt per Escape', async () => {
    title.mount(route('#/home?lfx=title&id=m1'));
    await flush();
    expect(document.querySelector('.lfx-rt__btn--trailer').hidden).toBe(true);
    title.unmount();
    vi.mocked(directRemoteTrailerUrl).mockReturnValue('http://x/t.mp4');
    title.mount(route('#/home?lfx=title&id=m1'));
    await flush();
    const tb = document.querySelector('.lfx-rt__btn--trailer');
    expect(tb.hidden).toBe(false);
    tb.click();
    const ov = document.getElementById('lfx-retro-trailer');
    expect(ov).toBeTruthy();
    expect(ov.querySelector('video').getAttribute('src')).toBe('http://x/t.mp4');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(document.getElementById('lfx-retro-trailer')).toBeNull();
    vi.mocked(directRemoteTrailerUrl).mockReturnValue(null);
  });

  it('Regal mit ähnlichen Titeln als Kassetten-Rücken', async () => {
    data.loadSimilar.mockResolvedValue([{ Id: 'x1', Name: 'Ähnlich', Type: 'Movie' }, { Id: 'm1', Name: 'Selbst', Type: 'Movie' }]);
    title.mount(route('#/home?lfx=title&id=m1'));
    await flush();
    const cards = document.querySelectorAll('.lfx-rt__shelf .lfx-retro-card--spine[data-lfx-id]');
    expect([...cards].map((c) => c.dataset.lfxId)).toEqual(['x1']);
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
    expect(document.querySelectorAll('#lfx-retro-title').length).toBe(1);
    expect(document.querySelector('.lfx-rt__chrome').textContent).toBe('Zweiter');
  });

  it('Fehler: Hinweis statt Absturz', async () => {
    data.loadItem.mockRejectedValue(new Error('nope'));
    title.mount(route('#/home?lfx=title&id=zz'));
    await flush();
    expect(document.querySelector('.lfx-rt__error')).toBeTruthy();
  });
});

describe('Serie und Episode', () => {
  beforeEach(() => {
    data.loadItem.mockImplementation(async (id) => (id === 's1' ? series : null));
    data.getStoredItem.mockImplementation((id) => (id === 'e2' ? ep('e2', 2) : null));
    data.loadSeasons.mockResolvedValue([{ Id: 'se0', Name: 'Specials', IndexNumber: 0 }, { Id: 'se1', Name: 'Staffel 1', IndexNumber: 1 }, { Id: 'se2', Name: 'Staffel 2', IndexNumber: 2 }]);
    data.loadEpisodes.mockResolvedValue([ep('e1', 1), ep('e2', 2, { UserData: { PlaybackPositionTicks: 900_000_000 }, RunTimeTicks: 3_000_000_000 })]);
    data.loadNextUp.mockResolvedValue(ep('e2', 2, { UserData: { PlaybackPositionTicks: 500 } }));
  });

  it('Staffeln als TAPE-Tabs, erste reguläre Staffel gewählt, Folgen als Etiketten, nächste Folge markiert', async () => {
    title.mount(route('#/home?lfx=title&id=s1'));
    await flush();
    expect([...document.querySelectorAll('.lfx-rt__tab')].map((t) => t.textContent)).toEqual(['EXTRAS', 'TAPE 1', 'TAPE 2']);
    expect(document.querySelector('.lfx-rt__tab.is-active').textContent).toBe('TAPE 1');
    expect(data.loadEpisodes).toHaveBeenCalledWith('s1', 'se1');
    expect(document.querySelectorAll('.lfx-rt__ep').length).toBe(2);
    expect(document.querySelector('.lfx-rt__ep.is-next').dataset.id).toBe('e2');
    expect(document.querySelector('.lfx-rt__ep[data-id="e1"] .lfx-rt__ep-meta').textContent).toContain('S01E01');
    expect(document.querySelector('.lfx-rt__btn--play').textContent).toBe('Fortsetzen S01E02');
    expect(document.querySelector('.lfx-rt__ep[data-id="e2"]').style.getPropertyValue('--rt-fill')).toBe('0.3');
  });

  it('Staffelwechsel lädt Folgen der anderen Staffel', async () => {
    title.mount(route('#/home?lfx=title&id=s1'));
    await flush();
    document.querySelector('.lfx-rt__tab[data-id="se2"]').click();
    await flush();
    expect(data.loadEpisodes).toHaveBeenLastCalledWith('s1', 'se2');
    expect(document.querySelector('.lfx-rt__tab.is-active').dataset.id).toBe('se2');
  });

  it('Episoden-Id löst zur Serie auf und markiert die Folge', async () => {
    title.mount(route('#/home?lfx=title&id=e2'));
    await flush();
    expect(data.loadItem).toHaveBeenCalledWith('s1');
    expect(document.querySelector('.lfx-rt__ep.is-selected').dataset.id).toBe('e2');
  });

  it('Klick auf Folge spielt sie ab', async () => {
    title.mount(route('#/home?lfx=title&id=s1'));
    await flush();
    document.querySelector('.lfx-rt__ep[data-id="e1"]').click();
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ Id: 'e1' }), { resume: false });
  });
});

describe('Sammlung', () => {
  it('zeigt den Inhalt als Cover-Kassetten', async () => {
    data.loadItem.mockResolvedValue({ Id: 'b1', Name: 'Box', Type: 'BoxSet', UserData: {} });
    data.loadCollection.mockResolvedValue([{ Id: 'x1', Name: 'Eins', Type: 'Movie' }, { Id: 'x2', Name: 'Zwei', Type: 'Movie' }]);
    title.mount(route('#/home?lfx=title&id=b1'));
    await flush();
    expect(document.querySelectorAll('.lfx-rt__shelf .lfx-retro-card--cover[data-lfx-id]').length).toBe(2);
  });
});
