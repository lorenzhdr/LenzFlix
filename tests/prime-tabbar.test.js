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
vi.mock('../src/js/shared/collections.js', () => ({ getCollections: vi.fn(async () => []) }));
const logout = vi.fn();
vi.mock('../src/js/shared/profile.js', () => ({
  getUserChip: vi.fn(async () => ({ name: 'Lena', imageUrl: null })),
  profileEntries: vi.fn(async () => [
    { key: 'design', label: 'Design Einstellungen', onClick: () => {} },
    { key: 'logout', label: 'Abmelden', onClick: () => logout() },
  ]),
}));
vi.mock('../src/js/shared/search.js', () => ({ searchItems: vi.fn(async () => ({ movies: [], series: [], episodes: [], people: [] })) }));

import { isTheme } from '../src/js/core/theme.js';
import { parseHash } from '../src/js/core/router.js';
import header, { mobileKind } from '../src/js/features/prime/header.js';
import tabbar, { activeTab, shouldHide } from '../src/js/features/prime/tabbar.js';
import { isPrimeSearchOpen, closePrimeSearch } from '../src/js/features/prime/search.js';
import { isProfileSheetOpen, closeProfileSheet } from '../src/js/features/prime/profile-sheet.js';

const route = (h) => parseHash(h);
const flush = () => new Promise((r) => setTimeout(r, 0));
const setWidth = (w) => Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w });
const html = document.documentElement;

beforeEach(() => {
  document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
  html.className = '';
  isTheme.mockReturnValue(true);
  window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
  logout.mockClear();
  setWidth(390);
});
afterEach(() => {
  tabbar.unmount();
  header.unmount();
  closePrimeSearch({ restoreFocus: false });
  closeProfileSheet({ restoreFocus: false });
  setWidth(1024);
});

describe('prime-tabbar: Aktivierung', () => {
  it('match nur mobil + prime + Modern + nicht TV + nicht Player/Login', () => {
    expect(tabbar.match(route('#/home'))).toBe(true);
    expect(tabbar.match(route('#/video'))).toBe(false);
    expect(tabbar.match(route('#/login'))).toBe(false);
    expect(tabbar.match(route('#/dashboard'))).toBe(false);
    setWidth(1280);
    expect(tabbar.match(route('#/home'))).toBe(false);
    setWidth(390);
    isTheme.mockReturnValue(false);
    expect(tabbar.match(route('#/home'))).toBe(false);
    isTheme.mockReturnValue(true);
    html.classList.add('layout-tv');
    expect(tabbar.match(route('#/home'))).toBe(false);
  });

  it('aktiver Tab aus der Route', () => {
    expect(activeTab(route('#/home'))).toBe('home');
    expect(activeTab(route('#/home?lfx=hub&lib=m1'))).toBe('home');
    expect(activeTab(route('#/home?tab=1'))).toBe('list');
    expect(activeTab(route('#/home?lfx=new'))).toBeNull();
    expect(activeTab(route('#/home'), true)).toBe('search');
  });
});

describe('prime-tabbar: Mount', () => {
  it('drei Tabs mit Label, Aktiv-Zustand folgt der Route, unmount räumt auf', () => {
    tabbar.mount(route('#/home'));
    const el = document.getElementById('lfx-prime-tabbar');
    expect(html.classList.contains('lfx-prime-tabbar-on')).toBe(true);
    const tabs = [...el.querySelectorAll('.lfx-prime-tabbar__tab')];
    expect(tabs.map((t) => t.textContent)).toEqual(['Startseite', 'Meine Liste', 'Suche']);
    expect(tabs[0].getAttribute('href')).toBe('#/home');
    expect(tabs[1].getAttribute('href')).toBe('#/home?tab=1');
    expect(tabs[0].classList.contains('is-active')).toBe(true);
    tabbar.update(route('#/home?tab=1'));
    expect(tabs[1].classList.contains('is-active')).toBe(true);
    expect(tabs[0].classList.contains('is-active')).toBe(false);
    expect(tabs[1].getAttribute('aria-current')).toBe('page');
    tabbar.unmount();
    expect(document.getElementById('lfx-prime-tabbar')).toBeNull();
    expect(html.classList.contains('lfx-prime-tabbar-on')).toBe(false);
  });

  it('Suche öffnet das Vollbild-Overlay, Abbrechen schließt, Tab wird aktiv', async () => {
    tabbar.mount(route('#/home'));
    const search = document.querySelector('[data-tab="search"]');
    search.click();
    expect(isPrimeSearchOpen()).toBe(true);
    expect(document.getElementById('lfx-prime-search').classList.contains('lfx-prime-search--full')).toBe(true);
    expect(document.querySelector('.lfx-prime-search__cancel')).not.toBeNull();
    await flush();
    expect(search.classList.contains('is-active')).toBe(true);
    document.querySelector('.lfx-prime-search__cancel').click();
    expect(isPrimeSearchOpen()).toBe(false);
    await flush();
    expect(search.classList.contains('is-active')).toBe(false);
  });

  it('Startseite-Tab schließt eine offene Suche', () => {
    tabbar.mount(route('#/home'));
    document.querySelector('[data-tab="search"]').click();
    expect(isPrimeSearchOpen()).toBe(true);
    document.querySelector('[data-tab="home"]').click();
    expect(isPrimeSearchOpen()).toBe(false);
  });

  it('blendet bei Sheets, Dialogen und Player aus und danach wieder ein', async () => {
    tabbar.mount(route('#/home'));
    const el = document.getElementById('lfx-prime-tabbar');
    expect(shouldHide()).toBe(false);
    html.classList.add('lfx-sheet-open');
    await flush();
    expect(el.classList.contains('is-hidden')).toBe(true);
    expect(el.hasAttribute('inert')).toBe(true);
    html.classList.remove('lfx-sheet-open');
    await flush();
    expect(el.classList.contains('is-hidden')).toBe(false);
    const dlg = document.createElement('div');
    dlg.className = 'dialogContainer';
    dlg.innerHTML = '<div class="dialog"></div>';
    document.body.append(dlg);
    await flush();
    expect(el.classList.contains('is-hidden')).toBe(true);
    dlg.remove();
    await flush();
    expect(el.classList.contains('is-hidden')).toBe(false);
    document.body.insertAdjacentHTML('beforeend', '<div id="videoOsdPage"></div>');
    expect(shouldHide()).toBe(true);
    document.getElementById('videoOsdPage').remove();
    html.classList.add('lfx-themepicker-open');
    expect(shouldHide()).toBe(true);
  });
});

describe('prime-header am Handy', () => {
  it('Startseite: Wortmarke, Avatar, Pillen Filme/Serien; Klassen für Handy und Pillen', async () => {
    header.mount(route('#/home'));
    await flush();
    const el = document.getElementById('lfx-prime-header');
    expect(el.classList.contains('lfx-prime-header--mobile')).toBe(true);
    expect(html.classList.contains('lfx-prime-mobile')).toBe(true);
    expect(html.classList.contains('lfx-prime-header-pills')).toBe(true);
    expect(el.querySelector('.lfx-prime-header__logo')).not.toBeNull();
    expect(el.querySelector('.lfx-prime-header__nav')).toBeNull();
    expect(el.querySelector('.lfx-prime-header__icon')).toBeNull();
    const pills = [...el.querySelectorAll('.lfx-prime-header__pill')];
    expect(pills.map((p) => p.textContent)).toEqual(['Filme', 'Serien']);
    expect(pills[0].getAttribute('href')).toBe('#/home?lfx=hub&lib=m1');
    header.update(route('#/home?lfx=hub&lib=t1'));
    expect(el.querySelector('.lfx-prime-header__pill.is-active').textContent).toBe('Serien');
  });

  it('Unterseite: Zurück-Pfeil + Titel statt Pillen; Wechsel baut um', async () => {
    header.mount(route('#/home'));
    await flush();
    header.update(route('#/home?tab=1'));
    const el = document.getElementById('lfx-prime-header');
    expect(mobileKind(route('#/home?tab=1'))).toBe('sub');
    expect(el.querySelector('.lfx-prime-header__pills')).toBeNull();
    expect(el.querySelector('.lfx-prime-header__back').getAttribute('aria-label')).toBe('Zurück');
    expect(el.querySelector('.lfx-prime-header__title').textContent).toBe('Meine Liste');
    expect(html.classList.contains('lfx-prime-header-pills')).toBe(false);
    header.update(route('#/home?lfx=new'));
    expect(el.querySelector('.lfx-prime-header__title').textContent).toBe('Neu & beliebt');
    header.update(route('#/home'));
    expect(el.querySelector('.lfx-prime-header__pills')).not.toBeNull();
  });

  it('Zurück ruft history.back()', () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    const len = vi.spyOn(window.history, 'length', 'get').mockReturnValue(3);
    header.mount(route('#/mypreferencesmenu'));
    document.querySelector('.lfx-prime-header__back').click();
    expect(back).toHaveBeenCalled();
    back.mockRestore();
    len.mockRestore();
  });

  it('Avatar öffnet das Profil-Blatt mit Neu & beliebt, Bibliotheken und Profil-Einträgen', async () => {
    header.mount(route('#/home'));
    await flush();
    document.querySelector('.lfx-prime-header__avatar').click();
    expect(isProfileSheetOpen()).toBe(true);
    await flush();
    const sheet = document.querySelector('.lfx-prime-psheet');
    const labels = [...sheet.querySelectorAll('.lfx-prime-psheet__item')].map((n) => n.textContent);
    expect(labels).toEqual(['Neu & beliebt', 'Filme', 'Serien', 'Musik', 'Design Einstellungen', 'Abmelden']);
    expect(sheet.querySelector('.lfx-prime-psheet__name').textContent).toBe('Lena');
    expect(sheet.querySelector('a[href="#/home?lfx=new"]')).not.toBeNull();
    expect(html.classList.contains('lfx-prime-profilesheet-open')).toBe(true);
    [...sheet.querySelectorAll('button.lfx-prime-psheet__item')].find((b) => b.textContent === 'Abmelden').click();
    expect(logout).toHaveBeenCalled();
    expect(isProfileSheetOpen()).toBe(false);
    expect(html.classList.contains('lfx-prime-profilesheet-open')).toBe(false);
  });

  it('Escape schließt das Profil-Blatt', async () => {
    header.mount(route('#/home'));
    document.querySelector('.lfx-prime-header__avatar').click();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(isProfileSheetOpen()).toBe(false);
  });

  it('Fensterwechsel auf Desktop baut die Desktop-Kopfzeile', async () => {
    header.mount(route('#/home'));
    await flush();
    setWidth(1280);
    header.update(route('#/home'));
    const el = document.getElementById('lfx-prime-header');
    expect(el.classList.contains('lfx-prime-header--mobile')).toBe(false);
    expect(html.classList.contains('lfx-prime-mobile')).toBe(false);
    expect(el.querySelector('.lfx-prime-header__nav')).not.toBeNull();
    expect(el.querySelector('.lfx-prime-header__pills')).toBeNull();
  });

  it('Desktop bleibt unverändert (keine Handy-Klassen)', async () => {
    setWidth(1280);
    header.mount(route('#/home'));
    await flush();
    expect(html.classList.contains('lfx-prime-mobile')).toBe(false);
    expect(document.querySelector('.lfx-prime-header__nav')).not.toBeNull();
    expect(document.querySelector('.lfx-prime-header__icon')).not.toBeNull();
  });
});
