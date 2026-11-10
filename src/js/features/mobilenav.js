// LenzFlix: Handy-Navigation im Netflix-App-Stil (Feature "mobilenav").
// Nur Modern-Layout, nicht TV, nur bei Breite < 800 px bzw. html.layout-mobile.
//  - Logo-Link (fixed im Header; der MUI-Drawer-Button wird per CSS ausgeblendet, solange das Feature läuft)
//  - Filter-Pills (Serien · Filme · Meine Liste · Mehr ▾) unter dem Header, nur auf der Startseite
//  - Vollbild-Overlay „Mehr“ mit Startseite/Bibliotheken als zentrierte Textliste
// Eigene Knoten liegen außerhalb der React-Knoten; unmount() räumt alles auf.
import { h, mountPoint, unmountPoint } from '../core/dom.js';
import { getViews, getUserId, isReady } from '../core/api.js';
import { cached } from '../core/cache.js';
import { isModern, isTv, isMobile } from '../core/layout.js';
import * as stats from '../core/stats.js';
import { isTheme } from '../core/theme.js';
import { openThemePicker } from '../core/themepicker.js';
import { buildNavModel, navItems, activeKey } from './nav.js';

const { STATS_LABEL } = stats;
const statsLink = () => (typeof stats.statsHref === 'function' ? stats.statsHref() : stats.getStatsUrl());

const ROOT_ID = 'lfx-mnav';
const OVERLAY_ID = 'lfx-mnav-overlay';
const EXCLUDED = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
const FOCUSABLE = 'a[href], button:not([disabled])';

/** Pills nur auf der echten Startseite (dort steht das Billboard). */
export function showsPills(route) {
  return route.path === '/home' && route.params.get('tab') !== '1' && !route.params.get('lfx');
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
  items.push({ key: 'design', label: 'Design Einstellungen', action: 'design' });
  return items;
}

const state = {
  model: { series: null, movies: null, more: [] },
  route: null,
  root: null,
  pills: null,
  overlay: null,
  catBtn: null,
  returnFocus: null,
  cleanups: [],
  seq: 0,
};

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
  if (e.key !== 'Tab') return;
  const nodes = [...state.overlay.querySelectorAll(FOCUSABLE)];
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

function render() {
  if (!state.pills || !state.overlay) return;
  state.pills.textContent = '';
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
  }, ['Mehr', h('span', { class: 'lfx-mnav__caret', 'aria-hidden': 'true' })]);
  state.catBtn.addEventListener('click', () => (isOpen() ? closeOverlay() : openOverlay()));
  state.pills.append(state.catBtn);

  const list = h('ul', { class: 'lfx-mnav-overlay__list' },
    overlayItems(state.model).map((it) => h('li', null, [
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
  try {
    const views = await cached(`views:${getUserId()}`, getViews, 5 * 60_000);
    if (seq !== state.seq || !state.root) return;
    state.model = buildNavModel(views);
  } catch {
    if (seq !== state.seq || !state.root) return;
    state.model = { series: null, movies: null, more: [] };
  }
  render();
}

export const mobilenavFeature = {
  name: 'mobilenav',
  match(route) {
    return isReady() && isModern() && !isTv() && isMobile() && isTheme('flix') && !EXCLUDED.test(route.path);
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
      if (!t) return;
      const opener = state.returnFocus || state.catBtn;
      closeOverlay({ restoreFocus: false });
      if (t.dataset && t.dataset.action === 'design') openThemePicker({ returnFocus: opener });
    };
    state.overlay.addEventListener('click', onOverlayClick);
    state.cleanups.push(
      () => state.overlay && state.overlay.removeEventListener('keydown', onOverlayKey),
      () => state.overlay && state.overlay.removeEventListener('click', onOverlayClick),
    );
    cl().add('lfx-mnav-on');
    render();
    loadViews(seq);
  },
  update(route) {
    // Der Router ruft update() bei jedem viewshow auf (beim frischen Laden mehrfach). Das Overlay nur
    // schließen, wenn sich die Route wirklich ändert, sonst klappt es direkt nach dem Öffnen wieder zu.
    const changed = !state.route || state.route.hash !== route.hash;
    state.route = route;
    if (changed) closeOverlay({ restoreFocus: false });
    applyActive();
    applyPillsVisibility();
  },
  unmount() {
    state.seq++;
    closeOverlay({ restoreFocus: false });
    for (const fn of state.cleanups.splice(0)) fn();
    unmountPoint(ROOT_ID);
    unmountPoint(OVERLAY_ID);
    cl().remove('lfx-mnav-on', 'lfx-mnav-pills', 'lfx-mnav-open');
    state.root = null;
    state.pills = null;
    state.overlay = null;
    state.catBtn = null;
    state.returnFocus = null;
    state.model = { series: null, movies: null, more: [] };
  },
};

export default mobilenavFeature;
