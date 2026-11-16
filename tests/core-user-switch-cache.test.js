// @vitest-environment jsdom
// Nutzerwechsel ohne Neuladen darf keine Bibliotheken/Neu-Info/Sammlungen/Genre-Kacheln des Vorgängers liefern.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const userState = vi.hoisted(() => ({ id: 'u1' }));
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return { ...actual, getUserId: () => userState.id, getViews: vi.fn() };
});

import * as api from '../src/js/core/api.js';
import { clearCache } from '../src/js/core/cache.js';
import { initHomeCache, destroyHomeCache } from '../src/js/core/homecache.js';
import { getLibraries } from '../src/js/shared/libraries.js';

describe('Nutzerwechsel leert Bibliotheken-Cache', () => {
  beforeEach(() => {
    userState.id = 'u1';
    clearCache();
    api.getViews.mockReset();
    window.location.hash = '#/home';
    initHomeCache();
  });
  afterEach(() => destroyHomeCache());

  it('getLibraries liefert nach dem Wechsel die Bibliotheken des neuen Nutzers', async () => {
    api.getViews.mockResolvedValueOnce({ Items: [{ Id: 'A', Name: 'Admin', CollectionType: 'movies' }] });
    expect((await getLibraries()).map((l) => l.id)).toEqual(['A']);
    userState.id = 'u2';
    window.dispatchEvent(new Event('hashchange'));
    api.getViews.mockResolvedValueOnce({ Items: [{ Id: 'K', Name: 'Kind', CollectionType: 'movies' }] });
    expect((await getLibraries()).map((l) => l.id)).toEqual(['K']);
  });
});
