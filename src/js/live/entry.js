// LENZ LIVE · Engine-Einstieg (Bundle dist/lenzlive.js, IIFE). Registriert window.LenzFlixLive = { version: 1, create }.
// Importiert nur Dateien aus src/js/live/. Der Marker unten ist der Build-Wächter-Beleg: darf nie im Hauptbundle stehen.
import { normalizeCatalog, createScheduler, formatClock, formatDay, broadcastDayOf, dayBounds } from './schedule/index.js';
import { createPlayer, createWatchTracker, pickFiller } from './player/index.js';
import { createEpg } from './ui/epg.js';
import { createTeletext } from './ui/teletext.js';
import { createMenu } from './ui/menu.js';
import { createMagazine } from './magazine/view.js';
import { createPdfExport } from './magazine/pdf-export.js';
import { createMusic } from './player/music.js';
import { createApp } from './ui/app.js';

const ENGINE_MARK = '__LFX_LIVE_ENGINE__';
const VERSION = 1;
const DAYS = 7;

/**
 * create(host, deps, opts) → instance { suspend, resume, dispose, isOn }. Gibt sofort zurück; Planen läuft async
 * (deps.onProgress, deps.onReady, bei Fehlern deps.onFatal).
 */
export function create(host, deps, opts = {}) {
  const o = opts || {};
  const now = typeof o.now === 'function' ? o.now : () => Date.now();
  let app = null;
  let disposed = false;
  let curHost = host;
  let wantSuspend = false;

  const progress = (f, label) => { try { if (deps.onProgress) deps.onProgress(f, label); } catch { /* egal */ } };

  (async () => {
    try {
      progress(0.02, 'Sendersuchlauf …');
      const catalog = normalizeCatalog(deps.catalog);
      const scheduler = createScheduler(catalog, { channelConfig: deps.channelConfig || {}, getBoxSetItems: deps.getBoxSetItems, now });
      const D = broadcastDayOf(now());
      for (let i = 0; i < DAYS; i++) {
        await scheduler.prepare([D + i]);
        if (disposed) return;
        progress(0.1 + (0.85 * (i + 1)) / DAYS, 'Sendersuchlauf …');
      }
      const watch = createWatchTracker({ setPlayed: deps.setPlayed, now });
      const time = { formatClock, formatDay, broadcastDayOf, dayBounds };
      const doc = curHost.ownerDocument || document;
      app = createApp(curHost, {
        scheduler,
        player: ({ video, canvas, getInfo }) => createPlayer({ video, deps, now, fake: !!o.fakePlayer, canvas, getInfo }),
        watch,
        pickFiller,
        overlays: { epg: createEpg, ttx: createTeletext, menu: createMenu, guide: createMagazine },
        music: createMusic({ doc }),
        pdf: createPdfExport({ imageUrl: deps.imageUrl, doc, now, time }),
        deps,
        opts: o,
        time,
      });
      if (wantSuspend) app.suspend();
      progress(1, 'Sendersuchlauf …');
      if (deps.onReady) deps.onReady();
    } catch (err) {
      if (!disposed && deps.onFatal) deps.onFatal(err);
    }
  })();

  return {
    suspend() {
      wantSuspend = true;
      if (app) app.suspend();
    },
    resume(h) {
      wantSuspend = false;
      if (h) curHost = h;
      if (app) app.resume(h);
    },
    dispose() {
      disposed = true;
      if (app) app.dispose();
      app = null;
    },
    isOn() { return !!(app && app.isOn()); },
  };
}

if (typeof window !== 'undefined') {
  window.LenzFlixLive = { version: VERSION, create, mark: ENGINE_MARK };
}
