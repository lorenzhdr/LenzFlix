// LENZPRIME (Handy): schwebende Glas-Tab-Pille unten mit drei Tabs (Startseite, Meine Liste, Suche).
// Nur Modern-Layout, nicht TV, nur bei isMobile(). Mount #lfx-prime-tabbar; html-Klasse lfx-prime-tabbar-on gibt den Seiten unten Abstand.
// Ausgeblendet (Klasse is-hidden) im Player, bei offenen Dialogen/Sheets/Menüs und solange das Suchfeld Fokus hat (Tastatur).
import { h, mountPoint, unmountPoint } from '../../core/dom.js';
import { isReady } from '../../core/api.js';
import { isMobile, isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { openPrimeSearch, closePrimeSearch, isPrimeSearchOpen } from './search.js';
import { activeKey } from './header.js';

const ID = 'lfx-prime-tabbar';
const HTML_CLASS = 'lfx-prime-tabbar-on';
const EXCLUDED = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
/** html-Klassen, bei denen die Pille weicht. */
const HIDE_CLASSES = ['lfx-sheet-open', 'lfx-themepicker-open', 'lfx-popover-open', 'lfx-modal-open', 'lfx-prime-profilesheet-open'];
const DIALOG_SELECTOR = '.dialogContainer .dialog, .MuiDialog-root, .MuiPopover-root, #lfx-popover, #lfx-sheet, #lfx-themepicker';

const SVG_NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  home: 'M12 3.2 2.5 11.3l1.3 1.5L5 11.8V20a1 1 0 0 0 1 1h4.2v-6h3.6v6H18a1 1 0 0 0 1-1v-8.2l1.2 1 1.3-1.5L12 3.2Z',
  list: 'M6 3h12a1 1 0 0 1 1 1v17l-7-4.6L5 21V4a1 1 0 0 1 1-1Zm1 2v12.2l5-3.3 5 3.3V5H7Z',
  search: 'M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.3 4.3-1.4 1.4-4.3-4.3A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z',
};

function icon(name) {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const p = document.createElementNS(SVG_NS, 'path');
  p.setAttribute('d', ICONS[name]);
  svg.append(p);
  return svg;
}

/** Aktiver Tab: 'search' (Overlay offen) | 'home' | 'list' | null. Hubs (Filme/Serien) zählen zur Startseite. */
export function activeTab(route, searchOpen = false) {
  if (searchOpen) return 'search';
  const key = activeKey(route);
  if (key === 'home' || (key && key.startsWith('lib:'))) return 'home';
  if (key === 'list') return 'list';
  return null;
}

const state = { el: null, route: null, observer: null, cleanups: [] };

function inputFocused() {
  const a = document.activeElement;
  return Boolean(a && a.classList && a.classList.contains('lfx-prime-search__input'));
}

/** True, wenn die Pille gerade nicht erscheinen soll. */
export function shouldHide() {
  const cl = document.documentElement.classList;
  if (HIDE_CLASSES.some((c) => cl.contains(c))) return true;
  if (document.querySelector('#videoOsdPage:not(.hide)')) return true;
  if (document.querySelector(DIALOG_SELECTOR)) return true;
  return inputFocused();
}

function applyState() {
  const el = state.el;
  if (!el) return;
  const hide = shouldHide();
  if (el.classList.contains('is-hidden') !== hide) el.classList.toggle('is-hidden', hide);
  el.toggleAttribute('inert', hide);
  const active = state.route ? activeTab(state.route, isPrimeSearchOpen()) : null;
  for (const t of el.querySelectorAll('[data-tab]')) {
    const on = t.dataset.tab === active;
    t.classList.toggle('is-active', on);
    if (on) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  }
}

function tab(key, label, iconName, attrs = {}) {
  const tag = attrs.href ? 'a' : 'button';
  return h(tag, {
    class: 'lfx-prime-tabbar__tab', dataset: { tab: key }, ...(tag === 'button' ? { type: 'button' } : {}), ...attrs,
  }, [icon(iconName), h('span', { class: 'lfx-prime-tabbar__label' }, label)]);
}

function build() {
  const home = tab('home', 'Startseite', 'home', { href: '#/home' });
  const list = tab('list', 'Meine Liste', 'list', { href: '#/home?tab=1' });
  const search = tab('search', 'Suche', 'search', { 'aria-haspopup': 'dialog' });
  home.addEventListener('click', () => { closePrimeSearch({ restoreFocus: false }); applyState(); });
  list.addEventListener('click', () => { closePrimeSearch({ restoreFocus: false }); applyState(); });
  search.addEventListener('click', () => {
    if (isPrimeSearchOpen()) closePrimeSearch({ restoreFocus: false });
    else openPrimeSearch({ returnFocus: search });
    applyState();
  });
  state.el.replaceChildren(home, list, search);
  state.el.setAttribute('aria-label', 'Hauptnavigation');
}

export default {
  name: 'prime-tabbar',
  match(route) {
    return isTheme('prime') && isModern() && !isTv() && isMobile() && isReady() && !EXCLUDED.test(route.path);
  },
  mount(route) {
    state.route = route;
    state.el = mountPoint(ID, { tag: 'nav', className: 'lfx-prime-tabbar' });
    build();
    document.documentElement.classList.add(HTML_CLASS);
    if (typeof MutationObserver === 'function') {
      state.observer = new MutationObserver(applyState);
      state.observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      state.observer.observe(document.body, { childList: true });
    }
    const onFocus = () => applyState();
    document.addEventListener('focusin', onFocus);
    document.addEventListener('focusout', onFocus);
    state.cleanups.push(() => {
      document.removeEventListener('focusin', onFocus);
      document.removeEventListener('focusout', onFocus);
    });
    applyState();
  },
  update(route) {
    state.route = route;
    applyState();
  },
  unmount() {
    if (state.observer) state.observer.disconnect();
    state.observer = null;
    for (const fn of state.cleanups.splice(0)) fn();
    unmountPoint(ID);
    document.documentElement.classList.remove(HTML_CLASS);
    state.el = null;
    state.route = null;
  },
};
