// LenzFlix: Serien-/Filme-Seite (flix, Route #/home?lfx=series|movies[&genre=][&view=grid][&sort=]).
// Eigener Container #lfx-library als erstes Kind von #homeTab; native Sektionen und #lfx-home werden per CSS
// (html.lfx-library-on) ausgeblendet. Zeilen-Ansicht: Billboard + Zeilen (billboard.js/rows.js per ctx), Raster-Ansicht: createGrid.
import * as api from '../core/api.js';
import { h } from '../core/dom.js';
import { isModern, isTv } from '../core/layout.js';
import { isTheme } from '../core/theme.js';
import { isLibraryRoute, libraryHref, parseLfxRoute } from '../shared/routes.js';
import * as billboard from './billboard.js';
import * as rows from './rows.js';
import { createGrid } from './library/grid.js';
import { createHead } from './library/head.js';
import { LIB_TYPES, buildLibraryRowDefs, getLibraryGenres, fetchLibraryHeroPool, libraryPoolKey } from './library/sources.js';

const ROOT_ID = 'lfx-library';
const ON_CLASS = 'lfx-library-on';

let state = null; // {root, head, body, genres, genresKind, key, grid, content[], seq, raf, onScroll}
let waitTimer = null;

function findHomeTab() {
  const tab = document.querySelector('#indexPage:not(.hide) #homeTab');
  return tab && tab.isConnected ? tab : null;
}

function disposeContent(s) {
  if (s.grid) { try { s.grid.destroy(); } catch { /* ignorieren */ } s.grid = null; }
  for (const fn of s.content.splice(0)) {
    try { fn && fn(); } catch (e) { console.error('[LenzFlix] library cleanup', e); }
  }
  s.body.replaceChildren();
}

function teardown() {
  const s = state;
  state = null;
  if (s) {
    s.seq += 1;
    disposeContent(s);
    window.removeEventListener('scroll', s.onScroll);
    if (s.raf) cancelAnimationFrame(s.raf);
    s.head.destroy();
  }
  document.getElementById(ROOT_ID)?.remove();
  document.documentElement.classList.remove(ON_CLASS);
}

function headerHeight() {
  const v = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--lfx-header-h'));
  return v > 0 ? v : 80;
}

function loadGenres(s, kind) {
  if (s.genresKind === kind) return;
  s.genresKind = kind;
  s.genres = [];
  s.head.setGenres([]);
  getLibraryGenres(kind).then((list) => {
    if (state !== s || s.genresKind !== kind) return;
    s.genres = list || [];
    s.head.setGenres(s.genres);
  }, () => {});
}

function renderRowsView(s, { kind, genre }) {
  const bbSlot = h('section', { id: 'lfx-billboard', class: 'lfx-billboard', 'aria-label': 'Empfehlung' });
  const rowsSlot = h('div', { id: 'lfx-rows', class: 'lfx-rows' });
  s.body.append(bbSlot, rowsSlot);
  if (genre) {
    s.body.append(h('div', { class: 'lfx-lib__all' }, [
      h('a', { class: 'lfx-lib__all-btn', href: libraryHref(kind, { genre, view: 'grid' }) }, 'Alle anzeigen'),
    ]));
  }
  const genreName = genre ? (s.genres.find((g) => g.id === genre) || {}).name : undefined;
  const ctxBb = {
    root: s.root,
    pool: {
      key: libraryPoolKey(kind, genre),
      fetch: () => fetchLibraryHeroPool(kind, { genre }),
      firstKey: `lfx-bb-first:lib:${kind}`,
    },
  };
  const ctxRows = {
    root: s.root,
    defs: { build: () => buildLibraryRowDefs(kind, { genre, genreName }) },
    prefetch: false,
    hero: () => bbSlot,
  };
  for (const [mod, slot, ctx] of [[billboard, bbSlot, ctxBb], [rows, rowsSlot, ctxRows]]) {
    try {
      s.content.push(mod.render(slot, ctx));
    } catch (e) {
      console.error('[LenzFlix] library render', e);
    }
  }
}

function renderGridView(s, { kind, genre, sort }) {
  const query = { IncludeItemTypes: LIB_TYPES[kind] || LIB_TYPES.movies };
  if (genre) query.GenreIds = genre;
  const grid = createGrid({
    query, sort: sort || 'az', onCount: (n) => { if (state === s) s.head.setCount(n); },
  });
  s.grid = grid;
  s.body.append(grid.el);
}

function apply(s, route) {
  const r = parseLfxRoute(route);
  const kind = r.kind === 'series' ? 'series' : 'movies';
  const genre = r.genre || null;
  const view = r.view;
  const sort = r.sort;
  s.head.update({ kind, genre, view, sort });
  s.root.classList.toggle('is-grid', view === 'grid');
  loadGenres(s, kind);
  const key = `${kind}|${genre || ''}|${view || ''}`;
  if (key === s.key) {
    if (s.grid) s.grid.setSort(sort || 'az');
    return;
  }
  s.key = key;
  s.seq += 1;
  disposeContent(s);
  if (view === 'grid') renderGridView(s, { kind, genre, sort });
  else renderRowsView(s, { kind, genre });
}

function build(tab, route) {
  teardown();
  const head = createHead();
  const body = h('div', { class: 'lfx-lib__body' });
  const root = h('div', { id: ROOT_ID, class: 'lfx-lib' }, [head.el, body]);
  const s = {
    root, head, body, genres: [], genresKind: null, key: null, grid: null, content: [], seq: 0, raf: 0, onScroll: null,
  };
  state = s;
  s.onScroll = () => {
    if (s.raf) return;
    s.raf = requestAnimationFrame(() => {
      s.raf = 0;
      if (state === s) head.setStuck(head.el.getBoundingClientRect().top <= headerHeight() + 1);
    });
  };
  window.addEventListener('scroll', s.onScroll, { passive: true });
  tab.prepend(root);
  document.documentElement.classList.add(ON_CLASS);
  apply(s, route);
}

function ensure(route) {
  clearTimeout(waitTimer);
  const tab = findHomeTab();
  if (tab && state && tab.contains(state.root)) { apply(state, route); return; }
  if (tab) { build(tab, route); return; }
  // #homeTab erscheint erst nach dem Legacy-Controller – kurz warten (max ~6 s)
  let tries = 0;
  const poll = () => {
    const t = findHomeTab();
    if (t) build(t, route);
    else if (++tries < 30) waitTimer = setTimeout(poll, 200);
  };
  waitTimer = setTimeout(poll, 200);
}

const library = {
  name: 'library',
  match: (route) => isTheme('flix') && isModern() && !isTv() && api.isReady() && isLibraryRoute(route),
  mount: (route) => ensure(route),
  update: (route) => ensure(route),
  unmount: () => { clearTimeout(waitTimer); teardown(); },
};

export default library;
