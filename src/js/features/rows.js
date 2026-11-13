// LenzFlix: Netflix-Zeilen der Startseite (Feature "rows"). Rendert in #lfx-rows.
// Zeilen laden lazy (IntersectionObserver); Fehler lassen die Zeile still weg.
import * as api from '../core/api.js';
import { h } from '../core/dom.js';
import { putItems } from '../core/itemstore.js';
import { onItemsChanged } from '../core/itemmenu.js';
import { peekCached } from '../core/cache.js';
import { createCard, setCardBadge } from './rows/card.js';
import { badgeFor } from './rows/logic.js';
import { attachScroller, chevronButton } from './rows/scroller.js';
import { startRowPrefetch } from './rows/prefetch.js';
import { buildRowDefs, getNewSeriesIds, peekNewSeriesIds, peekRowDefs } from './rows/sources.js';

/** Signal für das Billboard (Trailer darf erst danach vorladen): erste Zeile ist gefüllt. */
export const ROWS_READY_EVENT = 'lfx:rows-ready';

function skeleton(def) {
  const cards = [];
  for (let i = 0; i < 6; i++) cards.push(h('div', { class: 'lfx-skel' }));
  return h('section', { class: `lfx-row lfx-row--${def.kind}${def.kind === 'landscape' ? ' lfx-row--poster' : ''} is-loading`, dataset: { lfxRow: def.id } }, [
    h('div', { class: 'lfx-row__head' }, [h('h2', { class: 'lfx-row__title' }, def.title || '')]),
    h('div', { class: 'lfx-row__viewport' }, [h('div', { class: 'lfx-row__skeleton' }, cards)]),
  ]);
}

const EAGER_ROWS = 3; // Cache-Pfad: die ersten (sichtbaren) Zeilen ohne lazy/async-Bilder
const EAGER_CARDS = 8;

function fill(rowEl, def, items, newSeries, eager = false) {
  const now = Date.now();
  const cards = items.map((it, i) => createCard(it, {
    kind: def.kind,
    rank: def.kind === 'top10' ? i + 1 : 0,
    badge: badgeFor(it, newSeries, now),
    eager: eager && i < EAGER_CARDS,
  }));
  const track = h('div', { class: 'lfx-row__track', role: 'list', 'aria-label': def.title || '' }, cards);
  const prev = chevronButton('prev', 'Zurück');
  const next = chevronButton('next', 'Weiter');
  const indicator = h('div', { class: 'lfx-row__pages', 'aria-hidden': 'true', hidden: true });
  rowEl.querySelector('.lfx-row__head').append(indicator);
  const viewport = rowEl.querySelector('.lfx-row__viewport');
  viewport.textContent = '';
  viewport.append(prev, track, next);
  rowEl.querySelector('.lfx-row__title').textContent = def.title || '';
  rowEl.classList.remove('is-loading');
  return attachScroller({ track, prev, next, indicator });
}

/** Rendert die Zeilen in den Slot. Rückgabe: Cleanup-Funktion. */
export function render(slot) {
  let disposed = false;
  let observer = null;
  let prefetch = null;
  const disposers = [];
  slot.hidden = false;
  slot.textContent = '';

  // Gelöschte Titel aus den Zeilen nehmen (Top-10-Nummern bleiben bewusst unverändert).
  disposers.push(onItemsChanged(({ removed }) => {
    if (disposed || !removed || !removed.length) return;
    const gone = new Set(removed);
    for (const row of [...slot.querySelectorAll('.lfx-row')]) {
      const track = row.querySelector('.lfx-row__track');
      if (!track) continue;
      let changed = false;
      for (const card of [...track.querySelectorAll('.lfx-card[data-lfx-id]')]) {
        if (gone.has(card.dataset.lfxId)) { card.remove(); changed = true; }
      }
      if (!changed) continue;
      if (!track.querySelector('.lfx-card')) row.remove();
      else track.dispatchEvent(new Event('scroll')); // Scroller (Pfeile/Seitenpunkte) neu berechnen
    }
  }));

  // „Neue Folgen“-Set: blockiert nie das Füllen. Liegt es schon vor (Speicher/sessionStorage), gilt es sofort,
  // sonst werden die Badges nach dem Hintergrund-Abruf nachgetragen.
  let newSeries = peekNewSeriesIds();
  let newSeriesStarted = false;
  const filled = []; // {items: Map id -> item, rowEl}
  let readySent = false;

  function signalReady() {
    if (readySent || disposed) return;
    readySent = true;
    document.dispatchEvent(new CustomEvent(ROWS_READY_EVENT));
  }

  function applyNewSeries(set) {
    const now = Date.now();
    for (const { items, rowEl } of filled) {
      if (!rowEl.isConnected) continue;
      for (const card of rowEl.querySelectorAll('.lfx-card[data-lfx-id]')) {
        const it = items.get(card.dataset.lfxId);
        if (it && it.Type === 'Series') setCardBadge(card, badgeFor(it, set, now));
      }
    }
  }

  function loadNewSeriesLater() {
    if (newSeries || newSeriesStarted) return;
    newSeriesStarted = true;
    getNewSeriesIds().then((set) => {
      if (disposed) return;
      newSeries = set;
      applyNewSeries(set);
    }, () => {});
  }

  function showRow(rowEl, def, items, eager) {
    putItems(items);
    if (rowEl.dataset.lfxRow !== def.id) rowEl.dataset.lfxRow = def.id; // Platzhalter kann zur „Neu auf“-Zeile werden
    disposers.push(fill(rowEl, def, items, newSeries, eager));
    if (items.some((i) => i.Type === 'Series')) {
      filled.push({ rowEl, items: new Map(items.map((i) => [i.Id, i])) });
      loadNewSeriesLater();
    }
    signalReady();
  }

  async function loadRow(rowEl, def) {
    try {
      const items = (await def.load(def)).filter((i) => i && i.Id);
      if (disposed) return;
      if (!items.length) { rowEl.remove(); return; }
      showRow(rowEl, def, items, false);
    } catch (e) {
      console.warn(`[LenzFlix] Zeile "${def.id}" nicht geladen`, e && e.message);
      if (!disposed) rowEl.remove();
    }
  }

  (async () => {
    if (!api.isReady()) { console.warn('[LenzFlix] Zeilen: keine Anmeldung'); signalReady(); return; }
    let defs;
    try {
      defs = peekRowDefs({ deferCharts: true }) || await buildRowDefs({ deferCharts: true }); // Cache: kein Warten, Zeilen sofort
    } catch (e) {
      console.warn('[LenzFlix] Zeilen konnten nicht aufgebaut werden', e && e.message);
      signalReady();
      return;
    }
    if (disposed) return;
    const pending = new Map();
    let shown = 0;
    for (const def of defs) {
      // Zeile liegt im Cache (< 10 min): ohne Skeleton und ohne Observer direkt füllen, erste Zeilen mit sofort ladenden Bildern.
      const snap = def.cacheKey ? peekCached(def.cacheKey) : undefined;
      if (snap) {
        const items = snap.items.filter((i) => i && i.Id);
        if (!items.length) continue;
        def.id = snap.id;
        def.title = snap.title;
        const el = skeleton(def);
        slot.append(el);
        showRow(el, def, items, shown++ < EAGER_ROWS);
        continue;
      }
      const el = skeleton(def);
      pending.set(el, def);
      slot.append(el);
    }
    if (typeof IntersectionObserver === 'function') {
      observer = new IntersectionObserver((entries) => {
        for (const en of entries) {
          const def = pending.get(en.target);
          if (!en.isIntersecting || !def) continue;
          pending.delete(en.target);
          observer.unobserve(en.target);
          loadRow(en.target, def);
        }
      }, { rootMargin: '600px 0px' });
      for (const el of pending.keys()) observer.observe(el);
    } else {
      for (const [el, def] of [...pending]) { pending.delete(el); loadRow(el, def); }
    }
    // Hintergrund-Vorladen der übrigen Zeilen, sobald oben alles fertig ist (Hero, erste Zeilen, Trailer).
    prefetch = startRowPrefetch({
      slot,
      pending,
      hero: () => document.getElementById('lfx-billboard'),
      load: (el, def) => { if (observer) observer.unobserve(el); return loadRow(el, def); },
    });
  })();

  return () => {
    disposed = true;
    if (prefetch) prefetch.stop();
    prefetch = null;
    if (observer) observer.disconnect();
    observer = null;
    for (const d of disposers.splice(0)) d();
    slot.textContent = '';
  };
}
