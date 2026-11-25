// Profil-Blatt als Bottom-Sheet (gemeinsamer Baustein, Klassen aus `prefix`; LENZPRIME-Handy und weitere Designs).
// load() liefert { chip: { name, imageUrl }, sections: [{ title?, items }] }; Einträge wie bei openPopover (href → <a>, separator, switch).
import { h, mountPoint, unmountPoint } from '../core/dom.js';
import { attachSwipeClose } from '../core/swipe.js';
import { switchButton, releaseSwitches } from '../core/switch.js';
import { tidyItems } from '../core/popover.js';

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
  releaseSwitches(c.root);
  unmountPoint(c.root);
  document.documentElement.classList.remove(c.openClass);
  const back = c.returnFocus;
  if (restoreFocus && back && back.isConnected && typeof back.focus === 'function') {
    try { back.focus({ preventScroll: true }); } catch { /* Fokus ist optional */ }
  }
}

function entryNode(it, close, p) {
  if (it.separator) return h('div', { class: `${p}__sep`, role: 'separator' });
  if (it.switch) {
    return switchButton(it, { className: `${p}__item ${p}__item--switch`, role: 'switch', labelClass: `${p}__label` });
  }
  const kids = [h('span', { class: `${p}__label` }, it.label)];
  const cls = `${p}__item${it.className ? ` ${it.className}` : ''}`;
  const node = it.href
    ? h('a', { class: cls, href: it.href, dataset: { key: it.key || '' } }, kids)
    : h('button', { type: 'button', class: cls, dataset: { key: it.key || '' } }, kids);
  node.addEventListener('click', () => {
    close({ restoreFocus: false });
    if (typeof it.onClick === 'function') it.onClick();
  });
  return node;
}

function section(title, nodes, p) {
  return h('section', { class: `${p}__section` }, [
    title ? h('h3', { class: `${p}__head` }, title) : null,
    ...nodes,
  ]);
}

/** opts: id (Mount-ID), prefix (Klassenpräfix), openClass (<html>-Klasse), label, returnFocus, load(). */
export function openProfileSheet({ id, prefix, openClass, label = 'Profil', returnFocus, load } = {}) {
  closeProfileSheet({ restoreFocus: false });
  const p = prefix;
  const root = mountPoint(id, { className: `${p}-overlay` });
  const who = h('div', { class: `${p}__who` });
  const body = h('div', { class: `${p}__body` });
  const sheet = h('div', { class: p, role: 'dialog', 'aria-modal': 'true', 'aria-label': label, tabindex: '-1' }, [
    h('span', { class: `${p}__grip`, 'aria-hidden': 'true' }),
    who,
    body,
  ]);
  root.replaceChildren(sheet);

  const c = { root, sheet, openClass, returnFocus: returnFocus || null };
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
  document.documentElement.classList.add(openClass);
  sheet.focus({ preventScroll: true });

  // Inhalte nachladen
  (async () => {
    let data;
    try { data = typeof load === 'function' ? await load() : null; } catch { data = null; }
    if (cur !== c) return;
    const chip = (data && data.chip) || { name: '', imageUrl: null };
    const initial = (chip.name || '?').trim().charAt(0).toUpperCase() || '?';
    who.replaceChildren(
      h('span', { class: `${p}__avatar`, 'aria-hidden': 'true' }, chip.imageUrl
        ? h('img', { src: chip.imageUrl, alt: '', draggable: 'false' })
        : h('span', null, initial)),
      h('span', { class: `${p}__name` }, chip.name || label),
    );
    const secs = ((data && data.sections) || [])
      .map((s) => ({ title: s.title, items: tidyItems(s.items) }))
      .filter((s) => s.items.length);
    body.replaceChildren(...secs.map((s) => section(s.title, s.items.map((it) => entryNode(it, close, p)), p)));
    const first = body.querySelector(FOCUSABLE);
    if (first && document.activeElement === sheet) first.focus({ preventScroll: true });
  })();
  return { close };
}
