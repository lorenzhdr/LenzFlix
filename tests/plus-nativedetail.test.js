// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ isReady: () => true }));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: vi.fn((id) => id === 'plus') }));
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false }));

import nativedetail, { evaluate } from '../src/js/features/plus/nativedetail.js';
import favempty, { isFavRoute, EMPTY_TEXT } from '../src/js/features/plus/favempty.js';
import { parseHash } from '../src/js/core/router.js';
import { isTheme } from '../src/js/core/theme.js';

const R = (h) => parseHash(h);

const page = (logoStyle, logoClass, bdStyle) => `
<div id="indexPage"></div>
<div id="itemDetailPage" class="page">
  <div class="itemBackdrop" style="${bdStyle || ''}"></div>
  <div class="detailLogo ${logoClass || ''}" style="${logoStyle || ''}"></div>
  <div class="nameContainer"><h1 class="itemName">Arcane</h1></div>
</div>`;

describe('plus-nativedetail', () => {
  let ImageBackup;
  beforeEach(() => {
    isTheme.mockImplementation((id) => id === 'plus');
    ImageBackup = globalThis.Image;
  });
  afterEach(() => {
    nativedetail.unmount();
    document.body.innerHTML = '';
    globalThis.Image = ImageBackup;
  });

  it('match: nur plus + /details', () => {
    expect(nativedetail.match(R('#/details?id=1'))).toBe(true);
    expect(nativedetail.match(R('#/home'))).toBe(false);
    isTheme.mockImplementation((id) => id === 'flix');
    expect(nativedetail.match(R('#/details?id=1'))).toBe(false);
  });

  it('ohne Logo (.hide) und ohne Backdrop: beide Klassen', () => {
    document.body.innerHTML = page('', 'hide', '');
    nativedetail.mount(R('#/details?id=1'));
    const p = document.getElementById('itemDetailPage');
    expect(p.classList.contains('lfx-plus-nologo')).toBe(true);
    expect(p.classList.contains('lfx-plus-nobackdrop')).toBe(true);
  });

  it('mit Logo und Backdrop: keine Klassen', () => {
    globalThis.Image = class { set src(v) { this._s = v; } };
    document.body.innerHTML = page('background-image: url(/L.png)', '', 'background-image: url(/B.jpg)');
    nativedetail.mount(R('#/details?id=1'));
    const p = document.getElementById('itemDetailPage');
    expect(p.classList.contains('lfx-plus-nologo')).toBe(false);
    expect(p.classList.contains('lfx-plus-nobackdrop')).toBe(false);
  });

  it('Logo lädt nicht (onerror): Text-Titel-Klasse', () => {
    let inst;
    globalThis.Image = class { constructor() { inst = this; } set src(v) { this._s = v; } };
    document.body.innerHTML = page('background-image: url(/L.png)', '', 'background-image: url(/B.jpg)');
    nativedetail.mount(R('#/details?id=1'));
    const p = document.getElementById('itemDetailPage');
    expect(p.classList.contains('lfx-plus-nologo')).toBe(false);
    inst.onerror();
    expect(p.classList.contains('lfx-plus-nologo')).toBe(true);
  });

  it('unmount entfernt die Klassen', () => {
    document.body.innerHTML = page('', 'hide', '');
    nativedetail.mount(R('#/details?id=1'));
    nativedetail.unmount();
    const p = document.getElementById('itemDetailPage');
    expect(p.classList.contains('lfx-plus-nologo')).toBe(false);
    expect(p.classList.contains('lfx-plus-nobackdrop')).toBe(false);
    evaluate();
  });
});

describe('plus-favempty', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    isTheme.mockImplementation((id) => id === 'plus');
    document.body.innerHTML = '<div id="indexPage"><div id="homeTab"></div><div id="favoritesTab" class="tabContent"></div></div>';
  });
  afterEach(() => {
    favempty.unmount();
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('Route nur für #/home?tab=1', () => {
    expect(isFavRoute(R('#/home?tab=1'))).toBe(true);
    expect(isFavRoute(R('#/home'))).toBe(false);
    expect(isFavRoute(R('#/home?tab=1&lfx=search'))).toBe(false);
    expect(favempty.match(R('#/home?tab=1'))).toBe(true);
    expect(favempty.match(R('#/home'))).toBe(false);
  });

  it('leerer Favoriten-Tab: Hinweis nach Ruhezeit; mit Karten: kein Hinweis; unmount entfernt', async () => {
    favempty.mount(R('#/home?tab=1'));
    expect(document.getElementById('lfx-plus-favempty')).toBeNull();
    await vi.advanceTimersByTimeAsync(1600);
    const el = document.getElementById('lfx-plus-favempty');
    expect(el.textContent).toBe(EMPTY_TEXT);
    expect(el.parentElement.id).toBe('favoritesTab');
    // Karte erscheint -> Hinweis verschwindet
    const card = document.createElement('div');
    card.className = 'card';
    document.getElementById('favoritesTab').append(card);
    await vi.advanceTimersByTimeAsync(1600);
    expect(document.getElementById('lfx-plus-favempty')).toBeNull();
    card.remove();
    await vi.advanceTimersByTimeAsync(1600);
    expect(document.getElementById('lfx-plus-favempty')).not.toBeNull();
    favempty.unmount();
    expect(document.getElementById('lfx-plus-favempty')).toBeNull();
  });
});
