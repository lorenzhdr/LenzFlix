// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  getViews: vi.fn(async () => ({
    Items: [
      { Id: 'm1', Name: 'Filme', CollectionType: 'movies' },
      { Id: 't1', Name: 'Serien', CollectionType: 'tvshows' },
      { Id: 'x1', Name: 'Musik', CollectionType: 'music' },
    ],
  })),
  getUserId: () => 'u1',
  isReady: () => true,
}));

import mobilenav, { showsPills, pillItems, overlayItems } from '../src/js/features/mobilenav.js';
import { buildNavModel } from '../src/js/features/nav.js';
import { parseHash } from '../src/js/core/router.js';
import { clearCache } from '../src/js/core/cache.js';

const views = {
  Items: [
    { Id: 'm1', Name: 'Filme', CollectionType: 'movies' },
    { Id: 't1', Name: 'Serien', CollectionType: 'tvshows' },
    { Id: 'x1', Name: 'Musik', CollectionType: 'music' },
  ],
};

describe('mobilenav (rein)', () => {
  const model = buildNavModel(views);
  it('Pills und Overlay-Einträge', () => {
    expect(pillItems(model).map((i) => i.label)).toEqual(['Serien', 'Filme', 'Meine Liste']);
    expect(overlayItems(model).map((i) => i.label)).toEqual(['Startseite', 'Serien', 'Filme', 'Neu und beliebt', 'Meine Liste', 'Musik']);
  });
  it('Pills nur auf der Startseite', () => {
    expect(showsPills(parseHash('#/home'))).toBe(true);
    expect(showsPills(parseHash('#/home?tab=1'))).toBe(false);
    expect(showsPills(parseHash('#/movies?topParentId=m1'))).toBe(false);
  });
});

describe('mobilenav (DOM)', () => {
  beforeEach(() => {
    clearCache();
    document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
    document.documentElement.className = 'layout-mobile';
  });
  afterEach(() => {
    mobilenav.unmount();
    document.documentElement.className = '';
  });

  it('match: nur mobil + modern + nicht TV', () => {
    const route = parseHash('#/home');
    expect(mobilenav.match(route)).toBe(true);
    document.documentElement.classList.add('layout-tv');
    expect(mobilenav.match(route)).toBe(false);
    document.documentElement.className = '';
    Object.defineProperty(window, 'innerWidth', { value: 1200, configurable: true });
    expect(mobilenav.match(route)).toBe(false);
    expect(mobilenav.match(parseHash('#/login'))).toBe(false);
  });

  it('mount rendert Pills, Overlay öffnet/schließt, unmount räumt auf', async () => {
    mobilenav.mount(parseHash('#/home'));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-mnav__pill').length).toBe(4));
    expect(document.documentElement.classList.contains('lfx-mnav-on')).toBe(true);
    expect(document.documentElement.classList.contains('lfx-mnav-pills')).toBe(true);
    const overlay = document.getElementById('lfx-mnav-overlay');
    expect(overlay.hidden).toBe(true);
    document.querySelector('.lfx-mnav__pill--cats').click();
    expect(overlay.hidden).toBe(false);
    expect(document.documentElement.classList.contains('lfx-mnav-open')).toBe(true);
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(overlay.hidden).toBe(true);
    mobilenav.update(parseHash('#/movies?topParentId=m1'));
    expect(document.documentElement.classList.contains('lfx-mnav-pills')).toBe(false);
    mobilenav.unmount();
    expect(document.getElementById('lfx-mnav')).toBeNull();
    expect(document.getElementById('lfx-mnav-overlay')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-mnav-on')).toBe(false);
  });
});
