// LENZ+: Sammlungs-Kachelreihe der Startseite (16:9-Kacheln, Name als Schriftzug ohne Bild).
import { h } from '../../core/dom.js';
import { titleHref } from '../../shared/routes.js';
import { getCollections } from '../../shared/collections.js';

/** Baut die Kachelreihe oder null (keine Sammlungen). */
export function buildBrandRow(collections) {
  const list = (collections || []).filter((c) => c && c.id);
  if (!list.length) return null;
  const cells = list.map((c) => h('div', { role: 'listitem', class: 'lfx-plus-brands__cell' }, [
    h('a', { class: 'lfx-plus-brand', href: titleHref(c.id), 'aria-label': c.name || 'Sammlung', title: c.name || 'Sammlung' }, [
      c.imageUrl ? h('img', { class: 'lfx-plus-brand__img', src: c.imageUrl, alt: '', loading: 'lazy', decoding: 'async' }) : null,
      c.imageUrl ? null : h('span', { class: 'lfx-plus-brand__name' }, c.name || ''),
    ]),
  ]));
  return h('section', { class: 'lfx-plus-brands', 'aria-label': 'Sammlungen' }, [
    h('div', { class: 'lfx-plus-brands__track', role: 'list' }, cells),
  ]);
}

/** Platzhalter-Reihe (gleiche Maße wie die echte), damit die Zeilen darunter beim Nachladen nicht springen. */
function buildPlaceholder(count = 6) {
  const cells = Array.from({ length: count }, () => h('div', { class: 'lfx-plus-brands__cell' }, [h('div', { class: 'lfx-plus-brand' })]));
  return h('section', { class: 'lfx-plus-brands is-loading', 'aria-hidden': 'true' }, [
    h('div', { class: 'lfx-plus-brands__track' }, cells),
  ]);
}

/** Lädt Sammlungen und hängt die Reihe vor `before` in `parent`. Rückgabe: Cleanup. */
export function renderBrands(parent, before) {
  let disposed = false;
  let el = buildPlaceholder();
  parent.insertBefore(el, before && before.parentNode === parent ? before : null);
  const swap = (next) => {
    if (disposed) return;
    if (next) el.replaceWith(next);
    else el.remove();
    el = next;
  };
  getCollections().then((list) => swap(buildBrandRow(list))).catch((e) => {
    console.warn('[LenzFlix] Sammlungen nicht geladen', e && e.message);
    swap(null);
  });
  return () => { disposed = true; if (el) el.remove(); el = null; };
}
