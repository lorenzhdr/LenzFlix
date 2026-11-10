// LENZ+: gemeinsame Bausteine der Unterseiten (Alters-Box, Metazeile, Karten für Raster).
import { h } from '../../core/dom.js';
import { createCard } from '../rows/card.js';
import { metaParts } from '../modal/format.js';

/** Alters-Box ("FSK-12" -> "12"); null ohne Freigabe. */
export function ageBox(rating) {
  const r = String(rating || '').trim().replace(/^fsk[-\s]?/i, '');
  return r ? h('span', { class: 'lfx-plus-age' }, r) : null;
}

/** "Jahr • Laufzeit/Staffeln • Genre, Genre" (leere Teile entfallen). */
export function metaText(item, { genres = 3 } = {}) {
  if (!item) return '';
  const m = metaParts(item);
  const g = (item.Genres || []).slice(0, genres).join(', ');
  return [m.year, m.length, g].filter(Boolean).join(' • ');
}

/** Metazeile: Alters-Box + Text. */
export function metaLine(item, opts) {
  return h('div', { class: 'lfx-plus-meta' }, [ageBox(item && item.OfficialRating), h('span', { class: 'lfx-plus-meta__text' }, metaText(item, opts))]);
}

export const episodeCode = (ep) => (ep && ep.ParentIndexNumber != null && ep.IndexNumber != null ? `S${ep.ParentIndexNumber}:F${ep.IndexNumber}` : '');

/**
 * 16:9-Karte für Raster (Vertrag .lfx-card[data-lfx-id][data-lfx-type], Klick -> Titelseite über modal.js).
 * opts.text: Titel + Metazeile unter dem Bild (innerhalb der Karte, damit der Klick-Abfang greift).
 */
export function gridCard(item, { badge = null, text = false } = {}) {
  const card = createCard(item, { kind: 'landscape', badge });
  card.classList.add('lfx-card--plus');
  if (text) {
    const ep = item.Type === 'Episode';
    const code = ep ? episodeCode(item) : '';
    const meta = ep ? [item.SeriesName, code].filter(Boolean).join(' • ') : '';
    card.append(h('div', { class: 'lfx-plus-result__text' }, [
      h('div', { class: 'lfx-plus-result__title' }, item.Name || ''),
      ep ? h('div', { class: 'lfx-plus-meta' }, [h('span', { class: 'lfx-plus-meta__text' }, meta)]) : metaLine(item),
    ]));
  }
  return card;
}
