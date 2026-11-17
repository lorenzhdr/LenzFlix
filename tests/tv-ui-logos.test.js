// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { LOGO_COLORS, channelColor, shortName } from '../src/js/tv/ui/logos.js';

describe('Senderlogos', () => {
  it('18 Sender haben 18 eindeutige Farben', () => {
    expect(LOGO_COLORS.length).toBe(18);
    const set = new Set(Array.from({ length: 18 }, (_, i) => channelColor(i + 1)));
    expect(set.size).toBe(18);
  });

  it('Kurznamen: feste Sender, Genre gekürzt', () => {
    expect(shortName({ no: 1, key: 'kino', name: 'LIVE Kino' })).toBe('KINO');
    expect(shortName({ no: 2, key: 'klassik', name: 'LIVE Klassik' })).toBe('KLASSIK');
    expect(shortName({ no: 7, key: 'genre:dokumentation', name: 'LIVE Dokumentation', genreLabel: 'Dokumentation' })).toBe('DOKUMENTA');
    expect(shortName({ no: 8, key: 'genre:x', name: 'LIVE Action' })).toBe('ACTION');
  });
});
