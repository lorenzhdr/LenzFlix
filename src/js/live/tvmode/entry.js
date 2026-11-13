// TV-Modus · Engine-Einstieg (Bundle dist/lenztvmode.js, IIFE). Registriert window.LenzFlixTvMode = { version: 1, create, mark }.
// Importiert nur Dateien aus src/js/live/. Der Marker unten ist der Build-Wächter-Beleg: darf nie im Hauptbundle stehen.
// Vertrag: docs/tvmode.md („Global und create“, „Instanz“, „Bild-in-Bild“).
import { normalizeCatalog, createScheduler, broadcastDayOf } from '../schedule/index.js';
import { createPlayer, createWatchTracker, pickFiller } from '../player/index.js';
import { createTvController, ERROR_TEXTS } from './controller.js';
import { createApp } from './app.js';
import { createPip } from './pip.js';

const ENGINE_MARK = '__LFX_TVMODE_ENGINE__';
const VERSION = 1;
const DAYS = 7;
const WATCH_MS = 1000;
const VIDEO_ROUTE = /^#!?\/?video(?:[/?]|$)/;

/** Debug-Überlagerungen für Screenshots (nur Anzeige, nie der Controller). */
function cardOverlay(kind) {
  switch (kind) {
    case 'pause': return { phase: 'pause', reason: null, card: { kind: 'next', title: 'Testfilm', at: '20:15', atMs: 0 } };
    case 'closedown': return { phase: 'closedown', reason: null, card: { kind: 'closedown', text: 'Sendepause', until: '05:00' } };
    case 'error': return { phase: 'error', reason: 'network', card: { kind: 'error', reason: 'network', ...ERROR_TEXTS.network } };
    case 'tap': return { phase: 'error', reason: 'gesture', needsTap: true, card: { kind: 'error', reason: 'gesture', ...ERROR_TEXTS.gesture } };
    case 'muted': return { mutedByPolicy: true, muted: true };
    default: return null;
  }
}

export function create(host, deps, opts = {}) {
  const o = opts || {};
  const d = deps || {};
  const now = typeof o.now === 'function' ? o.now : () => Date.now();
  const doc = host.ownerDocument || document;
  const win = doc.defaultView || window;
  const video = o.video || doc.createElement('video');
  if (!o.video) {
    video.setAttribute('playsinline', '');
    video.playsInline = true;
  }
  const canvas = o.fakePlayer ? doc.createElement('canvas') : null;
  if (canvas) { canvas.width = 640; canvas.height = 360; }

  let curHost = host;
  let disposed = false;
  let booted = false;
  let wantStart = false;
  let suspended = false;
  let ctl = null;
  let app = null;
  let pip = null;
  let watchIv = null;
  let debugOn = false;
  const unsub = [];

  const progress = (f, label) => { try { if (d.onProgress) d.onProgress(f, label); } catch { /* egal */ } };
  const stopped = (reason) => { try { if (d.onStopped) d.onStopped({ reason }); } catch { /* egal */ } };
  const isOn = () => !!(ctl && ctl.state().on);

  // ---------- Stopp ----------
  function stop(reason) {
    if (disposed) return;
    wantStart = false;
    bgCls(false);
    const was = isOn();
    if (ctl) ctl.stop();
    if (pip && pip.active()) pip.exit();
    if (was || reason) stopped(reason || 'stop');
  }

  function routeIsVideo() {
    const hash = (win.location && win.location.hash) || '';
    return VIDEO_ROUTE.test(hash) || !!doc.querySelector('#videoOsdPage:not(.hide)');
  }

  const bgPip = () => suspended && !!(pip && pip.active()); // Seite verlassen, TV läuft im PiP-Fenster weiter
  const bgCls = (on) => doc.documentElement.classList.toggle('lfx-tvm-bgplay', on); // Signal fürs Startseiten-Vorladen

  /** Abbruch: im Vordergrund normaler Stopp, im PiP-Hintergrund endet die Instanz (kein Zurück auf die Seite). */
  function bail(reason) {
    if (bgPip()) { stopped(reason); instance.dispose(); return; }
    stop(reason);
  }

  function watchTick() {
    if (disposed) return;
    const bg = bgPip();
    if (suspended && !bg) { disarmWatch(); return; } // nichts mehr zu überwachen: kein Timer übrig
    if (!bg && !isOn()) return;
    if (!video.isConnected) { bail('detached'); return; }
    if (routeIsVideo()) bail('route-video');
  }
  const armWatch = () => { if (!watchIv) watchIv = setInterval(watchTick, WATCH_MS); };
  const disarmWatch = () => { if (watchIv) { clearInterval(watchIv); watchIv = null; } };

  const onLfxPlay = () => { if (isOn() || (pip && pip.active())) stop('lfx-play'); };
  const onNav = () => { if ((bgPip() || (isOn() && !suspended)) && routeIsVideo()) bail('route-video'); };
  win.addEventListener('lfx:play', onLfxPlay);
  win.addEventListener('hashchange', onNav);
  win.addEventListener('popstate', onNav);
  unsub.push(() => {
    win.removeEventListener('lfx:play', onLfxPlay);
    win.removeEventListener('hashchange', onNav);
    win.removeEventListener('popstate', onNav);
  });

  // ---------- Boot ----------
  (async () => {
    try {
      progress(0.02, 'Sendersuchlauf …');
      const catalog = normalizeCatalog(d.catalog);
      const scheduler = createScheduler(catalog, { channelConfig: d.channelConfig || {}, getBoxSetItems: d.getBoxSetItems, now });
      const D = broadcastDayOf(now());
      for (let i = 0; i < DAYS; i++) {
        await scheduler.prepare([D + i]);
        if (disposed) return;
        progress(0.1 + (0.85 * (i + 1)) / DAYS, 'Sendersuchlauf …');
      }
      const watch = d.setPlayed ? createWatchTracker({ setPlayed: d.setPlayed, now }) : null;
      let infoFn = () => ({});
      const player = createPlayer({ video, deps: d, now, fake: !!o.fakePlayer, canvas, getInfo: () => infoFn() });
      video.disablePictureInPicture = false; // video.js setzt es auf true; die TV-Engine braucht PiP
      ctl = createTvController({
        scheduler, player, watch, pickFiller, deps: d, now,
        opts: { lastChannel: o.lastChannel, volume: o.volume, muted: o.muted },
      });
      pip = createPip({
        doc,
        video,
        getSlot: () => (app ? app.slot() : null),
        onChange: (active, info) => {
          if (disposed) return;
          bgCls(bgPip());
          if (app) app.setPip(active);
          if (d.onPip) { try { d.onPip(active); } catch { /* egal */ } }
          if (!active && !info.restored) { // Seite nicht gemountet: Instanz endet
            stopped('pip-end');
            instance.dispose();
          }
        },
      });
      app = createApp(curHost, { scheduler, ctl, video, pip, deps: d, opts: o, canvas });
      infoFn = () => {
        const s = ctl.state();
        const t = s.entry ? app.model.titleOf(s.entry).title : '';
        return { channel: `LIVE ${s.channel}`, title: t };
      };
      if (suspended) app.suspend();
      if (o.debug || (win && win.__lfxTvmDebug === true)) {
        debugOn = true;
        win.__lfxTvm = {
          ctl,
          model: app.model,
          state: () => ctl.state(),
          debugCard: (kind) => app.setOverlay(cardOverlay(kind)),
        };
      }
      booted = true;
      progress(1, 'Sendersuchlauf …');
      if (d.onReady) d.onReady();
      if (wantStart && !suspended) instance.start();
    } catch (err) {
      if (!disposed && d.onFatal) d.onFatal(err);
    }
  })();

  const instance = {
    start() {
      if (disposed) return;
      if (!booted) { wantStart = true; return; }
      suspended = false;
      ctl.start();
      armWatch();
    },
    stop,
    suspend() {
      if (disposed) return false;
      suspended = true;
      wantStart = false;
      if (app) app.suspend();
      if (pip && pip.active()) { bgCls(true); armWatch(); return true; } // läuft im Hintergrund weiter, Route/Video-Wächter bleibt
      disarmWatch();
      stop('leave');
      return false;
    },
    resume(h) {
      if (disposed) return;
      if (h) curHost = h;
      suspended = false;
      bgCls(false);
      if (!app) return;
      app.resume(h);
      if (pip) pip.hold();
      if (isOn()) armWatch();
    },
    isOn,
    isPip: () => !!(pip && pip.active()),
    dispose() {
      if (disposed) return;
      disposed = true;
      bgCls(false);
      disarmWatch();
      for (const off of unsub) { try { off(); } catch { /* egal */ } }
      unsub.length = 0;
      if (debugOn && win.__lfxTvm) { try { delete win.__lfxTvm; } catch { win.__lfxTvm = undefined; } }
      if (pip) { try { pip.dispose(); } catch { /* egal */ } }
      if (app) { try { app.dispose(); } catch { /* egal */ } }
      if (ctl) { try { ctl.dispose(); } catch { /* egal */ } }
      try { video.removeAttribute('src'); video.remove(); } catch { /* egal */ }
      app = null;
      ctl = null;
      pip = null;
      try { curHost.textContent = ''; } catch { /* egal */ }
    },
  };
  return instance;
}

if (typeof window !== 'undefined') {
  window.LenzFlixTvMode = { version: VERSION, create, mark: ENGINE_MARK };
}
