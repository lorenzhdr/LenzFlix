// LenzFlix rows: Karten-Markup nach docs/js-contracts.md.
import { h } from '../../core/dom.js';
import * as api from '../../core/api.js';
import { progressPercent } from './logic.js';

export function detailHref(item) {
  const serverId = item.ServerId || api.getAuth().serverId || '';
  return `#/details?id=${encodeURIComponent(item.Id)}${serverId ? `&serverId=${encodeURIComponent(serverId)}` : ''}`;
}

function displayTitle(item) {
  return item.Type === 'Episode' && item.SeriesName ? item.SeriesName : item.Name || '';
}

function ariaLabel(item) {
  if (item.Type === 'Episode' && item.SeriesName) return `${item.SeriesName} – ${item.Name || ''}`.trim();
  return item.Name || '';
}

/** Querformat-Bild; Episoden bevorzugen ihr eigenes Bild. Rückgabe {url, isThumb} oder null. */
export function landscapeFor(item, maxWidth = 600) {
  if (item.Type === 'Episode') {
    for (const type of ['Thumb', 'Primary']) {
      const url = api.imageUrl(item, { type, maxWidth, quality: 85 });
      if (url) return { url, isThumb: false };
    }
  }
  const url = api.landscapeImage(item, { maxWidth });
  if (!url) return null;
  const pick = api.pickLandscape(item);
  return { url, isThumb: Boolean(pick && pick.type === 'Thumb') };
}

/** Hochformat-Poster (2:3); Episoden nutzen das Serien-Primary. */
export function posterUrl(item, maxWidth = 300) {
  if (item.Type === 'Episode') {
    return item.SeriesId && item.SeriesPrimaryImageTag
      ? api.imageUrlFor(item.SeriesId, { type: 'Primary', maxWidth, quality: 85, tag: item.SeriesPrimaryImageTag })
      : null;
  }
  return api.imageUrl(item, { type: 'Primary', maxWidth, quality: 85 });
}

/** opts: {badge: string|null, kind: 'landscape'|'resume'|'top10', rank: number} */
export function createCard(item, opts = {}) {
  const { badge = null, kind = 'landscape', rank = 0 } = opts;
  const title = displayTitle(item);
  let link;
  if (kind === 'top10') {
    const url = api.imageUrl(item, { type: 'Primary', maxWidth: 300, quality: 85 }) || api.landscapeImage(item, { maxWidth: 300 });
    link = h('a', { class: 'lfx-card__link', href: detailHref(item), 'aria-label': ariaLabel(item) }, [
      url
        ? h('img', { class: 'lfx-card__img', src: url, alt: '', loading: 'lazy', decoding: 'async' })
        : h('span', { class: 'lfx-card__title' }, title),
    ]);
  } else {
    const img = landscapeFor(item);
    const poster = kind === 'landscape' ? posterUrl(item) : null; // nur Poster-Zeilen (nicht Weiterschauen/Top 10)
    const children = [];
    const src = img ? img.url : poster;
    if (src) {
      const imgEl = h('img', { class: 'lfx-card__img', src, alt: '', loading: 'lazy', decoding: 'async' });
      children.push(poster
        ? h('picture', null, [h('source', { media: '(max-width: 799px)', srcset: poster }), imgEl])
        : imgEl);
    }
    const titled = !img || !img.isThumb;
    if (titled) {
      const logo = api.logoImage(item, { maxWidth: 400 });
      children.push(logo
        ? h('img', { class: 'lfx-card__logo', src: logo, alt: '', loading: 'lazy', decoding: 'async' })
        : h('span', { class: 'lfx-card__title' }, title));
    }
    link = h('a', {
      class: `lfx-card__link${titled ? ' lfx-card__link--titled' : ''}`,
      href: detailHref(item),
      'aria-label': ariaLabel(item),
    }, children);
  }

  const card = h('div', {
    class: `lfx-card${kind === 'top10' ? ' lfx-card--top10' : ''}`,
    dataset: { lfxId: item.Id, lfxType: item.Type || '' },
    tabindex: '-1',
    role: 'listitem',
  });
  if (kind === 'top10' && rank) {
    card.append(h('span', { class: `lfx-card__rank${rank >= 10 ? ' lfx-card__rank--wide' : ''}`, 'aria-hidden': 'true' }, String(rank)));
  }
  card.append(link);
  if (badge) card.append(h('span', { class: 'lfx-badge' }, badge));
  if (kind === 'resume') {
    const p = progressPercent(item);
    if (p > 0) {
      card.append(h('div', { class: 'lfx-progress' }, [
        h('div', { class: 'lfx-progress__bar', style: { width: `${Math.round(p * 10) / 10}%` } }),
      ]));
    }
  }
  return card;
}
