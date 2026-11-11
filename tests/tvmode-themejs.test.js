// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { ensureThemeJs, removeThemeJs, themeJsUrl } from '../src/js/core/themejs.js';

beforeEach(() => {
  document.head.innerHTML = '<link rel="stylesheet" href="https://cdn.example/dist/lenzflix.min.css">';
  delete window.LenzFlixTvMode;
});
afterEach(() => {
  removeThemeJs();
  delete window.LenzFlixTvMode;
});

describe('themejs: tvmode', () => {
  it('URL: dist/lenztvmode(.min).js aus der Basis des Kern-CSS', () => {
    expect(themeJsUrl('tvmode')).toBe('https://cdn.example/dist/lenztvmode.min.js');
    document.head.innerHTML = '<link id="lfx-dev-css" rel="stylesheet" href="http://localhost:5179/dist/lenzflix.css?3">';
    expect(themeJsUrl('tvmode')).toBe('http://localhost:5179/dist/lenztvmode.js?3');
  });

  it('lädt per Script-Tag; true erst, wenn window.LenzFlixTvMode da ist', async () => {
    const p = ensureThemeJs('tvmode');
    const tag = document.querySelector('script.lfx-theme-js[data-lfx-theme="tvmode"]');
    expect(tag.src).toContain('lenztvmode.min.js');
    window.LenzFlixTvMode = { version: 1, create() {} };
    tag.dispatchEvent(new Event('load'));
    expect(await p).toBe(true);
  });

  it('Global schon da: sofort true, kein Tag', async () => {
    window.LenzFlixTvMode = { version: 1, create() {} };
    expect(await ensureThemeJs('tvmode')).toBe(true);
    expect(document.querySelector('script.lfx-theme-js')).toBeNull();
  });

  it('load ohne Global: false, Tag entfernt', async () => {
    const p = ensureThemeJs('tvmode');
    document.querySelector('script.lfx-theme-js').dispatchEvent(new Event('load'));
    expect(await p).toBe(false);
    expect(document.querySelector('script.lfx-theme-js')).toBeNull();
  });
});
