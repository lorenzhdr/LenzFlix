import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  getItems: vi.fn(),
  imageUrlFor: (id, { type, tag, maxWidth }) => `http://x/Items/${id}/Images/${type}?maxWidth=${maxWidth}&tag=${tag}`,
}));

import * as api from '../src/js/core/api.js';
import { clearCache } from '../src/js/core/cache.js';
import { getCollections } from '../src/js/shared/collections.js';

beforeEach(() => {
  clearCache();
  api.getItems.mockReset();
});

describe('getCollections', () => {
  it('Tag zuerst, Bildreihenfolge Thumb > Backdrop > Primary > null', async () => {
    api.getItems.mockResolvedValue({ Items: [
      { Id: 'a', Name: 'A', ImageTags: { Thumb: 't', Primary: 'p' }, BackdropImageTags: ['b'] },
      { Id: 'b', Name: 'B', ImageTags: { Primary: 'p' }, BackdropImageTags: ['b'] },
      { Id: 'c', Name: 'C', ImageTags: { Primary: 'p' } },
      { Id: 'd', Name: 'D' },
    ] });
    const out = await getCollections();
    expect(api.getItems).toHaveBeenCalledTimes(1);
    expect(api.getItems.mock.calls[0][0]).toMatchObject({ Tags: 'lenzplus', IncludeItemTypes: 'BoxSet', Recursive: true, SortBy: 'SortName' });
    expect(out.map((c) => c.imageType)).toEqual(['Thumb', 'Backdrop', 'Primary', null]);
    expect(out[0]).toMatchObject({ id: 'a', name: 'A', href: '#/details?id=a' });
    expect(out[0].imageUrl).toContain('maxWidth=640');
    expect(out[0].imageUrl).not.toContain('api_key');
    expect(out[3].imageUrl).toBeNull();
  });

  it('Fallback: groesste BoxSets, begrenzt', async () => {
    api.getItems.mockImplementation(async (p) => (p.Tags ? { Items: [] } : { Items: [
      { Id: 'a', Name: 'A', ChildCount: 2 }, { Id: 'b', Name: 'B', ChildCount: 9 }, { Id: 'c', Name: 'C', ChildCount: 5 },
    ] }));
    const out = await getCollections({ fallbackLimit: 2 });
    expect(out.map((c) => c.id)).toEqual(['b', 'c']);
    expect(api.getItems.mock.calls[1][0].Fields).toContain('ChildCount');
  });

  it('leer', async () => {
    api.getItems.mockResolvedValue({ Items: [] });
    expect(await getCollections()).toEqual([]);
  });
});
