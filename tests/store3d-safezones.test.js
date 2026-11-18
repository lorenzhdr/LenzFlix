import { describe, it, expect } from 'vitest';
import { isSafe, inSafeZone } from '../src/js/store3d/fight/safezones.js';

describe('fight/safezones', () => {
  it('offen ohne Schutzgrund', () => {
    expect(isSafe({ area: 'street' })).toBe(null);
    expect(isSafe(null)).toBe(null);
    expect(inSafeZone({})).toBe(false);
  });
  it('Gründe', () => {
    expect(isSafe({ cinemaPlaying: true })).toBe('cinema');
    expect(isSafe({ inKids: true })).toBe('kids');
    expect(isSafe({ couchSeated: true })).toBe('couch');
    expect(isSafe({ salonBusy: true })).toBe('salon');
    expect(isSafe({ menu: true })).toBe('menu');
    expect(isSafe({ xr: true, cinemaPlaying: true })).toBe('xr');
    expect(inSafeZone({ inKids: true })).toBe(true);
  });
});
