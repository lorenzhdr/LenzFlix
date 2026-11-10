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
    expect(document.head.querySelector('#lfx-favicon').getAttribute('href')).toMatch(/^data:image\/png/);
    applyFavicon('unbekannt'); // Fallback auf flix
    expect(document.head.querySelectorAll('link').length).toBe(2);
    removeFavicon();
    expect(document.head.querySelector('link').getAttribute('href')).toBe('favicon.ico');
  });
});
