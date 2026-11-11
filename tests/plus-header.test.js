// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ isReady: () => true, getUserId: () => 'u1' }));
vi.mock('../src/js/core/theme.js', () => ({
  isTheme: vi.fn((id) => id === 'plus'),
  getTheme: () => 'plus',
  brandName: () => 'LENZ+',
}));
const libs = [
  { id: 'm1', name: 'Filme', collectionType: 'movies', href: '#/movies?topParentId=m1', hubCapable: true },
  { id: 't1', name: 'Serien', collectionType: 'tvshows', href: '#/tv?topParentId=t1', hubCapable: true },
];
vi.mock('../src/js/shared/libraries.js', () => ({ getLibraries: vi.fn(async () => libs) }));
const designClick = vi.fn();
vi.mock('../src/js/shared/profile.js', () => ({
  profileEntries: vi.fn(async () => [
    { key: 'design', label: 'Design Einstellungen', onClick: designClick },
    { key: 'logout', label: 'Abmelden', onClick: vi.fn() },
  ]),
  getUserChip: vi.fn(async () => ({ name: 'Lorenz', imageUrl: null })),
}));

import header, { navItems, activeKey } from '../src/js/features/plus/header.js';
import { parseHash } from '../src/js/core/router.js';
import { isTheme } from '../src/js/core/theme.js';
import { closePopover } from '../src/js/core/popover.js';

const R = (h) => parseHash(h);
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('plus-header: Modell', () => {
  it('Navigationspunkte in Spec-Reihenfolge', () => {
    const items = navItems(libs);
    expect(items.map((i) => i.label)).toEqual(['Startseite', 'Meine Liste', 'Filme', 'Serien', 'Neu & beliebt']);
    expect(items[2].href).toBe('#/home?lfx=browse&lib=m1');
    expect(navItems([]).map((i) => i.key)).toEqual(['home', 'list', 'new']);
  });
  it('aktiver Punkt aus der Route', () => {
    const k = (h) => activeKey(R(h), libs);
    expect(k('#/home')).toBe('home');
    expect(k('#/home?tab=1')).toBe('list');
    expect(k('#/home?lfx=new')).toBe('new');
    expect(k('#/home?lfx=browse&lib=m1')).toBe('movies');
    expect(k('#/home?lfx=browse&lib=t1&genre=5')).toBe('series');
    expect(k('#/home?lfx=browse&lib=zz')).toBeNull();
    expect(k('#/home?lfx=search')).toBe('search');
    expect(k('#/home?lfx=tv')).toBe('tv');
    expect(k('#/home?lfx=title&id=1')).toBeNull();
    expect(k('#/movies?topParentId=m1')).toBe('movies');
    expect(k('#/details?id=5')).toBeNull();
  });
});

describe('plus-header: Feature', () => {
  beforeEach(() => {
    document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
    isTheme.mockImplementation((id) => id === 'plus');
  });
  afterEach(() => {
    header.unmount();
    closePopover();
    vi.useRealTimers();
    document.documentElement.className = '';
  });

  it('match: nur LENZ+, Modern, nicht Player/Login', () => {
    expect(header.match(R('#/home'))).toBe(true);
    expect(header.match(R('#/video'))).toBe(false);
    expect(header.match(R('#/login'))).toBe(false);
    expect(header.match(R('#/dashboard'))).toBe(false);
    isTheme.mockImplementation(() => false);
    expect(header.match(R('#/home'))).toBe(false);
  });

  it('mount rendert Kopfzeile, Klasse, Chip und Bibliotheken; unmount räumt auf', async () => {
    header.mount(R('#/home?tab=1'));
    expect(document.documentElement.classList.contains('lfx-plus-header-on')).toBe(true);
    await flush();
    const root = document.getElementById('lfx-plus-header');
    expect(root.querySelector('.lfx-plus-header__name').textContent).toBe('Lorenz');
    expect([...root.querySelectorAll('.lfx-plus-header__item')].map((a) => a.dataset.key)).toEqual(['home', 'list', 'movies', 'series', 'new']);
    expect(root.querySelector('[data-key="list"]').classList.contains('is-active')).toBe(true);
    expect(root.querySelector('.lfx-plus-header__search').getAttribute('href')).toBe('#/home?lfx=search');
    const tvEl = root.querySelector('.lfx-plus-header__tv');
    expect(tvEl.getAttribute('href')).toBe('#/home?lfx=tv');
    expect(tvEl.getAttribute('aria-label')).toBe('TV');
    expect(tvEl.nextElementSibling).toBe(root.querySelector('.lfx-plus-header__search'));
    expect(tvEl.classList.contains('is-active')).toBe(false);
    const intent = vi.fn();
    window.addEventListener('lfx:tvmode-intent', intent);
    tvEl.click();
    window.removeEventListener('lfx:tvmode-intent', intent);
    expect(intent).toHaveBeenCalledTimes(1);
    header.update(R('#/home?lfx=tv'));
    expect(tvEl.getAttribute('aria-current')).toBe('page');
    header.update(R('#/home?lfx=browse&lib=m1'));
    expect(root.querySelector('[data-key="movies"]').getAttribute('aria-current')).toBe('page');
    expect(root.querySelector('[data-key="list"]').classList.contains('is-active')).toBe(false);
    header.unmount();
    expect(document.getElementById('lfx-plus-header')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-plus-header-on')).toBe(false);
  });

  it('Klick auf den Chip öffnet das Menü, Design Einstellungen funktioniert', async () => {
    header.mount(R('#/home'));
    await flush();
    document.querySelector('.lfx-plus-header__chip').click();
    await flush();
    const menu = document.getElementById('lfx-popover');
    expect(menu.classList.contains('lfx-plus-menu')).toBe(true);
    menu.querySelector('[data-key="design"]').click();
    expect(designClick).toHaveBeenCalled();
    expect(document.getElementById('lfx-popover')).toBeNull();
  });

  it('Hover öffnet verzögert, Verlassen schließt', async () => {
    header.mount(R('#/home'));
    await flush();
    vi.useFakeTimers();
    const chip = document.querySelector('.lfx-plus-header__chip');
    chip.dispatchEvent(new MouseEvent('mouseenter'));
    await vi.advanceTimersByTimeAsync(200);
    expect(document.getElementById('lfx-popover')).not.toBeNull();
    chip.dispatchEvent(new MouseEvent('mouseleave'));
    await vi.advanceTimersByTimeAsync(300);
    expect(document.getElementById('lfx-popover')).toBeNull();
  });

  it('Scrollen: solid, ausfahren beim Runter-, einfahren beim Hochscrollen', async () => {
    const raf = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((fn) => setTimeout(fn, 0));
    header.mount(R('#/home'));
    await flush();
    const root = document.getElementById('lfx-plus-header');
    const scrollTo = async (y) => {
      Object.defineProperty(window, 'scrollY', { value: y, configurable: true });
      window.dispatchEvent(new Event('scroll'));
      return flush();
    };
    expect(root.classList.contains('is-solid')).toBe(false);
    await scrollTo(300);
    expect(root.classList.contains('is-solid')).toBe(true);
    expect(root.classList.contains('is-hidden')).toBe(true);
    expect(document.documentElement.classList.contains('lfx-plus-header-hidden')).toBe(true);
    await scrollTo(250);
    expect(root.classList.contains('is-hidden')).toBe(false);
    await scrollTo(0);
    expect(root.classList.contains('is-solid')).toBe(false);
    raf.mockRestore();
    Object.defineProperty(window, 'scrollY', { value: 0, configurable: true });
  });
});
