// LenzFlix: Feature "themeroute". Die Design-Routen (#/home?lfx=title|hub|browse|search) gehören LENZ+/LENZPRIME.
// Ist das wirksame Design 'flix' (z. B. geteilter Link, TV, Design gewechselt), wird per location.replace auf das
// native Ziel umgeleitet – ohne neuen History-Eintrag.
import { getViews, getAuth } from '../core/api.js';
import { isTheme } from '../core/theme.js';
import { parseLfxRoute } from '../shared/routes.js';

const REDIRECT_KINDS = ['title', 'hub', 'browse', 'search'];
// VIDEOTHEK LENZ (store) zeigt title/search/new/classic selbst (3D-Bühne); nur Hub/Browse gehen auf die native Bibliothek.
const STORE_REDIRECT_KINDS = ['hub', 'browse'];
let lastKey = null;
let seq = 0;

/** Native Bibliotheks-Route (spiegelt viewUrl() aus nav.js). */
function libraryUrl(id, ct) {
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

function replaceTo(hash) {
  const { pathname, search } = window.location;
  window.location.replace(`${pathname}${search}${hash}`);
}

function toLibrary(lib, key, mine) {
  const stillHere = () => mine === seq && window.location.hash.replace(/^#!?/, '') === key.replace(/^#!?/, '');
  const home = isTheme('store') ? '#/home?lfx=classic' : '#/home';
  Promise.resolve()
    .then(() => getViews())
    .then((views) => {
      const items = (views && views.Items) || [];
      const v = items.find((x) => x.Id === lib);
      return v ? libraryUrl(v.Id, v.CollectionType) : home;
    })
    .catch(() => `#/list?parentId=${encodeURIComponent(lib)}`)
    .then((hash) => {
      if (stillHere()) replaceTo(hash);
    });
}

function redirect(route) {
  const r = parseLfxRoute(route);
  const store = isTheme('store');
  const home = store ? '#/home?lfx=classic' : '#/home';
  const key = route.hash;
  if (key === lastKey) return; // gleiche Route: nicht doppelt umleiten
  lastKey = key;
  const mine = ++seq;
  if (r.kind === 'title') {
    if (!r.id) return replaceTo('#/home');
    const { serverId } = getAuth();
    replaceTo(`#/details?id=${encodeURIComponent(r.id)}${serverId ? `&serverId=${encodeURIComponent(serverId)}` : ''}`);
  } else if (r.kind === 'hub') {
    if (store && r.lib) return toLibrary(r.lib, key, mine);
    replaceTo(home);
  } else if (r.kind === 'search') {
    replaceTo(r.q ? `#/search?query=${encodeURIComponent(r.q)}` : '#/search');
  } else if (r.kind === 'browse') {
    if (!r.lib) return replaceTo(home);
    toLibrary(r.lib, key, mine);
  }
}

const themeroute = {
  name: 'themeroute',
  match: (route) => {
    const kind = parseLfxRoute(route).kind;
    return (isTheme('flix') && REDIRECT_KINDS.includes(kind)) || (isTheme('store') && STORE_REDIRECT_KINDS.includes(kind));
  },
  mount: (route) => redirect(route),
  update: (route) => redirect(route),
  unmount: () => {
    lastKey = null;
    seq++;
  },
};

export default themeroute;
