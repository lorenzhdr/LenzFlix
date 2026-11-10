// LENZPRIME (Handy): Profil-Blatt als Bottom-Sheet (kein eigenes Feature; wird vom Avatar der Handy-Kopfzeile geöffnet).
// Einträge: Nutzer-Chip, „Neu & beliebt“, Bibliotheken, dann profileEntries() (Statistik, Design, Einstellungen, Dashboard, Abmelden).
import { h, mountPoint, unmountPoint, badgePill, badgedName } from '../../core/dom.js';
import { attachSwipeClose } from '../../core/swipe.js';
import { getLibraries } from '../../shared/libraries.js';
import { profileEntries, getUserChip } from '../../shared/profile.js';
import { hubHref } from '../../shared/routes.js';

const ID = 'lfx-prime-profilesheet';
const OPEN_CLASS = 'lfx-prime-profilesheet-open';
const FOCUSABLE = 'a[href], button:not([disabled])';

let cur = null;

export function isProfileSheetOpen() {
  return cur !== null;
}

export function closeProfileSheet({ restoreFocus = true } = {}) {
  const c = cur;
  if (!c) return;
  cur = null;
  if (c.detachSwipe) c.detachSwipe();
  window.removeEventListener('keydown', c.onKeydown, true);
  window.removeEventListener('hashchange', c.onHash);
  unmountPoint(c.root);
  document.documentElement.classList.remove(OPEN_CLASS);
  const back = c.returnFocus;
  if (restoreFocus && back && back.isConnected && typeof back.focus === 'function') {
    try { back.focus({ preventScroll: true }); } catch { /* Fokus ist optional */ }
  }
}

function entryNode(it, close) {
  const kids = [h('span', { class: 'lfx-prime-psheet__label' }, it.label)];
  if (it.badge) kids.push(badgePill(it.badge));
  const aria = badgedName(it.label, it.badge);
  const cls = `lfx-prime-psheet__item${it.className ? ` ${it.className}` : ''}`;
  const node = it.href
    ? h('a', { class: cls, href: it.href, 'aria-label': aria, dataset: { key: it.key || '' } }, kids)
    : h('button', { type: 'button', class: cls, 'aria-label': aria, dataset: { key: it.key || '' } }, kids);
  node.addEventListener('click', () => {
    close({ restoreFocus: false });
    if (typeof it.onClick === 'function') it.onClick();
  });
  return node;
}

function section(title, nodes) {
  return h('section', { class: 'lfx-prime-psheet__section' }, [
    title ? h('h3', { class: 'lfx-prime-psheet__head' }, title) : null,
    ...nodes,
  ]);
}

/** opts.returnFocus: Element, das beim Schließen den Fokus zurückbekommt. */
export function openProfileSheet({ returnFocus } = {}) {
  closeProfileSheet({ restoreFocus: false });
  const root = mountPoint(ID, { className: 'lfx-prime-psheet-overlay' });
  const who = h('div', { class: 'lfx-prime-psheet__who' });
  const body = h('div', { class: 'lfx-prime-psheet__body' });
  const sheet = h('div', { class: 'lfx-prime-psheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Profil', tabindex: '-1' }, [
    h('span', { class: 'lfx-prime-psheet__grip', 'aria-hidden': 'true' }),
    who,
    body,
  ]);
  root.replaceChildren(sheet);

  const c = { root, sheet, returnFocus: returnFocus || null };
  cur = c;
  const close = (opts) => { if (cur === c) closeProfileSheet(opts); };

  c.onKeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      close();
    } else if (e.key === 'Tab') {
      const list = [...sheet.querySelectorAll(FOCUSABLE)];
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement;
      if (!sheet.contains(active)) { e.preventDefault(); first.focus(); }
      else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
  };
  c.onHash = () => close({ restoreFocus: false });
  root.addEventListener('click', (e) => { if (e.target === root) close(); });
  window.addEventListener('keydown', c.onKeydown, true);
  window.addEventListener('hashchange', c.onHash);
  if (typeof attachSwipeClose === 'function') {
    c.detachSwipe = attachSwipeClose(sheet, { onClose: () => close(), backdrop: root });
  }
  document.documentElement.classList.add(OPEN_CLASS);
  sheet.focus({ preventScroll: true });

  // Inhalte nachladen
  const mine = c;
  (async () => {
    const [chip, libs, entries] = await Promise.all([
      getUserChip().catch(() => ({ name: '', imageUrl: null })),
      getLibraries().catch(() => []),
      profileEntries({ theme: 'prime', returnFocus }).catch(() => []),
    ]);
    if (cur !== mine) return;
    const initial = (chip.name || '?').trim().charAt(0).toUpperCase() || '?';
    who.replaceChildren(
      h('span', { class: 'lfx-prime-psheet__avatar', 'aria-hidden': 'true' }, chip.imageUrl
        ? h('img', { src: chip.imageUrl, alt: '', draggable: 'false' })
        : h('span', null, initial)),
      h('span', { class: 'lfx-prime-psheet__name' }, chip.name || 'Profil'),
    );
    const nav = [{ key: 'new', label: 'Neu & beliebt', href: '#/home?lfx=new' }];
    const libNodes = (libs || []).map((l) => ({ key: `lib:${l.id}`, label: l.name, href: l.hubCapable ? hubHref(l.id) : l.href }));
    body.replaceChildren(...[
      section(null, nav.map((it) => entryNode(it, close))),
      libNodes.length ? section('Bibliotheken', libNodes.map((it) => entryNode(it, close))) : null,
      section(null, entries.filter((it) => it && !it.hidden).map((it) => entryNode(it, close))),
    ].filter(Boolean));
    const first = body.querySelector(FOCUSABLE);
    if (first && document.activeElement === sheet) first.focus({ preventScroll: true });
  })();
  return { close };
}
