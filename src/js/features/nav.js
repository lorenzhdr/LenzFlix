// LenzFlix: Netflix-Look-Navigation (Feature "nav").
// Eigener Container #lfx-nav außerhalb der React-Knoten; die MUI-Nav-Buttons werden nur per CSS
// (html.lfx-nav-on) ausgeblendet. Logo, Suche und User-Menü der AppBar bleiben unangetastet.
import { h, mountPoint, unmountPoint } from '../core/dom.js';
import { getViews, getUserId, isReady } from '../core/api.js';
import { cached } from '../core/cache.js';
import { isModern, isTv } from '../core/layout.js';
import { getStatsUrl, STATS_LABEL } from '../core/stats.js';
import { mountAmbient, unmountAmbient, setAmbient } from '../core/ambient.js';

export { setAmbient };

const NAV_ID = 'lfx-nav';
const EXCLUDED = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
const SCROLL_THRESHOLD = 10;

/** Route-URL einer Bibliothek (spiegelt appRouter.getRouteUrl für das Modern-Layout). */
export function viewUrl(view) {
  const id = view.Id;
  const ct = view.CollectionType;
  const q = `topParentId=${id}&collectionType=${ct}`;
  switch (ct) {
    case 'movies': return `#/movies?${q}`;
    case 'tvshows': return `#/tv?${q}`;
    case 'music': return `#/music?${q}`;
    case 'books': return `#/books?${q}`;
    case 'musicvideos': return `#/musicvideos?${q}`;
    case 'boxsets': return `#/boxsets?${q}`;
    case 'playlists': return `#/playlists?${q}`;
    case 'homevideos': return `#/homevideos?topParentId=${id}`;
    case 'livetv': return '#/livetv';
    default: return ct ? `#/list?parentId=${id}` : `#/mixed?topParentId=${id}&collectionType=mixed`;
  }
}

const VIEW_LABELS = { boxsets: 'Sammlungen', playlists: 'Playlists' };

/** Aus /UserViews-Items: erste Serien-/Filmbibliothek + Rest für „Mehr“. */
export function buildNavModel(views) {
  const items = (views && views.Items) || (Array.isArray(views) ? views : []);
  const series = items.find((v) => v.CollectionType === 'tvshows') || null;
  const movies = items.find((v) => v.CollectionType === 'movies') || null;
  const more = items
    .filter((v) => v !== series && v !== movies)
    .map((v) => ({ id: v.Id, label: VIEW_LABELS[v.CollectionType] || v.Name, href: viewUrl(v) }));
  return { series, movies, more };
}

/** Aktiver Schlüssel: home | series | movies | new | list | more | null */
export function activeKey(route, model) {
  const { path, params } = route;
  if (path === '/home') {
    if (params.get('lfx') === 'new') return 'new';
    return params.get('tab') === '1' ? 'list' : 'home';
  }
  const lib = params.get('topParentId') || params.get('parentId');
  if (path === '/tv') return !lib || (model.series && lib === model.series.Id) ? 'series' : 'more';
  if (path === '/movies') return !lib || (model.movies && lib === model.movies.Id) ? 'movies' : 'more';
  if (lib && model.series && lib === model.series.Id) return 'series';
  if (lib && model.movies && lib === model.movies.Id) return 'movies';
  if (lib && model.more.some((m) => m.id === lib)) return 'more';
  return null;
}

export function navItems(model) {
  const items = [{ key: 'home', label: 'Startseite', href: '#/home' }];
  if (model.series) items.push({ key: 'series', label: 'Serien', href: viewUrl(model.series) });
  if (model.movies) items.push({ key: 'movies', label: 'Filme', href: viewUrl(model.movies) });
  items.push({ key: 'new', label: 'Neu und beliebt', href: '#/home?lfx=new' });
  items.push({ key: 'list', label: 'Meine Liste', href: '#/home?tab=1' });
  return items;
}

const state = {
  nav: null,
  model: { series: null, movies: null, more: [] },
  route: null,
  cleanups: [],
  menuOpen: false,
  seq: 0,
};

function setMenu(open) {
  state.menuOpen = open;
  const wrap = state.nav && state.nav.querySelector('.lfx-nav__more');
  if (!wrap) return;
  wrap.classList.toggle('is-open', open);
  const btn = wrap.querySelector('.lfx-nav__more-btn');
  if (btn) btn.setAttribute('aria-expanded', String(open));
}

function applyActive() {
  if (!state.nav || !state.route) return;
  const key = activeKey(state.route, state.model);
  for (const el of state.nav.querySelectorAll('[data-key]')) {
    const on = el.dataset.key === key;
    el.classList.toggle('is-active', on);
    if (el.tagName === 'A') {
      if (on) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    }
  }
}

function render() {
  const nav = state.nav;
  if (!nav) return;
  nav.textContent = '';
  for (const it of navItems(state.model)) {
    nav.append(h('a', { class: 'lfx-nav__item', href: it.href, dataset: { key: it.key } }, it.label));
  }
  const more = state.model.more;
  const statsUrl = getStatsUrl();
  if (more.length || statsUrl) {
    const entries = more.map((m) => h('a', { class: 'lfx-nav__menu-item', role: 'menuitem', href: m.href, dataset: { id: m.id } }, m.label));
    // Eigenständige Seite (kein Hash-Link, kein data-key -> nie „aktiv“)
    if (statsUrl) entries.push(h('a', { class: 'lfx-nav__menu-item lfx-nav__menu-item--stats', role: 'menuitem', href: statsUrl }, STATS_LABEL));
    const menu = h('div', { class: 'lfx-nav__menu', role: 'menu', id: 'lfx-nav-menu' }, entries);
    const btn = h('button', {
      type: 'button',
      class: 'lfx-nav__item lfx-nav__more-btn',
      'aria-haspopup': 'true',
      'aria-expanded': 'false',
      'aria-controls': 'lfx-nav-menu',
      dataset: { key: 'more' },
    }, ['Mehr', h('span', { class: 'lfx-nav__caret', 'aria-hidden': 'true' })]);
    const wrap = h('div', { class: 'lfx-nav__more' }, [btn, menu]);
    btn.addEventListener('click', () => setMenu(!state.menuOpen));
    wrap.addEventListener('mouseenter', () => setMenu(true));
    wrap.addEventListener('mouseleave', () => setMenu(false));
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        setMenu(false);
        btn.focus();
      } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...menu.querySelectorAll('a')];
        const i = items.indexOf(document.activeElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        setMenu(true);
        items[next].focus();
        e.preventDefault();
      }
    });
    menu.addEventListener('click', () => setMenu(false));
    nav.append(wrap);
  }
  applyActive();
}

function onScroll() {
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  const root = document.documentElement;
  const on = y > SCROLL_THRESHOLD;
  if (root.classList.contains('lfx-scrolled') !== on) root.classList.toggle('lfx-scrolled', on);
}

function onDocClick(e) {
  if (state.menuOpen && state.nav && !state.nav.contains(e.target)) setMenu(false);
}

async function loadViews(seq) {
  try {
    const views = await cached(`views:${getUserId()}`, getViews, 5 * 60_000);
    if (seq !== state.seq || !state.nav) return;
    state.model = buildNavModel(views);
  } catch {
    if (seq !== state.seq || !state.nav) return;
    state.model = { series: null, movies: null, more: [] };
  }
  render();
}

export const navFeature = {
  name: 'nav',
  match(route) {
    return isReady() && isModern() && !isTv() && !EXCLUDED.test(route.path);
  },
  mount(route) {
    const seq = ++state.seq;
    state.route = route;
    state.nav = mountPoint(NAV_ID, { tag: 'nav', className: 'lfx-nav' });
    state.nav.setAttribute('aria-label', 'Hauptnavigation');
    mountAmbient();
    document.documentElement.classList.add('lfx-nav-on');
    render();
    window.addEventListener('scroll', onScroll, { passive: true });
    document.addEventListener('click', onDocClick, true);
    state.cleanups.push(
      () => window.removeEventListener('scroll', onScroll),
      () => document.removeEventListener('click', onDocClick, true),
    );
    onScroll();
    loadViews(seq);
  },
  update(route) {
    state.route = route;
    setMenu(false);
    applyActive();
  },
  unmount() {
    state.seq++;
    for (const fn of state.cleanups.splice(0)) fn();
    unmountPoint(NAV_ID);
    unmountAmbient();
    const cl = document.documentElement.classList;
    cl.remove('lfx-nav-on', 'lfx-scrolled');
    state.nav = null;
    state.menuOpen = false;
  },
};

export default navFeature;
