// LenzFlix: Einstiegspunkt. Setzt window.LenzFlix = {version, destroy()}.
import { isReady } from './core/api.js';
import { initLayout, destroyLayout, applyLayoutClasses } from './core/layout.js';
import { registerFeature, resetRouter, reevaluate } from './core/router.js';
import { removeAllMounts } from './core/dom.js';
import { applyFavicon, removeFavicon } from './core/favicon.js';
import { features } from './features/index.js';

const VERSION = '1.1.4';
const POLL_MS = 250;
const POLL_MAX_MS = 15_000;

function init() {
  if (window.LenzFlix) return; // Guard gegen Doppel-Init (Dev-Loader ruft vorher destroy())

  applyFavicon();
  let started = false;
  let destroyed = false;
  let pollTimer = null;
  let refreshTimer = null;

  function start() {
    if (started || destroyed) return;
    if (!window.ApiClient || !isReady()) return;
    started = true;
    clearInterval(pollTimer);
    window.removeEventListener('hashchange', start);
    initLayout();
    for (const f of features) registerFeature(f);
    // Der MUI-Header wird von React evtl. erst nach dem ersten Route-Event gerendert.
    let n = 0;
    refreshTimer = setInterval(() => {
      applyLayoutClasses();
      reevaluate();
      if (++n >= 40) clearInterval(refreshTimer);
    }, 500);
  }

  const startedAt = Date.now();
  pollTimer = setInterval(() => {
    start();
    if (Date.now() - startedAt > POLL_MAX_MS) clearInterval(pollTimer);
  }, POLL_MS);
  // Login ohne Reload: später erneut versuchen, sobald die Route wechselt.
  window.addEventListener('hashchange', start);
  start();

  function destroy() {
    destroyed = true;
    clearInterval(pollTimer);
    clearInterval(refreshTimer);
    window.removeEventListener('hashchange', start);
    resetRouter(); // unmount aller Features
    removeAllMounts();
    destroyLayout();
    removeFavicon();
    delete window.LenzFlix;
  }

  window.LenzFlix = { version: VERSION, destroy };
}

init();
