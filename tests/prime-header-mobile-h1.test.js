// @vitest-environment jsdom
// LENZPRIME Handy-Kopfzeile: pro Seite nur eine h1 (Titelseite hat eine eigene h1, Kopfzeilen-Titel dort ein div).
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ isReady: () => true, getUserId: () => 'u1' }));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: vi.fn(() => true), getTheme: () => 'prime', brandName: () => 'LENZPRIME' }));
vi.mock('../src/js/core/layout.js', () => ({ isMobile: () => true, isNarrow: () => true, isModern: () => true, isTv: () => false }));
vi.mock('../src/js/shared/libraries.js', () => ({ getLibraries: vi.fn(async () => []) }));
vi.mock('../src/js/shared/collections.js', () => ({ getCollections: vi.fn(async () => []) }));
vi.mock('../src/js/shared/profile.js', () => ({ getUserChip: vi.fn(async () => ({ name: 'Lena', imageUrl: null })), profileEntries: vi.fn(async () => []) }));
vi.mock('../src/js/shared/search.js', () => ({ searchItems: vi.fn(async () => ({ movies: [], series: [], episodes: [], people: [] })) }));

import { parseHash } from '../src/js/core/router.js';
import header from '../src/js/features/prime/header.js';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('prime-header: Handy-Titel-Tag', () => {
  afterEach(() => header.unmount());

  it('Titelseite (lfx=title): Kopfzeilen-Titel ist keine h1', async () => {
    document.body.innerHTML = '<h1 class="lfx-pt__logo-h1"><img class="lfx-pt__logo" alt="Chernobyl"></h1>';
    await header.mount(parseHash('#/home?lfx=title&id=c1'));
    await flush();
    const t = document.querySelector('.lfx-prime-header__title');
    expect(t.tagName).toBe('DIV');
    expect(document.querySelectorAll('h1').length).toBe(1);
  });

  it('andere Unterseiten: Kopfzeilen-Titel bleibt h1', async () => {
    document.body.innerHTML = '';
    await header.mount(parseHash('#/home?lfx=new'));
    await flush();
    expect(document.querySelector('.lfx-prime-header__title').tagName).toBe('H1');
  });
});
