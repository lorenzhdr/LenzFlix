// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ isReady: () => true, getUserId: () => 'u1' }));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: vi.fn(() => true), getTheme: () => 'prime', brandName: () => 'LENZPRIME' }));
vi.mock('../src/js/shared/libraries.js', () => ({
  getLibraries: vi.fn(async () => [
    { id: 'm1', name: 'Filme', collectionType: 'movies', href: '#/movies?topParentId=m1', hubCapable: true },
    { id: 't1', name: 'Serien', collectionType: 'tvshows', href: '#/tv?topParentId=t1', hubCapable: true },
    { id: 'x1', name: 'Musik', collectionType: 'music', href: '#/music?topParentId=x1', hubCapable: false },
  ]),
}));
vi.mock('../src/js/shared/collections.js', () => ({
  getCollections: vi.fn(async () => [{ id: 'c1', name: 'Saga', href: '#/details?id=c1' }]),
}));
vi.mock('../src/js/shared/profile.js', () => ({
  getUserChip: vi.fn(async () => ({ name: 'Lena', imageUrl: null })),
  profileEntries: vi.fn(async () => [
    { key: 'stats', label: 'Meine Statistik', href: '#/stats', className: 'is-stats' },
    { key: 'logout', label: 'Abmelden', onClick: () => {} },
  ]),
}));
vi.mock('../src/js/shared/search.js', () => ({ searchItems: vi.fn(async () => ({ movies: [], series: [], episodes: [], people: [] })) }));

import { isTheme } from '../src/js/core/theme.js';
import { closePopover } from '../src/js/core/popover.js';
import { parseHash } from '../src/js/core/router.js';
import header, { navItems, activeKey, mobileTitle } from '../src/js/features/prime/header.js';
import { isPrimeSearchOpen } from '../src/js/features/prime/search.js';

const route = (h) => parseHash(h);
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('prime-header: Wortmarke', () => {
  it('Link ohne img (Logo per CSS-Hintergrund) mit aria-label', async () => {
    document.body.innerHTML = '';
    isTheme.mockReturnValue(true);
    await header.mount(route('#/home'));
    await flush();
    const logo = document.querySelector('.lfx-prime-header__logo');
    expect(logo.querySelector('img')).toBeNull();
    expect(logo.getAttribute('aria-label')).toBe('LENZPRIME – Startseite');
    header.unmount();
  });
});

describe('prime-header: Modell', () => {
  const libs = [
    { id: 'm1', collectionType: 'movies' },
    { id: 't1', collectionType: 'tvshows' },
  ];
  it('Menüpunkte mit Hub-Zielen', () => {
    const items = navItems(libs);
    expect(items.map((i) => i.label)).toEqual(['Startseite', 'Filme', 'Serien', 'Neu & beliebt']);
    expect(items[1].href).toBe('#/home?lfx=hub&lib=m1');
    expect(items[3].href).toBe('#/home?lfx=new');
    expect(navItems([]).map((i) => i.label)).toEqual(['Startseite', 'Neu & beliebt']);
  });
  it('aktiver Schlüssel', () => {
    expect(activeKey(route('#/home'))).toBe('home');
    expect(activeKey(route('#/home?tab=1'))).toBe('list');
    expect(activeKey(route('#/home?lfx=new'))).toBe('new');
    expect(activeKey(route('#/home?lfx=hub&lib=m1'))).toBe('lib:m1');
    expect(activeKey(route('#/home?lfx=tv'))).toBe('tv');
    expect(activeKey(route('#/home?lfx=title&id=5'))).toBeNull();
    expect(activeKey(route('#/movies?topParentId=m1'))).toBeNull();
  });
});

describe('prime-header: Feature', () => {
  beforeEach(() => {
    document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
    document.documentElement.className = '';
    window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
    window.cancelAnimationFrame = (id) => clearTimeout(id);
    isTheme.mockReturnValue(true);
  });
  afterEach(() => {
    header.unmount();
    closePopover();
  });

  it('match: nur LENZPRIME, Modern, nicht TV, nicht Login', () => {
    expect(header.match(route('#/home'))).toBe(true);
    expect(header.match(route('#/login'))).toBe(false);
    isTheme.mockReturnValue(false);
    expect(header.match(route('#/home'))).toBe(false);
    isTheme.mockReturnValue(true);
    document.documentElement.classList.add('layout-tv');
    expect(header.match(route('#/home'))).toBe(false);
  });

  it('mount: Mount-Point, html-Klasse, Navigation mit Aktiv-Pille; unmount räumt auf', async () => {
    header.mount(route('#/home?lfx=hub&lib=m1'));
    await flush();
    expect(document.documentElement.classList.contains('lfx-prime-header-on')).toBe(true);
    const links = [...document.querySelectorAll('#lfx-prime-header .lfx-prime-header__link')];
    expect(links.map((a) => a.textContent)).toEqual(['Startseite', 'Filme', 'Serien', 'Neu & beliebt']);
    expect(document.querySelector('.lfx-prime-header__link.is-active').textContent).toBe('Filme');
    expect(document.querySelector('a[href="#/home?tab=1"]')).not.toBeNull();
    header.update(route('#/home?lfx=new'));
    expect(document.querySelector('.lfx-prime-header__link.is-active').textContent).toBe('Neu & beliebt');
    header.unmount();
    expect(document.getElementById('lfx-prime-header')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-prime-header-on')).toBe(false);
  });

  it('Scrollen setzt is-scrolled (rAF-gedrosselt)', async () => {
    header.mount(route('#/home'));
    const el = document.getElementById('lfx-prime-header');
    expect(el.classList.contains('is-scrolled')).toBe(false);
    Object.defineProperty(window, 'scrollY', { value: 200, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    await flush();
    expect(el.classList.contains('is-scrolled')).toBe(true);
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    await flush();
    expect(el.classList.contains('is-scrolled')).toBe(false);
  });

  it('Raster-Flyout: Klick öffnet mit Bibliotheken und Sammlungen, Escape schließt', async () => {
    header.mount(route('#/home'));
    await flush();
    const btn = document.querySelector('[aria-controls="lfx-prime-grid"]');
    const fly = document.getElementById('lfx-prime-grid');
    expect(fly.hidden).toBe(true);
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await flush();
    expect(fly.hidden).toBe(false);
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    const hrefs = [...fly.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('#/home?lfx=hub&lib=m1');
    expect(hrefs).toContain('#/music?topParentId=x1'); // nicht hubfähig -> native Ziel-URL
    expect(hrefs).toContain('#/home?lfx=title&id=c1');
    expect(fly.textContent).toContain('Empfohlene Sammlungen');
    btn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(fly.hidden).toBe(true);
  });

  it('Raster-Flyout: Hover öffnet, Klick danach hält offen, zweiter Klick schließt', async () => {
    header.mount(route('#/home'));
    await flush();
    const wrap = document.querySelector('.lfx-prime-header__flyout-wrap');
    const btn = wrap.querySelector('button');
    wrap.dispatchEvent(new MouseEvent('mouseenter'));
    expect(document.getElementById('lfx-prime-grid').hidden).toBe(false);
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(document.getElementById('lfx-prime-grid').hidden).toBe(false);
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    expect(document.getElementById('lfx-prime-grid').hidden).toBe(true);
  });

  it('TV-Symbol: nach der Suche, aktiv auf tv, Klick meldet die Absicht synchron', async () => {
    header.mount(route('#/home'));
    await flush();
    const icons = [...document.querySelectorAll('.lfx-prime-header__right > .lfx-prime-header__icon')];
    const tv = document.querySelector('a[data-key="tv"]');
    expect(tv.getAttribute('href')).toBe('#/home?lfx=tv');
    expect(tv.getAttribute('aria-label')).toBe('TV');
    expect(icons[0].getAttribute('aria-label')).toBe('Suche');
    expect(icons[1]).toBe(tv);
    expect(tv.classList.contains('is-active')).toBe(false);
    const seen = vi.fn();
    window.addEventListener('lfx:tvmode-intent', seen);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    tv.dispatchEvent(ev);
    window.removeEventListener('lfx:tvmode-intent', seen);
    expect(seen).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(false);
    header.update(route('#/home?lfx=tv'));
    expect(tv.classList.contains('is-active')).toBe(true);
    expect(tv.getAttribute('aria-current')).toBe('page');
    header.unmount();
    expect(document.querySelector('a[data-key="tv"]')).toBeNull();
  });

  it('Lupe öffnet das Such-Overlay, unmount schließt es', async () => {
    header.mount(route('#/home'));
    document.querySelector('[aria-label="Suche"]').click();
    expect(isPrimeSearchOpen()).toBe(true);
    header.unmount();
    expect(isPrimeSearchOpen()).toBe(false);
    expect(document.getElementById('lfx-prime-search')).toBeNull();
  });

  it('Avatar öffnet das Profil-Panel mit eigener Klasse, unmount schließt es', async () => {
    header.mount(route('#/home'));
    await flush();
    document.querySelector('.lfx-prime-header__avatar').click();
    await flush();
    const pop = document.getElementById('lfx-popover');
    expect(pop).not.toBeNull();
    expect(pop.classList.contains('lfx-prime-profile')).toBe(true);
    expect(pop.querySelector('.is-stats')).not.toBeNull();
    header.unmount();
    expect(document.getElementById('lfx-popover')).toBeNull();
  });
});

describe('prime-header: Handy-Titel (nie Servername)', () => {
  const libs = [{ id: 'm1', name: 'Filme' }, { id: 'x1', name: 'Musik' }];
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = 'LENZFLIX';
  });
  it('feste Titel und Bibliotheksnamen', () => {
    expect(mobileTitle(route('#/home?tab=1'))).toBe('Meine Liste');
    expect(mobileTitle(route('#/home?lfx=new'))).toBe('Neu & beliebt');
    expect(mobileTitle(route('#/home?lfx=tv'))).toBe('TV');
    expect(mobileTitle(route('#/mypreferencesmenu'))).toBe('Einstellungen');
    expect(mobileTitle(route('#/music?topParentId=x1'), libs)).toBe('Musik');
    expect(mobileTitle(route('#/list?parentId=m1'), libs)).toBe('Filme');
  });
  it('unbekannte native Seite: leer statt document.title', () => {
    expect(mobileTitle(route('#/irgendwas'), libs)).toBe('');
    expect(mobileTitle(route('#/details?id=7'), libs)).toBe('');
  });
  it('Titelseite: Name aus dem DOM, leer bis bekannt', () => {
    const r = route('#/home?lfx=title&id=5');
    expect(mobileTitle(r)).toBe('');
    document.body.innerHTML = '<h1 class="lfx-pt__title">Arcane</h1>';
    expect(mobileTitle(r)).toBe('Arcane');
    document.body.innerHTML = '<img class="lfx-pt__logo" alt="Dune">';
    expect(mobileTitle(r)).toBe('Dune');
  });
  it('Native Detailseite: Name aus .nameContainer', () => {
    document.body.innerHTML = '<div class="page"><div class="nameContainer"><h1>Staffel 1</h1></div></div>';
    expect(mobileTitle(route('#/details?id=9'))).toBe('Staffel 1');
  });
});
