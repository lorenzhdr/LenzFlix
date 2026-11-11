// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { applyFavicon, removeFavicon } from '../src/js/core/favicon.js';

afterEach(() => { removeFavicon(); document.head.innerHTML = ''; });

describe('favicon live', () => {
  it('LENZ LIVE bekommt ein eigenes SVG-Icon', () => {
    document.head.innerHTML = '<link rel="icon" href="favicon.ico">';
    applyFavicon('live');
    const link = document.head.querySelector('#lfx-favicon');
    expect(link.getAttribute('href')).toMatch(/^data:image\/svg\+xml,/);
    expect(link.getAttribute('type')).toBe('image/svg+xml');
    expect(link.getAttribute('href')).toContain('LENZ%20LIVE');
  });
});
