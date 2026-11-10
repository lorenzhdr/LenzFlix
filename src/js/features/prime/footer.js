// LENZPRIME: „Mehr“-Button und Fußzeile (Wortmarke per CSS-Hintergrund, Links: Statistik, Design-Auswahl).
import { h, badgePill, badgedName } from '../../core/dom.js';
import { statsHref, STATS_LABEL } from '../../core/stats.js';
import { openThemePicker } from '../../core/themepicker.js';

/** Grauer „Mehr“-Button; onClick bekommt den Button (zum Sperren während des Ladens). */
export function buildMoreButton(onClick) {
  const btn = h('button', { type: 'button', class: 'lfx-prime-more' }, 'Mehr');
  btn.addEventListener('click', () => onClick(btn));
  return btn;
}

export function buildFooter() {
  const href = statsHref('prime');
  const picker = h('button', { type: 'button', class: 'lfx-prime-footer__link', 'aria-label': badgedName('Design Einstellungen', 'Beta') }, ['Design Einstellungen', badgePill('Beta')]);
  picker.addEventListener('click', () => openThemePicker({ returnFocus: picker }));
  const links = [
    href ? h('a', { class: 'lfx-prime-footer__link', href }, STATS_LABEL) : null,
    picker,
  ];
  return h('footer', { class: 'lfx-prime-footer' }, [
    h('span', { class: 'lfx-prime-footer__mark', role: 'img', 'aria-label': 'LENZPRIME' }),
    h('nav', { class: 'lfx-prime-footer__links', 'aria-label': 'Fußzeile' }, links),
    h('p', { class: 'lfx-prime-footer__note' }, 'LENZPRIME für Jellyfin'),
  ]);
}
