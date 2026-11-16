// LenzFlix library: wiederverwendbares Raster mit Nachladen (Serien/Filme/Meine Liste). Markup: .lfx-grid > .lfx-grid__list.
// Option cacheKey: (sort) => string|null – Schlüssel (home:…, muss die Query enthalten) für die ERSTE Seite; bei
// Treffer (10 min, core/cache.js) zeichnet das Raster synchron ohne Skelett/Abruf, die ersten 12 Karten laden Bilder
// sofort (eager). Folgeseiten sind ungecacht. Ohne cacheKey (Meine Liste) unverändertes Verhalten.
// cardFactory(item, { eager }) bekommt als zweites Argument die Eager-Angabe.
import * as api from '../../core/api.js';
import { h } from '../../core/dom.js';
import { putItems } from '../../core/itemstore.js';
import { isDataSaver } from '../../core/datasaver.js';
import { cached, peekCached, HOME_TTL } from '../../core/cache.js';
import { BASE_PARAMS } from '../rows/logic.js';
import { createCard } from '../rows/card.js';

const asItems = (res) => (Array.isArray(res) ? res : (res && Array.isArray(res.Items) ? res.Items : []));

/** Sortier-Parameter; bei reinem Serien-Query zählt „neu“ als letzter Zuwachs (DateLastContentAdded). */
export function sortParams(sort, query) {
  switch (sort) {
    case 'za': return { SortBy: 'SortName', SortOrder: 'Descending' };
    case 'new': {
      const seriesOnly = String((query && query.IncludeItemTypes) || '') === 'Series';
      return { SortBy: seriesOnly ? 'DateLastContentAdded' : 'DateCreated', SortOrder: 'Descending' };
    }
    case 'year': return { SortBy: 'ProductionYear,SortName', SortOrder: 'Descending,Ascending' };
    default: return { SortBy: 'SortName', SortOrder: 'Ascending' };
  }
}

const EAGER_CARDS = 12;
const defaultCard = (item, o) => createCard(item, { kind: 'landscape', eager: !!(o && o.eager) });

export function createGrid(opts = {}) {
  const pageSize = opts.pageSize || 40;
  const cardFactory = opts.cardFactory || defaultCard;
  const emptyText = opts.emptyText || 'Keine Titel gefunden.';
  let query = opts.query || {};
  let sort = opts.sort || 'az';
  let seq = 0;
  let count = 0;
  let done = false;
  let loading = false;
  let destroyed = false;
  let failed = false;
  let total = null;

  const list = h('div', { class: 'lfx-grid__list', role: 'list' });
  const status = h('div', { class: 'lfx-grid__status' });
  const sentinel = h('div', { class: 'lfx-grid__more', 'aria-hidden': 'true' });
  const el = h('div', { class: 'lfx-grid' }, [list, status, sentinel]);

  const margin = isDataSaver('lazy') ? 100 : 800;
  let io = null;
  let onScroll = null;
  const check = () => {
    if (destroyed || loading || done || failed) return;
    const r = sentinel.getBoundingClientRect();
    if (r.top < (window.innerHeight || 800) + margin) loadMore();
  };
  if (typeof IntersectionObserver === 'function') {
    io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) loadMore();
    }, { rootMargin: `${margin}px 0px` });
    io.observe(sentinel);
  } else {
    onScroll = check;
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  /** Nach einer Seite erneut prüfen: bleibt der Sentinel sichtbar, feuert der Observer sonst nicht noch einmal. */
  const recheck = () => {
    if (destroyed || done) return;
    if (io) { io.unobserve(sentinel); io.observe(sentinel); } else check();
  };

  function skeleton() {
    status.replaceChildren(h('div', { class: 'lfx-grid__skel', 'aria-hidden': 'true' }));
  }

  function reset() {
    seq += 1;
    count = 0;
    done = false;
    loading = false;
    failed = false;
    list.replaceChildren();
    status.replaceChildren();
    el.removeAttribute('aria-busy');
    loadMore();
  }

  /** Schlüssel des Seiten-1-Caches für die aktuelle Sortierung (null = ungecacht). */
  const pageKey = () => {
    if (typeof opts.cacheKey !== 'function') return null;
    try { return opts.cacheKey(sort) || null; } catch { return null; }
  };

  /** Zeichnet eine Antwort: Karten anhängen, Zähler/Ende/Leerhinweis/onCount. */
  function applyPage(res, { eager = false } = {}) {
    const items = asItems(res);
    putItems(items);
    total = res && typeof res.TotalRecordCount === 'number' ? res.TotalRecordCount : null;
    status.replaceChildren();
    items.forEach((it, i) => {
      const card = cardFactory(it, { eager: eager && count + i < EAGER_CARDS });
      if (card) list.append(h('div', { class: 'lfx-grid__item', role: 'presentation' }, [card]));
    });
    count += items.length;
    done = items.length < pageSize || (total != null && count >= total);
    if (!count) status.replaceChildren(h('p', { class: 'lfx-grid__empty' }, emptyText));
    if (typeof opts.onCount === 'function') opts.onCount(total != null ? total : count);
  }

  async function loadMore() {
    if (destroyed || loading || done || failed) return;
    const key = !count ? pageKey() : null;
    if (key) {
      // Synchroner Treffer: erste Seite sofort zeichnen, kein Skelett, kein Server-Abruf.
      const hit = peekCached(key);
      if (hit !== undefined) {
        applyPage(hit, { eager: true });
        recheck();
        return;
      }
    }
    const mySeq = seq;
    loading = true;
    el.setAttribute('aria-busy', 'true');
    if (!count) skeleton();
    const stale = () => destroyed || seq !== mySeq;
    try {
      const fetchPage = () => api.getItems({
        ...BASE_PARAMS,
        Recursive: true,
        ...query,
        ...sortParams(sort, query),
        EnableTotalRecordCount: true,
        StartIndex: count,
        Limit: pageSize,
      });
      const res = await (key ? cached(key, fetchPage, HOME_TTL) : fetchPage());
      if (stale()) return;
      applyPage(res);
    } catch (e) {
      if (stale()) return;
      console.warn('[LenzFlix] Raster konnte nicht laden', e && e.message);
      failed = true;
      status.replaceChildren(
        h('p', { class: 'lfx-grid__empty' }, 'Titel konnten nicht geladen werden.'),
        h('button', {
          type: 'button',
          class: 'lfx-grid__retry',
          onclick: () => { failed = false; status.replaceChildren(); loadMore(); },
        }, 'Erneut versuchen'),
      );
    } finally {
      if (!stale()) {
        loading = false;
        el.removeAttribute('aria-busy');
        if (!failed) recheck();
      }
    }
  }

  reset();

  return {
    el,
    setSort(next) {
      const s = next || 'az';
      if (s === sort) return;
      sort = s;
      reset();
    },
    /** Optional mit neuer Sortierung: genau ein Neuaufbau. */
    setQuery(next, nextSort) {
      query = next || {};
      if (nextSort) sort = nextSort;
      reset();
    },
    /** n Karten wurden außerhalb entfernt (z. B. Favorit weg): Nachlade-Versatz und Zähler nachführen. */
    drop(n) {
      count = Math.max(0, count - n);
      if (total != null) total = Math.max(0, total - n);
      if (typeof opts.onCount === 'function') opts.onCount(total != null ? total : count);
    },
    refresh: reset,
    destroy() {
      destroyed = true;
      seq += 1;
      if (io) io.disconnect();
      if (onScroll) window.removeEventListener('scroll', onScroll);
      el.remove();
    },
  };
}
