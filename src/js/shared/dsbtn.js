// LenzFlix: Datensparmodus-Symbol der Kopfleisten (flix/plus/prime). Sichtbar nur bei aktivem Modus (html.lfx-datasaver, rein per CSS).
// Klick öffnet ein Mini-Popover „Datensparmodus ist an“ mit „Ausschalten“; zweiter Klick schließt es wieder.
import { h } from '../core/dom.js';
import { ICON_DATASAVER } from '../core/icons.js';
import { openPopover, closePopover, isPopoverOpen } from '../core/popover.js';
import { setDataSaver } from '../core/datasaver.js';

const LABEL = 'Datensparmodus an';

/** el: vorhandenes Element (z. B. mountPoint) ausstatten, sonst neuer <button>. */
export function createDataSaverButton({ className = '', el } = {}) {
  const btn = el || h('button', { type: 'button' });
  btn.classList.add('lfx-dsbtn');
  if (className) btn.classList.add(...className.split(' '));
  btn.setAttribute('aria-label', LABEL);
  btn.setAttribute('aria-haspopup', 'menu');
  btn.title = LABEL;
  btn.innerHTML = ICON_DATASAVER;
  btn.addEventListener('click', () => {
    if (isPopoverOpen() && btn.getAttribute('aria-expanded') === 'true') {
      closePopover({ restoreFocus: true });
      return;
    }
    openPopover(btn, {
      label: 'Datensparmodus',
      items: [
        { note: true, key: 'ds-note', label: 'Datensparmodus ist an' },
        { key: 'ds-off', label: 'Ausschalten', onClick: () => setDataSaver(false) },
      ],
    });
  });
  return btn;
}
