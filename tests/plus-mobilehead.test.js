// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ isReady: () => true }));
vi.mock('../src/js/core/theme.js', () => ({
  isTheme: vi.fn((id) => id === 'plus'),
  getTheme: () => 'plus',
  brandName: () => 'LENZ+',
}));
const layout = { mobile: true };
vi.mock('../src/js/core/layout.js', () => ({
  isModern: () => true,
  isTv: () => false,
  isMobile: () => layout.mobile,
}));
const libs = [{ id: 'm1', name: 'Filme', collectionType: 'movies', href: '#/movies?topParentId=m1', hubCapable: true }];
vi.mock('../src/js/shared/libraries.js', () => ({ getLibraries: vi.fn(async () => libs) }));

import head, { headerTitle, showsBack } from '../src/js/features/plus/mobilehead.js';
import header from '../src/js/features/plus/header.js';
import { parseHash } from '../src/js/core/router.js';

const R = (h) => parseHash(h);
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('plus-mobilehead: Modell', () => {
  it('Titel je Route', () => {
    expect(headerTitle(R('#/home'), libs)).toBe('Für dich');
    expect(headerTitle(R('#/home?tab=1'), libs)).toBe('Meine Liste');
    expect(headerTitle(R('#/home?lfx=hub&lib=m1'), libs)).toBe('Filme');
    expect(headerTitle(R('#/home?lfx=browse&lib=m1'), libs)).toBe('Filme');
    expect(headerTitle(R('#/home?lfx=new'), libs)).toBe('Neu & beliebt');
    expect(headerTitle(R('#/home?lfx=search'), libs)).toBe('Suche');
    expect(headerTitle(R('#/home?lfx=tv'), libs)).toBe('TV');
    expect(headerTitle(R('#/home?lfx=title&id=1'), libs)).toBe('');
    expect(headerTitle(R('#/mypreferencesmenu'), libs)).toBe('Einstellungen');
  });
  it('Zurück-Pfeil nur auf Nicht-Home-Routen', () => {
    expect(showsBack(R('#/home'))).toBe(false);
    expect(showsBack(R('#/home?tab=1'))).toBe(false);
    expect(showsBack(R('#/home?lfx=hub&lib=m1'))).toBe(false);
    expect(showsBack(R('#/home?lfx=title&id=1'))).toBe(true);
    expect(showsBack(R('#/home?lfx=search'))).toBe(true);
    expect(showsBack(R('#/home?lfx=tv'))).toBe(true);
    expect(showsBack(R('#/movies?topParentId=m1'))).toBe(true);
    expect(showsBack(R('#/mypreferencesmenu'))).toBe(true);
  });
});

describe('plus-mobilehead: Feature', () => {
  beforeEach(() => {
    document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
    layout.mobile = true;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  });
  afterEach(() => {
    head.unmount();
    document.documentElement.className = '';
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
  });

  it('match nur mobil; Desktop-Kopfzeile genau umgekehrt', () => {
    expect(head.match(R('#/home'))).toBe(true);
    expect(header.match(R('#/home'))).toBe(false);
    expect(head.match(R('#/video'))).toBe(false);
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1024 });
    layout.mobile = false;
    expect(head.match(R('#/home'))).toBe(false);
    expect(header.match(R('#/home'))).toBe(true);
  });

  it('mount: Titel, Zurück-Knopf (history.back), Blur beim Scrollen, Aufräumen', async () => {
    const back = vi.spyOn(window.history, 'back').mockImplementation(() => {});
    head.mount(R('#/home?lfx=hub&lib=m1'));
    await flush();
    const root = document.getElementById('lfx-plus-mhead');
    expect(root).toBeTruthy();
    expect(root.querySelector('.lfx-plus-mhead__title').textContent).toBe('Filme');
    expect(root.querySelector('.lfx-plus-mhead__back').hidden).toBe(true);
    const tv = root.querySelector('.lfx-plus-mhead__tv');
    expect(tv.getAttribute('href')).toBe('#/home?lfx=tv');
    expect(tv.dataset.key).toBe('tv');
    expect(tv.classList.contains('is-active')).toBe(false);
    const intent = vi.fn();
    window.addEventListener('lfx:tvmode-intent', intent);
    tv.click();
    window.removeEventListener('lfx:tvmode-intent', intent);
    expect(intent).toHaveBeenCalledTimes(1);
    head.update(R('#/home?lfx=tv'));
    expect(tv.getAttribute('aria-current')).toBe('page');
    expect(root.querySelector('.lfx-plus-mhead__title').textContent).toBe('TV');
    head.update(R('#/home?lfx=search'));
    expect(root.querySelector('.lfx-plus-mhead__title').textContent).toBe('Suche');
    const btn = root.querySelector('.lfx-plus-mhead__back');
    expect(btn.hidden).toBe(false);
    btn.click();
    expect(back).toHaveBeenCalled();
    expect(root.classList.contains('is-solid')).toBe(false);
    window.scrollY = 120;
    window.dispatchEvent(new Event('scroll'));
    await new Promise((r) => setTimeout(r, 40));
    expect(root.classList.contains('is-solid')).toBe(true);
    window.scrollY = 0;
    head.unmount();
    expect(document.getElementById('lfx-plus-mhead')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-plus-mhead-on')).toBe(false);
    back.mockRestore();
  });
});
