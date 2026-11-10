// LENZPRIME: Karten-Markup (Kartenvertrag .lfx-card[data-lfx-id][data-lfx-type] mit __link/__img, plus Modifier lfx-prime-card--*).
import { h } from '../../core/dom.js';
import * as api from '../../core/api.js';
import { detailHref, landscapeFor, posterUrl } from '../rows/card.js';
import { progressPercent } from '../rows/logic.js';
import { openTitleMenu } from '../../shared/titleactions.js';

const TICKS_PER_MIN = 600000000;
const DOTS = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="5" r="2" fill="currentColor"/><circle cx="12" cy="12" r="2" fill="currentColor"/><circle cx="12" cy="19" r="2" fill="currentColor"/></svg>';

/** "Noch 19 Min." / "Noch 1 Std. 8 Min."; leer ohne bekannte Restzeit. */
export function remainingText(item) {
  const ud = item && item.UserData;
  if (!ud || !(ud.PlaybackPositionTicks > 0) || !(item.RunTimeTicks > 0)) return '';
  const left = Math.round((item.RunTimeTicks - ud.PlaybackPositionTicks) / TICKS_PER_MIN);
  if (left <= 0) return '';
  return left >= 60 ? `Noch ${Math.floor(left / 60)} Std. ${left % 60} Min.` : `Noch ${left} Min.`;
}

const displayTitle = (item) => (item.Type === 'Episode' && item.SeriesName ? item.SeriesName : item.Name || '');
const ariaLabel = (item) => (item.Type === 'Episode' && item.SeriesName ? `${item.SeriesName} – ${item.Name || ''}`.trim() : item.Name || '');

/**
 * kind: 'landscape' (16:9) | 'resume' (16:9 + Fortschritt) | 'top10' (16:9 + Rangziffer) | 'poster' (2:3).
 * opts: { kind, badge: string|null, rank: number }
 */
export function createPrimeCard(item, { kind = 'landscape', badge = null, rank = 0 } = {}) {
  const poster = kind === 'poster';
  const wide = landscapeFor(item);
  const pUrl = poster ? posterUrl(item, 400) : null;
  const src = poster ? (pUrl || (wide && wide.url)) : (wide ? wide.url : posterUrl(item, 400));
  // Titel/Logo nur, wenn kein echtes Querformat-Bild (Thumb) vorliegt; Poster tragen ihren Titel im Bild.
  const titled = !poster && (!wide || !wide.isThumb);
  const children = [];
  if (src) children.push(h('img', { class: 'lfx-card__img', src, alt: '', loading: 'lazy', decoding: 'async' }));
  if (titled) {
    const logo = api.logoImage(item, { maxWidth: 400 });
    children.push(logo
      ? h('img', { class: 'lfx-card__logo', src: logo, alt: '', loading: 'lazy', decoding: 'async' })
      : h('span', { class: 'lfx-card__title' }, displayTitle(item)));
  }
  const classes = ['lfx-card', 'lfx-prime-card', poster ? 'lfx-prime-card--poster' : 'lfx-prime-card--wide'];
  if (kind === 'top10') classes.push('lfx-prime-card--ranked');
  const card = h('div', {
    class: classes.join(' '),
    dataset: { lfxId: item.Id, lfxType: item.Type || '' },
    tabindex: '-1',
    role: 'listitem',
  });
  if (kind === 'top10' && rank) {
    card.append(h('span', { class: `lfx-prime-card__rank${rank >= 10 ? ' lfx-prime-card__rank--wide' : ''}`, 'aria-hidden': 'true' }, String(rank)));
  }
  // Badge, Karten-Zeichen und Fortschritt liegen im Link: Er schneidet mit dem Kartenradius ab.
  if (badge) children.push(h('span', { class: 'lfx-prime-badge' }, badge));
  children.push(h('span', { class: 'lfx-prime-card__mark', 'aria-hidden': 'true' }));
  if (kind === 'resume') {
    const p = progressPercent(item);
    if (p > 0) {
      children.push(h('div', { class: 'lfx-prime-card__progress' }, [
        h('div', { class: 'lfx-prime-card__bar', style: { width: `${Math.round(p * 10) / 10}%` } }),
      ]));
    }
  }
  card.append(h('a', {
    class: `lfx-card__link${titled ? ' lfx-card__link--titled' : ''}`,
    href: detailHref(item),
    'aria-label': ariaLabel(item),
  }, children));
  if (kind === 'resume') card.append(resumeFoot(item)); // nur am Handy sichtbar (CSS), Desktop zeigt die Fußzeile nicht
  return card;
}

/** Fußzeile der Fortsetzen-Karte: Restzeit + Drei-Punkte-Knopf (Titelmenü). */
function resumeFoot(item) {
  const menu = h('button', { type: 'button', class: 'lfx-prime-card__menu', 'aria-label': `Weitere Optionen: ${ariaLabel(item)}`, 'aria-haspopup': 'menu' });
  menu.innerHTML = DOTS;
  menu.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openTitleMenu(item, menu);
  });
  return h('div', { class: 'lfx-prime-card__foot' }, [
    h('span', { class: 'lfx-prime-card__remaining' }, remainingText(item)),
    menu,
  ]);
}
