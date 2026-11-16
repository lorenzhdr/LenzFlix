// LenzFlix: Invalidierung des Startseiten-Caches (`home:`-Schlüssel, siehe core/cache.js HOME_TTL).
// Einmal global registriert (main.js): Abspielen (lfx:play), Betreten der Player-Route (auch Jellyfins eigener Player),
// Nutzerwechsel und geänderte/gelöschte Titel leeren den Cache. Andere Routen (z. B. TV-Modus #/home?lfx=tv) nicht.
import { clearCache } from './cache.js';
import { getUserId } from './api.js';
import { parseHash } from './router.js';
import { onItemsChanged } from './itemmenu.js';
import { clearItemStore } from './itemstore.js';

let stop = null;

export function initHomeCache() {
  if (stop) return;
  const drop = () => clearCache('home:');
  const inPlayer = () => parseHash(window.location.hash).path.startsWith('/video');
  let wasPlayer = inPlayer();
  let uid = getUserId();
  let lateTimer = null;
  const onRoute = () => {
    const now = inPlayer();
    if (now && !wasPlayer) drop();
    if (!now && wasPlayer) { // Player verlassen: der Stopp-Bericht kann nach der Zeilen-Abfrage beim Server ankommen
      drop();
      clearTimeout(lateTimer);
      lateTimer = setTimeout(drop, 2000);
    }
    wasPlayer = now;
    const u = getUserId();
    if (u !== uid) { uid = u; clearCache(); clearItemStore(); } // alle Schlüssel ohne Nutzer-Id (Bibliotheken, Neu-Info, Sammlungen, Kacheln) gehören dem Vorgänger
  };
  window.addEventListener('lfx:play', drop);
  window.addEventListener('hashchange', onRoute);
  window.addEventListener('popstate', onRoute);
  document.addEventListener('viewshow', onRoute); // Jellyfin navigiert per pushState ohne hashchange (wie core/router.js)
  const off = onItemsChanged(drop);
  // Favorit/Gesehen/Fortschritt außerhalb von LenzFlix (native Detailseite, anderes Gerät): Cache leeren.
  let offData = null;
  const client = window.ApiClient;
  if (client && typeof client.subscribe === 'function') {
    try {
      const res = client.subscribe(['UserDataChanged'], drop);
      offData = typeof res === 'function' ? res : () => { if (typeof client.unsubscribe === 'function') client.unsubscribe(['UserDataChanged'], drop); };
    } catch { offData = null; }
  }
  stop = () => {
    clearTimeout(lateTimer);
    if (offData) { try { offData(); } catch { /* defensiv */ } }
    window.removeEventListener('lfx:play', drop);
    window.removeEventListener('hashchange', onRoute);
    window.removeEventListener('popstate', onRoute);
    document.removeEventListener('viewshow', onRoute);
    off();
    stop = null;
  };
}

export function destroyHomeCache() {
  if (stop) stop();
}
