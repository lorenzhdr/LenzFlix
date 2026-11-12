// LenzFlix: Ladebild beim Start der Wiedergabe (#lfx-startcover, alle Designs außer live/layout-tv).
// show({item}) legt sofort ein Vollbild mit Backdrop + Titel + Ladekreis über alles (z-index 1250: über Modal 1200,
// unter MUI-Menüs 1300 und Jellyfin-Dialogen). Abbau (Fade 200 ms), solange das Ladebild steht erkannt per
// MutationObserver auf body (rAF-gebündelt, Muster features/osdcenter.js):
//  (a) Player-Seite sichtbar UND Video spielt, (b) Jellyfin-Dialog offen, (c) Route weder /video noch Ausgangsroute
//  (Jellyfin wechselt per pushState; zusätzlich popstate/hashchange), (d) erneutes show() mit anderem Titel ersetzt den Inhalt,
//  (e) Sicherheitsnetz 25 s, (f) Esc schließt nur das Ladebild (Event wird verschluckt, Wiedergabe läuft weiter).
// Fallback-Pfad playViaDetails: allowRoute('/details') hält das Ladebild über der Detailseite.
import { mountPoint, unmountPoint } from './dom.js';
import { parseHash } from './router.js';
import { isTheme } from './theme.js';
import { imageUrl, imageUrlFor, landscapeImage } from './api.js';

const ID = 'lfx-startcover';
const PAGE = '[id="videoOsdPage"]:not(.hide)';
const SAFETY_MS = 25000;
const FADE_MS = 200;

let el = null;
let itemId = null;
let origin = null;
let allowed = null;
let mo = null;
let raf = 0;
let safety = 0;
let leaving = 0;
let watching = false;

const routePath = () => parseHash(window.location.hash).path;

function isActive() {
  const cl = document.documentElement.classList;
  return !cl.contains('layout-tv') && !isTheme('live');
}

function isNarrow() {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 799px)').matches;
  } catch {
    return false;
  }
}

function backdropUrl(item) {
  const opts = { type: 'Backdrop', maxWidth: isNarrow() ? 900 : 1600, quality: 80 };
  const parentTag = item.ParentBackdropImageTags && item.ParentBackdropImageTags[0];
  if (item.Type !== 'Episode') {
    const own = imageUrl(item, opts);
    if (own) return own;
  }
  if (item.ParentBackdropItemId && parentTag) return imageUrlFor(item.ParentBackdropItemId, { ...opts, tag: parentTag });
  if (item.Type === 'Episode' && item.SeriesId) return imageUrlFor(item.SeriesId, opts);
  return imageUrl(item, opts) || landscapeImage(item, { maxWidth: opts.maxWidth, quality: 80 });
}

function labels(item) {
  if (item.Type === 'Episode') {
    const parts = [];
    if (item.ParentIndexNumber != null) parts.push(`S${item.ParentIndexNumber}`);
    if (item.IndexNumber != null) parts.push(`F${item.IndexNumber}`);
    if (item.Name) parts.push(item.Name);
    return { title: item.SeriesName || item.Name || '', sub: item.SeriesName ? parts.join(' · ') : '' };
  }
  return { title: item.Name || '', sub: '' };
}

function div(cls, text) {
  const d = document.createElement('div');
  d.className = cls;
  if (text) d.textContent = text;
  return d;
}

function fill(item) {
  const url = backdropUrl(item);
  let bg = el.querySelector('.lfx-startcover__bg');
  if (!bg || bg.dataset.src !== (url || '')) {
    if (bg) bg.remove();
    bg = div('lfx-startcover__bg');
    bg.dataset.src = url || '';
    if (url) {
      const img = new Image();
      img.alt = '';
      img.decoding = 'async';
      img.addEventListener('load', () => bg.classList.add('is-loaded'));
      img.addEventListener('error', () => img.remove());
      img.src = url;
      bg.append(img);
      if (img.complete && img.naturalWidth > 0) bg.classList.add('is-loaded');
    }
    el.prepend(bg);
  }
  el.querySelector('.lfx-startcover__text')?.remove();
  const { title, sub } = labels(item);
  const text = div('lfx-startcover__text');
  if (title) text.append(div('lfx-startcover__title', title));
  if (sub) text.append(div('lfx-startcover__sub', sub));
  el.append(text);
}

function videoPlaying() {
  if (!document.querySelector(PAGE)) return false;
  const v = document.querySelector('video.htmlvideoplayer');
  if (!v) return false;
  // Läuft – oder steht mit erstem Bild bereit (z. B. Autoplay blockiert, Start pausiert): dann gehört der Bildschirm dem Player.
  return (!v.paused && v.currentTime > 0) || v.readyState >= 2;
}

function check() {
  raf = 0;
  if (!el) return;
  if (document.querySelector('.dialogContainer .dialog.opened')) { hide(); return; }
  const path = routePath();
  if (path !== '/video' && path !== origin && !(allowed && allowed.has(path))) { hide(); return; }
  if (videoPlaying()) hide();
}

function schedule() {
  if (raf || !el) return;
  raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(check) : setTimeout(check, 0);
}

function onKeydown(e) {
  if (e.key !== 'Escape' && e.key !== 'BrowserBack') return;
  e.stopPropagation();
  e.preventDefault();
  hide();
}

function watch(on) {
  if (on === watching) return;
  watching = on;
  const fn = on ? 'addEventListener' : 'removeEventListener';
  window[fn]('popstate', schedule);
  window[fn]('hashchange', schedule);
  document[fn]('playing', schedule, true);
  document[fn]('timeupdate', schedule, true);
  document[fn]('loadeddata', schedule, true);
  document[fn]('keydown', onKeydown, true);
  if (on) {
    mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  } else {
    if (mo) mo.disconnect();
    mo = null;
    if (raf) {
      if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(raf);
      clearTimeout(raf);
    }
    raf = 0;
  }
}

function cleanup() {
  clearTimeout(safety);
  clearTimeout(leaving);
  safety = 0;
  leaving = 0;
  watch(false);
  document.documentElement.classList.remove(ON_CLASS);
  unmountPoint(ID);
  el = null;
  itemId = null;
  origin = null;
  allowed = null;
}

// html-Klasse, solange das Ladebild steht: blendet Jellyfins eigenen Ladekreis (.docspinner, z-index 9999999) aus.
const ON_CLASS = 'lfx-startcover-on';

/** Zeigt das Ladebild (idempotent für dasselbe Item; anderes Item ersetzt den Inhalt). */
export function show({ item } = {}) {
  if (!item || !item.Id || !isActive()) return;
  clearTimeout(leaving);
  leaving = 0;
  if (!el) {
    el = mountPoint(ID, { className: 'lfx-startcover' });
    el.setAttribute('role', 'status');
    el.setAttribute('aria-label', 'Wiedergabe wird geladen');
    el.append(div('lfx-startcover__spinner'));
    origin = routePath();
    allowed = new Set();
    itemId = null;
  }
  el.classList.remove('is-leaving');
  document.documentElement.classList.add(ON_CLASS);
  watch(true);
  if (itemId !== item.Id) {
    itemId = item.Id;
    fill(item);
  }
  clearTimeout(safety);
  safety = setTimeout(hide, SAFETY_MS);
}

/** Zusätzliche Route, über der das Ladebild stehen bleiben darf (z. B. '/details' im Fallback-Pfad). */
export function allowRoute(path) {
  if (allowed) allowed.add(path);
}

export function isShown() {
  return Boolean(el) && !el.classList.contains('is-leaving');
}

/** Blendet das Ladebild aus (Fade) und räumt auf. */
export function hide() {
  if (!el) return;
  const node = el;
  clearTimeout(safety);
  safety = 0;
  watch(false);
  document.documentElement.classList.remove(ON_CLASS);
  node.classList.add('is-leaving');
  leaving = setTimeout(() => {
    if (el === node) cleanup();
  }, FADE_MS);
}

export function destroy() {
  cleanup();
}
