// @vitest-environment jsdom
// A020: Hub-Hero-Pool + Genres gecacht. A019: gecachte Sammlungen/Genre-Kacheln frieren die Bildgröße nicht ein.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const scaleState = vi.hoisted(() => ({ v: 1 }));
vi.mock('../src/js/core/api.js', () => ({
  getItems: vi.fn(), getLatest: vi.fn(), getResume: vi.fn(), getJson: vi.fn(), getUserId: () => 'u1',
  imageUrlFor: (id, o) => `http://srv/Items/${id}/Images/${o.type}?w=${Math.round(o.maxWidth * scaleState.v)}&tag=${o.tag}`,
}));

import * as api from '../src/js/core/api.js';
import { clearCache } from '../src/js/core/cache.js';
import { buildHubRowDefs, getHubHeroPool } from '../src/js/shared/hub.js';
import { getCollections } from '../src/js/shared/collections.js';
import { getGenreTiles } from '../src/js/shared/search.js';

beforeEach(() => {
  clearCache();
  scaleState.v = 1;
  for (const f of [api.getItems, api.getLatest, api.getResume, api.getJson]) f.mockReset();
  api.getJson.mockResolvedValue({ Items: [{ Id: 'g1', Name: 'Action' }] });
  api.getItems.mockResolvedValue({ Items: [] });
  api.getLatest.mockResolvedValue([]);
});

describe('Hub-Cache (A020)', () => {
  it('Hero-Pool: zweiter Aufruf derselben Bibliothek sendet keine /Items-Anfragen', async () => {
    const lib = { id: 'L1', collectionType: 'movies' };
    api.getItems.mockResolvedValue({ Items: [{ Id: 'm1', BackdropImageTags: ['b'] }] });
    expect((await getHubHeroPool(lib)).length).toBeGreaterThan(0);
    const n = api.getItems.mock.calls.length;
    await getHubHeroPool(lib);
    expect(api.getItems.mock.calls.length).toBe(n);
    await getHubHeroPool({ id: 'L2', collectionType: 'movies' });
    expect(api.getItems.mock.calls.length).toBe(n * 2);
  });

  it('leerer Pool (Netzfehler) wird nicht gecacht, Retry l�dt neu', async () => {
    const lib = { id: 'L1', collectionType: 'movies' };
    api.getItems.mockRejectedValueOnce(new Error('x')).mockRejectedValueOnce(new Error('x'))
      .mockResolvedValue({ Items: [{ Id: 'm1', BackdropImageTags: ['b'] }] });
    expect(await getHubHeroPool(lib)).toEqual([]);
    await Promise.resolve(); await Promise.resolve();
    const pool = await getHubHeroPool(lib);
    expect(api.getItems.mock.calls.length).toBe(4);
    expect(pool.length).toBeGreaterThan(0);
  });

  it('Genre-Liste wird gecacht', async () => {
    const lib = { id: 'L1', collectionType: 'movies' };
    await buildHubRowDefs(lib);
    await buildHubRowDefs(lib);
    expect(api.getJson.mock.calls.filter((c) => c[0] === '/Genres')).toHaveLength(1);
  });
});

describe('Bildgröße nicht eingefroren (A019)', () => {
  it('Sammlungen: URL folgt der aktuellen Skala', async () => {
    api.getItems.mockResolvedValue({ Items: [{ Id: 'B1', Name: 'Box', ImageTags: { Thumb: 't1' } }] });
    const a = await getCollections();
    expect(a[0].imageUrl).toContain('w=640');
    scaleState.v = 2 / 3;
    const b = await getCollections();
    expect(b[0].imageUrl).toContain('w=427');
    expect(api.getItems).toHaveBeenCalledTimes(1);
  });

  it('Genre-Kacheln: URL folgt der aktuellen Skala', async () => {
    api.getJson.mockResolvedValue({ Items: [{ Id: 'g1', Name: 'Action', ImageTags: { Thumb: 'tg' } }] });
    const a = await getGenreTiles({});
    expect(a[0].imageUrl).toContain('w=640');
    scaleState.v = 2 / 3;
    const b = await getGenreTiles({});
    expect(b[0].imageUrl).toContain('w=427');
  });
});
