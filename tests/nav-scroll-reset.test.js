// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  getViews: vi.fn(async () => ({ Items: [] })),
  getUserId: () => 'u1',
  isReady: () => true,
}));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: vi.fn(() => true), getTheme: () => 'flix' }));
vi.mock('../src/js/core/themepicker.js', () => ({ openThemePicker: vi.fn() }));

import nav from '../src/js/features/nav.js';
import { parseHash } from '../src/js/core/router.js';
import { clearCache } from '../src/js/core/cache.js';

// Seitenwechsel über Kopfleiste/TV-Symbol beginnt oben, Browser-Zurück behält die Position.
describe('nav: Scroll-Reset bei neuer lfx-Seite', () => {
  let spy;
  beforeEach(() => {
    clearCache();
    document.body.innerHTML = '<header class="MuiAppBar-root"></header><a id="x" href="#/home?lfx=movies">F</a><a id="c" href="#/details?id=1">C</a>';
    document.body.addEventListener('click', (e) => e.preventDefault());
    spy = vi.spyOn(window, 'scrollTo').mockImplementation(() => {});
    nav.mount(parseHash('#/home'));
  });
  afterEach(() => {
    nav.unmount();
    vi.restoreAllMocks();
    document.documentElement.className = '';
  });

  it('Klick auf einen #/home-Link und neue Route: scrollTo(0,0)', () => {
    document.getElementById('x').click();
    nav.update(parseHash('#/home?lfx=movies'));
    expect(spy).toHaveBeenCalledWith(0, 0);
  });

  it('Route ohne vorherigen Klick (Zurück-Taste): keine Änderung der Position', () => {
    nav.update(parseHash('#/home?lfx=movies'));
    expect(spy).not.toHaveBeenCalled();
  });

  it('Klick auf Detail-Link und gleiche Route: kein Reset', () => {
    document.getElementById('c').click();
    nav.update(parseHash('#/home'));
    expect(spy).not.toHaveBeenCalled();
  });
});
