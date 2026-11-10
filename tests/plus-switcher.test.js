// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ isReady: () => true }));
vi.mock('../src/js/core/theme.js', () => ({
  isTheme: vi.fn((id) => id === 'plus'),
  getTheme: () => 'plus',
  brandName: () => 'LENZ+',
}));
const libs = [
  { id: 'm1', name: 'Filme', collectionType: 'movies', href: '#/movies?topParentId=m1', hubCapable: true },
  { id: 'x1', name: 'Musik', collectionType: 'music', href: '#/music?topParentId=x1', hubCapable: false },
];
vi.mock('../src/js/shared/libraries.js', () => ({ getLibraries: vi.fn(async () => libs) }));

import sw, { isSwitcherRoute, switcherTabs, activeTab } from '../src/js/features/plus/switcher.js';
import { parseHash } from '../src/js/core/router.js';

const R = (h) => parseHash(h);
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('plus-switcher', () => {
  beforeEach(() => {
    document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
  });
  afterEach(() => {
    sw.unmount();
    document.documentElement.className = '';
  });

  it('Routen: Startseite und Hubs', () => {
    expect(isSwitcherRoute(R('#/home'))).toBe(true);
    expect(isSwitcherRoute(R('#/home?lfx=hub&lib=m1'))).toBe(true);
    expect(isSwitcherRoute(R('#/home?tab=1'))).toBe(false);
    expect(isSwitcherRoute(R('#/home?lfx=new'))).toBe(false);
    expect(isSwitcherRoute(R('#/home?lfx=title&id=1'))).toBe(false);
    expect(isSwitcherRoute(R('#/movies'))).toBe(false);
  });

  it('match: Modern-Layout + LENZ+ + passende Route', () => {
    expect(sw.match(R('#/home'))).toBe(true);
    expect(sw.match(R('#/home?lfx=browse&lib=m1'))).toBe(false);
    document.documentElement.classList.add('layout-tv');
    expect(sw.match(R('#/home'))).toBe(false);
  });

  it('Tabs: Hub-fähige -> Hub, sonst nativ', () => {
    const tabs = switcherTabs(libs);
    expect(tabs.map((t) => t.href)).toEqual(['#/home', '#/home?lfx=hub&lib=m1', '#/music?topParentId=x1']);
    expect(activeTab(R('#/home'))).toBe('foryou');
    expect(activeTab(R('#/home?lfx=hub&lib=m1'))).toBe('lib:m1');
  });

  it('mount rendert Pille mit aktivem Tab; unmount räumt auf', async () => {
    sw.mount(R('#/home?lfx=hub&lib=m1'));
    await flush();
    const root = document.getElementById('lfx-plus-switcher');
    const tabs = [...root.querySelectorAll('[role="tab"]')];
    expect(tabs.map((t) => t.textContent)).toEqual(['Für dich', 'Filme', 'Musik']);
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect(tabs[0].classList.contains('is-active')).toBe(false);
    sw.update(R('#/home'));
    expect(tabs[0].classList.contains('is-active')).toBe(true);
    sw.unmount();
    expect(document.getElementById('lfx-plus-switcher')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-plus-switcher-on')).toBe(false);
  });
});
