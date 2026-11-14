// LenzFlix: Netflix-Look-Navigation (Feature "nav").
// Eigener Container #lfx-nav außerhalb der React-Knoten; die MUI-Nav-Buttons werden nur per CSS
// (html.lfx-nav-on) ausgeblendet. Logo, Suche und User-Menü der AppBar bleiben unangetastet.
import { h, mountPoint, unmountPoint, badgePill, badgedName } from '../core/dom.js';
import { getViews, getUserId, isReady } from '../core/api.js';
import { cached } from '../core/cache.js';
import { isModern, isTv, isNavCompact } from '../core/layout.js';
import * as stats from '../core/stats.js';
import { isTheme } from '../core/theme.js';
import { openThemePicker } from '../core/themepicker.js';
import { mountAmbient, unmountAmbient, setAmbient } from '../core/ambient.js';
import { dataSaverAvailable, DATASAVER_EVENT } from '../core/datasaver.js';
import { dataSaverItem, switchButton } from '../shared/dsswitch.js';

export { setAmbient };

const { STATS_LABEL } = stats;
const statsLink = () => (typeof stats.statsHref === 'function' ? stats.statsHref() : stats.getStatsUrl());

const NAV_ID = 'lfx-nav';
export const EXCLUDED = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
const SCROLL_THRESHOLD = 10;
// Einklapp-Reihenfolge ins „Mehr“-Menü, wenn die Leiste die Symbole rechts berühren würde (zuerst der letzte Punkt)
const FOLD_ORDER = ['list', 'new', 'movies', 'series'];
const MENU_ORDER = ['series', 'movies', 'new', 'list'];
const FOLD_GAP = 16;
const FOLD_RESERVE = 180;
// Rechte Symbolgruppe der AppBar (SyncPlay, Cast, Suche, Avatar) + unser TV-Symbol (liegt fest im body)
const TOOLBAR_SEL = 'header.MuiAppBar-root > .MuiToolbar-root:first-child';
const RIGHT_SEL = `${TOOLBAR_SEL} .MuiIconButton-root, ${TOOLBAR_SEL} a[href="#/search"], ${TOOLBAR_SEL} button[aria-haspopup], .lfx-tvbtn, .lfx-dsbtn`;

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

/** Aktiver Schlüssel: home | series | movies | new | tv | list | more | null */
export function activeKey(route, model) {
  const { path, params } = route;
  if (path === '/home') {
    if (params.get('lfx') === 'new') return 'new';
    if (params.get('lfx') === 'tv') return 'tv';
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
  raf: 0,
  watch: [],
  toolbar: null,
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
  // Eingeklappter Punkt aktiv -> „Mehr“ aktiv
  if (key && state.nav.querySelector(`.lfx-nav__item[data-key="${key}"][hidden]`)) {
    state.nav.querySelector('.lfx-nav__more-btn').classList.add('is-active');
  }
}

/** Rechte Kante, bis zu der die Leiste reichen darf (links vom ersten sichtbaren rechten Symbol). */
function rightLimit(navLeft) {
  let min = window.innerWidth - FOLD_RESERVE + FOLD_GAP;
  for (const el of document.querySelectorAll(RIGHT_SEL)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.left > navLeft && r.left < min) min = r.left;
  }
  return min - FOLD_GAP;
}

/** Klappt Punkte von hinten ins Mehr-Menü, bis die Leiste passt (synchron, ein Durchgang). */
function fit() {
  const nav = state.nav;
  const wrap = nav && nav.querySelector('.lfx-nav__more');
  if (!wrap) return;
  const items = FOLD_ORDER.map((k) => nav.querySelector(`.lfx-nav__item[data-key="${k}"]`)).filter(Boolean);
  const fold = (n) => {
    const off = new Set(items.slice(0, n).map((el) => el.dataset.key));
    for (const el of items) el.hidden = off.has(el.dataset.key);
    for (const el of nav.querySelectorAll('.lfx-nav__menu-item--fold')) el.hidden = !off.has(el.dataset.key);
  };
  fold(0);
  let n = 0;
  if (!isNavCompact()) {
    const limit = rightLimit(nav.getBoundingClientRect().left);
    while (n < items.length && wrap.getBoundingClientRect().right > limit) fold(++n);
  }
  // Leichte Pille am „Mehr“-Knopf, sobald mindestens ein Punkt eingeklappt ist
  const moreBtn = wrap.querySelector('.lfx-nav__more-btn');
  if (moreBtn) moreBtn.classList.toggle('has-fold', n > 0);
  applyActive();
}

function scheduleFit() {
  if (state.raf || !state.nav) return;
  state.raf = requestAnimationFrame(() => {
    state.raf = 0;
    fit();
  });
}

function unwatch() {
  for (const o of state.watch.splice(0)) o.disconnect();
  state.toolbar = null;
}

function watchToolbar() {
  const tb = document.querySelector(TOOLBAR_SEL);
  if (tb === state.toolbar) return;
  unwatch();
  state.toolbar = tb;
  if (!tb) return;
  if (typeof ResizeObserver === 'function') {
    const ro = new ResizeObserver(scheduleFit);
    ro.observe(tb);
    state.watch.push(ro);
  }
  if (typeof MutationObserver === 'function') {
    const mo = new MutationObserver(scheduleFit);
    mo.observe(tb, { childList: true, subtree: true });
    state.watch.push(mo);
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
  const statsUrl = statsLink();
  {
    // Eingeklappte Punkte (fit() blendet sie ein) stehen oben im Menü
    const all = navItems(state.model);
    const entries = MENU_ORDER.map((k) => all.find((it) => it.key === k)).filter(Boolean)
      .map((it) => h('a', { class: 'lfx-nav__menu-item lfx-nav__menu-item--fold', role: 'menuitem', href: it.href, hidden: true, dataset: { key: it.key } }, it.label));
    for (const m of more) entries.push(h('a', { class: 'lfx-nav__menu-item', role: 'menuitem', href: m.href, dataset: { id: m.id } }, m.label));
    // Eigenständige Seite (kein Hash-Link, kein data-key -> nie „aktiv“)
    if (statsUrl) entries.push(h('a', { class: 'lfx-nav__menu-item lfx-nav__menu-item--stats', role: 'menuitem', href: statsUrl }, STATS_LABEL));
    const designBtn = h('button', { type: 'button', class: 'lfx-nav__menu-item lfx-nav__menu-item--design', role: 'menuitem', 'aria-label': badgedName('Design Einstellungen', 'Beta') }, ['Design Einstellungen', badgePill('Beta')]);
    entries.push(designBtn);
    // Datensparmodus: Schalterzeile (kein Nav-Punkt, nie eingeklappt); Klick schließt das Menü nicht
    const dsBtn = dataSaverAvailable() ? switchButton(dataSaverItem(), { className: 'lfx-nav__menu-item lfx-nav__menu-item--datasaver' }) : null;
    if (dsBtn) entries.push(dsBtn);
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
        const items = [...menu.querySelectorAll('[role="menuitem"]:not([hidden]), [role="menuitemcheckbox"]')];
        const i = items.indexOf(document.activeElement);
        const next = e.key === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        setMenu(true);
        items[next].focus();
        e.preventDefault();
      }
    });
    menu.addEventListener('click', (e) => {
      if (!(dsBtn && dsBtn.contains(e.target))) setMenu(false);
    });
    designBtn.addEventListener('click', () => {
      setMenu(false);
      openThemePicker({ returnFocus: btn });
    });
    nav.append(wrap);
    // Render läuft nach dem Laden der Bibliotheken erneut: ein gerade geöffnetes Menü offen halten
    // (die Maus steht schon darüber, ein neues mouseenter feuert nicht).
    if (state.menuOpen) setMenu(true);
  }
  fit();
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
    return isReady() && isModern() && !isTv() && isTheme('flix') && !EXCLUDED.test(route.path);
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
    window.addEventListener('resize', scheduleFit);
    state.cleanups.push(() => window.removeEventListener('resize', scheduleFit));
    // Datensparmodus-Symbol erscheint/verschwindet (CSS): Leiste neu einpassen; Menüzeile bei Design-Wechsel nachziehen
    window.addEventListener(DATASAVER_EVENT, scheduleFit);
    state.cleanups.push(() => window.removeEventListener(DATASAVER_EVENT, scheduleFit));
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(scheduleFit);
    watchToolbar();
    onScroll();
    loadViews(seq);
  },
  update(route) {
    // Der Router ruft update() bei jedem viewshow auf (beim frischen Laden mehrfach). Das Menü nur
    // schließen, wenn sich die Route wirklich ändert, sonst klappt es unter der Maus wieder zu.
    const changed = !state.route || state.route.hash !== route.hash;
    state.route = route;
    if (changed) setMenu(false);
    applyActive();
    watchToolbar();
    scheduleFit();
  },
  unmount() {
    state.seq++;
    for (const fn of state.cleanups.splice(0)) fn();
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    unwatch();
    unmountPoint(NAV_ID);
    unmountAmbient();
    const cl = document.documentElement.classList;
    cl.remove('lfx-nav-on', 'lfx-scrolled');
    state.nav = null;
    state.menuOpen = false;
  },
};

export default navFeature;
