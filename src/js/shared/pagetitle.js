// LenzFlix shared: Seitenname der aktuellen Route (für den Tab-Titel, core/doctitle.js). Reine Funktion.
// Vereinigung aus mobileTitle (features/prime/header.js) und headerTitle (features/plus/mobilehead.js); die
// Startseite liefert ''. Nie document.title (Jellyfin schreibt dort den Servernamen).
import { parseLfxRoute } from './routes.js';

const KIND_LABEL = { series: 'Serien', movies: 'Filme' };

/** Feste Titel nativer Seiten (Einstellungen u. a.); Bibliotheken kommen über die Bibliotheksliste. */
const NATIVE_TITLES = {
  '/mypreferencesmenu': 'Einstellungen',
  '/mypreferencesdisplay': 'Anzeige',
  '/mypreferenceshome': 'Startseite',
  '/mypreferencesplayback': 'Wiedergabe',
  '/mypreferencessubtitles': 'Untertitel',
  '/mypreferencescontrols': 'Steuerung',
  '/mypreferencesquickconnect': 'Quick Connect',
  '/quickconnect': 'Quick Connect',
  '/metadata': 'Metadaten-Manager',
  '/userprofile': 'Profil',
  '/search': 'Suche',
  '/queue': 'Warteschlange',
};

/** Standard-DOM-Zugriff: (selector, attr?) → getrimmter Text bzw. Attributwert, sonst ''. */
export function defaultDom(selector, attr) {
  let el = null;
  try { el = document.querySelector(selector); } catch { /* ungültiger Selektor */ }
  if (!el) return '';
  return String((attr ? el.getAttribute(attr) : el.textContent) || '').trim();
}

/** Titelseiten je Design (Text oder Logo-alt): prime `features/prime/title.js`, plus `plus/title.js`, retro `retro/title.js`. */
const TITLE_SOURCES = [
  ['.lfx-pt__title'], ['.lfx-pt__logo', 'alt'],
  ['.lfx-plus-title__logo', 'alt'], ['.lfx-plus-title__name'],
  ['.lfx-rt__logo', 'alt'], ['.lfx-rt__brand'],
];

function titleName(dom) {
  for (const [sel, attr] of TITLE_SOURCES) {
    const t = dom(sel, attr);
    if (t) return t;
  }
  return '';
}

/**
 * route = {path, params} (core/router.js parseHash); libs = getLibraries()-Ergebnis; dom = (selector, attr?) => string.
 * Rückgabe: Seitenname oder '' (Startseite und alles Unbekannte).
 */
export function pageName(route, libs, dom = defaultDom) {
  if (!route || !route.params) return '';
  const list = Array.isArray(libs) ? libs : [];
  const libName = (id) => (id && (list.find((l) => l.id === id) || {}).name) || '';
  const p = route.params;
  if (route.path === '/home') {
    const { kind, lib, genre } = parseLfxRoute(route);
    if (!kind) return p.get('tab') === '1' ? 'Meine Liste' : '';
    switch (kind) {
      case 'series':
      case 'movies': {
        const label = KIND_LABEL[kind];
        // Genrename steht im Seitenkopf (features/library/head.js); Platzhalter „…“ solange die Liste lädt
        const g = genre ? dom('.lfx-lib__title .lfx-lib__current') : '';
        return g && g !== '…' ? `${g} · ${label}` : label;
      }
      case 'mylist': return 'Meine Liste';
      case 'new': return 'Neu & beliebt';
      case 'tv': return 'TV';
      case 'search': return 'Suche';
      case 'hub': return libName(lib);
      case 'browse': return libName(lib) || 'Bibliothek';
      case 'title': return titleName(dom);
      default: return '';
    }
  }
  if (NATIVE_TITLES[route.path]) return NATIVE_TITLES[route.path];
  const parent = p.get('topParentId') || p.get('parentId');
  const name = libName(parent);
  if (name) return name;
  if (route.path === '/details' || route.path === '/item') return dom('.page:not(.hide) .nameContainer h1');
  if (route.path === '/movies') return 'Filme';
  if (route.path === '/tv') return 'Serien';
  if (/^\/(mypreferences|usermenu)/.test(route.path)) return 'Einstellungen';
  return '';
}
