// LENZ LIVE: Wächter. Solange das Design wirksam ist (Modern, kein TV, angemeldet), gibt es keine Mediathek-Seiten:
// alle nicht erlaubten Routen werden per location.replace auf #/home umgeleitet (kein History-Eintrag).
import { isReady } from '../../core/api.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { liveHomeRoute } from './home-route.js';

// Exakt oder mit Unterpfad (/video/…)
const ALLOWED = ['/login', '/selectserver', '/addserver', '/startup', '/wizard', '/forgotpassword', '/resetpassword', '/video', '/queue'];
// Mit beliebiger Fortsetzung (/dashboard/…, /dashboardgeneral, /mypreferencesmenu, /userprofile?userId=…)
const ALLOWED_PREFIX = ['/dashboard', '/mypreferences', '/userprofile'];

let lastKey = null;

export function isAllowedRoute(route) {
  const path = (route && route.path) || '';
  if (path === '/home') return liveHomeRoute(route);
  if (ALLOWED.some((p) => path === p || path.startsWith(`${p}/`))) return true;
  if (ALLOWED_PREFIX.some((p) => path.startsWith(p))) return true;
  return Boolean(document.body && document.body.classList.contains('dashboardDocument'));
}

function replaceHome() {
  const { pathname, search } = window.location;
  window.location.replace(`${pathname}${search}#/home`);
}

function redirect(route) {
  const key = route.hash;
  if (key === lastKey) return; // gleiche Route: nicht doppelt umleiten
  lastKey = key;
  replaceHome();
}

const liveGuard = {
  name: 'live-guard',
  match: (route) => isTheme('live') && isModern() && !isTv() && isReady() && !isAllowedRoute(route),
  mount: (route) => redirect(route),
  update: (route) => redirect(route),
  unmount: () => {
    lastKey = null;
  },
};

export default liveGuard;
