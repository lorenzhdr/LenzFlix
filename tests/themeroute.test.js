// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let theme = 'flix';
let views = { Items: [{ Id: 'lib1', CollectionType: 'movies' }] };

vi.mock('../src/js/core/theme.js', () => ({ isTheme: (id) => theme === id }));
vi.mock('../src/js/core/api.js', () => ({
  getViews: vi.fn(async () => views),
  getAuth: () => ({ serverId: 'srv1' }),
}));

import themeroute from '../src/js/features/themeroute.js';
import { parseHash } from '../src/js/core/router.js';

const route = (h) => parseHash(h);
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  theme = 'flix';
  window.location.hash = '#/home';
});
afterEach(() => {
  themeroute.unmount();
});

describe('themeroute', () => {
  it('match nur bei flix und lfx=title|hub|browse|search', () => {
    expect(themeroute.match(route('#/home?lfx=title&id=1'))).toBe(true);
    expect(themeroute.match(route('#/home?lfx=hub&lib=1'))).toBe(true);
    expect(themeroute.match(route('#/home?lfx=browse&lib=1'))).toBe(true);
    expect(themeroute.match(route('#/home?lfx=search'))).toBe(true);
    expect(themeroute.match(route('#/home?lfx=new'))).toBe(false);
    expect(themeroute.match(route('#/home'))).toBe(false);
    theme = 'plus';
    expect(themeroute.match(route('#/home?lfx=title&id=1'))).toBe(false);
  });

  it('title -> #/details?id=...; ersetzt ohne History-Eintrag', () => {
    const before = window.history.length;
    const r = route('#/home?lfx=title&id=abc');
    window.location.hash = '#/home?lfx=title&id=abc';
    const len = window.history.length;
    themeroute.mount(r);
    expect(window.location.hash).toBe('#/details?id=abc&serverId=srv1');
    expect(window.history.length).toBe(len);
    expect(len).toBeGreaterThanOrEqual(before);
  });

  it('hub -> #/home, search -> #/search?query=', () => {
    window.location.hash = '#/home?lfx=hub&lib=1';
    themeroute.mount(route('#/home?lfx=hub&lib=1'));
    expect(window.location.hash).toBe('#/home');
    themeroute.unmount();
    window.location.hash = '#/home?lfx=search&q=a%20b';
    themeroute.mount(route('#/home?lfx=search&q=a%20b'));
    expect(window.location.hash).toBe('#/search?query=a%20b');
    themeroute.unmount();
    window.location.hash = '#/home?lfx=search';
    themeroute.mount(route('#/home?lfx=search'));
    expect(window.location.hash).toBe('#/search');
  });

  it('browse -> native Bibliotheksansicht (wie nav.js viewUrl)', async () => {
    window.location.hash = '#/home?lfx=browse&lib=lib1&genre=g';
    themeroute.mount(route('#/home?lfx=browse&lib=lib1&genre=g'));
    await flush();
    expect(window.location.hash).toBe('#/movies?topParentId=lib1&collectionType=movies');
  });

  it('browse: unbekannte Bibliothek -> #/home; Route inzwischen gewechselt -> keine Umleitung', async () => {
    window.location.hash = '#/home?lfx=browse&lib=nope';
    themeroute.mount(route('#/home?lfx=browse&lib=nope'));
    await flush();
    expect(window.location.hash).toBe('#/home');
    themeroute.unmount();
    window.location.hash = '#/home?lfx=browse&lib=lib1';
    themeroute.mount(route('#/home?lfx=browse&lib=lib1'));
    window.location.hash = '#/tv';
    await flush();
    expect(window.location.hash).toBe('#/tv');
  });

  it('update leitet dieselbe Route nicht doppelt um', () => {
    window.location.hash = '#/home?lfx=hub&lib=1';
    const r = route('#/home?lfx=hub&lib=1');
    themeroute.mount(r);
    expect(window.location.hash).toBe('#/home');
    window.location.hash = '#/home?lfx=hub&lib=1';
    themeroute.update(r);
    expect(window.location.hash).toBe('#/home?lfx=hub&lib=1');
  });
});

describe('themeroute im Design store', () => {
  it('match nur bei hub|browse; title/search/new/classic bleiben der 3D-Videothek', () => {
    theme = 'store';
    expect(themeroute.match(route('#/home?lfx=hub&lib=1'))).toBe(true);
    expect(themeroute.match(route('#/home?lfx=browse&lib=1'))).toBe(true);
    expect(themeroute.match(route('#/home?lfx=title&id=1'))).toBe(false);
    expect(themeroute.match(route('#/home?lfx=search'))).toBe(false);
    expect(themeroute.match(route('#/home?lfx=new'))).toBe(false);
    expect(themeroute.match(route('#/home?lfx=classic'))).toBe(false);
    expect(themeroute.match(route('#/home'))).toBe(false);
  });

  it('hub/browse -> native Bibliothek, ohne bzw. mit unbekannter Bibliothek -> klassische Startseite', async () => {
    theme = 'store';
    window.location.hash = '#/home?lfx=hub&lib=lib1';
    themeroute.mount(route('#/home?lfx=hub&lib=lib1'));
    await flush();
    expect(window.location.hash).toBe('#/movies?topParentId=lib1&collectionType=movies');
    themeroute.unmount();
    window.location.hash = '#/home?lfx=browse&lib=nope';
    themeroute.mount(route('#/home?lfx=browse&lib=nope'));
    await flush();
    expect(window.location.hash).toBe('#/home?lfx=classic');
    themeroute.unmount();
    window.location.hash = '#/home?lfx=browse';
    themeroute.mount(route('#/home?lfx=browse'));
    expect(window.location.hash).toBe('#/home?lfx=classic');
  });

  describe('TV-Modus (lfx=tv)', () => {
    afterEach(() => document.documentElement.classList.remove('layout-tv'));

    it('match nur unter retro/store/live und layout-tv; flix/plus/prime nie', () => {
      const r = route('#/home?lfx=tv');
      for (const t of ['flix', 'plus', 'prime']) {
        theme = t;
        expect(themeroute.match(r)).toBe(false);
      }
      for (const t of ['retro', 'store', 'live']) {
        theme = t;
        expect(themeroute.match(r)).toBe(true);
      }
      theme = 'flix';
      document.documentElement.classList.add('layout-tv');
      expect(themeroute.match(r)).toBe(true);
    });

    it.each(['retro', 'store', 'live'])('%s: lfx=tv -> #/home (replace, ohne neuen History-Eintrag)', (t) => {
      theme = t;
      window.location.hash = '#/home?lfx=tv';
      const before = window.history.length;
      themeroute.mount(route('#/home?lfx=tv'));
      expect(window.location.hash).toBe('#/home');
      expect(window.history.length).toBe(before);
    });

    it('layout-tv: lfx=tv -> #/home', () => {
      document.documentElement.classList.add('layout-tv');
      window.location.hash = '#/home?lfx=tv';
      themeroute.mount(route('#/home?lfx=tv'));
      expect(window.location.hash).toBe('#/home');
    });
  });
});
