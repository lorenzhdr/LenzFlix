// LENZ+: Zeilen der Startseite/Hubs. Zeilen laden lazy (IntersectionObserver); Fehler lassen die Zeile still weg.
import { h } from '../../core/dom.js';
import { putItems } from '../../core/itemstore.js';
import { onItemsChanged } from '../../core/itemmenu.js';
import { plusBadge, getNewContentInfo } from '../../shared/newcontent.js';
import { attachScroller, chevronButton } from '../rows/scroller.js';
import { createPlusCard } from './card.js';

function skeleton(def) {
  const resume = def.kind === 'resume';
  const cells = [];
  for (let i = 0; i < 6; i++) cells.push(h('div', { class: 'lfx-plus-skel' }));
  return h('section', {
    class: `lfx-plus-row lfx-plus-row--${resume ? 'resume' : 'poster'} is-loading`,
    dataset: { lfxRow: def.id },
  }, [
    h('h2', { class: 'lfx-plus-row__title' }, def.title || ''),
    h('div', { class: 'lfx-plus-row__viewport' }, [h('div', { class: 'lfx-plus-row__skeleton' }, cells)]),
  ]);
}

function fill(rowEl, def, items, info) {
  const resume = def.kind === 'resume';
  const cards = items.map((it) => createPlusCard(it, {
    kind: resume ? 'resume' : 'poster',
    badge: resume ? null : plusBadge(it, info),
  }));
  const track = h('div', { class: 'lfx-plus-row__track', role: 'list', 'aria-label': def.title || '' }, cards);
  const prev = chevronButton('prev', 'Zurück');
  const next = chevronButton('next', 'Weiter');
  prev.classList.add('lfx-plus-row__arrow');
  next.classList.add('lfx-plus-row__arrow');
  const viewport = rowEl.querySelector('.lfx-plus-row__viewport');
  viewport.textContent = '';
  viewport.append(prev, track, next);
  rowEl.querySelector('.lfx-plus-row__title').textContent = def.title || '';
  rowEl.classList.remove('is-loading');
  return attachScroller({ track, prev, next, indicator: null });
}

/**
 * Rendert Zeilen für `getDefs()` (async, liefert {id,title,kind,load}) in den Slot. Rückgabe: Cleanup.
 */
export function renderRows(slot, getDefs) {
  let disposed = false;
  let observer = null;
  const disposers = [];
  slot.textContent = '';

  disposers.push(onItemsChanged(({ removed }) => {
    if (disposed || !removed || !removed.length) return;
    const gone = new Set(removed);
    for (const row of [...slot.querySelectorAll('.lfx-plus-row')]) {
      const track = row.querySelector('.lfx-plus-row__track');
      if (!track) continue;
      let changed = false;
      for (const card of [...track.querySelectorAll('.lfx-card[data-lfx-id]')]) {
        if (gone.has(card.dataset.lfxId)) { card.remove(); changed = true; }
      }
      if (!changed) continue;
      if (!track.querySelector('.lfx-card')) row.remove();
      else track.dispatchEvent(new Event('scroll'));
    }
  }));

  async function loadRow(rowEl, def) {
    try {
      const items = (await def.load(def)).filter((i) => i && i.Id);
      if (disposed) return;
      if (!items.length) { rowEl.remove(); return; }
      putItems(items);
      const info = await getNewContentInfo();
      if (disposed) return;
      disposers.push(fill(rowEl, def, items, info));
    } catch (e) {
      console.warn(`[LenzFlix] Zeile "${def.id}" nicht geladen`, e && e.message);
      if (!disposed) rowEl.remove();
    }
  }

  (async () => {
    let defs;
    try {
      defs = await getDefs();
    } catch (e) {
      console.warn('[LenzFlix] Zeilen konnten nicht aufgebaut werden', e && e.message);
      return;
    }
    if (disposed) return;
    const pending = new Map();
    for (const def of defs || []) {
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
