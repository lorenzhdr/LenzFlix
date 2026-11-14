// LenzFlix: Einstiegspunkt. Setzt window.LenzFlix = {version, destroy()}.
// Das JS läuft nur, solange das LenzFlix-CSS aktiv ist (Marker --lfx-css): wird das CSS abgeschaltet
// (z. B. Einstellungen → Anzeige → Custom-CSS aus), stoppen alle Features; kommt es zurück, starten sie wieder.
import { isReady } from './core/api.js';
import { initLayout, destroyLayout, applyLayoutClasses } from './core/layout.js';
import { registerFeature, resetRouter, reevaluate } from './core/router.js';
import { removeAllMounts } from './core/dom.js';
import { applyFavicon, removeFavicon } from './core/favicon.js';
import { cssActive } from './core/csscheck.js';
import { initHomeCache, destroyHomeCache } from './core/homecache.js';
import { VERSION } from './core/version.js';
import { earlyTheme, startTheme, stopTheme, syncThemeUser, destroyTheme, getTheme } from './core/theme.js';
import { syncDataSaver, destroyDataSaver } from './core/datasaver.js';
import { features } from './features/index.js';
import { destroyStore } from './features/store/home.js';
import { destroyLive } from './features/live/home.js';
import { destroyTvMode, initUnlock } from './features/tvmode/index.js';

const WATCH_MS = 3000; // nach der Startphase; Routenwechsel lösen sync() zusätzlich sofort aus
const FAST_MS = 100; // Start: Kern-CSS (Custom CSS) lädt erst nach dem Skript, schnell erkennen
const FAST_TICKS = 50; // = 5 s

function init() {
  if (window.LenzFlix) return; // Guard gegen Doppel-Init (Dev-Loader ruft vorher destroy())

  let running = false;
  let destroyed = false;
  let watchTimer = null;
  let refreshTimer = null;

  function startFeatures() {
    if (running || destroyed) return;
    running = true;
    initLayout();
    initHomeCache(); // Startseiten-Cache: Invalidierung (lfx:play, Player-Route, Nutzerwechsel)
    initUnlock(); // TV-Modus: lfx:tvmode-intent (idempotent; stopFeatures entfernt den Listener)
    for (const f of features) registerFeature(f);
    // Der MUI-Header wird von React evtl. erst nach dem ersten Route-Event gerendert.
    let n = 0;
    refreshTimer = setInterval(() => {
      applyLayoutClasses();
      reevaluate();
      if (++n >= 40) clearInterval(refreshTimer);
    }, 500);
  }

  function stopFeatures() {
    running = false;
    clearInterval(refreshTimer);
    resetRouter(); // unmount aller Features
    destroyHomeCache();
    destroyStore(); // VIDEOTHEK LENZ: suspendierte 3D-Instanz sofort freigeben
    destroyLive(); // LENZ LIVE: suspendierte Engine-Instanz sofort freigeben
    destroyTvMode(); // TV-Modus: Instanz (auch im Bild-in-Bild), CSS, Intent-Listener freigeben
    removeAllMounts();
    destroyLayout();
    stopTheme();
  }

  // Läuft dauerhaft: startet (sobald CSS aktiv und ApiClient bereit; auch nach Login ohne Reload)
  // bzw. stoppt die Features, wenn das CSS abgeschaltet wird.
  function sync() {
    if (destroyed) return;
    if (cssActive()) {
      startTheme();
      syncThemeUser();
      syncDataSaver();
      applyFavicon(getTheme() || 'flix');
      if (!running && window.ApiClient && isReady()) startFeatures();
    } else if (running || document.documentElement.classList.contains('lfx-js')) {
      stopFeatures();
      removeFavicon();
    } else {
      stopTheme();
      removeFavicon();
    }
  }

  earlyTheme(); // LENZ+/LENZPRIME: sofort ausblenden + Design-CSS vorladen (LENZFLIX: nichts)
  if (cssActive()) startTheme(); // vor allem anderen: Design-CSS/Klasse so früh wie möglich
  let fastN = 0;
  watchTimer = setInterval(() => {
    if (++fastN >= FAST_TICKS) {
      clearInterval(watchTimer);
      watchTimer = setInterval(sync, WATCH_MS);
    }
    sync();
  }, FAST_MS);
  window.addEventListener('hashchange', sync);
  window.addEventListener('popstate', sync);
  document.addEventListener('viewshow', sync);
  sync();

  function destroy() {
    destroyed = true;
    clearInterval(watchTimer);
    window.removeEventListener('hashchange', sync);
    window.removeEventListener('popstate', sync);
    document.removeEventListener('viewshow', sync);
    stopFeatures();
    destroyDataSaver();
    destroyTheme();
    removeFavicon();
    delete window.LenzFlix;
  }

  window.LenzFlix = { version: VERSION, destroy };
}

init();
