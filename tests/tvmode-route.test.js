// @vitest-environment jsdom
// Route #/home?lfx=tv: Nebenwirkungen auf die Startseiten-Features und Umleitung unter LENZ LIVE (Wächter).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = vi.hoisted(() => ({ theme: 'live', modern: true, tv: false, ready: true }));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: (id) => state.theme === id }));
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => state.modern, isTv: () => state.tv }));
vi.mock('../src/js/core/api.js', () => ({ isReady: () => state.ready }));

import guard from '../src/js/features/live/guard.js';
import { liveHomeRoute } from '../src/js/features/live/home-route.js';
import { isSwitcherRoute } from '../src/js/features/plus/switcher.js';
import { isFavRoute } from '../src/js/features/plus/favempty.js';
import { primeHomeRoute } from '../src/js/features/prime/home-route.js';
import { retroHomeRoute } from '../src/js/features/retro/home-route.js';
import { routeKey } from '../src/js/features/plus/home.js';
import { parseHash } from '../src/js/core/router.js';

const tv = parseHash('#/home?lfx=tv');

beforeEach(() => {
  state.theme = 'live';
  window.location.hash = '#/home?lfx=tv';
});
afterEach(() => guard.unmount());

describe('lfx=tv ist nie Startseite', () => {
  it('Startseiten-Features sind nicht zuständig', () => {
    expect(liveHomeRoute(tv)).toBe(false);
    expect(isSwitcherRoute(tv)).toBe(false);
    expect(isFavRoute(tv)).toBe(false);
    expect(primeHomeRoute(tv)).toBeNull();
    expect(retroHomeRoute(tv)).toBeNull();
    expect(routeKey(tv)).toBeNull();
  });
});

describe('LENZ LIVE: Wächter leitet lfx=tv auf #/home um', () => {
  it('match und location.replace', () => {
    expect(guard.match(tv)).toBe(true);
    const before = window.history.length;
    guard.mount(tv);
    expect(window.location.hash).toBe('#/home');
    expect(window.history.length).toBe(before);
  });
});
