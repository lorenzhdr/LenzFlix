// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ensureThemeJs, removeThemeJs, themeJsUrl } from '../src/js/core/themejs.js';

const tag = () => document.querySelector('script.lfx-theme-js[data-lfx-theme="store"]');

beforeEach(() => {
  document.head.innerHTML = '<link id="lfx-dev-css" rel="stylesheet" href="http://localhost:5179/dist/lenzflix.css?9">';
  delete window.LenzFlixStore3D;
});
afterEach(() => {
  vi.useRealTimers();
  removeThemeJs();
  delete window.LenzFlixStore3D;
  delete window.LenzFlixConfig;
});

describe('themejs', () => {
  it('URL aus der Basis des Kern-CSS (Dev: unminifiziert, Query bleibt)', () => {
    expect(themeJsUrl('store')).toBe('http://localhost:5179/dist/lenzstore.js?9');
    expect(themeJsUrl('flix')).toBeNull();
  });

  it('Design ohne JS-Bundle: sofort true', async () => {
    expect(await ensureThemeJs('flix')).toBe(true);
    expect(tag()).toBeNull();
  });

  it('Global schon da: sofort true, kein Tag', async () => {
    window.LenzFlixStore3D = { version: 1, create() {} };
    expect(await ensureThemeJs('store')).toBe(true);
    expect(tag()).toBeNull();
  });

  it('lädt per Script-Tag, resolved true beim load mit Global; Dedupe', async () => {
    const p1 = ensureThemeJs('store');
    const p2 = ensureThemeJs('store');
    expect(p2).toBe(p1);
    expect(document.querySelectorAll('script.lfx-theme-js')).toHaveLength(1);
    expect(tag().src).toContain('lenzstore.js');
    window.LenzFlixStore3D = { version: 1, create() {} };
    tag().dispatchEvent(new Event('load'));
    expect(await p1).toBe(true);
    expect(tag()).not.toBeNull();
  });

  it('Fehler: false, Tag entfernt, neuer Versuch möglich', async () => {
    const p = ensureThemeJs('store');
    tag().dispatchEvent(new Event('error'));
    expect(await p).toBe(false);
    expect(tag()).toBeNull();
    const p2 = ensureThemeJs('store');
    expect(tag()).not.toBeNull();
    tag().dispatchEvent(new Event('error'));
    expect(await p2).toBe(false);
  });

  it('load ohne Global zählt als Fehler', async () => {
    const p = ensureThemeJs('store');
    tag().dispatchEvent(new Event('load'));
    expect(await p).toBe(false);
    expect(tag()).toBeNull();
  });

  it('Timeout: false, Tag entfernt', async () => {
    vi.useFakeTimers();
    const p = ensureThemeJs('store', { timeout: 500 });
    await vi.advanceTimersByTimeAsync(501);
    expect(await p).toBe(false);
    expect(tag()).toBeNull();
  });

  it('removeThemeJs entfernt Tags, aber nicht das Global', () => {
    ensureThemeJs('store');
    window.LenzFlixStore3D = { version: 1 };
    removeThemeJs();
    expect(tag()).toBeNull();
    expect(window.LenzFlixStore3D).toBeTruthy();
  });
});
