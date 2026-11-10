// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ isReady: () => true, getUserId: () => 'u1' }));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: vi.fn((id) => id === 'retro'), getTheme: () => 'retro', brandName: () => 'LENZ//84' }));
vi.mock('../src/js/shared/libraries.js', () => ({
  getLibraries: vi.fn(async () => [
    { id: 'x1', name: 'Musik', collectionType: 'music', href: '#/music?topParentId=x1', hubCapable: false },
    { id: 't1', name: 'Serien', collectionType: 'tvshows', href: '#/tv?topParentId=t1', hubCapable: true },
    { id: 'm1', name: 'Filme', collectionType: 'movies', href: '#/movies?topParentId=m1', hubCapable: true },
  ]),
}));
vi.mock('../src/js/shared/profile.js', () => ({
  getUserChip: vi.fn(async () => ({ name: 'Lena', imageUrl: null })),
  profileEntries: vi.fn(async () => [
    { key: 'design', label: 'Design Einstellungen', badge: 'Beta', onClick: () => {} },
    { key: 'logout', label: 'Abmelden', onClick: () => {} },
  ]),
}));

import { isTheme } from '../src/js/core/theme.js';
import { parseHash } from '../src/js/core/router.js';
import { closeChooser } from '../src/js/core/sheet.js';
import tabbar, { tabKey, moreEntries } from '../src/js/features/retro/tabbar.js';
import { LOGO_ATTR } from '../src/js/features/retro/prefs.js';

const route = (h) => parseHash(h);
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
const setWidth = (w) => Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: w });
const html = document.documentElement;

beforeEach(() => {
  document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
  html.className = '';
  localStorage.clear();
  isTheme.mockImplementation((id) => id === 'retro');
  setWidth(390);
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 0, 5, 23, 41, 20));
});
afterEach(() => {
  tabbar.unmount();
  closeChooser();
  vi.useRealTimers();
});

describe('retro-tabbar: match', () => {
  it('nur Handy + retro + Modern + nicht TV + nicht Player/Login/Dashboard', () => {
    expect(tabbar.match(route('#/home'))).toBe(true);
    expect(tabbar.match(route('#/video'))).toBe(false);
    expect(tabbar.match(route('#/login'))).toBe(false);
    expect(tabbar.match(route('#/dashboard'))).toBe(false);
    setWidth(800);
    expect(tabbar.match(route('#/home'))).toBe(false);
    setWidth(390);
    isTheme.mockImplementation((id) => id === 'plus');
    expect(tabbar.match(route('#/home'))).toBe(false);
    isTheme.mockImplementation((id) => id === 'prime');
    expect(tabbar.match(route('#/home'))).toBe(false);
    isTheme.mockImplementation((id) => id === 'retro');
    html.classList.add('layout-tv');
    expect(tabbar.match(route('#/home'))).toBe(false);
  });
});

describe('retro-tabbar: Modell', () => {
  it('aktive Taste', () => {
    expect(tabKey(route('#/home'))).toBe('home');
    expect(tabKey(route('#/home?lfx=search'))).toBe('search');
    expect(tabKey(route('#/home?lfx=new'))).toBe('new');
    expect(tabKey(route('#/home?tab=1'))).toBe('list');
    expect(tabKey(route('#/home?lfx=hub&lib=m1'))).toBe('more');
    expect(tabKey(route('#/mypreferencesmenu'))).toBe('more');
    expect(tabKey(route('#/home?lfx=title&id=5'))).toBeNull();
  });
  it('MEHR-Einträge: Filme/Serien zuerst, Profil, Schalter', () => {
    const libs = [
      { id: 'x1', name: 'Musik', collectionType: 'music', href: '#/music', hubCapable: false },
      { id: 'm1', name: 'Filme', collectionType: 'movies', href: '#/movies', hubCapable: true },
    ];
    const go = vi.fn();
    const close = vi.fn();
    const toggle = vi.fn();
    const e = moreEntries(libs, [{ key: 'settings', label: 'Einstellungen', href: '#/mypreferencesmenu' }], { go, close, toggle });
    expect(e.map((x) => x.label)).toEqual(['Filme', 'Musik', 'Einstellungen', 'Sound', 'CRT-Effekt']);
    e[0].onClick();
    expect(close).toHaveBeenCalled();
    expect(go).toHaveBeenCalledWith('#/home?lfx=hub&lib=m1');
    close.mockClear();
    e[3].onClick();
    expect(close).not.toHaveBeenCalled(); // Schalter lassen das Blatt offen
    expect(toggle).toHaveBeenCalledWith('sound');
  });
});

describe('retro-tabbar: Feature', () => {
  it('mount: Kopfzeile (Wortmarke mit LOGO_ATTR + Uhr) und F1–F5, aktive Taste invertiert', async () => {
    tabbar.mount(route('#/home'));
    await flush();
    const top = document.getElementById('lfx-retro-topbar');
    expect(top.querySelector('.lfx-retro-topbar__logo').hasAttribute(LOGO_ATTR)).toBe(true);
    expect(top.querySelector('.lfx-retro-clock').textContent).toBe('23:41');
    const keys = [...document.querySelectorAll('#lfx-retro-tabbar .lfx-retro-fkey')];
    expect(keys.map((k) => k.textContent)).toEqual(['F1START', 'F2SUCHE', 'F3NEU', 'F4LISTE', 'F5MEHR']);
    expect(keys[0].classList.contains('is-active')).toBe(true);
    expect(keys[1].getAttribute('href')).toBe('#/home?lfx=search');
    expect(keys[2].getAttribute('href')).toBe('#/home?lfx=new');
    expect(keys[3].getAttribute('href')).toBe('#/home?tab=1');
    expect(html.classList.contains('lfx-retro-tabbar-on')).toBe(true);
    tabbar.update(route('#/home?tab=1'));
    expect(document.querySelector('.lfx-retro-fkey.is-active').dataset.key).toBe('list');
  });

  it('MEHR öffnet Sheet mit Bibliotheken, Design Einstellungen (Beta) und Schaltern; Schalter toggeln', async () => {
    tabbar.mount(route('#/home'));
    await flush();
    document.querySelector('[data-key="more"]').click();
    await flush();
    const sheet = document.getElementById('lfx-sheet');
    expect(sheet).toBeTruthy();
    const items = [...sheet.querySelectorAll('.lfx-sheet__item')];
    expect(items.map((b) => b.textContent.replace(/\s+/g, ' ').trim())).toEqual([
      'Filme', 'Serien', 'Musik', 'Design EinstellungenBeta', 'Abmelden', 'Sound: AUS', 'CRT-Effekt: AN',
    ]);
    expect(items[3].querySelector('.lfx-beta')).toBeTruthy();
    expect(items[3].getAttribute('aria-label')).toBe('Design Einstellungen (Beta)');
    const sound = items[5];
    expect(sound.getAttribute('aria-pressed')).toBe('false');
    sound.click();
    expect(sound.getAttribute('aria-pressed')).toBe('true');
    expect(sound.textContent).toBe('Sound: AN');
    expect(localStorage.getItem('lfx.retro.sound.u1')).toBe('1');
    expect(document.getElementById('lfx-sheet')).toBeTruthy(); // bleibt offen
    expect(document.querySelector('[data-key="more"]').classList.contains('is-active')).toBe(true);
  });

  it('unmount räumt vollständig auf', async () => {
    tabbar.mount(route('#/home'));
    await flush();
    tabbar.unmount();
    expect(document.getElementById('lfx-retro-tabbar')).toBeNull();
    expect(document.getElementById('lfx-retro-topbar')).toBeNull();
    expect([...html.classList].filter((c) => c.startsWith('lfx-retro-'))).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('unmount schließt das offene MEHR-Blatt', async () => {
    tabbar.mount(route('#/home'));
    await flush();
    document.querySelector('[data-key="more"]').click();
    await flush();
    expect(document.getElementById('lfx-sheet')).toBeTruthy();
    tabbar.unmount();
    expect(document.getElementById('lfx-sheet')).toBeNull();
    expect(html.classList.contains('lfx-sheet-open')).toBe(false);
  });
});
