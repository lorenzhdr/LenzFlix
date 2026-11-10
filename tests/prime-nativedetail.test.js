// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ isReady: () => true }));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: vi.fn((id) => id === 'prime') }));
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => true, isTv: () => false }));

import nativedetail from '../src/js/features/prime/nativedetail.js';
import { parseHash } from '../src/js/core/router.js';
import { isTheme } from '../src/js/core/theme.js';

const R = (h) => parseHash(h);
const page = (logoStyle, logoClass) => `
<div id="itemDetailPage" class="page">
  <div class="detailLogo ${logoClass || ''}" style="${logoStyle || ''}"></div>
  <div class="nameContainer"><h1 class="itemName">Arcane</h1></div>
</div>`;

describe('prime-nativedetail', () => {
  let ImageBackup;
  beforeEach(() => {
    isTheme.mockImplementation((id) => id === 'prime');
    ImageBackup = globalThis.Image;
    globalThis.Image = class { set src(v) { this._s = v; } };
  });
  afterEach(() => {
    nativedetail.unmount();
    document.body.innerHTML = '';
    globalThis.Image = ImageBackup;
  });
  const cls = () => document.getElementById('itemDetailPage').classList;

  it('match: nur prime + /details', () => {
    expect(nativedetail.match(R('#/details?id=1'))).toBe(true);
    expect(nativedetail.match(R('#/home'))).toBe(false);
    isTheme.mockImplementation((id) => id === 'plus');
    expect(nativedetail.match(R('#/details?id=1'))).toBe(false);
  });

  it('sichtbares Logo: keine Klasse; kein Logo oder display:none: lfx-prime-nologo', () => {
    document.body.innerHTML = page('background-image: url(/L.png)');
    nativedetail.mount(R('#/details?id=1'));
    expect(cls().contains('lfx-prime-nologo')).toBe(false);
    nativedetail.unmount();
    document.body.innerHTML = page('', 'hide');
    nativedetail.mount(R('#/details?id=1'));
    expect(cls().contains('lfx-prime-nologo')).toBe(true);
    nativedetail.unmount();
    expect(cls().contains('lfx-prime-nologo')).toBe(false);
    document.body.innerHTML = page('background-image: url(/L.png); display: none');
    nativedetail.mount(R('#/details?id=1'));
    expect(cls().contains('lfx-prime-nologo')).toBe(true);
  });
});
