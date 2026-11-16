// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  getViews: vi.fn(),
  getUserId: () => 'u1',
  isReady: () => true,
}));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: vi.fn(() => true), getTheme: () => 'flix' }));
vi.mock('../src/js/core/themepicker.js', () => ({ openThemePicker: vi.fn() }));

import { getViews } from '../src/js/core/api.js';
import nav from '../src/js/features/nav.js';
import mobilenav from '../src/js/features/mobilenav.js';
import { parseHash } from '../src/js/core/router.js';
import { clearCache } from '../src/js/core/cache.js';

const VIEWS = { Items: [{ Id: 's1', Name: 'Serien', CollectionType: 'tvshows' }, { Id: 'm1', Name: 'Filme', CollectionType: 'movies' }] };
let now;
const settle = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  clearCache();
  now = 1_000_000;
  vi.spyOn(Date, 'now').mockImplementation(() => now);
  getViews.mockReset();
  getViews.mockRejectedValueOnce(new Error('netz')).mockResolvedValue(VIEWS);
  document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
});
afterEach(() => {
  nav.unmount();
  mobilenav.unmount();
  vi.restoreAllMocks();
  document.documentElement.className = '';
});

// B049: ein einmaliger /UserViews-Fehler darf die Bibliotheken nicht bis zum Remount verbergen.
describe.each([['nav', nav, () => document.getElementById('lfx-nav'), ''], ['mobilenav', mobilenav, () => document.getElementById('lfx-mnav'), 'layout-mobile']])(
  '%s: Bibliotheken nach Ladefehler', (_n, feat, root, cls) => {
    beforeEach(() => { document.documentElement.className = cls; window.innerWidth = cls ? 390 : 1400; });

    it('update() lädt nach der Wartezeit erneut', async () => {
      feat.mount(parseHash('#/home'));
      await settle();
      expect(getViews).toHaveBeenCalledTimes(1);
      feat.update(parseHash('#/home')); // zu früh: kein Retry
      await settle();
      expect(getViews).toHaveBeenCalledTimes(1);
      now += 6000;
      feat.update(parseHash('#/home'));
      await vi.waitFor(() => expect(getViews).toHaveBeenCalledTimes(2));
      await settle();
      expect(root().textContent).toContain('Serien');
      now += 60000;
      feat.update(parseHash('#/home')); // Erfolg: kein weiterer Abruf
      await settle();
      expect(getViews).toHaveBeenCalledTimes(2);
    });
  },
);
