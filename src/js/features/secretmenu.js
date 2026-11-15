// LenzFlix: Geheimmenü (Feature "secretmenu", nur Design flix, Modern). Fünf Klicks auf das Logo innerhalb von 3 s öffnen das Panel.
// Klick-Delegation am document (Capture); der Zähler liegt auf Modulebene, weil der Logo-Klick navigiert (Remounts).
// Jellyfins Logo-Link ist ein React-Knoten und wird nie verändert. Panel: secretmenu/panel.js.
import { isReady } from '../core/api.js';
import { isModern, isTv } from '../core/layout.js';
import { isTheme } from '../core/theme.js';
import { openSecretMenu, closeSecretMenu } from './secretmenu/panel.js';

export const LOGO_SELECTOR = 'header.MuiAppBar-root a[href="#/"], .lfx-mnav__logo';
export const CLICKS = 5;
export const WINDOW_MS = 3000;

let stamps = [];
let listening = false;

/** Zähler zurücksetzen (Tests). */
export function resetSecretClicks() {
  stamps = [];
}

function onClick(e) {
  const t = e.target;
  if (!t || typeof t.closest !== 'function' || !t.closest(LOGO_SELECTOR)) return;
  const now = Date.now();
  stamps = stamps.filter((s) => now - s <= WINDOW_MS);
  stamps.push(now);
  if (stamps.length < CLICKS) return;
  stamps = [];
  e.preventDefault();
  e.stopPropagation();
  openSecretMenu();
}

function listen(on) {
  if (on === listening) return;
  listening = on;
  if (on) document.addEventListener('click', onClick, true);
  else document.removeEventListener('click', onClick, true);
}

const secretmenu = {
  name: 'secretmenu',
  match: () => isTheme('flix') && isModern() && !isTv() && isReady(),
  mount() {
    listen(true);
  },
  update() {
    listen(true);
  },
  unmount() {
    listen(false);
    closeSecretMenu();
  },
};

export default secretmenu;
