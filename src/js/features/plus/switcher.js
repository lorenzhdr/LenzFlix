// LENZ+: Umschalter-Pille "Für dich | Bibliotheken" auf der Startseite und den Hubs.
// Eigener Container #lfx-plus-switcher (fixiert); Tabs sind normale Hash-Links.
import { h, mountPoint, unmountPoint } from '../../core/dom.js';
import { isReady } from '../../core/api.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { parseLfxRoute, hubHref } from '../../shared/routes.js';
import { getLibraries } from '../../shared/libraries.js';

const ROOT_ID = 'lfx-plus-switcher';
const ON_CLASS = 'lfx-plus-switcher-on';

/** Startseite "Für dich" (#/home ohne lfx, ohne tab bzw. tab=0) oder Hub (#/home?lfx=hub). */
export function isSwitcherRoute(route) {
  if (!route || route.path !== '/home' || !route.params) return false;
  const { kind } = parseLfxRoute(route);
  if (kind === 'hub') return true;
  if (route.params.get('lfx')) return false;
  const tab = route.params.get('tab');
  return !tab || tab === '0';
}

/** Tabs: "Für dich" + alle Bibliotheken (Hub-fähige -> Hub, sonst nativ). */
export function switcherTabs(libs) {
  const tabs = [{ key: 'foryou', label: 'Für dich', href: '#/home' }];
  for (const l of Array.isArray(libs) ? libs : []) {
    tabs.push({ key: `lib:${l.id}`, label: l.name, href: l.hubCapable ? hubHref(l.id) : l.href });
  }
  return tabs;
}

/** Aktiver Tab-Schlüssel aus der Route. */
export function activeTab(route) {
  const { kind, lib } = parseLfxRoute(route);
  if (kind === 'hub' && lib) return `lib:${lib}`;
  return 'foryou';
}

const state = { root: null, route: null, libs: [], seq: 0 };

function applyActive() {
  if (!state.root || !state.route) return;
  const key = activeTab(state.route);
  let active = null;
  for (const el of state.root.querySelectorAll('[role="tab"]')) {
    const on = el.dataset.key === key;
    el.classList.toggle('is-active', on);
    el.setAttribute('aria-selected', String(on));
    el.tabIndex = on ? 0 : -1;
    if (on) active = el;
  }
  // Aktiven Tab bei vielen Bibliotheken in den sichtbaren Bereich holen (horizontal, ohne Seitenscroll).
  const list = state.root.querySelector('.lfx-plus-switcher__list');
  if (active && list && list.scrollWidth > list.clientWidth) {
    list.scrollLeft = Math.max(0, active.offsetLeft - (list.clientWidth - active.offsetWidth) / 2);
  }
}

function render() {
  if (!state.root) return;
  const list = h('div', { class: 'lfx-plus-switcher__list', role: 'tablist', 'aria-label': 'Ansicht wählen' });
  for (const t of switcherTabs(state.libs)) {
    list.append(h('a', { class: 'lfx-plus-switcher__tab', role: 'tab', href: t.href, dataset: { key: t.key } }, t.label));
  }
  list.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const tabs = [...list.querySelectorAll('[role="tab"]')];
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const next = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
    e.preventDefault();
    next.tabIndex = 0;
    next.focus();
  });
  state.root.replaceChildren(list);
  applyActive();
}

async function loadLibraries(seq) {
  let libs = [];
  try {
    libs = (await getLibraries()) || [];
  } catch { /* nur "Für dich" */ }
  if (seq !== state.seq || !state.root) return;
  state.libs = libs;
  render();
}

export const plusSwitcher = {
  name: 'plus-switcher',
  match(route) {
    return isTheme('plus') && isModern() && !isTv() && isReady() && isSwitcherRoute(route);
  },
  mount(route) {
    const seq = ++state.seq;
    state.route = route;
    state.libs = [];
    state.root = mountPoint(ROOT_ID, { className: 'lfx-plus-switcher' });
    document.documentElement.classList.add(ON_CLASS);
    render();
    loadLibraries(seq);
  },
  update(route) {
    state.route = route;
    applyActive();
  },
  unmount() {
    state.seq++;
    unmountPoint(ROOT_ID);
    document.documentElement.classList.remove(ON_CLASS);
    state.root = null;
    state.libs = [];
  },
};

export default plusSwitcher;
