// LenzFlix: Tab-Titel (document.title) passend zum Design: „<Seitenname> · <Designname>“, auf der Startseite nur der
// Designname. Jellyfin schreibt dort nur den Servernamen (auf Detail-/LenzFlix-Seiten), den Seitennamen (nativ) oder
// den Titel (Player); das ist der „Rohtitel“ (raw). Der Servername kann gleich einem Designnamen sein („LENZFLIX“) und
// wird deshalb nie als Seitenname gewertet. Eigene Schreibvorgänge werden per takeRecords() verworfen, es gibt keine
// Schleife mit dem eigenen Observer.
// Namensreihenfolge: Player (raw) → offenes Info-Fenster → Seitenname (shared/pagetitle.js) → raw → leer.
import { getTheme, onThemeChange, brandName, THEME_META } from './theme.js';
import { isTv } from './layout.js';
import { currentRoute, onRoute } from './router.js';
import { isReady } from './api.js';
import { getLibraries } from '../shared/libraries.js';
import { pageName } from '../shared/pagetitle.js';

const PLAYER = '[id="videoOsdPage"]:not(.hide)';
const MODAL_CLASS = 'lfx-modal-open';
const FOLLOW_UP_MS = [300, 1000, 2500]; // Nachlauf für nachgeladene DOM-Titel und Bibliotheken

/** Alle Designnamen (lazy: Tests mocken core/theme.js teils ohne THEME_META). */
function brands() {
  try { return Object.values(THEME_META).map((m) => m.name); } catch { return []; }
}

let running = false;
let raw = null; // Rohtitel von Jellyfin
let rawValid = false; // false nach Routenwechsel, bis Jellyfin neu schreibt
let serverName = null;
let lastWritten = null;
let lastHash = null;
let libs = [];
let libSeq = 0;
let modalOpen = false;
let timers = [];
let headObs = null;
let titleObs = null;
let htmlObs = null;
let titleEl = null;
let unsubRoute = null;
let unsubTheme = null;

const rootEl = () => document.documentElement;

function isServerName(t) {
  return t === serverName || t === 'Jellyfin' || brands().includes(t);
}

const rawGood = () => rawValid && Boolean(raw) && !isServerName(raw);

function isPlainHome(route) {
  return route.path === '/home' && !route.params.get('lfx') && !route.params.get('tab') && !document.querySelector(PLAYER);
}

function takeRaw(t) {
  raw = t;
  rawValid = true;
  const route = currentRoute();
  if (isPlainHome(route) && t) serverName = t;
}

function design() {
  return isTv() ? 'flix' : getTheme();
}

function desired() {
  const theme = design();
  if (!theme) return null; // Design noch pending: Jellyfin-Titel stehen lassen
  const brand = brandName(theme);
  const route = currentRoute();
  let name = '';
  if ((route.path === '/video' || document.querySelector(PLAYER)) && rawGood()) {
    name = raw;
  }
  if (!name && rootEl().classList.contains(MODAL_CLASS)) {
    const el = document.getElementById('lfx-modal-title');
    // Fehlerzustand des Info-Fensters hat dieselbe ID, ist aber kein Titel
    if (el && !el.classList.contains('lfx-modal__error-title')) name = (el.textContent || '').trim();
  }
  if (!name) name = pageName(route, libs);
  if (!name && rawGood()) name = raw;
  return name && name !== brand ? `${name} · ${brand}` : brand;
}

function observeTitle() {
  const el = document.querySelector('title');
  if (el === titleEl) return;
  titleObs.disconnect();
  titleEl = el;
  if (el) titleObs.observe(el, { characterData: true, childList: true, subtree: true });
}

function write(t) {
  document.title = t;
  lastWritten = t;
  observeTitle();
  titleObs.takeRecords();
  headObs.takeRecords();
}

function update() {
  if (!running) return;
  const t = desired();
  if (t === null) return;
  if (document.title !== t) write(t);
  else lastWritten = t;
}

function loadLibs() {
  if (!isReady()) return;
  const seq = ++libSeq;
  Promise.resolve().then(() => getLibraries()).then((list) => {
    if (!running || seq !== libSeq || !Array.isArray(list)) return;
    libs = list;
    update();
  }).catch(() => { /* Bibliotheksnamen sind optional */ });
}

function followUp() {
  for (const id of timers) clearTimeout(id);
  timers = FOLLOW_UP_MS.map((ms) => setTimeout(() => {
    if (!running) return;
    loadLibs();
    update();
  }, ms));
}

function onRouteChange(route) {
  if (route.hash !== lastHash) {
    lastHash = route.hash;
    rawValid = false; // sonst stünde beim Betreten des Players kurz der alte Titel
  }
  update();
  loadLibs();
  followUp();
}

export function startDocTitle() {
  if (running) {
    update();
    return;
  }
  if (!document.head) return;
  running = true;
  headObs = new MutationObserver(() => {
    const before = titleEl;
    observeTitle();
    // Neues <title> von Jellyfin: Text übernehmen (eigene Schreibvorgänge wurden verworfen)
    if (titleEl !== before && document.title !== lastWritten) {
      takeRaw(document.title);
      update();
    }
  });
  titleObs = new MutationObserver(() => {
    takeRaw(document.title);
    update();
  });
  headObs.observe(document.head, { childList: true });
  observeTitle();
  modalOpen = rootEl().classList.contains(MODAL_CLASS);
  htmlObs = new MutationObserver(() => {
    const open = rootEl().classList.contains(MODAL_CLASS);
    if (open === modalOpen) return;
    modalOpen = open;
    update();
    followUp();
  });
  htmlObs.observe(rootEl(), { attributes: true, attributeFilter: ['class'] });
  takeRaw(document.title); // Ausgangswert (Jellyfins Titel zum Startzeitpunkt)
  unsubTheme = onThemeChange(() => update());
  unsubRoute = onRoute(onRouteChange);
  // onRoute feuert initial synchron und hat den Rohtitel ungültig gemacht: Ausgangswert wieder gültig setzen
  rawValid = true;
  update();
}

export function stopDocTitle() {
  if (!running) return;
  running = false;
  headObs?.disconnect();
  titleObs?.disconnect();
  htmlObs?.disconnect();
  headObs = titleObs = htmlObs = null;
  titleEl = null;
  if (unsubRoute) unsubRoute();
  if (unsubTheme) unsubTheme();
  unsubRoute = unsubTheme = null;
  for (const id of timers) clearTimeout(id);
  timers = [];
  libSeq++;
  if (raw !== null && document.title !== raw) document.title = raw;
  raw = null;
  rawValid = false;
  serverName = null;
  lastWritten = null;
  lastHash = null;
  libs = [];
}

/** Titel von Jellyfin ohne Design-Zusatz (z. B. Filmtitel im Player); ohne laufendes doctitle document.title. */
export function jellyfinTitle() {
  if (!running) return String(document.title || '');
  return rawValid && raw ? raw : '';
}
