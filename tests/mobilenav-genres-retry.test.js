// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  getViews: vi.fn(async () => ({ Items: [{ Id: 'm1', Name: 'Filme', CollectionType: 'movies' }] })),
  getUserId: () => 'u1',
  isReady: () => true,
}));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: vi.fn(() => true), getTheme: () => 'flix' }));
vi.mock('../src/js/core/themepicker.js', () => ({ openThemePicker: vi.fn() }));
vi.mock('../src/js/features/library/sources.js', () => ({ getLibraryGenres: vi.fn() }));

import { getLibraryGenres } from '../src/js/features/library/sources.js';
import mobilenav from '../src/js/features/mobilenav.js';
import { parseHash } from '../src/js/core/router.js';
import { clearCache } from '../src/js/core/cache.js';

// A037: ein einmaliger Ladefehler der Genreliste darf den nächsten Versuch nicht sperren.
describe('mobilenav: Genreliste nach Ladefehler', () => {
  beforeEach(() => {
    clearCache();
    document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
    document.documentElement.className = 'layout-mobile';
    window.innerWidth = 390;
  });
  afterEach(() => {
    mobilenav.unmount();
    document.documentElement.className = '';
    vi.clearAllMocks();
  });

  it('lädt beim nächsten update() erneut', async () => {
    getLibraryGenres.mockRejectedValueOnce(new Error('netz')).mockResolvedValue([{ id: 'g1', name: 'Krimi' }]);
    mobilenav.mount(parseHash('#/home?lfx=movies'));
    await vi.waitFor(() => expect(getLibraryGenres).toHaveBeenCalledTimes(1));
    await new Promise((r) => setTimeout(r, 20));
    mobilenav.update(parseHash('#/home?lfx=movies&genre=g1'));
    await vi.waitFor(() => expect(getLibraryGenres).toHaveBeenCalledTimes(2));
  });
});
