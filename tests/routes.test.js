// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { titleHref, hubHref, browseHref, searchHref, parseLfxRoute } from '../src/js/shared/routes.js';
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
    expect(parse(titleHref('x y'))).toEqual({ kind: 'title', id: 'x y', lib: null, genre: null, q: null });
    expect(parse(hubHref('L'))).toMatchObject({ kind: 'hub', lib: 'L' });
    expect(parse(browseHref('L', 'G'))).toMatchObject({ kind: 'browse', lib: 'L', genre: 'G' });
    expect(parse(searchHref('ä&b'))).toMatchObject({ kind: 'search', q: 'ä&b' });
    expect(parse('#/home?lfx=new')).toMatchObject({ kind: 'new' });
  });

  it('keine LenzFlix-Route: kind null', () => {
    expect(parse('#/home').kind).toBeNull();
    expect(parse('#/home?lfx=foo').kind).toBeNull();
    expect(parse('#/movies?lfx=title&id=1').kind).toBeNull();
    expect(parseLfxRoute(null).kind).toBeNull();
  });
});
