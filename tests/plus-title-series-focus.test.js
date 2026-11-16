// @vitest-environment jsdom
// LENZ+ Titelseite: Namensaktualisierung, Fehlertexte, Serie (Staffeln, Fokus, Listenaufbau), Trailer-Dialog.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const themeState = vi.hoisted(() => ({ id: 'plus' }));
const listeners = vi.hoisted(() => ({ fns: [] }));
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
    getItem: vi.fn(),
    getSimilar: vi.fn(),
    getSeasons: vi.fn(),
    getEpisodes: vi.fn(),
    getNextUp: vi.fn(),
  };
});
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isMobile: () => false }));
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn().mockResolvedValue(true) }));
vi.mock('../src/js/core/download.js', () => ({ canDownload: vi.fn().mockResolvedValue(false), startDownload: vi.fn(), isChooserOpen: () => false }));
vi.mock('../src/js/core/itemmenu.js', () => ({
  openItemMenu: vi.fn(),
  onItemsChanged: vi.fn((fn) => { listeners.fns.push(fn); return () => {}; }),
}));
vi.mock('../src/js/shared/titleactions.js', () => ({
  togglePlayed: vi.fn(), toggleFavorite: vi.fn(), startDownloadFor: vi.fn(), openTitleMenu: vi.fn(),
}));
vi.mock('../src/js/shared/trailer.js', () => ({
  loadLocalTrailer: vi.fn().mockResolvedValue(null),
  trailerUrl: (id) => `http://x/trailer/${id}`,
  directRemoteTrailerUrl: vi.fn().mockReturnValue('http://x/t.mp4'),
}));

import title from '../src/js/features/plus/title.js';
import { parseHash } from '../src/js/core/router.js';
import * as api from '../src/js/core/api.js';
import { clearCache } from '../src/js/core/cache.js';
import { togglePlayed, toggleFavorite } from '../src/js/shared/titleactions.js';
import { play } from '../src/js/core/playback.js';

const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const base = { Id: 'm1', Type: 'Movie', Genres: ['Drama'], ProductionYear: 2020, RunTimeTicks: 6_000_000_000, UserData: {} };
const series = { Id: 's1', Name: 'Serie', Type: 'Series', ChildCount: 2, UserData: {} };
const ep = (id, n, extra = {}) => ({ Id: id, Name: `Folge ${n}`, Type: 'Episode', IndexNumber: n, ParentIndexNumber: 1, SeriesId: 's1', SeasonId: 'se1', UserData: {}, ...extra });

beforeEach(() => {
  themeState.id = 'plus';
  listeners.fns.length = 0;
  clearCache();
  vi.clearAllMocks();
  window.scrollTo = vi.fn();
  document.documentElement.className = '';
  document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections">nativ</div></div></div>';
  api.getSimilar.mockResolvedValue({ Items: [] });
  api.getSeasons.mockResolvedValue({ Items: [] });
  api.getEpisodes.mockResolvedValue({ Items: [] });
  api.getNextUp.mockResolvedValue({ Items: [] });
  togglePlayed.mockResolvedValue(true);
  toggleFavorite.mockResolvedValue(true);
});
afterEach(() => { title.unmount(); document.body.innerHTML = ''; });

describe('Titel: Namensaktualisierung', () => {
  it('zeigt nach ItemsUpdated den neuen Namen statt des 5-min-Caches', async () => {
    api.getItem
      .mockResolvedValueOnce({ ...base, Name: 'Alter Name', Overview: 'alt' })
      .mockResolvedValue({ ...base, Name: 'Neuer Name', Overview: 'neu' });
    title.mount(parseHash('#/home?lfx=title&id=m1'));
    await flush();
    expect(document.querySelector('.lfx-plus-title__name').textContent).toBe('Alter Name');
    for (const fn of listeners.fns) fn({ updated: ['m1'] });
    await flush();
    expect(document.querySelector('.lfx-plus-title__name').textContent).toBe('Neuer Name');
  });
});

describe('Titel: Fehlertexte', () => {
  it('nicht gefundener Titel: eigener Text; Netzwerkfehler: Server-Text', async () => {
    api.getItem.mockResolvedValue(null);
    title.mount(parseHash('#/home?lfx=title&id=zz'));
    await flush();
    expect(document.querySelector('.lfx-plus-title__error p').textContent).toBe('Dieser Titel ist nicht mehr verfügbar.');
    title.unmount();
    clearCache();
    api.getItem.mockRejectedValue(new Error('HTTP 500'));
    title.mount(parseHash('#/home?lfx=title&id=yy'));
    await flush();
    expect(document.querySelector('.lfx-plus-title__error p').textContent).toBe('Der Server hat nicht geantwortet.');
  });

  it('HTTP 404 (gelöschter Titel): eigener Text statt Server-Text', async () => {
    api.getItem.mockRejectedValue(new Error('LenzFlix API: HTTP 404 für /Users/u/Items/zz'));
    title.mount(parseHash('#/home?lfx=title&id=zz'));
    await flush();
    expect(document.querySelector('.lfx-plus-title__error p').textContent).toBe('Dieser Titel ist nicht mehr verfügbar.');
  });
});

describe('Serie', () => {
  beforeEach(() => {
    api.getItem.mockImplementation(async (id) => (id === 's1' ? series : null));
    api.getSeasons.mockResolvedValue({ Items: [{ Id: 'se0', Name: 'Specials', IndexNumber: 0 }, { Id: 'se1', Name: 'Staffel 1', IndexNumber: 1 }, { Id: 'se2', Name: 'Staffel 2', IndexNumber: 2 }] });
    api.getEpisodes.mockResolvedValue({ Items: [ep('e1', 1), ep('e2', 2)] });
  });

  it('Abspielen vor geladenen Staffeln wartet auf die Staffeln', async () => {
    let release;
    api.getSeasons.mockImplementation(() => new Promise((r) => { release = () => r({ Items: [{ Id: 'se1', Name: 'Staffel 1', IndexNumber: 1 }] }); }));
    title.mount(parseHash('#/home?lfx=title&id=s1'));
    for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
    document.querySelector('.lfx-plus-pill--primary').click();
    release();
    await flush();
    expect(play).toHaveBeenCalledWith(expect.objectContaining({ Id: 'e1' }), { resume: false });
  });

  it('Gesehen an der Serie lädt Next-Up neu und zeichnet den Abspielknopf', async () => {
    api.getNextUp.mockResolvedValueOnce({ Items: [ep('e2', 2, { UserData: { PlaybackPositionTicks: 500 } })] });
    title.mount(parseHash('#/home?lfx=title&id=s1'));
    await flush();
    expect(document.querySelector('.lfx-plus-pill--primary').textContent).toBe('S1:F2 fortsetzen');
    api.getNextUp.mockResolvedValue({ Items: [ep('e3', 3)] });
    clearCache();
    document.querySelector('.lfx-plus-circle--seen').click();
    await flush();
    expect(document.querySelector('.lfx-plus-pill--primary').textContent).toBe('Abspielen');
  });

  it('Meine Liste/Gesehen werden nie disabled (Fokus bleibt)', async () => {
    title.mount(parseHash('#/home?lfx=title&id=s1'));
    await flush();
    for (const [sel, fn] of [['.lfx-plus-circle--fav', toggleFavorite], ['.lfx-plus-circle--seen', togglePlayed]]) {
      const b = document.querySelector(sel);
      let release;
      fn.mockImplementationOnce(() => new Promise((r) => { release = () => r(true); }));
      b.focus();
      b.click();
      expect(b.disabled).toBe(false);
      expect(document.activeElement).toBe(b);
      release();
      await flush();
    }
  });

  it('Folgen sind listitem-Wrapper um echte Buttons', async () => {
    title.mount(parseHash('#/home?lfx=title&id=s1'));
    await flush();
    const btn = document.querySelector('.lfx-plus-ep');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.getAttribute('role')).toBeNull();
    expect(btn.parentElement.getAttribute('role')).toBe('listitem');
  });

  it('Staffelmenü markiert aktuelle Staffel; nach Wahl bleibt Fokus im neuen Knopf', async () => {
    title.mount(parseHash('#/home?lfx=title&id=s1'));
    await flush();
    document.querySelector('.lfx-plus-season').click();
    const items = [...document.querySelectorAll('.lfx-popover__item')];
    const cur = items.find((i) => i.getAttribute('aria-checked') === 'true');
    expect(cur.textContent).toBe('Staffel 1');
    expect(cur.getAttribute('role')).toBe('menuitemradio');
    expect(document.activeElement).toBe(cur);
    items.find((i) => i.textContent === 'Staffel 2').click();
    await flush();
    const nb = document.querySelector('.lfx-plus-season');
    expect(nb.textContent).toContain('Staffel 2');
    expect(document.activeElement).toBe(nb);
  });
});

describe('Trailer-Dialog', () => {
  it('Trailer-Dialog: Tab wird nicht abgefangen (native Video-Bedienelemente bleiben erreichbar)', async () => {
    api.getItem.mockResolvedValue({ ...base, Name: 'Film' });
    title.mount(parseHash('#/home?lfx=title&id=m1'));
    await flush();
    document.querySelector('.lfx-plus-circle--trailer').click();
    const video = document.querySelector('.lfx-plus-trailer__video');
    video.tabIndex = 0;
    video.focus();
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('Trailer-Dialog: Tab auf dem Schließen-Knopf geht zum Video (Seite wird nicht verlassen), Shift+Tab nicht', async () => {
    api.getItem.mockResolvedValue({ ...base, Name: 'Film' });
    title.mount(parseHash('#/home?lfx=title&id=m1'));
    await flush();
    document.querySelector('.lfx-plus-circle--trailer').click();
    const closeBtn = document.querySelector('.lfx-plus-trailer__close');
    const video = document.querySelector('.lfx-plus-trailer__video');
    video.tabIndex = 0;
    expect(document.activeElement).toBe(closeBtn);
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(back);
    expect(back.defaultPrevented).toBe(false);
    const ev = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(video);
  });

  it('Trailer-Dialog: Fokus außerhalb holt ihn zurück (nach Schließen -> Video, sonst Schließen)', async () => {
    api.getItem.mockResolvedValue({ ...base, Name: 'Film' });
    title.mount(parseHash('#/home?lfx=title&id=m1'));
    await flush();
    document.querySelector('.lfx-plus-circle--trailer').click();
    const closeBtn = document.querySelector('.lfx-plus-trailer__close');
    const video = document.querySelector('.lfx-plus-trailer__video');
    video.tabIndex = 0;
    const out = document.createElement('button');
    document.body.append(out);
    out.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: closeBtn }));
    expect(document.activeElement).toBe(video);
    out.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: video }));
    expect(document.activeElement).toBe(closeBtn);
    out.remove();
  });
});
