// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';

vi.mock('../src/js/core/api.js', async () => {
  const actual = await vi.importActual('../src/js/core/api.js');
  return {
    ...actual,
    isReady: () => true,
    getUserId: () => 'u1',
    getAuth: () => ({ address: 'http://x', userId: 'u1', token: 't', serverId: 'srv' }),
    getItems: vi.fn(),
    setFavorite: vi.fn(),
  };
});

import * as api from '../src/js/core/api.js';
import { dateParts, sinceLabel, hasPlayCounts } from '../src/js/features/newpopular/format.js';
import feature, { loadMostWatched } from '../src/js/features/newpopular.js';
import { resetSourceCache } from '../src/js/features/rows/sources.js';

const mk = (id, type, extra = {}) => ({ Id: id, Name: id, Type: type, DateCreated: '2026-11-08T12:00:00Z', ...extra });

describe('Format', () => {
  it('Datum deutsch', () => {
    expect(dateParts('2026-11-08T12:00:00Z')).toEqual({ month: 'NOV', day: '08' });
    expect(dateParts('2026-03-21T12:00:00Z')).toEqual({ month: 'MÄR', day: '21' });
    expect(dateParts('kaputt')).toBeNull();
  });
  it('sinceLabel', () => {
    const now = Date.parse('2026-11-09T00:00:00Z');
    expect(sinceLabel(mk('m', 'Movie'), new Set(), now)).toBe('Neu seit 8. November 2026');
    const old = mk('s', 'Series', { DateCreated: '2025-01-01T00:00:00Z' });
    expect(sinceLabel(old, new Set(['s']), now)).toBe('Neue Folgen');
  });
  it('hasPlayCounts', () => {
    expect(hasPlayCounts([{ UserData: { PlayCount: 0 } }, {}])).toBe(false);
    expect(hasPlayCounts([{ UserData: { PlayCount: 2 } }])).toBe(true);
  });
});

describe('PlayCount-Fallback', () => {
  beforeEach(() => api.getItems.mockReset());
  it('nutzt PlayCount, wenn vorhanden', async () => {
    api.getItems.mockResolvedValueOnce({ Items: [mk('a', 'Movie', { UserData: { PlayCount: 3 } })] });
    expect((await loadMostWatched()).map((i) => i.Id)).toEqual(['a']);
    expect(api.getItems).toHaveBeenCalledTimes(1);
  });
  it('fällt auf CommunityRating zurück, wenn alle 0', async () => {
    api.getItems
      .mockResolvedValueOnce({ Items: [mk('a', 'Movie', { UserData: { PlayCount: 0 } })] })
      .mockResolvedValueOnce({ Items: [mk('b', 'Movie')] });
    expect((await loadMostWatched()).map((i) => i.Id)).toEqual(['b']);
    expect(api.getItems.mock.calls[1][0].SortBy).toBe('CommunityRating');
  });
});

describe('Mount/Unmount', () => {
  beforeEach(() => {
    resetSourceCache();
    api.getItems.mockReset();
    api.getItems.mockImplementation(async (p) => {
      if (p.IncludeItemTypes === 'Episode') return { Items: [] };
      return { Items: [mk('i1', 'Movie', { UserData: { PlayCount: 1 } }), mk('i2', 'Series')] };
    });
    document.body.innerHTML = '<div id="indexPage"><div id="homeTab"><div class="sections"></div><div id="lfx-home"></div></div></div>';
  });
  afterEach(() => { feature.unmount(); document.body.innerHTML = ''; });

  it('match nur bei lfx=new', () => {
    const route = (q) => ({ path: '/home', params: new URLSearchParams(q) });
    expect(feature.match(route('lfx=new'))).toBe(true);
    expect(feature.match(route(''))).toBe(false);
  });

  it('baut Container, setzt Klasse, räumt auf', async () => {
    feature.mount();
    await vi.waitFor(() => expect(document.getElementById('lfx-newpopular')).not.toBeNull(), { timeout: 2000 });
    expect(document.documentElement.classList.contains('lfx-newpopular-on')).toBe(true);
    expect(document.getElementById('homeTab').firstElementChild.id).toBe('lfx-newpopular');
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-np__entry').length).toBe(2));
    expect(document.querySelector('.lfx-np__month').textContent).toMatch(/^[A-ZÄ]{3}$/);
    await vi.waitFor(() => expect(document.querySelectorAll('.lfx-card[data-lfx-id]').length).toBeGreaterThan(0));
    expect(document.querySelectorAll('.lfx-np__pill').length).toBe(4);
    feature.unmount();
    expect(document.getElementById('lfx-newpopular')).toBeNull();
    expect(document.documentElement.classList.contains('lfx-newpopular-on')).toBe(false);
  });

  it('CSS blendet #lfx-home aus', () => {
    const css = fs.readFileSync('src/css/js-ui/newpopular.css', 'utf8');
    expect(css).toMatch(/lfx-newpopular-on[^{]*#lfx-home/);
  });
});
