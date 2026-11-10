// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  getViews: vi.fn(async () => ({ Items: [{ Id: 'm1', Name: 'Filme', CollectionType: 'movies' }] })),
  getUserId: () => 'u1',
  isReady: () => true,
}));

import { buildNavModel, activeKey, navItems, viewUrl } from '../src/js/features/nav.js';
import nav from '../src/js/features/nav.js';
import { parseHash } from '../src/js/core/router.js';
import { clearCache } from '../src/js/core/cache.js';

const views = {
  Items: [
    { Id: 'm1', Name: 'Filme', CollectionType: 'movies' },
    { Id: 't1', Name: 'Serien', CollectionType: 'tvshows' },
    { Id: 'b1', Name: 'Collections', CollectionType: 'boxsets' },
    { Id: 'x1', Name: 'Musik', CollectionType: 'music' },
  ],
};

describe('nav', () => {
  const model = buildNavModel(views);
  it('Modell + Items', () => {
    expect(model.series.Id).toBe('t1');
    expect(model.more.map((m) => m.label)).toEqual(['Sammlungen', 'Musik']);
    expect(navItems(model).map((i) => i.label)).toEqual(['Startseite', 'Serien', 'Filme', 'Neu und beliebt', 'Meine Liste']);
    expect(viewUrl(views.Items[0])).toBe('#/movies?topParentId=m1&collectionType=movies');
  });
  it('aktiver Eintrag', () => {
    const k = (h) => activeKey(parseHash(h), model);
    expect(k('#/home')).toBe('home');
    expect(k('#/home?tab=1')).toBe('list');
    expect(k('#/home?lfx=new')).toBe('new');
    expect(k('#/tv?topParentId=t1&collectionType=tvshows')).toBe('series');
    expect(k('#/movies?topParentId=m1')).toBe('movies');
    expect(k('#/music?topParentId=x1')).toBe('more');
    expect(k('#/details?id=5')).toBeNull();
  });
});

describe('nav: Meine Statistik', () => {
  beforeEach(() => {
    clearCache();
    document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
  });
  afterEach(() => {
    nav.unmount();
    delete window.LenzFlixConfig;
    document.documentElement.className = '';
  });

  it('ohne Konfiguration: kein Link, Mehr-Menü bleibt aus', async () => {
    nav.mount(parseHash('#/home'));
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-nav__item').length).toBe(4));
    expect(document.querySelector('.lfx-nav__menu-item--stats')).toBeNull();
    expect(document.querySelector('.lfx-nav__more')).toBeNull();
  });

  it('mit Konfiguration: normaler Link im Mehr-Menü, auch ohne weitere Bibliotheken', async () => {
    window.LenzFlixConfig = { statsUrl: '/lenzflix-stats/' };
    nav.mount(parseHash('#/home'));
    await vi.waitFor(() => expect(document.querySelector('.lfx-nav__menu-item--stats')).not.toBeNull());
    const a = document.querySelector('.lfx-nav__menu-item--stats');
    expect(a.getAttribute('href')).toBe('/lenzflix-stats/');
    expect(a.textContent).toBe('Meine Statistik');
    expect(a.getAttribute('target')).toBeNull();
    expect(a.getAttribute('href').startsWith('#')).toBe(false);
    expect(a.dataset.key).toBeUndefined();
    expect(a.closest('.lfx-nav__menu')).not.toBeNull();
    nav.update(parseHash('#/home'));
    expect(a.classList.contains('is-active')).toBe(false);
    expect(a.hasAttribute('aria-current')).toBe(false);
    nav.unmount();
    expect(document.getElementById('lfx-nav')).toBeNull();
    expect(document.querySelector('.lfx-nav__menu-item--stats')).toBeNull();
  });

  it('geöffnetes Mehr-Menü bleibt offen, wenn die Navigation nach dem Laden der Bibliotheken neu gerendert wird', async () => {
    window.LenzFlixConfig = { statsUrl: '/lenzflix-stats/' };
    nav.mount(parseHash('#/home'));
    const first = document.querySelector('.lfx-nav__more');
    expect(first).not.toBeNull();
    first.dispatchEvent(new MouseEvent('mouseenter'));
    expect(first.classList.contains('is-open')).toBe(true);
    // Zweiter Render (loadViews) ersetzt das Element; das Menü muss offen bleiben.
    await vi.waitFor(() => expect(document.querySelector('.lfx-nav__more')).not.toBe(first));
    const second = document.querySelector('.lfx-nav__more');
    expect(second.classList.contains('is-open')).toBe(true);
    expect(second.querySelector('.lfx-nav__more-btn').getAttribute('aria-expanded')).toBe('true');
    // Verlässt die Maus das Menü, schließt es weiterhin.
    second.dispatchEvent(new MouseEvent('mouseleave'));
    expect(second.classList.contains('is-open')).toBe(false);
  });

  it('geschlossenes Menü bleibt nach dem erneuten Rendern geschlossen', async () => {
    window.LenzFlixConfig = { statsUrl: '/lenzflix-stats/' };
    nav.mount(parseHash('#/home'));
    const first = document.querySelector('.lfx-nav__more');
    await vi.waitFor(() => expect(document.querySelector('.lfx-nav__more')).not.toBe(first));
    expect(document.querySelector('.lfx-nav__more').classList.contains('is-open')).toBe(false);
  });
});
