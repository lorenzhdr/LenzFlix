// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ isReady: () => true, getUserId: () => 'u1' }));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: vi.fn((id) => id === 'retro'), getTheme: () => 'retro', brandName: () => 'LENZ//84' }));
vi.mock('../src/js/shared/libraries.js', () => ({
  getLibraries: vi.fn(async () => [
    { id: 'm1', name: 'Filme', collectionType: 'movies', href: '#/movies?topParentId=m1', hubCapable: true },
    { id: 't1', name: 'Serien', collectionType: 'tvshows', href: '#/tv?topParentId=t1', hubCapable: true },
  ]),
}));
const profileEntries = vi.fn(async () => [
  { key: 'design', label: 'Design Einstellungen', badge: 'Beta', onClick: () => {} },
  { key: 'logout', label: 'Abmelden', onClick: () => {} },
]);
vi.mock('../src/js/shared/profile.js', () => ({
  getUserChip: vi.fn(async () => ({ name: 'Lena', imageUrl: null })),
  profileEntries: (...a) => profileEntries(...a),
}));

import { isTheme } from '../src/js/core/theme.js';
import { closePopover } from '../src/js/core/popover.js';
import { parseHash } from '../src/js/core/router.js';
import header from '../src/js/features/retro/header.js';
import { navItems, activeKey, isPhone } from '../src/js/features/retro/header-nav.js';
import { formatClock } from '../src/js/features/retro/header-ui.js';
import { PREFS_EVENT, FX_EVENT, LOGO_ATTR } from '../src/js/features/retro/prefs.js';

const route = (h) => parseHash(h);
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const setWidth = (w) => Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w });
const html = document.documentElement;

beforeEach(() => {
  document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
  html.className = '';
  localStorage.clear();
  isTheme.mockImplementation((id) => id === 'retro');
  setWidth(1280);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 5, 23, 41, 20));
  window.requestAnimationFrame = (fn) => setTimeout(fn, 0);
  window.cancelAnimationFrame = (id) => clearTimeout(id);
});
afterEach(() => {
  header.unmount();
  closePopover();
  vi.useRealTimers();
});

describe('retro-header: Modell', () => {
  const libs = [{ id: 'm1', collectionType: 'movies' }, { id: 't1', collectionType: 'tvshows' }];
  it('Navigation mit Hub-Zielen, Liste und Suche', () => {
    const items = navItems(libs);
    expect(items.map((i) => i.label)).toEqual(['Start', 'Filme', 'Serien', 'Neu & beliebt', 'Meine Liste', 'Suche']);
    expect(items[1].href).toBe('#/home?lfx=hub&lib=m1');
    expect(items[3].href).toBe('#/home?lfx=new');
    expect(items[4].href).toBe('#/home?tab=1');
    expect(items[5].href).toBe('#/home?lfx=search');
    expect(navItems([]).map((i) => i.label)).toEqual(['Start', 'Neu & beliebt', 'Meine Liste', 'Suche']);
  });
  it('aktiver Schlüssel', () => {
    expect(activeKey(route('#/home'))).toBe('home');
    expect(activeKey(route('#/home?tab=1'))).toBe('list');
    expect(activeKey(route('#/home?lfx=new'))).toBe('new');
    expect(activeKey(route('#/home?lfx=search&q=x'))).toBe('search');
    expect(activeKey(route('#/home?lfx=hub&lib=m1'))).toBe('lib:m1');
    expect(activeKey(route('#/home?lfx=title&id=5'))).toBeNull();
    expect(activeKey(route('#/movies?topParentId=m1'))).toBeNull();
  });
  it('Uhrformat HH:MM', () => {
    expect(formatClock(new Date(2026, 0, 5, 7, 5))).toBe('07:05');
    expect(formatClock(new Date(2026, 0, 5, 23, 41))).toBe('23:41');
  });
  it('isPhone: Komplement zur Desktop-Schwelle 800 px', () => {
    setWidth(799);
    expect(isPhone()).toBe(true);
    setWidth(800);
    expect(isPhone()).toBe(false);
  });
});

describe('retro-header: match', () => {
  it('nur retro + Modern + nicht TV + Desktop + nicht Player/Login/Dashboard', () => {
    expect(header.match(route('#/home'))).toBe(true);
    expect(header.match(route('#/mypreferencesmenu'))).toBe(true);
    expect(header.match(route('#/video'))).toBe(false);
    expect(header.match(route('#/login'))).toBe(false);
    expect(header.match(route('#/dashboard'))).toBe(false);
    setWidth(390);
    expect(header.match(route('#/home'))).toBe(false);
    setWidth(1280);
    isTheme.mockImplementation((id) => id === 'plus');
    expect(header.match(route('#/home'))).toBe(false);
    isTheme.mockImplementation((id) => id === 'prime');
    expect(header.match(route('#/home'))).toBe(false);
    isTheme.mockImplementation((id) => id === 'flix');
    expect(header.match(route('#/home'))).toBe(false);
    isTheme.mockImplementation((id) => id === 'retro');
    html.classList.add('layout-tv');
    expect(header.match(route('#/home'))).toBe(false);
    html.classList.remove('layout-tv');
    document.body.innerHTML = '';
    expect(header.match(route('#/home'))).toBe(false); // keine Modern-AppBar
  });
});

describe('retro-header: Feature', () => {
  it('mount baut Leiste auf, Wortmarke trägt LOGO_ATTR, aktiver Eintrag markiert', async () => {
    header.mount(route('#/home'));
    await flush();
    const el = document.getElementById('lfx-retro-header');
    expect(el).toBeTruthy();
    expect(html.classList.contains('lfx-retro-header-on')).toBe(true);
    const logo = el.querySelector('.lfx-retro-header__logo');
    expect(logo.hasAttribute(LOGO_ATTR)).toBe(true);
    expect(logo.querySelector('img')).toBeNull();
    const links = [...el.querySelectorAll('.lfx-retro-header__link')];
    expect(links.map((a) => a.textContent)).toEqual(['Start', 'Filme', 'Serien', 'Neu & beliebt', 'Meine Liste', 'Suche']);
    expect(el.querySelector('.is-active').textContent).toBe('Start');
    expect(el.querySelector('.lfx-retro-clock').textContent).toBe('23:41');
    expect(el.querySelector('.lfx-retro-header__initial').textContent).toBe('L');
    header.update(route('#/home?tab=1'));
    expect(el.querySelector('.is-active').textContent).toBe('Meine Liste');
  });

  it('Uhr läuft minütlich weiter und stoppt beim unmount', async () => {
    header.mount(route('#/home'));
    await flush();
    const clock = document.querySelector('.lfx-retro-clock');
    expect(clock.textContent).toBe('23:41');
    vi.advanceTimersByTime(60000);
    expect(clock.textContent).toBe('23:42');
    header.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('Sound- und CRT-Schalter: aria-pressed, setPref über togglePref, Ereignis', async () => {
    header.mount(route('#/home'));
    await flush();
    const sound = document.querySelector('.lfx-retro-switch--sound');
    const crt = document.querySelector('.lfx-retro-switch--crt');
    expect(sound.getAttribute('aria-pressed')).toBe('false'); // Standard aus
    expect(crt.getAttribute('aria-pressed')).toBe('true'); // Standard an
    const seen = [];
    const on = (e) => seen.push(e.detail);
    document.addEventListener(PREFS_EVENT, on);
    sound.click();
    crt.click();
    document.removeEventListener(PREFS_EVENT, on);
    expect(seen).toEqual([{ name: 'sound', value: true }, { name: 'crt', value: false }]);
    expect(sound.getAttribute('aria-pressed')).toBe('true');
    expect(crt.getAttribute('aria-pressed')).toBe('false');
    expect(localStorage.getItem('lfx.retro.sound.u1')).toBe('1');
    expect(localStorage.getItem('lfx.retro.crt.u1')).toBe('0');
  });

  it('Navigation meldet emitFx(nav)', async () => {
    header.mount(route('#/home'));
    await flush();
    const names = [];
    const on = (e) => names.push(e.detail.name);
    document.addEventListener(FX_EVENT, on);
    document.querySelector('.lfx-retro-header__link').dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    document.removeEventListener(FX_EVENT, on);
    expect(names).toContain('nav');
  });

  it('Profil-Popover enthält „Design Einstellungen“ (mit Beta-Badge)', async () => {
    header.mount(route('#/home'));
    await flush();
    document.querySelector('.lfx-retro-header__avatar').click();
    await flush();
    expect(profileEntries).toHaveBeenCalledWith(expect.objectContaining({ theme: 'retro' }));
    const pop = document.getElementById('lfx-popover');
    expect(pop.classList.contains('lfx-retro-profile')).toBe(true);
    expect(pop.textContent).toContain('Design Einstellungen');
    expect(pop.querySelector('.lfx-beta')).toBeTruthy();
  });

  it('Profil-Menü bleibt bei viewshow-update offen, schließt nur bei Routenwechsel', async () => {
    header.mount(route('#/home'));
    await flush();
    document.querySelector('.lfx-retro-header__avatar').click();
    await flush();
    const isOpen = () => Boolean(document.querySelector('#lfx-popover.lfx-retro-profile'));
    expect(isOpen()).toBe(true);
    header.update(route('#/home')); // Router: viewshow nach dem Neuladen, gleiche Route
    header.update(route('#/home'));
    expect(isOpen()).toBe(true);
    header.update(route('#/home?tab=1')); // echte Routenänderung
    expect(isOpen()).toBe(false);
  });

  it('Scrollen setzt is-scrolled', async () => {
    header.mount(route('#/home'));
    await flush();
    const el = document.getElementById('lfx-retro-header');
    expect(el.classList.contains('is-scrolled')).toBe(false);
    window.scrollY = 200;
    window.dispatchEvent(new Event('scroll'));
    vi.advanceTimersByTime(5);
    expect(el.classList.contains('is-scrolled')).toBe(true);
    window.scrollY = 0;
  });

  it('unmount räumt vollständig auf (Mount, html-Klasse, Popover, Timer)', async () => {
    header.mount(route('#/home'));
    await flush();
    header.unmount();
    expect(document.getElementById('lfx-retro-header')).toBeNull();
    expect([...html.classList].filter((c) => c.startsWith('lfx-retro-'))).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('unmount schließt das offene Profil-Popover', async () => {
    header.mount(route('#/home'));
    await flush();
    document.querySelector('.lfx-retro-header__avatar').click();
    await flush();
    expect(document.getElementById('lfx-popover')).toBeTruthy();
    header.unmount();
    expect(document.getElementById('lfx-popover')).toBeNull();
  });
});
