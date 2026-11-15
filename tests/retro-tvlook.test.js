// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ isReady: vi.fn(() => true), getUserId: () => 'u1', getItems: vi.fn(async () => ({ Items: [] })) }));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: vi.fn((id) => id === 'retro'), getTheme: () => 'retro' }));

import { isTheme } from '../src/js/core/theme.js';
import { parseHash } from '../src/js/core/router.js';
import tvlook, { TVCRT_CLASS } from '../src/js/features/retro/tvlook.js';
import fx from '../src/js/features/retro/fx/index.js';
import { setPref } from '../src/js/features/retro/prefs.js';

const html = document.documentElement;
const tv = parseHash('#/home?lfx=tv');
const home = parseHash('#/home');

beforeEach(() => {
  document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
  html.className = 'lfx-js lfx-theme-retro';
  window.localStorage.clear();
  isTheme.mockImplementation((id) => id === 'retro');
});
afterEach(() => tvlook.unmount());

describe('retro-tvlook', () => {
  it('matcht nur auf der TV-Route im Retro-Design (Modern, nicht TV)', () => {
    expect(tvlook.match(tv)).toBe(true);
    expect(tvlook.match(home)).toBe(false);
    isTheme.mockImplementation((id) => id === 'plus');
    expect(tvlook.match(tv)).toBe(false);
    isTheme.mockImplementation((id) => id === 'retro');
    html.classList.add('layout-tv');
    expect(tvlook.match(tv)).toBe(false);
  });

  it('mount setzt die Klasse nach der CRT-Vorliebe (Standard an) und folgt Änderungen', () => {
    tvlook.mount();
    expect(html.classList.contains(TVCRT_CLASS)).toBe(true);
    setPref('crt', false);
    expect(html.classList.contains(TVCRT_CLASS)).toBe(false);
    setPref('crt', true);
    expect(html.classList.contains(TVCRT_CLASS)).toBe(true);
  });

  it('mount bei ausgeschaltetem CRT setzt keine Klasse', () => {
    setPref('crt', false);
    tvlook.mount();
    expect(html.classList.contains(TVCRT_CLASS)).toBe(false);
  });

  it('unmount entfernt Klasse und Listener', () => {
    tvlook.mount();
    tvlook.unmount();
    expect(html.classList.contains(TVCRT_CLASS)).toBe(false);
    setPref('crt', true);
    expect(html.classList.contains(TVCRT_CLASS)).toBe(false);
  });
});

describe('retro-fx auf der TV-Route', () => {
  it('läuft dort nicht, sonst unverändert', () => {
    expect(fx.match(tv)).toBe(false);
    expect(fx.match(home)).toBe(true);
  });
});
