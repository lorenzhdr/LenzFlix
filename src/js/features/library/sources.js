// LenzFlix library: Datenschicht für die Seiten „Serien“ und „Filme“ (alle Bibliotheken des Typs zusammen, ohne ParentId).
// Zeilen-Defs im Format von rows/sources.js ({id,title,kind,load}); alle Ids tragen den Präfix `lib:<kind>:<genreId|all>:`.
import * as api from '../../core/api.js';
import { brandName } from '../../core/theme.js';
import { cached, HOME_TTL, homeKey } from '../../core/cache.js';
import { putItems } from '../../core/itemstore.js';
import { getCharts, getChartsUrl, resolveChartItems } from '../../core/charts.js';
import { buildPool } from '../billboard/format.js';
import { BASE_PARAMS, dayKey, pickGenres, selectTop10 } from '../rows/logic.js';
import { asItems, wrapRow, chartSpecs, MIN_CHART_ROW } from '../rows/sources.js';

export const LIB_TYPES = { series: 'Series', movies: 'Movie' };
const RESUME_TYPES = { series: 'Episode', movies: 'Movie' };
const MIN_ROW = 8;
const DECADES = [2020, 2010, 2000, 1990, 1980];
const HERO_FIELDS = `${BASE_PARAMS.Fields},RemoteTrailers,LocalTrailerCount`;

const typeOf = (kind) => LIB_TYPES[kind] || LIB_TYPES.movies;
const idPrefix = (kind, genre) => `lib:${kind}:${genre || 'all'}:`;
/** Sortierung „zuletzt hinzugefügt“: bei Serien zählt der letzte neue Inhalt (neue Folgen). */
const newSort = (kind) => (kind === 'series' ? 'DateLastContentAdded' : 'DateCreated');

/** Cache-Schlüssel des Hero-Pools (für das Billboard). */
export function libraryPoolKey(kind, genre) {
  return homeKey(api.getUserId(), 'lib', kind, genre || 'all', 'pool');
}

/** Genres der Bibliotheken dieses Typs: [{id, name}], nach Name sortiert, 10 min pro Nutzer gecacht. */
export function getLibraryGenres(kind) {
  const key = homeKey(api.getUserId(), 'lib', kind, 'genres');
  return cached(key, async () => {
    const res = await api.getJson('/Genres', {
      userId: api.getUserId(), IncludeItemTypes: typeOf(kind), Recursive: true, SortBy: 'SortName',
    });
    return asItems(res)
      .filter((g) => g && g.Id && g.Name)
      .map((g) => ({ id: g.Id, name: g.Name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  }, HOME_TTL);
}

const normId = (id) => String(id || '').replace(/-/g, '').toLowerCase();

/** Gehört das Item (direkt) zum Genre? null = unbekannt (keine Genre-Angaben am Item). */
function itemInGenre(it, genreId, genreName) {
  const items = Array.isArray(it.GenreItems) ? it.GenreItems : null;
  if (items && items.length) return items.some((g) => normId(g.Id) === normId(genreId));
  const names = Array.isArray(it.Genres) ? it.Genres : null;
  if (names && names.length) return names.includes(genreName);
  return null;
}

/** Weiterschauen im Genre: Filme clientseitig; Folgen ohne eigene Genres über die Serie (eine Zusatzabfrage). */
async function filterByGenre(list, kind, genre, genreName) {
  const keep = [];
  const unknown = [];
  for (const it of list) {
    const r = itemInGenre(it, genre, genreName);
    if (r === true) keep.push(it);
    else if (r === null) unknown.push(it);
  }
  if (unknown.length) {
    const baseId = (it) => (it.Type === 'Episode' ? it.SeriesId : it.Id);
    const ids = [...new Set(unknown.map(baseId).filter(Boolean))];
    if (ids.length) {
      try {
        const hits = new Set(asItems(await api.getItems({
          Ids: ids.join(','), GenreIds: genre, EnableImages: false, EnableUserData: false,
        })).map((x) => normId(x.Id)));
        for (const it of unknown) if (hits.has(normId(baseId(it)))) keep.push(it);
      } catch { /* ohne Treffer weiter */ }
    }
  }
  const order = new Map(list.map((it, i) => [it, i]));
  return keep.sort((a, b) => order.get(a) - order.get(b));
}

/**
 * Zeilen-Defs für die Seite. Ohne genre: Weiterschauen, (Serien: Als Nächstes), Top 10, Neu hinzugefügt, Weil du …,
 * 6 Tages-Genres verteilt um Hochbewertet/Zufällige Auswahl. Mit genre: Weiterschauen, Neu, Hochbewertet, Zufällig, Jahrzehnte.
 */
export async function buildLibraryRowDefs(kind, { genre, genreName } = {}) {
  const type = typeOf(kind);
  const pre = idPrefix(kind, genre);
  const items = (params) => api.getItems({
    ...BASE_PARAMS, IncludeItemTypes: type, Recursive: true, ...params,
  }).then(asItems);
  const gp = genre ? { GenreIds: genre } : {};

  const genres = await getLibraryGenres(kind).catch(() => []);
  const name = genreName || (genre && (genres.find((g) => g.id === genre) || {}).name) || 'Genre';

  const resume = {
    id: `${pre}resume`, title: 'Weiterschauen', kind: 'resume',
    async load() {
      const list = asItems(await api.getResume({
        ...BASE_PARAMS, MediaTypes: 'Video', IncludeItemTypes: RESUME_TYPES[kind] || 'Movie', Limit: 20,
      })).filter((it) => it && it.Type === (RESUME_TYPES[kind] || 'Movie'));
      return genre ? filterByGenre(list, kind, genre, name) : list;
    },
  };
  const latest = {
    id: `${pre}latest`, title: 'Neu hinzugefügt', kind: 'landscape',
    load: genre
      ? () => items({ ...gp, SortBy: newSort(kind), SortOrder: 'Descending', Limit: 20 })
      : () => api.getLatest({ ...BASE_PARAMS, IncludeItemTypes: type, GroupItems: true, Limit: 20 }).then(asItems),
  };
  const toprated = {
    id: `${pre}toprated`, title: 'Hochbewertet', kind: 'landscape',
    load: () => items({ ...gp, SortBy: 'CommunityRating', SortOrder: 'Descending', MinCommunityRating: 7.5, Limit: 20 }),
  };
  const random = {
    id: `${pre}random`, title: 'Zufällige Auswahl', kind: 'landscape',
    load: () => items({ ...gp, SortBy: 'Random', Limit: 20 }),
  };

  if (genre) {
    const defs = [resume, latest, toprated, random];
    for (const start of DECADES) {
      const years = Array.from({ length: 10 }, (_, i) => start + i).join(',');
      defs.push({
        id: `${pre}decade-${start}`, title: `${name} der ${start}er`, kind: 'landscape',
        async load() {
          const list = await items({ ...gp, Years: years, SortBy: 'Random', Limit: 20 });
          return list.length >= MIN_ROW ? list : [];
        },
      });
    }
    return defs.map(wrapRow);
  }

  const defs = [resume];
  if (kind === 'series') {
    defs.push({
      id: `${pre}nextup`, title: 'Als Nächstes', kind: 'landscape',
      load: () => api.getNextUp({ ...BASE_PARAMS, Limit: 20, EnableResumable: false, EnableRewatching: false }).then(asItems),
    });
  }
  const chartKey = (chartSpecs().find((s) => s.key === kind) || { key: kind }).key;
  const chartTitle = (chartSpecs().find((s) => s.key === kind) || {}).title;
  defs.push({
    id: `${pre}top10`, title: chartTitle || `Top 10 auf ${brandName()}`, kind: 'top10',
    async load(def) {
      try {
        const charts = await getCharts();
        if (charts && (charts[chartKey] || []).length) {
          const list = await resolveChartItems(charts[chartKey], { limit: 10 });
          const own = list.filter((it) => it.Type === type);
          if (own.length >= MIN_CHART_ROW) return own;
        }
      } catch (e) {
        console.warn('[LenzFlix] Top 10 nicht aufgebaut', e && e.message);
      }
      def.title = `Top 10: Neu auf ${brandName()}`;
      def.noCache = !!getChartsUrl(); // Ersatz soll sich erholen (kein 10-min-Cache)
      return selectTop10(await items({ SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 10 }));
    },
  });
  defs.push(latest);
  defs.push({
    id: `${pre}because`, title: null, kind: 'landscape',
    async load(def) {
      const played = await api.getItems({
        ...BASE_PARAMS, IncludeItemTypes: RESUME_TYPES[kind], Recursive: true, Filters: 'IsPlayed',
        SortBy: 'DatePlayed', SortOrder: 'Descending', Limit: 1,
      }).then(asItems);
      const last = played[0];
      if (!last) return [];
      const baseId = last.Type === 'Episode' ? last.SeriesId : last.Id;
      const baseName = last.Type === 'Episode' ? last.SeriesName : last.Name;
      if (!baseId || !baseName) return [];
      const similar = asItems(await api.getSimilar(baseId, { ...BASE_PARAMS, Limit: 20 }))
        .filter((i) => i.Id !== baseId && i.Type === type);
      if (similar.length) def.title = `Weil du ${baseName} angesehen hast`;
      return similar;
    },
  });

  const picked = pickGenres(genres.map((g) => ({ Name: g.name })), { seed: `${dayKey()}:${kind}`, count: 6 });
  const idByName = new Map(genres.map((g) => [g.name, g.id]));
  const genreDefs = picked.filter((n) => idByName.get(n)).map((n) => ({
    id: `${pre}genre-${idByName.get(n)}`, title: n, kind: 'landscape',
    async load() {
      const list = await items({ GenreIds: idByName.get(n), SortBy: 'Random', Limit: 20 });
      return list.length >= MIN_ROW ? list : [];
    },
  }));
  defs.push(...genreDefs.slice(0, 2), toprated, ...genreDefs.slice(2, 4), random, ...genreDefs.slice(4, 6));
  return defs.map(wrapRow);
}

/** Hero-Kandidaten für das Billboard der Seite (30 Neueste + 40 Zufällige, Format wie buildPool). 10 min gecacht. */
/** Gecachter Hero-Pool (10 min). Das Billboard cacht selbst unter libraryPoolKey → dort fetchLibraryHeroPool nutzen
 *  (gleicher Schlüssel in beiden Ebenen = cached() wartet auf sich selbst, Billboard bleibt im Skelett). */
export function getLibraryHeroPool(kind, { genre } = {}) {
  return cached(libraryPoolKey(kind, genre), () => fetchLibraryHeroPool(kind, { genre }), HOME_TTL);
}

/** Hero-Pool ohne Cache (für billboard.render ctx.pool.fetch). */
export async function fetchLibraryHeroPool(kind, { genre } = {}) {
  const q = (params) => api.getItems({
    ...BASE_PARAMS, Fields: HERO_FIELDS, IncludeItemTypes: typeOf(kind), Recursive: true,
    ...(genre ? { GenreIds: genre } : {}), ...params,
  }).then(asItems);
  const [latest, random] = await Promise.all([
    q({ SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 30 }).catch(() => []),
    q({ SortBy: 'Random', Limit: 40 }).catch(() => []),
  ]);
  const pool = buildPool(latest, random, { newCount: 3, randomCount: 7 });
  if (pool.length) { putItems(pool); return pool; }
  const seen = new Set();
  const fallback = [...latest, ...random].filter((it) => {
    if (!it || !it.Id || seen.has(it.Id) || !(it.BackdropImageTags && it.BackdropImageTags.length)) return false;
    seen.add(it.Id);
    return true;
  }).slice(0, 8);
  putItems(fallback);
  return fallback;
}
