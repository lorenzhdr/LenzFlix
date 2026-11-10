// LenzFlix: dezenter Hinweis „Neu: Meine Statistik“ (Feature "statshint").
// Kleiner Toast unten auf der Startseite, 7 s sichtbar (pausiert bei Hover), höchstens einmal pro
// Browser-Sitzung. Endet dauerhaft, sobald ein Statistik-Link des Themes geklickt wurde, spätestens
// 10 Tage nach dem ersten Anzeigen. Nur Modern-Layout (Desktop + Handy), nicht TV, nur mit statsUrl.
import { h, mountPoint, unmountPoint } from '../core/dom.js';
import { isModern, isTv, isMobile } from '../core/layout.js';
import { getStatsUrl, isStatsHref, statsHref, STATS_LABEL } from '../core/stats.js';

const ID = 'lfx-statshint';
const KEY = 'lfx.statsHint';
const SESSION_KEY = 'lfx.statsHint.shown';
export const HINT_DURATION = 7000;
export const HINT_DELAY = 1500;
export const HINT_DAYS = 10;
const LEAVE_MS = 200;
const EXCLUDED = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video)/;

export function readState() {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}

function writeState(patch) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...readState(), ...patch }));
  } catch { /* Speicher gesperrt: Hinweis bleibt dann sitzungsbegrenzt */ }
}

export function markSeen() {
  writeState({ seen: true });
}

/** Fällig: nicht geöffnet, Frist nicht abgelaufen, in dieser Sitzung noch nicht gezeigt. */
export function shouldShow(now = Date.now()) {
  const st = readState();
  if (st.seen) return false;
  if (st.firstShown && now - st.firstShown > HINT_DAYS * 86400000) return false;
  try {
    if (sessionStorage.getItem(SESSION_KEY)) return false;
  } catch { /* ignorieren */ }
  return true;
}

function isHomeRoute(route) {
  return route.path === '/home' && route.params.get('tab') !== '1' && !route.params.get('lfx');
}

const state = { el: null, showTimer: null, hideTimer: null, removeTimer: null, deadline: 0, remaining: 0, onClick: null };

function clearTimers() {
  clearTimeout(state.showTimer);
  clearTimeout(state.hideTimer);
  clearTimeout(state.removeTimer);
  state.showTimer = state.hideTimer = state.removeTimer = null;
}

function removeHint() {
  clearTimers();
  if (state.el) unmountPoint(state.el);
  state.el = null;
}

function leave() {
  if (!state.el) return;
  const el = state.el;
  clearTimeout(state.hideTimer);
  state.hideTimer = null;
  el.classList.add('is-leaving');
  state.removeTimer = setTimeout(() => {
    state.removeTimer = null;
    if (state.el === el) removeHint();
  }, LEAVE_MS);
}

function startHideTimer(ms) {
  clearTimeout(state.hideTimer);
  state.deadline = Date.now() + ms;
  state.hideTimer = setTimeout(leave, ms);
}

function canHover() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

function show() {
  state.showTimer = null;
  const url = statsHref() || getStatsUrl();
  if (!url || state.el || !shouldShow()) return;
  const link = h('a', { class: 'lfx-statshint__link', href: url }, [
    h('span', { class: 'lfx-statshint__badge' }, 'Neu'),
    h('span', { class: 'lfx-statshint__text' }, `${STATS_LABEL} – deine Sehgewohnheiten im Überblick`),
    h('span', { class: 'lfx-statshint__arrow', 'aria-hidden': 'true' }, '›'),
  ]);
  const close = h('button', { type: 'button', class: 'lfx-statshint__close', 'aria-label': 'Hinweis schließen' }, '×');
  close.addEventListener('click', (e) => {
    e.preventDefault();
    leave(); // nur für diese Sitzung: Session-Flag ist bereits gesetzt
  });
  const root = mountPoint(ID, { className: 'lfx-statshint' });
  root.classList.remove('is-leaving');
  // Desktop: oben in der Kopfzeile direkt rechts neben der Navigation (fällt dort mehr auf); Handy: unten.
  const top = !isMobile();
  root.classList.toggle('lfx-statshint--top', top);
  const nav = top ? document.getElementById('lfx-nav') : null;
  const navRight = nav ? Math.round(nav.getBoundingClientRect().right) : 0;
  root.style.left = top && navRight > 0 ? `${navRight + 12}px` : '';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  root.replaceChildren(h('div', { class: 'lfx-statshint__box' }, [link, close]));
  state.el = root;
  if (canHover()) {
    root.addEventListener('mouseenter', () => {
      if (!state.hideTimer) return;
      state.remaining = Math.max(500, state.deadline - Date.now());
      clearTimeout(state.hideTimer);
      state.hideTimer = null;
    });
    root.addEventListener('mouseleave', () => {
      if (state.el !== root || state.hideTimer || state.removeTimer) return;
      startHideTimer(state.remaining || HINT_DURATION);
    });
  }
  try { sessionStorage.setItem(SESSION_KEY, '1'); } catch { /* ignorieren */ }
  if (!readState().firstShown) writeState({ firstShown: Date.now() });
  startHideTimer(HINT_DURATION);
}

function sync(route) {
  if (isHomeRoute(route)) {
    if (!state.el && !state.showTimer && shouldShow()) state.showTimer = setTimeout(show, HINT_DELAY);
  } else {
    removeHint();
  }
}

export const statshintFeature = {
  name: 'statshint',
  match(route) {
    return isModern() && !isTv() && Boolean(getStatsUrl()) && !EXCLUDED.test(route.path);
  },
  mount(route) {
    // Ein Klick auf irgendeinen Statistik-Link (Nav, Mehr-Overlay, Hinweis) beendet den Hinweis dauerhaft.
    state.onClick = (e) => {
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (a && isStatsHref(a.getAttribute('href'))) {
        markSeen();
        removeHint();
      }
    };
    document.addEventListener('click', state.onClick, true);
    sync(route);
  },
  update(route) {
    sync(route);
  },
  unmount() {
    if (state.onClick) document.removeEventListener('click', state.onClick, true);
    state.onClick = null;
    removeHint();
  },
};

export default statshintFeature;
