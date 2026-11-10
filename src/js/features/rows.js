// LenzFlix: Netflix-Zeilen der Startseite (Feature "rows"). Rendert in #lfx-rows.
// Zeilen laden lazy (IntersectionObserver); Fehler lassen die Zeile still weg.
import * as api from '../core/api.js';
import { h } from '../core/dom.js';
import { putItems } from '../core/itemstore.js';
import { onItemsChanged } from '../core/itemmenu.js';
import { createCard } from './rows/card.js';
import { badgeFor } from './rows/logic.js';
import { attachScroller, chevronButton } from './rows/scroller.js';
import { buildRowDefs, getNewSeriesIds } from './rows/sources.js';

function skeleton(def) {
  const cards = [];
  for (let i = 0; i < 6; i++) cards.push(h('div', { class: 'lfx-skel' }));
  return h('section', { class: `lfx-row lfx-row--${def.kind}${def.kind === 'landscape' ? ' lfx-row--poster' : ''} is-loading`, dataset: { lfxRow: def.id } }, [
    h('div', { class: 'lfx-row__head' }, [h('h2', { class: 'lfx-row__title' }, def.title || '')]),
    h('div', { class: 'lfx-row__viewport' }, [h('div', { class: 'lfx-row__skeleton' }, cards)]),
  ]);
}

function fill(rowEl, def, items, newSeries) {
  const now = Date.now();
  const cards = items.map((it, i) => createCard(it, {
    kind: def.kind,
    rank: def.kind === 'top10' ? i + 1 : 0,
    badge: badgeFor(it, newSeries, now),
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

  async function loadRow(rowEl, def) {
    try {
      const items = (await def.load(def)).filter((i) => i && i.Id);
      if (disposed) return;
      if (!items.length) { rowEl.remove(); return; }
      putItems(items);
      const newSeries = await getNewSeriesIds();
      if (disposed) return;
      disposers.push(fill(rowEl, def, items, newSeries));
    } catch (e) {
      console.warn(`[LenzFlix] Zeile "${def.id}" nicht geladen`, e && e.message);
      if (!disposed) rowEl.remove();
    }
  }

  (async () => {
    if (!api.isReady()) { console.warn('[LenzFlix] Zeilen: keine Anmeldung'); return; }
    let defs;
    try {
      defs = await buildRowDefs();
    } catch (e) {
      console.warn('[LenzFlix] Zeilen konnten nicht aufgebaut werden', e && e.message);
      return;
    }
    if (disposed) return;
    const pending = new Map();
    for (const def of defs) {
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
      for (const [el, def] of pending) loadRow(el, def);
    }
  })();

  return () => {
    disposed = true;
    if (observer) observer.disconnect();
    observer = null;
    for (const d of disposers.splice(0)) d();
    slot.textContent = '';
  };
}
