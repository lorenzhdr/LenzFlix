// VIDEOTHEK LENZ: schlanke fixierte Leiste auf allen Seiten außer der 3D-Startseite, dem Player und dem Dashboard.
// Entscheidung: Die native Jellyfin-Kopfleiste bleibt darunter sichtbar (Bibliotheks-Navigation, Zurück, Filter in der AppBar
// brauchen die nativen Seiten); anders als retro/header.js ersetzt die Leiste sie nicht, CSS schiebt sie nur um die Leistenhöhe nach unten.
import { h, mountPoint, unmountPoint } from '../../core/dom.js';
import { isReady } from '../../core/api.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { searchHref } from '../../shared/routes.js';
import { BAR_CLASS, BAR_ID, storeHomeRoute } from './home-route.js';
import { closeProfileMenu, hudLink, profileButton, wordmark } from './hud.js';

const EXCLUDED = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
let profile = null;

function blocked(route) {
  if (EXCLUDED.test(route.path)) return true;
  if (document.body && document.body.classList.contains('dashboardDocument')) return true;
  return Boolean(document.querySelector('#videoOsdPage:not(.hide)'));
}

export default {
  name: 'store-bar',
  match: (route) => isTheme('store') && isModern() && !isTv() && isReady() && !storeHomeRoute(route) && !blocked(route),
  mount() {
    const el = mountPoint(BAR_ID, { tag: 'header', className: 'lfx-store-bar' });
    profile = profileButton();
    const enter = hudLink('lfx-store-btn--enter', 'Videothek betreten', 'enter', '#/home');
    const search = hudLink('lfx-store-btn--search', 'Suche', 'search', searchHref());
    const brand = h('a', { class: 'lfx-store-bar__brand', href: '#/home', 'aria-label': 'VIDEOTHEK LENZ: Videothek betreten' }, [wordmark()]);
    el.replaceChildren(h('div', { class: 'lfx-store-bar__inner' }, [brand, h('span', { class: 'lfx-store-bar__spacer' }), enter, search, profile.el]));
    document.documentElement.classList.add(BAR_CLASS);
  },
  update() {},
  unmount() {
    closeProfileMenu();
    if (profile) profile.destroy();
    profile = null;
    unmountPoint(BAR_ID);
    document.documentElement.classList.remove(BAR_CLASS);
  },
};
