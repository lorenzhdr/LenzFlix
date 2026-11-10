// LENZ+: Suchseite (#/home?lfx=search[&q=]): großes Eingabefeld, leer = Genre-/Sammlungs-Kacheln, sonst Ergebnis-Raster.
import * as api from '../../core/api.js';
import { h } from '../../core/dom.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { putItems } from '../../core/itemstore.js';
import { parseLfxRoute, searchHref, browseHref, titleHref } from '../../shared/routes.js';
import { searchItems, getGenreTiles } from '../../shared/search.js';
import { getCollections } from '../../shared/collections.js';
import { getLibraries } from '../../shared/libraries.js';
import { getNewContentInfo, plusBadge } from '../../shared/newcontent.js';
import { whenHomeTab, setPageOn } from './title-mount.js';
import { gridCard } from './title-cards.js';

const ROOT_ID = 'lfx-plus-search';
const ON_CLASS = 'lfx-plus-search-on';
const DEBOUNCE_MS = 300;
const MIN_LEN = 2;

const LUPE = '<svg viewBox="0 0 32 32" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" aria-hidden="true" focusable="false"><circle cx="13.5" cy="13.5" r="8.5"/><path d="M20 20l8 8"/></svg>';
const X = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false"><path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/></svg>';

let state = null; // { root, input, results, term, timer, abort, seq, cleanups, cancelWait }

const routeQ = (route) => {
  const r = parseLfxRoute(route);
  return r.kind === 'search' ? (r.q || '') : null;
};

function dispose() {
  const s = state;
  state = null;
  if (s) {
    if (s.cancelWait) s.cancelWait();
    clearTimeout(s.timer);
    if (s.abort) s.abort.abort();
    for (const fn of s.cleanups.splice(0)) {
      try { fn && fn(); } catch (e) { console.error('[LenzFlix] plus-search cleanup', e); }
    }
    if (s.root) s.root.remove();
  }
  document.getElementById(ROOT_ID)?.remove();
  setPageOn(ON_CLASS, false);
}

// ---------------------------------------------------------------- Bausteine

function tile(href, label, imageUrl, { nameOnImage = true } = {}) {
  const hide = !!imageUrl && !nameOnImage;
  return h('a', { class: 'lfx-plus-tile', href, 'aria-label': label, title: label }, [
    imageUrl ? h('img', { class: 'lfx-plus-tile__img', src: imageUrl, alt: '', loading: 'lazy', decoding: 'async' }) : null,
    h('span', { class: `lfx-plus-tile__name${imageUrl ? (hide ? ' is-sr' : ' has-img') : ''}` }, label),
  ]);
}

function section(title, body, mod = '') {
  return h('section', { class: `lfx-plus-section ${mod}`.trim() }, [h('h2', { class: 'lfx-plus-section__title' }, title), body]);
}

/** Bibliothek, in der Genre-Kacheln auf die Browse-Seite verweisen (Filme, dann Serien, dann irgendeine hubfähige). */
async function genreLib() {
  try {
    const libs = await getLibraries();
    return libs.find((l) => l.collectionType === 'movies') || libs.find((l) => l.collectionType === 'tvshows') || libs.find((l) => l.hubCapable) || null;
  } catch { return null; }
}

async function renderEmpty(s, seq) {
  const stale = () => state !== s || s.seq !== seq;
  s.results.replaceChildren();
  const [lib, genres, colls] = await Promise.all([
    genreLib(),
    getGenreTiles({ limit: 16 }).catch(() => []),
    getCollections().catch(() => []),
  ]);
  if (stale()) return;
  const parts = [];
  if (genres.length) {
    parts.push(section('Genres', h('div', { class: 'lfx-plus-tilerow' }, genres.map((g) => tile(
      lib ? browseHref(lib.id, g.id) : searchHref(g.name), g.name, g.imageUrl,
    )))));
  }
  if (colls.length) {
    parts.push(section('Sammlungen', h('div', { class: 'lfx-plus-tilerow' }, colls.map((c) => tile(titleHref(c.id), c.name, c.imageUrl, { nameOnImage: false })))));
  }
  s.results.replaceChildren(...parts);
}

function personCard(p) {
  const url = api.imageUrl(p, { type: 'Primary', maxWidth: 240, quality: 85 });
  return h('a', { class: 'lfx-plus-person', href: `#/details?id=${encodeURIComponent(p.Id)}` }, [
    h('span', { class: 'lfx-plus-person__img' }, url ? [h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' })] : []),
    h('span', { class: 'lfx-plus-person__name' }, p.Name || ''),
  ]);
}

async function runSearch(s, term) {
  if (s.abort) s.abort.abort();
  const seq = ++s.seq;
  s.term = term;
  s.syncUi();
  if (term.length < MIN_LEN) {
    s.abort = null;
    s.root.removeAttribute('aria-busy');
    await renderEmpty(s, seq);
    return;
  }
  const ctl = new AbortController();
  s.abort = ctl;
  s.root.setAttribute('aria-busy', 'true');
  const stale = () => state !== s || s.seq !== seq;
  try {
    const [res, info] = await Promise.all([
      searchItems(term, { signal: ctl.signal }),
      getNewContentInfo().catch(() => null),
    ]);
    if (stale()) return;
    const titles = [...res.movies, ...res.series];
    putItems([...titles, ...res.episodes]);
    const parts = [];
    if (titles.length) {
      parts.push(section('Filme und Serien', h('div', { class: 'lfx-plus-grid lfx-plus-grid--cards', role: 'list' },
        titles.map((it) => gridCard(it, { text: true, badge: info ? plusBadge(it, info) : null })))));
    }
    if (res.episodes.length) {
      parts.push(section('Folgen', h('div', { class: 'lfx-plus-grid lfx-plus-grid--cards', role: 'list' },
        res.episodes.map((it) => gridCard(it, { text: true }))), 'lfx-plus-section--small'));
    }
    if (res.people.length) {
      parts.push(section('Personen', h('div', { class: 'lfx-plus-people' }, res.people.map(personCard)), 'lfx-plus-section--small'));
    }
    if (!parts.length) parts.push(h('p', { class: 'lfx-plus-empty' }, `Keine Ergebnisse für „${term}“.`));
    s.results.replaceChildren(...parts);
    s.root.removeAttribute('aria-busy');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    if (stale()) return;
    console.warn('[LenzFlix] plus-search fehlgeschlagen', e && e.message);
    s.results.replaceChildren(h('p', { class: 'lfx-plus-empty' }, 'Die Suche ist fehlgeschlagen.'));
    s.root.removeAttribute('aria-busy');
  }
}

function build(tab, s, q) {
  const input = h('input', {
    type: 'search',
    class: 'lfx-plus-search__input',
    placeholder: 'Titel, Charakter oder Genre suchen',
    'aria-label': 'Suche',
    autocomplete: 'off',
    spellcheck: 'false',
    value: q,
  });
  input.value = q;
  const icon = h('span', { class: 'lfx-plus-search__icon', 'aria-hidden': 'true' });
  icon.innerHTML = LUPE;
  const clear = h('button', { type: 'button', class: 'lfx-plus-search__clear', 'aria-label': 'Eingabe löschen', title: 'Löschen', hidden: !q }, []);
  clear.innerHTML = X;
  const results = h('div', { class: 'lfx-plus-search__results', 'aria-live': 'polite' });
  const field = h('div', { class: 'lfx-plus-search__field' }, [icon, input, clear]);
  const root = h('div', { id: ROOT_ID, class: 'lfx-plus-page lfx-plus-search', role: 'search' }, [field, results]);
  Object.assign(s, { root, input, results });
  s.syncUi = () => { clear.hidden = !input.value; };
  tab.prepend(root);
  setPageOn(ON_CLASS, true);

  const writeHash = (term) => {
    try {
      history.replaceState(history.state, '', searchHref(term));
    } catch { /* egal */ }
  };
  const onInput = () => {
    clearTimeout(s.timer);
    s.syncUi();
    s.timer = setTimeout(() => {
      const term = input.value.trim();
      writeHash(term);
      runSearch(s, term);
    }, DEBOUNCE_MS);
  };
  const onClear = () => {
    input.value = '';
    clearTimeout(s.timer);
    writeHash('');
    runSearch(s, '');
    input.focus();
  };
  const onKey = (e) => {
    if (e.key === 'Enter') {
      clearTimeout(s.timer);
      const term = input.value.trim();
      writeHash(term);
      runSearch(s, term);
    }
  };
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKey);
  clear.addEventListener('click', onClear);
  s.cleanups.push(() => {
    input.removeEventListener('input', onInput);
    input.removeEventListener('keydown', onKey);
    clear.removeEventListener('click', onClear);
  });
  try { input.focus({ preventScroll: true }); } catch { /* egal */ }
  runSearch(s, q.trim());
}

function begin(q) {
  dispose();
  const s = { root: null, input: null, results: null, term: null, timer: null, abort: null, seq: 0, cleanups: [], cancelWait: null, syncUi: () => {} };
  state = s;
  s.cancelWait = whenHomeTab((tab) => { if (state === s) build(tab, s, q); });
}

export default {
  name: 'plus-search',
  match: (route) => isTheme('plus') && isModern() && !isTv() && api.isReady() && routeQ(route) != null,
  mount(route) {
    begin(routeQ(route) || '');
  },
  update(route) {
    const q = routeQ(route);
    if (q == null) return;
    if (!state || !state.root || !state.root.isConnected) {
      begin(q);
      return;
    }
    // Externe Navigation (z. B. Suchfeld der Kopfzeile): nur reagieren, wenn der Begriff abweicht.
    if (q.trim() !== (state.term || '')) {
      state.input.value = q;
      clearTimeout(state.timer);
      runSearch(state, q.trim());
    }
    try { state.input.focus({ preventScroll: true }); } catch { /* egal */ }
  },
  unmount: dispose,
};
