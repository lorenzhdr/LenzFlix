// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ isReady: () => true, getUserId: () => 'u1' }));
vi.mock('../src/js/core/theme.js', () => ({
  isTheme: vi.fn((id) => id === 'plus'),
  getTheme: () => 'plus',
  brandName: () => 'LENZ+',
}));
const layout = { mobile: true };
vi.mock('../src/js/core/layout.js', () => ({
  isModern: () => true,
  isTv: () => false,
  isMobile: () => layout.mobile,
}));
const libs = [
  { id: 'm1', name: 'Filme', collectionType: 'movies', href: '#/movies?topParentId=m1', hubCapable: true },
  { id: 'x1', name: 'Musik', collectionType: 'music', href: '#/music?topParentId=x1', hubCapable: false },
];
vi.mock('../src/js/shared/libraries.js', () => ({ getLibraries: vi.fn(async () => libs) }));
const designClick = vi.fn();
const logoutClick = vi.fn();
vi.mock('../src/js/shared/profile.js', () => ({
  profileEntries: vi.fn(async () => [
    { key: 'settings', label: 'Einstellungen', href: '#/mypreferencesmenu' },
    { key: 'design', label: 'Design Einstellungen', badge: 'Beta', onClick: designClick },
    { key: 'logout', label: 'Abmelden', onClick: logoutClick },
  ]),
  getUserChip: vi.fn(async () => ({ name: 'Lorenz', imageUrl: null })),
}));
const sheet = { current: null };
vi.mock('../src/js/core/sheet.js', () => ({
  openSheet: vi.fn(() => { sheet.current = { id: 1 }; return sheet.current; }),
  renderSheet: vi.fn(),
  closeChooser: vi.fn(() => { sheet.current = null; }),
  isCurrent: vi.fn((c) => c !== null && c === sheet.current),
}));

import tabbar, { tabKey, sheetEntries, isVideoHash } from '../src/js/features/plus/tabbar.js';
import { parseHash } from '../src/js/core/router.js';
import { isTheme } from '../src/js/core/theme.js';
import * as sheetMod from '../src/js/core/sheet.js';

const R = (h) => parseHash(h);
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('plus-tabbar: Modell', () => {
  it('aktiver Tab aus der Route', () => {
    expect(tabKey(R('#/home'))).toBe('home');
    expect(tabKey(R('#/home?lfx=hub&lib=m1'))).toBe('home');
    expect(tabKey(R('#/home?tab=1'))).toBe('list');
    expect(tabKey(R('#/home?lfx=search'))).toBe('search');
    expect(tabKey(R('#/home?lfx=new'))).toBe('profile');
    expect(tabKey(R('#/mypreferencesmenu'))).toBe('profile');
    expect(tabKey(R('#/home?lfx=title&id=1'))).toBeNull();
    expect(tabKey(R('#/movies?topParentId=m1'))).toBeNull();
  });

  it('Profil-Blatt: Neu & beliebt, Bibliotheken, Profil-Einträge; jede Aktion schließt zuerst', () => {
    const calls = [];
    const go = (h) => calls.push(`go:${h}`);
    const close = () => calls.push('close');
    const act = vi.fn(() => calls.push('act'));
    const entries = sheetEntries(libs, [
      { label: 'Einstellungen', href: '#/mypreferencesmenu' },
      { label: 'Design Einstellungen', onClick: act },
    ], { go, close });
    expect(entries.map((e) => e.label)).toEqual(['Neu & beliebt', 'Filme', 'Musik', 'Einstellungen', 'Design Einstellungen']);
    entries[0].onClick();
    entries[1].onClick();
    entries[2].onClick();
    entries[4].onClick();
    expect(calls).toEqual([
      'close', 'go:#/home?lfx=new',
      'close', 'go:#/home?lfx=hub&lib=m1',
      'close', 'go:#/music?topParentId=x1',
      'close', 'act',
    ]);
  });
});

describe('plus-tabbar: Feature', () => {
  beforeEach(() => {
    document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
    isTheme.mockImplementation((id) => id === 'plus');
    layout.mobile = true;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    sheet.current = null;
    vi.clearAllMocks();
  });
  afterEach(() => {
    tabbar.unmount();
    document.documentElement.className = '';
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  });

  it('match: nur mobil + plus, nicht in Player/Login', () => {
    expect(tabbar.match(R('#/home'))).toBe(true);
    expect(tabbar.match(R('#/video'))).toBe(false);
    expect(tabbar.match(R('#/login'))).toBe(false);
    expect(tabbar.match(R('#/dashboard'))).toBe(false);
    isTheme.mockImplementation((id) => id === 'flix');
    expect(tabbar.match(R('#/home'))).toBe(false);
    isTheme.mockImplementation((id) => id === 'plus');
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    layout.mobile = false;
    expect(tabbar.match(R('#/home'))).toBe(false);
  });

  it('mount: vier Tabs mit aria-label, html-Klasse, aktiver Tab; update wechselt', () => {
    tabbar.mount(R('#/home'));
    const root = document.getElementById('lfx-plus-tabbar');
    expect(root).toBeTruthy();
    expect(root.parentElement).toBe(document.body);
    const tabs = [...root.querySelectorAll('[data-key]')];
    expect(tabs.map((t) => t.dataset.key)).toEqual(['home', 'list', 'search', 'profile']);
    expect(tabs.map((t) => t.getAttribute('aria-label'))).toEqual(['Startseite', 'Meine Liste', 'Suche', 'Profil']);
    expect(tabs[0].getAttribute('href')).toBe('#/home');
    expect(tabs[1].getAttribute('href')).toBe('#/home?tab=1');
    expect(tabs[2].getAttribute('href')).toBe('#/home?lfx=search');
    expect(document.documentElement.classList.contains('lfx-plus-tabbar-on')).toBe(true);
    expect(root.querySelector('.is-active').dataset.key).toBe('home');
    tabbar.update(R('#/home?tab=1'));
    expect(root.querySelector('.is-active').dataset.key).toBe('list');
    tabbar.update(R('#/home?lfx=search'));
    expect(root.querySelector('.is-active').dataset.key).toBe('search');
    tabbar.update(R('#/home?lfx=title&id=2'));
    expect(root.querySelector('.is-active')).toBeNull();
  });

  it('hashchange nach /video blendet die Leiste sofort aus (Klasse), zurück blendet ein; unmount räumt auf', () => {
    tabbar.mount(R('#/home'));
    const cl = document.documentElement.classList;
    window.location.hash = '#/video';
    window.dispatchEvent(new Event('hashchange'));
    expect(cl.contains('lfx-plus-tabbar-hide')).toBe(true);
    window.location.hash = '#/home';
    window.dispatchEvent(new Event('hashchange'));
    expect(cl.contains('lfx-plus-tabbar-hide')).toBe(false);
    window.location.hash = '#/video';
    window.dispatchEvent(new Event('hashchange'));
    tabbar.unmount();
    expect(cl.contains('lfx-plus-tabbar-hide')).toBe(false);
    window.location.hash = '#/home';
  });

  it('isVideoHash erkennt nur den Player', () => {
    expect(isVideoHash('#/video')).toBe(true);
    expect(isVideoHash('#/video?x=1')).toBe(true);
    expect(isVideoHash('#/videos')).toBe(false);
    expect(isVideoHash('#/home')).toBe(false);
  });

  it('Avatar zeigt Initial ohne Profilbild', async () => {
    tabbar.mount(R('#/home'));
    await flush();
    expect(document.querySelector('.lfx-plus-tabbar__avatar').textContent).toBe('L');
  });

  it('Profil-Tab öffnet das Sheet mit Einträgen; zweiter Klick schließt', async () => {
    tabbar.mount(R('#/home'));
    const btn = document.querySelector('[data-key="profile"]');
    btn.click();
    await flush();
    expect(sheetMod.openSheet).toHaveBeenCalledTimes(1);
    const [, title, entries] = sheetMod.renderSheet.mock.calls[0];
    expect(title).toBe('Lorenz');
    expect(entries.map((e) => e.label)).toEqual(['Neu & beliebt', 'Filme', 'Musik', 'Einstellungen', 'Design Einstellungen', 'Abmelden']);
    expect(entries.find((e) => e.label === 'Design Einstellungen').badge).toBe('Beta');
    btn.click();
    await flush();
    expect(sheetMod.closeChooser).toHaveBeenCalled();
    expect(sheetMod.openSheet).toHaveBeenCalledTimes(1);
  });

  it('Routenwechsel schließt ein offenes Blatt', async () => {
    tabbar.mount(R('#/home'));
    document.querySelector('[data-key="profile"]').click();
    await flush();
    tabbar.update(R('#/home?tab=1'));
    expect(sheetMod.closeChooser).toHaveBeenCalled();
  });

  it('Tastatur: Fokus im Eingabefeld setzt lfx-plus-kb, Verlassen entfernt es', () => {
    tabbar.mount(R('#/home?lfx=search'));
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(document.documentElement.classList.contains('lfx-plus-kb')).toBe(true);
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    expect(document.documentElement.classList.contains('lfx-plus-kb')).toBe(false);
  });

  it('unmount räumt Mount, Klassen und Listener auf', () => {
    tabbar.mount(R('#/home'));
    tabbar.unmount();
    expect(document.getElementById('lfx-plus-tabbar')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-plus-tabbar-on')).toBe(false);
    const input = document.createElement('input');
    document.body.append(input);
    input.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    expect(document.documentElement.classList.contains('lfx-plus-kb')).toBe(false);
  });
});
