// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({
  getViews: vi.fn(async () => ({ Items: [] })),
  getUserId: () => 'u1',
  isReady: () => true,
}));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: vi.fn(() => true), getTheme: () => 'flix' }));
vi.mock('../src/js/core/themepicker.js', () => ({ openThemePicker: vi.fn() }));

import { isTheme } from '../src/js/core/theme.js';
import tvbtn from '../src/js/features/tvbtn.js';
import { features } from '../src/js/features/index.js';
import { activeKey, navItems, buildNavModel } from '../src/js/features/nav.js';
import { overlayItems } from '../src/js/features/mobilenav.js';
import { removeAllMounts } from '../src/js/core/dom.js';
import { parseHash } from '../src/js/core/router.js';

const btn = () => document.getElementById('lfx-tvm-btn');

describe('tvbtn', () => {
  beforeEach(() => {
    document.body.innerHTML = '<header class="MuiAppBar-root"></header>';
    document.documentElement.className = '';
    isTheme.mockImplementation(() => true);
  });
  afterEach(() => {
    tvbtn.unmount();
    document.documentElement.className = '';
  });

  it('match: Startseite und Unterseite, Desktop und Handy', () => {
    expect(tvbtn.match(parseHash('#/home'))).toBe(true);
    expect(tvbtn.match(parseHash('#/details?id=1'))).toBe(true);
    document.documentElement.className = 'layout-mobile';
    expect(tvbtn.match(parseHash('#/home'))).toBe(true);
  });

  it('match: nicht im Player, Dashboard, TV-Layout, anderen Designs, ohne AppBar', () => {
    expect(tvbtn.match(parseHash('#/video'))).toBe(false);
    expect(tvbtn.match(parseHash('#/dashboard'))).toBe(false);
    document.documentElement.className = 'layout-tv';
    expect(tvbtn.match(parseHash('#/home'))).toBe(false);
    document.documentElement.className = '';
    isTheme.mockImplementation((id) => id !== 'flix');
    expect(tvbtn.match(parseHash('#/home'))).toBe(false);
    isTheme.mockImplementation(() => true);
    document.body.innerHTML = '';
    expect(tvbtn.match(parseHash('#/home'))).toBe(false);
  });

  it('ist in der Feature-Liste nach nav', () => {
    const names = features.map((f) => f.name);
    expect(names.indexOf('tvbtn')).toBeGreaterThan(names.indexOf('nav'));
  });

  it('Link mit href, Beschriftung, Icon und data-key', () => {
    tvbtn.mount(parseHash('#/home'));
    const a = btn();
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toBe('#/home?lfx=tv');
    expect(a.getAttribute('aria-label')).toBe('TV');
    expect(a.title).toBe('TV');
    expect(a.dataset.key).toBe('tv');
    expect(a.querySelector('svg')).not.toBeNull();
    expect(document.documentElement.classList.contains('lfx-tvbtn-on')).toBe(true);
  });

  it('aktiv nur auf #/home?lfx=tv', () => {
    tvbtn.mount(parseHash('#/home'));
    expect(btn().classList.contains('is-active')).toBe(false);
    expect(btn().hasAttribute('aria-current')).toBe(false);
    tvbtn.update(parseHash('#/home?lfx=tv'));
    expect(btn().classList.contains('is-active')).toBe(true);
    expect(btn().getAttribute('aria-current')).toBe('page');
    tvbtn.update(parseHash('#/home?lfx=new'));
    expect(btn().classList.contains('is-active')).toBe(false);
    expect(btn().hasAttribute('aria-current')).toBe(false);
  });

  it('Klick feuert lfx:tvmode-intent synchron ohne preventDefault', () => {
    tvbtn.mount(parseHash('#/home'));
    const seen = [];
    const on = () => seen.push('intent');
    window.addEventListener('lfx:tvmode-intent', on);
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true });
    btn().dispatchEvent(ev);
    window.removeEventListener('lfx:tvmode-intent', on);
    expect(seen).toEqual(['intent']);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('unmount und destroy räumen auf', () => {
    tvbtn.mount(parseHash('#/home'));
    tvbtn.unmount();
    expect(btn()).toBeNull();
    expect(document.documentElement.classList.contains('lfx-tvbtn-on')).toBe(false);
    tvbtn.mount(parseHash('#/home'));
    removeAllMounts();
    expect(btn()).toBeNull();
  });

  it('Nav: activeKey tv, aber kein Text-Eintrag „TV“ in navItems/Mehr-Overlay', () => {
    const model = buildNavModel({ Items: [] });
    expect(activeKey(parseHash('#/home?lfx=tv'), model)).toBe('tv');
    expect(navItems(model).some((i) => i.key === 'tv' || i.label === 'TV')).toBe(false);
    expect(overlayItems(model).some((i) => i.key === 'tv' || i.label === 'TV')).toBe(false);
  });
});
