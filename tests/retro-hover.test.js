// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const themeState = vi.hoisted(() => ({ id: 'retro', saver: false }));
const preview = vi.hoisted(() => ({ calls: [], cancel: vi.fn() }));
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
    getItem: vi.fn(),
    imageUrl: () => 'http://x/img.jpg',
  };
});
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isMobile: () => false }));
vi.mock('../src/js/core/datasaver.js', () => ({ isDataSaver: (part) => themeState.saver && (!part || part === 'trailer') }));
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn().mockResolvedValue(true) }));
vi.mock('../src/js/shared/titleactions.js', () => ({ toggleFavorite: vi.fn().mockResolvedValue(true) }));
vi.mock('../src/js/shared/trailer.js', () => ({
  createMutedPreview: vi.fn((container, item, opts) => { preview.calls.push(opts); return { cancel: preview.cancel }; }),
}));
vi.mock('../src/js/features/retro/prefs.js', () => ({ emitFx: vi.fn() }));

import hover, { placePopup, INTENT_MS, PREVIEW_MS } from '../src/js/features/retro/hover.js';
import * as api from '../src/js/core/api.js';
import { play } from '../src/js/core/playback.js';
import { toggleFavorite } from '../src/js/shared/titleactions.js';
import { createMutedPreview } from '../src/js/shared/trailer.js';
import { putItems, clearItemStore } from '../src/js/core/itemstore.js';
import { clearCache } from '../src/js/core/cache.js';

const route = { path: '/home', params: new URLSearchParams() };
const item = { Id: 'm1', Type: 'Movie', Name: 'Neon Läufer', ProductionYear: 1984, Genres: ['Sci-Fi', 'Thriller', 'Drama'], RunTimeTicks: 6_000_000_000, ImageTags: { Primary: 'p' }, BackdropImageTags: ['b'] };
let card;

const over = (el, related = null) => el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, relatedTarget: related }));
const tick = (ms) => vi.advanceTimersByTimeAsync(ms);
const popup = () => document.getElementById('lfx-retro-hover');
const mm = (match) => { window.matchMedia = (q) => ({ matches: match && !/reduce/.test(q), addEventListener() {}, removeEventListener() {} }); };

beforeEach(() => {
  vi.useFakeTimers();
  themeState.id = 'retro';
  themeState.saver = false;
  mm(true);
  clearCache();
  clearItemStore();
  window.location.hash = '';
  preview.calls.length = 0;
  preview.cancel.mockClear();
  vi.mocked(play).mockClear();
  vi.mocked(toggleFavorite).mockClear();
  vi.mocked(createMutedPreview).mockClear();
  api.getItem.mockReset();
  api.getItem.mockResolvedValue({ ...item, RemoteTrailers: [{ Url: 'http://x/t.mp4' }], UserData: { IsFavorite: false } });
  putItems([item]);
  document.body.innerHTML = '<div id="lfx-retro-home"><div class="lfx-card lfx-retro-card" data-lfx-id="m1" data-lfx-type="Movie"><a class="lfx-card__link" href="#/x"><span id="inner">x</span></a></div></div><div id="other">o</div>';
  card = document.querySelector('.lfx-retro-card');
  hover.mount(route);
});
afterEach(() => { hover.unmount(); document.body.innerHTML = ''; vi.useRealTimers(); });

describe('match', () => {
  it('nur retro, nur mit feinem Zeiger', () => {
    expect(hover.match(route)).toBe(true);
    themeState.id = 'flix';
    expect(hover.match(route)).toBe(false);
    themeState.id = 'retro';
    mm(false);
    expect(hover.match(route)).toBe(false);
  });
  it('nicht im Player', () => {
    expect(hover.match({ path: '/video', params: new URLSearchParams() })).toBe(false);
  });
});

describe('placePopup', () => {
  it('rechts neben der Karte, sonst links, im Viewport', () => {
    const r = { left: 100, right: 200, top: 300, height: 100, width: 100 };
    expect(placePopup(r, 1200, 800, 320, 250).left).toBe(210);
    expect(placePopup({ ...r, left: 1000, right: 1100 }, 1200, 800, 320, 250).left).toBe(670);
    expect(placePopup({ ...r, top: 0 }, 1200, 800, 320, 250).top).toBe(12);
    expect(placePopup({ ...r, top: 760 }, 1200, 800, 320, 250).top).toBe(538);
  });
});

describe('Öffnen', () => {
  it('Karte ohne Item-Daten im Speicher: lädt nach und öffnet (erster Hover nach dem Laden, live gefunden)', async () => {
    clearItemStore();
    over(card.querySelector('#inner'));
    await tick(INTENT_MS + 10);
    expect(api.getItem).toHaveBeenCalledTimes(1);
    expect(popup()).not.toBeNull();
  });

  it('Karte ohne Item-Daten: Maus vorher weg → kein Öffnen nach dem Nachladen', async () => {
    clearItemStore();
    let resolve;
    api.getItem.mockReturnValue(new Promise((r) => { resolve = r; }));
    over(card.querySelector('#inner'));
    await tick(INTENT_MS + 10);
    over(document.getElementById('other'));
    resolve({ ...item });
    await tick(10);
    expect(popup()).toBeNull();
  });

  it('kurzer Hover öffnet nicht', async () => {
    over(card.querySelector('#inner'));
    await tick(INTENT_MS - 100);
    over(document.getElementById('other'));
    await tick(1000);
    expect(popup()).toBeNull();
  });

  it('Verweilen öffnet, kippt die Karte und zeigt Meta (max. 2 Genres)', async () => {
    over(card.querySelector('#inner'));
    await tick(INTENT_MS + 10);
    expect(popup()).not.toBeNull();
    expect(card.classList.contains('is-preview')).toBe(true);
    const meta = popup().querySelector('.lfx-retro-hover__meta').textContent;
    expect(meta).toContain('1984');
    expect(meta).toContain('Sci-Fi / Thriller');
    expect(meta).not.toContain('Drama');
    expect(popup().querySelector('.lfx-retro-hover__title').textContent).toBe('Neon Läufer');
  });

  it('Trailer nach Verzögerung', async () => {
    over(card);
    await tick(INTENT_MS + 10);
    expect(createMutedPreview).toHaveBeenCalledTimes(1);
    expect(preview.calls[0].delay).toBeGreaterThan(0);
    expect(preview.calls[0].delay).toBeLessThanOrEqual(PREVIEW_MS);
  });

  it('kein Trailer bei Datensparmodus trailer', async () => {
    themeState.saver = true;
    over(card);
    await tick(INTENT_MS + 10);
    expect(popup()).not.toBeNull();
    expect(createMutedPreview).not.toHaveBeenCalled();
  });

  it('öffnet nicht bei offenem Terminal oder Dialog', async () => {
    document.body.insertAdjacentHTML('beforeend', '<div id="lfx-retro-terminal"></div>');
    over(card);
    await tick(INTENT_MS + 10);
    expect(popup()).toBeNull();
    document.getElementById('lfx-retro-terminal').remove();
    document.documentElement.classList.add('lfx-modal-open');
    over(card);
    await tick(INTENT_MS + 10);
    expect(popup()).toBeNull();
    document.documentElement.classList.remove('lfx-modal-open');
  });
});

describe('Aktionen', () => {
  const openIt = async () => { over(card); await tick(INTENT_MS + 10); };

  it('Abspielen ruft playback und schließt', async () => {
    await openIt();
    popup().querySelector('.lfx-retro-hover__play').click();
    await tick(10);
    expect(play).toHaveBeenCalledTimes(1);
    expect(play.mock.calls[0][0].Id).toBe('m1');
    expect(popup()).toBeNull();
  });

  it('Merken schaltet Favorit und Beschriftung', async () => {
    await openIt();
    const fav = popup().querySelector('.lfx-retro-hover__fav');
    expect(fav.textContent).toBe('+ Merken');
    fav.click();
    await tick(10);
    expect(toggleFavorite).toHaveBeenCalledTimes(1);
    expect(fav.textContent).toBe('✓ Gemerkt');
    expect(popup()).not.toBeNull();
  });

  it('Klick aufs Etikett öffnet die Titelseite', async () => {
    await openIt();
    popup().querySelector('.lfx-retro-hover__title').click();
    expect(window.location.hash).toBe('#/home?lfx=title&id=m1');
    expect(popup()).toBeNull();
  });
});

describe('Schließen', () => {
  const openIt = async () => { over(card); await tick(INTENT_MS + 10); };

  it('Esc', async () => {
    await openIt();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(popup()).toBeNull();
    expect(card.classList.contains('is-preview')).toBe(false);
  });

  it('Scroll', async () => {
    await openIt();
    window.dispatchEvent(new Event('scroll'));
    expect(popup()).toBeNull();
  });

  it('Routenwechsel', async () => {
    await openIt();
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    expect(popup()).toBeNull();
  });

  it('update() mit gleicher Route (viewshow) bricht Absicht und Vorschau nicht ab; neue Route schließt', async () => {
    over(card);
    await tick(INTENT_MS - 100);
    hover.update(route); // gleiche Route: Jellyfin feuert viewshow nach dem Laden mehrfach
    await tick(200);
    expect(popup()).not.toBeNull();
    hover.update({ path: '/home', params: new URLSearchParams('lfx=new'), hash: '/home?lfx=new' });
    expect(popup()).toBeNull();
  });

  it('Mausverlassen mit Kulanz; Wechsel ins Etikett hält offen', async () => {
    await openIt();
    over(document.getElementById('other'));
    over(popup().querySelector('.lfx-retro-hover__title'));
    await tick(500);
    expect(popup()).not.toBeNull();
    over(document.getElementById('other'));
    await tick(400);
    expect(popup()).toBeNull();
  });

  it('Fensterverlust und Trailer-Abbruch', async () => {
    await openIt();
    window.dispatchEvent(new Event('blur'));
    expect(popup()).toBeNull();
    expect(preview.cancel).toHaveBeenCalled();
  });

  it('unmount räumt Timer, DOM und Listener ab', async () => {
    over(card);
    hover.unmount();
    await tick(2000);
    expect(popup()).toBeNull();
    over(card);
    await tick(2000);
    expect(popup()).toBeNull();
    expect(card.classList.contains('is-preview')).toBe(false);
  });
});
