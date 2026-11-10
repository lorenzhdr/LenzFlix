import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  getItems: vi.fn(), getLatest: vi.fn(), getResume: vi.fn(), getJson: vi.fn(), getUserId: () => 'u1',
}));

import * as api from '../src/js/core/api.js';
import { buildHubRowDefs, getHubHeroPool, hubTypes } from '../src/js/shared/hub.js';

const genres = Array.from({ length: 10 }, (_, i) => ({ Id: `g${i}`, Name: `Genre ${i}` }));

beforeEach(() => {
  for (const f of [api.getItems, api.getLatest, api.getResume, api.getJson]) f.mockReset();
  api.getJson.mockResolvedValue({ Items: genres });
  api.getItems.mockResolvedValue({ Items: [] });
  api.getLatest.mockResolvedValue([]);
  api.getResume.mockResolvedValue({ Items: [] });
});

describe('buildHubRowDefs', () => {
  it('Typen je collectionType', () => {
    expect(hubTypes({ collectionType: 'movies' }).items).toBe('Movie');
    expect(hubTypes({ collectionType: 'tvshows' }).items).toBe('Series');
    expect(hubTypes({ collectionType: 'homevideos' }).items).toBe('Video');
    expect(hubTypes({ collectionType: null }).items).toBe('Movie,Series');
    expect(hubTypes({ collectionType: 'mixed' }).items).toBe('Movie,Series');
  });

  it('Zeilen, Genre-Begrenzung, ParentId ueberall', async () => {
    const defs = await buildHubRowDefs({ id: 'L1', collectionType: 'tvshows' });
    expect(api.getJson.mock.calls[0][0]).toBe('/Genres');
    expect(api.getJson.mock.calls[0][1]).toMatchObject({ ParentId: 'L1', IncludeItemTypes: 'Series' });
    expect(defs.filter((d) => d.id.includes('-genre-'))).toHaveLength(6);
    expect(defs[0]).toMatchObject({ title: 'Weiterschauen', kind: 'resume' });
    expect(defs.at(-1).title).toBe('Zufällige Auswahl');
    expect(new Set(defs.map((d) => d.kind))).toEqual(new Set(['resume', 'landscape', 'poster']));
    for (const d of defs) await d.load(d);
    expect(api.getResume.mock.calls[0][0]).toMatchObject({ ParentId: 'L1' });
    expect(api.getLatest.mock.calls[0][0]).toMatchObject({ ParentId: 'L1', IncludeItemTypes: 'Series' });
    expect(api.getItems.mock.calls.length).toBeGreaterThan(5);
    for (const [p] of api.getItems.mock.calls) expect(p.ParentId).toBe('L1');
    const g = api.getItems.mock.calls.map((c) => c[0]).filter((p) => p.GenreIds);
    expect(g).toHaveLength(6);
    expect(g[0].IncludeItemTypes).toBe('Series');
  });

  it('Weniger Genres -> weniger Zeilen; Genre-Fehler tolerant', async () => {
    api.getJson.mockResolvedValue({ Items: genres.slice(0, 2) });
    const few = await buildHubRowDefs({ id: 'L', collectionType: 'movies' });
    expect(few.filter((d) => d.id.includes('-genre-'))).toHaveLength(2);
    api.getJson.mockRejectedValue(new Error('x'));
    const defs = await buildHubRowDefs({ id: 'L', collectionType: 'movies' });
    expect(defs.some((d) => d.id.includes('-genre-'))).toBe(false);
    expect(defs.length).toBe(4);
  });

  it('Resume filtert serverseitig per ParentId (keine Ids-Gegenprüfung)', async () => {
    const defs = await buildHubRowDefs({ id: 'L1', collectionType: 'movies' });
    const resume = defs.find((d) => d.kind === 'resume');
    api.getResume.mockResolvedValue({ Items: [{ Id: 'a' }, { Id: 'b' }] });
    api.getItems.mockClear();
    const out = await resume.load();
    expect(out.map((i) => i.Id)).toEqual(['a', 'b']);
    expect(api.getResume.mock.calls.at(-1)[0]).toMatchObject({ ParentId: 'L1', IncludeItemTypes: 'Movie' });
    expect(api.getItems).not.toHaveBeenCalled();
  });
});

describe('getHubHeroPool', () => {
  it('bevorzugt Logo+Backdrop, ParentId gesetzt', async () => {
    const good = (id) => ({ Id: id, ImageTags: { Logo: 't' }, BackdropImageTags: ['b'] });
    api.getItems.mockImplementation(async (p) => ({
      Items: p.SortBy === 'Random' ? [good('r1'), { Id: 'x', BackdropImageTags: ['b'] }] : [good('n1')],
    }));
    const pool = await getHubHeroPool({ id: 'L1', collectionType: 'movies' });
    expect(pool.map((i) => i.Id).sort()).toEqual(['n1', 'r1']);
    for (const [p] of api.getItems.mock.calls) expect(p).toMatchObject({ ParentId: 'L1', IncludeItemTypes: 'Movie' });
  });

  it('Fallback nur Backdrop', async () => {
    api.getItems.mockResolvedValue({ Items: [{ Id: 'x', BackdropImageTags: ['b'] }, { Id: 'y' }] });
    expect((await getHubHeroPool({ id: 'L1' })).map((i) => i.Id)).toEqual(['x']);
  });
});
