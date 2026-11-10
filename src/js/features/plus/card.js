// LENZ+: Karten (Poster 2:3, Weiterschauen 16:9). Kartenvertrag wie docs/js-contracts.md:
// .lfx-card[data-lfx-id][data-lfx-type] mit .lfx-card__link/.lfx-card__img (Klick-Abfang -> Titelseite, Kontextmenü).
import { h } from '../../core/dom.js';
import * as api from '../../core/api.js';
import { play } from '../../core/playback.js';
import { titleHref } from '../../shared/routes.js';
import { formatRating } from '../billboard/format.js';
import { landscapeFor, posterUrl } from '../rows/card.js';
import { progressPercent } from '../rows/logic.js';

const SEP = ' • ';

export function displayTitle(item) {
  return item.Type === 'Episode' && item.SeriesName ? item.SeriesName : item.Name || '';
}

/** "Jahr • Genre, Genre" (max. 3 Genres). */
export function yearGenres(item) {
  const g = Array.isArray(item.Genres) ? item.Genres.filter(Boolean).slice(0, 3).join(', ') : '';
  return [item.ProductionYear ? String(item.ProductionYear) : '', g].filter(Boolean).join(SEP);
}

/** "Noch 22 Min." / "Noch 1 Std. 5 Min." oder '' (kein Fortschritt/keine Laufzeit). */
export function remainingLabel(item) {
  const ud = item && item.UserData;
  const total = Number(item && item.RunTimeTicks) || 0;
  const pos = Number(ud && ud.PlaybackPositionTicks) || 0;
  if (!total || !(pos > 0) || pos >= total) return '';
  const min = Math.max(1, Math.round((total - pos) / 600000000));
  const hrs = Math.floor(min / 60);
  const rest = min % 60;
  if (!hrs) return `Noch ${min} Min.`;
  return rest ? `Noch ${hrs} Std. ${rest} Min.` : `Noch ${hrs} Std.`;
}

/** Meta-Zeile unter Weiterschauen: Folge = "S7:F1 Titel", sonst "Jahr • Genres". */
export function episodeLine(item) {
  if (item.Type === 'Episode') {
    const s = item.ParentIndexNumber;
    const e = item.IndexNumber;
    const code = s != null && e != null ? `S${s}:F${e}` : e != null ? `F${e}` : '';
    return [code, item.Name].filter(Boolean).join(' ');
  }
  return yearGenres(item);
}

export function ratingBox(item) {
  const r = formatRating(item && item.OfficialRating);
  return r ? h('span', { class: 'lfx-plus-rating' }, r) : null;
}

function cardShell(item, kind, extraClass) {
  return h('div', {
    class: `lfx-card lfx-plus-card lfx-plus-card--${kind}${extraClass ? ` ${extraClass}` : ''}`,
    dataset: { lfxId: item.Id, lfxType: item.Type || '' },
    tabindex: '-1',
    role: 'listitem',
  });
}

function ariaFor(item) {
  if (item.Type === 'Episode' && item.SeriesName) return `${item.SeriesName} – ${item.Name || ''}`.trim();
  return item.Name || '';
}

/** Poster-Karte (2:3). opts.badge: Text (plusBadge) -> Overlay unten mit Mini-Badge, Logo, Meta. */
export function createPosterCard(item, { badge = null } = {}) {
  const url = posterUrl(item, 400) || null;
  const media = [];
  if (url) media.push(h('img', { class: 'lfx-card__img', src: url, alt: '', loading: 'lazy', decoding: 'async' }));
  else media.push(h('span', { class: 'lfx-card__title lfx-plus-card__fallback' }, displayTitle(item)));
  if (badge) {
    const logo = api.logoImage(item, { maxWidth: 360 });
    media.push(h('div', { class: 'lfx-plus-card__new' }, [
      h('span', { class: 'lfx-plus-badge' }, badge),
      logo ? h('img', { class: 'lfx-card__logo lfx-plus-card__logo', src: logo, alt: '', loading: 'lazy', decoding: 'async' }) : null,
      h('span', { class: 'lfx-plus-card__meta' }, yearGenres(item)),
    ]));
  }
  const link = h('a', { class: 'lfx-card__link', href: titleHref(item.Id), 'aria-label': ariaFor(item) }, media);
  const card = cardShell(item, 'poster', badge ? 'lfx-plus-card--new' : '');
  card.append(link);
  return card;
}

/** Weiterschauen-Karte (16:9) mit Fortschritt, Play-Kreis und drei Infozeilen. */
export function createResumeCard(item) {
  const img = landscapeFor(item, 600);
  const media = [];
  if (img) media.push(h('img', { class: 'lfx-card__img', src: img.url, alt: '', loading: 'lazy', decoding: 'async' }));
  else media.push(h('span', { class: 'lfx-card__title lfx-plus-card__fallback' }, displayTitle(item)));
  const p = progressPercent(item);
  if (p > 0) {
    media.push(h('div', { class: 'lfx-plus-progress' }, [
      h('div', { class: 'lfx-plus-progress__bar', style: { width: `${Math.round(p * 10) / 10}%` } }),
    ]));
  }
  const link = h('a', { class: 'lfx-card__link', href: titleHref(item.Id), 'aria-label': ariaFor(item) }, media);
  const playBtn = h('button', {
    type: 'button',
    class: 'lfx-plus-card__play lfx-card__action',
    'aria-label': `${displayTitle(item)} fortsetzen`,
    tabindex: '-1',
    onclick: (e) => { e.preventDefault(); e.stopPropagation(); play(item, { resume: true }); },
  }, [h('span', { class: 'lfx-plus-card__play-icon', 'aria-hidden': 'true' })]);
  const rest = remainingLabel(item);
  const info = h('div', { class: 'lfx-plus-card__info' }, [
    rest ? h('div', { class: 'lfx-plus-card__rest' }, rest) : null,
    h('div', { class: 'lfx-plus-card__name' }, displayTitle(item)),
    h('div', { class: 'lfx-plus-card__sub' }, [ratingBox(item), h('span', null, episodeLine(item))]),
  ]);
  const card = cardShell(item, 'resume');
  card.append(h('div', { class: 'lfx-plus-card__media' }, [link, playBtn]), info);
  return card;
}

export function createPlusCard(item, { kind = 'poster', badge = null } = {}) {
  return kind === 'resume' ? createResumeCard(item) : createPosterCard(item, { badge });
}
