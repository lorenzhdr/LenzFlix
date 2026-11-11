// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const state = vi.hoisted(() => ({ theme: 'live', modern: true, tv: false, ready: true }));

vi.mock('../src/js/core/theme.js', () => ({ isTheme: (id) => state.theme === id }));
vi.mock('../src/js/core/layout.js', () => ({ isModern: () => state.modern, isTv: () => state.tv }));
vi.mock('../src/js/core/api.js', () => ({ isReady: () => state.ready }));

import guard, { isAllowedRoute } from '../src/js/features/live/guard.js';
import { liveHomeRoute } from '../src/js/features/live/home-route.js';

const route = (path, q = '') => ({ path, params: new URLSearchParams(q), hash: `${path}${q ? `?${q}` : ''}` });

beforeEach(() => {
  state.theme = 'live';
  state.modern = true;
  state.tv = false;
  state.ready = true;
  document.body.className = '';
  window.location.hash = '#/movies';
});
afterEach(() => {
  guard.unmount();
});

describe('liveHomeRoute', () => {
  it('nur /home ohne lfx und ohne tab=1', () => {
    expect(liveHomeRoute(route('/home'))).toBe(true);
    expect(liveHomeRoute(route('/home', 'lfx=title&id=1'))).toBe(false);
    expect(liveHomeRoute(route('/home', 'lfx=new'))).toBe(false);
    expect(liveHomeRoute(route('/home', 'tab=1'))).toBe(false);
    expect(liveHomeRoute(route('/home', 'tab=0'))).toBe(true);
    expect(liveHomeRoute(route('/movies'))).toBe(false);
    expect(liveHomeRoute(null)).toBe(false);
  });
});

describe('erlaubte Routen', () => {
  it.each([
    '/home', '/dashboard', '/dashboard/users', '/dashboardgeneral', '/mypreferencesmenu', '/mypreferencesdisplay', '/userprofile',
    '/login', '/selectserver', '/addserver', '/startup', '/startup/user', '/wizard', '/forgotpassword', '/resetpassword', '/video', '/queue',
  ])('%s ist erlaubt', (p) => {
    expect(isAllowedRoute(route(p))).toBe(true);
    expect(guard.match(route(p))).toBe(false);
  });

  it('Admin-Seiten (body.dashboardDocument) sind erlaubt', () => {
    document.body.classList.add('dashboardDocument');
    expect(isAllowedRoute(route('/configurationpage'))).toBe(true);
  });

  it.each(['/movies', '/tv', '/details', '/list', '/search', '/music', '/livetv', '/mixed', '/boxsets', '/favorites'])('%s ist nicht erlaubt', (p) => {
    expect(isAllowedRoute(route(p))).toBe(false);
    expect(guard.match(route(p))).toBe(true);
  });

  it('/home mit lfx oder tab=1 ist nicht erlaubt', () => {
    expect(guard.match(route('/home', 'lfx=title&id=1'))).toBe(true);
    expect(guard.match(route('/home', 'tab=1'))).toBe(true);
    expect(guard.match(route('/home'))).toBe(false);
  });
});

describe('match-Bedingungen', () => {
  it('nur im Design live, Modern, kein TV, bereit', () => {
    const r = route('/movies');
    expect(guard.match(r)).toBe(true);
    state.theme = 'flix';
    expect(guard.match(r)).toBe(false);
    state.theme = 'live';
    state.modern = false;
    expect(guard.match(r)).toBe(false);
    state.modern = true;
    state.tv = true;
    expect(guard.match(r)).toBe(false);
    state.tv = false;
    state.ready = false;
    expect(guard.match(r)).toBe(false);
  });
});

describe('Umleitung', () => {
  it('ersetzt per location.replace auf #/home, ohne History-Eintrag, Pfad/Query bleiben', () => {
    const before = window.history.length;
    const { pathname, search } = window.location;
    window.location.hash = '#/details?id=1';
    const len = window.history.length;
    guard.mount(route('/details', 'id=1'));
    expect(window.location.hash).toBe('#/home');
    expect(window.location.pathname).toBe(pathname);
    expect(window.location.search).toBe(search);
    expect(window.history.length).toBe(len);
    expect(len).toBeGreaterThanOrEqual(before);
  });

  it('gleiche Route nicht doppelt, andere Route erneut; unmount setzt zurück', () => {
    guard.mount(route('/movies'));
    expect(window.location.hash).toBe('#/home');
    window.location.hash = '#/movies';
    guard.update(route('/movies')); // gleiche Route: keine zweite Umleitung
    expect(window.location.hash).toBe('#/movies');
    guard.update(route('/tv'));
    expect(window.location.hash).toBe('#/home');
    window.location.hash = '#/tv';
    guard.unmount();
    guard.mount(route('/tv'));
    expect(window.location.hash).toBe('#/home');
  });

  it('nach Design-Wechsel weg von live leitet der Wächter nicht mehr um', () => {
    const r = route('/details', 'id=1');
    expect(guard.match(r)).toBe(true);
    state.theme = 'flix'; // Rückkehr (leave.js), danach Navigation zum Titel
    expect(guard.match(r)).toBe(false);
  });
});
