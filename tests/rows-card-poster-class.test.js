// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

let hasPoster = true;
vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }),
    imageUrl: (it, o) => (o && o.type === 'Primary' && hasPoster ? 'http://x/p.jpg' : null),
    landscapeImage: () => null,
    logoImage: () => null,
    pickLandscape: () => ({ url: 'http://x/b.jpg', isThumb: false }),
  };
});

const { createCard } = await import('../src/js/features/rows/card.js');
const item = { Id: 'm1', Type: 'Movie', Name: 'Film' };

describe('createCard: Poster-Markierung (Handy-Raster blendet den Titel nur mit Poster aus)', () => {
  it('mit Poster trägt der Link lfx-card__link--poster', () => {
    hasPoster = true;
    const link = createCard(item).querySelector('a.lfx-card__link');
    expect(link.classList.contains('lfx-card__link--poster')).toBe(true);
  });

  it('ohne Poster fehlt die Klasse, der Titel bleibt im Link', () => {
    hasPoster = false;
    const card = createCard(item);
    expect(card.querySelector('a.lfx-card__link').classList.contains('lfx-card__link--poster')).toBe(false);
    expect(card.querySelector('.lfx-card__title').textContent).toBe('Film');
  });
});
