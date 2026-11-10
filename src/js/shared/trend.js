// LenzFlix shared: Trend-/Beliebtheits-Badges aus den echten Charts (core/charts.js), mit Fallback.
import { getCharts } from '../core/charts.js';
import { newBadge } from './newcontent.js';

const norm = (id) => String(id || '').replace(/-/g, '').toLowerCase();

/** { available, rank: Map<normalisierte Id, {rank, type}> } – rank ist 1-basiert je Typ (Filme / Serien). */
export async function getTrendInfo() {
  const rank = new Map();
  let charts;
  try { charts = await getCharts(); } catch { charts = null; }
  if (!charts) return { available: false, rank };
  const add = (list, type) => {
    (Array.isArray(list) ? list : []).forEach((e, i) => {
      const key = norm(e && e.id);
      if (key && !rank.has(key)) rank.set(key, { rank: i + 1, type });
    });
  };
  add(charts.movies, 'Movie');
  add(charts.series, 'Series');
  return { available: true, rank };
}

function entryFor(item, trend) {
  if (!item || !trend || !trend.available || !trend.rank) return null;
  const id = item.Type === 'Episode' ? item.SeriesId : item.Id;
  return trend.rank.get(norm(id)) || null;
}

export function trendBadge(item, trend) {
  if (!item) return null;
  if (!trend || !trend.available) {
    return (item.Type === 'Movie' || item.Type === 'Series') && Number(item.CommunityRating) >= 8 ? 'AM BELIEBTESTEN' : null;
  }
  const e = entryFor(item, trend);
  if (!e) return null;
  if (e.rank <= 3) return 'AM BELIEBTESTEN';
  if (e.rank <= 10) return 'IM TREND';
  return null;
}

export function heroTrendLine(item, trend) {
  const e = entryFor(item, trend);
  return e && e.rank <= 10 ? `Platz ${e.rank} der Top 10` : null;
}

/** Genau ein Badge: NEUE STAFFEL > NEUE FOLGE > NEUER FILM/NEUE SERIE > AM BELIEBTESTEN > IM TREND. */
export function cardBadge(item, { newInfo, trend } = {}) {
  return newBadge(item, newInfo) || trendBadge(item, trend);
}
