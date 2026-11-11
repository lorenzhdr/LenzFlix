// VIDEOTHEK LENZ: 3D-Startseite. Mount #lfx-store-home als erstes Kind von #homeTab (Proxy-Klick fürs Abspielen braucht den
// Legacy-Container), darin Bühne (div.lfx-store-stage für window.LenzFlixStore3D), Ladebildschirm, HUD und Fallback-Panel.
// Lebenszyklus (Ausnahme vom Unmount-Vertrag, docs/store3d.md): unmount() setzt die 3D-Instanz nur aus (suspend), nach 3 min
// oder bei Design-Wechsel/destroy folgt dispose(). Die Hülle importiert nie `three`.
import * as api from '../../core/api.js';
import { h } from '../../core/dom.js';
import { isMobile, isModern, isTv } from '../../core/layout.js';
import { play } from '../../core/playback.js';
import { isTheme, onThemeChange, setTheme } from '../../core/theme.js';
import { openThemePicker } from '../../core/themepicker.js';
import { ensureThemeJs, removeThemeJs } from '../../core/themejs.js';
import { toast } from '../../core/toast.js';
import { logout } from '../../shared/profile.js';
import { searchItems } from '../../shared/search.js';
import { loadLocalTrailer, trailerUrl } from '../../shared/trailer.js';
import { loadCatalog } from './data.js';
import { closeProfileMenu, hudButton, profileButton, toggleProfileMenu, wordmark } from './hud.js';
import { findHomeTab, ON_CLASS, ROOT_ID, storeHomeRoute } from './home-route.js';
import * as prefs from './prefs.js';

export const SUSPEND_MS = 3 * 60 * 1000;
const CLASSIC_HASH = '#/home?lfx=classic';
const FADE_MS = 450;

let gen = 0;
let waitTimer = null;
let fadeTimer = null;
let inst = null; // { instance, unsubTheme, disposeTimer, ready }
let ui = null; // { root, stage, loading, fill, label, hud, avatar, searchBtn }
let lastKey = null;
let shown = false; // Bühne gerade im DOM

const root = () => document.documentElement;

export function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return false;
    try {
      const ext = gl.getExtension && gl.getExtension('WEBGL_lose_context');
      if (ext) ext.loseContext();
    } catch { /* egal */ }
    return true;
  } catch {
    return false;
  }
}

const coarse = () => {
  try { return Boolean(window.matchMedia && window.matchMedia('(pointer:coarse)').matches); } catch { return false; }
};

// ------------------------------------------------------------------ Instanz

function clearDisposeTimer() {
  if (inst && inst.disposeTimer) {
    clearTimeout(inst.disposeTimer);
    inst.disposeTimer = null;
  }
}

function disposeInstance() {
  const cur = inst;
  if (!cur) return;
  inst = null;
  clearTimeout(cur.disposeTimer);
  if (cur.unsubTheme) cur.unsubTheme();
  try { cur.instance.dispose(); } catch (e) { console.warn('[LenzFlix] store dispose', e && e.message); }
}

// ------------------------------------------------------------------ UI

function setProgress(fraction, label) {
  if (!ui || !ui.fill) return;
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  const prev = Number(ui.fill.dataset.v || 0);
  const v = Math.max(prev, f);
  ui.fill.dataset.v = String(v);
  ui.fill.style.width = `${Math.round(v * 100)}%`;
  ui.loading.querySelector('.lfx-store-tape').setAttribute('aria-valuenow', String(Math.round(v * 100)));
  if (label && ui.label) ui.label.textContent = label;
}

function buildLoading() {
  const fill = h('div', { class: 'lfx-store-tape__fill' });
  fill.style.width = '0%';
  const label = h('p', { class: 'lfx-store-loading__label', 'aria-live': 'polite' }, 'Videothek wird aufgeschlossen …');
  const loading = h('div', { class: 'lfx-store-loading' }, [
    h('div', { class: 'lfx-store-sign', role: 'img', 'aria-label': 'VIDEOTHEK LENZ, Verleih und Verkauf' }, [
      h('span', { class: 'lfx-store-sign__name' }, 'VIDEOTHEK LENZ'),
      h('span', { class: 'lfx-store-sign__sub' }, 'Verleih & Verkauf'),
    ]),
    h('div', { class: 'lfx-store-tape', role: 'progressbar', 'aria-label': 'Ladefortschritt', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, [
      h('div', { class: 'lfx-store-tape__reel lfx-store-tape__reel--l', 'aria-hidden': 'true' }),
      h('div', { class: 'lfx-store-tape__band' }, [fill]),
      h('div', { class: 'lfx-store-tape__reel lfx-store-tape__reel--r', 'aria-hidden': 'true' }),
    ]),
    label,
  ]);
  return { loading, fill, label };
}

function buildUi() {
  const stage = h('div', { class: 'lfx-store-stage' });
  const { loading, fill, label } = buildLoading();
  const searchBtn = hudButton('lfx-store-btn--search', 'Suche', 'search');
  searchBtn.disabled = true;
  searchBtn.addEventListener('click', () => { if (inst && inst.instance) inst.instance.openTerminal(''); });
  const classicBtn = hudButton('lfx-store-btn--classic', 'Klassische Ansicht', 'classic');
  classicBtn.addEventListener('click', () => { window.location.hash = CLASSIC_HASH; });
  const avatar = profileButton();
  const hud = h('div', { class: 'lfx-store-hud', role: 'toolbar', 'aria-label': 'Videothek' }, [
    wordmark(), h('span', { class: 'lfx-store-hud__spacer' }), searchBtn, classicBtn, avatar.el,
  ]);
  const el = h('div', { id: ROOT_ID, class: 'lfx-store-home' }, [stage, loading, hud]);
  return { root: el, stage, loading, fill, label, hud, avatar, searchBtn };
}

/** (Neuen) Ladebildschirm vor dem HUD einhängen und in ui eintragen. */
function attachLoading() {
  if (!ui) return;
  ui.loading.remove();
  const { loading, fill, label } = buildLoading();
  ui.root.insertBefore(loading, ui.hud);
  ui.loading = loading;
  ui.fill = fill;
  ui.label = label;
  ui.stage.classList.remove('is-ready');
}

function teardownUi() {
  clearTimeout(fadeTimer);
  fadeTimer = null;
  closeProfileMenu();
  if (ui) {
    ui.avatar.destroy();
    ui.root.remove();
  }
  ui = null;
  document.getElementById(ROOT_ID)?.remove();
  root().classList.remove(ON_CLASS);
  shown = false;
}

function showFallback(message, { retry = false, detail = '' } = {}) {
  if (!ui) return;
  clearTimeout(fadeTimer);
  ui.loading.remove();
  ui.root.querySelector('.lfx-store-fallback')?.remove();
  const actions = [];
  if (retry) {
    const again = h('button', { type: 'button', class: 'lfx-store-fallback__btn lfx-store-fallback__btn--primary' }, 'Erneut versuchen');
    again.addEventListener('click', () => retryBoot());
    actions.push(again);
  }
  const flix = h('button', { type: 'button', class: `lfx-store-fallback__btn${retry ? '' : ' lfx-store-fallback__btn--primary'}` }, 'Zu LENZFLIX wechseln');
  flix.addEventListener('click', () => { setTheme('flix', { source: 'user' }); });
  const classic = h('button', { type: 'button', class: 'lfx-store-fallback__btn' }, 'Klassische Ansicht');
  classic.addEventListener('click', () => { window.location.hash = CLASSIC_HASH; });
  actions.push(flix, classic);
  const panel = h('div', { class: 'lfx-store-fallback', role: 'alert' }, [
    h('div', { class: 'lfx-store-fallback__box' }, [
      h('h2', { class: 'lfx-store-fallback__title' }, 'VIDEOTHEK LENZ'),
      h('p', { class: 'lfx-store-fallback__text' }, message),
      detail ? h('p', { class: 'lfx-store-fallback__detail' }, detail) : null,
      h('div', { class: 'lfx-store-fallback__actions' }, actions),
    ]),
  ]);
  ui.root.insertBefore(panel, ui.hud);
}

function fatalText(err) {
  const m = err && err.message ? String(err.message) : '';
  return m.replace(/api_key=[^&\s]+/gi, 'api_key=…').slice(0, 200);
}

// ------------------------------------------------------------------ Route

function applyRoute(r) {
  if (!inst || !inst.instance || !r) return;
  try {
    if (r.kind === 'title' && r.id) inst.instance.openItem(r.id);
    else if (r.kind === 'search') inst.instance.openTerminal(r.q || '');
  } catch (e) {
    console.warn('[LenzFlix] store route', e && e.message);
  }
}

const routeKey = (route) => (route && route.hash) || '';

// ------------------------------------------------------------------ Deps / Start

async function userName() {
  try {
    const u = await api.getUser();
    return (u && u.Name) || '';
  } catch {
    return '';
  }
}

function buildDeps(catalog, name, onFatal, onBigCovers) {
  const ret = (f) => (...a) => { try { return f(...a); } catch (e) { console.warn('[LenzFlix] store dep', e && e.message); return undefined; } };
  const items = (res) => (Array.isArray(res) ? res : (res && Array.isArray(res.Items) ? res.Items : []));
  return {
    catalog,
    user: { name },
    imageUrl: (id, o = {}) => api.imageUrlFor(id, o),
    getItem: (id) => api.getItem(id),
    getSeasons: (seriesId) => api.getSeasons(seriesId).then(items),
    getEpisodes: (seriesId, seasonId) => api.getEpisodes(seriesId, { SeasonId: seasonId, Fields: 'Overview,RunTimeTicks', EnableUserData: true }).then(items),
    setFavorite: (id, v) => api.setFavorite(id, v),
    setPlayed: (id, v) => api.setPlayed(id, v),
    search: async (q, { signal } = {}) => {
      const r = await searchItems(q, { signal });
      return [...r.movies, ...r.series];
    },
    loadTrailer: async (item) => {
      try {
        let it = item;
        if (it && it.LocalTrailerCount === undefined && it.Id) it = await api.getItem(it.Id);
        const t = await loadLocalTrailer(it);
        return t ? trailerUrl(t.Id) : null;
      } catch {
        return null;
      }
    },
    play: (item, o = {}) => play(item, { resume: Boolean(o.resume) }),
    toast: (text) => toast(text),
    classicView: () => { window.location.hash = CLASSIC_HASH; },
    openLibraries: () => { window.location.hash = CLASSIC_HASH; },
    openMenu: (anchor) => {
      const a = anchor || (ui && ui.avatar.el);
      if (a) toggleProfileMenu(a);
    },
    openSettings: () => { window.location.hash = '#/mypreferencesmenu'; },
    openThemePicker: () => { openThemePicker({}); },
    logout: () => logout(),
    onProgress: ret((f, label) => setProgress(f, label)),
    onReady: ret(() => {
      if (!ui) return;
      if (inst) inst.ready = true;
      setProgress(1);
      ui.searchBtn.disabled = false;
      ui.stage.classList.add('is-ready');
      ui.loading.classList.add('is-done');
      const el = ui.loading;
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => { fadeTimer = null; el.remove(); }, FADE_MS);
    }),
    onState: ret((s) => prefs.saveState(s)),
    onPrefs: ret((p) => prefs.savePrefs(p)),
    onBigCovers: ret((on) => onBigCovers(on)),
    onFatal: ret(onFatal),
  };
}

function buildOpts(r) {
  return {
    quality: prefs.getQuality(),
    sound: prefs.getSound(),
    showFps: prefs.getFps(),
    voiceOnline: prefs.getVoiceOnline(),
    voiceName: prefs.getVoiceName(),
    voicePitch: prefs.getVoicePitch(),
    bigCovers: prefs.getBigCovers(),
    skipIntro: prefs.getIntroSeen(),
    restore: prefs.getState(),
    openItemId: r && r.kind === 'title' ? r.id : null,
    openTerminal: Boolean(r && r.kind === 'search'),
    query: r && r.kind === 'search' ? r.q || '' : '',
    phone: isMobile(),
    touch: coarse(),
    debug: window.__lfxStoreDebug === true,
  };
}

async function boot(myGen, route) {
  if (!hasWebGL()) {
    showFallback('Dein Browser kann die 3D-Videothek nicht darstellen.');
    return;
  }
  setProgress(0.05, 'Videothek wird aufgeschlossen …');
  let loaded;
  try {
    const [ok, catalog, name] = await Promise.all([ensureThemeJs('store'), loadCatalog(), userName()]);
    if (!ok || !window.LenzFlixStore3D) throw new Error('3D-Paket nicht geladen');
    loaded = { catalog, name };
  } catch (e) {
    if (myGen !== gen || !ui) return;
    showFallback('Die Videothek konnte nicht geladen werden.', { retry: true, detail: fatalText(e) });
    return;
  }
  if (myGen !== gen || !ui) return; // Seite inzwischen verlassen
  setProgress(0.1, 'Regale werden eingeräumt …');
  let fatal = false;
  const deps = buildDeps(loaded.catalog, loaded.name, (err) => {
    fatal = true; // kann schon während create() feuern
    disposeInstance();
    showFallback('Die 3D-Videothek konnte nicht gestartet werden.', { retry: true, detail: fatalText(err) });
  }, (on) => rebuild(on));
  const opts = buildOpts(route);
  prefs.setIntroSeen();
  try {
    const instance = window.LenzFlixStore3D.create(ui.stage, deps, opts);
    if (!instance) throw new Error('create() lieferte keine Instanz');
    if (fatal || myGen !== gen || !ui) {
      try { instance.dispose(); } catch { /* egal */ }
      return;
    }
    const entry = { instance, ready: false, disposeTimer: null, unsubTheme: null };
    entry.unsubTheme = onThemeChange(({ theme }) => { if (theme !== 'store') disposeInstance(); });
    inst = entry;
  } catch (e) {
    if (myGen === gen && ui) showFallback('Die 3D-Videothek konnte nicht gestartet werden.', { retry: true, detail: fatalText(e) });
  }
}

/** Hüllengröße geändert (aus dem Pause-Menü): Pref sichern, Instanz verwerfen, mit Ladebildschirm neu starten (ohne Intro, Position bleibt). */
function rebuild(on) {
  if (!ui || !inst || !shown) return; // Seite verlassen: nichts neu aufbauen
  prefs.savePrefs({ bigCovers: Boolean(on) });
  // Aufruf kommt aus der Instanz selbst: Abbau/Neuaufbau erst nach ihrem Callback-Stack
  const g = gen;
  setTimeout(() => {
    if (g !== gen || !ui || !inst || !shown) return;
    disposeInstance();
    attachLoading();
    ui.searchBtn.disabled = true;
    gen += 1;
    boot(gen, storeHomeRoute(parseCurrent()));
  }, 0);
}

function retryBoot() {
  if (!ui) return;
  ui.root.querySelector('.lfx-store-fallback')?.remove();
  attachLoading();
  gen += 1;
  boot(gen, storeHomeRoute(parseCurrent()));
}

function parseCurrent() {
  const hash = String(window.location.hash || '').replace(/^#!?/, '');
  const qi = hash.indexOf('?');
  const path = (qi < 0 ? hash : hash.slice(0, qi)) || '/home';
  return { path, params: new URLSearchParams(qi < 0 ? '' : hash.slice(qi + 1)), hash };
}

function start(tab, route, myGen) {
  teardownUi();
  ui = buildUi();
  tab.prepend(ui.root);
  root().classList.add(ON_CLASS);
  shown = true;
  const r = storeHomeRoute(route);
  if (inst && inst.instance) {
    // Suspendierte Instanz weiterverwenden: kein Ladebildschirm
    clearDisposeTimer();
    ui.loading.remove();
    ui.searchBtn.disabled = false;
    ui.stage.classList.add('is-ready');
    try {
      inst.instance.resume(ui.stage);
    } catch (e) {
      console.warn('[LenzFlix] store resume', e && e.message);
      disposeInstance();
      attachLoading();
      boot(myGen, r);
      return;
    }
    applyRoute(r);
    return;
  }
  boot(myGen, r);
}

function ensure(route) {
  clearTimeout(waitTimer);
  const tab = findHomeTab();
  const existing = document.getElementById(ROOT_ID);
  if (tab && existing && tab.contains(existing) && ui && shown) return;
  gen += 1;
  const myGen = gen;
  let tries = 0;
  const poll = () => {
    if (myGen !== gen) return;
    const t = findHomeTab();
    if (t) start(t, route, myGen);
    else if (++tries < 30) waitTimer = setTimeout(poll, 200);
  };
  if (tab) poll();
  else waitTimer = setTimeout(poll, 200);
}

/** Für main.js destroy()/stopFeatures: alles sofort freigeben (Instanz, DOM, Script-Tags). */
export function destroyStore() {
  gen += 1;
  clearTimeout(waitTimer);
  waitTimer = null;
  disposeInstance();
  teardownUi();
  lastKey = null;
  removeThemeJs();
}

const storeHome = {
  name: 'store-home',
  match: (route) => isTheme('store') && isModern() && !isTv() && api.isReady() && Boolean(storeHomeRoute(route)),
  mount(route) {
    lastKey = routeKey(route);
    ensure(route);
  },
  update(route) {
    const key = routeKey(route);
    const same = key === lastKey;
    lastKey = key;
    if (same) {
      // viewshow feuert öfter: nur nachziehen, wenn die Bühne fehlt (z. B. #homeTab neu aufgebaut)
      const tab = findHomeTab();
      if (!tab || !ui || tab.contains(ui.root)) return;
      ensure(route);
      return;
    }
    if (ui && inst && shown) applyRoute(storeHomeRoute(route));
    else ensure(route);
  },
  unmount() {
    gen += 1;
    clearTimeout(waitTimer);
    waitTimer = null;
    lastKey = null;
    if (inst && inst.instance) {
      try { inst.instance.suspend(); } catch (e) { console.warn('[LenzFlix] store suspend', e && e.message); }
      clearDisposeTimer();
      inst.disposeTimer = setTimeout(disposeInstance, SUSPEND_MS);
    }
    teardownUi();
  },
};

export default storeHome;
