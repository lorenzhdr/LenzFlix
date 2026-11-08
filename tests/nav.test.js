// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { buildNavModel, activeKey, navItems, viewUrl } from '../src/js/features/nav.js';
import { parseHash } from '../src/js/core/router.js';

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
