// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let viewItems = [];
vi.mock('../src/js/core/api.js', () => ({
  getViews: vi.fn(async () => ({ Items: viewItems })),
  getUserId: () => 'u1',
  isReady: () => true,
}));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: vi.fn(() => true), getTheme: () => 'flix' }));
vi.mock('../src/js/core/themepicker.js', () => ({ openThemePicker: vi.fn() }));

import nav from '../src/js/features/nav.js';
import { parseHash } from '../src/js/core/router.js';
import { clearCache } from '../src/js/core/cache.js';

const rect = (left, width) => ({ left, right: left + width, width, top: 0, bottom: 0, height: 0 });
const MV = [{ Id: 'm1', Name: 'Filme', CollectionType: 'movies' }, { Id: 't1', Name: 'Serien', CollectionType: 'tvshows' }];
const MUSIC = { Id: 'x1', Name: 'Musik', CollectionType: 'music' };
const PROFILE = '<button aria-haspopup="true" aria-controls="app-user-menu" id="prof"><div class="MuiAvatar-root"></div></button>';
let iconsLeft = 1000;
let spy;

function setup(withProfile) {
  Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true });
  document.body.innerHTML = `<header class="MuiAppBar-root"><div class="MuiToolbar-root"><button class="MuiIconButton-root" id="ic"></button>${withProfile ? PROFILE : ''}</div></header>`;
  spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.id === 'ic') return rect(iconsLeft, 40);
    if (this.id === 'lfx-nav') return rect(100, 0);
    if (this.classList.contains('lfx-nav__more')) {
      const items = [...document.querySelectorAll('#lfx-nav > .lfx-nav__item:not(.lfx-nav__more-btn)')].filter((e) => !e.hidden);
      return rect(100 + items.length * 100, this.hidden ? 0 : 100);
    }
    return rect(0, 0);
  });
}

const wrap = () => document.querySelector('.lfx-nav__more');
const account = () => [...document.querySelectorAll('.lfx-nav__menu-item--account')];
const ready = () => vi.waitFor(() => expect(document.querySelectorAll('.lfx-nav__menu-item--fold').length).toBe(4));
const mountNav = async () => { nav.mount(parseHash('#/home')); await ready(); await new Promise((r) => setTimeout(r, 0)); };

describe('nav: Konto-Einträge und leeres „Mehr“ mit Profil-Knopf', () => {
  beforeEach(() => { clearCache(); iconsLeft = 1000; viewItems = MV; });
  afterEach(() => {
    nav.unmount();
    spy.mockRestore();
    document.body.innerHTML = '';
    document.documentElement.className = '';
  });

  it('Rückfall ohne Profil-Knopf: Konto-Einträge sichtbar, „Mehr“ sichtbar', async () => {
    setup(false);
    await mountNav();
    expect(account().length).toBeGreaterThanOrEqual(2);
    expect(account().every((e) => !e.hidden)).toBe(true);
    expect(wrap().hidden).toBe(false);
  });

  it('mit Profil-Knopf: Konto-Einträge versteckt, „Mehr“ leer und versteckt', async () => {
    setup(true);
    await mountNav();
    expect(account().every((e) => e.hidden)).toBe(true);
    expect(wrap().hidden).toBe(true);
  });

  it('mit weiteren Bibliotheken bleibt „Mehr“ sichtbar, Konto-Einträge versteckt', async () => {
    viewItems = [...MV, MUSIC];
    setup(true);
    await mountNav();
    expect(wrap().hidden).toBe(false);
    expect(account().every((e) => e.hidden)).toBe(true);
    expect(document.querySelector('.lfx-nav__menu-item[data-id="x1"]').hidden).toBe(false);
  });

  it('eingeklappte Punkte blenden „Mehr“ wieder ein', async () => {
    setup(true);
    await mountNav();
    expect(wrap().hidden).toBe(true);
    iconsLeft = 520;
    window.dispatchEvent(new Event('resize'));
    await vi.waitFor(() => expect(wrap().hidden).toBe(false));
    expect([...document.querySelectorAll('.lfx-nav__menu-item--fold')].some((e) => !e.hidden)).toBe(true);
    iconsLeft = 1000;
    window.dispatchEvent(new Event('resize'));
    await vi.waitFor(() => expect(wrap().hidden).toBe(true));
  });

  it('Profil-Knopf erscheint später: Konto-Einträge verschwinden, „Mehr“ geht weg', async () => {
    setup(false);
    await mountNav();
    expect(wrap().hidden).toBe(false);
    document.querySelector('.MuiToolbar-root').insertAdjacentHTML('beforeend', PROFILE);
    await vi.waitFor(() => expect(wrap().hidden).toBe(true));
    expect(account().every((e) => e.hidden)).toBe(true);
  });

  it('Pfeiltasten überspringen versteckte Einträge', async () => {
    viewItems = [...MV, MUSIC];
    setup(true);
    await mountNav();
    const menuItems = [...document.querySelectorAll('.lfx-nav__menu [role="menuitem"], .lfx-nav__menu [role="menuitemcheckbox"]')].filter((e) => !e.hidden);
    expect(menuItems.map((e) => e.textContent)).toEqual(['Musik']);
    const music = menuItems[0];
    music.focus();
    music.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(document.activeElement).toBe(music);
  });
});
