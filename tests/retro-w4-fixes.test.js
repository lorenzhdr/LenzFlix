// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const themeState = vi.hoisted(() => ({ id: 'retro' }));
const lay = vi.hoisted(() => ({ narrow: true }));
vi.mock('../src/js/core/theme.js', () => ({
  getTheme: () => themeState.id,
  isTheme: (id) => themeState.id === id,
  brandName: () => 'LENZ//84',
}));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    isReady: () => true,
    getUserId: () => 'u1',
    getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }),
    getItems: vi.fn(),
    getJson: vi.fn(),
  };
});
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false, isMobile: () => false, isNarrow: () => lay.narrow }));
vi.mock('../src/js/shared/search.js', () => ({ searchItems: vi.fn(), getGenreTiles: vi.fn() }));
vi.mock('../src/js/shared/collections.js', () => ({ getCollections: vi.fn() }));
vi.mock('../src/js/shared/libraries.js', () => ({
  getLibraries: vi.fn().mockResolvedValue([{ id: 'lib1', name: 'Filme', collectionType: 'movies', href: '#/movies', hubCapable: true }]),
}));
vi.mock('../src/js/shared/profile.js', () => ({ getUserChip: vi.fn(async () => ({ name: 'Lena', imageUrl: null })), profileEntries: vi.fn(async () => []) }));

import search from '../src/js/features/retro/search.js';
import browse from '../src/js/features/retro/browse.js';
import header from '../src/js/features/retro/header.js';
import { parseHash } from '../src/js/core/router.js';
import * as api from '../src/js/core/api.js';
import { searchItems, getGenreTiles } from '../src/js/shared/search.js';
import { getCollections } from '../src/js/shared/collections.js';

const route = (hash) => parseHash(hash);
const flush = async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); };
const mk = (n) => Array.from({ length: n }, (_, i) => ({ Id: `i${i}`, Name: `Titel ${i}`, Type: 'Movie' }));

beforeEach(() => {
  themeState.id = 'retro';
  window.scrollTo = vi.fn();
  window.localStorage.clear();
  document.documentElement.className = '';
  document.body.innerHTML = '<header class="MuiAppBar-root"></header><div id="indexPage"><div id="homeTab"><div class="sections">nativ</div></div></div>';
});
afterEach(() => { search.unmount(); browse.unmount(); header.unmount(); document.body.innerHTML = ''; });

describe('R12 retro-search update() erhält die Auswahl', () => {
  it('Marke/Auswahl bleibt bei gleichem Begriff', async () => {
    vi.mocked(searchItems).mockReset().mockResolvedValue({ movies: [], series: [], episodes: [], people: [] });
    vi.mocked(getGenreTiles).mockReset().mockResolvedValue([]);
    vi.mocked(getCollections).mockReset().mockResolvedValue([]);
    vi.mocked(api.getItems).mockReset().mockResolvedValue({ Items: [] });
    search.mount(route('#/home?lfx=search&q=harry'));
    await flush();
    const input = document.querySelector('.lfx-rs__input');
    input.setSelectionRange(1, 3);
    search.update(route('#/home?lfx=search&q=harry'));
    expect(input.selectionStart).toBe(1);
    expect(input.selectionEnd).toBe(3);
  });
});

describe('R13 retro-browse zeichnet beim Drehen neu', () => {
  it('Quer statt Hoch: nur Listenzeilen', async () => {
    window.localStorage.setItem('lfx.retro.browseview', 'list');
    api.getJson.mockReset().mockResolvedValue({ Items: [] });
    api.getItems.mockReset().mockResolvedValue({ Items: mk(3), TotalRecordCount: 3 });
    lay.narrow = true;
    browse.mount(route('#/home?lfx=browse&lib=lib1'));
    await flush();
    expect(document.querySelectorAll('.lfx-retro-card').length).toBe(3);
    lay.narrow = false;
    browse.update(route('#/home?lfx=browse&lib=lib1'));
    expect(document.querySelectorAll('.lfx-rb__row').length).toBe(3);
    expect(document.querySelectorAll('.lfx-retro-card').length).toBe(0);
    expect(document.querySelector('.lfx-rb__grid').classList.contains('is-list')).toBe(true);
    lay.narrow = true;
    browse.update(route('#/home?lfx=browse&lib=lib1'));
    expect(document.querySelectorAll('.lfx-rb__row').length).toBe(0);
    expect(document.querySelector('.lfx-rb__grid').classList.contains('is-list')).toBe(false);
  });
});

describe('P16 retro-header scrollt nach Klick nach oben', () => {
  it('Klick auf Link + neue Route: scrollTo(0,0)', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
    header.mount(route('#/home'));
    await flush();
    const a = document.querySelector('.lfx-retro-header nav a');
    a.addEventListener('click', (e) => e.preventDefault());
    a.click();
    window.scrollTo.mockClear();
    header.update(route('#/home?lfx=new'));
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });
  it('ohne Klick (Zurück) bleibt die Position', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: 1280 });
    header.mount(route('#/home'));
    await flush();
    window.scrollTo.mockClear();
    header.update(route('#/home?lfx=new'));
    expect(window.scrollTo).not.toHaveBeenCalled();
  });
});

describe('P18 Kanal-Badges eckig auch im Handy-Layout', () => {
  it('Phone-Overrides mit ausreichender Spezifität', async () => {
    const fs = await import('node:fs');
    const css = fs.readFileSync('src/css/themes/retro/tvmode.css', 'utf8');
    for (const parent of ['epg-chan', 'row-logo']) {
      const sel = `.lfx-tvm.is-phone .lfx-tvm__${parent} .lfx-tvm__chan-badge { border-radius: 0; }`;
      const line = css.split(/\r?\n/).find((l) => l.includes(sel));
      expect(line).toBeTruthy();
      const classes = (line.split('{')[0].match(/\.[\w-]+/g) || []).length;
      expect(classes).toBeGreaterThanOrEqual(7);
    }
  });
});

describe('P17 retro-search Eingabemarke bleibt bei langen Begriffen konsistent', () => {
  it('--rs-pos ungekappt, --rs-scroll folgt scroll, nach unmount ohne Wirkung', async () => {
    vi.mocked(searchItems).mockReset().mockResolvedValue({ movies: [], series: [], episodes: [], people: [] });
    vi.mocked(getGenreTiles).mockReset().mockResolvedValue([]);
    vi.mocked(getCollections).mockReset().mockResolvedValue([]);
    vi.mocked(api.getItems).mockReset().mockResolvedValue({ Items: [] });
    search.mount(route('#/home?lfx=search'));
    await flush();
    const input = document.querySelector('.lfx-rs__input');
    const cmd = document.querySelector('.lfx-rs__cmd');
    input.value = 'x'.repeat(80);
    input.setSelectionRange(80, 80);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(cmd.style.getPropertyValue('--rs-pos')).toBe('80');
    Object.defineProperty(input, 'scrollLeft', { value: 123, configurable: true });
    input.dispatchEvent(new Event('scroll'));
    expect(cmd.style.getPropertyValue('--rs-scroll')).toBe('123px');
    search.unmount();
    Object.defineProperty(input, 'scrollLeft', { value: 7, configurable: true });
    input.dispatchEvent(new Event('scroll'));
    expect(cmd.style.getPropertyValue('--rs-scroll')).toBe('123px');
  });
});
