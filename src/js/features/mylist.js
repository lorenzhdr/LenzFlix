// LenzFlix: Seite „Meine Liste“ (flix, retro; Route #/home?lfx=mylist[&type=][&sort=]).
// Eigener Container #lfx-mylist als erstes Kind von #homeTab; native Sektionen und #lfx-home werden per CSS
// (html.lfx-mylist-on) ausgeblendet. Raster/Karten kommen aus library/grid.js (Standardkarte, Delegation für Info/Hover).
// retro: Wurzel trägt zusätzlich die Seitenhülle .lfx-retro-page (+ html.lfx-retro-page-on, Regeln in retro/title.css).
import * as api from '../core/api.js';
import { h } from '../core/dom.js';
import { isModern, isTv } from '../core/layout.js';
import { isTheme } from '../core/theme.js';
import { onItemsChanged } from '../core/itemmenu.js';
import { isMyListRoute, parseLfxRoute, myListHref } from '../shared/routes.js';
import { createGrid } from './library/grid.js';

const ROOT_ID = 'lfx-mylist';
const ON_CLASS = 'lfx-mylist-on';
const RETRO_PAGE_ON = 'lfx-retro-page-on';
const HIDDEN_RELOAD_MS = 60000; // Tab-Rückkehr: erst nach so langer Abwesenheit neu laden
const STALE_MS = 2000; // update() innerhalb dieser Zeit nach dem Laden ist ein Router-Echo (viewshow feuert mehrfach)

const TYPE_QUERY = { movies: 'Movie', series: 'Series' };
const TYPES = [
  { id: null, label: 'Alle' },
  { id: 'movies', label: 'Filme' },
  { id: 'series', label: 'Serien' },
];
const SORTS = [
  { id: 'az', label: 'A–Z' },
  { id: 'new', label: 'Neu hinzugefügt' },
  { id: 'year', label: 'Erscheinungsjahr' },
];

let pending = null;
let state = null; // { root, grid, type, sort, count, chips, sorts, empty, loadedAt, cleanups }

const queryFor = (type) => ({
  IncludeItemTypes: type ? TYPE_QUERY[type] : 'Movie,Series',
  Filters: 'IsFavorite',
});
const routeOf = (route) => {
  const r = parseLfxRoute(route);
  return { type: r.type || null, sort: r.sort && SORTS.some((s) => s.id === r.sort) ? r.sort : 'az' };
};

function findHomeTab() {
  const tab = document.querySelector('#indexPage:not(.hide) #homeTab');
  return tab && tab.isConnected ? tab : null;
}

function teardown() {
  const s = state;
  state = null;
  if (s) {
    for (const fn of s.cleanups.splice(0)) {
      try { fn && fn(); } catch (e) { console.error('[LenzFlix] mylist cleanup', e); }
    }
    if (s.grid) s.grid.destroy();
    if (s.root) s.root.remove();
  }
  document.getElementById(ROOT_ID)?.remove();
  const cl = document.documentElement.classList;
  cl.remove(ON_CLASS);
  cl.remove(RETRO_PAGE_ON);
}

function countText(n) {
  return isTheme('retro') ? `${n} TITEL` : `${n} Titel`;
}

function paint(s) {
  for (const a of s.chips.children) {
    const on = (a.dataset.type || '') === (s.type || '');
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    a.href = myListHref({ type: a.dataset.type || undefined, sort: s.sort === 'az' ? undefined : s.sort });
  }
  for (const a of s.sorts.children) {
    const on = a.dataset.sort === s.sort;
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    a.href = myListHref({ type: s.type || undefined, sort: a.dataset.sort === 'az' ? undefined : a.dataset.sort });
  }
}

function emptyBlock() {
  return h('div', { class: 'lfx-ml__empty', hidden: true }, [
    h('p', { class: 'lfx-ml__empty-title' }),
    h('p', { class: 'lfx-ml__empty-hint' }, 'Mit „+ Meine Liste“ merkst du dir Filme und Serien.'),
    h('a', { class: 'lfx-ml__empty-link' }),
  ]);
}

// Leertext: mit Art-Filter filterbezogen (Link „Alle anzeigen“), sonst „Liste leer“.
function fillEmpty(s) {
  const retro = isTheme('retro');
  const kind = { movies: 'Filme', series: 'Serien' }[s.type];
  const [title, hint, link] = s.empty.children;
  title.textContent = kind
    ? (retro ? `KEINE ${kind.toUpperCase()} GEMERKT` : `Keine ${kind} in deiner Liste`)
    : (retro ? 'KEINE BÄNDER GEMERKT' : 'Deine Liste ist leer');
  hint.hidden = Boolean(kind);
  link.textContent = kind ? (retro ? 'ALLE ANZEIGEN' : 'Alle anzeigen') : (retro ? 'ZURÜCK ZUM STARTMENÜ' : 'Zur Startseite');
  link.setAttribute('href', kind ? myListHref({ sort: s.sort === 'az' ? undefined : s.sort }) : '#/home');
}

function build(tab, r) {
  teardown();
  const retro = isTheme('retro');
  const s = {
    root: null, grid: null, type: r.type, sort: r.sort, count: null, chips: null, sorts: null, empty: null, retro,
    loadedAt: Date.now(), cleanups: [],
  };
  state = s;

  const title = retro
    ? h('h1', { class: 'lfx-ml__title' }, [
      'C:\\LENZ84\\LISTE>',
      h('span', { class: 'lfx-ml__cursor', 'aria-hidden': 'true' }, '_'),
    ])
    : h('h1', { class: 'lfx-ml__title' }, 'Meine Liste');
  s.count = h('p', { class: 'lfx-ml__count', 'aria-live': 'polite' });
  s.chips = h('nav', { class: 'lfx-ml__chips', 'aria-label': 'Art' },
    TYPES.map((t) => h('a', { class: 'lfx-ml__chip', href: myListHref(), dataset: { type: t.id || '' } }, t.label)));
  s.sorts = h('nav', { class: 'lfx-ml__sorts', 'aria-label': 'Sortierung' },
    SORTS.map((o) => h('a', { class: 'lfx-ml__sort', href: myListHref(), dataset: { sort: o.id } }, o.label)));
  s.empty = emptyBlock();

  s.grid = createGrid({
    query: queryFor(s.type),
    sort: s.sort,
    emptyText: '',
    onCount: (n) => {
      s.loadedAt = Date.now();
      s.count.textContent = countText(n);
      fillEmpty(s);
      s.empty.hidden = n > 0;
      s.root.classList.toggle('is-empty', n === 0);
    },
  });

  s.root = h('div', { id: ROOT_ID, class: `lfx-ml${retro ? ' lfx-retro-page' : ''}` }, [
    h('header', { class: 'lfx-ml__head' }, [title, s.count]),
    h('div', { class: 'lfx-ml__bar' }, [s.chips, s.sorts]),
    s.empty,
    h('div', { class: 'lfx-ml__grid' }, [s.grid.el]),
  ]);
  tab.prepend(s.root);
  const cl = document.documentElement.classList;
  cl.add(ON_CLASS);
  if (retro) cl.add(RETRO_PAGE_ON);
  paint(s);

  // Favoriten geändert: entfernte Titel verschwinden sofort; 'lfx:favorite' (optional) und Rückkehr in den Tab laden neu.
  const refresh = () => { if (state === s) s.grid.refresh(); };
  s.cleanups.push(onItemsChanged(({ removed = [] }) => {
    if (state !== s || !removed.length) return;
    let n = 0;
    s.root.querySelectorAll('[data-lfx-id]').forEach((el) => {
      if (removed.includes(el.dataset.lfxId)) { (el.closest('.lfx-grid__item') || el).remove(); n += 1; }
    });
    if (n) s.grid.drop(n);
  }));
  document.addEventListener('lfx:favorite', refresh);
  s.cleanups.push(() => document.removeEventListener('lfx:favorite', refresh));
  // Tab-Rückkehr: erst nach 60 s Abwesenheit neu laden, kurzer Wechsel behält Scrollstand und nachgeladene Seiten.
  let hiddenAt = 0;
  const onVisible = () => {
    if (document.visibilityState !== 'visible') { hiddenAt = Date.now(); return; }
    if (hiddenAt && Date.now() - hiddenAt >= HIDDEN_RELOAD_MS) refresh();
    hiddenAt = 0;
  };
  document.addEventListener('visibilitychange', onVisible);
  s.cleanups.push(() => document.removeEventListener('visibilitychange', onVisible));
}

function ensure(route) {
  clearTimeout(pending);
  const r = routeOf(route);
  const tab = findHomeTab();
  if (state && state.root && state.root.isConnected && tab && tab.contains(state.root)) {
    // Gleiche Seite: nur Art/Sortierung nachziehen, sonst bei Router-Wiederholung nach einer Weile neu laden.
    const s = state;
    if (s.retro !== isTheme('retro')) { build(tab, r); return; } // Designwechsel flix <-> retro: Hülle/Texte neu aufbauen
    if (r.type !== s.type) {
      s.type = r.type;
      s.sort = r.sort;
      paint(s);
      s.grid.setQuery(queryFor(s.type), s.sort);
    } else if (r.sort !== s.sort) {
      s.sort = r.sort;
      paint(s);
      s.grid.setSort(s.sort);
    } else if (Date.now() - s.loadedAt > STALE_MS) {
      s.loadedAt = Date.now();
      s.grid.refresh();
    }
    return;
  }
  if (tab) { build(tab, r); return; }
  teardown();
  let tries = 0;
  const poll = () => {
    const t = findHomeTab();
    if (t) build(t, r);
    else if (++tries < 30) pending = setTimeout(poll, 200);
  };
  pending = setTimeout(poll, 200);
}


const mylist = {
  name: 'mylist',
  match: (route) => (isTheme('flix') || isTheme('retro')) && isModern() && !isTv() && api.isReady() && isMyListRoute(route),
  mount: (route) => ensure(route),
  update: (route) => ensure(route),
  unmount: () => { clearTimeout(pending); pending = null; teardown(); },
};

export default mylist;
