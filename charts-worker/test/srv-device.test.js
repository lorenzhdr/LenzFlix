import { describe, expect, it } from 'vitest';
import { deviceKind } from '../src/srv/device.js';
import { makeLimiter } from '../src/srv/rate.js';

describe('deviceKind', () => {
  it.each([
    ['Jellyfin Android TV', 'Shield', 'tv'],
    ['Samsung Smart TV', 'Wohnzimmer', 'tv'],
    ['Jellyfin webOS', 'LG', 'tv'],
    ['Jellyfin Web', 'Tizen', 'tv'],
    ['Jellyfin Roku', 'Roku Ultra', 'tv'],
    ['Jellyfin tvOS', 'Apple TV', 'tv'],
    ['Jellyfin iOS', "Lorenz' iPhone", 'phone'],
    ['Jellyfin Web', 'Safari iPhone', 'phone'],
    ['Jellyfin Web', 'Chrome Android', 'phone'],
    ['Jellyfin Android', 'Pixel 8', 'phone'],
    ['Jellyfin Web', 'iPad', 'phone'],
    ['Jellyfin Web', 'Chrome', 'web'],
    ['Jellyfin Web', 'Edge Chromium', 'web'],
    ['Jellyfin Web', 'Firefox', 'web'],
    ['LENZFLIX', 'Mein PC', 'web'],
    ['Foo', 'Bar', 'other'],
  ])('%s / %s -> %s', (c, d, k) => {
    expect(deviceKind(c, d)).toBe(k);
  });
  it('Rückfall bei fehlenden Werten', () => {
    expect(deviceKind()).toBe('other');
    expect(deviceKind(null, 5)).toBe('other');
    expect(deviceKind('Jellyfin Web', undefined)).toBe('web');
  });
});

describe('makeLimiter', () => {
  it('Grenze und Fenster', () => {
    const l = makeLimiter({ max: 2, windowMs: 1000 });
    expect(l.hit('a', 0)).toBe(true);
    expect(l.hit('a', 10)).toBe(true);
    expect(l.hit('a', 20)).toBe(false);
    expect(l.hit('b', 20)).toBe(true);
    expect(l.hit('a', 1001)).toBe(true);
  });
  it('cap begrenzt die Schlüsselzahl', () => {
    const l = makeLimiter({ max: 1, windowMs: 1000, cap: 3 });
    for (const k of ['a', 'b', 'c', 'd']) expect(l.hit(k, 0)).toBe(true);
    // a wurde verdrängt -> wieder erlaubt
    expect(l.hit('a', 1)).toBe(true);
    expect(l.hit('d', 2)).toBe(false);
  });
  it('clear leert', () => {
    const l = makeLimiter({ max: 1 });
    expect(l.hit('x')).toBe(true);
    expect(l.hit('x')).toBe(false);
    l.clear();
    expect(l.hit('x')).toBe(true);
  });
});
