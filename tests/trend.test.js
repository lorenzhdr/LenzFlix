import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/js/core/charts.js', () => ({ getCharts: vi.fn() }));
vi.mock('../src/js/core/api.js', () => ({ getItems: vi.fn() }));

import { getCharts } from '../src/js/core/charts.js';
import { getTrendInfo, trendBadge, heroTrendLine, cardBadge } from '../src/js/shared/trend.js';

const ids = (p, n) => Array.from({ length: n }, (_, i) => ({ id: `${p}${i + 1}` }));
const newInfo = {
  bySeries: new Map([['s5', 'season'], ['s6', 'episode']]), newMovieIds: new Set(['m2']), newSeriesIds: new Set(['s7']),
};

describe('trend', () => {
  beforeEach(() => getCharts.mockReset());

  it('getTrendInfo ohne Charts', async () => {
    getCharts.mockResolvedValue(null);
    const t = await getTrendInfo();
    expect(t.available).toBe(false);
    expect(t.rank.size).toBe(0);
  });

  it('getTrendInfo mit Charts, Ids normalisiert', async () => {
    getCharts.mockResolvedValue({ movies: [{ id: 'AA-BB' }, { id: 'm2' }], series: [{ id: 's1' }], all: [] });
    const t = await getTrendInfo();
    expect(t.available).toBe(true);
    expect(t.rank.get('aabb')).toEqual({ rank: 1, type: 'Movie' });
    expect(t.rank.get('s1')).toEqual({ rank: 1, type: 'Series' });
  });

  it('Badges mit Charts', async () => {
    getCharts.mockResolvedValue({ movies: ids('m', 12), series: ids('s', 3), all: [] });
    const t = await getTrendInfo();
    expect(trendBadge({ Type: 'Movie', Id: 'm3' }, t)).toBe('AM BELIEBTESTEN');
    expect(trendBadge({ Type: 'Movie', Id: 'm4' }, t)).toBe('IM TREND');
    expect(trendBadge({ Type: 'Movie', Id: 'm11' }, t)).toBeNull();
    expect(trendBadge({ Type: 'Movie', Id: 'zz', CommunityRating: 9 }, t)).toBeNull();
    expect(trendBadge({ Type: 'Episode', Id: 'e', SeriesId: 's2' }, t)).toBe('AM BELIEBTESTEN');
    expect(heroTrendLine({ Type: 'Movie', Id: 'm4' }, t)).toBe('Platz 4 der Top 10');
    expect(heroTrendLine({ Type: 'Movie', Id: 'm11' }, t)).toBeNull();
  });

  it('Fallback ohne Charts', () => {
    const t = { available: false, rank: new Map() };
    expect(trendBadge({ Type: 'Movie', Id: 'a', CommunityRating: 8 }, t)).toBe('AM BELIEBTESTEN');
    expect(trendBadge({ Type: 'Series', Id: 'a', CommunityRating: 7.9 }, t)).toBeNull();
    expect(trendBadge({ Type: 'Episode', Id: 'a', CommunityRating: 9 }, t)).toBeNull();
    expect(trendBadge({ Type: 'Movie', Id: 'a', CommunityRating: 9 }, null)).toBe('AM BELIEBTESTEN');
    expect(heroTrendLine({ Type: 'Movie', Id: 'a', CommunityRating: 9 }, t)).toBeNull();
  });

  it('cardBadge Prioritaet', async () => {
    getCharts.mockResolvedValue({ movies: ids('m', 12), series: ids('s', 12), all: [] });
    const trend = await getTrendInfo();
    const opts = { newInfo, trend };
    expect(cardBadge({ Type: 'Series', Id: 's5' }, opts)).toBe('NEUE STAFFEL');
    expect(cardBadge({ Type: 'Series', Id: 's6' }, opts)).toBe('NEUE FOLGE');
    expect(cardBadge({ Type: 'Movie', Id: 'm2' }, opts)).toBe('NEUER FILM');
    expect(cardBadge({ Type: 'Series', Id: 's7' }, opts)).toBe('NEUE SERIE');
    expect(cardBadge({ Type: 'Movie', Id: 'm1' }, opts)).toBe('AM BELIEBTESTEN');
    expect(cardBadge({ Type: 'Movie', Id: 'm8' }, opts)).toBe('IM TREND');
    expect(cardBadge({ Type: 'Movie', Id: 'zz' }, opts)).toBeNull();
    expect(cardBadge({ Type: 'Movie', Id: 'zz' })).toBeNull();
  });
});
