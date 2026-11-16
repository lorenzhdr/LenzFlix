import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  getJson: vi.fn(), getItems: vi.fn(), getUserId: () => 'u1',
  imageUrlFor: () => null,
}));

import * as api from '../src/js/core/api.js';
import { searchItems } from '../src/js/shared/search.js';

beforeEach(() => { api.getJson.mockReset(); });

describe('searchItems: Relevanzreihenfolge', () => {
  it('titles behält die Serverreihenfolge von Filmen und Serien gemischt', async () => {
    api.getJson.mockImplementation(async (path, params) => {
      if (path === '/Persons' || params.IncludeItemTypes === 'Episode') return { Items: [] };
      return { Items: [{ Id: 's1', Type: 'Series' }, { Id: 'm1', Type: 'Movie' }, { Id: 's2', Type: 'Series' }, { Id: 'm2', Type: 'Movie' }] };
    });
    const r = await searchItems('Family Guy');
    expect(r.titles.map((i) => i.Id)).toEqual(['s1', 'm1', 's2', 'm2']);
    expect(r.movies.map((i) => i.Id)).toEqual(['m1', 'm2']);
    expect(r.series.map((i) => i.Id)).toEqual(['s1', 's2']);
  });
});
