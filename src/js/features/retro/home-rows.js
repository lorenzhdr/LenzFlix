// LENZ//84 Kassetten-Regal: Zeilen der Startseite/Hubs (lazy geladen). Defs im Format von rows/sources.js: { id, title, kind, load(def) }.
// Desktop: Kassettenrücken (spine) auf einem Regalboden, Weiterschauen/Folgen als wide; Handy: Cover-Kacheln. Gehört Worker P1.
import { h } from '../../core/dom.js';
import { putItems } from '../../core/itemstore.js';
import { onItemsChanged } from '../../core/itemmenu.js';
import { attachScroller } from '../rows/scroller.js';
import { createTapeCard } from './card.js';
import { isPhone } from './header-nav.js';
import { svgIcon } from './header-ui.js';

/** Zeilentitel im Terminal-Ton (CSS setzt Großbuchstaben und das „// “-Präfix). */
export function rowLabel(def) {
  const id = String((def && def.id) || '');
  if (id === 'resume' || id.endsWith('-resume')) return 'Weiterschauen';
  if (id === 'nextup') return 'Nächste Folgen';
  if (id === 'latest-movies') return 'Neu eingelegt: Filme';
  if (id === 'latest-series') return 'Neu eingelegt: Serien';
  if (id.endsWith('-latest')) return 'Neu eingelegt';
  return (def && def.title) || '';
}

/** Darstellung: 'wide' (Weiterschauen, Nächste Folgen), 'top10', sonst 'shelf'. */
export function displayKind(def) {
  if (def.kind === 'top10') return 'top10';
  if (def.kind === 'resume' || def.id === 'nextup') return 'wide';
  return 'shelf';
}

/** Kartenvariante: Handy Cover (wide bleibt wide), Desktop Kassettenrücken. */
export function variantFor(kind, phone) {
  if (kind === 'wide') return 'wide';
  return phone ? 'cover' : 'spine';
}

function arrow(dir, label) {
  const b = h('button', { type: 'button', class: `lfx-retro-arrow lfx-retro-arrow--${dir}`, 'aria-label': label, tabindex: '-1', hidden: true }, [svgIcon(dir)]);
  return b;
}

/**
 * Rendert Zeilen in `slot`. opts: { moreHref(def) -> string|null }.
 * Rückgabe: { add(defs), ids(), destroy() }.
 */
export function createRows(slot, { moreHref = () => null } = {}) {
  let disposed = false;
  let observer = null;
  const phone = isPhone();
  const disposers = [];
  const pending = new Map();
  const rendered = new Set();

  disposers.push(onItemsChanged(({ removed } = {}) => {
    if (disposed || !removed || !removed.length) return;
    const gone = new Set(removed);
    for (const row of [...slot.querySelectorAll('.lfx-retro-row')]) {
      const track = row.querySelector('.lfx-retro-shelf');
      if (!track) continue;
      let changed = false;
      for (const card of [...track.querySelectorAll('.lfx-card[data-lfx-id]')]) {
        if (gone.has(card.dataset.lfxId)) { (card.closest('.lfx-retro-rank') || card).remove(); changed = true; }
      }
      if (!changed) continue;
      if (!track.querySelector('.lfx-card')) row.remove();
      else track.dispatchEvent(new Event('scroll'));
    }
  }));

  function skeleton(def, kind) {
    const more = moreHref(def);
    const head = h('div', { class: 'lfx-retro-row__head' }, [
      h('h2', { class: 'lfx-retro-label lfx-retro-row__title' }, rowLabel(def)),
      more ? h('a', { class: 'lfx-retro-row__more', href: more }, 'Alle anzeigen') : null,
    ]);
    const skels = [];
    for (let i = 0; i < 7; i++) skels.push(h('div', { class: 'lfx-retro-skel' }));
    const track = h('div', { class: 'lfx-retro-shelf', role: 'list', 'aria-label': rowLabel(def) }, skels);
    return h('section', {
      class: `lfx-retro-row lfx-retro-row--${kind} is-loading`,
      dataset: { lfxRow: def.id },
    }, [head, h('div', { class: 'lfx-retro-row__viewport' }, [track])]);
  }

  async function loadRow(rowEl, def, kind) {
    try {
      const items = (await def.load(def)).filter((i) => i && i.Id);
      if (disposed) return;
      if (!items.length) { rowEl.remove(); return; }
      putItems(items);
      const variant = variantFor(kind, phone);
      const cards = items.map((it, i) => {
        const card = createTapeCard(it, { variant });
        if (kind !== 'top10') return card;
        return h('div', { class: 'lfx-retro-rank' }, [h('span', { class: 'lfx-retro-rank__n', 'aria-hidden': 'true' }, String(i + 1)), card]);
      });
      const track = rowEl.querySelector('.lfx-retro-shelf');
      const title = rowLabel(def);
      const prev = arrow('prev', 'Zurück');
      const next = arrow('next', 'Weiter');
      track.replaceChildren(...cards);
      track.setAttribute('aria-label', title);
      track.style.setProperty('--lfx-cards-visible', variant === 'spine' ? '6' : '4');
      track.before(prev);
      track.after(next);
      rowEl.querySelector('.lfx-retro-row__title').textContent = title;
      rowEl.classList.remove('is-loading');
      rowEl.dataset.variant = variant;
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
        const kind = displayKind(def);
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
