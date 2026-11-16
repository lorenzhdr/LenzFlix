// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ getUserId: () => 'u1', getItems: vi.fn() }));

import { clearCatalogCache, loadCatalog } from '../src/js/features/live/data.js';
import { cached, peekCached } from '../src/js/core/cache.js';

describe('clearCatalogCache', () => {
  it('leert den Speicher-Cache der Kataloge, andere Schlüssel bleiben', async () => {
    await cached('live:catalog:u1:2026-11-15', async () => 1);
    await cached('home:u1:x', async () => 2);
    await clearCatalogCache();
    expect(peekCached('live:catalog:u1:2026-11-15')).toBeUndefined();
    expect(peekCached('home:u1:x')).toBe(2);
  });
  it('ein neuer Sendetag verwirft den Speicher-Katalog des Vortags', async () => {
    await loadCatalog({ now: Date.UTC(2026, 10, 14, 12, 0, 0) }).catch(() => {}); // Abruf scheitert (Mock)
    await cached('live:catalog:u1:2026-11-14', async () => 1);
    await loadCatalog({ now: Date.UTC(2026, 10, 15, 12, 0, 0) }).catch(() => {});
    expect(peekCached('live:catalog:u1:2026-11-14')).toBeUndefined();
  });
});
