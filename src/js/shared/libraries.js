// LenzFlix shared: Bibliotheken des Nutzers als einfaches Modell für die Designs.
import * as api from '../core/api.js';
import { cached } from '../core/cache.js';

const HUB_TYPES = ['movies', 'tvshows', 'homevideos', 'mixed'];

/** Native Ziel-URL einer Bibliothek (wie viewUrl in features/nav.js). */
function viewHref(view) {
  const id = view.Id;
  const ct = view.CollectionType;
  const q = `topParentId=${id}&collectionType=${ct}`;
  switch (ct) {
    case 'movies': return `#/movies?${q}`;
    case 'tvshows': return `#/tv?${q}`;
    case 'music': return `#/music?${q}`;
    case 'books': return `#/books?${q}`;
    case 'musicvideos': return `#/musicvideos?${q}`;
    case 'boxsets': return `#/boxsets?${q}`;
    case 'playlists': return `#/playlists?${q}`;
    case 'homevideos': return `#/homevideos?topParentId=${id}`;
    case 'livetv': return '#/livetv';
    default: return ct ? `#/list?parentId=${id}` : `#/mixed?topParentId=${id}&collectionType=mixed`;
  }
}

/** [{ id, name, collectionType, href, hubCapable }] in Jellyfins Reihenfolge, 5 min gecacht. */
export function getLibraries() {
  return cached('libraries', async () => {
    const res = await api.getViews();
    const list = Array.isArray(res) ? res : (res && res.Items) || [];
    return list.filter((v) => v && v.Id).map((v) => ({
      id: v.Id,
      name: v.Name,
      collectionType: v.CollectionType || null,
      href: viewHref(v),
      hubCapable: !v.CollectionType || HUB_TYPES.includes(v.CollectionType),
    }));
  }, 5 * 60 * 1000);
}
