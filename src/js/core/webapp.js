// LenzFlix: iPhone-Web-App („Zum Home-Bildschirm“).
// 1) html.lfx-standalone, solange die Seite als installierte Web-App läuft (display-mode: standalone bzw. iOS navigator.standalone).
//    Debug-Override: window.__lfxStandalone = true/false.
// 2) Manifest-Override (nur iOS/iPadOS-Safari: dort existiert navigator.standalone): Jellyfins manifest.json wird geholt, Name und
//    Icon auf das aktive Design gesetzt, alle URLs absolut gemacht und als Blob-URL in <link rel="manifest"> gesetzt. Bei jedem Fehler
//    bleibt das Original stehen; stopWebApp stellt es wieder her. Android/Desktop bleiben unberührt.
// apple-mobile-web-app-title schreibt core/favicon.js. Kein apple-mobile-web-app-status-bar-style.
import { brandName } from './theme.js';
import { touchFor } from './favicon.js';

const CLASS = 'lfx-standalone';
const MQ = '(display-mode: standalone)';
const ICON_SIZES = '180x180';

let running = false;
let mql = null;
let mqlHandler = null;
let link = null; // <link rel="manifest">
let origHref = null; // Original-href des Links (null = nichts übernommen)
let blobUrl = null;
let baseHref = null; // absolute URL des Original-Manifests
let sourcePromise = null; // geparstes Original-Manifest
let lastTheme = null;
let seq = 0;

/** Läuft die Seite als installierte Web-App? */
export function isStandalone() {
  if (typeof window.__lfxStandalone === 'boolean') return window.__lfxStandalone;
  try {
    if (typeof window.matchMedia === 'function' && window.matchMedia(MQ).matches) return true;
  } catch { /* ignorieren */ }
  return navigator.standalone === true;
}

function syncClass() {
  const on = isStandalone();
  const cl = document.documentElement.classList;
  if (cl.contains(CLASS) !== on) cl.toggle(CLASS, on);
}

const abs = (u, base) => {
  try {
    return new URL(u, base).href;
  } catch {
    return null;
  }
};

/** Manifest mit Designname/-icon und absoluten URLs (reine Funktion, testbar). */
export function buildManifest(src, base, theme) {
  const m = { ...src };
  const name = brandName(theme);
  m.name = name;
  m.short_name = name;
  const start = abs(src.start_url || '.', base) || base;
  m.id = start; // Identität bleibt die der Original-App
  m.start_url = start;
  m.scope = abs(src.scope || '.', base) || start;
  const icons = Array.isArray(src.icons) ? src.icons : [];
  const touch = touchFor(theme);
  const rest = icons
    .map((i) => ({ ...i, src: abs(i.src, base) }))
    .filter((i) => i.src && i.src !== touch);
  m.icons = [{ src: touch, sizes: ICON_SIZES, type: 'image/png', purpose: 'any' }, ...rest];
  return m;
}

function restoreLink() {
  if (link && origHref !== null) link.setAttribute('href', origHref);
  if (blobUrl) URL.revokeObjectURL(blobUrl);
  blobUrl = null;
  link = null;
  origHref = null;
  baseHref = null;
  sourcePromise = null;
  lastTheme = null;
}

function loadSource() {
  if (!sourcePromise) {
    const url = baseHref;
    sourcePromise = fetch(url, { credentials: 'same-origin' }).then((r) => {
      if (!r.ok) throw new Error(`manifest ${r.status}`);
      return r.json();
    });
    sourcePromise.catch(() => { sourcePromise = null; });
  }
  return sourcePromise;
}

async function applyManifest(theme) {
  if (!('standalone' in navigator) || typeof fetch !== 'function') return;
  if (theme === lastTheme) return;
  const el = document.head && document.head.querySelector('link[rel="manifest"]');
  if (!el) return;
  if (!link || link !== el) {
    if (link) restoreLink();
    const href = el.getAttribute('href');
    if (!href) return;
    link = el;
    origHref = href;
    baseHref = abs(href, document.baseURI);
    if (!baseHref) { restoreLink(); return; }
  }
  const mine = ++seq;
  lastTheme = theme;
  try {
    const src = await loadSource();
    if (mine !== seq || !running || !link) return;
    const json = JSON.stringify(buildManifest(src, baseHref, theme));
    const next = URL.createObjectURL(new Blob([json], { type: 'application/manifest+json' }));
    const old = blobUrl;
    blobUrl = next;
    link.setAttribute('href', next);
    if (old) URL.revokeObjectURL(old);
  } catch {
    // Fehler: Original (oder zuletzt gesetzte Blob-URL) stehen lassen; lastTheme bleibt gesetzt, kein Dauerversuch im 3-s-Takt.
    if (mine === seq && link && !blobUrl) link.setAttribute('href', origHref);
  }
}

/** Idempotent; wird bei jedem Abgleich aufgerufen (Klasse neu bewerten, Manifest bei Designwechsel). */
export function applyWebApp(theme = 'flix') {
  if (!document.documentElement) return;
  if (!running) {
    running = true;
    if (typeof window.matchMedia === 'function') {
      try {
        mql = window.matchMedia(MQ);
        mqlHandler = () => syncClass();
        if (mql.addEventListener) mql.addEventListener('change', mqlHandler);
        else if (mql.addListener) mql.addListener(mqlHandler);
      } catch { mql = null; }
    }
  }
  syncClass();
  applyManifest(theme);
}

export function stopWebApp() {
  seq++;
  if (mql && mqlHandler) {
    if (mql.removeEventListener) mql.removeEventListener('change', mqlHandler);
    else if (mql.removeListener) mql.removeListener(mqlHandler);
  }
  mql = null;
  mqlHandler = null;
  running = false;
  restoreLink();
  document.documentElement.classList.remove(CLASS);
}
