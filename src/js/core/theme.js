// LenzFlix: Design-Umschalter (LENZFLIX 'flix', LENZ+ 'plus', LENZPRIME 'prime', LENZ//84 'retro', VIDEOTHEK LENZ 'store').
// Wahl pro Jellyfin-Benutzer in eigenen DisplayPreferences ('lenzflix'), lokal gespiegelt (localStorage, gegen Flackern).
// TV-Layout ist immer 'flix'. Design-CSS für plus/prime/retro/store wird per core/themecss.js nachgeladen.
// Jedes wirksame Design setzt genau eine Klasse html.lfx-theme-<id>; 'lfx-theme-loading' blendet beim ersten Start aus.
import { getAuth, getUserId, getJson, buildUrl, isReady } from './api.js';
import { parseHash, reevaluate } from './router.js';
import { ensureThemeCss, removeThemeCss } from './themecss.js';
import { applyFavicon } from './favicon.js';
import { applyThemeColor } from './themecolor.js';
import { toast } from './toast.js';

export const THEMES = ['flix', 'plus', 'prime', 'retro', 'store'];

export const THEME_META = {
  flix: { id: 'flix', name: 'LENZFLIX', tagline: 'Klassisch: rote Akzente, Querformat-Karten', palette: ['#141414', '#e50914', '#ffffff', '#808080'] },
  plus: { id: 'plus', name: 'LENZ+', tagline: 'Karussell, Poster und Marken-Hubs', palette: ['#10131f', '#050507', '#1bb3e8', '#f5f5f7'] },
  prime: { id: 'prime', name: 'LENZPRIME', tagline: 'Vollbild-Hero, Badges und Trailer', palette: ['#0a0e17', '#1a98ff', '#ffffff', '#3a3d45'] },
  retro: { id: 'retro', name: 'LENZ//84', tagline: 'Bernstein-Terminal, Kassetten und Neon-Gitter', palette: ['#0a0603', '#ffb000', '#ff5a1f', '#ffe2a8'] },
  store: { id: 'store', name: 'VIDEOTHEK LENZ', tagline: 'Begehbare 3D-Videothek', palette: ['#0d1330', '#ffd23f', '#ff3d7f', '#2446a8'] },
};

const KEY_USER = 'lfx.theme.';
const KEY_LAST = 'lfx.theme.last';
const KEY_PREV = 'lfx.theme.prev.'; // nur noch für die Migration 1.15.0 (LENZ LIVE entfernt)
const LEGACY_LIVE = 'live';
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
let knownUid = null; // zuletzt gesehener Benutzer dieser Sitzung (auch nach Abmeldung)
let pendingChoice = null; // Nutzerwahl ohne Benutzer-ID (Hash vor dem Login): wird beim Login übernommen
let revealStart = 0; // Beginn des Ausblendens (erster Start), bleibt über Zielwechsel erhalten
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

/** Erster Start, Design noch nicht angewendet (auch während des vorläufigen LENZFLIX). */
export function isThemePending() {
  return state === 'pending';
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

/** localStorage: Benutzer-Key -> last -> 'flix'. ignoreLast: Benutzerwechsel, `last` gehört dem Vorgänger. */
function resolveLocalChoice(ignoreLast = false) {
  migrateLocalLive();
  const uk = userKey();
  return strictTheme(uk && lsGet(uk)) || (ignoreLast ? null : strictTheme(lsGet(KEY_LAST))) || 'flix';
}

function saveLocal(id) {
  const uk = userKey();
  if (uk) lsSet(uk, id);
  lsSet(KEY_LAST, id);
}

// Migration 1.15.0: LENZ LIVE entfernt. War lokal noch 'live' gespeichert, gilt das früher gemerkte Design (lfx.theme.prev.<uid|last>), sonst 'flix'.
function migrateLocalLive() {
  const uid = getUserId();
  const targets = [[userKey(), uid], [KEY_LAST, 'last']];
  if (!targets.some(([key]) => key && lsGet(key) === LEGACY_LIVE)) return;
  for (const [key, who] of targets) {
    if (!key || lsGet(key) !== LEGACY_LIVE) continue;
    lsSet(key, strictTheme(lsGet(KEY_PREV + who)) || strictTheme(lsGet(KEY_PREV + 'last')) || 'flix');
  }
  for (const who of [uid, 'last']) {
    if (!who) continue;
    try {
      window.localStorage.removeItem(KEY_PREV + who);
    } catch { /* ignorieren */ }
  }
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
    delete prefs.CustomPrefs.prevTheme; // Altlast von LENZ LIVE (Migration 1.15.0)
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
  let remotePrev = null;
  let migrate;
  try {
    const prefs = await fetchPrefs(uid);
    const cp = (prefs && prefs.CustomPrefs) || {};
    remote = strictTheme(cp.theme);
    // Migration 1.15.0: LENZ LIVE entfernt. Serverseitig 'live' -> früher gemerktes Design (CustomPrefs.prevTheme), sonst die lokale Wahl.
    migrate = cp.theme === LEGACY_LIVE;
    if (migrate) remotePrev = strictTheme(cp.prevTheme);
  } catch (e) {
    console.warn('[LenzFlix] Design konnte nicht vom Server geladen werden:', e && e.message ? e.message : e);
    return;
  }
  if (!started || getUserId() !== uid) return;
  if (touched !== startTouched || unsynced) {
    if (remote !== chosen) scheduleUpload(chosen); // Nutzer war schneller (Server schon gleich: kein zweiter Upload)
    return;
  }
  if (migrate) {
    remote = remotePrev || chosen || 'flix';
    if (remote !== chosen) await setTheme(remote, { source: 'server' });
    uploadTheme(uid, remote); // schreibt das Design zurück und entfernt prevTheme
  } else if (remote) {
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
  applyThemeColor('flix');
  reevaluate();
  emit('flix', previous);
}

function commit(id, nextState = 'active') {
  const previous = effective;
  const prevState = state;
  effective = id;
  state = nextState;
  setHtmlTheme(id);
  removeThemeCss(id === 'flix' ? null : id);
  applyFavicon(id);
  applyThemeColor(id);
  // pending verlassen, auch ohne Designwechsel (Reveal lief schon): themeroute muss die Route neu bewerten
  if (previous !== id || (prevState === 'pending' && nextState !== 'pending')) reevaluate();
  if (previous !== id) emit(id, previous);
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
    removeThemeCss(target); // Zurück auf das wirksame Design: Link des überholten Ziels entfernen
    return Promise.resolve(true);
  }
  const initial = effective === null;
  if (initial) {
    state = 'pending';
    root().classList.add(LOADING);
    clearTimeout(revealTimer);
    if (!revealStart) revealStart = earlyAt || Date.now(); // Frühstart zählt mit; ein zweites Ziel startet die Frist nicht neu
    const waited = Math.max(0, Date.now() - revealStart);
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
  if (source === 'user') pendingChoice = getUserId() ? null : next;
  chosen = next;
  if (source === 'user') touched++;
  if (!started) {
    saveLocal(next);
    if (source === 'user') {
      scheduleUpload(next);
    }
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
  knownUid = lastUid;
  const fromHash = takeHashChoice();
  if (fromHash) {
    pendingChoice = lastUid ? null : fromHash;
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
    const pend = uid ? pendingChoice : null; // Wahl vor dem Login gehört dem neuen Benutzer
    if (pend) {
      lsSet(KEY_USER + uid, pend);
      chosen = pend;
      touched++;
      pendingChoice = null;
    } else {
      chosen = resolveLocalChoice(Boolean(uid && knownUid && uid !== knownUid)); // `last` ist die Wahl des Vorgängers
    }
    if (uid) knownUid = uid;
    transition(desired());
    if (pend) scheduleUpload(pend);
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
  knownUid = null;
  pendingChoice = null;
  revealStart = 0;
}

export function destroyTheme() {
  abortEarly();
  stopTheme();
  listeners.clear();
  touched = 0;
}
