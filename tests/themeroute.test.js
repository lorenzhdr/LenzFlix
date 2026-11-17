// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let theme = 'flix';
let views = { Items: [{ Id: 'lib1', CollectionType: 'movies' }, { Id: 'lib2', CollectionType: 'tvshows' }, { Id: 'lib3', CollectionType: 'music' }] };

let pendingTheme = false;
vi.mock('../src/js/core/theme.js', () => ({ isTheme: (id) => theme === id, isThemePending: () => pendingTheme }));
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
  pendingTheme = false;
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

  it('hub (unbekannte Bibliothek) -> #/home, search -> #/search?query=', async () => {
    window.location.hash = '#/home?lfx=hub&lib=1';
    themeroute.mount(route('#/home?lfx=hub&lib=1'));
    await flush();
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
    expect(window.location.hash).toBe('#/home?lfx=movies&genre=g');
  });

  it('browse/hub: Serienbibliothek -> Serien-Seite, Musik -> native Ansicht (flix)', async () => {
    window.location.hash = '#/home?lfx=hub&lib=lib2';
    themeroute.mount(route('#/home?lfx=hub&lib=lib2'));
    await flush();
    expect(window.location.hash).toBe('#/home?lfx=series');
    themeroute.unmount();
    window.location.hash = '#/home?lfx=browse&lib=lib3';
    themeroute.mount(route('#/home?lfx=browse&lib=lib3'));
    await flush();
    expect(window.location.hash).toBe('#/music?topParentId=lib3&collectionType=music');
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

  it('update leitet dieselbe Route nicht doppelt um', async () => {
    window.location.hash = '#/home?lfx=hub&lib=1';
    const r = route('#/home?lfx=hub&lib=1');
    themeroute.mount(r);
    await flush();
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

    it('match nur unter store und layout-tv; flix/plus/prime/retro nie', () => {
      const r = route('#/home?lfx=tv');
      for (const t of ['flix', 'plus', 'prime', 'retro']) {
        theme = t;
        expect(themeroute.match(r)).toBe(false);
      }
      for (const t of ['store']) {
        theme = t;
        expect(themeroute.match(r)).toBe(true);
      }
      theme = 'flix';
      document.documentElement.classList.add('layout-tv');
      expect(themeroute.match(r)).toBe(true);
    });

    it.each(['store'])('%s: lfx=tv -> #/home (replace, ohne neuen History-Eintrag)', (t) => {
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

describe('themeroute: Seiten Serien/Filme/Meine Liste (1.13.0)', () => {
  afterEach(() => document.documentElement.classList.remove('layout-tv'));
  const go = (h) => { window.location.hash = h; themeroute.mount(route(h)); };

  it('flix: series|movies|mylist bleiben (match false)', () => {
    for (const k of ['series', 'movies', 'mylist']) expect(themeroute.match(route(`#/home?lfx=${k}`))).toBe(false);
  });

  it('flix und retro: native Favoriten (tab=1) -> Meine Liste', () => {
    for (const t of ['flix', 'retro']) {
      theme = t;
      expect(themeroute.match(route('#/home?tab=1'))).toBe(true);
      go('#/home?tab=1');
      expect(window.location.hash).toBe('#/home?lfx=mylist');
      themeroute.unmount();
    }
    theme = 'plus';
    expect(themeroute.match(route('#/home?tab=1'))).toBe(false);
  });

  it('retro: mylist erlaubt, series/movies -> Hub der ersten passenden Bibliothek', async () => {
    theme = 'retro';
    expect(themeroute.match(route('#/home?lfx=mylist'))).toBe(false);
    expect(themeroute.match(route('#/home?lfx=series'))).toBe(true);
    go('#/home?lfx=series');
    await flush();
    expect(window.location.hash).toBe('#/home?lfx=hub&lib=lib2');
    themeroute.unmount();
    go('#/home?lfx=movies');
    await flush();
    expect(window.location.hash).toBe('#/home?lfx=hub&lib=lib1');
  });

  it('plus/prime: series -> Hub (Fallback #/home), mylist -> #/home?tab=1', async () => {
    for (const t of ['plus', 'prime']) {
      theme = t;
      go('#/home?lfx=series');
      await flush();
      expect(window.location.hash).toBe('#/home?lfx=hub&lib=lib2');
      themeroute.unmount();
      go('#/home?lfx=mylist');
      expect(window.location.hash).toBe('#/home?tab=1');
      themeroute.unmount();
    }
    const saved = views;
    views = { Items: [] };
    go('#/home?lfx=movies');
    await flush();
    expect(window.location.hash).toBe('#/home');
    views = saved;
  });

  it('store: alle drei -> #/home', () => {
    for (const t of ['store']) {
      theme = t;
      for (const k of ['series', 'movies', 'mylist']) {
        go(`#/home?lfx=${k}`);
        expect(window.location.hash).toBe('#/home');
        themeroute.unmount();
      }
    }
    theme = 'flix';
    document.documentElement.classList.add('layout-tv');
    expect(themeroute.match(route('#/home?lfx=series'))).toBe(true);
    go('#/home?lfx=mylist');
    expect(window.location.hash).toBe('#/home');
  });
});

describe('themeroute: vorläufiges LENZFLIX beim ersten Start', () => {
  it('pending: keine Umleitung der Design-Routen, Seiten und Meine-Liste-Tab', () => {
    pendingTheme = true;
    for (const h of ['#/home?lfx=title&id=1', '#/home?lfx=hub&lib=1', '#/home?lfx=browse&lib=1', '#/home?lfx=search', '#/home?lfx=series', '#/home?lfx=mylist', '#/home?tab=1']) {
      expect(themeroute.match(route(h))).toBe(false);
    }
    pendingTheme = false;
    expect(themeroute.match(route('#/home?lfx=title&id=1'))).toBe(true);
  });
});
