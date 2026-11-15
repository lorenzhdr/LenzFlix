// LenzFlix: eigene Routen der Design-Features (alle unter #/home?lfx=...), damit der native Router sie als Startseite behandelt.
const enc = encodeURIComponent;

export const titleHref = (id) => `#/home?lfx=title&id=${enc(id)}`;
export const hubHref = (libId) => `#/home?lfx=hub&lib=${enc(libId)}`;
export const browseHref = (libId, genreId) => `#/home?lfx=browse&lib=${enc(libId)}${genreId ? `&genre=${enc(genreId)}` : ''}`;
export const searchHref = (q) => `#/home?lfx=search${q ? `&q=${enc(q)}` : ''}`;

// 'tv': eigene Vollseite des TV-Modus (flix/plus/prime, docs/tvmode.md)
// 'series'|'movies'|'mylist': eigene Seiten von flix (1.13.0); mylist auch in retro
const KINDS = ['title', 'hub', 'browse', 'search', 'new', 'tv', 'series', 'movies', 'mylist'];
const SORTS = ['az', 'za', 'new', 'year'];
const TYPES = ['movies', 'series'];

/** Serien-/Filme-Seite (flix): kind 'series'|'movies'; leere Werte entfallen, view nur 'grid'. */
export function libraryHref(kind, { genre, view, sort } = {}) {
  const k = kind === 'series' ? 'series' : 'movies';
  return `#/home?lfx=${k}${genre ? `&genre=${enc(genre)}` : ''}${view === 'grid' ? '&view=grid' : ''}${SORTS.includes(sort) ? `&sort=${sort}` : ''}`;
}

/** „Meine Liste“ (flix, retro): optional type 'movies'|'series' und sort. */
export function myListHref({ type, sort } = {}) {
  return `#/home?lfx=mylist${TYPES.includes(type) ? `&type=${type}` : ''}${SORTS.includes(sort) ? `&sort=${sort}` : ''}`;
}

/** route = {path, params} aus core/router.js parseHash -> { kind, id, lib, genre, q } (kind null = keine LenzFlix-Route). */
export function parseLfxRoute(route) {
  const empty = { kind: null, id: null, lib: null, genre: null, q: null, view: null, sort: null, type: null };
  if (!route || !route.params || route.path !== '/home') return empty;
  const kind = route.params.get('lfx');
  if (!KINDS.includes(kind)) return empty;
  return {
    kind,
    id: route.params.get('id') || null,
    lib: route.params.get('lib') || null,
    genre: route.params.get('genre') || null,
    q: route.params.get('q') || null,
    view: route.params.get('view') === 'grid' ? 'grid' : null,
    sort: SORTS.includes(route.params.get('sort')) ? route.params.get('sort') : null,
    type: TYPES.includes(route.params.get('type')) ? route.params.get('type') : null,
  };
}

/** TV-Modus (flix/plus/prime): eigene Vollseite wie „Neu und beliebt“. */
export const tvModeHref = '#/home?lfx=tv';

/** route = {path, params} aus core/router.js parseHash -> true für #/home?lfx=tv. */
export const isTvModeRoute = (route) => parseLfxRoute(route).kind === 'tv';

/** route -> true für #/home?lfx=series|movies. */
export const isLibraryRoute = (route) => ['series', 'movies'].includes(parseLfxRoute(route).kind);

/** route -> true für #/home?lfx=mylist. */
export const isMyListRoute = (route) => parseLfxRoute(route).kind === 'mylist';
