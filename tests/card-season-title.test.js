// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }),
    imageUrl: () => null,
    landscapeImage: () => null,
    logoImage: () => null,
    pickLandscape: () => null,
  };
});

const { createCard } = await import('../src/js/features/rows/card.js');
const { createTapeCard } = await import('../src/js/features/retro/card.js');

const season = { Id: 'se5', Type: 'Season', Name: 'Staffel 5', SeriesName: 'Babylon Berlin', ProductionYear: 2026 };

describe('Staffel-Karten zeigen den Seriennamen', () => {
  it('rows/card: aria-label und Titel', () => {
    const card = createCard(season);
    expect(card.querySelector('a.lfx-card__link').getAttribute('aria-label')).toBe('Babylon Berlin – Staffel 5');
    expect(card.querySelector('.lfx-card__title').textContent).toBe('Babylon Berlin');
  });

  it('retro/card: aria-label und Etikett (Rücken, Hülle, 16:9)', () => {
    for (const variant of ['spine', 'cover', 'wide']) {
      const card = createTapeCard(season, { variant });
      expect(card.querySelector('a.lfx-card__link').getAttribute('aria-label')).toBe('Babylon Berlin – Staffel 5');
      const t = card.querySelector('.lfx-retro-card__spine-title, .lfx-retro-card__cap-title');
      expect(t.textContent).toBe('Babylon Berlin');
    }
  });

  it('Staffel ohne SeriesName bleibt unverändert', () => {
    const card = createTapeCard({ Id: 'x', Type: 'Season', Name: 'Staffel 1' });
    expect(card.querySelector('a.lfx-card__link').getAttribute('aria-label')).toBe('Staffel 1');
  });
});
