// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const th = vi.hoisted(() => ({ retro: false }));
vi.mock('../src/js/core/theme.js', () => ({
  getTheme: () => (th.retro ? 'retro' : 'flix'),
  isTheme: (id) => (id === 'retro' ? th.retro : id === 'flix' ? !th.retro : false),
  brandName: () => 'LENZFLIX',
}));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, isReady: () => true, getUserId: () => 'u1', getItems: vi.fn() };
});
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isMobile: () => false }));
vi.mock('../src/js/core/itemmenu.js', () => ({ onItemsChanged: () => () => {} }));

import mylist from '../src/js/features/mylist.js';
import { parseHash } from '../src/js/core/router.js';
import * as api from '../src/js/core/api.js';

const route = (hash) => parseHash(hash);
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };

beforeEach(() => {
  th.retro = false;
  vi.stubGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} });
  document.documentElement.className = '';
  document.body.innerHTML = '<div id="indexPage"><div id="homeTab"></div></div>';
  api.getItems.mockReset();
  api.getItems.mockResolvedValue({ Items: [], TotalRecordCount: 0 });
});
afterEach(() => {
  mylist.unmount();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('mylist: Designwechsel flix <-> retro', () => {
  it('update() nach Designwechsel baut Titel, Wurzelklasse und html-Klasse neu auf', async () => {
    mylist.mount(route('#/home?lfx=mylist'));
    await flush();
    const root = document.getElementById('lfx-mylist');
    expect(root.querySelector('.lfx-ml__title').textContent).toBe('Meine Liste');
    th.retro = true;
    mylist.update(route('#/home?lfx=mylist'));
    await flush();
    const now = document.getElementById('lfx-mylist');
    expect(now.classList.contains('lfx-retro-page')).toBe(true);
    expect(now.querySelector('.lfx-ml__title').textContent).toContain('LENZ84');
    expect(document.documentElement.classList.contains('lfx-retro-page-on')).toBe(true);
    th.retro = false;
    mylist.update(route('#/home?lfx=mylist'));
    await flush();
    expect(document.getElementById('lfx-mylist').classList.contains('lfx-retro-page')).toBe(false);
    expect(document.documentElement.classList.contains('lfx-retro-page-on')).toBe(false);
  });
});

describe('mylist: Leertext je Filter', () => {
  it('Filter ohne Treffer zeigt filterbezogenen Text mit Link „Alle anzeigen“', async () => {
    mylist.mount(route('#/home?lfx=mylist&type=movies'));
    await flush();
    const empty = document.querySelector('.lfx-ml__empty');
    expect(empty.hidden).toBe(false);
    expect(empty.querySelector('.lfx-ml__empty-title').textContent).toBe('Keine Filme in deiner Liste');
    const link = empty.querySelector('.lfx-ml__empty-link');
    expect(link.textContent).toBe('Alle anzeigen');
    expect(link.getAttribute('href')).toBe('#/home?lfx=mylist');
  });
  it('ohne Filter bleibt „Deine Liste ist leer“', async () => {
    mylist.mount(route('#/home?lfx=mylist'));
    await flush();
    expect(document.querySelector('.lfx-ml__empty-title').textContent).toBe('Deine Liste ist leer');
    expect(document.querySelector('.lfx-ml__empty-link').getAttribute('href')).toBe('#/home');
  });
});
