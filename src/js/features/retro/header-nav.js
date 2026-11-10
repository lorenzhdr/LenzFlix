// LENZ//84: reine Navigationslogik für Kopfzeile (Desktop) und Funktionstasten-Leiste (Handy). Gehört Worker P1.
import { parseLfxRoute, hubHref, searchHref } from '../../shared/routes.js';

/** Routen ohne eigene Kopfzeile/Leiste (Player, Anmeldung, Dashboard …). */
export const EXCLUDED = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
export const LIST_HREF = '#/home?tab=1';
export const NEW_HREF = '#/home?lfx=new';

/** Handy-Layout: exakt das Komplement zur Desktop-Kopfzeile (deckungsgleich mit @media (max-width: 799px)). */
export function isPhone() {
  return window.innerWidth < 800;
}

/** Navigationseinträge: Start, Filme, Serien (je erste passende Bibliothek), Neu & beliebt, Meine Liste, Suche. */
export function navItems(libs) {
  const list = Array.isArray(libs) ? libs : [];
  const items = [{ key: 'home', label: 'Start', href: '#/home' }];
  const movies = list.find((l) => l.collectionType === 'movies');
  const series = list.find((l) => l.collectionType === 'tvshows');
  if (movies) items.push({ key: `lib:${movies.id}`, label: 'Filme', href: hubHref(movies.id) });
  if (series) items.push({ key: `lib:${series.id}`, label: 'Serien', href: hubHref(series.id) });
  items.push({ key: 'new', label: 'Neu & beliebt', href: NEW_HREF });
  items.push({ key: 'list', label: 'Meine Liste', href: LIST_HREF });
  items.push({ key: 'search', label: 'Suche', href: searchHref() });
  return items;
}

/** Aktiver Schlüssel: home | new | list | search | lib:<id> | null. */
export function activeKey(route) {
  if (!route || route.path !== '/home' || !route.params) return null;
  const { kind, lib } = parseLfxRoute(route);
  if (kind === 'new') return 'new';
  if (kind === 'search') return 'search';
  if ((kind === 'hub' || kind === 'browse') && lib) return `lib:${lib}`;
  if (kind || route.params.get('lfx')) return null;
  return route.params.get('tab') === '1' ? 'list' : 'home';
}

/** Navigation per Hash (oder echte URL). */
export function go(href) {
  if (String(href).startsWith('#')) window.location.hash = href;
  else window.location.assign(href);
}
