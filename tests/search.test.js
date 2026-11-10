import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  getJson: vi.fn(), getItems: vi.fn(), getUserId: () => 'u1',
  imageUrlFor: (id, { type, tag }) => `http://x/Items/${id}/Images/${type}?tag=${tag}`,
}));

import * as api from '../src/js/core/api.js';
import { clearCache } from '../src/js/core/cache.js';
import { searchItems, getGenreTiles } from '../src/js/shared/search.js';

beforeEach(() => {
  clearCache();
  api.getJson.mockReset();
  api.getItems.mockReset();
});

describe('searchItems', () => {
  it('kurzer Begriff -> leer ohne Request', async () => {
    for (const q of ['', ' a ', null, undefined]) {
      expect(await searchItems(q)).toEqual({ movies: [], series: [], episodes: [], people: [] });
    }
    expect(api.getJson).not.toHaveBeenCalled();
  });

  it('Gruppen + Signal durchgereicht', async () => {
    const signal = new AbortController().signal;
    api.getJson.mockImplementation(async (path, params) => {
      if (path === '/Persons') return { Items: [{ Id: 'p1', Name: 'P' }] };
      if (params.IncludeItemTypes === 'Episode') return { Items: [{ Id: 'e1', Type: 'Episode' }] };
      return { Items: [{ Id: 'm1', Type: 'Movie' }, { Id: 's1', Type: 'Series' }] };
    });
    const r = await searchItems(' Matrix ', { signal, limit: 10 });
    expect(r.movies.map((i) => i.Id)).toEqual(['m1']);
    expect(r.series.map((i) => i.Id)).toEqual(['s1']);
    expect(r.episodes.map((i) => i.Id)).toEqual(['e1']);
    expect(r.people.map((i) => i.Id)).toEqual(['p1']);
    expect(api.getJson).toHaveBeenCalledTimes(3);
    for (const c of api.getJson.mock.calls) {
      expect(c[2]).toEqual({ signal });
      expect(c[1].searchTerm).toBe('Matrix');
    }
    const titles = api.getJson.mock.calls.find((c) => c[1].IncludeItemTypes === 'Movie,Series')[1];
    expect(titles).toMatchObject({ Limit: 10, Recursive: true });
  });

  it('Episoden-/Personen-Fehler tolerant, Abbruch nicht', async () => {
    api.getJson.mockImplementation(async (path, params) => {
      if (path === '/Persons' || params.IncludeItemTypes === 'Episode') throw new Error('x');
      return { Items: [{ Id: 'm1', Type: 'Movie' }] };
    });
    const r = await searchItems('ab');
    expect(r.movies).toHaveLength(1);
    expect(r.people).toEqual([]);
    api.getJson.mockRejectedValue(Object.assign(new Error('a'), { name: 'AbortError' }));
    await expect(searchItems('ab')).rejects.toThrow();
  });
});

describe('getGenreTiles', () => {
  it('eigenes Bild, sonst Backdrop des bestbewerteten Titels, sonst null', async () => {
    api.getJson.mockResolvedValue({ Items: [
      { Id: 'g1', Name: 'A', ImageTags: { Primary: 'p' } },
      { Id: 'g2', Name: 'B' },
      { Id: 'g3', Name: 'C' },
      { Id: 'g4', Name: 'D' },
    ] });
    api.getItems.mockImplementation(async (p) => {
      if (p.GenreIds === 'g2') return { Items: [{ Id: 'x' }, { Id: 'y', BackdropImageTags: ['bt'] }] };
      return { Items: [] };
    });
    const tiles = await getGenreTiles({ parentId: 'L1', limit: 3 });
    expect(api.getJson.mock.calls[0][1]).toMatchObject({ ParentId: 'L1' });
    expect(tiles).toEqual([
      { id: 'g1', name: 'A', imageUrl: 'http://x/Items/g1/Images/Primary?tag=p' },
      { id: 'g2', name: 'B', imageUrl: 'http://x/Items/y/Images/Backdrop?tag=bt' },
      { id: 'g3', name: 'C', imageUrl: null },
    ]);
    expect(api.getItems).toHaveBeenCalledTimes(2);
    expect(api.getItems.mock.calls[0][0]).toMatchObject({ ParentId: 'L1', SortBy: 'CommunityRating', SortOrder: 'Descending' });
    await getGenreTiles({ parentId: 'L1', limit: 3 });
    expect(api.getItems).toHaveBeenCalledTimes(2);
  });
});
