// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const themeState = vi.hoisted(() => ({ id: 'flix' }));
vi.mock('../src/js/core/theme.js', () => ({
  getTheme: () => themeState.id,
  isTheme: (id) => themeState.id === id,
  brandName: () => 'LENZFLIX',
}));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, isReady: () => true, getUserId: () => 'u1', getItems: vi.fn() };
});
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isMobile: () => false }));

import mylist from '../src/js/features/mylist.js';
import { parseHash } from '../src/js/core/router.js';
import * as api from '../src/js/core/api.js';

const route = (hash) => parseHash(hash);
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const mk = (n) => Array.from({ length: n }, (_, i) => ({ Id: `i${i}`, Name: `Titel ${i}`, Type: 'Movie', ProductionYear: 2000 + i }));
const html = () => document.documentElement;
const lastCall = () => api.getItems.mock.calls.at(-1)[0];

beforeEach(() => {
  themeState.id = 'flix';
  html().className = '';
  document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections">nativ</div></div></div>';
  api.getItems.mockReset();
  api.getItems.mockResolvedValue({ Items: mk(3), TotalRecordCount: 3 });
});
afterEach(() => { vi.restoreAllMocks(); mylist.unmount(); document.body.innerHTML = ''; });

describe('mylist', () => {
  it('match nur auf der Route und nur flix/retro', () => {
    const r = route('#/home?lfx=mylist');
    expect(mylist.match(r)).toBe(true);
    expect(mylist.match(route('#/home'))).toBe(false);
    expect(mylist.match(route('#/home?lfx=new'))).toBe(false);
    themeState.id = 'retro';
    expect(mylist.match(r)).toBe(true);
    for (const id of ['plus', 'prime', 'store']) {
      themeState.id = id;
      expect(mylist.match(r)).toBe(false);
    }
  });

  it('mountet als erstes Kind von #homeTab mit Klasse, Titel und Zähler', async () => {
    mylist.mount(route('#/home?lfx=mylist'));
    await flush();
    const root = document.querySelector('#homeTab > #lfx-mylist');
    expect(root).toBe(document.getElementById('homeTab').firstElementChild);
    expect(html().classList.contains('lfx-mylist-on')).toBe(true);
    expect(root.querySelector('.lfx-ml__title').textContent).toBe('Meine Liste');
    expect(root.querySelector('.lfx-ml__count').textContent).toBe('3 Titel');
    expect(root.querySelectorAll('.lfx-card').length).toBe(3);
  });

  it('Query und Sortierung je type', async () => {
    mylist.mount(route('#/home?lfx=mylist'));
    await flush();
    expect(lastCall()).toMatchObject({ IncludeItemTypes: 'Movie,Series', Filters: 'IsFavorite', SortBy: 'SortName', SortOrder: 'Ascending' });
    mylist.update(route('#/home?lfx=mylist&type=movies'));
    await flush();
    expect(lastCall()).toMatchObject({ IncludeItemTypes: 'Movie', Filters: 'IsFavorite' });
    mylist.update(route('#/home?lfx=mylist&type=series&sort=year'));
    await flush();
    expect(lastCall()).toMatchObject({ IncludeItemTypes: 'Series', SortBy: 'ProductionYear,SortName' });
    mylist.update(route('#/home?lfx=mylist&type=series&sort=new'));
    await flush();
    expect(lastCall()).toMatchObject({ IncludeItemTypes: 'Series', SortBy: 'DateLastContentAdded', SortOrder: 'Descending' });
    expect(document.querySelectorAll('#lfx-mylist').length).toBe(1);
  });

  it('Chips und Sortierung: aktiv markiert, Links mit myListHref', async () => {
    mylist.mount(route('#/home?lfx=mylist&type=series&sort=year'));
    await flush();
    const active = document.querySelector('.lfx-ml__chip.is-active');
    expect(active.textContent).toBe('Serien');
    expect(active.getAttribute('aria-current')).toBe('true');
    expect(document.querySelector('.lfx-ml__chip[data-type=""]').getAttribute('href')).toBe('#/home?lfx=mylist&sort=year');
    const sort = document.querySelector('.lfx-ml__sort.is-active');
    expect(sort.textContent).toBe('Erscheinungsjahr');
    expect(document.querySelector('.lfx-ml__sort[data-sort="az"]').getAttribute('href')).toBe('#/home?lfx=mylist&type=series');
  });

  it('Leerzustand', async () => {
    api.getItems.mockResolvedValue({ Items: [], TotalRecordCount: 0 });
    mylist.mount(route('#/home?lfx=mylist'));
    await flush();
    const empty = document.querySelector('.lfx-ml__empty');
    expect(empty.hidden).toBe(false);
    expect(empty.textContent).toContain('Deine Liste ist leer');
    expect(empty.textContent).toContain('Mit „+ Meine Liste“ merkst du dir Filme und Serien.');
    expect(empty.querySelector('a').getAttribute('href')).toBe('#/home');
    expect(document.getElementById('lfx-mylist').classList.contains('is-empty')).toBe(true);
  });

  it('retro: Terminal-Kopf, Seitenhülle und Retro-Leerzustand', async () => {
    themeState.id = 'retro';
    api.getItems.mockResolvedValue({ Items: [], TotalRecordCount: 0 });
    mylist.mount(route('#/home?lfx=mylist'));
    await flush();
    const root = document.getElementById('lfx-mylist');
    expect(root.classList.contains('lfx-retro-page')).toBe(true);
    expect(html().classList.contains('lfx-retro-page-on')).toBe(true);
    expect(root.querySelector('.lfx-ml__title').textContent).toContain('C:\\LENZ84\\LISTE>');
    expect(root.querySelector('.lfx-ml__empty-title').textContent).toBe('KEINE BÄNDER GEMERKT');
  });

  it('Aktualisierung: Router-Echo ohne Neuladen, lfx:favorite und späte Wiederholung laden neu', async () => {
    mylist.mount(route('#/home?lfx=mylist'));
    await flush();
    const calls = api.getItems.mock.calls.length;
    mylist.update(route('#/home?lfx=mylist'));
    await flush();
    expect(api.getItems.mock.calls.length).toBe(calls);
    document.dispatchEvent(new CustomEvent('lfx:favorite'));
    await flush();
    expect(api.getItems.mock.calls.length).toBe(calls + 1);
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 10000);
    mylist.update(route('#/home?lfx=mylist'));
    await flush();
    expect(api.getItems.mock.calls.length).toBe(calls + 2);
  });

  it('unmount räumt auf', async () => {
    mylist.mount(route('#/home?lfx=mylist'));
    await flush();
    mylist.unmount();
    expect(document.getElementById('lfx-mylist')).toBeNull();
    expect(html().classList.contains('lfx-mylist-on')).toBe(false);
    const calls = api.getItems.mock.calls.length;
    document.dispatchEvent(new CustomEvent('lfx:favorite'));
    await flush();
    expect(api.getItems.mock.calls.length).toBe(calls);
    themeState.id = 'retro';
    mylist.mount(route('#/home?lfx=mylist'));
    await flush();
    mylist.unmount();
    expect(html().classList.contains('lfx-retro-page-on')).toBe(false);
  });
});
