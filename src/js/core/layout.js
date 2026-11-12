// LenzFlix: Layout-Erkennung + Klassen auf <html>.
import { debounce } from './cache.js';
import { reevaluate } from './router.js';
import { applyThemeClass } from './theme.js';

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

/** Echt schmaler Viewport (< 800 px). Im Handy-Querformat (z. B. 932 px) ist html.layout-mobile gesetzt, die Handy-UI aber aus. */
export function isNarrow() {
  return window.innerWidth < 800;
}

/** Breite, ab der die große Kopfleiste (#lfx-nav) nicht mehr passt (< 900 px): darunter nutzt LENZFLIX das Handy-Menü. */
export function isNavCompact() {
  return window.innerWidth < 900;
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
  applyThemeClass();
}

let observer = null;
let resizeHandler = null;
let lastMobile = null;
export const RESIZE_DEBOUNCE_MS = 200;

function layoutKey() {
  return `${isMobile()}|${isNarrow()}|${isNavCompact()}`;
}

function onResizeDebounced() {
  const now = layoutKey();
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
    lastMobile = layoutKey();
    resizeHandler = debounce(onResizeDebounced, RESIZE_DEBOUNCE_MS);
    window.addEventListener('resize', resizeHandler);
    window.addEventListener('orientationchange', resizeHandler);
  }
  return destroyLayout;
}

export function destroyLayout() {
  if (observer) observer.disconnect();
  observer = null;
  if (resizeHandler) {
    window.removeEventListener('resize', resizeHandler);
    window.removeEventListener('orientationchange', resizeHandler);
    resizeHandler.cancel();
  }
  resizeHandler = null;
  lastMobile = null;
  const cl = root().classList;
  cl.remove('lfx-js', 'lfx-modern', 'lfx-tv', 'lfx-scrolled', 'lfx-nav-on');
  for (const c of [...cl]) if (c.startsWith('lfx-theme-')) cl.remove(c); // inkl. lfx-theme-loading
}
