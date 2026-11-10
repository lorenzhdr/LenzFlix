// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    isReady: () => true,
    getUserId: () => 'u1',
    getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }),
    getItems: vi.fn().mockResolvedValue({ Items: [] }),
  };
});
vi.mock('../src/js/core/playback.js', () => ({ play: vi.fn() }));

import * as api from '../src/js/core/api.js';
import { play } from '../src/js/core/playback.js';
import { createPosterCard, createResumeCard, remainingLabel, episodeLine, yearGenres } from '../src/js/features/plus/card.js';
import { renderRows } from '../src/js/features/plus/rows.js';
import { buildBrandRow } from '../src/js/features/plus/brands.js';
import { clearCache } from '../src/js/core/cache.js';

const movie = {
  Id: 'm1', Name: 'Film', Type: 'Movie', ProductionYear: 2019, Genres: ['Drama', 'Krimi', 'Thriller', 'Western'],
  ImageTags: { Primary: 'p', Logo: 'l' }, OfficialRating: 'FSK-16',
};
const ep = {
  Id: 'e1', Name: 'Schwarze Liebe', Type: 'Episode', SeriesName: 'Serie', SeriesId: 's1', ParentIndexNumber: 7, IndexNumber: 1,
  RunTimeTicks: 60 * 600000000, UserData: { PlaybackPositionTicks: 38 * 600000000 }, ImageTags: { Primary: 'x' }, OfficialRating: 'FSK-12',
};

describe('Karten-Helfer', () => {
  it('remainingLabel', () => {
    expect(remainingLabel(ep)).toBe('Noch 22 Min.');
    expect(remainingLabel({ RunTimeTicks: 130 * 600000000, UserData: { PlaybackPositionTicks: 5 * 600000000 } })).toBe('Noch 2 Std. 5 Min.');
    expect(remainingLabel({ RunTimeTicks: 10, UserData: {} })).toBe('');
  });
  it('episodeLine / yearGenres', () => {
    expect(episodeLine(ep)).toBe('S7:F1 Schwarze Liebe');
    expect(episodeLine(movie)).toBe('2019 • Drama, Krimi, Thriller');
    expect(yearGenres({})).toBe('');
  });
});

describe('Karten-Markup', () => {
  it('Poster erfüllt den Kartenvertrag, Badge-Overlay nur mit badge', () => {
    const plain = createPosterCard(movie);
    expect(plain.matches('.lfx-card[data-lfx-id="m1"][data-lfx-type="Movie"]')).toBe(true);
    expect(plain.querySelector('a.lfx-card__link img.lfx-card__img')).not.toBeNull();
    expect(plain.querySelector('.lfx-plus-card__new')).toBeNull();
    const withBadge = createPosterCard(movie, { badge: 'Neuer Film' });
    expect(withBadge.querySelector('.lfx-plus-badge').textContent).toBe('Neuer Film');
    expect(withBadge.querySelector('.lfx-plus-card__logo')).not.toBeNull();
  });
  it('Poster ohne Bild zeigt Titeltext', () => {
    const c = createPosterCard({ Id: 'x', Name: 'Ohne Bild', Type: 'Movie' });
    expect(c.querySelector('img.lfx-card__img')).toBeNull();
    expect(c.querySelector('.lfx-plus-card__fallback').textContent).toBe('Ohne Bild');
  });
  it('Weiterschauen: Fortschritt, drei Infozeilen, Play ruft play()', () => {
    const c = createResumeCard(ep);
    expect(c.querySelector('.lfx-plus-progress__bar').style.width).toBe('63.3%');
    expect(c.querySelector('.lfx-plus-card__rest').textContent).toBe('Noch 22 Min.');
    expect(c.querySelector('.lfx-plus-card__name').textContent).toBe('Serie');
    expect(c.querySelector('.lfx-plus-card__sub').textContent).toContain('S7:F1 Schwarze Liebe');
    c.querySelector('.lfx-plus-card__play').click();
    expect(play).toHaveBeenCalledWith(ep, { resume: true });
  });
});

describe('Sammlungs-Kacheln', () => {
  it('leer -> null, sonst Kacheln mit Titelseiten-Link', () => {
    expect(buildBrandRow([])).toBeNull();
    const el = buildBrandRow([{ id: 'c1', name: 'Reihe', imageUrl: null }, { id: 'c2', name: 'Bild', imageUrl: 'http://x/i.jpg' }]);
    const tiles = el.querySelectorAll('a.lfx-plus-brand');
    expect(tiles).toHaveLength(2);
    expect(tiles[0].getAttribute('href')).toBe('#/home?lfx=title&id=c1');
    expect(tiles[0].textContent).toBe('Reihe');
    expect(tiles[1].querySelector('img')).not.toBeNull();
  });
});

describe('renderRows', () => {
  let slot;
  beforeEach(() => {
    clearCache();
    slot = document.createElement('div');
    document.body.append(slot);
    delete globalThis.IntersectionObserver; // jsdom: ohne Observer laden alle Zeilen sofort
    api.getItems.mockResolvedValue({ Items: [] });
  });
  afterEach(() => { document.body.innerHTML = ''; });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('lädt Zeilen, unterscheidet resume/poster, entfernt leere Zeilen, räumt auf', async () => {
    const defs = [
      { id: 'resume', title: 'Weiterschauen', kind: 'resume', load: async () => [ep] },
      { id: 'a', title: 'Neu', kind: 'landscape', load: async () => [movie, { ...movie, Id: 'm2' }] },
      { id: 'leer', title: 'Leer', kind: 'poster', load: async () => [] },
      { id: 'kaputt', title: 'Fehler', kind: 'poster', load: async () => { throw new Error('x'); } },
    ];
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const cleanup = renderRows(slot, async () => defs);
    await flush(); await flush(); await flush();
    const rows = slot.querySelectorAll('.lfx-plus-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].querySelector('.lfx-plus-card--resume')).not.toBeNull();
    expect(rows[1].querySelectorAll('.lfx-plus-card--poster')).toHaveLength(2);
    expect(rows[1].querySelector('.lfx-plus-row__title').textContent).toBe('Neu');
    cleanup();
    expect(slot.children).toHaveLength(0);
    warn.mockRestore();
  });
});
