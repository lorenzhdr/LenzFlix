// LENZ+: Filme-/Serien-Seite (#/home?lfx=browse&lib=<id>[&genre=<id>]): H1, Genre-Chips, 16:9-Raster mit Nachladen.
import * as api from '../../core/api.js';
import { h } from '../../core/dom.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { putItems } from '../../core/itemstore.js';
import { parseLfxRoute, browseHref } from '../../shared/routes.js';
import { getLibraries } from '../../shared/libraries.js';
import { hubTypes } from '../../shared/hub.js';
import { getNewContentInfo, plusBadge } from '../../shared/newcontent.js';
import { BASE_PARAMS } from '../rows/logic.js';
import { whenHomeTab, setPageOn, scrollTop } from './title-mount.js';
import { gridCard } from './title-cards.js';

const ROOT_ID = 'lfx-plus-browse';
const ON_CLASS = 'lfx-plus-browse-on';
const PAGE = 40;

let state = null; // { libId, genreId, seq, items, total, done, loading, info, root, chips, grid, status, cleanups, cancelWait }

const routeOf = (route) => {
  const r = parseLfxRoute(route);
  return r.kind === 'browse' && r.lib ? { lib: r.lib, genre: r.genre } : null;
};

const asItems = (res) => (Array.isArray(res) ? res : (res && Array.isArray(res.Items) ? res.Items : []));

function dispose() {
  const s = state;
  state = null;
  if (s) {
    if (s.cancelWait) s.cancelWait();
    for (const fn of s.cleanups.splice(0)) {
      try { fn && fn(); } catch (e) { console.error('[LenzFlix] plus-browse cleanup', e); }
    }
    if (s.root) s.root.remove();
  }
  document.getElementById(ROOT_ID)?.remove();
  setPageOn(ON_CLASS, false);
}

function paintChips(s) {
  for (const chip of s.chips.querySelectorAll('.lfx-plus-chip')) {
    const on = (chip.dataset.genre || '') === (s.genreId || '');
    chip.classList.toggle('is-active', on);
    if (on) chip.setAttribute('aria-current', 'true');
    else chip.removeAttribute('aria-current');
  }
}

/** Setzt den Raster-Zustand zurück und lädt die erste Seite für das aktuelle Genre. */
function reload(s) {
  s.seq += 1;
  s.items = [];
  s.total = null;
  s.done = false;
  s.loading = false;
  s.grid.replaceChildren();
  s.status.replaceChildren();
  paintChips(s);
  loadMore(s);
}

async function loadMore(s) {
  if (state !== s || s.loading || s.done) return;
  const seq = s.seq;
  s.loading = true;
  s.root.setAttribute('aria-busy', 'true');
  const stale = () => state !== s || s.seq !== seq;
  try {
    const res = await api.getItems({
      ...BASE_PARAMS,
      ParentId: s.libId,
      IncludeItemTypes: s.types,
      Recursive: true,
      SortBy: 'SortName',
      SortOrder: 'Ascending',
      GenreIds: s.genreId || undefined,
      StartIndex: s.items.length,
      Limit: PAGE,
    });
    if (stale()) return;
    const items = asItems(res);
    putItems(items);
    s.total = res && typeof res.TotalRecordCount === 'number' ? res.TotalRecordCount : null;
    s.items.push(...items);
    if (s.info === null) {
      s.info = await getNewContentInfo().catch(() => false);
      if (stale()) return;
    }
    for (const it of items) s.grid.append(gridCard(it, { badge: s.info ? plusBadge(it, s.info) : null }));
    s.done = items.length < PAGE || (s.total != null && s.items.length >= s.total);
    if (!s.items.length) s.status.replaceChildren(h('p', { class: 'lfx-plus-empty' }, 'Keine Titel gefunden.'));
  } catch (e) {
    if (stale()) return;
    console.warn('[LenzFlix] plus-browse konnte nicht laden', e && e.message);
    s.done = true;
    s.status.replaceChildren(
      h('p', { class: 'lfx-plus-empty' }, 'Titel konnten nicht geladen werden.'),
      h('button', { type: 'button', class: 'lfx-plus-pill', onclick: () => { s.done = false; s.status.replaceChildren(); loadMore(s); } }, 'Erneut versuchen'),
    );
  } finally {
    if (!stale()) {
      s.loading = false;
      s.root.removeAttribute('aria-busy');
    }
  }
}

async function build(tab, s) {
  const stale = () => state !== s;
  let lib = null;
  try {
    lib = (await getLibraries()).find((l) => l.id === s.libId) || null;
  } catch { /* Name fällt auf Standard zurück */ }
  if (stale()) return;
  s.types = hubTypes(lib).items;

  const title = h('h1', { class: 'lfx-plus-browse__title' }, lib ? lib.name : 'Bibliothek');
  const chips = h('nav', { class: 'lfx-plus-chips', 'aria-label': 'Genres' });
  const grid = h('div', { class: 'lfx-plus-grid lfx-plus-grid--cards', role: 'list' });
  const status = h('div', { class: 'lfx-plus-browse__status' });
  const sentinel = h('div', { class: 'lfx-plus-browse__sentinel', 'aria-hidden': 'true' });
  const root = h('div', { id: ROOT_ID, class: 'lfx-plus-page lfx-plus-browse' }, [title, chips, grid, status, sentinel]);
  Object.assign(s, { root, chips, grid, status });
  tab.prepend(root);
  setPageOn(ON_CLASS, true);
  scrollTop();

  const addChip = (label, genreId) => {
    chips.append(h('a', {
      class: 'lfx-plus-chip',
      href: browseHref(s.libId, genreId),
      dataset: { genre: genreId || '' },
    }, label));
  };
  addChip('Alle', null);

  // Nachladen beim Scrollen
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore(s);
    }, { rootMargin: '800px 0px' });
    io.observe(sentinel);
    s.cleanups.push(() => io.disconnect());
  } else {
    const onScroll = () => {
      const r = sentinel.getBoundingClientRect();
      if (r.top < (window.innerHeight || 800) + 800) loadMore(s);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    s.cleanups.push(() => window.removeEventListener('scroll', onScroll));
  }

  reload(s);

  try {
    const genres = asItems(await api.getJson('/Genres', {
      userId: api.getUserId(), ParentId: s.libId, IncludeItemTypes: s.types, Recursive: true, SortBy: 'SortName',
    })).filter((g) => g && g.Id && g.Name);
    if (stale()) return;
    for (const g of genres) addChip(g.Name, g.Id);
    paintChips(s);
  } catch { /* Chips bleiben bei „Alle“ */ }
}

function begin(r) {
  dispose();
  const s = {
    libId: r.lib, genreId: r.genre || null, seq: 0, items: [], total: null, done: false, loading: false,
    info: null, cleanups: [], cancelWait: null, root: null,
  };
  state = s;
  s.cancelWait = whenHomeTab((tab) => { if (state === s) build(tab, s); });
}

export default {
  name: 'plus-browse',
  match: (route) => isTheme('plus') && isModern() && !isTv() && api.isReady() && routeOf(route) != null,
  mount(route) {
    const r = routeOf(route);
    if (r) begin(r);
  },
  update(route) {
    const r = routeOf(route);
    if (!r) return;
    if (!state || state.libId !== r.lib || !state.root || !state.root.isConnected) {
      begin(r);
      return;
    }
    if ((r.genre || null) !== state.genreId) {
      state.genreId = r.genre || null;
      reload(state);
    }
  },
  unmount: dispose,
};
