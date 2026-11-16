// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

let theme = 'prime';
vi.mock('../src/js/core/theme.js', () => ({ isTheme: (id) => theme === id, isThemePending: () => false }));
vi.mock('../src/js/core/api.js', () => ({
  getViews: vi.fn(async () => ({ Items: [{ Id: 'lib1', CollectionType: 'movies' }] })),
  getAuth: () => ({ serverId: 'srv1' }),
}));

import themeroute from '../src/js/features/themeroute.js';
import { parseHash } from '../src/js/core/router.js';

const route = (h) => parseHash(h);
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => { theme = 'prime'; window.location.hash = '#/home'; });
afterEach(() => themeroute.unmount());

describe('themeroute unter LENZPRIME (B008)', () => {
  it('browse und search werden umgeleitet, title/hub bleiben Sache von prime', () => {
    expect(themeroute.match(route('#/home?lfx=browse&lib=lib1'))).toBe(true);
    expect(themeroute.match(route('#/home?lfx=search&q=a'))).toBe(true);
    expect(themeroute.match(route('#/home?lfx=hub&lib=lib1'))).toBe(false);
    expect(themeroute.match(route('#/home?lfx=title&id=1'))).toBe(false);
  });

  it('search -> #/search?query=, browse -> native Bibliothek', async () => {
    window.location.hash = '#/home?lfx=search&q=ab';
    themeroute.mount(route('#/home?lfx=search&q=ab'));
    expect(window.location.hash).toBe('#/search?query=ab');
    themeroute.unmount();
    window.location.hash = '#/home?lfx=browse&lib=lib1';
    themeroute.mount(route('#/home?lfx=browse&lib=lib1'));
    await flush();
    expect(window.location.hash).toBe('#/movies?topParentId=lib1&collectionType=movies');
  });
});
