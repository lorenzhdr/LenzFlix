// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const items = (prefix, n, extra = {}) =>
  Array.from({ length: n }, (_, i) => ({
    Id: `${prefix}${i}`, Name: `${prefix}${i}`, Type: 'Movie',
    ImageTags: { Logo: 'l', Primary: 'p' }, BackdropImageTags: ['b'], ...extra,
  }));

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, getItems: vi.fn(), getJson: vi.fn(async () => []), getUserId: () => 'u' };
});
vi.mock('../src/js/shared/trailer.js', () => ({
  loadLocalTrailer: vi.fn(async () => ({ Id: 'tr1' })),
  trailerUrl: (id) => `http://x/Videos/${id}/stream.mp4`,
}));
vi.mock('../src/js/features/modal.js', () => ({ openModal: vi.fn() }));
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn() }));
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

import * as api from '../src/js/core/api.js';
import { buildPool, formatRuntime, formatRating, metaParts, genreLine, badgeFor } from '../src/js/features/billboard/format.js';
import { render, TRAILER_MIN_IMAGE_MS, TRAILER_STALL_MS, ROTATE_MS } from '../src/js/features/billboard.js';
import { openModal } from '../src/js/features/modal.js';
import { canDownload, startDownload, isChooserOpen } from '../src/js/core/download.js';
import { openItemMenu, isMenuOpen, onItemsChanged } from '../src/js/core/itemmenu.js';
import { putItems } from '../src/js/core/itemstore.js';
import { clearCache } from '../src/js/core/cache.js';

describe('billboard format', () => {
  it('buildPool: Zufall zuerst, dann abwechselnd, max 4 neue + 8 zufällige, ohne Duplikate', () => {
    const bad = { Id: 'x', ImageTags: {}, BackdropImageTags: ['b'] };
    const latest = [...items('n', 6), bad];
    const random = [items('n', 1)[0], ...items('r', 10)];
    const ids = buildPool(latest, random, { rng: () => 0.999 }).map((i) => i.Id);
    expect(ids).toEqual(['r0', 'n0', 'r1', 'n1', 'r2', 'n2', 'r3', 'n3', 'r4', 'r5', 'r6', 'r7']);
  });
  it('buildPool: neue in gemischter Reihenfolge, nur die 4 neuesten', () => {
    const ids = buildPool(items('n', 6), items('r', 8), { rng: () => 0 }).map((i) => i.Id);
    const news = ids.filter((i) => i.startsWith('n'));
    expect(news.sort()).toEqual(['n0', 'n1', 'n2', 'n3']);
  });
  it('buildPool: Slide 1 bevorzugt Trailer und meidet avoidFirstId', () => {
    const random = items('r', 4);
    random[2].LocalTrailerCount = 1;
    expect(buildPool([], random, { rng: () => 0 })[0].Id).toBe('r2');
    expect(buildPool([], random, { rng: () => 0, avoidFirstId: 'r2' })[0].Id).toBe('r0');
    expect(buildPool([], [random[2]], { avoidFirstId: 'r2' }).map((i) => i.Id)).toEqual(['r2']);
  });
  it('buildPool: nur neue, wenn Zufallsliste fehlt', () => {
    expect(buildPool(items('n', 2), null).length).toBe(2);
  });
  it('Laufzeit, FSK, Staffeln', () => {
    expect(formatRuntime(106 * 600000000)).toBe('1 Std. 46 Min.');
    expect(formatRuntime(45 * 600000000)).toBe('45 Min.');
    expect(formatRuntime(120 * 600000000)).toBe('2 Std.');
    expect(formatRating('FSK-12')).toBe('12');
    expect(formatRating('PG-13')).toBe('PG-13');
    const m = metaParts({ Type: 'Series', Genres: ['Drama'], ProductionYear: 2019, ChildCount: 3, OfficialRating: 'FSK-16' });
    expect(m.map((p) => p.text)).toEqual(['Serie', 'Drama', '2019', '3 Staffeln', '16']);
    expect(metaParts({ Type: 'Movie', RunTimeTicks: 106 * 600000000 }).map((p) => p.text)).toEqual(['Film', '1 Std. 46 Min.']);
  });
  it('badgeFor: 14-Tage-Logik', () => {
    const now = Date.parse('2026-11-08T00:00:00Z');
    expect(badgeFor({ DateCreated: '2026-11-01T00:00:00Z' }, now)).toBe('Neu hinzugefügt');
    expect(badgeFor({ DateCreated: '2026-10-01T00:00:00Z' }, now)).toBeNull();
    expect(badgeFor({}, now)).toBeNull();
  });
});

describe('genreLine', () => {
  it('bis zu 3 Genres mit Bullet', () => {
    expect(genreLine({ Genres: ['Drama', 'Thriller', 'Krimi', 'Action'] })).toBe('Drama • Thriller • Krimi');
    expect(genreLine({ Genres: ['Drama'] })).toBe('Drama');
    expect(genreLine({})).toBe('');
  });
});

describe('billboard render', () => {
  let slot;
  beforeEach(() => {
    vi.useFakeTimers();
    // Identische Shuffle-Reihenfolge; Pool: r0 n0 r1 n1 r2 n2 (Zufallstitel zuerst).
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    sessionStorage.clear();
    document.body.innerHTML = '<section id="s"></section>';
    document.documentElement.className = '';
    slot = document.getElementById('s');
    clearCache(); // Startseiten-Cache (10 min) nicht zwischen Tests teilen
    api.getItems.mockReset();
    api.getItems.mockImplementation(async (p) => ({ Items: p.SortBy === 'Random' ? items('r', 3) : items('n', 3) }));
    window.ApiClient = { serverAddress: () => 'http://x', getCurrentUserId: () => 'u', accessToken: () => 't' };
  });
  afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

  const title = () => slot.querySelector('.lfx-bb__logo')?.getAttribute('alt');
  const flush = async () => { await vi.advanceTimersByTimeAsync(0); };

  it('Pool-Cache: Rückkehr innerhalb von 10 min zeigt denselben ersten Titel ohne Abruf, ohne async-Dekodierung', async () => {
    const first = render(slot);
    await flush();
    const t = title();
    first();
    const n = api.getItems.mock.calls.length;
    const second = render(slot);
    // synchron aufgebaut (kein Skelett, kein Warten)
    expect(slot.querySelector('.lfx-bb--skel')).toBeNull();
    expect(title()).toBe(t);
    expect(slot.querySelector('.lfx-bb__img').hasAttribute('decoding')).toBe(false);
    await flush();
    expect(api.getItems.mock.calls.length).toBe(n);
    second();
    clearCache('home:');
    const third = render(slot);
    await flush();
    expect(api.getItems.mock.calls.length).toBeGreaterThan(n);
    expect(title()).not.toBe(t); // frischer Abruf: Rotation (LAST_FIRST_KEY) greift wieder
    third();
  });

  it('rendert und rotiert nach 10 s, pausiert bei Hover und Modal', async () => {
    const cleanup = render(slot);
    await flush();
    expect(slot.hidden).toBe(false);
    expect(title()).toBe('r0');
    const card = slot.querySelector('.lfx-bb');
    card.dispatchEvent(new Event('mouseenter'));
    await vi.advanceTimersByTimeAsync(25000);
    expect(title()).toBe('r0');
    card.dispatchEvent(new Event('mouseleave'));
    document.documentElement.classList.add('lfx-modal-open');
    await vi.advanceTimersByTimeAsync(10500);
    expect(title()).toBe('r0');
    document.documentElement.classList.remove('lfx-modal-open');
    await vi.advanceTimersByTimeAsync(10500);
    expect(title()).toBe('n0');
    cleanup();
    expect(slot.children.length).toBe(0);
  });

  it('pausiert bei document.hidden', async () => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    render(slot);
    await flush();
    await vi.advanceTimersByTimeAsync(30000);
    expect(title()).toBe('r0');
    delete document.hidden;
  });

  it('leerer Pool -> Slot hidden', async () => {
    api.getItems.mockResolvedValue({ Items: [] });
    render(slot);
    await flush();
    expect(slot.hidden).toBe(true);
  });

  it('rendert Genre-Zeile und beide Buttons; "Meine Liste" toggelt optimistisch mit Rollback', async () => {
    api.getItems.mockImplementation(async () => ({ Items: items('n', 2, { Genres: ['A', 'B', 'C', 'D'], UserData: { IsFavorite: false } }) }));
    const fav = vi.spyOn(api, 'setFavorite');
    render(slot);
    await flush();
    expect(slot.querySelector('.lfx-bb__genres').textContent).toBe('A • B • C');
    expect(slot.querySelector('.lfx-bb__btn--info')).not.toBeNull();
    const btn = () => slot.querySelector('.lfx-bb__btn--list');
    expect(btn().classList.contains('is-on')).toBe(false);
    expect(btn().getAttribute('aria-pressed')).toBe('false');
    const plusIcon = btn().querySelector('svg').innerHTML;
    fav.mockResolvedValueOnce({});
    btn().click();
    expect(btn().classList.contains('is-on')).toBe(true);
    expect(btn().getAttribute('aria-pressed')).toBe('true');
    expect(btn().querySelector('svg').innerHTML).not.toBe(plusIcon);
    expect(fav).toHaveBeenCalledWith('n0', true);
    await flush();
    fav.mockRejectedValueOnce(new Error('x'));
    btn().click();
    expect(btn().classList.contains('is-on')).toBe(false);
    expect(fav).toHaveBeenLastCalledWith('n0', false);
    await flush();
    expect(btn().classList.contains('is-on')).toBe(true); // Rollback
    fav.mockRestore();
  });

  it('Mobil: Tipp auf das Poster öffnet das Modal', async () => {
    document.documentElement.classList.add('layout-mobile');
    render(slot);
    await flush();
    slot.querySelector('.lfx-bb__media').click();
    expect(openModal).toHaveBeenCalledTimes(1);
  });

  describe('Trailer: erst Bild, dann unsichtbar vorladen, dann einblenden', () => {
    let play;
    const video = () => slot.querySelector('.lfx-bb__video');
    const img = () => slot.querySelector('.lfx-bb__pic .lfx-bb__img');
    beforeEach(() => {
      play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
      vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
      vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
      api.getItems.mockImplementation(async (p) => ({
        Items: (p.SortBy === 'Random' ? items('r', 3) : items('n', 3)).map((it) => ({ ...it, LocalTrailerCount: 1 })),
      }));
    });

    it('Fields/Limit schlank, erstes Bild mit fetchpriority=high und kleinerer Auflösung', async () => {
      render(slot);
      await flush();
      const p = api.getItems.mock.calls[0][0];
      expect(p.Limit).toBe(12);
      expect(p.Fields).not.toContain('Overview');
      expect(img().getAttribute('fetchpriority')).toBe('high');
      expect(img().getAttribute('src')).toContain('maxWidth=1600');
      expect(img().getAttribute('src')).toContain('quality=80');
      expect(slot.querySelector('.lfx-bb__pic source').getAttribute('srcset')).toContain('maxWidth=720');
    });

    it('Skelett in Billboard-Größe, solange der Pool lädt', async () => {
      const releases = [];
      api.getItems.mockImplementation(() => new Promise((r) => { releases.push(r); }));
      render(slot);
      expect(slot.hidden).toBe(false);
      expect(slot.querySelector('.lfx-bb--skel')).not.toBeNull();
      await flush(); // cached() ruft den Loader einen Microtask später auf
      releases.forEach((r) => r({ Items: [] }));
      await flush();
      expect(slot.hidden).toBe(true);
      expect(slot.children.length).toBe(0);
    });

    it('kein Vorladen ohne geladenes Bild und ohne lfx:rows-ready; Einblenden frühestens 3 s nach dem Bild', async () => {
      const cleanup = render(slot);
      await flush();
      await vi.advanceTimersByTimeAsync(3000);
      expect(video()).toBeNull();
      img().dispatchEvent(new Event('load')); // Bild geladen (t = 3 s), Zeilen noch nicht bereit
      await vi.advanceTimersByTimeAsync(1000);
      expect(video()).toBeNull();
      document.dispatchEvent(new Event('lfx:rows-ready'));
      await vi.advanceTimersByTimeAsync(0);
      expect(video()).not.toBeNull();
      expect(video().classList.contains('is-in')).toBe(false);
      expect(video().muted).toBe(true);
      video().dispatchEvent(new Event('canplaythrough')); // bereit bei 4 s, Bild stand erst 1 s
      await vi.advanceTimersByTimeAsync(1900);
      expect(play).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
      expect(play).toHaveBeenCalledTimes(1);
      video().dispatchEvent(new Event('playing'));
      expect(video().classList.contains('is-in')).toBe(true);
      expect(slot.querySelector('.lfx-bb').classList.contains('is-trailer')).toBe(true);
      cleanup();
      expect(slot.children.length).toBe(0);
    });

    it('ohne Abspielbereitschaft bleibt das Bild stehen (Rotation wartet), danach sofort einblenden', async () => {
      render(slot);
      await flush();
      img().dispatchEvent(new Event('load'));
      document.dispatchEvent(new Event('lfx:rows-ready'));
      await vi.advanceTimersByTimeAsync(0);
      for (let i = 0; i < 15; i++) { // lädt langsam, aber mit Fortschritt (kein Rückfall)
        await vi.advanceTimersByTimeAsync(1000);
        video().dispatchEvent(new Event('progress'));
      }
      expect(play).not.toHaveBeenCalled();
      expect(title()).toBe('r0'); // keine Rotation, solange der Trailer lädt
      video().dispatchEvent(new Event('canplaythrough'));
      expect(play).toHaveBeenCalledTimes(1); // Bild stand > 3 s -> sofort
    });

    it('Konstante: Titelbild steht mindestens 3 s', () => {
      expect(TRAILER_MIN_IMAGE_MS).toBe(3000);
    });

    it('puffert nie (iOS): nach Mindestzeit + Rückfallzeit play(), eingeblendet erst bei playing', async () => {
      render(slot);
      await flush();
      img().dispatchEvent(new Event('load'));
      document.dispatchEvent(new Event('lfx:rows-ready'));
      await vi.advanceTimersByTimeAsync(0);
      const v = video();
      expect(v).not.toBeNull();
      await vi.advanceTimersByTimeAsync(TRAILER_MIN_IMAGE_MS - 100); // vor der Mindestzeit nie
      expect(play).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(TRAILER_STALL_MS + 600);
      expect(play).toHaveBeenCalledTimes(1);
      expect(v.classList.contains('is-in')).toBe(false);
      v.dispatchEvent(new Event('playing'));
      expect(v.classList.contains('is-in')).toBe(true);
    });

    it('play() abgelehnt: Trailer aufgegeben, Rotation frei', async () => {
      play.mockRejectedValue(new Error('NotAllowedError'));
      render(slot);
      await flush();
      img().dispatchEvent(new Event('load'));
      document.dispatchEvent(new Event('lfx:rows-ready'));
      await vi.advanceTimersByTimeAsync(0);
      await vi.advanceTimersByTimeAsync(TRAILER_MIN_IMAGE_MS + TRAILER_STALL_MS + 600);
      expect(play).toHaveBeenCalledTimes(1);
      expect(video()).toBeNull();
      await vi.advanceTimersByTimeAsync(ROTATE_MS + 500);
      expect(title()).toBe('n0');
    });

    it('puffert sofort: wie bisher, Einblenden 3 s nach dem Bild', async () => {
      render(slot);
      await flush();
      img().dispatchEvent(new Event('load'));
      document.dispatchEvent(new Event('lfx:rows-ready'));
      await vi.advanceTimersByTimeAsync(0);
      video().dispatchEvent(new Event('canplaythrough'));
      await vi.advanceTimersByTimeAsync(2900);
      expect(play).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(200);
      expect(play).toHaveBeenCalledTimes(1);
    });

    it('Folienwechsel bricht das Vorladen ab (src leer, load())', async () => {
      render(slot);
      await flush();
      img().dispatchEvent(new Event('load'));
      document.dispatchEvent(new Event('lfx:rows-ready'));
      await vi.advanceTimersByTimeAsync(0);
      const v = video();
      expect(v).not.toBeNull();
      slot.querySelectorAll('.lfx-bb__dotbtn')[1].click();
      expect(v.isConnected).toBe(false);
      expect(v.hasAttribute('src')).toBe(false);
      expect(HTMLMediaElement.prototype.load).toHaveBeenCalled();
    });

    it('Rückfall: nach 8 s startet das Vorladen auch ohne lfx:rows-ready', async () => {
      render(slot);
      await flush();
      img().dispatchEvent(new Event('load'));
      await vi.advanceTimersByTimeAsync(7900);
      expect(video()).toBeNull();
      await vi.advanceTimersByTimeAsync(200);
      expect(video()).not.toBeNull();
    });
  });

  describe('Download- und Mehr-Button', () => {
    const dl = () => slot.querySelector('.lfx-bb__btn--dl');
    const menu = () => slot.querySelector('.lfx-bb__btn--menu');
    beforeEach(() => {
      canDownload.mockReset();
      canDownload.mockResolvedValue(true);
      startDownload.mockReset();
      openItemMenu.mockReset();
      openModal.mockClear();
      isMenuOpen.mockReturnValue(false);
      isChooserOpen.mockReturnValue(false);
      onItemsChanged.mockClear();
      document.documentElement.classList.remove('layout-mobile');
    });

    it('Buttons vorhanden, Download erst nach canDownload sichtbar', async () => {
      let resolve;
      canDownload.mockReturnValue(new Promise((r) => { resolve = r; }));
      render(slot);
      await flush();
      expect(dl()).not.toBeNull();
      expect(dl().hidden).toBe(true);
      expect(dl().getAttribute('aria-label')).toBe('Herunterladen');
      expect(menu().getAttribute('aria-label')).toBe('Mehr');
      expect(menu().getAttribute('aria-haspopup')).toBe('menu');
      resolve(true);
      await flush();
      expect(dl().hidden).toBe(false);
    });

    it('canDownload false: Download bleibt versteckt; Serie -> "Episoden herunterladen"', async () => {
      canDownload.mockResolvedValue(false);
      api.getItems.mockImplementation(async () => ({ Items: items('s', 2, { Type: 'Series' }) }));
      render(slot);
      await flush();
      expect(dl().hidden).toBe(true);
      expect(dl().getAttribute('aria-label')).toBe('Episoden herunterladen');
    });

    it('Klick ruft startDownload/openItemMenu mit Item + Button, öffnet kein Modal (auch mobil)', async () => {
      document.documentElement.classList.add('layout-mobile');
      render(slot);
      await flush();
      const d = dl();
      d.click();
      expect(startDownload).toHaveBeenCalledWith(expect.objectContaining({ Id: 'r0' }), d);
      const m = menu();
      m.click();
      expect(openItemMenu).toHaveBeenCalledWith(expect.objectContaining({ Id: 'r0' }), m);
      expect(openModal).not.toHaveBeenCalled();
    });

    it('rotiert nicht, solange Menü oder Download-Sheet offen ist', async () => {
      render(slot);
      await flush();
      isMenuOpen.mockReturnValue(true);
      await vi.advanceTimersByTimeAsync(25000);
      expect(title()).toBe('r0');
      isMenuOpen.mockReturnValue(false);
      isChooserOpen.mockReturnValue(true);
      await vi.advanceTimersByTimeAsync(10500);
      expect(title()).toBe('r0');
      isChooserOpen.mockReturnValue(false);
      await vi.advanceTimersByTimeAsync(10500);
      expect(title()).toBe('n0');
    });

    it('onItemsChanged: entferntes aktuelles Item -> nächstes; Abmeldung im Cleanup', async () => {
      const unsub = vi.fn();
      onItemsChanged.mockReturnValue(unsub);
      const cleanup = render(slot);
      await flush();
      const cb = onItemsChanged.mock.calls[0][0];
      cb({ removed: ['r0'], updated: [] });
      await vi.advanceTimersByTimeAsync(500);
      expect(title()).not.toBe('r0');
      expect(slot.querySelectorAll('.lfx-bb__dotbtn').length).toBe(5);
      cb({ removed: ['n0', 'n1', 'r1', 'r2', 'n2'], updated: [] });
      expect(slot.hidden).toBe(true);
      cleanup();
      expect(unsub).toHaveBeenCalled();
    });

    it('onItemsChanged: updated des sichtbaren Titels zeichnet Inhalt neu', async () => {
      render(slot);
      await flush();
      const cb = onItemsChanged.mock.calls[0][0];
      putItems([{ Id: 'r0', Name: 'Neu', Type: 'Movie', ImageTags: { Logo: 'l', Primary: 'p' }, BackdropImageTags: ['b'] }]);
      cb({ removed: [], updated: ['r0'] });
      expect(title()).toBe('Neu');
    });
  });
});
