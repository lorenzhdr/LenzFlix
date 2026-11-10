// @vitest-environment jsdom
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { resolveThemeCssBase, themeCssUrl, ensureThemeCss, removeThemeCss, getThemeCssLink } from '../src/js/core/themecss.js';
import { VERSION } from '../src/js/core/version.js';

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.useRealTimers();
  delete window.LenzFlixConfig;
});

describe('resolveThemeCssBase', () => {
  it('1. window.LenzFlixConfig.themeCssBase hat Vorrang (Slash wird ergänzt)', () => {
    window.LenzFlixConfig = { themeCssBase: 'https://cfg.example/dist' };
    document.head.innerHTML = '<link rel="stylesheet" href="https://other.example/dist/lenzflix.min.css">';
    expect(resolveThemeCssBase()).toEqual({ base: 'https://cfg.example/dist/', min: true, query: '' });
  });

  it('2. Dev-Loop-Link #lfx-dev-css (unminifiziert, Cache-Buster bleibt)', () => {
    document.head.innerHTML = '<link id="lfx-dev-css" rel="stylesheet" href="http://localhost:5179/dist/lenzflix.css?123">';
    const r = resolveThemeCssBase();
    expect(r.base).toBe('http://localhost:5179/dist/');
    expect(r.min).toBe(false);
    expect(themeCssUrl('plus')).toBe('http://localhost:5179/dist/lenzplus.css?123');
  });

  it('3. CSSImportRule in einem <style> (min wird erkannt)', () => {
    const st = document.createElement('style');
    st.textContent = '@import url("https://cdn.example/x/dist/lenzflix.min.css");';
    document.head.append(st);
    const rules = Array.from((st.sheet && st.sheet.cssRules) || []);
    if (!rules.some((r) => r.href)) return; // Umgebung ohne @import-Unterstützung: Test 3b deckt die Logik ab
    const r = resolveThemeCssBase();
    expect(r.base).toBe('https://cdn.example/x/dist/');
    expect(r.min).toBe(true);
    expect(themeCssUrl('prime')).toBe('https://cdn.example/x/dist/lenzprime.min.css');
    expect(themeCssUrl('retro')).toBe('https://cdn.example/x/dist/lenzretro.min.css');
  });

  it('3b. verschachtelter Import (Sheet im Import) und CORS-Fehler werden toleriert', () => {
    const inner = { cssRules: [{ href: 'https://n.example/d/lenzflix.css' }] };
    const spy = vi.spyOn(document, 'styleSheets', 'get').mockReturnValue([
      { href: null, get cssRules() { throw new Error('SecurityError'); } },
      { href: null, cssRules: [{ href: 'https://n.example/other.css', styleSheet: inner }] },
    ]);
    const r = resolveThemeCssBase();
    spy.mockRestore();
    expect(r).toMatchObject({ base: 'https://n.example/d/', min: false });
  });

  it('4. <link rel=stylesheet> mit lenzflix(.min).css', () => {
    document.head.innerHTML = '<link rel="stylesheet" href="https://l.example/a/lenzflix.min.css?v=1">';
    expect(resolveThemeCssBase()).toEqual({ base: 'https://l.example/a/', min: true, query: '' });
  });

  it('4b. <script src> mit lenzflix(.min).js (Inline-JS ohne currentScript scheitert nicht)', () => {
    document.head.innerHTML = '<script src="https://s.example/b/lenzflix.min.js"></script>';
    expect(resolveThemeCssBase()).toMatchObject({ base: 'https://s.example/b/', min: true });
  });

  it('5. Fallback: jsDelivr mit VERSION (inline-JS, kein Treffer)', () => {
    const r = resolveThemeCssBase();
    expect(r.base).toBe(`https://cdn.jsdelivr.net/gh/lorenzhdr/LenzFlix@v${VERSION}/dist/`);
    expect(r.min).toBe(true);
    expect(themeCssUrl('plus')).toBe(`${r.base}lenzplus.min.css`);
  });

  it('themeCssUrl: flix hat keine URL', () => {
    expect(themeCssUrl('flix')).toBeNull();
  });
});

describe('ensureThemeCss / removeThemeCss', () => {
  beforeEach(() => {
    window.LenzFlixConfig = { themeCssBase: 'https://t.example/dist/' };
  });

  it('hängt den Link ans Ende von <head> und löst bei load mit true auf', async () => {
    document.head.innerHTML = '<link rel="stylesheet" href="a.css">';
    const p = ensureThemeCss('plus');
    const link = getThemeCssLink('plus');
    expect(link).not.toBeNull();
    expect(document.head.lastElementChild).toBe(link);
    expect(link.className).toBe('lfx-theme-css');
    expect(link.getAttribute('href')).toBe('https://t.example/dist/lenzplus.css');
    link.dispatchEvent(new Event('load'));
    await expect(p).resolves.toBe(true);
    await expect(ensureThemeCss('plus')).resolves.toBe(true); // kein zweiter Link
    expect(document.querySelectorAll('link.lfx-theme-css').length).toBe(1);
  });

  it('Fehler und Timeout -> false, Link wird entfernt', async () => {
    const p1 = ensureThemeCss('plus');
    getThemeCssLink('plus').dispatchEvent(new Event('error'));
    await expect(p1).resolves.toBe(false);
    expect(getThemeCssLink('plus')).toBeNull();
    vi.useFakeTimers();
    const p2 = ensureThemeCss('prime', { timeout: 500 });
    vi.advanceTimersByTime(600);
    await expect(p2).resolves.toBe(false);
    expect(getThemeCssLink('prime')).toBeNull();
  });

  it('removeThemeCss entfernt alle außer dem angegebenen und setzt dessen id', async () => {
    const a = ensureThemeCss('plus');
    getThemeCssLink('plus').dispatchEvent(new Event('load'));
    await a;
    const b = ensureThemeCss('prime');
    getThemeCssLink('prime').dispatchEvent(new Event('load'));
    await b;
    removeThemeCss('prime');
    expect(getThemeCssLink('plus')).toBeNull();
    expect(getThemeCssLink('prime').id).toBe('lfx-theme-css');
    removeThemeCss();
    expect(document.querySelectorAll('link.lfx-theme-css').length).toBe(0);
  });

  it('flix braucht kein CSS', async () => {
    await expect(ensureThemeCss('flix')).resolves.toBe(true);
    expect(document.querySelectorAll('link.lfx-theme-css').length).toBe(0);
  });
});
