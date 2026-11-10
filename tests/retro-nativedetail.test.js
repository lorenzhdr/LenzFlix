// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ isReady: () => true }));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: vi.fn((id) => id === 'retro') }));
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false }));

import nativedetail from '../src/js/features/retro/nativedetail.js';
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

describe('retro-nativedetail', () => {
  let ImageBackup;
  beforeEach(() => {
    isTheme.mockImplementation((id) => id === 'retro');
    ImageBackup = globalThis.Image;
  });
  afterEach(() => {
    nativedetail.unmount();
    document.body.innerHTML = '';
    globalThis.Image = ImageBackup;
  });

  it('match: nur retro + /details', () => {
    expect(nativedetail.name).toBe('retro-nativedetail');
    expect(nativedetail.match(R('#/details?id=1'))).toBe(true);
    expect(nativedetail.match(R('#/home'))).toBe(false);
    isTheme.mockImplementation((id) => id === 'plus');
    expect(nativedetail.match(R('#/details?id=1'))).toBe(false);
  });

  it('ohne Logo und Backdrop: Zustandsklassen; unmount entfernt sie', () => {
    document.body.innerHTML = page('', 'hide', '');
    nativedetail.mount(R('#/details?id=1'));
    const p = document.getElementById('itemDetailPage');
    expect(p.classList.contains('lfx-retro-nologo')).toBe(true);
    expect(p.classList.contains('lfx-retro-nobackdrop')).toBe(true);
    nativedetail.unmount();
    expect(p.classList.contains('lfx-retro-nologo')).toBe(false);
    expect(p.classList.contains('lfx-retro-nobackdrop')).toBe(false);
  });

  it('mit Logo und Backdrop: keine Klassen', () => {
    globalThis.Image = class { set src(v) { this._s = v; } };
    document.body.innerHTML = page('background-image: url(/L.png)', '', 'background-image: url(/B.jpg)');
    nativedetail.mount(R('#/details?id=1'));
    const p = document.getElementById('itemDetailPage');
    expect(p.classList.contains('lfx-retro-nologo')).toBe(false);
    expect(p.classList.contains('lfx-retro-nobackdrop')).toBe(false);
  });
});

describe('openModal -> Titelseite', () => {
  it('Karten-Klicks leiten bei Design ≠ flix auf titleHref um (modal.js)', async () => {
    const src = await import('node:fs').then((fs) => fs.readFileSync('src/js/features/modal.js', 'utf8'));
    expect(src).toMatch(/theme !== 'flix'/);
    expect(src).toMatch(/location\.hash = titleHref\(id\)/);
  });
});
