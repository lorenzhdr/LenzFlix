// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest';
import { applyFavicon, removeFavicon } from '../src/js/core/favicon.js';

afterEach(() => { removeFavicon(); document.head.innerHTML = ''; });

describe('favicon', () => {
  it('biegt bestehende Icons um, ergänzt eigenes Icon und stellt beim Entfernen alles wieder her', () => {
    document.head.innerHTML = '<link rel="icon" type="image/x-icon" href="favicon.ico"><link rel="apple-touch-icon" sizes="180x180" href="a.png">';
    applyFavicon();
    applyFavicon(); // idempotent
    const links = [...document.head.querySelectorAll('link')];
    expect(links.length).toBe(3);
    expect(links.every((l) => l.getAttribute('href').startsWith('data:image/png;base64,'))).toBe(true);
    expect(document.head.querySelector('meta[name="apple-mobile-web-app-title"]').getAttribute('content')).toBe('LENZFLIX');
    removeFavicon();
    const after = [...document.head.querySelectorAll('link')];
    expect(after.length).toBe(2);
    expect(after[0].getAttribute('href')).toBe('favicon.ico');
    expect(after[1].getAttribute('href')).toBe('a.png');
  });

  it('applyFavicon(theme) stellt bei Designwechsel um, ohne Doppel-Links', () => {
    document.head.innerHTML = '<link rel="icon" href="favicon.ico">';
    applyFavicon('plus');
    applyFavicon('prime');
    expect(document.head.querySelectorAll('link').length).toBe(2);
    expect(document.head.querySelector('#lfx-favicon').getAttribute('href')).toContain('%2300050d'); // prime-Kachel
    expect(document.head.querySelector('meta[name="apple-mobile-web-app-title"]').getAttribute('content')).toBe('LENZPRIME');
    applyFavicon('unbekannt'); // Fallback auf flix
    expect(document.head.querySelectorAll('link').length).toBe(2);
    removeFavicon();
    expect(document.head.querySelector('link').getAttribute('href')).toBe('favicon.ico');
  });
});

describe('favicon entferntes Design', () => {
  it('live (LENZ LIVE entfernt) fällt auf das LENZFLIX-Icon zurück', () => {
    document.head.innerHTML = '<link rel="icon" href="favicon.ico">';
    applyFavicon('live');
    const link = document.head.querySelector('#lfx-favicon');
    expect(link.getAttribute('href')).toMatch(/^data:image\/png/);
  });
});

describe('favicon je Design', () => {
  const link = (sel) => document.head.querySelector(sel);
  it('Tab-Icon und Home-Bildschirm-Icon sind getrennt, Web-App-Titel folgt dem Design', () => {
    document.head.innerHTML = '<link rel="icon" href="f.ico"><link rel="apple-touch-icon" sizes="180x180" href="a.png"><meta name="apple-mobile-web-app-title" content="Jellyfin">';
    applyFavicon('retro');
    expect(link('link[rel="icon"]').getAttribute('href')).toMatch(/^data:image\/svg[+]xml,/);
    expect(link('link[rel="icon"]').getAttribute('type')).toBe('image/svg+xml');
    expect(link('#lfx-favicon').getAttribute('rel')).toBe('icon');
    // Home-Bildschirm-Icon: Datei neben dist/ (…/assets/logo/touch-<id>.png), nicht eingebettet
    expect(link('link[rel="apple-touch-icon"]').getAttribute('href')).toMatch(/\/assets\/logo\/touch-retro\.png$/);
    expect(link('link[rel="apple-touch-icon"]').getAttribute('href')).not.toContain('/dist/');
    expect(link('link[rel="apple-touch-icon"]').getAttribute('type')).toBe('image/png');
    // Jedes Design hat ein eigenes Tab-Icon
    const tabIcons = new Set(['flix', 'plus', 'prime', 'retro', 'store'].map((id) => {
      applyFavicon(id);
      return link('link[rel="icon"]').getAttribute('href');
    }));
    expect(tabIcons.size).toBe(5);
    applyFavicon('retro');
    expect(link('meta[name="apple-mobile-web-app-title"]').getAttribute('content')).toBe('LENZ//84');
    applyFavicon('store');
    expect(link('link[rel="icon"]').getAttribute('href')).toContain('VIDEOTHEK');
    expect(link('link[rel="apple-touch-icon"]').getAttribute('href')).toMatch(/\/assets\/logo\/touch-store\.png$/);
    expect(link('meta[name="apple-mobile-web-app-title"]').getAttribute('content')).toBe('VIDEOTHEK LENZ');
    applyFavicon('flix');
    expect(link('link[rel="icon"]').getAttribute('href')).toMatch(/^data:image\/png/);
    removeFavicon();
    expect(link('link[rel="icon"]').getAttribute('href')).toBe('f.ico');
    expect(link('link[rel="apple-touch-icon"]').getAttribute('href')).toBe('a.png');
    expect(link('link[rel="apple-touch-icon"]').getAttribute('sizes')).toBe('180x180');
    expect(link('meta[name="apple-mobile-web-app-title"]').getAttribute('content')).toBe('Jellyfin');
    expect(link('meta[name="apple-mobile-web-app-title"]').hasAttribute('data-lfx-orig')).toBe(false);
  });
});
