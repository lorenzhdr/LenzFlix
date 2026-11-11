// LenzFlix: eigene Routen der Design-Features (alle unter #/home?lfx=...), damit der native Router sie als Startseite behandelt.
const enc = encodeURIComponent;

export const titleHref = (id) => `#/home?lfx=title&id=${enc(id)}`;
export const hubHref = (libId) => `#/home?lfx=hub&lib=${enc(libId)}`;
export const browseHref = (libId, genreId) => `#/home?lfx=browse&lib=${enc(libId)}${genreId ? `&genre=${enc(genreId)}` : ''}`;
export const searchHref = (q) => `#/home?lfx=search${q ? `&q=${enc(q)}` : ''}`;

// 'tv': eigene Vollseite des TV-Modus (flix/plus/prime, docs/tvmode.md)
const KINDS = ['title', 'hub', 'browse', 'search', 'new', 'tv'];

/** route = {path, params} aus core/router.js parseHash -> { kind, id, lib, genre, q } (kind null = keine LenzFlix-Route). */
export function parseLfxRoute(route) {
  const empty = { kind: null, id: null, lib: null, genre: null, q: null };
  if (!route || !route.params || route.path !== '/home') return empty;
  const kind = route.params.get('lfx');
  if (!KINDS.includes(kind)) return empty;
  return {
    kind,
    id: route.params.get('id') || null,
    lib: route.params.get('lib') || null,
    genre: route.params.get('genre') || null,
    q: route.params.get('q') || null,
  };
}

/** TV-Modus (flix/plus/prime): eigene Vollseite wie „Neu und beliebt“. */
export const tvModeHref = '#/home?lfx=tv';

/** route = {path, params} aus core/router.js parseHash -> true für #/home?lfx=tv. */
export const isTvModeRoute = (route) => parseLfxRoute(route).kind === 'tv';
