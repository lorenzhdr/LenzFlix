// LENZ//84: Suche als Kommandozeile (#/home?lfx=search[&q=]). Gehört Worker P2.
// "SUCHE> " + echte Eingabe mit Block-Cursor, Ergebnisse als Kassetten-Raster gruppiert (// FILME, // SERIEN, // EPISODEN, // PERSONEN).
// Leer: Vorschläge (Genres, Sammlungen) und neue Titel. Daten: shared/search.js.
import * as api from '../../core/api.js';
import { h } from '../../core/dom.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { putItems } from '../../core/itemstore.js';
import { parseLfxRoute, searchHref, browseHref, titleHref } from '../../shared/routes.js';
import { searchItems, getGenreTiles } from '../../shared/search.js';
import { getCollections } from '../../shared/collections.js';
import { getLibraries } from '../../shared/libraries.js';
import { BASE_PARAMS } from '../rows/logic.js';
import { createTapeCard } from './card.js';
import { emitFx } from './prefs.js';
import { whenHomeTab, setPageOn, throttle } from './title-mount.js';

const ROOT_ID = 'lfx-retro-search';
const ON_CLASS = 'lfx-retro-search-on';
const DEBOUNCE_MS = 300;
const MIN_LEN = 2;

let state = null; // { root, input, results, term, timer, abort, seq, cleanups, cancelWait, syncUi }

const asItems = (res) => (Array.isArray(res) ? res : (res && Array.isArray(res.Items) ? res.Items : []));

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
      try { fn && fn(); } catch (e) { console.error('[LenzFlix] retro-search cleanup', e); }
    }
    if (s.root) s.root.remove();
  }
  document.getElementById(ROOT_ID)?.remove();
  setPageOn(ON_CLASS, false);
}

// ---------------------------------------------------------------- Bausteine

function group(title, body, mod = '') {
  return h('section', { class: `lfx-rs__group ${mod}`.trim() }, [h('h2', { class: 'lfx-retro-label' }, title), body]);
}

const grid = (cards) => h('div', { class: 'lfx-rs__grid', role: 'list' }, cards);

function personRow(p) {
  const url = api.imageUrl(p, { type: 'Primary', maxWidth: 160, quality: 80 });
  return h('a', { class: 'lfx-rs__person', href: `#/details?id=${encodeURIComponent(p.Id)}` }, [
    h('span', { class: 'lfx-rs__person-img' }, url ? [h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' })] : []),
    h('span', { class: 'lfx-rs__person-name' }, p.Name || ''),
  ]);
}

/** Bibliothek, in der Genre-Optionen auf die Bibliotheksseite verweisen. */
async function genreLib() {
  try {
    const libs = await getLibraries();
    return libs.find((l) => l.collectionType === 'movies') || libs.find((l) => l.collectionType === 'tvshows') || libs.find((l) => l.hubCapable) || null;
  } catch { return null; }
}

async function renderStart(s, seq) {
  const stale = () => state !== s || s.seq !== seq;
  s.results.replaceChildren(h('p', { class: 'lfx-rs__hint lfx-retro-caret' }, 'BEREIT'));
  s.count.textContent = '';
  const [lib, genres, colls, latest] = await Promise.all([
    genreLib(),
    getGenreTiles({ limit: 18 }).catch(() => []),
    getCollections().catch(() => []),
    api.getItems({
      ...BASE_PARAMS, IncludeItemTypes: 'Movie,Series', Recursive: true, SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 14,
    }).then(asItems).catch(() => []),
  ]);
  if (stale()) return;
  const parts = [];
  if (genres.length) {
    parts.push(group('Vorschläge', h('div', { class: 'lfx-rs__opts' }, genres.map((g) => h('a', {
      class: 'lfx-retro-btn lfx-rs__opt', href: lib ? browseHref(lib.id, g.id) : searchHref(g.name),
    }, g.name)))));
  }
  if (colls.length) {
    parts.push(group('Sammlungen', h('div', { class: 'lfx-rs__opts' }, colls.map((c) => h('a', { class: 'lfx-retro-btn lfx-rs__opt', href: titleHref(c.id) }, c.name)))));
  }
  if (latest.length) {
    putItems(latest);
    parts.push(group('Neu im Regal', grid(latest.map((it) => createTapeCard(it, { variant: 'cover' }))), 'lfx-rs__group--new'));
  }
  s.results.replaceChildren(...(parts.length ? parts : [h('p', { class: 'lfx-rs__hint lfx-retro-caret' }, 'BEREIT')]));
}

async function runSearch(s, term) {
  if (s.abort) s.abort.abort();
  const seq = ++s.seq;
  s.term = term;
  s.syncUi();
  if (term.length < MIN_LEN) {
    s.abort = null;
    s.root.removeAttribute('aria-busy');
    await renderStart(s, seq);
    return;
  }
  const ctl = new AbortController();
  s.abort = ctl;
  s.root.setAttribute('aria-busy', 'true');
  s.count.textContent = 'SUCHE LÄUFT…';
  const stale = () => state !== s || s.seq !== seq;
  try {
    const res = await searchItems(term, { signal: ctl.signal });
    if (stale()) return;
    putItems([...res.movies, ...res.series, ...res.episodes]);
    const parts = [];
    if (res.movies.length) parts.push(group('Filme', grid(res.movies.map((it) => createTapeCard(it, { variant: 'cover' })))));
    if (res.series.length) parts.push(group('Serien', grid(res.series.map((it) => createTapeCard(it, { variant: 'cover' })))));
    if (res.episodes.length) parts.push(group('Episoden', grid(res.episodes.map((it) => createTapeCard(it, { variant: 'wide' }))), 'lfx-rs__group--wide'));
    if (res.people.length) parts.push(group('Personen', h('div', { class: 'lfx-rs__people' }, res.people.map(personRow))));
    const total = res.movies.length + res.series.length + res.episodes.length + res.people.length;
    if (!parts.length) {
      parts.push(h('p', { class: 'lfx-rs__empty lfx-retro-caret' }, 'KEINE TREFFER. VERSUCHE ES ERNEUT'));
      emitFx('error');
    }
    s.count.textContent = total ? `${total} TREFFER` : '0 TREFFER';
    s.results.replaceChildren(...parts);
    s.root.removeAttribute('aria-busy');
  } catch (e) {
    if (e && e.name === 'AbortError') return;
    if (stale()) return;
    console.warn('[LenzFlix] retro-search fehlgeschlagen', e && e.message);
    emitFx('error');
    s.count.textContent = '';
    s.results.replaceChildren(h('p', { class: 'lfx-rs__empty lfx-retro-caret' }, 'FEHLER: DIE SUCHE IST FEHLGESCHLAGEN'));
    s.root.removeAttribute('aria-busy');
  }
}

function build(tab, s, q) {
  const input = h('input', {
    type: 'text',
    class: 'lfx-rs__input',
    placeholder: 'TITEL, SERIE ODER GENRE',
    'aria-label': 'Suche',
    autocomplete: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    enterkeyhint: 'search',
    value: q,
  });
  input.value = q;
  const caret = h('span', { class: 'lfx-rs__caret', 'aria-hidden': 'true' });
  const clear = h('button', { type: 'button', class: 'lfx-rs__clear', 'aria-label': 'Eingabe löschen', title: 'Löschen', hidden: !q }, 'ESC');
  const cmd = h('div', { class: 'lfx-rs__cmd lfx-retro-frame' }, [
    h('span', { class: 'lfx-rs__prompt', 'aria-hidden': 'true' }, 'SUCHE>'),
    h('span', { class: 'lfx-rs__field' }, [input, caret]),
    clear,
  ]);
  const count = h('p', { class: 'lfx-rs__count', 'aria-live': 'polite' });
  const results = h('div', { class: 'lfx-rs__results' });
  const root = h('div', { id: ROOT_ID, class: 'lfx-retro-page lfx-rs', role: 'search' }, [
    h('p', { class: 'lfx-rs__banner', 'aria-hidden': 'true' }, 'LENZ//84 RECHERCHE-TERMINAL  ·  ENTER = SUCHEN'),
    cmd, count, results,
  ]);
  Object.assign(s, { root, input, results, count });
  // Block-Cursor an der Eingabeposition (Monospace: ch-Einheiten)
  const placeCaret = () => {
    const pos = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
    cmd.style.setProperty('--rs-pos', String(Math.min(pos, 60)));
    cmd.classList.toggle('is-empty', !input.value);
  };
  s.syncUi = () => {
    clear.hidden = !input.value;
    placeCaret();
  };
  tab.prepend(root);
  setPageOn(ON_CLASS, true);

  const writeHash = (term) => {
    try {
      history.replaceState(history.state, '', searchHref(term));
    } catch { /* egal */ }
  };
  const tick = throttle(() => emitFx('type'), 70);
  const onInput = () => {
    clearTimeout(s.timer);
    s.syncUi();
    tick();
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
      emitFx('click');
      const term = input.value.trim();
      writeHash(term);
      runSearch(s, term);
    } else if (e.key === 'Escape' && input.value) {
      e.stopPropagation();
      onClear();
    }
  };
  const onCaret = () => placeCaret();
  input.addEventListener('input', onInput);
  input.addEventListener('keydown', onKey);
  input.addEventListener('keyup', onCaret);
  input.addEventListener('click', onCaret);
  input.addEventListener('focus', onCaret);
  clear.addEventListener('click', onClear);
  s.cleanups.push(() => {
    input.removeEventListener('input', onInput);
    input.removeEventListener('keydown', onKey);
    input.removeEventListener('keyup', onCaret);
    input.removeEventListener('click', onCaret);
    input.removeEventListener('focus', onCaret);
    clear.removeEventListener('click', onClear);
  });
  s.syncUi();
  try { input.focus({ preventScroll: true }); } catch { /* egal */ }
  runSearch(s, q.trim());
}

function begin(q) {
  dispose();
  const s = {
    root: null, input: null, results: null, count: null, term: null, timer: null, abort: null, seq: 0,
    cleanups: [], cancelWait: null, syncUi: () => {},
  };
  state = s;
  s.cancelWait = whenHomeTab((tab) => { if (state === s) build(tab, s, q); });
}

export default {
  name: 'retro-search',
  match: (route) => isTheme('retro') && isModern() && !isTv() && api.isReady() && routeQ(route) != null,
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
