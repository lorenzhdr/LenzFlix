import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/js/core/api.js', () => ({ getItems: vi.fn() }));

import * as api from '../src/js/core/api.js';
import { clearCache } from '../src/js/core/cache.js';
import { newContentFrom, getNewContentInfo, newBadge, plusBadge } from '../src/js/shared/newcontent.js';

const NOW = Date.parse('2026-11-10T12:00:00Z');
const ago = (d) => new Date(NOW - d * 86400000).toISOString();

describe('newContentFrom', () => {
  it('Staffel-Regel: E1 einer Staffel > 1 = season, sonst episode, season gewinnt', () => {
    const m = newContentFrom([
      { SeriesId: 'a', DateCreated: ago(1), IndexNumber: 3, ParentIndexNumber: 2 },
      { SeriesId: 'a', DateCreated: ago(1), IndexNumber: 1, ParentIndexNumber: 2 },
      { SeriesId: 'a', DateCreated: ago(1), IndexNumber: 4, ParentIndexNumber: 2 },
      { SeriesId: 'b', DateCreated: ago(2), IndexNumber: 1, ParentIndexNumber: 1 },
      { SeriesId: 'c', DateCreated: ago(2), IndexNumber: 5, ParentIndexNumber: 1 },
    ], NOW);
    expect(m.get('a')).toBe('season');
    expect(m.get('b')).toBe('episode');
    expect(m.get('c')).toBe('episode');
  });

  it('Zeitfenster', () => {
    const eps = [{ SeriesId: 'a', DateCreated: ago(20), IndexNumber: 1, ParentIndexNumber: 2 }];
    expect(newContentFrom(eps, NOW).size).toBe(0);
    expect(newContentFrom(eps, NOW, { days: 30 }).get('a')).toBe('season');
    expect(newContentFrom([{ SeriesId: 'a', DateCreated: 'x' }, null, { DateCreated: ago(1) }], NOW).size).toBe(0);
  });
});

describe('Badges', () => {
  const info = {
    bySeries: new Map([['s1', 'season'], ['s2', 'episode'], ['s3', 'episode']]),
    newMovieIds: new Set(['m1']),
    newSeriesIds: new Set(['s3', 's4']),
  };

  it('Texte und Prioritaet', () => {
    expect(newBadge({ Type: 'Movie', Id: 'm1' }, info)).toBe('NEUER FILM');
    expect(newBadge({ Type: 'Movie', Id: 'm2' }, info)).toBeNull();
    expect(newBadge({ Type: 'Series', Id: 's1' }, info)).toBe('NEUE STAFFEL');
    expect(newBadge({ Type: 'Series', Id: 's2' }, info)).toBe('NEUE FOLGE');
    expect(newBadge({ Type: 'Series', Id: 's3' }, info)).toBe('NEUE SERIE');
    expect(newBadge({ Type: 'Series', Id: 's4' }, info)).toBe('NEUE SERIE');
    expect(newBadge({ Type: 'Episode', Id: 'e', SeriesId: 's1' }, info)).toBe('NEUE STAFFEL');
    expect(newBadge({ Type: 'Series', Id: 'zz' }, info)).toBeNull();
    expect(newBadge(null, info)).toBeNull();
    expect(newBadge({ Type: 'Movie', Id: 'm1' }, null)).toBeNull();
  });

  it('plusBadge in Satzschreibweise', () => {
    expect(plusBadge({ Type: 'Movie', Id: 'm1' }, info)).toBe('Neuer Film');
    expect(plusBadge({ Type: 'Series', Id: 's1' }, info)).toBe('Neue Staffel');
    expect(plusBadge({ Type: 'Series', Id: 's2' }, info)).toBe('Neue Folge');
    expect(plusBadge({ Type: 'Series', Id: 's4' }, info)).toBe('Neue Serie');
    expect(plusBadge({ Type: 'Series', Id: 'zz' }, info)).toBeNull();
  });
});

describe('getNewContentInfo', () => {
  beforeEach(() => {
    clearCache();
    api.getItems.mockReset();
  });

  it('ein Episoden-Aufruf, Clientfilter nach Datum, gecacht', async () => {
    const recent = new Date().toISOString();
    const old = new Date(Date.now() - 40 * 86400000).toISOString();
    api.getItems.mockImplementation(async (p) => {
      if (p.IncludeItemTypes === 'Episode') {
        return { Items: [{ SeriesId: 's1', DateCreated: recent, IndexNumber: 1, ParentIndexNumber: 3 }, { SeriesId: 's2', DateCreated: old }] };
      }
      return { Items: [{ Id: 'm1', Type: 'Movie', DateCreated: recent }, { Id: 'm2', Type: 'Movie', DateCreated: old }, { Id: 's9', Type: 'Series', DateCreated: recent }] };
    });
    const info = await getNewContentInfo();
    expect(info.bySeries.get('s1')).toBe('season');
    expect(info.bySeries.has('s2')).toBe(false);
    expect([...info.newMovieIds]).toEqual(['m1']);
    expect([...info.newSeriesIds]).toEqual(['s9']);
    const ep = api.getItems.mock.calls.map((c) => c[0]).find((p) => p.IncludeItemTypes === 'Episode');
    expect(ep).toMatchObject({ Recursive: true, SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 500 });
    expect(ep.Fields).toContain('ParentIndexNumber');
    expect(ep.MinDateCreated).toBeUndefined();
    await getNewContentInfo();
    expect(api.getItems).toHaveBeenCalledTimes(2);
  });

  it('Fehler -> leere Info', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    api.getItems.mockRejectedValue(new Error('x'));
    const info = await getNewContentInfo();
    expect(info.bySeries.size + info.newMovieIds.size + info.newSeriesIds.size).toBe(0);
  });
});
