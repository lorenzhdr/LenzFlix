// LenzFlix: Design-Umschalter (LENZFLIX 'flix', LENZ+ 'plus', LENZPRIME 'prime', LENZ//84 'retro', VIDEOTHEK LENZ 'store').
// Wahl pro Jellyfin-Benutzer in eigenen DisplayPreferences ('lenzflix'), lokal gespiegelt (localStorage, gegen Flackern).
// TV-Layout ist immer 'flix'. Design-CSS für plus/prime/retro/store wird per core/themecss.js nachgeladen.
// Jedes wirksame Design setzt genau eine Klasse html.lfx-theme-<id>; 'lfx-theme-loading' blendet beim ersten Start aus.
import { getAuth, getUserId, getJson, buildUrl, isReady } from './api.js';
import { parseHash, reevaluate } from './router.js';
import { ensureThemeCss, removeThemeCss } from './themecss.js';
import { applyFavicon } from './favicon.js';
import { toast } from './toast.js';

export const THEMES = ['flix', 'plus', 'prime', 'retro', 'store'];

export const THEME_META = {
  flix: { id: 'flix', name: 'LENZFLIX', tagline: 'Klassisch: rote Akzente, Querformat-Karten', palette: ['#141414', '#e50914', '#ffffff', '#808080'] },
  plus: { id: 'plus', name: 'LENZ+', tagline: 'Karussell, Poster und Marken-Hubs', palette: ['#10131f', '#050507', '#1bb3e8', '#f5f5f7'] },
  prime: { id: 'prime', name: 'LENZPRIME', tagline: 'Vollbild-Hero, Badges und Trailer', palette: ['#0a0e17', '#1a98ff', '#ffffff', '#3a3d45'] },
  retro: { id: 'retro', name: 'LENZ//84', tagline: 'Bernstein-Terminal, Kassetten und Neon-Gitter', palette: ['#0a0603', '#ffb000', '#ff5a1f', '#ffe2a8'] },
  store: { id: 'store', name: 'VIDEOTHEK LENZ', tagline: 'Begehbare 3D-Videothek (Beta)', palette: ['#0d1330', '#ffd23f', '#ff3d7f', '#2446a8'] },
};

const KEY_USER = 'lfx.theme.';
const KEY_LAST = 'lfx.theme.last';
const PREFS_ID = 'lenzflix';
const PREFS_CLIENT = 'lenzflix';
const HASH_PARAM = 'lfxtheme';
const SAVE_DEBOUNCE_MS = 400;
const CSS_TIMEOUT_MS = 3000;
const REVEAL_MS = 1500; // erster Start: spätestens dann LENZFLIX zeigen, Design-CSS lädt weiter
const LOADING = 'lfx-theme-loading';
const PREHIDE_ID = 'lfx-theme-prehide';
const PREHIDE_CSS = 'html.lfx-theme-loading:not(.layout-tv) body{opacity:0!important}';
const TV_UA = /Web0S|webOS|Tizen|SmartTV|SMART-TV/i;

const root = () => document.documentElement;

let started = false;
let chosen = null; // gewählte id (null = noch nicht ermittelt)
let effective = null; // wirksame id; null = pending
let state = 'pending';
let seq = 0; // Generation: macht laufende Übergänge ungültig
let inflight = null; // { target, promise }
let touched = 0; // zählt Nutzerwahlen (schützt vor überholenden Server-Werten)
let lastUid = null;
let remoteDone = false;
let saveTimer = null;
let revealTimer = null;
let unsynced = false; // Nutzerwahl noch nicht auf dem Server
let earlyId = null; // Frühstart (earlyTheme) aktiv: Ziel-Design, das vorgeladen wird
let earlyAt = 0;
let earlyTimer = null;
const listeners = new Set();

export function normalizeTheme(x) {
  return THEMES.includes(x) ? x : 'flix';
}

export function getChosenTheme() {
  return chosen === null ? resolveLocalChoice() : chosen;
}

export function getTheme() {
  return effective;
}

export function getThemeState() {
  return state;
}

export function isTheme(id) {
  return effective === id;
}

export function brandName(id = getTheme() || 'flix') {
  return THEME_META[normalizeTheme(id)].name;
}

export function onThemeChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ------------------------------------------------------------------ Speicher

function lsGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
  } catch { /* Speicher voll/gesperrt: ignorieren */ }
}

function userKey() {
  const uid = getUserId();
  return uid ? KEY_USER + uid : null;
}

function strictTheme(x) {
  return THEMES.includes(x) ? x : null;
}

/** localStorage: Benutzer-Key -> last -> 'flix'. */
function resolveLocalChoice() {
  const uk = userKey();
  return strictTheme(uk && lsGet(uk)) || strictTheme(lsGet(KEY_LAST)) || 'flix';
}

function saveLocal(id) {
  const uk = userKey();
  if (uk) lsSet(uk, id);
  lsSet(KEY_LAST, id);
}

/** Hash-Param lfxtheme=<id> lesen und aus dem Hash entfernen. Rückgabe: id oder null. */
function takeHashChoice(consume = true) {
  let r;
  try {
    r = parseHash(window.location.hash);
  } catch {
    return null;
  }
  if (!r.params.has(HASH_PARAM)) return null;
  const id = strictTheme(r.params.get(HASH_PARAM));
  if (!consume) return id;
  r.params.delete(HASH_PARAM);
  try {
    const qs = r.params.toString();
    const hash = `#${r.path}${qs ? `?${qs}` : ''}`;
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${window.location.search}${hash}`);
  } catch { /* ignorieren */ }
  return id;
}

// ------------------------------------------------------------------ Server

async function fetchPrefs(uid) {
  const client = window.ApiClient;
  if (client && typeof client.getDisplayPreferences === 'function') {
    return client.getDisplayPreferences(PREFS_ID, uid, PREFS_CLIENT);
  }
  return getJson(`/DisplayPreferences/${PREFS_ID}`, { userId: uid, client: PREFS_CLIENT });
}

async function postPrefs(uid, prefs) {
  const client = window.ApiClient;
  if (client && typeof client.updateDisplayPreferences === 'function') {
    return client.updateDisplayPreferences(PREFS_ID, prefs, uid, PREFS_CLIENT);
  }
  const { token } = getAuth();
  const res = await fetch(buildUrl(`/DisplayPreferences/${PREFS_ID}`, { userId: uid, client: PREFS_CLIENT }), {
    method: 'POST',
    headers: { Authorization: `MediaBrowser Token="${token}"`, 'Content-Type': 'application/json' },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return null;
}

/** Ganzes Objekt GET -> ändern -> POST. */
async function uploadTheme(uid, id) {
  try {
    const prefs = (await fetchPrefs(uid)) || {};
    prefs.CustomPrefs = { ...(prefs.CustomPrefs || {}), theme: id };
    if (!prefs.Id) prefs.Id = PREFS_ID;
    await postPrefs(uid, prefs);
  } catch (e) {
    console.warn('[LenzFlix] Design konnte nicht auf dem Server gespeichert werden:', e && e.message ? e.message : e);
  } finally {
    if (!saveTimer) unsynced = false;
  }
}

function scheduleUpload(id) {
  const uid = getUserId();
  if (!uid) return;
  unsynced = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    uploadTheme(uid, id);
  }, SAVE_DEBOUNCE_MS);
}

async function loadRemoteTheme(uid) {
  const startTouched = touched;
  let remote;
  try {
    const prefs = await fetchPrefs(uid);
    remote = strictTheme(prefs && prefs.CustomPrefs && prefs.CustomPrefs.theme);
  } catch (e) {
    console.warn('[LenzFlix] Design konnte nicht vom Server geladen werden:', e && e.message ? e.message : e);
    return;
  }
  if (!started || getUserId() !== uid) return;
  if (touched !== startTouched || unsynced) {
    scheduleUpload(chosen); // Nutzer war schneller
    return;
  }
  if (remote) {
    if (remote !== chosen) await setTheme(remote, { source: 'server' });
  } else if (lsGet(KEY_USER + uid) || chosen !== 'flix') {
    uploadTheme(uid, chosen); // Server leer, lokal gesetzt: hochladen
  }
}

// ------------------------------------------------------------------ Anwenden

function forcedFlix() {
  try {
    return root().classList.contains('layout-tv') || TV_UA.test(navigator.userAgent || '');
  } catch {
    return false;
  }
}

function desired() {
  return forcedFlix() ? 'flix' : chosen;
}

function setHtmlTheme(id) {
  const cl = root().classList;
  for (const c of [...cl]) {
    if (c.startsWith('lfx-theme-') && c !== LOADING && c !== `lfx-theme-${id}`) cl.remove(c);
  }
  if (!cl.contains(`lfx-theme-${id}`)) cl.add(`lfx-theme-${id}`);
  if (cl.contains(LOADING)) cl.remove(LOADING);
  removePrehide();
}

function removePrehide() {
  const el = document.getElementById(PREHIDE_ID);
  if (el) el.remove();
}

/** Frühstart beendet (startTheme übernimmt oder Abbruch): Timer weg, Zustand zurücksetzen. */
function endEarly() {
  clearTimeout(earlyTimer);
  earlyTimer = null;
  earlyId = null;
}

/** Frühstart abbrechen: alles wieder sichtbar, Prehide/Klasse/vorgeladenes Design-CSS weg. */
function abortEarly() {
  if (earlyId === null) return;
  endEarly();
  earlyAt = 0;
  removePrehide();
  root().classList.remove(LOADING);
  removeThemeCss(null);
}

/**
 * Direkt beim Skriptstart (vor cssActive/startTheme): Ist das wirksame Ziel ein Design-CSS-Design (plus/prime/retro/store, kein TV), sofort
 * ausblenden (Inline-Style + Klasse) und das Design-CSS vorladen. LENZFLIX/TV: tut nichts.
 * Kommt startTheme() bis REVEAL_MS nicht (CSS nie aktiv), wird alles wieder aufgeräumt.
 */
export function earlyTheme() {
  if (started || earlyId !== null) return;
  let id;
  try {
    id = (!forcedFlix() && (takeHashChoice(false) || resolveLocalChoice())) || 'flix';
  } catch {
    return;
  }
  if (id === 'flix' || !THEMES.includes(id)) return;
  earlyId = id;
  earlyAt = Date.now();
  if (!document.getElementById(PREHIDE_ID)) {
    const st = document.createElement('style');
    st.id = PREHIDE_ID;
    st.textContent = PREHIDE_CSS;
    (document.head || root()).appendChild(st);
  }
  root().classList.add(LOADING);
  earlyTimer = setTimeout(() => {
    earlyTimer = null;
    if (!started) abortEarly();
  }, REVEAL_MS);
  try {
    Promise.resolve(ensureThemeCss(id, { timeout: CSS_TIMEOUT_MS })).catch(() => {});
  } catch { /* Vorladen ist optional */ }
}

function emit(theme, previous) {
  for (const fn of [...listeners]) {
    try {
      fn({ theme, previous });
    } catch (e) {
      console.error('[LenzFlix] onThemeChange', e);
    }
  }
}

/** Erster Start, Design-CSS noch nicht da: LENZFLIX einblenden, ohne den laufenden Link zu entfernen (state bleibt pending). */
function revealFlix() {
  const previous = effective;
  effective = 'flix';
  setHtmlTheme('flix');
  applyFavicon('flix');
  reevaluate();
  emit('flix', previous);
}

function commit(id, nextState = 'active') {
  const previous = effective;
  effective = id;
  state = nextState;
  setHtmlTheme(id);
  removeThemeCss(id === 'flix' ? null : id);
  applyFavicon(id);
  if (previous !== id) {
    reevaluate();
    emit(id, previous);
  }
}

/** Wechselt auf target. Erstes Laden (effective null): pending + Ausblenden. Rückgabe: Promise<boolean> (angewendet). */
function transition(target) {
  if (inflight && inflight.target === target) return inflight.promise;
  const mine = ++seq;
  if (target === 'flix') {
    inflight = null;
    commit('flix');
    return Promise.resolve(true);
  }
  if (effective === target) {
    inflight = null;
    return Promise.resolve(true);
  }
  const initial = effective === null;
  if (initial) {
    state = 'pending';
    root().classList.add(LOADING);
    clearTimeout(revealTimer);
    const waited = earlyAt ? Math.max(0, Date.now() - earlyAt) : 0; // Frühstart zählt mit
    earlyAt = 0;
    revealTimer = setTimeout(() => {
      revealTimer = null;
      if (mine === seq && effective === null) revealFlix();
    }, Math.max(0, REVEAL_MS - waited));
  }
  const promise = ensureThemeCss(target, { timeout: CSS_TIMEOUT_MS }).then((ok) => {
    if (initial && mine === seq) {
      clearTimeout(revealTimer);
      revealTimer = null;
    }
    if (mine !== seq) return false; // überholt
    inflight = null;
    if (ok) {
      commit(target);
      return true;
    }
    console.warn('[LenzFlix] Design-CSS konnte nicht geladen werden');
    toast('Design konnte nicht geladen werden');
    if (initial || effective === null) commit('flix', 'failed');
    else chosen = effective; // Wechsel gescheitert: bisheriges Design bleibt Wahl
    return false;
  });
  inflight = { target, promise };
  return promise;
}

/** Nutzer-/Server-Wahl setzen. Resolved, wenn das Design angewendet (bzw. gescheitert) ist. */
export async function setTheme(id, { source = 'user' } = {}) {
  const next = normalizeTheme(id);
  chosen = next;
  if (source === 'user') touched++;
  if (!started) {
    saveLocal(next);
    if (source === 'user') scheduleUpload(next);
    return;
  }
  const ok = await transition(desired());
  if (ok || chosen === next) {
    saveLocal(chosen);
    if (source === 'user') scheduleUpload(chosen);
  }
}

/** Für core/layout.js applyLayoutClasses(): Klassen nachziehen, TV-Zwang prüfen. */
export function applyThemeClass() {
  if (!started || chosen === null) return;
  const cl = root().classList;
  if (effective === null) {
    if (!cl.contains(LOADING) && inflight) cl.add(LOADING);
    return;
  }
  const want = desired();
  if (state !== 'failed' && effective !== want && !(inflight && inflight.target === want)) {
    transition(want);
    return;
  }
  if (!cl.contains(`lfx-theme-${effective}`)) setHtmlTheme(effective); // von fremdem Code überschrieben
}

export function startTheme() {
  if (started) return;
  started = true;
  endEarly(); // Ausblenden übernimmt ab jetzt transition()
  lastUid = getUserId() || null;
  const fromHash = takeHashChoice();
  if (fromHash) {
    chosen = fromHash;
    touched++;
    saveLocal(fromHash);
    scheduleUpload(fromHash);
  } else {
    chosen = resolveLocalChoice();
  }
  transition(desired());
}

/** Aus main.js sync(): Benutzerwechsel erkennen, Hash-Wahl übernehmen, Server-Wert einmal pro Benutzer laden. */
export function syncThemeUser() {
  if (!started) return;
  const uid = getUserId() || null;
  if (uid !== lastUid) {
    lastUid = uid;
    remoteDone = false;
    clearTimeout(saveTimer);
    saveTimer = null;
    unsynced = false;
    chosen = resolveLocalChoice();
    transition(desired());
  }
  const fromHash = takeHashChoice();
  if (fromHash) setTheme(fromHash, { source: 'user' });
  if (uid && !remoteDone && isReady()) {
    remoteDone = true;
    loadRemoteTheme(uid);
  }
}

export function stopTheme() {
  if (!started && earlyId !== null) return; // Frühstart-Fenster läuft: räumt sich selbst auf (REVEAL_MS)
  const cl = root().classList;
  const hasDom = started || [...cl].some((c) => c.startsWith('lfx-theme-')) || document.querySelector('link.lfx-theme-css');
  if (!hasDom) return;
  started = false;
  endEarly();
  earlyAt = 0;
  removePrehide();
  seq++;
  inflight = null;
  clearTimeout(saveTimer);
  saveTimer = null;
  clearTimeout(revealTimer);
  revealTimer = null;
  unsynced = false;
  for (const c of [...cl]) if (c.startsWith('lfx-theme-')) cl.remove(c);
  removeThemeCss(null);
  effective = null;
  state = 'pending';
  chosen = null;
  remoteDone = false;
  lastUid = null;
}

export function destroyTheme() {
  abortEarly();
  stopTheme();
  listeners.clear();
  touched = 0;
}
