// @vitest-environment jsdom
// removeFavicon stellt sizes und fehlendes href wieder her.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { clearCache } from '../src/js/core/cache.js';
import { applyFavicon, removeFavicon } from '../src/js/core/favicon.js';

function client(extra = {}) {
  window.ApiClient = {
    serverId: () => 'srv', getCurrentUserId: () => 'u1', accessToken: () => 'tok', serverAddress: () => 'http://x', ...extra,
  };
}

beforeEach(() => { clearCache(); client(); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('removeFavicon stellt Web-App-Titel wieder her', () => {
  afterEach(() => { removeFavicon(); document.head.innerHTML = ''; });
  it('Meta ohne content bleibt ohne content, eigenes Meta verschwindet', () => {
    document.head.innerHTML = '<meta name="apple-mobile-web-app-title">';
    applyFavicon('plus');
    expect(document.head.querySelector('meta').getAttribute('content')).toBe('LENZ+');
    removeFavicon();
    expect(document.head.querySelector('meta').hasAttribute('content')).toBe(false);
    expect(document.head.querySelector('meta').hasAttribute('data-lfx-orig')).toBe(false);
    document.head.innerHTML = '';
    applyFavicon('plus');
    expect(document.head.querySelectorAll('meta').length).toBe(1);
    removeFavicon();
    expect(document.head.querySelectorAll('meta').length).toBe(0);
  });
});

describe('removeFavicon stellt sizes und fehlendes href wieder her', () => {
  afterEach(() => { removeFavicon(); document.head.innerHTML = ''; });
  it('sizes zurück, Link ohne href bleibt ohne href', () => {
    document.head.innerHTML = '<link rel="apple-touch-icon" sizes="180x180" href="a.png"><link rel="icon">';
    applyFavicon();
    removeFavicon();
    const [a, b] = [...document.head.querySelectorAll('link')];
    expect(a.getAttribute('sizes')).toBe('180x180');
    expect(a.getAttribute('href')).toBe('a.png');
    expect(b.hasAttribute('href')).toBe(false);
    expect(document.head.querySelector('[data-lfx-orig]')).toBeNull();
    expect(a.hasAttribute('type')).toBe(false);
  });
  it('Original-type kommt zurück', () => {
    document.head.innerHTML = '<link rel="icon" type="image/x-icon" href="f.ico">';
    applyFavicon();
    removeFavicon();
    expect(document.head.querySelector('link').getAttribute('type')).toBe('image/x-icon');
  });
});

