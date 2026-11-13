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

import nav from '../src/js/features/nav.js';
import { parseHash } from '../src/js/core/router.js';
import { clearCache } from '../src/js/core/cache.js';

const rect = (left, width) => ({ left, right: left + width, width, top: 0, bottom: 0, height: 0 });
// Jeder sichtbare Punkt 100 px breit, Leiste beginnt bei 100, Mehr 100 px; Symbolgruppe beginnt bei `iconsLeft`
let iconsLeft = 1000;
let spy;

function setup(width) {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  document.body.innerHTML = '<header class="MuiAppBar-root"><div class="MuiToolbar-root"><button class="MuiIconButton-root" id="ic"></button></div></header>';
  spy = vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function () {
    if (this.id === 'ic') return rect(iconsLeft, 40);
    if (this.id === 'lfx-nav') return rect(100, 0);
    if (this.classList.contains('lfx-nav__more')) {
      const items = [...document.querySelectorAll('#lfx-nav > .lfx-nav__item:not(.lfx-nav__more-btn)')].filter((e) => !e.hidden);
      return rect(100 + items.length * 100, 100);
    }
    return rect(0, 0);
  });
}

const visible = () => [...document.querySelectorAll('#lfx-nav > .lfx-nav__item:not(.lfx-nav__more-btn)')].filter((e) => !e.hidden).map((e) => e.dataset.key);
const folded = () => [...document.querySelectorAll('.lfx-nav__menu-item--fold')].filter((e) => !e.hidden).map((e) => e.dataset.key);

describe('nav: Einklappen ins Mehr-Menü', () => {
  beforeEach(() => {
    clearCache();
    iconsLeft = 1000;
  });
  afterEach(() => {
    nav.unmount();
    spy.mockRestore();
    document.documentElement.className = '';
    Object.defineProperty(window, 'innerWidth', { value: 1024, configurable: true });
  });

  it('genug Platz: nichts eingeklappt', async () => {
    setup(1400);
    nav.mount(parseHash('#/home'));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-nav__menu-item--fold').length).toBe(4));
    expect(visible()).toEqual(['home', 'series', 'movies', 'new', 'list']);
    expect(folded()).toEqual([]);
  });

  it('klappt von hinten ein: Liste, Neu und beliebt, Filme, Serien; Startseite bleibt', async () => {
    setup(1400);
    nav.mount(parseHash('#/home'));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-nav__menu-item--fold').length).toBe(4));
    const run = (left) => {
      iconsLeft = left;
      window.dispatchEvent(new Event('resize'));
    };
    // Mehr rechts = 100 + n*100 + 100; Limit = iconsLeft - 16
    run(700); // Limit 684: fünf Punkte (Mehr endet bei 700) passen nicht, vier (600) schon
    await vi.waitFor(() => expect(visible()).toEqual(['home', 'series', 'movies', 'new']));
    expect(folded()).toEqual(['list']);
    run(520);
    await vi.waitFor(() => expect(visible()).toEqual(['home', 'series', 'movies']));
    expect(folded()).toEqual(['new', 'list']);
    run(300);
    await vi.waitFor(() => expect(visible()).toEqual(['home']));
    expect(folded()).toEqual(['series', 'movies', 'new', 'list']);
    run(50);
    await vi.waitFor(() => expect(visible()).toEqual(['home']));
    // Menü: eingeklappte Punkte stehen vor den weiteren Bibliotheken
    const items = [...document.querySelectorAll('.lfx-nav__menu [role="menuitem"]')];
    expect(items.slice(0, 4).every((e) => e.classList.contains('lfx-nav__menu-item--fold'))).toBe(true);
    // Mehr wieder aus
    run(1000);
    await vi.waitFor(() => expect(visible()).toEqual(['home', 'series', 'movies', 'new', 'list']));
    expect(folded()).toEqual([]);
  });

  it('aktiver eingeklappter Punkt markiert Menü-Eintrag und „Mehr“', async () => {
    iconsLeft = 300;
    setup(1400);
    nav.mount(parseHash('#/home?tab=1'));
    await vi.waitFor(() => expect(visible()).toEqual(['home']));
    const entry = document.querySelector('.lfx-nav__menu-item--fold[data-key="list"]');
    expect(entry.hidden).toBe(false);
    expect(entry.classList.contains('is-active')).toBe(true);
    expect(document.querySelector('.lfx-nav__more-btn').classList.contains('is-active')).toBe(true);
  });

  it('ohne rechte Symbole: Fensterbreite minus Reserve; unmount räumt auf', async () => {
    setup(1400);
    document.getElementById('ic').remove();
    nav.mount(parseHash('#/home'));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-nav__menu-item--fold').length).toBe(4));
    expect(folded()).toEqual([]);
    const rm = vi.spyOn(window, 'removeEventListener');
    nav.unmount();
    expect(rm).toHaveBeenCalledWith('resize', expect.any(Function));
    expect(document.getElementById('lfx-nav')).toBeNull();
    rm.mockRestore();
  });

  it('unter 900 px nichts einklappen (Leiste ist ausgeblendet)', async () => {
    iconsLeft = 100;
    setup(850);
    nav.mount(parseHash('#/home'));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-nav__menu-item--fold').length).toBe(4));
    expect(folded()).toEqual([]);
  });
});
