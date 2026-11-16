// LenzFlix: Handy-Navigation im Streaming-App-Stil (Feature "mobilenav").
// Nur Modern-Layout, nicht TV, nur bei Breite < 900 px (auch am Desktop; ab 900 px gilt die große Leiste #lfx-nav, auch bei layout-mobile).
//  - Logo-Link (fixed im Header; der MUI-Drawer-Button wird per CSS ausgeblendet, solange das Feature läuft)
//  - Filter-Pills unter dem Header: Startseite (Serien · Filme · Meine Liste · Mehr ▾), Serien/Filme (✕ · Titel · Genres ▾ + Vollbild-Genreliste), Meine Liste (✕ · Meine Liste)
//  - Vollbild-Overlay „Mehr“ mit Startseite/Bibliotheken als zentrierte Textliste
// Eigene Knoten liegen außerhalb der React-Knoten; unmount() räumt alles auf.
import { h, mountPoint, unmountPoint } from '../core/dom.js';
import { getViews, getUserId, isReady } from '../core/api.js';
import { cached } from '../core/cache.js';
import { isModern, isTv, isNavCompact } from '../core/layout.js';
import * as stats from '../core/stats.js';
import { isTheme } from '../core/theme.js';
import { openThemePicker } from '../core/themepicker.js';
import { dataSaverAvailable } from '../core/datasaver.js';
import { dataSaverItem, switchButton } from '../shared/dsswitch.js';
import { parseLfxRoute, libraryHref, myListHref, isLibraryRoute, isMyListRoute } from '../shared/routes.js';
import { getLibraryGenres } from './library/sources.js';
import { buildNavModel, navItems, activeKey } from './nav.js';

const { STATS_LABEL } = stats;
const statsLink = () => (typeof stats.statsHref === 'function' ? stats.statsHref() : stats.getStatsUrl());

const ROOT_ID = 'lfx-mnav';
const OVERLAY_ID = 'lfx-mnav-overlay';
const CATS_ID = 'lfx-mnav-cats';
const EXCLUDED = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
const FOCUSABLE = 'a[href], button:not([disabled])';

/** Pills-Modus der Route: 'home' (Startseite), 'library' (Serien/Filme), 'mylist' oder null (keine Pills). */
function pillsMode(route) {
  if (!route || route.path !== '/home') return null;
  if (isLibraryRoute(route)) return 'library';
  if (isMyListRoute(route)) return 'mylist';
  return route.params.get('tab') !== '1' && !route.params.get('lfx') ? 'home' : null;
}

/** Pills auf der echten Startseite (dort steht das Billboard) sowie auf den Seiten Serien/Filme/Meine Liste. */
export function showsPills(route) {
  return pillsMode(route) !== null;
}

/** Pill-Definitionen aus dem Nav-Modell (ohne „Mehr“). */
export function pillItems(model) {
  return navItems(model).filter((it) => it.key === 'series' || it.key === 'movies' || it.key === 'list');
}

/** Einträge der Mehr-Liste: Navigation + weitere Bibliotheken. */
export function overlayItems(model) {
  const items = navItems(model).map((it) => ({ key: it.key, label: it.label, href: it.href }));
  for (const m of model.more) items.push({ key: 'more', label: m.label, href: m.href, id: m.id });
  const statsUrl = statsLink();
  if (statsUrl) items.push({ key: 'stats', label: STATS_LABEL, href: statsUrl, external: true });
  items.push({ key: 'design', label: 'Design-Einstellungen', action: 'design' });
  if (dataSaverAvailable()) items.push({ key: 'datasaver', label: 'Datensparmodus', action: 'datasaver' });
  return items;
}

const VIEWS_RETRY_MS = 5000; // nach einem Ladefehler der Bibliotheken frühestens so bald erneut versuchen
const state = {
  viewsFailedAt: 0,
  model: { series: null, movies: null, more: [] },
  route: null,
  root: null,
  pills: null,
  overlay: null,
  catBtn: null,
  cats: null,
  genreBtn: null,
  catsReturnFocus: null,
  genres: { series: null, movies: null },
  genresLoading: new Set(),
  returnFocus: null,
  cleanups: [],
  seq: 0,
};

const isCatsOpen = () => Boolean(state.cats && !state.cats.hidden);

function openCats() {
  if (!state.cats || isCatsOpen()) return;
  state.catsReturnFocus = document.activeElement;
  state.cats.hidden = false;
  cl().add('lfx-mnav-cats-open');
  if (state.genreBtn) state.genreBtn.setAttribute('aria-expanded', 'true');
  const active = state.cats.querySelector('.is-active') || state.cats.querySelector('.lfx-mnav-cats__link');
  const target = active || state.cats.querySelector('.lfx-mnav-cats__close');
  if (target) target.focus();
}

function closeCats({ restoreFocus = true } = {}) {
  if (!state.cats || !isCatsOpen()) return;
  state.cats.hidden = true;
  cl().remove('lfx-mnav-cats-open');
  if (state.genreBtn) state.genreBtn.setAttribute('aria-expanded', 'false');
  const back = state.catsReturnFocus;
  state.catsReturnFocus = null;
  if (restoreFocus && back && typeof back.focus === 'function' && back.isConnected) back.focus();
}

function onCatsKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeCats();
    return;
  }
  trapTab(e, state.cats);
}

const cl = () => document.documentElement.classList;

function isOpen() {
  return Boolean(state.overlay && !state.overlay.hidden);
}

function openOverlay() {
  if (!state.overlay || isOpen()) return;
  state.returnFocus = document.activeElement;
  state.overlay.hidden = false;
  cl().add('lfx-mnav-open');
  if (state.catBtn) state.catBtn.setAttribute('aria-expanded', 'true');
  const close = state.overlay.querySelector('.lfx-mnav-overlay__close');
  if (close) close.focus();
}

function closeOverlay({ restoreFocus = true } = {}) {
  if (!state.overlay || !isOpen()) return;
  state.overlay.hidden = true;
  cl().remove('lfx-mnav-open');
  if (state.catBtn) state.catBtn.setAttribute('aria-expanded', 'false');
  const back = state.returnFocus;
  state.returnFocus = null;
  if (restoreFocus && back && typeof back.focus === 'function' && back.isConnected) back.focus();
}

function onOverlayKey(e) {
  if (e.key === 'Escape') {
    e.preventDefault();
    closeOverlay();
    return;
  }
  trapTab(e, state.overlay);
}

/** Fokus-Falle: Tab zyklisch innerhalb des Containers. */
function trapTab(e, root) {
  if (e.key !== 'Tab' || !root) return;
  const nodes = [...root.querySelectorAll(FOCUSABLE)];
  if (!nodes.length) return;
  const first = nodes[0];
  const last = nodes[nodes.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function applyActive() {
  if (!state.route) return;
  const key = activeKey(state.route, state.model);
  for (const el of document.querySelectorAll(`#${ROOT_ID} [data-key], #${OVERLAY_ID} [data-key]`)) {
    if (el.dataset.key === 'cats') continue;
    const on = el.dataset.key === key;
    el.classList.toggle('is-active', on);
    if (el.tagName === 'A') {
      if (on) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    }
  }
}

function applyPillsVisibility() {
  const on = Boolean(state.route && showsPills(state.route));
  if (state.pills) state.pills.hidden = !on;
  if (cl().contains('lfx-mnav-pills') !== on) cl().toggle('lfx-mnav-pills', on);
}

const caret = () => h('span', { class: 'lfx-mnav__caret', 'aria-hidden': 'true' });

/** Aktuelle Bibliotheksart ('series'|'movies') bei Serien-/Filme-Seiten, sonst null. */
function libraryKind(route) {
  const k = route && isLibraryRoute(route) ? parseLfxRoute(route).kind : null;
  return k === 'series' || k === 'movies' ? k : null;
}

function genreName(kind, id) {
  const g = (state.genres[kind] || []).find((x) => x.id === id);
  return g ? g.name : null;
}

/** Pillen-Leiste je Route: Startseite (Serien · Filme · Meine Liste · Mehr), Bibliothek (✕ · Serien · Genres), Meine Liste (✕ · Meine Liste). */
function renderPills() {
  if (!state.pills) return;
  const mode = state.route ? pillsMode(state.route) : null;
  state.pills.textContent = '';
  state.catBtn = null;
  state.genreBtn = null;
  const closeX = () => h('a', { class: 'lfx-mnav__pill lfx-mnav__pill--x', href: '#/home', 'aria-label': 'Schließen' }, '×');
  if (mode === 'library') {
    const kind = libraryKind(state.route);
    const route = parseLfxRoute(state.route);
    const gname = route.genre ? genreName(kind, route.genre) : null;
    state.genreBtn = h('button', {
      type: 'button',
      class: `lfx-mnav__pill lfx-mnav__pill--genre${gname ? ' has-genre' : ''}`,
      'aria-haspopup': 'dialog',
      'aria-expanded': String(isCatsOpen()),
      'aria-controls': CATS_ID,
      dataset: { key: 'cats' },
    }, [gname || 'Genres', caret()]);
    state.genreBtn.addEventListener('click', () => (isCatsOpen() ? closeCats() : openCats()));
    state.pills.append(
      closeX(),
      h('a', { class: 'lfx-mnav__pill', href: libraryHref(kind), dataset: { key: kind } }, kind === 'series' ? 'Serien' : 'Filme'),
      state.genreBtn,
    );
  } else if (mode === 'mylist') {
    state.pills.append(closeX(), h('a', { class: 'lfx-mnav__pill', href: myListHref(), dataset: { key: 'list' } }, 'Meine Liste'));
  } else {
    for (const it of pillItems(state.model)) {
      state.pills.append(h('a', { class: 'lfx-mnav__pill', href: it.href, dataset: { key: it.key } }, it.label));
    }
    state.catBtn = h('button', {
      type: 'button',
      class: 'lfx-mnav__pill lfx-mnav__pill--cats',
      'aria-haspopup': 'dialog',
      'aria-expanded': String(isOpen()),
      'aria-controls': OVERLAY_ID,
      dataset: { key: 'cats' },
    }, ['Mehr', caret()]);
    state.catBtn.addEventListener('click', () => (isOpen() ? closeOverlay() : openOverlay()));
    state.pills.append(state.catBtn);
  }
}

/** Vollbild-Genreliste (Genres der aktuellen Bibliotheksart). */
function renderCats() {
  if (!state.cats) return;
  const kind = libraryKind(state.route);
  state.cats.textContent = '';
  if (!kind) {
    closeCats({ restoreFocus: false });
    return;
  }
  const genre = parseLfxRoute(state.route).genre;
  const entries = [{ id: null, name: kind === 'series' ? 'Alle Serien' : 'Alle Filme' }, ...(state.genres[kind] || [])];
  const list = h('ul', { class: 'lfx-mnav-cats__list' }, entries.map((g) => h('li', null,
    h('a', {
      class: `lfx-mnav-cats__link${(g.id || null) === (genre || null) ? ' is-active' : ''}`,
      href: libraryHref(kind, g.id ? { genre: g.id } : {}),
      ...((g.id || null) === (genre || null) ? { 'aria-current': 'page' } : {}),
    }, g.name))));
  const close = h('button', { type: 'button', class: 'lfx-mnav-cats__close', 'aria-label': 'Schließen' }, '×');
  close.addEventListener('click', () => closeCats());
  state.cats.append(list, close);
}

/** Genres der Bibliotheksart laden (einmal), danach Pille und Liste neu zeichnen. */
function ensureGenres(kind) {
  if (!kind || state.genres[kind] || state.genresLoading.has(kind)) return;
  const seq = state.seq;
  state.genresLoading.add(kind);
  Promise.resolve()
    .then(() => getLibraryGenres(kind))
    .then((g) => (Array.isArray(g) ? g : null), () => null)
    .then((g) => {
      if (seq !== state.seq || !state.root) return;
      state.genresLoading.delete(kind);
      if (g) state.genres[kind] = g; // Fehler: nicht merken, der nächste update() lädt neu
      renderPills();
      renderCats();
      applyActive();
    });
}

function render() {
  if (!state.pills || !state.overlay) return;
  renderPills();
  renderCats();

  const list = h('ul', { class: 'lfx-mnav-overlay__list' },
    overlayItems(state.model).map((it) => h('li', null, [
      it.action === 'datasaver' ? switchButton(dataSaverItem(), { className: 'lfx-mnav-overlay__link lfx-mnav-overlay__link--datasaver', role: 'switch' }) :
      it.action ? h('button', { type: 'button', class: `lfx-mnav-overlay__link lfx-mnav-overlay__link--${it.action}`, dataset: { action: it.action } }, it.label) :
      // Externe Seite (Statistik): kein data-key, damit sie nie als aktiver Tab markiert wird
      h('a', { class: `lfx-mnav-overlay__link${it.external ? ' lfx-mnav-overlay__link--stats' : ''}`, href: it.href, ...(it.external ? {} : { dataset: { key: it.key } }) }, it.label),
    ])));
  const close = h('button', { type: 'button', class: 'lfx-mnav-overlay__close', 'aria-label': 'Schließen' }, '×');
  close.addEventListener('click', () => closeOverlay());
  state.overlay.textContent = '';
  state.overlay.append(list, close);
  applyActive();
  applyPillsVisibility();
}

async function loadViews(seq) {
  state.viewsFailedAt = 0;
  try {
    const views = await cached(`views:${getUserId()}`, getViews, 5 * 60_000);
    if (seq !== state.seq || !state.root) return;
    state.model = buildNavModel(views);
  } catch {
    if (seq !== state.seq || !state.root) return;
    state.model = { series: null, movies: null, more: [] };
    state.viewsFailedAt = Date.now();
  }
  render();
}

const mobilenavFeature = {
  name: 'mobilenav',
  match(route) {
    return isReady() && isModern() && !isTv() && isNavCompact() && isTheme('flix') && !EXCLUDED.test(route.path);
  },
  mount(route) {
    const seq = ++state.seq;
    state.route = route;
    state.root = mountPoint(ROOT_ID, { className: 'lfx-mnav' });
    state.root.textContent = '';
    state.pills = h('div', { class: 'lfx-mnav__pills', role: 'navigation', 'aria-label': 'Filter', hidden: true });
    state.root.append(
      h('a', { class: 'lfx-mnav__logo', href: '#/home', 'aria-label': 'LenzFlix Startseite' }),
      state.pills,
    );
    state.overlay = mountPoint(OVERLAY_ID, { className: 'lfx-mnav-overlay' });
    state.overlay.setAttribute('role', 'dialog');
    state.overlay.setAttribute('aria-modal', 'true');
    state.overlay.setAttribute('aria-label', 'Mehr');
    state.overlay.hidden = true;
    state.overlay.addEventListener('keydown', onOverlayKey);
    // Klick auf einen Eintrag navigiert (Hash) und schließt das Overlay
    const onOverlayClick = (e) => {
      const t = e.target.closest && e.target.closest('a, button[data-action]');
      if (!t || (t.dataset && t.dataset.key === 'datasaver')) return; // Schalter: Overlay bleibt offen
      const opener = state.returnFocus || state.catBtn;
      closeOverlay({ restoreFocus: false });
      if (t.dataset && t.dataset.action === 'design') openThemePicker({ returnFocus: opener });
    };
    state.overlay.addEventListener('click', onOverlayClick);
    state.cleanups.push(
      () => state.overlay && state.overlay.removeEventListener('keydown', onOverlayKey),
      () => state.overlay && state.overlay.removeEventListener('click', onOverlayClick),
    );
    // Genreliste (Serien/Filme): eigenes Vollbild-Overlay mit Fokus-Falle und Scroll-Sperre
    state.cats = mountPoint(CATS_ID, { className: 'lfx-mnav-cats' });
    state.cats.setAttribute('role', 'dialog');
    state.cats.setAttribute('aria-modal', 'true');
    state.cats.setAttribute('aria-label', 'Genres');
    state.cats.hidden = true;
    state.cats.addEventListener('keydown', onCatsKey);
    const onCatsClick = (e) => {
      if (e.target.closest && e.target.closest('a')) closeCats({ restoreFocus: false });
    };
    state.cats.addEventListener('click', onCatsClick);
    state.cleanups.push(
      () => state.cats && state.cats.removeEventListener('keydown', onCatsKey),
      () => state.cats && state.cats.removeEventListener('click', onCatsClick),
    );
    cl().add('lfx-mnav-on');
    render();
    ensureGenres(libraryKind(route));
    loadViews(seq);
  },
  update(route) {
    // Der Router ruft update() bei jedem viewshow auf (beim frischen Laden mehrfach). Das Overlay nur
    // schließen, wenn sich die Route wirklich ändert, sonst klappt es direkt nach dem Öffnen wieder zu.
    const changed = !state.route || state.route.hash !== route.hash;
    state.route = route;
    if (state.viewsFailedAt && Date.now() - state.viewsFailedAt >= VIEWS_RETRY_MS) loadViews(state.seq);
    if (changed) {
      closeOverlay({ restoreFocus: false });
      closeCats({ restoreFocus: false });
      renderPills();
      renderCats();
      ensureGenres(libraryKind(route));
    }
    applyActive();
    applyPillsVisibility();
  },
  unmount() {
    state.seq++;
    closeOverlay({ restoreFocus: false });
    closeCats({ restoreFocus: false });
    for (const fn of state.cleanups.splice(0)) fn();
    unmountPoint(ROOT_ID);
    unmountPoint(OVERLAY_ID);
    unmountPoint(CATS_ID);
    cl().remove('lfx-mnav-on', 'lfx-mnav-pills', 'lfx-mnav-open', 'lfx-mnav-cats-open');
    state.root = null;
    state.pills = null;
    state.overlay = null;
    state.catBtn = null;
    state.cats = null;
    state.genreBtn = null;
    state.catsReturnFocus = null;
    state.genres = { series: null, movies: null };
    state.genresLoading.clear();
    state.returnFocus = null;
    state.model = { series: null, movies: null, more: [] };
    state.viewsFailedAt = 0;
  },
};

export default mobilenavFeature;
