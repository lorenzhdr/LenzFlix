// LenzFlix: kleines Menü-Popover (Singleton #lfx-popover) unter einem Anker.
// Für Profil-/Bibliotheksmenüs der Designs. Klicks auf den Anker selbst zählen nicht als „außerhalb“,
// der Aufrufer schaltet dort per isPopoverOpen()/closePopover() um.
import { h, mountPoint, unmountPoint, badgePill, badgedName } from './dom.js';

const ID = 'lfx-popover';
const GAP = 8;
const MARGIN = 8;

let current = null;

export function isPopoverOpen() {
  return current !== null;
}

export function closePopover({ restoreFocus = false } = {}) {
  const c = current;
  if (!c) return;
  current = null;
  window.removeEventListener('keydown', c.onKeydown, true);
  document.removeEventListener('click', c.onDocClick, true);
  window.removeEventListener('resize', c.onClose);
  window.removeEventListener('scroll', c.onScroll, true);
  unmountPoint(c.el);
  if (c.anchorEl) {
    c.anchorEl.removeAttribute('aria-expanded');
    if (c.hadExpanded !== null) c.anchorEl.setAttribute('aria-expanded', c.hadExpanded);
    if (restoreFocus && c.anchorEl.isConnected && typeof c.anchorEl.focus === 'function') {
      try {
        c.anchorEl.focus({ preventScroll: true });
      } catch {
        /* Fokus ist optional */
      }
    }
  }
}

function place(el, anchorEl, align) {
  const vw = window.innerWidth || document.documentElement.clientWidth || 0;
  const vh = window.innerHeight || document.documentElement.clientHeight || 0;
  const a = anchorEl.getBoundingClientRect();
  const w = el.offsetWidth;
  const hgt = el.offsetHeight;
  let left = align === 'start' ? a.left : a.right - w;
  let top = a.bottom + GAP;
  if (vw) left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
  if (vh && top + hgt > vh - MARGIN) top = Math.max(MARGIN, a.top - GAP - hgt);
  el.style.left = `${Math.round(left)}px`;
  el.style.top = `${Math.round(top)}px`;
}

/** items: [{ key, label, href?, onClick?, className?, icon? (SVG-String), badge? (z. B. 'Beta'), hidden? }] */
export function openPopover(anchorEl, { label, items = [], align = 'end', className = '' } = {}) {
  closePopover();
  const el = mountPoint(ID, { className: `lfx-popover${className ? ` ${className}` : ''}` });
  el.className = `lfx-popover${className ? ` ${className}` : ''}`;
  el.setAttribute('role', 'menu');
  if (label) el.setAttribute('aria-label', label);

  const list = items.filter((it) => it && !it.hidden);
  const nodes = list.map((it) => {
    const cls = `lfx-popover__item${it.className ? ` ${it.className}` : ''}`;
    const kids = [];
    if (it.icon) {
      const ic = h('span', { class: 'lfx-popover__icon', 'aria-hidden': 'true' });
      ic.innerHTML = it.icon;
      kids.push(ic);
    }
    kids.push(h('span', { class: 'lfx-popover__label' }, it.label));
    if (it.badge) kids.push(badgePill(it.badge));
    const aria = badgedName(it.label, it.badge);
    const node = it.href
      ? h('a', { class: cls, role: 'menuitem', href: it.href, 'aria-label': aria, dataset: { key: it.key } }, kids)
      : h('button', { type: 'button', class: cls, role: 'menuitem', 'aria-label': aria, dataset: { key: it.key } }, kids);
    node.addEventListener('click', () => {
      closePopover();
      if (typeof it.onClick === 'function') it.onClick();
    });
    return node;
  });
  el.replaceChildren(...nodes);

  const c = { el, anchorEl, hadExpanded: anchorEl ? anchorEl.getAttribute('aria-expanded') : null };
  c.close = () => {
    if (current === c) closePopover({ restoreFocus: true });
  };
  c.onClose = () => {
    if (current === c) closePopover();
  };
  c.onScroll = (e) => {
    if (e.target && e.target !== document && el.contains(e.target)) return;
    c.onClose();
  };
  c.onDocClick = (e) => {
    if (el.contains(e.target) || (anchorEl && anchorEl.contains(e.target))) return;
    c.onClose();
  };
  c.onKeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      c.close();
    } else if (e.key === 'Tab') {
      closePopover({ restoreFocus: true });
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key) && nodes.length) {
      const i = nodes.indexOf(document.activeElement);
      let next;
      if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = nodes.length - 1;
      else if (e.key === 'ArrowDown') next = i < 0 ? 0 : (i + 1) % nodes.length;
      else next = i < 0 ? nodes.length - 1 : (i - 1 + nodes.length) % nodes.length;
      e.preventDefault();
      nodes[next].focus();
    }
  };
  current = c;
  if (anchorEl) anchorEl.setAttribute('aria-expanded', 'true');
  window.addEventListener('keydown', c.onKeydown, true);
  document.addEventListener('click', c.onDocClick, true);
  window.addEventListener('resize', c.onClose);
  window.addEventListener('scroll', c.onScroll, true);
  if (anchorEl) place(el, anchorEl, align);
  if (nodes[0]) nodes[0].focus({ preventScroll: true });
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
  raf(() => { if (current === c) el.classList.add('is-open'); });
  return { el, close: c.close };
}
