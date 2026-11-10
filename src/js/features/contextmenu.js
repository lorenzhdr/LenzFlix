// LenzFlix: Kontextmenü für eigene Karten und Episodenzeilen (Feature "contextmenu").
// Rechtsklick (Desktop) und langes Drücken (Touch, iOS feuert kein contextmenu) öffnen das native Titelmenü
// über core/itemmenu.js. Native Jellyfin-Karten bleiben unangetastet.
import { getStoredItem } from '../core/itemstore.js';
import { isTv } from '../core/layout.js';
import { isMenuOpen, openItemMenu, startItemWatch, stopItemWatch } from '../core/itemmenu.js';
import { cancelDownloads, closeChooser } from '../core/download.js';
import { clearToast } from '../core/toast.js';

const EXCLUDED = /^\/(video|login|dashboard|selectserver|addserver|startup|forgotpassword|resetpassword|wizard)/;
const TARGET = '.lfx-card[data-lfx-id], .lfx-modal__ep[data-lfx-id]';
const LONG_PRESS_MS = 500;
const MOVE_TOLERANCE = 10;
const CLICK_WINDOW_MS = 700;
const DOUBLE_OPEN_MS = 800;

let active = false;
let listeners = [];
let pressTimer = null;
let press = null; // {x, y, fired}
let swallowUntil = 0;
let lastLongPressAt = -Infinity;

function resolve(el) {
  if (!el || typeof el.closest !== 'function') return null;
  return el.closest(TARGET);
}

function itemFor(el, fallbackType) {
  const id = el.dataset.lfxId;
  return getStoredItem(id) || { Id: id, Type: el.dataset.lfxType || fallbackType || undefined };
}

function openFor(el, x, y) {
  const item = itemFor(el);
  const opts = {};
  if (el.classList.contains('lfx-modal__ep') && el.parentElement) {
    opts.siblings = [...el.parentElement.children].filter((n) => n.matches('.lfx-modal__ep[data-lfx-id]')).map((n) => itemFor(n, 'Episode'));
  }
  openItemMenu(item, { x, y }, opts);
}

function inNativeDialog(el) {
  return Boolean(el.closest && el.closest('.dialogContainer, .dialog'));
}

// ---------------------------------------------------------------- Rechtsklick

function onContextMenu(e) {
  const el = resolve(e.target);
  if (!el) return;
  if (e.shiftKey) return;
  if (isMenuOpen() && inNativeDialog(el)) return;
  e.preventDefault();
  e.stopPropagation();
  // Android feuert nach dem langen Drücken zusätzlich contextmenu: nicht doppelt öffnen.
  if (Date.now() - lastLongPressAt < DOUBLE_OPEN_MS) return;
  openFor(el, e.clientX, e.clientY);
}

// ---------------------------------------------------------------- Langes Drücken

function cancelPress() {
  if (pressTimer) clearTimeout(pressTimer);
  pressTimer = null;
  press = null;
}

function onTouchStart(e) {
  if (e.touches && e.touches.length > 1) {
    cancelPress();
    return;
  }
  cancelPress();
  const el = resolve(e.target);
  if (!el) return;
  if (isMenuOpen() && inNativeDialog(el)) return;
  const t = (e.touches && e.touches[0]) || e;
  const state = { x: t.clientX, y: t.clientY, fired: false };
  press = state;
  pressTimer = setTimeout(() => {
    pressTimer = null;
    if (press !== state || !el.isConnected) return;
    state.fired = true;
    lastLongPressAt = Date.now();
    openFor(el, state.x, state.y);
  }, LONG_PRESS_MS);
}

function onTouchMove(e) {
  if (!press || press.fired) return;
  const t = e.touches && e.touches[0];
  if (!t) return;
  if (Math.hypot(t.clientX - press.x, t.clientY - press.y) > MOVE_TOLERANCE) cancelPress();
}

function onTouchEnd() {
  // Der Klick nach dem Loslassen folgt erst jetzt: Schluckfenster ab Loslassen.
  if (press && press.fired) swallowUntil = Date.now() + CLICK_WINDOW_MS;
  cancelPress();
}

function onClickCapture(e) {
  if (!swallowUntil) return;
  const until = swallowUntil;
  if (e.target && e.target.closest && e.target.closest('.lfx-proxywrap')) return;
  swallowUntil = 0;
  if (Date.now() > until) return;
  e.preventDefault();
  e.stopPropagation();
  e.stopImmediatePropagation();
}

// ---------------------------------------------------------------- Lebenszyklus

function start() {
  if (active) return;
  active = true;
  const add = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    listeners.push(() => target.removeEventListener(type, fn, opts));
  };
  add(document, 'contextmenu', onContextMenu, true);
  add(document, 'touchstart', onTouchStart, { passive: true });
  add(document, 'touchmove', onTouchMove, { passive: true });
  add(document, 'touchend', onTouchEnd, { passive: true });
  add(document, 'touchcancel', cancelPress, { passive: true });
  add(window, 'scroll', cancelPress, { capture: true, passive: true });
  // Window-Capture läuft vor Document-Capture (Modal-Feature) und schluckt den Klick nach dem langen Drücken.
  add(window, 'click', onClickCapture, true);
}

function stop() {
  active = false;
  cancelPress();
  swallowUntil = 0;
  lastLongPressAt = -Infinity;
  for (const off of listeners.splice(0)) off();
}

const contextmenuFeature = {
  name: 'contextmenu',
  match(route) {
    return !isTv() && !EXCLUDED.test(route.path);
  },
  mount() {
    start();
    startItemWatch();
  },
  unmount() {
    stop();
    stopItemWatch();
    // Dieses Feature läuft überall, wo Menü/Download erreichbar sind: hier zentral aufräumen (destroy()).
    closeChooser();
    cancelDownloads();
    clearToast();
  },
};

export default contextmenuFeature;
