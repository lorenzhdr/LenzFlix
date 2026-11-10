// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    getAuth: () => ({ address: 'http://x', userId: 'u1', token: 'SECRET', serverId: 'srv' }),
    imageUrl: (item, { type = 'Primary', maxWidth } = {}) => (item.ImageTags && item.ImageTags[type] ? `http://x/Items/${item.Id}/Images/${type}?maxWidth=${maxWidth}&tag=${item.ImageTags[type]}` : null),
    imageUrlFor: (id, { type = 'Primary', maxWidth, tag } = {}) => `http://x/Items/${id}/Images/${type}?maxWidth=${maxWidth}&tag=${tag}`,
    landscapeImage: (item) => (item.BackdropImageTags && item.BackdropImageTags[0] ? `http://x/Items/${item.Id}/Images/Backdrop?tag=${item.BackdropImageTags[0]}` : null),
    pickLandscape: () => ({ type: 'Backdrop' }),
  };
});

const { createTapeCard, toneFor, TAPE_VARIANTS } = await import('../src/js/features/retro/card.js');

const movie = {
  Id: 'm1', Type: 'Movie', Name: 'Neon Läufer', ProductionYear: 1984, Genres: ['Sci-Fi'],
  ImageTags: { Primary: 'p1' }, BackdropImageTags: ['b1'],
  RunTimeTicks: 6000000000, UserData: { PlaybackPositionTicks: 3000000000 },
};

describe('createTapeCard', () => {
  it('Kartenvertrag: Klassen, data-Attribute, href, aria-label', () => {
    const card = createTapeCard(movie);
    expect(card.classList.contains('lfx-card')).toBe(true);
    expect(card.classList.contains('lfx-retro-card')).toBe(true);
    expect(card.classList.contains('lfx-retro-card--spine')).toBe(true);
    expect(card.dataset.lfxId).toBe('m1');
    expect(card.dataset.lfxType).toBe('Movie');
    expect(card.getAttribute('role')).toBe('listitem');
    const link = card.querySelector('a.lfx-card__link');
    expect(link.getAttribute('href')).toBe('#/home?lfx=title&id=m1');
    expect(link.getAttribute('aria-label')).toBe('Neon Läufer');
    expect(card.querySelector('img.lfx-card__img')).toBeTruthy();
  });

  it('keine api_key/Token in Bild-URLs', () => {
    for (const variant of TAPE_VARIANTS) {
      const img = createTapeCard(movie, { variant }).querySelector('img');
      expect(img.getAttribute('src')).not.toMatch(/api_key|SECRET/i);
    }
  });

  it('spine: Etikett mit Titel, Jahr, Streifen, Abnutzung; Fortschritt aus UserData', () => {
    const card = createTapeCard(movie, { variant: 'spine' });
    expect(card.querySelector('.lfx-retro-card__spine-title').textContent).toBe('Neon Läufer');
    expect(card.querySelector('.lfx-retro-card__year').textContent).toBe('1984');
    expect(card.querySelector('.lfx-retro-card__stripe')).toBeTruthy();
    expect(card.querySelector('.lfx-retro-card__wear')).toBeTruthy();
    expect(card.querySelector('.lfx-retro-card__bar').style.width).toBe('50%');
    expect(card.dataset.tone).toBe(String(toneFor(movie)));
  });

  it('cover: Poster-URL, Beschriftung, expliziter Fortschritt, 0 = kein Balken', () => {
    const card = createTapeCard(movie, { variant: 'cover', progress: 25 });
    expect(card.classList.contains('lfx-retro-card--cover')).toBe(true);
    expect(card.querySelector('img').getAttribute('src')).toContain('/Images/Primary');
    expect(card.querySelector('.lfx-retro-card__cap-title').textContent).toBe('Neon Läufer');
    expect(card.querySelector('.lfx-retro-card__bar').style.width).toBe('25%');
    expect(createTapeCard(movie, { variant: 'cover', progress: 0 }).querySelector('.lfx-retro-card__bar')).toBeNull();
  });

  it('wide: Episode zeigt Serientitel, aria-label mit Folgenname, Querformat-Bild', () => {
    const ep = { Id: 'e1', Type: 'Episode', Name: 'Pilot', SeriesName: 'Neon Serie', ImageTags: { Primary: 'e' }, BackdropImageTags: [] };
    const card = createTapeCard(ep, { variant: 'wide' });
    expect(card.classList.contains('lfx-retro-card--wide')).toBe(true);
    expect(card.querySelector('.lfx-retro-card__cap-title').textContent).toBe('Neon Serie');
    expect(card.querySelector('a').getAttribute('aria-label')).toBe('Neon Serie – Pilot');
    expect(card.querySelector('.lfx-retro-card__progress')).toBeNull();
  });

  it('ohne Bild: Titel-Fallback (cover) bzw. nur Etikett (spine); unbekannte Variante -> spine', () => {
    const bare = { Id: 'x', Type: 'Series', Name: 'Ohne Bild' };
    const cover = createTapeCard(bare, { variant: 'cover' });
    expect(cover.querySelector('img')).toBeNull();
    expect(cover.querySelector('.lfx-card__title').textContent).toBe('Ohne Bild');
    const odd = createTapeCard(bare, { variant: 'quatsch' });
    expect(odd.classList.contains('lfx-retro-card--spine')).toBe(true);
    expect(odd.querySelector('img')).toBeNull();
  });

  it('toneFor ist stabil und liegt in 0..4', () => {
    expect(toneFor(movie)).toBe(toneFor({ ...movie, Id: 'other' }));
    expect(toneFor({ Id: 'zz' })).toBeGreaterThanOrEqual(0);
    expect(toneFor({ Id: 'zz' })).toBeLessThan(5);
  });
});
