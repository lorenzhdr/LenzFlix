// LENZPRIME: Such-Overlay (kein eigenes Feature; wird aus header.js geöffnet).
// Glas-Panel mit Eingabefeld, Textvorschlägen (Titelnamen) und Karten-Raster. Kein eigener Hash.
import { h, mountPoint, unmountPoint } from '../../core/dom.js';
import * as api from '../../core/api.js';
import { isMobile, isNarrow } from '../../core/layout.js';
import { searchItems } from '../../shared/search.js';
import { titleHref } from '../../shared/routes.js';

const ID = 'lfx-prime-search';
const DEBOUNCE_MS = 300;
const MAX_CARDS = 8;
const MAX_CARDS_MOBILE = 18; // 3-Spalten-Raster, 6 Reihen
const MAX_SUGGESTIONS = 5;
const MIN_LEN = 2;

const SVG_NS = 'http://www.w3.org/2000/svg';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled])';

let cur = null;

function searchIcon() {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'lfx-prime-search__icon');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', 'M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.3 4.3-1.4 1.4-4.3-4.3A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z');
  svg.append(p);
  return svg;
}

function formatRuntime(ticks) {
  const min = Math.round((Number(ticks) || 0) / 600000000);
  if (!min) return '';
  return min >= 60 ? `${Math.floor(min / 60)} Std. ${min % 60} Min.` : `${min} Min.`;
}

function metaOf(item) {
  const parts = [];
  if (item.ProductionYear) parts.push(String(item.ProductionYear));
  if (item.Type === 'Movie') {
    const rt = formatRuntime(item.RunTimeTicks);
    if (rt) parts.push(rt);
  } else if (item.Type === 'Series') {
    parts.push('Serie');
  }
  return parts.join(' · ');
}

function card(item, close, mobile = false) {
  // Handy: Poster (2:3) im 3-Spalten-Raster, sonst 16:9
  const url = (mobile && api.imageUrl(item, { type: 'Primary', maxWidth: 300, quality: 85 })) || api.landscapeImage(item, { maxWidth: 400 });
  const a = h('a', {
    class: 'lfx-prime-search__card',
    href: titleHref(item.Id),
    dataset: { id: item.Id },
  }, [
    h('span', { class: 'lfx-prime-search__thumb' }, url
      ? h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async' })
      : null),
    h('span', { class: 'lfx-prime-search__title' }, item.Name || ''),
    mobile ? null : h('span', { class: 'lfx-prime-search__meta' }, metaOf(item)),
  ]);
  a.addEventListener('click', () => close());
  return a;
}

export function isPrimeSearchOpen() {
  return cur !== null;
}

export function closePrimeSearch({ restoreFocus = true } = {}) {
  const c = cur;
  if (!c) return;
  cur = null;
  clearTimeout(c.timer);
  if (c.ctrl) c.ctrl.abort();
  document.removeEventListener('keydown', c.onKeydown, true);
  window.removeEventListener('hashchange', c.onHash);
  unmountPoint(c.root);
  document.documentElement.classList.remove('lfx-prime-search-open');
  const back = c.returnFocus;
  if (restoreFocus && back && back.isConnected && typeof back.focus === 'function') {
    try {
      back.focus({ preventScroll: true });
    } catch { /* Fokus ist optional */ }
  }
}

/** opts.returnFocus: Element, das beim Schließen den Fokus zurückbekommt (Standard: vorheriges activeElement). */
export function openPrimeSearch({ returnFocus } = {}) {
  if (cur) {
    cur.input.focus();
    return;
  }
  const prev = returnFocus || (document.activeElement && document.activeElement !== document.body ? document.activeElement : null);
  const mobile = isMobile() && isNarrow();
  const root = mountPoint(ID, { className: `lfx-prime-search${mobile ? ' lfx-prime-search--full' : ''}` });
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-label', 'Suche');

  const input = h('input', {
    class: 'lfx-prime-search__input',
    type: 'search',
    placeholder: 'Suchen',
    autocomplete: 'off',
    spellcheck: 'false',
    'aria-label': 'Suchen',
  });
  const clear = h('button', { type: 'button', class: 'lfx-prime-search__clear', hidden: true }, 'Löschen');
  const cancel = mobile ? h('button', { type: 'button', class: 'lfx-prime-search__cancel' }, 'Abbrechen') : null;
  const form = h('form', { class: 'lfx-prime-search__form', role: 'search' }, [searchIcon(), input, clear]);
  const head = mobile ? h('div', { class: 'lfx-prime-search__head' }, [form, cancel]) : form;
  const suggest = h('ul', { class: 'lfx-prime-search__suggest', 'aria-label': 'Vorschläge' });
  const grid = h('div', { class: 'lfx-prime-search__grid' });
  const status = h('p', { class: 'lfx-prime-search__status', role: 'status' });
  const panel = h('div', { class: 'lfx-prime-search__panel' }, [head, suggest, status, grid]);
  root.replaceChildren(panel);

  const c = { root, input, panel, timer: null, ctrl: null, returnFocus: prev, seq: 0 };
  cur = c;
  const close = () => closePrimeSearch();

  const reset = () => {
    suggest.replaceChildren();
    grid.replaceChildren();
    status.textContent = '';
  };

  const run = async (term) => {
    if (c.ctrl) c.ctrl.abort();
    const seq = ++c.seq;
    if (term.length < MIN_LEN) {
      c.ctrl = null;
      reset();
      return;
    }
    const ctrl = new AbortController();
    c.ctrl = ctrl;
    try {
      const res = await searchItems(term, { limit: 24, signal: ctrl.signal });
      if (cur !== c || seq !== c.seq || ctrl.signal.aborted) return;
      const items = [...res.movies, ...res.series];
      suggest.replaceChildren(...items.slice(0, MAX_SUGGESTIONS).map((it) => {
        const a = h('a', { class: 'lfx-prime-search__sug', href: titleHref(it.Id) }, it.Name || '');
        a.addEventListener('click', close);
        return h('li', null, a);
      }));
      grid.replaceChildren(...items.slice(0, mobile ? MAX_CARDS_MOBILE : MAX_CARDS).map((it) => card(it, close, mobile)));
      status.textContent = items.length ? '' : `Keine Treffer für „${term}“.`;
    } catch (e) {
      if (e && e.name === 'AbortError') return;
      if (cur !== c || seq !== c.seq) return;
      reset();
      status.textContent = 'Die Suche ist fehlgeschlagen.';
    }
  };

  input.addEventListener('input', () => {
    clear.hidden = input.value === '';
    clearTimeout(c.timer);
    c.timer = setTimeout(() => run(input.value.trim()), DEBOUNCE_MS);
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    clearTimeout(c.timer);
    run(input.value.trim());
  });
  clear.addEventListener('click', () => {
    input.value = '';
    clear.hidden = true;
    clearTimeout(c.timer);
    run('');
    input.focus();
  });
  if (cancel) cancel.addEventListener('click', () => close());
  root.addEventListener('mousedown', (e) => {
    if (!panel.contains(e.target)) close();
  });

  c.onKeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      close();
    } else if (e.key === 'Tab') {
      const list = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => !el.hidden);
      if (!list.length) return;
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (!panel.contains(active)) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };
  c.onHash = () => closePrimeSearch({ restoreFocus: false });
  document.addEventListener('keydown', c.onKeydown, true);
  window.addEventListener('hashchange', c.onHash);
  document.documentElement.classList.add('lfx-prime-search-open');
  input.focus({ preventScroll: true });
}
