// LenzFlix rows: Zeilen-Definitionen (Endpoints + Parameter). Jede Zeile: {id, title, kind, load()} -> Item-Array.
import * as api from '../../core/api.js';
import { brandName } from '../../core/theme.js';
import { cached, clearCache, peekCached, HOME_TTL, homeKey } from '../../core/cache.js';
import { getCharts, getChartsUrl, resolveChartItems } from '../../core/charts.js';
import { BASE_PARAMS, dayKey, newSeriesIdsFrom, pickGenres, selectTop10 } from './logic.js';

const MOVIE_SERIES = 'Movie,Series';

export function asItems(res) {
  if (Array.isArray(res)) return res;
  return (res && Array.isArray(res.Items) ? res.Items : []);
}

let newSeriesCache = { at: 0, promise: null, value: null };
const TEN_MIN = 10 * 60 * 1000;
const NEW_SERIES_LIMIT = 200;

function storageKey() {
  return `lfx-newseries:${api.getUserId() || 'anon'}`;
}

function readStored(now) {
  try {
    const raw = JSON.parse(sessionStorage.getItem(storageKey()) || 'null');
    if (raw && Array.isArray(raw.ids) && now - raw.at >= 0 && now - raw.at < TEN_MIN) return new Set(raw.ids);
  } catch { /* ignorieren */ }
  return null;
}

function writeStored(now, set) {
  try { sessionStorage.setItem(storageKey(), JSON.stringify({ at: now, ids: [...set] })); } catch { /* ignorieren */ }
}

/** Sofort verfügbares Set (Speicher/sessionStorage, < 10 min) oder null – blockiert nie. */
export function peekNewSeriesIds(now = Date.now()) {
  if (newSeriesCache.value && now - newSeriesCache.at < TEN_MIN) return newSeriesCache.value;
  return readStored(now);
}

/**
 * Set der Serien-Ids für „Neue Folgen“ (10 min gecacht, auch in sessionStorage), Regel siehe newSeriesIdsFrom().
 * Hinweis (live geprüft): Jellyfin 12.4 ignoriert `MinDateCreated` bei /Items – deshalb nach
 * DateCreated absteigend sortieren und clientseitig filtern.
 */
export function getNewSeriesIds(now = Date.now()) {
  if (newSeriesCache.promise && now - newSeriesCache.at < TEN_MIN) return newSeriesCache.promise;
  const stored = readStored(now);
  if (stored) {
    newSeriesCache = { at: now, promise: Promise.resolve(stored), value: stored };
    return newSeriesCache.promise;
  }
  const promise = api
    .getItems({
      IncludeItemTypes: 'Episode', Recursive: true, SortBy: 'DateCreated', SortOrder: 'Descending',
      Fields: 'SeriesId,DateCreated,PremiereDate', EnableImages: false, EnableUserData: false, Limit: NEW_SERIES_LIMIT,
    })
    .then((res) => {
      const set = newSeriesIdsFrom(asItems(res), now);
      if (newSeriesCache.promise === promise) newSeriesCache.value = set;
      writeStored(now, set);
      return set;
    })
    .catch((e) => {
      console.warn('[LenzFlix] Neue-Folgen-Abfrage fehlgeschlagen', e && e.message);
      if (newSeriesCache.promise === promise) newSeriesCache = { at: 0, promise: null, value: null };
      return new Set();
    });
  newSeriesCache = { at: now, promise, value: null };
  return promise;
}

export function resetSourceCache() {
  newSeriesCache = { at: 0, promise: null, value: null };
  try { sessionStorage.removeItem(storageKey()); } catch { /* ignorieren */ }
}

export const MIN_CHART_ROW = 5;

function chartSpecs() {
  return [
    { id: 'top10-series', title: `Top 10 Serien auf ${brandName()}`, key: 'series' },
    { id: 'top10-movies', title: `Top 10 Filme auf ${brandName()}`, key: 'movies' },
  ];
}

/** Echte Top-10-Zeilen (Serien/Filme), je nur mit >= 5 auflösbaren Titeln. Leer, wenn keine Charts. */
export async function buildChartDefs() {
  try {
    const charts = await getCharts();
    if (!charts) return [];
    const specs = chartSpecs();
    const lists = await Promise.all(specs.map((s) => resolveChartItems(charts[s.key], { limit: 10 })));
    const defs = [];
    specs.forEach((s, i) => {
      const list = lists[i];
      if (list.length >= MIN_CHART_ROW) defs.push({ id: s.id, title: s.title, kind: 'top10', load: () => list });
    });
    return defs;
  } catch (e) {
    console.warn('[LenzFlix] Chart-Zeilen nicht aufgebaut', e && e.message);
    return [];
  }
}

const VIEWS_TTL = 5 * 60_000;

const degraded = new WeakSet(); // Zeilenlisten ohne Bibliotheken/Genres: nicht cachen

/** Zeilen-Ergebnis 10 min pro Nutzer cachen (Zufalls-Sortierung bleibt gleich); Snapshot {items, id, title} wegen Titel-/Id-Anpassungen. */
function wrapRow(def) {
  const key = homeKey(api.getUserId(), 'row', def.id);
  const orig = def.load;
  def.cacheKey = key;
  def.load = async (d = def) => {
    const snap = await cached(key, async () => ({ items: await orig(d), id: d.id, title: d.title }), HOME_TTL);
    d.id = snap.id;
    d.title = snap.title;
    return snap.items;
  };
  return def;
}

const defsKey = ({ seed = dayKey(), genreCount = 6, deferCharts = false } = {}) =>
  homeKey(api.getUserId(), 'defs', seed, genreCount, deferCharts ? 1 : 0);

/** Sofort verfügbare Zeilenliste (Cache, < 10 min) oder undefined. */
export const peekRowDefs = (opts) => peekCached(defsKey(opts));

/** Gecachte Zeilenliste (10 min, pro Nutzer) – siehe computeRowDefs. */
export function buildRowDefs(opts = {}) {
  const key = defsKey(opts);
  const p = cached(key, () => computeRowDefs(opts), HOME_TTL);
  p.then((defs) => { if (degraded.has(defs)) clearCache(key); }, () => {});
  return p;
}

/**
 * Baut die Zeilenliste (holt vorab Bibliotheken + Genres).
 * deferCharts: Charts blockieren nicht; zwei Platzhalter-Zeilen (Serien/Filme) füllen sich nach. Gibt es keine Charts,
 * zeigt die erste die „Neu auf“-Zeile (Titel/Id werden dann angepasst), die zweite bleibt leer (Zeile entfällt).
 */
async function computeRowDefs({ seed = dayKey(), genreCount = 6, deferCharts = false } = {}) {
  const [viewsRes, genresRes] = await Promise.allSettled([
    cached(`views:${api.getUserId()}`, api.getViews, VIEWS_TTL),
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
  const newTop10 = () => items({
    IncludeItemTypes: MOVIE_SERIES, Recursive: true, SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 10,
  }).then(selectTop10);
  const fallbackDef = () => ({ id: 'top10', title: `Top 10: Neu auf ${brandName()}`, kind: 'top10', load: newTop10 });
  if (deferCharts) {
    if (!getChartsUrl()) defs.push(fallbackDef());
    else {
      const chartDefs = buildChartDefs(); // einmal gestartet, beide Platzhalter teilen das Ergebnis
      const specs = chartSpecs();
      specs.forEach((s, i) => {
        defs.push({
          id: s.id, title: s.title, kind: 'top10',
          async load(def) {
            const found = await chartDefs;
            if (found.length) {
              const hit = found.find((d) => d.id === s.id);
              return hit ? hit.load() : [];
            }
            if (i !== 0) return [];
            const fb = fallbackDef(); // keine Charts: erste Platzhalter-Zeile wird zur „Neu auf“-Zeile
            def.id = fb.id;
            def.title = fb.title;
            return fb.load();
          },
        });
      });
    }
  } else {
    const chartDefs = await buildChartDefs();
    if (chartDefs.length) defs.push(...chartDefs);
    else defs.push(fallbackDef());
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
  defs.forEach(wrapRow);
  if (viewsRes.status !== 'fulfilled' || genresRes.status !== 'fulfilled') degraded.add(defs);
  return defs;
}
