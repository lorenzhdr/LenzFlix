// LENZPRIME: Zeilen der Startseite/Hubs (lazy geladen). Zeilen-Defs im Format von rows/sources.js: { id, title, kind, load(def) }.
import { h } from '../../core/dom.js';
import { putItems } from '../../core/itemstore.js';
import { onItemsChanged } from '../../core/itemmenu.js';
import { getNewContentInfo } from '../../shared/newcontent.js';
import { cardBadge, getTrendInfo } from '../../shared/trend.js';
import { attachScroller } from '../rows/scroller.js';
import { createPrimeCard } from './card.js';

const CHEVRON = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><polyline points="8,3 17,12 8,21" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function arrow(dir, label) {
  const b = h('button', { type: 'button', class: `lfx-prime-arrow lfx-prime-arrow--${dir}`, 'aria-label': label, tabindex: '-1', hidden: true });
  b.innerHTML = CHEVRON;
  return b;
}

/**
 * Wählt die Poster-Zeile. Hub: erste Zeile vom Typ 'poster'. Startseite: „Neu hinzugefügt: Filme“, sonst „Hochbewertet“,
 * sonst die erste 16:9-Zeile hinter Weiterschauen/Als Nächstes/Top 10/Meine Liste. Liefert die Def-Id oder null.
 */
export function pickPosterId(defs, hub) {
  const list = defs || [];
  if (hub) {
    const d = list.find((x) => x.kind === 'poster');
    return d ? d.id : null;
  }
  for (const id of ['latest-movies', 'toprated']) if (list.some((d) => d.id === id)) return id;
  const d = list.find((x) => x.kind === 'landscape' && !['nextup', 'favorites'].includes(x.id));
  return d ? d.id : null;
}

function displayKind(def, posterId) {
  if (def.kind === 'top10') return 'top10';
  if (def.kind === 'resume') return 'resume';
  return def.id === posterId ? 'poster' : 'landscape';
}

/**
 * Rendert Zeilen in `slot`. opts: { posterId, moreHref(def) -> string|null }.
 * Rückgabe: { add(defs), ids(), destroy() }.
 */
export function createRows(slot, { posterId = null, moreHref = () => null } = {}) {
  let disposed = false;
  let observer = null;
  let infoP = null;
  const disposers = [];
  const pending = new Map();
  const rendered = new Set();

  const info = () => {
    if (!infoP) {
      infoP = Promise.all([getNewContentInfo().catch(() => null), getTrendInfo().catch(() => null)])
        .then(([newInfo, trend]) => ({ newInfo, trend }));
    }
    return infoP;
  };

  disposers.push(onItemsChanged(({ removed }) => {
    if (disposed || !removed || !removed.length) return;
    const gone = new Set(removed);
    for (const row of [...slot.querySelectorAll('.lfx-prime-row')]) {
      const track = row.querySelector('.lfx-prime-row__track');
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

  function skeleton(def, kind) {
    const skels = [];
    for (let i = 0; i < 6; i++) skels.push(h('div', { class: 'lfx-prime-skel' }));
    const more = moreHref(def);
    const head = h('div', { class: 'lfx-prime-row__head' }, [
      h('h2', { class: 'lfx-prime-row__title' }, def.title || ''),
      more ? h('a', { class: 'lfx-prime-row__more', href: more }, 'Mehr ansehen ›') : null,
    ]);
    const track = h('div', { class: 'lfx-prime-row__track', role: 'list', 'aria-label': def.title || '' }, skels);
    return h('section', {
      class: `lfx-prime-row lfx-prime-row--${kind} is-loading`,
      dataset: { lfxRow: def.id },
    }, [head, h('div', { class: 'lfx-prime-row__viewport' }, [track])]);
  }

  async function loadRow(rowEl, def, kind) {
    try {
      const items = (await def.load(def)).filter((i) => i && i.Id);
      if (disposed) return;
      if (!items.length) { rowEl.remove(); return; }
      putItems(items);
      const { newInfo, trend } = await info();
      if (disposed) return;
      const cards = items.map((it, i) => createPrimeCard(it, {
        kind,
        rank: kind === 'top10' ? i + 1 : 0,
        badge: cardBadge(it, { newInfo, trend }),
      }));
      const track = rowEl.querySelector('.lfx-prime-row__track');
      const prev = arrow('prev', 'Zurück');
      const next = arrow('next', 'Weiter');
      track.replaceChildren(...cards);
      track.setAttribute('aria-label', def.title || '');
      track.before(prev);
      track.after(next);
      rowEl.querySelector('.lfx-prime-row__title').textContent = def.title || '';
      rowEl.classList.remove('is-loading');
      disposers.push(attachScroller({ track, prev, next, indicator: null }));
    } catch (e) {
      console.warn(`[LenzFlix] Zeile "${def.id}" nicht geladen`, e && e.message);
      if (!disposed) rowEl.remove();
    }
  }

  function ensureObserver() {
    if (observer || typeof IntersectionObserver !== 'function') return;
    observer = new IntersectionObserver((entries) => {
      for (const en of entries) {
        const p = pending.get(en.target);
        if (!en.isIntersecting || !p) continue;
        pending.delete(en.target);
        observer.unobserve(en.target);
        loadRow(en.target, p.def, p.kind);
      }
    }, { rootMargin: '600px 0px' });
  }

  return {
    add(defs) {
      if (disposed) return;
      ensureObserver();
      for (const def of defs || []) {
        if (!def || rendered.has(def.id)) continue;
        rendered.add(def.id);
        const kind = displayKind(def, posterId);
        const el = skeleton(def, kind);
        slot.append(el);
        pending.set(el, { def, kind });
        if (observer) observer.observe(el);
        else loadRow(el, def, kind);
      }
    },
    ids: () => [...rendered],
    destroy() {
      disposed = true;
      if (observer) observer.disconnect();
      observer = null;
      pending.clear();
      for (const d of disposers.splice(0)) d();
      slot.textContent = '';
    },
  };
}
