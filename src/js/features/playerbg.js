// LenzFlix: schwarzer Seitenhintergrund im normalen Video-Player (Feature "playerbg").
// iPhone-Safari färbt den Bereich hinter der unteren Browserleiste nach dem Seitenhintergrund (Jellyfin macht ihn
// beim Video transparent → weiße Leiste). Solange die aktive Player-Seite sichtbar ist: html.lfx-in-player (CSS
// setzt html/body schwarz) und <meta name="theme-color"> auf #000; beim Verlassen wird alles zurückgesetzt.
// Das Meta gehört core/themecolor.js (Override, wirkt auch bei noch nicht angewandtem Design).
// Erkennung wie osdcenter: Router-Events (Mount/Update), kein Dauer-Observer. Nicht unter layout-tv.
import { isTv } from '../core/layout.js';
import { setThemeColorOverride } from '../core/themecolor.js';

const CLASS = 'lfx-in-player';
const PAGE = '[id="videoOsdPage"]:not(.hide)';

const playerbgFeature = {
  name: 'playerbg',
  match(route) {
    return !isTv() && Boolean(document.querySelector(PAGE) || (route && route.path === '/video'));
  },
  mount() {
    document.documentElement.classList.add(CLASS);
    setThemeColorOverride('#000000');
  },
  unmount() {
    document.documentElement.classList.remove(CLASS);
    setThemeColorOverride(null);
  },
};

export default playerbgFeature;
