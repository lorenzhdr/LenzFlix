// TV-Modus (flix/plus/prime): Vollseite #/home?lfx=tv. Mount #lfx-tvm als erstes Kind von #homeTab (Muster newpopular.js), lädt
// Engine (window.LenzFlixTvMode) und CSS lazy. Vertrag: docs/tvmode.md. Die Hülle importiert nichts aus src/js/live.
import * as api from '../../core/api.js';
import { h } from '../../core/dom.js';
import { isMobile } from '../../core/layout.js';
import { isPopoverOpen } from '../../core/popover.js';
import { getTheme, onThemeChange } from '../../core/theme.js';
import { onDataSaverChange } from '../../core/datasaver.js';
import { ensureThemeJs, removeThemeJs } from '../../core/themejs.js';
import { ensureAddonCss, removeAddonCss } from '../../core/addoncss.js';
import { play } from '../../core/playback.js';
import { toast } from '../../core/toast.js';
import { loadCatalog } from '../live/data.js';
import { buildApiDeps, fatalText, loadUser } from '../live/deps.js';
import { openModal } from '../modal.js';
import { defineZapWarm, zapStatsEnabled } from '../live/zapflag.js';
import * as prefs from './prefs.js';
import { ON_CLASS, ROOT_ID, TV_THEMES, findHomeTab, tvModeMatch } from './route.js';
import { destroyUnlock, initUnlock, takeIntentVideo } from './unlock.js';

const ADDON = 'lenztvmode';
const CATALOG_SHARE = 0.65; // Anteil des Ladebalkens für den Katalog, der Rest für die Planung in der Engine
const BLOCK = '.lfx-modal-open,.lfx-themepicker-open,.lfx-sheet-open,.lfx-menu-open,.lfx-prime-search-open';

let gen = 0;
let waitTimer = null;
let inst = null; // { instance, ready, pip }
let ui = null; // { root, boot, fill, label }
let themeOff = null;
let saverOff = null;

const html = () => document.documentElement;
const coarse = () => {
  try { return Boolean(window.matchMedia && window.matchMedia('(pointer:coarse)').matches); } catch { return false; }
};

initUnlock(); // einmal beim Laden des Features; destroyTvMode() entfernt den Listener

// ------------------------------------------------------------------ Instanz / Beobachter

// Die Detailkarte (Modal) liegt über dem weiterlaufenden TV; Abspielen stoppt die Engine selbst (lfx:play in der Engine).

function disposeInstance() {
  const cur = inst;
  inst = null;
  if (!cur) return;
  try { cur.instance.dispose(); } catch (e) { console.warn('[LenzFlix] tvmode dispose', fatalText(e)); }
}

function watchTheme() {
  if (!themeOff) themeOff = onThemeChange(onTheme);
  // Datensparmodus an: vorgewärmte Nachbarsitzungen sofort beenden (sonst Ablauf nach <= 40 s)
  if (!saverOff) saverOff = onDataSaverChange((active) => { if (active && inst) { try { inst.instance.releaseWarm(); } catch { /* egal */ } } });
}

function unwatchTheme() {
  if (themeOff) themeOff();
  themeOff = null;
  if (saverOff) saverOff();
  saverOff = null;
}

/** Design-Wechsel: Instanz sofort verwerfen; bleibt die Seite gültig (flix/plus/prime), neu laden. */
function onTheme() {
  const mounted = Boolean(ui);
  disposeInstance();
  removeAddonCss(ADDON);
  if (!mounted) { unwatchTheme(); return; }
  if (TV_THEMES.includes(getTheme())) restartBoot();
}

// ------------------------------------------------------------------ UI

function setProgress(fraction, label) {
  if (!ui || !ui.fill) return;
  const v = Math.max(Number(ui.fill.dataset.v || 0), Math.max(0, Math.min(1, Number(fraction) || 0)));
  ui.fill.dataset.v = String(v);
  ui.fill.style.width = `${Math.round(v * 100)}%`;
  if (label && ui.label) ui.label.textContent = label;
}

function buildBoot() {
  const fill = h('div', { class: 'lfx-tvm__boot-fill' });
  fill.style.width = '0%';
  const label = h('p', { class: 'lfx-tvm__boot-text', 'aria-live': 'polite' }, 'TV wird vorbereitet …');
  const boot = h('div', { class: 'lfx-tvm__boot', role: 'status' }, [
    h('span', { class: 'lfx-tvm__boot-spin', 'aria-hidden': 'true' }),
    label,
    h('div', { class: 'lfx-tvm__boot-bar' }, [fill]),
  ]);
  return { boot, fill, label };
}

function attachBoot() {
  if (!ui) return;
  ui.boot.remove();
  ui.root.querySelector('.lfx-tvm__fallback')?.remove();
  Object.assign(ui, buildBoot());
  ui.root.classList.add('is-loading');
  ui.root.append(ui.boot);
}

function teardownUi() {
  if (ui) ui.root.remove();
  ui = null;
  document.getElementById(ROOT_ID)?.remove();
  html().classList.remove(ON_CLASS);
}

function showFallback(err) {
  if (!ui) return;
  ui.boot.remove();
  ui.root.classList.remove('is-loading');
  ui.root.querySelector('.lfx-tvm__fallback')?.remove();
  const btn = (text, fn, primary) => h('button', { type: 'button', class: `lfx-tvm__fallback-btn${primary ? ' is-primary' : ''}`, onclick: fn }, text);
  const detail = fatalText(err);
  ui.root.append(h('div', { class: 'lfx-tvm__fallback', role: 'alert' }, [
    h('p', { class: 'lfx-tvm__fallback-text' }, detail ? `TV konnte nicht gestartet werden: ${detail}` : 'TV konnte nicht gestartet werden.'),
    h('div', { class: 'lfx-tvm__fallback-actions' }, [
      btn('Erneut versuchen', () => restartBoot(), true),
      btn('Zur Startseite', () => { window.location.hash = '#/home'; }),
    ]),
  ]));
}

// ------------------------------------------------------------------ Deps / Start

const ret = (f) => (...a) => { try { return f(...a); } catch (e) { console.warn('[LenzFlix] tvmode dep', fatalText(e)); return undefined; } };

const blocked = () => isPopoverOpen() || html().matches(BLOCK);

async function playFromStart(id) {
  let item = null;
  try { item = await api.getItem(id); } catch { /* minimales Item */ }
  let ok = false;
  try { ok = (await play(item && item.Id ? item : { Id: id }, { resume: false })) !== false; } catch (e) { console.warn('[LenzFlix] tvmode play', fatalText(e)); }
  if (!ok) {
    // Die Engine hat schon gestoppt: Seite wieder einschaltbar machen, sofern sie noch gemountet ist
    try { toast('Wiedergabe konnte nicht gestartet werden'); } catch { /* egal */ }
    if (ui && inst && inst.ready) {
      try { if (!inst.instance.isOn() && !inst.pip) inst.instance.start(); } catch { /* egal */ }
    }
  }
  return ok;
}

function buildDeps(raw, user, hooks) {
  return defineZapWarm({ // Spread kopiert den Getter zapWarm nur als Wert: neu setzen
    ...buildApiDeps(raw, user),
    savePrefs: ret((p) => prefs.savePrefs(p)),
    // alle Designs: Detailkarte als Overlay über dem weiterlaufenden TV (plus/prime mit „Zur Titelseite“)
    openDetails: ret((id) => { openModal(id, { overlay: true }); }),
    playFromStart: ret(playFromStart),
    keysBlocked: ret(blocked),
    toast: ret((text) => toast(text)),
    onProgress: ret((f, label) => setProgress(CATALOG_SHARE + (1 - CATALOG_SHARE) * (Number(f) || 0), label)),
    onReady: ret(hooks.ready),
    onFatal: ret(hooks.fatal),
    onStopped: ret(hooks.stopped),
    onPip: ret((active) => { if (inst) inst.pip = Boolean(active); }),
  });
}

function buildOpts(video) {
  return {
    video,
    lastChannel: prefs.getLastChannel(),
    volume: prefs.getVolume(),
    muted: prefs.getMuted(),
    phone: isMobile(),
    touch: coarse(),
    debug: window.__lfxTvmDebug === true,
    zapStats: zapStatsEnabled(),
  };
}

async function boot(myGen) {
  setProgress(0.03, 'TV wird vorbereitet …');
  let loaded;
  try {
    const [cssOk, jsOk, raw, user] = await Promise.all([
      ensureAddonCss(ADDON),
      ensureThemeJs('tvmode'),
      loadCatalog({ onProgress: (f, label) => setProgress(0.05 + (CATALOG_SHARE - 0.05) * f, label) }),
      loadUser(),
    ]);
    if (!cssOk || !jsOk || !window.LenzFlixTvMode || typeof window.LenzFlixTvMode.create !== 'function') throw new Error('TV-Paket nicht geladen');
    loaded = { raw, user };
  } catch (e) {
    if (myGen === gen && ui) showFallback(e);
    return;
  }
  if (myGen !== gen || !ui) return;
  setProgress(CATALOG_SHARE, 'Programm wird zusammengestellt …');
  let fatal = false;
  let early = false; // onReady kann schon während create() feuern
  let instance = null;
  const finishReady = () => {
    if (!ui || !inst || inst.instance !== instance) return; // an die Instanz gebunden, nicht an gen (ensure() kann zwischenzeitlich andocken)
    inst.ready = true;
    ui.boot.remove();
    ui.root.classList.remove('is-loading');
    try { instance.start(); } catch (e) { console.warn('[LenzFlix] tvmode start', fatalText(e)); }
  };
  const deps = buildDeps(loaded.raw, loaded.user, {
    ready: () => { if (instance) finishReady(); else early = true; },
    fatal: (err) => {
      fatal = true;
      disposeInstance();
      if (myGen === gen) showFallback(err);
    },
    stopped: ({ reason } = {}) => {
      // Stopp im Hintergrund (Seite nicht gemountet, z. B. PiP vorbei): behaltene Instanz vergessen
      if (ui || !inst || reason === 'leave') return;
      disposeInstance();
    },
  });
  try {
    instance = window.LenzFlixTvMode.create(ui.root, deps, buildOpts(takeIntentVideo()));
    if (!instance) throw new Error('create() lieferte keine Instanz');
    if (fatal || myGen !== gen || !ui) {
      try { instance.dispose(); } catch { /* egal */ }
      return;
    }
    inst = { instance, ready: false, pip: false };
    if (early) finishReady();
  } catch (e) {
    if (myGen === gen && ui) showFallback(e);
  }
}

function restartBoot() {
  if (!ui) return;
  disposeInstance();
  attachBoot();
  gen += 1;
  boot(gen);
}

function start(tab, myGen) {
  teardownUi();
  const { boot: bootEl, fill, label } = buildBoot();
  ui = { root: h('div', { id: ROOT_ID, class: 'lfx-tvm is-loading' }, [bootEl]), boot: bootEl, fill, label };
  tab.prepend(ui.root);
  html().classList.add(ON_CLASS);
  watchTheme();
  if (inst && inst.instance) {
    // Behaltene Instanz (PiP) bzw. neuer #homeTab: an den neuen Host andocken; Ladebildschirm nur weg, wenn schon bereit
    if (inst.ready) {
      ui.boot.remove();
      ui.root.classList.remove('is-loading');
    }
    try {
      inst.instance.resume(ui.root);
      if (inst.ready && !inst.pip && !inst.instance.isOn()) inst.instance.start();
    } catch (e) {
      console.warn('[LenzFlix] tvmode resume', fatalText(e));
      restartBoot();
    }
    return;
  }
  boot(myGen);
}

function ensure() {
  clearTimeout(waitTimer);
  const tab = findHomeTab();
  const existing = document.getElementById(ROOT_ID);
  if (tab && existing && ui && tab.contains(existing)) return;
  gen += 1;
  const myGen = gen;
  let tries = 0;
  const poll = () => {
    if (myGen !== gen) return;
    const t = findHomeTab();
    if (t) start(t, myGen);
    else if (++tries < 30) waitTimer = setTimeout(poll, 200);
  };
  if (tab) poll();
  else waitTimer = setTimeout(poll, 200);
}

/** Für main.js destroy()/stopFeatures: alles sofort freigeben (Instanz, DOM, CSS, Script-Tags, Intent-Listener). */
export function destroyTvMode() {
  gen += 1;
  clearTimeout(waitTimer);
  waitTimer = null;
  disposeInstance();
  teardownUi();
  unwatchTheme();
  removeAddonCss(ADDON);
  removeThemeJs();
  destroyUnlock();
}

const tvModeFeature = {
  name: 'tvmode',
  match: tvModeMatch,
  mount: () => ensure(),
  update() {
    // viewshow feuert öfter: nur nachziehen, wenn die Seite fehlt (z. B. #homeTab neu aufgebaut)
    const tab = findHomeTab();
    if (!tab || (ui && tab.contains(ui.root))) return;
    ensure();
  },
  unmount() {
    gen += 1;
    clearTimeout(waitTimer);
    waitTimer = null;
    if (inst) {
      let kept = false;
      try { kept = inst.instance.suspend() === true; } catch (e) { console.warn('[LenzFlix] tvmode suspend', fatalText(e)); }
      if (!kept) disposeInstance();
    }
    teardownUi();
    if (!inst) unwatchTheme();
  },
};

export default tvModeFeature;
