// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const themeState = vi.hoisted(() => ({ chosen: 'flix', listeners: new Set(), setImpl: null }));

const apiMock = vi.hoisted(() => ({ ready: true, getItems: null }));
const chartsMock = vi.hoisted(() => ({ getCharts: null }));

vi.mock('../src/js/core/api.js', () => ({
  isReady: () => apiMock.ready,
  getUserId: () => 'u1',
  getItems: (p) => apiMock.getItems(p),
  imageUrlFor: (id, o) => `http://srv/Items/${id}/Images/Primary?maxWidth=${o.maxWidth}&quality=${o.quality}&tag=${o.tag}`,
}));
vi.mock('../src/js/core/charts.js', () => ({ getCharts: () => chartsMock.getCharts() }));

vi.mock('../src/js/core/theme.js', () => ({
  THEMES: ['flix', 'plus', 'prime', 'retro', 'store', 'live'],
  THEME_META: {
    flix: { id: 'flix', name: 'LENZFLIX', tagline: 'Klassisch', palette: ['#000', '#e50914', '#fff', '#333'] },
    plus: { id: 'plus', name: 'LENZ+', tagline: 'Magisch', palette: ['#0a1230', '#4f7bff', '#fff', '#000'] },
    prime: { id: 'prime', name: 'LENZPRIME', tagline: 'Kinoabend', palette: ['#0f171e', '#1a98ff', '#fff', '#000'] },
    retro: { id: 'retro', name: 'LENZ//84', tagline: 'Videothek 1984', palette: ['#000', '#f0f', '#0ff', '#fff'] },
    store: { id: 'store', name: 'VIDEOTHEK LENZ', tagline: 'Begehbare 3D-Videothek', palette: ['#0d1330', '#ffd23f', '#ff3d7f', '#2446a8'] },
    live: { id: 'live', name: 'LENZ LIVE', tagline: 'Lineares Fernsehen mit 18 Sendern', palette: ['#0b0d12', '#e03a2f', '#f4f1e8', '#3a7bd5'] },
  },
  getChosenTheme: () => themeState.chosen,
  setTheme: vi.fn((id) => themeState.setImpl(id)),
  onThemeChange: (fn) => {
    themeState.listeners.add(fn);
    return () => themeState.listeners.delete(fn);
  },
}));

import { openThemePicker, closeThemePicker, isThemePickerOpen, destroyThemePicker } from '../src/js/core/themepicker.js';
import { setTheme } from '../src/js/core/theme.js';
import { clearCache } from '../src/js/core/cache.js';

const key = (k, opts = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...opts }));
const card = (id) => document.querySelector(`.lfx-tp__card[data-theme="${id}"]`);

function mockMedia(matches) {
  window.matchMedia = vi.fn(() => ({ matches, addEventListener() {}, removeEventListener() {} }));
}

describe('themepicker', () => {
  beforeEach(() => {
    document.body.innerHTML = '<button id="opener">Mehr</button>';
    themeState.chosen = 'flix';
    themeState.listeners.clear();
    themeState.setImpl = (id) => {
      themeState.chosen = id;
      return Promise.resolve();
    };
    setTheme.mockClear();
    mockMedia(false);
    clearCache();
    apiMock.ready = false;
    apiMock.getItems = vi.fn(() => Promise.resolve({ Items: [] }));
    chartsMock.getCharts = vi.fn(() => Promise.resolve(null));
  });
  afterEach(() => {
    closeThemePicker();
    delete window.matchMedia;
    document.documentElement.className = '';
    vi.useRealTimers();
  });

  it('öffnet als Dialog, fokussiert die aktive Karte, schließt mit Fokus-Rückgabe', () => {
    const opener = document.getElementById('opener');
    openThemePicker({ returnFocus: opener });
    expect(isThemePickerOpen()).toBe(true);
    const mount = document.getElementById('lfx-themepicker');
    expect(mount.parentElement).toBe(document.body);
    expect(document.documentElement.classList.contains('lfx-themepicker-open')).toBe(true);
    const dlg = mount.querySelector('[role="dialog"]');
    expect(dlg.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(dlg.getAttribute('aria-labelledby')).textContent).toBe('Design');
    expect(mount.classList.contains('lfx-tp--sheet')).toBe(false);
    expect(document.querySelectorAll('.lfx-tp__card').length).toBe(6);
    expect(card('store').querySelector('.lfx-tp__beta').textContent).toBe('Beta');
    expect(card('store').querySelector('.lfx-tp__preview--store .lfx-tp__shopsign').textContent).toBe('VIDEOTHEK LENZ');
    expect(card('live').querySelector('.lfx-tp__preview--live .lfx-tp__screen')).not.toBeNull();
    expect(card('live').querySelector('.lfx-tp__preview--live .lfx-tp__remote')).not.toBeNull();
    expect(card('live').querySelector('.lfx-tp__mark--live').textContent).toBe('LENZLIVE');
    expect(card('live').querySelector('.lfx-tp__beta').textContent).toBe('Beta');
    expect(card('plus').querySelector('.lfx-tp__beta')).toBeNull();
    expect(card('prime').querySelector('.lfx-tp__beta')).toBeNull();
    expect(card('retro').querySelector('.lfx-tp__beta').textContent).toBe('Beta');
    expect(card('plus').getAttribute('aria-label')).not.toContain('Beta');
    expect(card('store').getAttribute('aria-label')).toContain('(Beta)');
    expect(card('live').querySelectorAll('.lfx-tp__remote .lfx-tp__rkey').length).toBe(9);
    expect(card('live').querySelectorAll('.lfx-tp__remote .lfx-tp__rcol').length).toBe(4);
    expect(card('live').querySelector('.lfx-tp__remote .lfx-tp__rpower')).not.toBeNull();
    expect(card('live').querySelector('.lfx-tp__remote .lfx-tp__rpad .lfx-tp__rok')).not.toBeNull();
    expect(card('live').querySelector('.lfx-tp__screen .lfx-tp__roll')).not.toBeNull();
    expect(card('live').querySelector('.lfx-tp__mark-live-b .lfx-tp__mark-live-dot')).not.toBeNull();
    expect(card('store').querySelectorAll('.lfx-tp__shelf').length).toBe(2);
    expect(card('store').querySelectorAll('.lfx-tp__cover').length).toBe(13);
    expect(card('flix').querySelector('.lfx-tp__beta')).toBeNull();
    expect(document.activeElement).toBe(card('flix'));
    closeThemePicker();
    expect(isThemePickerOpen()).toBe(false);
    expect(document.getElementById('lfx-themepicker')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-themepicker-open')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('aktive Karte markiert (aria-pressed, Label)', () => {
    themeState.chosen = 'plus';
    openThemePicker();
    expect(card('plus').getAttribute('aria-pressed')).toBe('true');
    expect(card('flix').getAttribute('aria-pressed')).toBe('false');
    expect(card('plus').textContent).toContain('Aktiv');
    expect(document.activeElement).toBe(card('plus'));
  });

  it('Escape, Overlay-Klick und × schließen', () => {
    openThemePicker();
    key('Escape');
    expect(isThemePickerOpen()).toBe(false);
    openThemePicker();
    document.getElementById('lfx-themepicker').click();
    expect(isThemePickerOpen()).toBe(false);
    openThemePicker();
    document.querySelector('.lfx-tp__dialog').click();
    expect(isThemePickerOpen()).toBe(true);
    document.querySelector('.lfx-tp__close').click();
    expect(isThemePickerOpen()).toBe(false);
  });

  it('Fokusfalle: Tab am Ende springt an den Anfang und umgekehrt', () => {
    openThemePicker();
    const btns = [...document.querySelectorAll('.lfx-tp__dialog button')];
    const first = btns[0];
    const last = btns.at(-1);
    last.focus();
    key('Tab');
    expect(document.activeElement).toBe(first);
    first.focus();
    key('Tab', { shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('Klick ruft setTheme, zeigt Ladezustand, Markierung folgt, nach Erfolg schließt der Dialog', async () => {
    let resolve;
    themeState.setImpl = () => new Promise((r) => { resolve = r; });
    openThemePicker();
    card('plus').click();
    expect(setTheme).toHaveBeenCalledWith('plus', { source: 'user' });
    expect(card('plus').getAttribute('aria-busy')).toBe('true');
    expect(isThemePickerOpen()).toBe(true); // während des Ladens offen
    themeState.chosen = 'plus';
    for (const fn of themeState.listeners) fn({ theme: 'plus', previous: 'flix' });
    expect(card('plus').getAttribute('aria-pressed')).toBe('true');
    expect(card('flix').getAttribute('aria-pressed')).toBe('false');
    resolve();
    await vi.waitFor(() => expect(isThemePickerOpen()).toBe(false));
    expect(document.getElementById('lfx-themepicker')).toBeNull();
  });

  it('Fehler: Markierung bleibt bei der alten Auswahl', async () => {
    themeState.setImpl = () => Promise.reject(new Error('x'));
    openThemePicker();
    card('prime').click();
    await vi.waitFor(() => expect(card('prime').hasAttribute('aria-busy')).toBe(false));
    expect(card('prime').getAttribute('aria-pressed')).toBe('false');
    expect(card('flix').getAttribute('aria-pressed')).toBe('true');
  });

  it('Handy: Bottom-Sheet-Variante', () => {
    mockMedia(true);
    openThemePicker();
    expect(document.getElementById('lfx-themepicker').classList.contains('lfx-tp--sheet')).toBe(true);
    expect(document.querySelector('.lfx-tp__handle')).not.toBeNull();
  });

  it('Aufräumen: Listener weg, Mount weg, destroyThemePicker = close', () => {
    openThemePicker();
    expect(themeState.listeners.size).toBe(1);
    destroyThemePicker();
    expect(themeState.listeners.size).toBe(0);
    expect(document.getElementById('lfx-themepicker')).toBeNull();
    expect(() => key('Escape')).not.toThrow();
    openThemePicker();
    openThemePicker();
    expect(document.querySelectorAll('#lfx-themepicker').length).toBe(1);
  });

  describe('Store-Vorschau: Cover', () => {
    const mkItems = (ids, withTag = true) => ids.map((id) => ({ Id: id, ImageTags: withTag ? { Primary: `t${id}` } : {} }));
    const ids = (n, p = 'm') => Array.from({ length: n }, (_, i) => p + i);
    const charts = (n) => ({ movies: ids(n).map((id) => ({ id })), series: ids(n, 's').map((id) => ({ id })) });
    const imgs = () => [...card('store').querySelectorAll('.lfx-tp__coverimg')];
    const srcs = () => imgs().map((i) => i.getAttribute('src'));
    const idOf = (src) => /Items\/([^/]+)\/Images/.exec(src)[1];
    const idsOf = (p) => String(p.Ids || '').split(',').filter(Boolean);
    const echo = (p) => Promise.resolve({ Items: mkItems(idsOf(p)) });

    it('Platzhalter sofort, kein Request ohne bereite API', async () => {
      openThemePicker();
      expect(card('store').querySelectorAll('.lfx-tp__cover').length).toBe(13);
      await new Promise((r) => setTimeout(r, 5));
      expect(imgs().length).toBe(0);
      expect(apiMock.getItems).not.toHaveBeenCalled();
      expect(chartsMock.getCharts).not.toHaveBeenCalled();
    });

    it('lädt Chart-Cover (13), nur IDs aus der getItems-Antwort, ohne api_key', async () => {
      apiMock.ready = true;
      chartsMock.getCharts = vi.fn(() => Promise.resolve(charts(12)));
      // Server liefert nur Items, die der Nutzer sehen darf: drei Serien fehlen
      apiMock.getItems = vi.fn((p) => Promise.resolve({ Items: mkItems(idsOf(p).filter((i) => !/^s[0-2]$/.test(i))) }));
      openThemePicker();
      await vi.waitFor(() => expect(imgs().length).toBe(13));
      expect(idsOf(apiMock.getItems.mock.calls[0][0]).length).toBe(20);
      for (const s of srcs()) {
        expect(s).toMatch(/maxWidth=160/);
        expect(s).not.toMatch(/api_key/i);
        expect(idOf(s)).not.toMatch(/^s[0-2]$/);
      }
      expect(new Set(srcs()).size).toBe(13);
      imgs()[0].dispatchEvent(new Event('load'));
      expect(imgs()[0].classList.contains('is-in')).toBe(true);
    });

    it('Items ohne Primary-Bild werden übersprungen, Fehlendes bleibt Platzhalter', async () => {
      apiMock.ready = true;
      chartsMock.getCharts = vi.fn(() => Promise.resolve(charts(2)));
      apiMock.getItems = vi.fn((p) => Promise.resolve({ Items: [...mkItems(idsOf(p).slice(0, 2)), ...mkItems(['x'], false)] }));
      openThemePicker();
      await vi.waitFor(() => expect(imgs().length).toBeGreaterThan(0));
      expect(imgs().length).toBeLessThan(13);
      expect(srcs().some((s) => idOf(s) === 'x')).toBe(false);
      expect(card('store').querySelectorAll('.lfx-tp__cover').length).toBe(13);
    });

    it('Fallback ohne Charts: neueste Titel (DateCreated absteigend), aufgefüllt bis 13', async () => {
      apiMock.ready = true;
      chartsMock.getCharts = vi.fn(() => Promise.resolve(null));
      apiMock.getItems = vi.fn(() => Promise.resolve({ Items: mkItems(ids(30, 'n')) }));
      openThemePicker();
      await vi.waitFor(() => expect(imgs().length).toBe(13));
      const p = apiMock.getItems.mock.calls[0][0];
      expect(p.SortBy).toBe('DateCreated');
      expect(p.SortOrder).toBe('Descending');
      expect(p.IncludeItemTypes).toBe('Movie,Series');
      expect(p.Ids).toBeUndefined();
      for (const s of srcs()) expect(idOf(s)).toMatch(/^n\d+$/);
    });

    it('Charts zu kurz: Rest kommt aus dem Fallback', async () => {
      apiMock.ready = true;
      chartsMock.getCharts = vi.fn(() => Promise.resolve(charts(2)));
      apiMock.getItems = vi.fn((p) => (p.Ids ? echo(p) : Promise.resolve({ Items: mkItems(ids(30, 'n')) })));
      openThemePicker();
      await vi.waitFor(() => expect(imgs().length).toBe(13));
      expect(srcs().filter((s) => idOf(s).startsWith('n')).length).toBe(9);
    });

    it('Fehler werden still geschluckt', async () => {
      apiMock.ready = true;
      chartsMock.getCharts = vi.fn(() => Promise.reject(new Error('x')));
      apiMock.getItems = vi.fn(() => Promise.reject(new Error('y')));
      openThemePicker();
      await vi.waitFor(() => expect(apiMock.getItems).toHaveBeenCalled());
      await new Promise((r) => setTimeout(r, 10));
      expect(imgs().length).toBe(0);
      expect(card('store').querySelectorAll('.lfx-tp__cover').length).toBe(13);
    });

    it('gleiche Auswahl am selben Tag, andere am nächsten', async () => {
      apiMock.ready = true;
      chartsMock.getCharts = vi.fn(() => Promise.resolve(charts(12)));
      apiMock.getItems = vi.fn(echo);
      const run = async () => {
        openThemePicker();
        await vi.waitFor(() => expect(imgs().length).toBe(13));
        const r = srcs();
        closeThemePicker();
        return r;
      };
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(new Date(2026, 10, 11, 9, 0, 0));
      const a = await run();
      clearCache();
      vi.setSystemTime(new Date(2026, 10, 11, 21, 0, 0));
      expect(await run()).toEqual(a);
      clearCache();
      vi.setSystemTime(new Date(2026, 10, 12, 9, 0, 0));
      expect(await run()).not.toEqual(a);
    });

    it('zweites Öffnen am selben Tag nutzt den Speicher (kein neuer Request)', async () => {
      apiMock.ready = true;
      chartsMock.getCharts = vi.fn(() => Promise.resolve(charts(12)));
      apiMock.getItems = vi.fn(echo);
      openThemePicker();
      await vi.waitFor(() => expect(imgs().length).toBe(13));
      const n = apiMock.getItems.mock.calls.length;
      closeThemePicker();
      openThemePicker();
      await vi.waitFor(() => expect(imgs().length).toBe(13));
      expect(apiMock.getItems.mock.calls.length).toBe(n);
    });
  });
});
