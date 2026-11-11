// LENZ+: Handy-Kopfzeile (<800 px): Seitentitel, Zurück-Pfeil auf Unterseiten, Blur-Streifen beim Scrollen.
// Eigener Container #lfx-plus-mhead; die native AppBar wird nur per html-Klasse (lfx-plus-mhead-on) ausgeblendet.
import { h, mountPoint, unmountPoint } from '../../core/dom.js';
import { isReady } from '../../core/api.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { parseLfxRoute, tvModeHref, isTvModeRoute } from '../../shared/routes.js';
import { getLibraries } from '../../shared/libraries.js';
import { ICONS } from './header-icons.js';
import { isPhone } from './mobile.js';

const ROOT_ID = 'lfx-plus-mhead';
const ON_CLASS = 'lfx-plus-mhead-on';
const EXCLUDED = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
const SOLID_AT = 8;

/** Zurück-Pfeil: überall außer auf der Startseite, dem Favoriten-Tab und den Hubs. */
export function showsBack(route) {
  if (!route) return false;
  if (route.path !== '/home') return true;
  const { kind } = parseLfxRoute(route);
  return Boolean(kind) && kind !== 'hub';
}

/** Seitentitel; libs = getLibraries()-Ergebnis (für Hub/Bibliothek). Leer, wenn keiner passt. */
export function headerTitle(route, libs) {
  if (!route) return '';
  const list = Array.isArray(libs) ? libs : [];
  const libName = (id) => (list.find((l) => l.id === id) || {}).name || '';
  if (route.path === '/home') {
    const { kind, lib } = parseLfxRoute(route);
    if (kind === 'hub' || kind === 'browse') return libName(lib) || (kind === 'browse' ? 'Bibliothek' : '');
    if (kind === 'new') return 'Neu & beliebt';
    if (kind === 'search') return 'Suche';
    if (kind === 'tv') return 'TV';
    if (kind) return '';
    return route.params.get('tab') === '1' ? 'Meine Liste' : 'Für dich';
  }
  if (route.path === '/movies' || route.path === '/tv') {
    const parent = route.params.get('topParentId') || route.params.get('parentId');
    return libName(parent) || (route.path === '/movies' ? 'Filme' : 'Serien');
  }
  if (/^\/(mypreferences|usermenu)/.test(route.path)) return 'Einstellungen';
  return '';
}

const state = { root: null, tvEl: null, backEl: null, titleEl: null, route: null, libs: [], seq: 0, raf: 0, cleanups: [] };

function render() {
  if (!state.root) return;
  const back = showsBack(state.route);
  state.backEl.hidden = !back;
  state.root.classList.toggle('has-back', back);
  state.titleEl.textContent = headerTitle(state.route, state.libs);
  const on = isTvModeRoute(state.route);
  state.tvEl.classList.toggle('is-active', on);
  if (on) state.tvEl.setAttribute('aria-current', 'page');
  else state.tvEl.removeAttribute('aria-current');
}

function scrollTick() {
  state.raf = 0;
  if (!state.root) return;
  const y = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
  state.root.classList.toggle('is-solid', y > SOLID_AT);
}

function onScroll() {
  if (state.raf) return;
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
  state.raf = raf(scrollTick);
}

async function loadLibraries(seq) {
  let libs = [];
  try {
    libs = (await getLibraries()) || [];
  } catch { /* Titel ohne Bibliotheksnamen */ }
  if (seq !== state.seq || !state.root) return;
  state.libs = libs;
  render();
}

export const plusMobileHead = {
  name: 'plus-mobilehead',
  match(route) {
    return isTheme('plus') && isModern() && !isTv() && isPhone() && isReady() && !EXCLUDED.test(route.path);
  },
  mount(route) {
    const seq = ++state.seq;
    state.route = route;
    state.libs = [];
    const root = mountPoint(ROOT_ID, { tag: 'header', className: 'lfx-plus-mhead' });
    root.textContent = '';
    const backEl = h('button', { type: 'button', class: 'lfx-plus-mhead__back', 'aria-label': 'Zurück', hidden: true });
    backEl.innerHTML = ICONS.back;
    backEl.addEventListener('click', () => window.history.back());
    const titleEl = h('h1', { class: 'lfx-plus-mhead__title' });
    const tv = h('a', { class: 'lfx-plus-mhead__tv', href: tvModeHref, 'aria-label': 'TV', title: 'TV', dataset: { key: 'tv' } });
    tv.innerHTML = ICONS.tvmode;
    tv.addEventListener('click', () => window.dispatchEvent(new CustomEvent('lfx:tvmode-intent')));
    root.append(backEl, titleEl, tv);
    state.tvEl = tv;
    state.root = root;
    state.backEl = backEl;
    state.titleEl = titleEl;
    document.documentElement.classList.add(ON_CLASS);
    window.addEventListener('scroll', onScroll, { passive: true });
    state.cleanups.push(() => window.removeEventListener('scroll', onScroll));
    render();
    scrollTick();
    loadLibraries(seq);
  },
  update(route) {
    state.route = route;
    render();
  },
  unmount() {
    state.seq++;
    for (const fn of state.cleanups.splice(0)) fn();
    if (state.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(state.raf);
    state.raf = 0;
    unmountPoint(ROOT_ID);
    document.documentElement.classList.remove(ON_CLASS);
    state.root = null;
    state.backEl = null;
    state.titleEl = null;
    state.tvEl = null;
    state.libs = [];
  },
};

export default plusMobileHead;
