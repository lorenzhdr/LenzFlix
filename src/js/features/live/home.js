// LENZ LIVE: Startseite mit Fernseher. Mount #lfx-live-home als erstes Kind von #homeTab, darin Bühne (div.lfx-live-stage für
// window.LenzFlixLive), Ladeanzeige „Sendersuchlauf“ und Fallback-Panel. Vertrag: docs/live.md.
// Lebenszyklus (wie VIDEOTHEK LENZ): unmount() setzt die Instanz nur aus (suspend), nach 3 min oder bei Design-Wechsel/destroy
// folgt dispose(). Die Hülle importiert nichts aus src/js/live.
import * as api from '../../core/api.js';
import { h } from '../../core/dom.js';
import { isMobile, isModern, isTv } from '../../core/layout.js';
import { THEME_META, getPreviousTheme, isTheme, onThemeChange } from '../../core/theme.js';
import { openThemePicker } from '../../core/themepicker.js';
import { ensureThemeJs, removeThemeJs } from '../../core/themejs.js';
import { toast } from '../../core/toast.js';
import { logout } from '../../shared/profile.js';
import { loadCatalog } from './data.js';
import { buildApiDeps, fatalText, loadUser } from './deps.js';
import { findHomeTab, liveHomeRoute, ON_CLASS, ROOT_ID } from './home-route.js';
import { leaveToLibrary } from './leave.js';
import { zapStatsEnabled } from './zapflag.js';
import * as prefs from './prefs.js';

export const SUSPEND_MS = 3 * 60 * 1000;
const FADE_MS = 450;
const CATALOG_SHARE = 0.65; // Anteil des Ladebalkens für den Katalog, der Rest für die Planung in der Engine

let gen = 0;
let waitTimer = null;
let fadeTimer = null;
let inst = null; // { instance, unsubTheme, disposeTimer, ready }
let ui = null; // { root, stage, loading, fill, label, ch }
let shown = false;

const root = () => document.documentElement;

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
  try { cur.instance.dispose(); } catch (e) { console.warn('[LenzFlix] live dispose', e && e.message); }
}

// ------------------------------------------------------------------ UI

const pad2 = (n) => String(n).padStart(2, '0');

function setProgress(fraction, label) {
  if (!ui || !ui.fill) return;
  const f = Math.max(0, Math.min(1, Number(fraction) || 0));
  const prev = Number(ui.fill.dataset.v || 0);
  const v = Math.max(prev, f);
  ui.fill.dataset.v = String(v);
  ui.fill.style.width = `${Math.round(v * 100)}%`;
  ui.bar.setAttribute('aria-valuenow', String(Math.round(v * 100)));
  if (ui.ch) ui.ch.textContent = pad2(Math.max(1, Math.min(18, Math.ceil(v * 18))));
  if (label && ui.label) ui.label.textContent = label;
}

function buildLoading() {
  const ch = h('span', { class: 'lfx-live-loading__ch', 'aria-hidden': 'true' }, '01');
  const fill = h('div', { class: 'lfx-live-loading__fill' });
  fill.style.width = '0%';
  const bar = h('div', { class: 'lfx-live-loading__bar', role: 'progressbar', 'aria-label': 'Ladefortschritt', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, [fill]);
  const label = h('p', { class: 'lfx-live-loading__label', 'aria-live': 'polite' }, 'Sendersuchlauf …');
  const loading = h('div', { class: 'lfx-live-loading' }, [
    h('div', { class: 'lfx-live-loading__screen' }, [
      h('span', { class: 'lfx-live-loading__tag', 'aria-hidden': 'true' }, 'PR'),
      ch,
      h('span', { class: 'lfx-live-loading__brand' }, 'LENZ LIVE'),
    ]),
    h('p', { class: 'lfx-live-loading__title' }, 'Sendersuchlauf …'),
    bar,
    label,
  ]);
  return { loading, fill, label, ch, bar };
}

function buildUi() {
  const stage = h('div', { class: 'lfx-live-stage' });
  const { loading, fill, label, ch, bar } = buildLoading();
  const el = h('div', { id: ROOT_ID, class: 'lfx-live-home' }, [stage, loading]);
  return { root: el, stage, loading, fill, label, ch, bar };
}

/** (Neuen) Ladebildschirm einhängen und in ui eintragen. */
function attachLoading() {
  if (!ui) return;
  ui.loading.remove();
  const { loading, fill, label, ch, bar } = buildLoading();
  ui.root.append(loading);
  Object.assign(ui, { loading, fill, label, ch, bar });
}

function teardownUi() {
  clearTimeout(fadeTimer);
  fadeTimer = null;
  if (ui) ui.root.remove();
  ui = null;
  document.getElementById(ROOT_ID)?.remove();
  root().classList.remove(ON_CLASS);
  shown = false;
}

function openDashboard() {
  window.location.hash = '#/dashboard';
}

function prevName() {
  const t = THEME_META[getPreviousTheme()];
  return t ? t.name : 'LENZFLIX';
}

function showFallback(message, { retry = false, detail = '' } = {}) {
  if (!ui) return;
  clearTimeout(fadeTimer);
  ui.loading.remove();
  ui.root.querySelector('.lfx-live-fallback')?.remove();
  const btn = (text, onClick, primary = false) => {
    const b = h('button', { type: 'button', class: `lfx-live-fallback__btn${primary ? ' lfx-live-fallback__btn--primary' : ''}` }, text);
    b.addEventListener('click', onClick);
    return b;
  };
  const actions = [];
  if (retry) actions.push(btn('Erneut versuchen', () => retryBoot(), true));
  actions.push(btn('Design wechseln', () => { openThemePicker({}); }, !retry));
  actions.push(btn(`Zu ${prevName()}`, () => { leaveToLibrary(null); }));
  actions.push(btn('Abmelden', () => logout()));
  const panel = h('div', { class: 'lfx-live-fallback', role: 'alert' }, [
    h('div', { class: 'lfx-live-fallback__box' }, [
      h('h2', { class: 'lfx-live-fallback__title' }, 'LENZ LIVE'),
      h('p', { class: 'lfx-live-fallback__text' }, message),
      detail ? h('p', { class: 'lfx-live-fallback__detail' }, detail) : null,
      h('div', { class: 'lfx-live-fallback__actions' }, actions),
    ]),
  ]);
  ui.root.append(panel);
}

// ------------------------------------------------------------------ Deps / Start

function buildDeps(raw, user, onFatal) {
  const ret = (f) => (...a) => { try { return f(...a); } catch (e) { console.warn('[LenzFlix] live dep', e && e.message); return undefined; } };
  return {
    ...buildApiDeps(raw, user),
    savePrefs: ret((p) => prefs.savePrefs(p)),
    leaveToLibrary: (id, meta) => leaveToLibrary(id, meta || {}),
    previousThemeName: prevName(),
    openThemePicker: () => { openThemePicker({}); },
    openDashboard,
    logout: () => logout(),
    toast: (text) => toast(text),
    onProgress: ret((f, label) => setProgress(CATALOG_SHARE + (1 - CATALOG_SHARE) * (Number(f) || 0), label)),
    onReady: ret(() => {
      if (!ui) return;
      if (inst) inst.ready = true;
      setProgress(1);
      ui.stage.classList.add('is-ready');
      ui.loading.classList.add('is-done');
      const el = ui.loading;
      clearTimeout(fadeTimer);
      fadeTimer = setTimeout(() => { fadeTimer = null; el.remove(); }, FADE_MS);
    }),
    onFatal: ret(onFatal),
  };
}

function buildOpts() {
  return {
    style: prefs.getStyle(),
    volume: prefs.getVolume(),
    muted: prefs.getMuted(),
    lastChannel: prefs.getLastChannel(),
    music: prefs.getMusic(),
    fx: prefs.getFx(),
    audioPref: null,
    phone: isMobile(),
    touch: coarse(),
    debug: window.__lfxLiveDebug === true,
    zapStats: zapStatsEnabled(),
    now: null,
    fakePlayer: false,
  };
}

async function boot(myGen) {
  setProgress(0.03, 'Sendersuchlauf …');
  let loaded;
  try {
    const [ok, raw, user] = await Promise.all([
      ensureThemeJs('live'),
      loadCatalog({ onProgress: (f, label) => setProgress(0.05 + (CATALOG_SHARE - 0.05) * f, label) }),
      loadUser(),
    ]);
    if (!ok || !window.LenzFlixLive || typeof window.LenzFlixLive.create !== 'function') throw new Error('Engine-Paket nicht geladen');
    loaded = { raw, user };
  } catch (e) {
    if (myGen !== gen || !ui) return;
    showFallback('LENZ LIVE konnte nicht geladen werden.', { retry: true, detail: fatalText(e) });
    return;
  }
  if (myGen !== gen || !ui) return; // Seite inzwischen verlassen
  setProgress(CATALOG_SHARE, 'Programm wird zusammengestellt …');
  let fatal = false;
  const deps = buildDeps(loaded.raw, loaded.user, (err) => {
    fatal = true; // kann schon während create() feuern
    disposeInstance();
    showFallback('LENZ LIVE konnte nicht gestartet werden.', { retry: true, detail: fatalText(err) });
  });
  try {
    const instance = window.LenzFlixLive.create(ui.stage, deps, buildOpts());
    if (!instance) throw new Error('create() lieferte keine Instanz');
    if (fatal || myGen !== gen || !ui) {
      try { instance.dispose(); } catch { /* egal */ }
      return;
    }
    const entry = { instance, ready: false, disposeTimer: null, unsubTheme: null };
    entry.unsubTheme = onThemeChange(({ theme }) => { if (theme !== 'live') disposeInstance(); });
    inst = entry;
  } catch (e) {
    if (myGen === gen && ui) showFallback('LENZ LIVE konnte nicht gestartet werden.', { retry: true, detail: fatalText(e) });
  }
}

function retryBoot() {
  if (!ui) return;
  ui.root.querySelector('.lfx-live-fallback')?.remove();
  attachLoading();
  gen += 1;
  boot(gen);
}

function start(tab, myGen) {
  teardownUi();
  ui = buildUi();
  tab.prepend(ui.root);
  root().classList.add(ON_CLASS);
  shown = true;
  if (inst && inst.instance) {
    // Ausgesetzte Instanz weiterverwenden: kein Ladebildschirm
    clearDisposeTimer();
    ui.loading.remove();
    ui.stage.classList.add('is-ready');
    try {
      inst.instance.resume(ui.stage);
    } catch (e) {
      console.warn('[LenzFlix] live resume', e && e.message);
      disposeInstance();
      attachLoading();
      boot(myGen);
    }
    return;
  }
  boot(myGen);
}

function ensure() {
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
    if (t) start(t, myGen);
    else if (++tries < 30) waitTimer = setTimeout(poll, 200);
  };
  if (tab) poll();
  else waitTimer = setTimeout(poll, 200);
}

/** Für main.js destroy()/stopFeatures: alles sofort freigeben (Instanz, DOM, Script-Tags). */
export function destroyLive() {
  gen += 1;
  clearTimeout(waitTimer);
  waitTimer = null;
  disposeInstance();
  teardownUi();
  removeThemeJs();
}

const liveHome = {
  name: 'live-home',
  match: (route) => isTheme('live') && isModern() && !isTv() && api.isReady() && liveHomeRoute(route),
  mount() {
    ensure();
  },
  update() {
    // viewshow feuert öfter: nur nachziehen, wenn die Bühne fehlt (z. B. #homeTab neu aufgebaut)
    const tab = findHomeTab();
    if (!tab || !ui || tab.contains(ui.root)) return;
    ensure();
  },
  unmount() {
    gen += 1;
    clearTimeout(waitTimer);
    waitTimer = null;
    if (inst && inst.instance) {
      try { inst.instance.suspend(); } catch (e) { console.warn('[LenzFlix] live suspend', e && e.message); }
      clearDisposeTimer();
      inst.disposeTimer = setTimeout(disposeInstance, SUSPEND_MS);
    }
    teardownUi();
  },
};

export default liveHome;
