// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import playerbg from '../src/js/features/playerbg.js';
import { features } from '../src/js/features/index.js';
import { parseHash } from '../src/js/core/router.js';

const html = document.documentElement;
const meta = () => document.querySelector('meta[name="theme-color"]');

describe('playerbg', () => {
  beforeEach(() => {
    document.head.innerHTML = '';
    document.body.innerHTML = '';
    html.className = '';
  });
  afterEach(() => {
    playerbg.unmount();
    html.className = '';
  });

  it('ist registriert', () => {
    expect(features).toContain(playerbg);
  });

  it('match: Route /video oder sichtbare Player-Seite, nicht TV', () => {
    expect(playerbg.match(parseHash('#/home'))).toBe(false);
    expect(playerbg.match(parseHash('#/video'))).toBe(true);
    document.body.innerHTML = '<div id="videoOsdPage" class="hide"></div>';
    expect(playerbg.match(parseHash('#/home'))).toBe(false);
    document.body.innerHTML = '<div id="videoOsdPage"></div>';
    expect(playerbg.match(parseHash('#/home'))).toBe(true);
    html.classList.add('layout-tv');
    expect(playerbg.match(parseHash('#/video'))).toBe(false);
  });

  it('eigenes theme-color-Meta: angelegt, beim Verlassen entfernt', () => {
    playerbg.mount();
    expect(html.classList.contains('lfx-in-player')).toBe(true);
    expect(meta().getAttribute('content')).toBe('#000000');
    playerbg.unmount();
    expect(html.classList.contains('lfx-in-player')).toBe(false);
    expect(meta()).toBeNull();
  });

  it('vorhandenes Meta: Wert gemerkt und wiederhergestellt', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#141414">';
    playerbg.mount();
    expect(meta().getAttribute('content')).toBe('#000000');
    playerbg.unmount();
    expect(meta().getAttribute('content')).toBe('#141414');
  });
});
