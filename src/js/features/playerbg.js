// LenzFlix: schwarzer Seitenhintergrund im normalen Video-Player (Feature "playerbg").
// iPhone-Safari färbt den Bereich hinter der unteren Browserleiste nach dem Seitenhintergrund (Jellyfin macht ihn
// beim Video transparent → weiße Leiste). Solange die aktive Player-Seite sichtbar ist: html.lfx-in-player (CSS
// setzt html/body schwarz) und <meta name="theme-color"> auf #000; beim Verlassen wird alles zurückgesetzt.
// Erkennung wie osdcenter: Router-Events (Mount/Update), kein Dauer-Observer. Nicht unter layout-tv.
import { isTv } from '../core/layout.js';

const CLASS = 'lfx-in-player';
const PAGE = '[id="videoOsdPage"]:not(.hide)';
const OWN_ATTR = 'data-lfx-playerbg';

let meta = null;
let prev = null; // vorheriger content-Wert (nur bei vorhandenem Meta)
let own = false;

function applyMeta() {
  meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    prev = meta.getAttribute('content');
    own = false;
  } else {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute(OWN_ATTR, '');
    document.head.appendChild(meta);
    own = true;
  }
  meta.setAttribute('content', '#000000');
}

function restoreMeta() {
  if (!meta) return;
  if (own) meta.remove();
  else if (prev === null) meta.removeAttribute('content');
  else meta.setAttribute('content', prev);
  meta = null;
  prev = null;
  own = false;
}

export const playerbgFeature = {
  name: 'playerbg',
  match(route) {
    return !isTv() && Boolean(document.querySelector(PAGE) || (route && route.path === '/video'));
  },
  mount() {
    document.documentElement.classList.add(CLASS);
    applyMeta();
  },
  unmount() {
    document.documentElement.classList.remove(CLASS);
    restoreMeta();
  },
};

export default playerbgFeature;
