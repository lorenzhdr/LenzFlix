// LenzFlix: Sheet-Hülle (Overlay, Titel, Liste, Fokusfalle, Swipe) für Auswahl- und Bestätigungsdialoge.
// Es gibt genau EIN aktives Sheet.
import { h, mountPoint, unmountPoint } from './dom.js';
import { computeMenuPosition, anchorRect } from './itemmenu.js';
import { attachSwipeClose } from './swipe.js';

const SHEET_ID = 'lfx-sheet';

let current = null;

export function isChooserOpen() {
  return current !== null;
}

/** Aktuell offenes Sheet oder null. */
export function getSheet() {
  return current;
}

/** True, wenn c das aktuell offene Sheet ist (nach async-Schritten prüfen). */
export function isCurrent(c) {
  return current !== null && current === c;
}

export function closeChooser() {
  const c = current;
  if (!c) return;
  current = null;
  if (c.detachSwipe) c.detachSwipe();
  window.removeEventListener('keydown', c.onKeydown, true);
  c.overlay.removeEventListener('click', c.onOverlayClick);
  unmountPoint(c.overlay);
  document.documentElement.classList.remove('lfx-sheet-open');
  const a = c.anchorEl;
  if (a && typeof a.focus === 'function' && a.isConnected) {
    try {
      a.focus({ preventScroll: true });
    } catch {
      /* Fokus ist optional */
    }
  }
}

export function renderSheet(c, title, entries) {
  c.title.textContent = title;
  c.list.replaceChildren(
    ...entries.map(({ label, note, onClick, disabled, primary }) =>
      h(
        'button',
        {
          type: 'button',
          class: `lfx-sheet__item${primary ? ' lfx-sheet__item--primary' : ''}`,
          disabled: disabled ? true : null,
          onclick: onClick,
        },
        note
          ? [h('span', { class: 'lfx-sheet__text' }, [h('span', null, [label]), h('span', { class: 'lfx-sheet__note' }, [note])])]
          : [label],
      ),
    ),
  );
  const first = c.list.querySelector('button:not([disabled])');
  if (first) first.focus({ preventScroll: true });
}

/** Öffnet ein leeres Sheet (schließt ein vorhandenes zuerst) und gibt den Kontext zurück. */
export function openSheet(anchorEl, label) {
  closeChooser();
  const overlay = mountPoint(SHEET_ID, { className: 'lfx-sheet-overlay' });
  const title = h('h2', { class: 'lfx-sheet__title' }, [label || '']);
  const list = h('div', { class: 'lfx-sheet__list' });
  const sheet = h('div', { class: 'lfx-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': label || '' }, [title, list]);
  overlay.replaceChildren(sheet);

  const pos = computeMenuPosition(anchorEl ? anchorRect(anchorEl) : { left: 0, right: window.innerWidth, top: 0, bottom: 0 });
  sheet.style.setProperty('--lfx-sheet-x', `${Math.round(pos.x)}px`);
  sheet.style.setProperty('--lfx-sheet-y', `${Math.round(pos.y)}px`);

  const c = { overlay, sheet, title, list, anchorEl };
  c.onKeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      closeChooser();
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = [...sheet.querySelectorAll('button:not([disabled])')];
    if (!focusable.length) {
      e.preventDefault();
      return;
    }
    const firstEl = focusable[0];
    const lastEl = focusable[focusable.length - 1];
    const active = document.activeElement;
    if (!sheet.contains(active)) {
      e.preventDefault();
      firstEl.focus();
    } else if (e.shiftKey && active === firstEl) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && active === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  };
  c.onOverlayClick = (e) => {
    if (e.target === overlay) closeChooser();
  };
  window.addEventListener('keydown', c.onKeydown, true);
  overlay.addEventListener('click', c.onOverlayClick);
  if (typeof window.matchMedia === 'function' && window.matchMedia('(hover: none), (max-width: 799px)').matches) {
    c.detachSwipe = attachSwipeClose(sheet, { onClose: () => { if (current === c) closeChooser(); } });
  }
  document.documentElement.classList.add('lfx-sheet-open');
  current = c;

  sheet.setAttribute('tabindex', '-1');
  sheet.focus({ preventScroll: true });
  return c;
}

/** Bestätigungsdialog: Primäraktion (schließt zuerst das Sheet) und „Abbrechen“. */
export function confirmAction({ title, confirmLabel, anchorEl, onConfirm } = {}) {
  const c = openSheet(anchorEl, title);
  renderSheet(c, title, [
    {
      label: confirmLabel,
      primary: true,
      onClick: () => {
        closeChooser();
        if (typeof onConfirm === 'function') onConfirm();
      },
    },
    { label: 'Abbrechen', onClick: () => closeChooser() },
  ]);
  return c;
}
