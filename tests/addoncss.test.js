// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ensureAddonCss, removeAddonCss, addonCssUrl } from '../src/js/core/addoncss.js';
import { ensureThemeCss, removeThemeCss } from '../src/js/core/themecss.js';

const link = () => document.querySelector('link.lfx-addon-css[data-lfx-addon="lenztvmode"]');

beforeEach(() => {
  document.head.innerHTML = '<link rel="stylesheet" href="https://cdn.example/dist/lenzflix.min.css">';
});
afterEach(() => {
  vi.useRealTimers();
  removeAddonCss();
  removeThemeCss(null);
  delete window.LenzFlixConfig;
});

describe('addoncss', () => {
  it('URL: Basis des Kern-CSS, .min wie dort; Dev unminifiziert mit Query', () => {
    expect(addonCssUrl('lenztvmode')).toBe('https://cdn.example/dist/lenztvmode.min.css');
    document.head.innerHTML = '<link id="lfx-dev-css" rel="stylesheet" href="http://localhost:5179/dist/lenzflix.css?7">';
    expect(addonCssUrl('lenztvmode')).toBe('http://localhost:5179/dist/lenztvmode.css?7');
  });

  it('lädt <link class="lfx-addon-css" data-lfx-addon> ans Ende von <head>; true bei load', async () => {
    const p = ensureAddonCss('lenztvmode');
    const l = link();
    expect(l.rel).toBe('stylesheet');
    expect(l.getAttribute('href')).toBe('https://cdn.example/dist/lenztvmode.min.css');
    expect(document.head.lastElementChild).toBe(l);
    l.dispatchEvent(new Event('load'));
    expect(await p).toBe(true);
    expect(link()).toBe(l);
  });

  it('idempotent: gleiches Promise im Flug, danach sofort true ohne zweiten Link', async () => {
    const p1 = ensureAddonCss('lenztvmode');
    expect(ensureAddonCss('lenztvmode')).toBe(p1);
    link().dispatchEvent(new Event('load'));
    await p1;
    expect(await ensureAddonCss('lenztvmode')).toBe(true);
    expect(document.querySelectorAll('link.lfx-addon-css')).toHaveLength(1);
  });

  it('Fehler: false, Link entfernt, neuer Versuch möglich', async () => {
    const p = ensureAddonCss('lenztvmode');
    link().dispatchEvent(new Event('error'));
    expect(await p).toBe(false);
    expect(link()).toBeNull();
    const p2 = ensureAddonCss('lenztvmode');
    expect(link()).not.toBeNull();
    link().dispatchEvent(new Event('load'));
    expect(await p2).toBe(true);
  });

  it('Timeout (Standard 8 s): false, Link entfernt', async () => {
    vi.useFakeTimers();
    const p = ensureAddonCss('lenztvmode');
    await vi.advanceTimersByTimeAsync(7999);
    expect(link()).not.toBeNull();
    await vi.advanceTimersByTimeAsync(2);
    expect(await p).toBe(false);
    expect(link()).toBeNull();
  });

  it('removeAddonCss(name) entfernt nur diesen, ohne Argument alle', () => {
    ensureAddonCss('lenztvmode');
    ensureAddonCss('other');
    removeAddonCss('lenztvmode');
    expect(link()).toBeNull();
    expect(document.querySelectorAll('link.lfx-addon-css')).toHaveLength(1);
    removeAddonCss();
    expect(document.querySelectorAll('link.lfx-addon-css')).toHaveLength(0);
  });

  it('removeThemeCss() entfernt Addon-Links nie (eigene Klasse)', async () => {
    const p = ensureAddonCss('lenztvmode');
    link().dispatchEvent(new Event('load'));
    await p;
    ensureThemeCss('plus');
    removeThemeCss(null);
    expect(link()).not.toBeNull();
    expect(document.querySelector('link.lfx-theme-css')).toBeNull();
    removeThemeCss('plus');
    expect(link()).not.toBeNull();
  });
});
