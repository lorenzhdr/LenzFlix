// LenzFlix: schwebender Zurück-Knopf in der installierten Web-App (iPhone „Zum Home-Bildschirm“, html.lfx-standalone).
// Dort gibt es keine Browser-Zurück-Taste. Der Knopf erscheint nur, wo kein eigener sichtbarer Zurück-Weg existiert:
// retro immer, flix ab 900 px (darunter behält das Handy-Menü den nativen Pfeil), plus/prime ab 800 px (darunter eigene
// Kopfzeile). Nie: Startseite, Player, VIDEOTHEK (store), TV, Anmeldung/Admin, TV-Modus-Seite.
// Eigener Mount-Point #lfx-sab-back; Aktion history.back(); ohne Vorgänger (length <= 1 oder Hash ändert sich nicht) → #/home.
import { mountPoint, unmountPoint } from '../core/dom.js';
import { isReady } from '../core/api.js';
import { isTv, isNarrow, isNavCompact } from '../core/layout.js';
import { getTheme } from '../core/theme.js';
import { parseLfxRoute } from '../shared/routes.js';

const ICON_BACK = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="m14.5 5-7 7 7 7"/></svg>';
const ID = 'lfx-sab-back';
const BACK_CHECK_MS = 450;
const EXCLUDED = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|configurationpage|queue)/;
const PLAYER = '[id="videoOsdPage"]:not(.hide)';

/** Zurück-Weg nötig? Breitenregel je Design (siehe Kopfkommentar). */
function needsButton(theme) {
  switch (theme) {
    case 'retro': return true;
    case 'flix': return !isNavCompact();
    case 'plus':
    case 'prime': return !isNarrow();
    default: return false; // store und Unbekanntes: nie
  }
}

let backTimer = null;

/**
 * Zurück. Heuristik für „kein Vorgänger in dieser App“: history.length zählt auch fremde Einträge (Start aus einem Link,
 * Neuladen am Verlaufsanfang), history.back() am Index 0 bleibt dann wirkungslos. Deshalb nach dem Aufruf prüfen: hat sich
 * der Hash nach BACK_CHECK_MS nicht geändert, geht es nach #/home. Verlässt back() die Seite, wird sie entladen (kein Rückfall).
 */
export function goBack() {
  if (window.history.length <= 1) { window.location.hash = '#/home'; return; }
  const before = window.location.hash;
  if (backTimer) clearTimeout(backTimer);
  window.history.back();
  backTimer = setTimeout(() => {
    backTimer = null;
    if (window.location.hash === before) window.location.hash = '#/home';
  }, BACK_CHECK_MS);
}

const sabbackFeature = {
  name: 'sabback',
  match(route) {
    const root = document.documentElement;
    if (!root.classList.contains('lfx-standalone') || isTv() || !isReady()) return false;
    if (!route || EXCLUDED.test(route.path)) return false;
    if (document.querySelector(PLAYER)) return false;
    const { kind } = parseLfxRoute(route);
    if (kind === 'tv') return false;
    if (route.path === '/home' && !kind && (route.params.get('tab') || '0') === '0') return false; // Startseite
    return needsButton(getTheme() || 'flix');
  },
  mount() {
    const el = mountPoint(ID, { tag: 'button', className: 'lfx-sab-back mui-fixed' });
    el.type = 'button';
    el.setAttribute('aria-label', 'Zurück');
    el.title = 'Zurück';
    el.innerHTML = ICON_BACK;
    el.onclick = goBack;
  },
  unmount() {
    unmountPoint(ID);
    if (backTimer) { clearTimeout(backTimer); backTimer = null; }
  },
};

export default sabbackFeature;
