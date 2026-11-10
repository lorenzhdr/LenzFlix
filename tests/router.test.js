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

  it('zweiphasig: Unmounts vor Mounts bei gleichzeitigem Wechsel', () => {
    const log = [];
    const mk = (name, path) => ({
      name,
      match: (r) => r.path === path,
      mount: () => log.push(`mount ${name}`),
      unmount: () => log.push(`unmount ${name}`),
    });
    registerFeature(mk('a', '/tv')); // registriert zuerst, mountet beim Wechsel zuerst
    registerFeature(mk('b', '/home'));
    log.length = 0;
    nav('#/tv');
    expect(log).toEqual(['unmount b', 'mount a']);
  });

  it('Mounts in Registrierungsreihenfolge, match() vor jeder Aktion ausgewertet', () => {
    const log = [];
    registerFeature({ name: 'm1', match: () => { log.push('match m1'); return true; }, mount: () => log.push('mount m1'), unmount() {} });
    log.length = 0;
    registerFeature({ name: 'm2', match: () => { log.push('match m2'); return true; }, mount: () => log.push('mount m2'), unmount() {} });
    expect(log.slice(0, 2)).toEqual(['match m1', 'match m2']);
    expect(log.indexOf('mount m2')).toBeGreaterThan(log.indexOf('match m2'));
  });

  it('Wiedereintritt: reevaluate() im mount läuft nicht verschachtelt, sondern danach', async () => {
    const { reevaluate } = await import('../src/js/core/router.js');
    const log = [];
    let inMount = false;
    let nested = false;
    registerFeature({
      name: 'r1',
      match: () => true,
      mount() { inMount = true; log.push('mount r1'); reevaluate(); inMount = false; },
      update() { log.push('update r1'); },
      unmount() {},
    });
    registerFeature({
      name: 'r2',
      match: () => true,
      mount() { if (inMount) nested = true; log.push('mount r2'); },
      unmount() {},
    });
    expect(nested).toBe(false);
    expect(log.indexOf('mount r1')).toBeLessThan(log.indexOf('mount r2'));
    expect(log).toContain('update r1'); // Wiederholung nach Abschluss
  });

  it('abgemeldetes Feature wird in laufender Auswertung nicht mehr angefasst', async () => {
    const { unregisterFeature } = await import('../src/js/core/router.js');
    const b = { name: 'gone', match: () => true, mount: vi.fn(), unmount: vi.fn() };
    const b2 = { ...b, match: (r) => r.path === '/tv' };
    registerFeature({ name: 'first', match: (r) => r.path === '/tv', mount: () => unregisterFeature('gone'), unmount() {} });
    registerFeature(b2);
    nav('#/tv');
    expect(b2.mount).not.toHaveBeenCalled();
  });
});
