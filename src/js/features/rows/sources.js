// LenzFlix rows: Zeilen-Definitionen (Endpoints + Parameter). Jede Zeile: {id, title, kind, load()} -> Item-Array.
import * as api from '../../core/api.js';
import { getCharts, resolveChartItems } from '../../core/charts.js';
import { BASE_PARAMS, NEW_DAYS, dayKey, pickGenres, selectTop10 } from './logic.js';

const MOVIE_SERIES = 'Movie,Series';

export function asItems(res) {
  if (Array.isArray(res)) return res;
  return (res && Array.isArray(res.Items) ? res.Items : []);
}

let newSeriesCache = { at: 0, promise: null };
const TEN_MIN = 10 * 60 * 1000;

/** Set der Serien-Ids mit Episoden, die jünger als 14 Tage sind (10 min gecacht). */
export function getNewSeriesIds(now = Date.now()) {
  if (newSeriesCache.promise && now - newSeriesCache.at < TEN_MIN) return newSeriesCache.promise;
  const since = new Date(now - NEW_DAYS * 86400000).toISOString();
  const promise = api
    .getItems({ IncludeItemTypes: 'Episode', MinDateCreated: since, Recursive: true, Fields: 'SeriesId', EnableImages: false, Limit: 500 })
    .then((res) => new Set(asItems(res).map((e) => e.SeriesId).filter(Boolean)))
    .catch((e) => {
      console.warn('[LenzFlix] Neue-Folgen-Abfrage fehlgeschlagen', e && e.message);
      newSeriesCache = { at: 0, promise: null };
      return new Set();
    });
  newSeriesCache = { at: now, promise };
  return promise;
}

export function resetSourceCache() {
  newSeriesCache = { at: 0, promise: null };
}

export const MIN_CHART_ROW = 5;

/** Echte Top-10-Zeilen (Serien/Filme), je nur mit >= 5 auflösbaren Titeln. Leer, wenn keine Charts. */
export async function buildChartDefs() {
  try {
    const charts = await getCharts();
    if (!charts) return [];
    const specs = [
      { id: 'top10-series', title: 'Top 10 Serien auf LENZFLIX', key: 'series' },
      { id: 'top10-movies', title: 'Top 10 Filme auf LENZFLIX', key: 'movies' },
    ];
    const defs = [];
    for (const s of specs) {
      const list = await resolveChartItems(charts[s.key], { limit: 10 });
      if (list.length >= MIN_CHART_ROW) defs.push({ id: s.id, title: s.title, kind: 'top10', load: () => list });
    }
    return defs;
  } catch (e) {
    console.warn('[LenzFlix] Chart-Zeilen nicht aufgebaut', e && e.message);
    return [];
  }
}

/** Baut die Zeilenliste (holt vorab Bibliotheken + Genres). */
export async function buildRowDefs({ seed = dayKey(), genreCount = 6 } = {}) {
  const [viewsRes, genresRes] = await Promise.allSettled([
    api.getViews(),
    api.getJson('/Genres', { userId: api.getUserId(), IncludeItemTypes: MOVIE_SERIES, Recursive: true }),
  ]);
  const views = viewsRes.status === 'fulfilled' ? asItems(viewsRes.value) : [];
  const genres = genresRes.status === 'fulfilled' ? asItems(genresRes.value) : [];
  const movieView = views.find((v) => v.CollectionType === 'movies');
  const tvView = views.find((v) => v.CollectionType === 'tvshows');

  const items = (params) => api.getItems({ ...BASE_PARAMS, ...params }).then(asItems);
  const defs = [];

  defs.push({
    id: 'resume', title: 'Weiterschauen', kind: 'resume',
    load: () => api.getResume({ ...BASE_PARAMS, MediaTypes: 'Video', Limit: 20 }).then(asItems),
  });
  defs.push({
    id: 'nextup', title: 'Als Nächstes', kind: 'landscape',
    load: () => api.getNextUp({ ...BASE_PARAMS, Limit: 20, EnableResumable: false, EnableRewatching: false }).then(asItems),
  });
  const chartDefs = await buildChartDefs();
  if (chartDefs.length) defs.push(...chartDefs);
  else {
    defs.push({
      id: 'top10', title: 'Top 10: Neu auf LENZFLIX', kind: 'top10',
      load: () => items({
        IncludeItemTypes: MOVIE_SERIES, Recursive: true, SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 10,
      }).then(selectTop10),
    });
  }
  if (movieView) {
    defs.push({
      id: 'latest-movies', title: 'Neu hinzugefügt: Filme', kind: 'landscape',
      load: () => api.getLatest({ ...BASE_PARAMS, ParentId: movieView.Id, GroupItems: true, Limit: 20 }).then(asItems),
    });
  }
  if (tvView) {
    defs.push({
      id: 'latest-series', title: 'Neu hinzugefügt: Serien', kind: 'landscape',
      load: () => api.getLatest({ ...BASE_PARAMS, ParentId: tvView.Id, GroupItems: true, Limit: 20 }).then(asItems),
    });
  }
  defs.push({
    id: 'favorites', title: 'Meine Liste', kind: 'landscape',
    load: () => items({ IncludeItemTypes: MOVIE_SERIES, Recursive: true, IsFavorite: true, SortBy: 'SortName', Limit: 50 }),
  });
  defs.push({
    id: 'because', title: null, kind: 'landscape',
    async load(def) {
      const played = await items({
        IncludeItemTypes: 'Movie,Episode', Recursive: true, Filters: 'IsPlayed', SortBy: 'DatePlayed', SortOrder: 'Descending', Limit: 1,
      });
      const last = played[0];
      if (!last) return [];
      const baseId = last.Type === 'Episode' ? last.SeriesId : last.Id;
      const name = last.Type === 'Episode' ? last.SeriesName : last.Name;
      if (!baseId || !name) return [];
      const similar = await api.getSimilar(baseId, { ...BASE_PARAMS, Limit: 20 }).then(asItems);
      if (similar.length) def.title = `Weil du ${name} angesehen hast`;
      return similar.filter((i) => i.Id !== baseId);
    },
  });
  for (const name of pickGenres(genres, { seed, count: genreCount })) {
    defs.push({
      id: `genre-${name}`, title: name, kind: 'landscape',
      async load() {
        const list = await items({ IncludeItemTypes: MOVIE_SERIES, Recursive: true, Genres: name, SortBy: 'Random', Limit: 20 });
        return list.length >= 8 ? list : [];
      },
    });
  }
  defs.push({
    id: 'toprated', title: 'Hochbewertet', kind: 'landscape',
    load: () => items({
      IncludeItemTypes: MOVIE_SERIES, Recursive: true, SortBy: 'CommunityRating', SortOrder: 'Descending', MinCommunityRating: 7.5, Limit: 20,
    }),
  });
  return defs;
}
