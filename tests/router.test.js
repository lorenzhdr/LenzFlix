// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { parseHash, onRoute, registerFeature, resetRouter, isFeatureMounted } from '../src/js/core/router.js';

beforeEach(() => {
  window.location.hash = '#/home';
});
afterEach(() => resetRouter());

const nav = (hash) => {
  window.location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
};

describe('router', () => {
  it('parseHash', () => {
    const r = parseHash('#/movies?topParentId=x&collectionType=movies');
    expect(r.path).toBe('/movies');
    expect(r.params.get('topParentId')).toBe('x');
    expect(parseHash('').path).toBe('/home');
    expect(parseHash('#/dashboard/').path).toBe('/dashboard');
  });

  it('onRoute feuert initial, bei hashchange und viewshow; unsubscribe', () => {
    const fn = vi.fn();
    const off = onRoute(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    nav('#/tv');
    const calls = fn.mock.calls.length;
    expect(fn).toHaveBeenLastCalledWith(expect.objectContaining({ path: '/tv' }));
    document.dispatchEvent(new CustomEvent('viewshow'));
    expect(fn).toHaveBeenCalledTimes(calls + 1);
    off();
    nav('#/home');
    expect(fn).toHaveBeenCalledTimes(calls + 1);
  });

  it('Feature: mount nur bei match, unmount beim Verlassen, idempotent', () => {
    const f = {
      name: 'x',
      match: (r) => r.path === '/home',
      mount: vi.fn(),
      unmount: vi.fn(),
      update: vi.fn(),
    };
    registerFeature(f);
    registerFeature(f);
    expect(f.mount).toHaveBeenCalledTimes(1);
    expect(isFeatureMounted('x')).toBe(true);
    nav('#/home?tab=1');
    expect(f.mount).toHaveBeenCalledTimes(1);
    expect(f.update).toHaveBeenCalled();
    nav('#/details?id=1');
    expect(f.unmount).toHaveBeenCalledTimes(1);
    expect(isFeatureMounted('x')).toBe(false);
    nav('#/home');
    expect(f.mount).toHaveBeenCalledTimes(2);
    resetRouter();
    expect(f.unmount).toHaveBeenCalledTimes(2);
  });

  it('Fehler in einem Feature blockieren andere nicht', () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const good = { name: 'good', match: () => true, mount: vi.fn(), unmount: vi.fn() };
    registerFeature({ name: 'bad', match: () => true, mount() { throw new Error('boom'); }, unmount() {} });
    registerFeature(good);
    expect(good.mount).toHaveBeenCalled();
    err.mockRestore();
  });
});
