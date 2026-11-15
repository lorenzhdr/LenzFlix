// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { titleHref, hubHref, browseHref, searchHref, parseLfxRoute, tvModeHref, isTvModeRoute, libraryHref, myListHref, isLibraryRoute, isMyListRoute } from '../src/js/shared/routes.js';
import { parseHash } from '../src/js/core/router.js';

const parse = (href) => parseLfxRoute(parseHash(href));

describe('shared/routes', () => {
  it('baut Hrefs mit Encoding', () => {
    expect(titleHref('a b')).toBe('#/home?lfx=title&id=a%20b');
    expect(hubHref('L1')).toBe('#/home?lfx=hub&lib=L1');
    expect(browseHref('L1')).toBe('#/home?lfx=browse&lib=L1');
    expect(browseHref('L1', 'g&1')).toBe('#/home?lfx=browse&lib=L1&genre=g%261');
    expect(searchHref()).toBe('#/home?lfx=search');
    expect(searchHref('star wars')).toBe('#/home?lfx=search&q=star%20wars');
  });

  it('Round-Trip über parseHash', () => {
    expect(parse(titleHref('x y'))).toEqual({ kind: 'title', id: 'x y', lib: null, genre: null, q: null, view: null, sort: null, type: null });
    expect(parse(hubHref('L'))).toMatchObject({ kind: 'hub', lib: 'L' });
    expect(parse(browseHref('L', 'G'))).toMatchObject({ kind: 'browse', lib: 'L', genre: 'G' });
    expect(parse(searchHref('ä&b'))).toMatchObject({ kind: 'search', q: 'ä&b' });
    expect(parse('#/home?lfx=new')).toMatchObject({ kind: 'new' });
  });

  it('libraryHref/myListHref: Standardwerte entfallen, Round-Trip', () => {
    expect(libraryHref('series')).toBe('#/home?lfx=series');
    expect(libraryHref('movies', { genre: 'g 1', view: 'grid', sort: 'az' })).toBe('#/home?lfx=movies&genre=g%201&view=grid&sort=az');
    expect(libraryHref('movies', { view: 'list', sort: 'bogus' })).toBe('#/home?lfx=movies');
    expect(myListHref()).toBe('#/home?lfx=mylist');
    expect(myListHref({ type: 'series', sort: 'year' })).toBe('#/home?lfx=mylist&type=series&sort=year');
    expect(myListHref({ type: 'x' })).toBe('#/home?lfx=mylist');
    expect(parse(libraryHref('movies', { genre: 'G', view: 'grid', sort: 'new' }))).toMatchObject({ kind: 'movies', genre: 'G', view: 'grid', sort: 'new' });
    expect(parse('#/home?lfx=mylist&type=series&sort=za')).toMatchObject({ kind: 'mylist', type: 'series', sort: 'za' });
    expect(parse('#/home?lfx=series&view=x&sort=y')).toMatchObject({ view: null, sort: null });
    expect(isLibraryRoute(parseHash('#/home?lfx=series'))).toBe(true);
    expect(isLibraryRoute(parseHash('#/home?lfx=mylist'))).toBe(false);
    expect(isMyListRoute(parseHash('#/home?lfx=mylist'))).toBe(true);
  });

  it('keine LenzFlix-Route: kind null', () => {
    expect(parse('#/home').kind).toBeNull();
    expect(parse('#/home?lfx=foo').kind).toBeNull();
    expect(parse('#/movies?lfx=title&id=1').kind).toBeNull();
    expect(parseLfxRoute(null).kind).toBeNull();
  });

  it('TV-Modus: tvModeHref, kind tv, isTvModeRoute', () => {
    expect(tvModeHref).toBe('#/home?lfx=tv');
    expect(parse(tvModeHref)).toMatchObject({ kind: 'tv', id: null });
    expect(isTvModeRoute(parseHash(tvModeHref))).toBe(true);
    expect(isTvModeRoute(parseHash('#/home?lfx=new'))).toBe(false);
    expect(isTvModeRoute(parseHash('#/movies?lfx=tv'))).toBe(false);
    expect(isTvModeRoute(null)).toBe(false);
  });
});
