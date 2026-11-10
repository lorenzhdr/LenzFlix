// LENZ//84: Kassetten-Karte. Kartenvertrag wie docs/js-contracts.md:
// .lfx-card[data-lfx-id][data-lfx-type] mit .lfx-card__link (href, aria-label) und .lfx-card__img/__title.
// Varianten: 'spine' (Kassettenrücken im Regal), 'cover' (Poster 2:3 in Hülle), 'wide' (16:9, Episoden/Weiterschauen).
import { h } from '../../core/dom.js';
import { titleHref } from '../../shared/routes.js';
import { landscapeFor, posterUrl } from '../rows/card.js';
import { progressPercent } from '../rows/logic.js';

export const TAPE_VARIANTS = ['spine', 'cover', 'wide'];
const TONES = 5; // data-tone 0..4 (Farbstreifen am Kassettenrücken, siehe card.css)

export function displayTitle(item) {
  return item.Type === 'Episode' && item.SeriesName ? item.SeriesName : item.Name || '';
}

export function ariaFor(item) {
  if (item.Type === 'Episode' && item.SeriesName) return `${item.SeriesName} – ${item.Name || ''}`.trim();
  return item.Name || '';
}

/** Stabiler Farbton 0..4 aus erstem Genre (sonst Typ/Id): gleiche Genres bekommen dieselbe Streifenfarbe. */
export function toneFor(item) {
  const key = (Array.isArray(item.Genres) && item.Genres[0]) || item.Type || String(item.Id || '');
  let n = 0;
  for (let i = 0; i < key.length; i++) n = (n * 31 + key.charCodeAt(i)) >>> 0;
  return n % TONES;
}

function imageFor(item, variant) {
  if (variant === 'wide') {
    const l = landscapeFor(item, 600);
    return (l && l.url) || posterUrl(item, 400);
  }
  return posterUrl(item, 400) || (landscapeFor(item, 600) || {}).url || null;
}

/** Fortschritt in Prozent: opts.progress (0..100) hat Vorrang, sonst UserData des Items. */
function progressOf(item, progress) {
  if (typeof progress === 'number' && progress > 0) return Math.min(100, progress);
  return progress === undefined ? progressPercent(item) : 0;
}

/**
 * Kassetten-Karte.
 * opts: { variant: 'spine'|'cover'|'wide' (Standard 'spine'), progress?: number 0..100 (Bandwickel-Balken; ohne Angabe aus UserData) }
 */
export function createTapeCard(item, { variant = 'spine', progress } = {}) {
  const v = TAPE_VARIANTS.includes(variant) ? variant : 'spine';
  const title = displayTitle(item);
  const src = imageFor(item, v);
  const year = item.ProductionYear ? String(item.ProductionYear) : '';
  const media = [];
  if (src) media.push(h('img', { class: 'lfx-card__img lfx-retro-card__img', src, alt: '', loading: 'lazy', decoding: 'async' }));
  else if (v !== 'spine') media.push(h('span', { class: 'lfx-card__title lfx-retro-card__fallback' }, title));

  if (v === 'spine') {
    // Etikett: vertikaler Titel, Jahr, Farbstreifen, Abnutzung (reine Deko, per CSS)
    media.push(h('span', { class: 'lfx-retro-card__label', 'aria-hidden': 'true' }, [
      h('span', { class: 'lfx-card__title lfx-retro-card__spine-title' }, title),
      year ? h('span', { class: 'lfx-retro-card__year' }, year) : null,
      h('span', { class: 'lfx-retro-card__stripe' }),
      h('span', { class: 'lfx-retro-card__wear' }),
    ]));
  } else {
    media.push(h('span', { class: 'lfx-retro-card__cap', 'aria-hidden': 'true' }, [
      h('span', { class: 'lfx-retro-card__cap-title' }, title),
      year ? h('span', { class: 'lfx-retro-card__year' }, year) : null,
    ]));
  }

  const p = progressOf(item, progress);
  if (p > 0) {
    media.push(h('span', { class: 'lfx-retro-card__progress', role: 'presentation' }, [
      h('span', { class: 'lfx-retro-card__bar', style: { width: `${Math.round(p * 10) / 10}%` } }),
    ]));
  }

  const card = h('div', {
    class: `lfx-card lfx-retro-card lfx-retro-card--${v}`,
    dataset: { lfxId: item.Id, lfxType: item.Type || '', tone: String(toneFor(item)) },
    tabindex: '-1',
    role: 'listitem',
  });
  card.append(h('a', { class: 'lfx-card__link', href: titleHref(item.Id), 'aria-label': ariaFor(item) }, media));
  return card;
}
