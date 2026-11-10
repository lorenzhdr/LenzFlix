// LENZ//84: Bibliothek als Verzeichnis-Listing (#/home?lfx=browse&lib=<id>[&genre=<id>]). Gehört Worker P2.
// Kopf "DIR C:\FILME\", Zähler "342 DATEI(EN)", Terminal-Optionen /S:NAME /S:DATUM /S:WERTUNG /F:GENRE /V:RASTER|LISTE,
// Raster aus Cover-Kassetten oder Zeilenliste, endloses Nachladen per IntersectionObserver.
// (Die Hub-Ansicht #/home?lfx=hub gehört zur Startseite, nicht zu dieser Datei.)
import * as api from '../../core/api.js';
import { h } from '../../core/dom.js';
import { isMobile, isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { putItems } from '../../core/itemstore.js';
import { parseLfxRoute, browseHref, titleHref } from '../../shared/routes.js';
import { getLibraries } from '../../shared/libraries.js';
import { hubTypes } from '../../shared/hub.js';
import { BASE_PARAMS } from '../rows/logic.js';
import { createTapeCard } from './card.js';
import { emitFx } from './prefs.js';
import { whenHomeTab, setPageOn, scrollTop } from './title-mount.js';

const ROOT_ID = 'lfx-retro-browse';
const ON_CLASS = 'lfx-retro-browse-on';
const PAGE = 40;
const VIEW_KEY = 'lfx.retro.browseview';

export const SORTS = {
  name: { label: 'NAME', by: 'SortName', order: 'Ascending' },
  date: { label: 'DATUM', by: 'DateCreated', order: 'Descending' },
  rating: { label: 'WERTUNG', by: 'CommunityRating,SortName', order: 'Descending' },
};

let state = null; // { libId, genreId, sort, view, seq, items, total, done, loading, root, ..., cleanups, cancelWait }

const routeOf = (route) => {
  const r = parseLfxRoute(route);
  return r.kind === 'browse' && r.lib ? { lib: r.lib, genre: r.genre } : null;
};

const asItems = (res) => (Array.isArray(res) ? res : (res && Array.isArray(res.Items) ? res.Items : []));

/** Dateiname im Listing: TITEL.MOV / SERIE.SER / CLIP.VID (nur Großbuchstaben, Ziffern, Leerzeichen und Umlaute). */
export function fileName(item) {
  const base = String(item.Name || '').toUpperCase().replace(/[^A-Z0-9ÄÖÜß \-_.]/g, '').trim() || 'OHNE NAME';
  const ext = item.Type === 'Series' ? 'SER' : item.Type === 'BoxSet' ? 'BOX' : item.Type === 'Movie' ? 'MOV' : 'VID';
  return `${base}.${ext}`;
}

/** 1H57 / 45M / "--" */
export function runtimeShort(ticks) {
  const mins = Math.round((Number(ticks) || 0) / 600_000_000);
  if (mins < 1) return '--';
  const hh = Math.floor(mins / 60);
  return hh ? `${hh}H${String(mins % 60).padStart(2, '0')}` : `${mins}M`;
}

function readView() {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch { return 'grid'; }
}

function dispose() {
  const s = state;
  state = null;
  if (s) {
    if (s.cancelWait) s.cancelWait();
    for (const fn of s.cleanups.splice(0)) {
      try { fn && fn(); } catch (e) { console.error('[LenzFlix] retro-browse cleanup', e); }
    }
    if (s.root) s.root.remove();
  }
  document.getElementById(ROOT_ID)?.remove();
  setPageOn(ON_CLASS, false);
}

function listRow(it) {
  const genre = (it.Genres && it.Genres[0]) || '';
  return h('a', {
    class: 'lfx-rb__row', href: titleHref(it.Id), role: 'listitem',
    'aria-label': [it.Name, it.ProductionYear].filter(Boolean).join(', '),
  }, [
    h('span', { class: 'lfx-rb__row-name' }, fileName(it)),
    h('span', { class: 'lfx-rb__row-year' }, it.ProductionYear ? String(it.ProductionYear) : '----'),
    h('span', { class: 'lfx-rb__row-time' }, it.Type === 'Series' ? (it.ChildCount ? `${it.ChildCount}S` : '--') : runtimeShort(it.RunTimeTicks)),
    h('span', { class: 'lfx-rb__row-genre' }, genre.toUpperCase()),
  ]);
}

function itemNode(s, it) {
  return s.view === 'list' && !isMobile() ? listRow(it) : createTapeCard(it, { variant: 'cover' });
}

function paintHead(s) {
  const lib = s.libName || 'BIBLIOTHEK';
  const genre = s.genreName ? `${s.genreName.toUpperCase()}\\` : '';
  s.path.textContent = `DIR C:\\${lib.toUpperCase()}\\${genre}`;
  if (s.total != null) s.count.textContent = `${s.total} DATEI(EN)`;
  else s.count.textContent = s.loading ? 'LESE VERZEICHNIS…' : '';
  // Optionen
  for (const b of s.opts.querySelectorAll('[data-sort]')) {
    const on = b.dataset.sort === s.sort;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  for (const b of s.opts.querySelectorAll('[data-view]')) {
    const on = b.dataset.view === s.view;
    b.classList.toggle('is-on', on);
    b.setAttribute('aria-pressed', String(on));
  }
  s.genreBtn.classList.toggle('is-on', Boolean(s.genreId));
  s.grid.classList.toggle('is-list', s.view === 'list' && !isMobile());
  s.grid.setAttribute('role', 'list');
  for (const chip of s.genres.querySelectorAll('.lfx-rb__genre')) {
    const on = (chip.dataset.genre || '') === (s.genreId || '');
    chip.classList.toggle('is-active', on);
    if (on) chip.setAttribute('aria-current', 'true');
    else chip.removeAttribute('aria-current');
  }
}

/** Setzt den Listen-Zustand zurück und lädt die erste Seite. */
function reload(s) {
  s.seq += 1;
  s.items = [];
  s.total = null;
  s.done = false;
  s.loading = false;
  s.grid.replaceChildren();
  s.status.replaceChildren();
  paintHead(s);
  loadMore(s);
}

async function loadMore(s) {
  if (state !== s || s.loading || s.done) return;
  const seq = s.seq;
  s.loading = true;
  s.root.setAttribute('aria-busy', 'true');
  paintHead(s);
  const stale = () => state !== s || s.seq !== seq;
  const sort = SORTS[s.sort] || SORTS.name;
  try {
    const res = await api.getItems({
      ...BASE_PARAMS,
      ParentId: s.libId,
      IncludeItemTypes: s.types,
      Recursive: true,
      SortBy: sort.by,
      SortOrder: sort.order,
      GenreIds: s.genreId || undefined,
      StartIndex: s.items.length,
      Limit: PAGE,
    });
    if (stale()) return;
    const items = asItems(res);
    putItems(items);
    s.total = res && typeof res.TotalRecordCount === 'number' ? res.TotalRecordCount : null;
    s.items.push(...items);
    for (const it of items) s.grid.append(itemNode(s, it));
    s.done = items.length < PAGE || (s.total != null && s.items.length >= s.total);
    if (s.total == null) s.total = s.done ? s.items.length : null;
    if (!s.items.length) s.status.replaceChildren(h('p', { class: 'lfx-rb__empty lfx-retro-caret' }, 'DATEI NICHT GEFUNDEN'));
    else if (s.done) s.status.replaceChildren(h('p', { class: 'lfx-rb__end' }, `${s.items.length} DATEI(EN)  ·  ENDE DES VERZEICHNISSES`));
  } catch (e) {
    if (stale()) return;
    console.warn('[LenzFlix] retro-browse konnte nicht laden', e && e.message);
    emitFx('error');
    s.done = true;
    s.status.replaceChildren(
      h('p', { class: 'lfx-rb__empty' }, 'LESEFEHLER IN LAUFWERK C:'),
      h('button', { type: 'button', class: 'lfx-retro-btn', onclick: () => { s.done = false; s.status.replaceChildren(); loadMore(s); } }, 'Erneut versuchen'),
    );
  } finally {
    if (!stale()) {
      s.loading = false;
      s.root.removeAttribute('aria-busy');
      paintHead(s);
    }
  }
}

/** Wechselt Raster/Liste ohne Neuladen. */
function rerender(s) {
  s.grid.replaceChildren(...s.items.map((it) => itemNode(s, it)));
  paintHead(s);
}

async function build(tab, s) {
  const stale = () => state !== s;
  let lib = null;
  try {
    lib = (await getLibraries()).find((l) => l.id === s.libId) || null;
  } catch { /* Name fällt auf Standard zurück */ }
  if (stale()) return;
  s.types = hubTypes(lib).items;
  s.libName = lib ? lib.name : 'Bibliothek';

  const path = h('h1', { class: 'lfx-rb__path lfx-retro-glow--strong' });
  const count = h('p', { class: 'lfx-rb__count', 'aria-live': 'polite' });
  const optBtn = (attrs, label, onClick) => {
    const b = h('button', { type: 'button', class: 'lfx-rb__opt', ...attrs }, label);
    b.addEventListener('click', () => {
      emitFx('click');
      onClick(b);
    });
    return b;
  };
  const genreBtn = optBtn({ 'aria-expanded': 'false' }, '/F:GENRE', (b) => {
    const open = genres.hidden;
    genres.hidden = !open;
    b.setAttribute('aria-expanded', String(open));
  });
  const opts = h('div', { class: 'lfx-rb__opts', role: 'toolbar', 'aria-label': 'Anzeigeoptionen' }, [
    ...Object.entries(SORTS).map(([key, v]) => optBtn({ dataset: { sort: key } }, `/S:${v.label}`, () => {
      if (s.sort === key) return;
      s.sort = key;
      reload(s);
    })),
    genreBtn,
    h('span', { class: 'lfx-rb__opts-sep', 'aria-hidden': 'true' }),
    optBtn({ dataset: { view: 'grid' }, class: 'lfx-rb__opt lfx-rb__opt--view' }, '/V:RASTER', () => {
      if (s.view === 'grid') return;
      s.view = 'grid';
      try { window.localStorage.setItem(VIEW_KEY, 'grid'); } catch { /* egal */ }
      rerender(s);
    }),
    optBtn({ dataset: { view: 'list' }, class: 'lfx-rb__opt lfx-rb__opt--view' }, '/V:LISTE', () => {
      if (s.view === 'list') return;
      s.view = 'list';
      try { window.localStorage.setItem(VIEW_KEY, 'list'); } catch { /* egal */ }
      rerender(s);
    }),
  ]);
  const genres = h('nav', { class: 'lfx-rb__genres', 'aria-label': 'Genres', hidden: true });
  const grid = h('div', { class: 'lfx-rb__grid', role: 'list' });
  const status = h('div', { class: 'lfx-rb__status' });
  const sentinel = h('div', { class: 'lfx-rb__sentinel', 'aria-hidden': 'true' });
  const root = h('div', { id: ROOT_ID, class: 'lfx-retro-page lfx-rb' }, [
    h('header', { class: 'lfx-rb__head' }, [path, count]),
    opts, genres, grid, status, sentinel,
  ]);
  Object.assign(s, { root, path, count, opts, genres, genreBtn, grid, status });
  tab.prepend(root);
  setPageOn(ON_CLASS, true);
  scrollTop();

  const addGenre = (label, genreId) => {
    genres.append(h('a', {
      class: 'lfx-rb__genre', href: browseHref(s.libId, genreId), dataset: { genre: genreId || '' },
    }, label));
  };
  addGenre('ALLE', null);

  // Endloses Nachladen
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore(s);
    }, { rootMargin: '900px 0px' });
    io.observe(sentinel);
    s.cleanups.push(() => io.disconnect());
  } else {
    const onScroll = () => {
      const r = sentinel.getBoundingClientRect();
      if (r.top < (window.innerHeight || 800) + 900) loadMore(s);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    s.cleanups.push(() => window.removeEventListener('scroll', onScroll));
  }

  reload(s);

  try {
    const list = asItems(await api.getJson('/Genres', {
      userId: api.getUserId(), ParentId: s.libId, IncludeItemTypes: s.types, Recursive: true, SortBy: 'SortName',
    })).filter((g) => g && g.Id && g.Name);
    if (stale()) return;
    for (const g of list) addGenre(g.Name, g.Id);
    const hit = list.find((g) => g.Id === s.genreId);
    s.genreName = hit ? hit.Name : null;
    paintHead(s);
  } catch { /* Genres bleiben bei „Alle“ */ }
}

function begin(r) {
  dispose();
  const s = {
    libId: r.lib, genreId: r.genre || null, genreName: null, libName: '', sort: 'name', view: readView(),
    seq: 0, items: [], total: null, done: false, loading: false, cleanups: [], cancelWait: null, root: null,
  };
  state = s;
  s.cancelWait = whenHomeTab((tab) => { if (state === s) build(tab, s); });
}

export default {
  name: 'retro-browse',
  match: (route) => isTheme('retro') && isModern() && !isTv() && api.isReady() && routeOf(route) != null,
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
      const chip = state.genres.querySelector(`.lfx-rb__genre[data-genre="${state.genreId || ''}"]`);
      state.genreName = chip && state.genreId ? chip.textContent : null;
      reload(state);
    }
  },
  unmount: dispose,
};
