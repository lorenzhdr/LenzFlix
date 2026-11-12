// LenzFlix: Invalidierung des Startseiten-Caches (`home:`-Schlüssel, siehe core/cache.js HOME_TTL).
// Einmal global registriert (main.js): Abspielen (lfx:play), Betreten der Player-Route (auch Jellyfins eigener Player),
// Nutzerwechsel und geänderte/gelöschte Titel leeren den Cache. Andere Routen (z. B. TV-Modus #/home?lfx=tv) nicht.
import { clearCache } from './cache.js';
import { getUserId } from './api.js';
import { parseHash } from './router.js';
import { onItemsChanged } from './itemmenu.js';

let stop = null;

export function initHomeCache() {
  if (stop) return;
  const drop = () => clearCache('home:');
  const inPlayer = () => parseHash(window.location.hash).path.startsWith('/video');
  let wasPlayer = inPlayer();
  let uid = getUserId();
  const onRoute = () => {
    const now = inPlayer();
    if (now && !wasPlayer) drop();
    wasPlayer = now;
    const u = getUserId();
    if (u !== uid) { uid = u; drop(); }
  };
  window.addEventListener('lfx:play', drop);
  window.addEventListener('hashchange', onRoute);
  window.addEventListener('popstate', onRoute);
  const off = onItemsChanged(drop);
  stop = () => {
    window.removeEventListener('lfx:play', drop);
    window.removeEventListener('hashchange', onRoute);
    window.removeEventListener('popstate', onRoute);
    off();
    stop = null;
  };
}

export function destroyHomeCache() {
  if (stop) stop();
}
