// LENZPRIME: Inhalt der Hover-Ansichten (Popup für 16:9-Karten, aufgeklapptes Poster): Titel, Knöpfe, Rangzeile, Meta, Beschreibung.
import { logoImage } from '../../core/api.js';
import { ICON_EYE, ICON_EYE_CHECK, ICON_MORE } from '../../core/icons.js';
import { h } from '../../core/dom.js';
import { titleHref } from '../../shared/routes.js';
import { openTitleMenu, toggleFavorite, togglePlayed } from '../../shared/titleactions.js';
import { heroTrendLine } from '../../shared/trend.js';
import { formatRating, formatRuntime, formatSeasons } from '../billboard/format.js';
import * as data from '../modal/data.js';
import { ICON_CHECK, ICON_INFO, ICON_PLAY, ICON_PLUS, ICON_TREND, svgIcon } from './hero.js';
import { playLabel, playTitle } from './hero-play.js';

const displayName = (item) => (item.Type === 'Episode' && item.SeriesName ? item.SeriesName : item.Name || '');

/** „7,5“ aus CommunityRating (0–10) oder ''. */
export function ratingLabel(item) {
  const r = Number(item && item.CommunityRating);
  return r > 0 ? r.toFixed(1).replace('.', ',') : '';
}

/** Meta-Zeile: FSK-Chip, ★ Bewertung, Jahr, Laufzeit/Staffeln. */
export function buildMeta(item) {
  const parts = [];
  const fsk = formatRating(item.OfficialRating);
  if (fsk) parts.push(h('span', { class: 'lfx-prime-chip' }, fsk));
  const rating = ratingLabel(item);
  if (rating) parts.push(h('span', { class: 'lfx-prime-meta__rating' }, `★ ${rating}`));
  if (item.ProductionYear) parts.push(h('span', null, String(item.ProductionYear)));
  const extra = item.Type === 'Series' ? formatSeasons(item.ChildCount) : formatRuntime(item.RunTimeTicks);
  if (extra) parts.push(h('span', null, extra));
  return h('div', { class: 'lfx-prime-meta' }, parts);
}

function roundButton(mod, label, icon, onClick) {
  const b = h('button', { type: 'button', class: `lfx-prime-hc__round lfx-prime-hc__round--${mod}`, title: label, 'aria-label': label });
  if (icon) b.append(icon);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(b);
  });
  return b;
}

function htmlIcon(markup) {
  const s = h('span', { class: 'lfx-prime-hc__ico', 'aria-hidden': 'true' });
  s.innerHTML = markup;
  return s;
}

/**
 * variant 'popup' (Gesehen + Mehr, große Knöpfe) | 'expand' (Info-Link, kleine Knöpfe).
 * ctx: { trend, isCurrent() } – isCurrent schützt asynchrone Beschriftung.
 */
export function buildTitleInfo(item, variant, { trend = null, isCurrent = () => true } = {}) {
  const popup = variant === 'popup';
  const logo = !popup ? logoImage(item, { maxWidth: 400 }) : null;

  // Abspielen
  const label = h('span', { class: 'lfx-prime-hc__label' });
  const play = h('button', { type: 'button', class: 'lfx-prime-hc__play' }, [svgIcon(ICON_PLAY), label]);
  const paintPlay = (state) => {
    label.replaceChildren(
      h('span', null, state.line1),
      state.line2 ? h('span', { class: 'lfx-prime-hc__label2' }, state.line2) : null,
    );
    play.classList.toggle('is-two', Boolean(state.line2));
  };
  paintPlay(playLabel(item));
  if (item.Type === 'Series') {
    data.loadNextUp(item.Id).then((ep) => {
      if (isCurrent() && play.isConnected) paintPlay(playLabel(item, ep));
    }, () => {});
  }
  play.addEventListener('click', (e) => {
    e.stopPropagation();
    playTitle(item);
  });

  // Meine Liste
  const list = roundButton('list', 'Meine Liste', null, async (b) => {
    await toggleFavorite(item);
    if (b.isConnected) paintList();
  });
  function paintList() {
    const on = Boolean(item.UserData && item.UserData.IsFavorite);
    list.replaceChildren(svgIcon(on ? ICON_CHECK : ICON_PLUS));
    list.classList.toggle('is-on', on);
    list.setAttribute('aria-pressed', on ? 'true' : 'false');
    list.setAttribute('aria-label', on ? 'Aus Meine Liste entfernen' : 'Zu Meine Liste hinzufügen');
    list.title = list.getAttribute('aria-label');
  }
  paintList();

  const buttons = [play, list];
  if (popup) {
    const seen = roundButton('seen', 'Gesehen', null, async (b) => {
      await togglePlayed(item, { anchorEl: b });
      if (b.isConnected) paintSeen();
    });
    const paintSeen = () => {
      const on = Boolean(item.UserData && item.UserData.Played);
      seen.replaceChildren(htmlIcon(on ? ICON_EYE_CHECK : ICON_EYE));
      seen.classList.toggle('is-on', on);
      seen.setAttribute('aria-pressed', on ? 'true' : 'false');
      seen.setAttribute('aria-label', on ? 'Als ungesehen markieren' : 'Als gesehen markieren');
      seen.title = seen.getAttribute('aria-label');
    };
    paintSeen();
    const more = roundButton('more', 'Mehr', htmlIcon(ICON_MORE), (b) => { openTitleMenu(item, b); });
    more.setAttribute('aria-haspopup', 'menu');
    buttons.push(seen, more);
  } else {
    buttons.push(h('a', {
      class: 'lfx-prime-hc__round lfx-prime-hc__round--info',
      href: titleHref(item.Id),
      title: 'Weitere Informationen',
      'aria-label': 'Weitere Informationen',
    }, [svgIcon(ICON_INFO)]));
  }

  const rank = heroTrendLine(item, trend);
  const desc = item.Overview ? h('p', { class: 'lfx-prime-hc__desc' }, item.Overview) : null;
  return h('div', { class: `lfx-prime-hc lfx-prime-hc--${variant}` }, [
    logo
      ? h('img', { class: 'lfx-prime-hc__logo', src: logo, alt: displayName(item), decoding: 'async' })
      : h('h4', { class: 'lfx-prime-hc__title' }, displayName(item)),
    h('div', { class: 'lfx-prime-hc__buttons' }, buttons),
    rank ? h('div', { class: 'lfx-prime-hc__rank' }, [svgIcon(ICON_TREND), h('span', null, rank)]) : null,
    buildMeta(item),
    desc,
  ]);
}
