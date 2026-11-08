// LenzFlix: Layout-Erkennung + Klassen auf <html>.
import { debounce } from './cache.js';
import { reevaluate } from './router.js';

const root = () => document.documentElement;

export function isModern() {
  return Boolean(document.querySelector('header.MuiAppBar-root'));
}

export function isTv() {
  return root().classList.contains('layout-tv');
}

export function isMobile() {
  return root().classList.contains('layout-mobile') || window.innerWidth < 800;
}

function setClass(name, on) {
  const cl = root().classList;
  if (cl.contains(name) !== on) cl.toggle(name, on); // nur bei Änderung, sonst Observer-Schleife
}

/** Setzt lfx-js / lfx-modern / lfx-tv. */
export function applyLayoutClasses() {
  setClass('lfx-js', true);
  setClass('lfx-modern', isModern());
  setClass('lfx-tv', isTv());
}

let observer = null;
let resizeHandler = null;
let lastMobile = null;
export const RESIZE_DEBOUNCE_MS = 200;

function onResizeDebounced() {
  const now = isMobile();
  if (now === lastMobile) return;
  lastMobile = now;
  applyLayoutClasses();
  reevaluate();
}

/** Startet Beobachtung der html-Klassen. Rückgabe: stop-Funktion (entfernt auch alle lfx-Klassen). */
export function initLayout() {
  applyLayoutClasses();
  if (!observer && typeof MutationObserver === 'function') {
    observer = new MutationObserver(applyLayoutClasses);
    observer.observe(root(), { attributes: true, attributeFilter: ['class'] });
  }
  if (!resizeHandler) {
    lastMobile = isMobile();
    resizeHandler = debounce(onResizeDebounced, RESIZE_DEBOUNCE_MS);
    window.addEventListener('resize', resizeHandler);
  }
  return destroyLayout;
}

export function destroyLayout() {
  if (observer) observer.disconnect();
  observer = null;
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    resizeHandler.cancel();
  }
  resizeHandler = null;
  lastMobile = null;
  root().classList.remove('lfx-js', 'lfx-modern', 'lfx-tv', 'lfx-scrolled', 'lfx-nav-on');
}
