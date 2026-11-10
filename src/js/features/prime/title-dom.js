// LENZPRIME Titelseite: DOM-Bausteine (Icons, Kreis-Buttons, Folgen-Karten, Info-Kacheln, Staffel-Auswahl).
import { h } from '../../core/dom.js';
import { openPopover, closePopover, isPopoverOpen } from '../../core/popover.js';
import { isMobile } from '../../core/layout.js';
import { createCard, landscapeFor } from '../rows/card.js';
import { createPrimeCard } from './card.js';
import { progressPercent } from '../modal/format.js';
import { cardBadge } from '../../shared/trend.js';
import { ratingChip, remainingLabel, episodeRuntime, episodeTitle, seasonName } from './title-logic.js';

const svg = (p) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${p}</svg>`;

export const ICONS = {
  play: svg('<path d="M7 4.2v15.6a1 1 0 0 0 1.5.86l13-7.8a1 1 0 0 0 0-1.72l-13-7.8A1 1 0 0 0 7 4.2z"/>'),
  plus: svg('<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>'),
  check: svg('<path d="M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L20.5 8.1l-1.4-1.4z"/>'),
  trailer: svg('<path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v10h14V7zm4.5 2.2 5 2.8-5 2.8z"/>'),
  muted: svg('<path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/>'),
  sound: svg('<path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>'),
  chevron: svg('<path d="M6.7 9.3 12 14.6l5.3-5.3 1.4 1.4-6.7 6.7-6.7-6.7z"/>'),
  trend: svg('<path d="M3 17.6 9.5 11l4 4 6.3-6.6L21 9.7V5h-4.7l1.4 1.4-4.2 4.4-4-4L1.6 15.8z"/>'),
};

export function iconEl(markup, cls = 'lfx-pt__ico') {
  const el = h('span', { class: cls, 'aria-hidden': 'true' });
  el.innerHTML = markup;
  return el;
}

/** Runder Icon-Button. opts: {label, icon, mod, onClick, hidden}. */
export function circleButton({ label, icon, mod = '', onClick, hidden = false }) {
  const b = h('button', {
    type: 'button',
    class: `lfx-pt__circle${mod ? ` lfx-pt__circle--${mod}` : ''}`,
    'aria-label': label,
    title: label,
    hidden: hidden || null,
  });
  b.append(iconEl(icon));
  if (onClick) {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      onClick(b, e);
    });
  }
  return b;
}

export function setIcon(btn, markup) {
  const ico = btn.querySelector('.lfx-pt__ico');
  if (ico) ico.innerHTML = markup;
}

export function ratingChipEl(rating) {
  const c = ratingChip(rating);
  return c ? h('span', { class: `lfx-pt__fsk lfx-pt__fsk--${c.tone}`, title: `Altersfreigabe ${rating}` }, c.text) : null;
}

/** Info-Kachel (Details-Tab). */
export function buildTile(tile) {
  return h('section', { class: `lfx-pt__tile lfx-pt__tile--${tile.id}` }, [
    h('h3', { class: 'lfx-pt__tile-title' }, tile.title),
    ...(tile.lines || []).map((l) => h('p', { class: 'lfx-pt__tile-line' }, l)),
    tile.text ? h('p', { class: 'lfx-pt__tile-text' }, tile.text) : null,
    tile.chips ? h('div', { class: 'lfx-pt__chips' }, tile.chips.map((c) => h('span', { class: 'lfx-pt__chip' }, c))) : null,
  ]);
}

/** Folgen-Karte (16:9). opts: {onPlay(ep), selected}. */
export function buildEpisode(ep, { onPlay, selected = false } = {}) {
  const img = landscapeFor(ep, 640);
  const p = progressPercent(ep);
  const remaining = remainingLabel(ep);
  const media = h('button', { type: 'button', class: 'lfx-pt__ep-media', 'aria-label': `${episodeTitle(ep)} abspielen` }, [
    img ? h('img', { class: 'lfx-pt__ep-img', src: img.url, alt: '', loading: 'lazy', decoding: 'async' }) : null,
    h('span', { class: 'lfx-pt__ep-play', 'aria-hidden': 'true' }, [iconEl(ICONS.play)]),
    remaining ? h('span', { class: 'lfx-pt__ep-badge' }, remaining) : null,
    p > 0 ? h('span', { class: 'lfx-pt__ep-progress', 'aria-hidden': 'true' }, [h('span', { style: { width: `${Math.round(p)}%` } })]) : null,
  ]);
  media.addEventListener('click', () => onPlay && onPlay(ep));
  const meta = [
    ratingChipEl(ep.OfficialRating),
    episodeRuntime(ep) ? h('span', null, episodeRuntime(ep)) : null,
    ep.PremiereDate ? h('span', null, formatDate(ep.PremiereDate)) : null,
  ].filter(Boolean);
  return h('article', {
    class: `lfx-pt__ep${selected ? ' is-selected' : ''}`,
    dataset: { lfxId: ep.Id },
  }, [
    media,
    h('h3', { class: 'lfx-pt__ep-title' }, episodeTitle(ep)),
    ep.Overview ? h('p', { class: 'lfx-pt__ep-desc' }, ep.Overview) : null,
    meta.length ? h('div', { class: 'lfx-pt__ep-meta' }, meta) : null,
  ]);
}

export function formatDate(iso) {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Date(t).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Raster aus LENZFLIX-Karten (.lfx-card-Vertrag, Klick läuft über den Modal-Abfang). */
export function buildCardGrid(items, { trend, newInfo } = {}) {
  // Handy: Posterraster (3 Spalten, per CSS); Poster-Karten tragen denselben Kartenvertrag
  const make = isMobile()
    ? (it) => createPrimeCard(it, { kind: 'poster', badge: cardBadge(it, { newInfo, trend }) })
    : (it) => createCard(it, { badge: cardBadge(it, { newInfo, trend }) });
  return h('div', { class: 'lfx-pt__grid', role: 'list' }, items.map(make));
}

/** Staffel-Auswahl "Staffel 1 ˅" als Popover-Button. */
export function buildSeasonSelect(seasons, seasonId, onPick) {
  const cur = seasons.find((s) => s.Id === seasonId) || seasons[0];
  const btn = h('button', {
    type: 'button', class: 'lfx-pt__season', 'aria-haspopup': 'menu', 'aria-label': 'Staffel wählen',
  }, [h('span', { class: 'lfx-pt__season-label' }, seasonName(cur)), iconEl(ICONS.chevron, 'lfx-pt__season-chev')]);
  btn.addEventListener('click', () => {
    if (isPopoverOpen()) { closePopover({ restoreFocus: true }); return; }
    btn.setAttribute('aria-expanded', 'true');
    openPopover(btn, {
      label: 'Staffeln',
      align: 'start',
      className: 'lfx-pt-popover',
      items: seasons.map((s) => ({
        key: s.Id,
        label: seasonName(s),
        className: s.Id === (cur && cur.Id) ? 'is-active' : '',
        onClick: () => onPick(s.Id),
      })),
    });
  });
  return btn;
}
