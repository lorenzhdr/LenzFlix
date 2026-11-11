// VIDEOTHEK LENZ: gemeinsame UI-Bausteine von HUD (home.js) und Leiste (bar.js): Wortmarke, Knöpfe, Profilmenü.
import { h } from '../../core/dom.js';
import { openPopover, closePopover, isPopoverOpen } from '../../core/popover.js';
import { getUserChip, profileEntries } from '../../shared/profile.js';

const svg = (p) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${p}</svg>`;
export const ICONS = {
  search: svg('<path d="M10 3a7 7 0 1 0 4.2 12.6l4.6 4.6 1.4-1.4-4.6-4.6A7 7 0 0 0 10 3zm0 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10z"/>'),
  classic: svg('<path d="M3 4h8v7H3zm10 0h8v7h-8zM3 13h8v7H3zm10 0h8v7h-8z"/>'),
  enter: svg('<path d="M4 3h9v2H6v14h7v2H4zm11.6 5.4L21.2 12l-5.6 3.6V13H9v-2h6.600z"/>'),
};

function buttonKids(label, icon) {
  const ic = h('span', { class: 'lfx-store-btn__icon', 'aria-hidden': 'true' });
  ic.innerHTML = ICONS[icon] || '';
  return [ic, h('span', { class: 'lfx-store-btn__text' }, label)];
}

/** Knopf mit Symbol + Text (Text entfällt per CSS < 800 px). */
export function hudButton(cls, label, icon) {
  return h('button', { type: 'button', class: `lfx-store-btn ${cls}`, 'aria-label': label, title: label }, buttonKids(label, icon));
}

export function hudLink(cls, label, icon, href) {
  return h('a', { class: `lfx-store-btn ${cls}`, href, 'aria-label': label, title: label }, buttonKids(label, icon));
}

export function wordmark(tag = 'span') {
  return h(tag, { class: 'lfx-store-mark' }, [
    h('span', { class: 'lfx-store-mark__a' }, 'VIDEOTHEK'),
    h('span', { class: 'lfx-store-mark__b' }, 'LENZ'),
  ]);
}

const PROFILE_CLASS = 'lfx-store-profile';
let busy = false;

function profileIsOpen() {
  const el = document.getElementById('lfx-popover');
  return isPopoverOpen() && Boolean(el && el.classList.contains(PROFILE_CLASS));
}

export function closeProfileMenu() {
  if (profileIsOpen()) closePopover();
}

/** Profilmenü an einem Anker umschalten (Einträge aus shared/profile.js). */
export async function toggleProfileMenu(anchor) {
  if (profileIsOpen()) { closePopover({ restoreFocus: true }); return; }
  if (busy) return;
  busy = true;
  try {
    const items = await profileEntries({ theme: 'store', returnFocus: anchor });
    if (!anchor.isConnected) return;
    openPopover(anchor, { label: 'Profil', items, align: 'end', className: PROFILE_CLASS });
  } finally {
    busy = false;
  }
}

/** Profilknopf mit Avatar/Initial; lädt den Chip asynchron. Rückgabe: { el, destroy }. */
export function profileButton() {
  let alive = true;
  const btn = h('button', { type: 'button', class: 'lfx-store-avatar', 'aria-label': 'Profil', 'aria-haspopup': 'true' }, [
    h('span', { class: 'lfx-store-avatar__initial', 'aria-hidden': 'true' }, '?'),
  ]);
  btn.addEventListener('click', () => toggleProfileMenu(btn));
  getUserChip({ retries: 20, isAlive: () => alive }).then((chip) => {
    if (!alive) return;
    btn.replaceChildren();
    if (chip.imageUrl) btn.append(h('img', { src: chip.imageUrl, alt: '', draggable: 'false' }));
    else btn.append(h('span', { class: 'lfx-store-avatar__initial', 'aria-hidden': 'true' }, (chip.name || '?').trim().charAt(0).toUpperCase() || '?'));
    if (chip.name) btn.setAttribute('aria-label', `Profil: ${chip.name}`);
  }).catch(() => {});
  return { el: btn, destroy() { alive = false; } };
}
