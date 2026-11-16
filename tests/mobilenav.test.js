// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  getViews: vi.fn(async () => ({
    Items: [
      { Id: 'm1', Name: 'Filme', CollectionType: 'movies' },
      { Id: 't1', Name: 'Serien', CollectionType: 'tvshows' },
      { Id: 'x1', Name: 'Musik', CollectionType: 'music' },
    ],
  })),
  getUserId: () => 'u1',
  isReady: () => true,
}));

vi.mock('../src/js/core/theme.js', () => ({ isTheme: vi.fn(() => true), getTheme: () => 'flix' }));
vi.mock('../src/js/core/themepicker.js', () => ({ openThemePicker: vi.fn() }));

vi.mock('../src/js/features/library/sources.js', () => ({
  getLibraryGenres: vi.fn(async () => [{ id: 'g1', name: 'Krimi' }, { id: 'g2', name: 'Komödie' }]),
}));

import { getLibraryGenres } from '../src/js/features/library/sources.js';
import { isTheme } from '../src/js/core/theme.js';
import { openThemePicker } from '../src/js/core/themepicker.js';
import mobilenav, { showsPills, pillItems, overlayItems } from '../src/js/features/mobilenav.js';
import { buildNavModel } from '../src/js/features/nav.js';
import { parseHash } from '../src/js/core/router.js';
import { clearCache } from '../src/js/core/cache.js';

const views = {
  Items: [
    { Id: 'm1', Name: 'Filme', CollectionType: 'movies' },
    { Id: 't1', Name: 'Serien', CollectionType: 'tvshows' },
    { Id: 'x1', Name: 'Musik', CollectionType: 'music' },
  ],
};

describe('mobilenav (rein)', () => {
  const model = buildNavModel(views);
  it('Pills und Overlay-Einträge', () => {
    expect(pillItems(model).map((i) => i.label)).toEqual(['Serien', 'Filme', 'Meine Liste']);
    expect(overlayItems(model).map((i) => i.label)).toEqual(['Startseite', 'Serien', 'Filme', 'Neu und beliebt', 'Meine Liste', 'Musik', 'Design Einstellungen', 'Datensparmodus']);
  });
  it('Statistik-Eintrag nur mit Konfiguration, nicht in den Pills', () => {
    expect(overlayItems(model).some((i) => i.label === 'Meine Statistik')).toBe(false);
    window.LenzFlixConfig = { statsUrl: '/lenzflix-stats/' };
    try {
      const items = overlayItems(model);
      expect(items.at(-1)).toMatchObject({ key: 'datasaver', label: 'Datensparmodus', action: 'datasaver' });
      expect(items.at(-2)).toMatchObject({ key: 'design', label: 'Design Einstellungen', badge: 'Beta', action: 'design' });
      expect(items.at(-3)).toMatchObject({ label: 'Meine Statistik', href: '/lenzflix-stats/?theme=flix' });
      expect(pillItems(model).map((i) => i.label)).toEqual(['Serien', 'Filme', 'Meine Liste']);
    } finally {
      delete window.LenzFlixConfig;
    }
  });
  it('Pills nur auf Startseite, Serien-/Filme-Seiten und Meine Liste', () => {
    expect(showsPills(parseHash('#/home'))).toBe(true);
    expect(showsPills(parseHash('#/home?lfx=series'))).toBe(true);
    expect(showsPills(parseHash('#/home?lfx=movies&genre=g1&view=grid'))).toBe(true);
    expect(showsPills(parseHash('#/home?lfx=mylist'))).toBe(true);
    expect(showsPills(parseHash('#/home?lfx=new'))).toBe(false);
    expect(showsPills(parseHash('#/home?tab=1'))).toBe(false);
    expect(showsPills(parseHash('#/movies?topParentId=m1'))).toBe(false);
  });
  it('Pill-Ziele zeigen auf die neuen Seiten', () => {
    expect(pillItems(model).map((i) => i.href)).toEqual(['#/home?lfx=series', '#/home?lfx=movies', '#/home?lfx=mylist']);
  });
  it('Mehr-Liste führt keine weiteren Film-/Serienbibliotheken', () => {
    const m = buildNavModel({ Items: [...views.Items, { Id: 'm2', Name: 'Filme 4K', CollectionType: 'movies' }] });
    expect(overlayItems(m).some((i) => i.label === 'Filme 4K')).toBe(false);
  });
});

describe('mobilenav (DOM)', () => {
  beforeEach(() => {
    clearCache();
    document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
    document.documentElement.className = 'layout-mobile';
    Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
  });
  afterEach(() => {
    mobilenav.unmount();
    document.documentElement.className = '';
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  });

  it('match: nur mobil + modern + nicht TV', () => {
    const route = parseHash('#/home');
    expect(mobilenav.match(route)).toBe(true);
    document.documentElement.classList.add('layout-tv');
    expect(mobilenav.match(route)).toBe(false);
    document.documentElement.className = '';
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    expect(mobilenav.match(route)).toBe(false);
    expect(mobilenav.match(parseHash('#/login'))).toBe(false);
  });

  it('match: Querformat (layout-mobile, 932 px) zeigt die Desktop-Leiste, nicht die Handy-Pills', () => {
    const w = window.innerWidth;
    try {
      Object.defineProperty(window, 'innerWidth', { value: 932, configurable: true });
      expect(mobilenav.match(parseHash('#/home'))).toBe(false);
      Object.defineProperty(window, 'innerWidth', { value: 430, configurable: true });
      expect(mobilenav.match(parseHash('#/home'))).toBe(true);
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
    }
  });

  it('match: Desktop (layout-desktop) unter 900 px zeigt den Handy-Kopf, ab 900 px nicht', () => {
    const w = window.innerWidth;
    try {
      document.documentElement.className = 'layout-desktop';
      for (const [width, want] of [[850, true], [800, true], [899, true], [900, false], [950, false]]) {
        Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
        expect(mobilenav.match(parseHash('#/home'))).toBe(want);
      }
    } finally {
      Object.defineProperty(window, 'innerWidth', { value: w, configurable: true });
    }
  });

  it('match nur im Design flix', () => {
    expect(mobilenav.match(parseHash('#/home'))).toBe(true);
    isTheme.mockReturnValueOnce(false);
    expect(mobilenav.match(parseHash('#/home'))).toBe(false);
  });

  it('Design-Eintrag ist vorletzter Button (danach der Datensparmodus-Schalter); Klick schließt das Overlay und öffnet den Picker', async () => {
    mobilenav.mount(parseHash('#/home'));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-mnav-overlay__link').length).toBe(8));
    const overlay = document.getElementById('lfx-mnav-overlay');
    document.querySelector('.lfx-mnav__pill--cats').click();
    expect(overlay.hidden).toBe(false);
    const btn = [...overlay.querySelectorAll('.lfx-mnav-overlay__link')].at(-2);
    expect(btn.tagName).toBe('BUTTON');
    expect(btn.type).toBe('button');
    expect(btn.dataset.action).toBe('design');
    expect(btn.childNodes[0].textContent).toBe('Design Einstellungen');
    expect(btn.querySelector('.lfx-beta').textContent).toBe('Beta');
    expect(btn.getAttribute('aria-label')).toBe('Design Einstellungen (Beta)');
    btn.click();
    expect(overlay.hidden).toBe(true);
    expect(openThemePicker).toHaveBeenCalledWith({ returnFocus: expect.anything() });
  });

  it('mount rendert Pills, Overlay öffnet/schließt, unmount räumt auf', async () => {
    mobilenav.mount(parseHash('#/home'));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-mnav__pill').length).toBe(4));
    expect(document.documentElement.classList.contains('lfx-mnav-on')).toBe(true);
    expect(document.documentElement.classList.contains('lfx-mnav-pills')).toBe(true);
    const overlay = document.getElementById('lfx-mnav-overlay');
    expect(overlay.hidden).toBe(true);
    document.querySelector('.lfx-mnav__pill--cats').click();
    expect(overlay.hidden).toBe(false);
    expect(document.documentElement.classList.contains('lfx-mnav-open')).toBe(true);
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(overlay.hidden).toBe(true);
    mobilenav.update(parseHash('#/movies?topParentId=m1'));
    expect(document.documentElement.classList.contains('lfx-mnav-pills')).toBe(false);
    mobilenav.unmount();
    expect(document.getElementById('lfx-mnav')).toBeNull();
    expect(document.getElementById('lfx-mnav-overlay')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-mnav-on')).toBe(false);
  });

  it('Overlay: Statistik-Link ohne Hash/data-key, Aufräumen in unmount', async () => {
    window.LenzFlixConfig = { statsUrl: '/lenzflix-stats/' };
    try {
      mobilenav.mount(parseHash('#/home'));
      await vi.waitFor(() => expect(document.querySelectorAll('.lfx-mnav-overlay__link').length).toBe(9));
      const a = [...document.querySelectorAll('.lfx-mnav-overlay__link')].find((x) => x.textContent === 'Meine Statistik');
      expect(a.getAttribute('href')).toBe('/lenzflix-stats/?theme=flix');
      expect(a.dataset.key).toBeUndefined();
      expect(document.querySelectorAll('.lfx-mnav__pill').length).toBe(4);
      mobilenav.update(parseHash('#/home'));
      expect(a.classList.contains('is-active')).toBe(false);
      mobilenav.unmount();
      expect(document.querySelector('.lfx-mnav-overlay__link')).toBeNull();
    } finally {
      delete window.LenzFlixConfig;
    }
  });

  it('Button heißt „Mehr“, das Overlay trägt dasselbe Label', async () => {
    mobilenav.mount(parseHash('#/home'));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-mnav__pill').length).toBe(4));
    expect(document.querySelector('.lfx-mnav__pill--cats').textContent).toBe('Mehr');
    expect(document.getElementById('lfx-mnav-overlay').getAttribute('aria-label')).toBe('Mehr');
    expect(document.body.textContent).not.toContain('Kategorien');
  });

  it('viewshow/update mit gleicher Route schließt das offene Overlay nicht (frisches Laden), eine neue Route schon', async () => {
    mobilenav.mount(parseHash('#/home'));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-mnav__pill').length).toBe(4));
    const overlay = document.getElementById('lfx-mnav-overlay');
    document.querySelector('.lfx-mnav__pill--cats').click();
    expect(overlay.hidden).toBe(false);
    for (let i = 0; i < 5; i += 1) mobilenav.update(parseHash('#/home'));
    expect(overlay.hidden).toBe(false);
    expect(document.documentElement.classList.contains('lfx-mnav-open')).toBe(true);
    expect(document.querySelector('.lfx-mnav__pill--cats').getAttribute('aria-expanded')).toBe('true');
    mobilenav.update(parseHash('#/movies?topParentId=m1'));
    expect(overlay.hidden).toBe(true);
    expect(document.documentElement.classList.contains('lfx-mnav-open')).toBe(false);
  });

  it('Overlay bleibt offen, wenn nach dem Laden der Bibliotheken neu gerendert wird', async () => {
    mobilenav.mount(parseHash('#/home'));
    const overlay = document.getElementById('lfx-mnav-overlay');
    document.querySelector('.lfx-mnav__pill--cats').click();
    expect(overlay.hidden).toBe(false);
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-mnav__pill').length).toBe(4));
    expect(overlay.hidden).toBe(false);
    expect(document.querySelector('.lfx-mnav__pill--cats').getAttribute('aria-expanded')).toBe('true');
    expect(overlay.querySelectorAll('.lfx-mnav-overlay__link').length).toBeGreaterThan(3);
  });

  describe('Serien/Filme/Meine Liste', () => {
    const labels = () => [...document.querySelectorAll('.lfx-mnav__pill')].map((p) => p.textContent);

    it('Serien-Seite: ✕ · Serien (aktiv) · Genres; Klasse lfx-mnav-pills gesetzt', async () => {
      mobilenav.mount(parseHash('#/home?lfx=series'));
      await vi.waitFor(() => expect(labels()).toEqual(['×', 'Serien', 'Genres']));
      expect(document.documentElement.classList.contains('lfx-mnav-pills')).toBe(true);
      expect(document.getElementById('lfx-mnav-cats').getAttribute('aria-label')).toBe('Genres');
      const [x, s] = document.querySelectorAll('.lfx-mnav__pill');
      expect(x.getAttribute('href')).toBe('#/home');
      expect(s.getAttribute('href')).toBe('#/home?lfx=series');
      expect(s.classList.contains('is-active')).toBe(true);
    });

    it('Filme mit Genre: Genre-Name statt „Genres“; Pille führt ohne Genre zurück', async () => {
      mobilenav.mount(parseHash('#/home?lfx=movies&genre=g1'));
      await vi.waitFor(() => expect(labels()).toEqual(['×', 'Filme', 'Krimi']));
      expect(document.querySelectorAll('.lfx-mnav__pill')[1].getAttribute('href')).toBe('#/home?lfx=movies');
      expect(getLibraryGenres).toHaveBeenCalledWith('movies');
    });

    it('Meine Liste: ✕ · Meine Liste', async () => {
      mobilenav.mount(parseHash('#/home?lfx=mylist'));
      await vi.waitFor(() => expect(labels()).toEqual(['×', 'Meine Liste']));
      expect(document.querySelectorAll('.lfx-mnav__pill')[1].classList.contains('is-active')).toBe(true);
    });

    it('Genreliste: öffnet, lädt Genres, markiert aktives Genre, navigiert und schließt (Scroll-Sperre zurück)', async () => {
      mobilenav.mount(parseHash('#/home?lfx=series&genre=g2'));
      await vi.waitFor(() => expect(labels()).toEqual(['×', 'Serien', 'Komödie']));
      const cats = document.getElementById('lfx-mnav-cats');
      expect(cats.hidden).toBe(true);
      document.querySelector('.lfx-mnav__pill--genre').click();
      expect(cats.hidden).toBe(false);
      expect(document.documentElement.classList.contains('lfx-mnav-cats-open')).toBe(true);
      const links = [...cats.querySelectorAll('.lfx-mnav-cats__link')];
      expect(links.map((a) => a.textContent)).toEqual(['Alle Serien', 'Krimi', 'Komödie']);
      expect(links.map((a) => a.getAttribute('href'))).toEqual(['#/home?lfx=series', '#/home?lfx=series&genre=g1', '#/home?lfx=series&genre=g2']);
      expect(links.map((a) => a.classList.contains('is-active'))).toEqual([false, false, true]);
      links[1].click();
      expect(cats.hidden).toBe(true);
      expect(document.documentElement.classList.contains('lfx-mnav-cats-open')).toBe(false);
    });

    it('Genreliste: Esc und ✕ schließen, Route-Wechsel und unmount setzen die Sperre zurück', async () => {
      mobilenav.mount(parseHash('#/home?lfx=movies'));
      await vi.waitFor(() => expect(document.querySelectorAll('.lfx-mnav-cats__link').length).toBe(3));
      const cats = document.getElementById('lfx-mnav-cats');
      const open = () => document.querySelector('.lfx-mnav__pill--genre').click();
      open();
      expect(cats.querySelector('.lfx-mnav-cats__link').textContent).toBe('Alle Filme');
      cats.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(cats.hidden).toBe(true);
      open();
      cats.querySelector('.lfx-mnav-cats__close').click();
      expect(cats.hidden).toBe(true);
      open();
      mobilenav.update(parseHash('#/home?lfx=movies&genre=g1'));
      expect(cats.hidden).toBe(true);
      expect(document.documentElement.classList.contains('lfx-mnav-cats-open')).toBe(false);
      document.querySelector('.lfx-mnav__pill--genre').click();
      expect(document.documentElement.classList.contains('lfx-mnav-cats-open')).toBe(true);
      mobilenav.unmount();
      expect(document.documentElement.classList.contains('lfx-mnav-cats-open')).toBe(false);
      expect(document.getElementById('lfx-mnav-cats')).toBeNull();
    });

    it('Wechsel Startseite -> Serien -> Startseite baut die Pillen jeweils neu', async () => {
      mobilenav.mount(parseHash('#/home'));
      await vi.waitFor(() => expect(labels()).toEqual(['Serien', 'Filme', 'Meine Liste', 'Mehr']));
      mobilenav.update(parseHash('#/home?lfx=series'));
      expect(labels()).toEqual(['×', 'Serien', 'Genres']);
      mobilenav.update(parseHash('#/home'));
      expect(labels()).toEqual(['Serien', 'Filme', 'Meine Liste', 'Mehr']);
    });
  });

  it('Overlay ohne Konfiguration: kein Statistik-Link', async () => {
    mobilenav.mount(parseHash('#/home'));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-mnav-overlay__link').length).toBe(8));
    expect([...document.querySelectorAll('.lfx-mnav-overlay__link')].some((x) => x.textContent === 'Meine Statistik')).toBe(false);
  });
});
