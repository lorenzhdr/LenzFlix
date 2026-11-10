import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ getViews: vi.fn() }));

import * as api from '../src/js/core/api.js';
import { clearCache } from '../src/js/core/cache.js';
import { getLibraries } from '../src/js/shared/libraries.js';

describe('getLibraries', () => {
  beforeEach(() => {
    clearCache();
    api.getViews.mockReset();
  });

  it('Modell, Reihenfolge, hubCapable, Hrefs, Cache', async () => {
    api.getViews.mockResolvedValue({ Items: [
      { Id: 'a', Name: 'Filme', CollectionType: 'movies' },
      { Id: 'b', Name: 'Serien', CollectionType: 'tvshows' },
      { Id: 'c', Name: 'Sammlungen', CollectionType: 'boxsets' },
      { Id: 'd', Name: 'Musik', CollectionType: 'music' },
      { Id: 'e', Name: 'TV', CollectionType: 'livetv' },
      { Id: 'f', Name: 'Playlists', CollectionType: 'playlists' },
      { Id: 'g', Name: 'Privat', CollectionType: 'homevideos' },
      { Id: 'h', Name: 'Gemischt' },
      { Id: 'i', Name: 'Mixed', CollectionType: 'mixed' },
    ] });
    const libs = await getLibraries();
    expect(libs.map((l) => l.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i']);
    expect(libs.map((l) => l.hubCapable)).toEqual([true, true, false, false, false, false, true, true, true]);
    expect(libs[0]).toEqual({ id: 'a', name: 'Filme', collectionType: 'movies', href: '#/movies?topParentId=a&collectionType=movies', hubCapable: true });
    expect(libs[1].href).toBe('#/tv?topParentId=b&collectionType=tvshows');
    expect(libs[7].collectionType).toBeNull();
    expect(libs[7].href).toBe('#/mixed?topParentId=h&collectionType=mixed');
    await getLibraries();
    expect(api.getViews).toHaveBeenCalledTimes(1);
  });
});
