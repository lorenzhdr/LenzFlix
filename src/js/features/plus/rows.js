// LENZ+: Zeilen der Startseite/Hubs. Zeilen laden lazy (IntersectionObserver); Fehler lassen die Zeile still weg.
import { h } from '../../core/dom.js';
import { peekCached, HOME_TTL } from '../../core/cache.js';
import { isDataSaver } from '../../core/datasaver.js';
import { putItems } from '../../core/itemstore.js';
import { onItemsChanged } from '../../core/itemmenu.js';
import { plusBadge, getNewContentInfo } from '../../shared/newcontent.js';
import { startRowPrefetch } from '../rows/prefetch.js';
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

const EAGER_ROWS = 3; // Cache-Pfad: die ersten Zeilen ohne lazy/async-Bilder
const EAGER_CARDS = 8;
let lastInfo = null; // {v, at}: zuletzt geladene Neu-Info, macht den Sofort-Pfad synchron

function fill(rowEl, def, items, info, eager = false) {
  const resume = def.kind === 'resume';
  const cards = items.map((it, i) => createPlusCard(it, {
    kind: resume ? 'resume' : 'poster',
    badge: resume ? null : plusBadge(it, info),
    eager: eager && i < EAGER_CARDS,
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
 * `peekDefs()` (optional, sync): gecachte Zeilenliste; Zeilen mit Cache-Treffer (def.cacheKey) füllen sofort ohne Skeleton.
 * `opts.prefetch` (nur Startseite, nicht Hubs) + `opts.hero()` (Hero-Slot): übrige Zeilen im Hintergrund vorladen.
 */
export function renderRows(slot, getDefs, peekDefs, opts = {}) {
  let disposed = false;
  let observer = null;
  let prefetch = null;
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
      lastInfo = { v: info, at: Date.now() };
      disposers.push(fill(rowEl, def, items, info));
    } catch (e) {
      console.warn(`[LenzFlix] Zeile "${def.id}" nicht geladen`, e && e.message);
      if (!disposed) rowEl.remove();
    }
  }

  (async () => {
    let defs;
    try {
      defs = (peekDefs && peekDefs()) || await getDefs();
    } catch (e) {
      console.warn('[LenzFlix] Zeilen konnten nicht aufgebaut werden', e && e.message);
      return;
    }
    if (disposed) return;
    const pending = new Map();
    let shown = 0;
    const info = lastInfo && Date.now() - lastInfo.at < HOME_TTL ? lastInfo.v : null;
    for (const def of defs || []) {
      const snap = info && def.cacheKey ? peekCached(def.cacheKey) : undefined;
      if (snap) {
        const items = snap.items.filter((i) => i && i.Id);
        if (!items.length) continue;
        def.id = snap.id;
        def.title = snap.title;
        const el = skeleton(def);
        slot.append(el);
        putItems(items);
        disposers.push(fill(el, def, items, info, shown++ < EAGER_ROWS));
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
      }, { rootMargin: isDataSaver() ? '100px 0px' : '600px 0px' });
      for (const el of pending.keys()) observer.observe(el);
    } else {
      for (const [el, def] of [...pending]) { pending.delete(el); loadRow(el, def); }
    }
    if (opts.prefetch) {
      prefetch = startRowPrefetch({
        slot,
        pending,
        hero: opts.hero,
        load: (el, def) => { if (observer) observer.unobserve(el); return loadRow(el, def); },
      });
    }
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
