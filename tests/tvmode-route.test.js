// @vitest-environment jsdom
// Route #/home?lfx=tv: Nebenwirkungen auf die Startseiten-Features und sonst keine Seite außer dem TV-Modus.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const state = vi.hoisted(() => ({ theme: 'flix', modern: true, tv: false, ready: true }));
vi.mock('../src/js/core/theme.js', () => ({ isTheme: (id) => state.theme === id }));
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => state.modern, isTv: () => state.tv }));
vi.mock('../src/js/core/api.js', () => ({ isReady: () => state.ready }));

import { isSwitcherRoute } from '../src/js/features/plus/switcher.js';
import { isFavRoute } from '../src/js/features/plus/favempty.js';
import { primeHomeRoute } from '../src/js/features/prime/home-route.js';
import { retroHomeRoute } from '../src/js/features/retro/home-route.js';
import { routeKey } from '../src/js/features/plus/home.js';
import { parseHash } from '../src/js/core/router.js';

const tv = parseHash('#/home?lfx=tv');

beforeEach(() => {
  state.theme = 'flix';
  window.location.hash = '#/home?lfx=tv';
});

describe('lfx=tv ist nie Startseite', () => {
  it('Startseiten-Features sind nicht zuständig', () => {
    expect(isSwitcherRoute(tv)).toBe(false);
    expect(isFavRoute(tv)).toBe(false);
    expect(primeHomeRoute(tv)).toBeNull();
    expect(retroHomeRoute(tv)).toBeNull();
    expect(routeKey(tv)).toBeNull();
  });
});
