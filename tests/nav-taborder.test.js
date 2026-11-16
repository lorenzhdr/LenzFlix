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
import tvbtn from '../src/js/features/tvbtn.js';
import dsbtn from '../src/js/features/dsbtn.js';
import { parseHash } from '../src/js/core/router.js';
import { clearCache } from '../src/js/core/cache.js';

const feats = [nav, tvbtn, dsbtn];

// Navigation und Kopfleisten-Symbole stehen im DOM (und damit in der Tab-Reihenfolge) vor dem Seiteninhalt.
// Die fixierten Symbole tragen mui-fixed (MUI gleicht beim Scroll-Lock den Scrollbar-Platz aus).
describe('Kopfleisten-Mountpoints: Tab-Reihenfolge und Scroll-Lock', () => {
  beforeEach(() => {
    clearCache();
    document.body.innerHTML = '<div id="reactRoot"><header class="MuiAppBar-root"><a href="#/home">Logo</a></header></div>';
    const r = parseHash('#/home');
    feats.forEach((f) => f.mount(r));
  });
  afterEach(() => {
    feats.forEach((f) => f.unmount());
    document.documentElement.className = '';
  });

  it('#lfx-nav, #lfx-tvm-btn und #lfx-ds-btn liegen vor #reactRoot', () => {
    const root = document.getElementById('reactRoot');
    for (const id of ['lfx-nav', 'lfx-tvm-btn', 'lfx-ds-btn']) {
      const el = document.getElementById(id);
      expect(el, id).not.toBeNull();
      expect(Boolean(el.compareDocumentPosition(root) & Node.DOCUMENT_POSITION_FOLLOWING), id).toBe(true);
    }
  });

  it('TV- und Tacho-Symbol tragen mui-fixed', () => {
    expect(document.getElementById('lfx-tvm-btn').classList.contains('mui-fixed')).toBe(true);
    expect(document.getElementById('lfx-ds-btn').classList.contains('mui-fixed')).toBe(true);
  });
});
