// LenzFlix shared: Zeilen + Hero-Pool für Bibliotheks-Hubs (alles per ParentId auf eine Bibliothek begrenzt).
import * as api from '../core/api.js';
import { BASE_PARAMS, dayKey, pickGenres } from '../features/rows/logic.js';
import { buildPool } from '../features/billboard/format.js';

const asItems = (res) => (Array.isArray(res) ? res : (res && Array.isArray(res.Items) ? res.Items : []));

/** Item-Typen je Bibliothekstyp: { items: Titel-Typen, resume: fortsetzbare Typen }. */
export function hubTypes(lib) {
  switch (lib && lib.collectionType) {
    case 'movies': return { items: 'Movie', resume: 'Movie' };
    case 'tvshows': return { items: 'Series', resume: 'Episode' };
    case 'homevideos': return { items: 'Video', resume: 'Video' };
    default: return { items: 'Movie,Series', resume: 'Movie,Episode' };
  }
}

/**
 * Weiterschauen je Bibliothek. /UserItems/Resume beachtet ParentId (live geprüft, 12.4). Eine Gegenprüfung per
 * /Items?Ids=…&ParentId=… wäre wirkungslos: Jellyfin ignoriert ParentId, sobald Ids gesetzt ist (live geprüft).
 */
async function loadResume(lib, types) {
  const list = asItems(await api.getResume({
    ...BASE_PARAMS, ParentId: lib.id, MediaTypes: 'Video', IncludeItemTypes: types.resume, Limit: 20,
  }));
  return list;
}

/**
 * Zeilen-Defs ({id,title,kind,load}) für einen Hub. Async, weil die Genre-Zeilen die Genre-Liste brauchen.
 * `brand` ist reserviert (derzeit ohne Wirkung).
 */
export async function buildHubRowDefs(lib, { seed = dayKey(), genreCount = 6 } = {}) {
  if (!lib || !lib.id) return [];
  const types = hubTypes(lib);
  const items = (params) => api.getItems({
    ...BASE_PARAMS, ParentId: lib.id, IncludeItemTypes: types.items, Recursive: true, ...params,
  }).then(asItems);

  const defs = [
    { id: `${lib.id}-resume`, title: 'Weiterschauen', kind: 'resume', load: () => loadResume(lib, types) },
    {
      id: `${lib.id}-latest`, title: 'Neu hinzugefügt', kind: 'landscape',
      load: () => api.getLatest({
        ...BASE_PARAMS, ParentId: lib.id, IncludeItemTypes: types.items, GroupItems: true, Limit: 20,
      }).then(asItems),
    },
    {
      id: `${lib.id}-toprated`, title: 'Hochbewertet', kind: 'poster',
      load: () => items({ SortBy: 'CommunityRating', SortOrder: 'Descending', Limit: 20 }),
    },
  ];

  let genres;
  try {
    genres = asItems(await api.getJson('/Genres', {
      userId: api.getUserId(), ParentId: lib.id, IncludeItemTypes: types.items, Recursive: true, SortBy: 'SortName',
    }));
  } catch { genres = []; }
  const idByName = new Map(genres.filter((g) => g && g.Name && g.Id).map((g) => [g.Name, g.Id]));
  for (const name of pickGenres(genres, { seed, count: genreCount })) {
    const gid = idByName.get(name);
    if (!gid) continue;
    defs.push({
      id: `${lib.id}-genre-${gid}`, title: name, kind: 'landscape',
      load: () => items({ GenreIds: gid, SortBy: 'Random', Limit: 20 }),
    });
  }
  defs.push({
    id: `${lib.id}-random`, title: 'Zufällige Auswahl', kind: 'poster',
    load: () => items({ SortBy: 'Random', Limit: 20 }),
  });
  return defs;
}

const HERO_FIELDS = `${BASE_PARAMS.Fields},RemoteTrailers,LocalTrailerCount`;

/** Hero-Kandidaten (Backdrop + Logo bevorzugt, Format wie buildPool im Billboard); Fallback: nur Backdrop. */
export async function getHubHeroPool(lib) {
  if (!lib || !lib.id) return [];
  const types = hubTypes(lib);
  const q = (params) => api.getItems({
    ...BASE_PARAMS, Fields: HERO_FIELDS, ParentId: lib.id, IncludeItemTypes: types.items, Recursive: true, ...params,
  }).then(asItems);
  const [latest, random] = await Promise.all([
    q({ SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 30 }).catch(() => []),
    q({ SortBy: 'Random', Limit: 40 }).catch(() => []),
  ]);
  const pool = buildPool(latest, random, { newCount: 3, randomCount: 7 });
  if (pool.length) return pool;
  const seen = new Set();
  return [...latest, ...random].filter((it) => {
    if (!it || !it.Id || seen.has(it.Id) || !(it.BackdropImageTags && it.BackdropImageTags.length)) return false;
    seen.add(it.Id);
    return true;
  }).slice(0, 8);
}
