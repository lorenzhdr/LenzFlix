// LENZ+: untere Tab-Leiste am Handy (<800 px): Startseite, Meine Liste, Suche, Profil (-> Bottom-Sheet).
// Eigener Container #lfx-plus-tabbar; Ausblenden bei Dialogen/Player/Tastatur per CSS (mobile.css), im Player/Login nie gemountet.
import { h, mountPoint, unmountPoint } from '../../core/dom.js';
import { isReady } from '../../core/api.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { openSheet, renderSheet, closeChooser, isCurrent } from '../../core/sheet.js';
import { parseLfxRoute, hubHref, searchHref } from '../../shared/routes.js';
import { profileEntries, getUserChip } from '../../shared/profile.js';
import { getLibraries } from '../../shared/libraries.js';
import { ICONS } from './header-icons.js';
import { isPhone } from './mobile.js';

const ROOT_ID = 'lfx-plus-tabbar';
const ON_CLASS = 'lfx-plus-tabbar-on';
const KB_CLASS = 'lfx-plus-kb';
const HIDE_CLASS = 'lfx-plus-tabbar-hide'; // Player-Route: Leiste sofort ausblenden (vor unmount)
const EXCLUDED = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
const TEXT_INPUT = 'input:not([type=button]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=range]), textarea, select';

const TABS = [
  { key: 'home', label: 'Startseite', href: '#/home', icon: 'home' },
  { key: 'list', label: 'Meine Liste', href: '#/home?tab=1', icon: 'list' },
  { key: 'search', label: 'Suche', href: searchHref(), icon: 'search' },
];

/** Aktiver Tab: home | list | search | profile | null. route = parseHash-Ergebnis. */
export function tabKey(route) {
  if (!route) return null;
  if (route.path === '/home') {
    const { kind } = parseLfxRoute(route);
    if (kind === 'search') return 'search';
    if (kind === 'new') return 'profile'; // liegt im Profil-Blatt
    if (kind === 'hub') return 'home';
    if (kind) return null;
    const tab = route.params.get('tab');
    if (tab === '1') return 'list';
    return !tab || tab === '0' ? 'home' : null;
  }
  if (/^\/(mypreferences|usermenu)/.test(route.path)) return 'profile';
  return null;
}

/** True, wenn der Hash auf den Player zeigt (#/video). */
export const isVideoHash = (hash) => /^#!?[/]video(?:[/?]|$)/.test(String(hash || ''));

/**
 * Einträge des Profil-Blatts: Neu & beliebt, Bibliotheken, dann die Profil-Einträge.
 * go(href) navigiert, close() schließt das Blatt (vor jeder Aktion).
 */
export function sheetEntries(libs, profile, { go, close }) {
  const entries = [{ label: 'Neu & beliebt', onClick: () => { close(); go('#/home?lfx=new'); } }];
  for (const l of Array.isArray(libs) ? libs : []) {
    const href = l.hubCapable ? hubHref(l.id) : l.href;
    if (href) entries.push({ label: l.name, onClick: () => { close(); go(href); } });
  }
  for (const p of Array.isArray(profile) ? profile : []) {
    if (p.href) entries.push({ label: p.label, onClick: () => { close(); go(p.href); }, stats: p.key === 'stats' });
    else if (typeof p.onClick === 'function') entries.push({ label: p.label, onClick: () => { close(); p.onClick(); } });
  }
  return entries;
}

function go(href) {
  if (String(href).startsWith('#')) window.location.hash = href;
  else window.location.assign(href);
}

const state = { root: null, route: null, profileBtn: null, sheet: null, seq: 0, cleanups: [] };

const iconEl = (name) => {
  const span = h('span', { class: 'lfx-plus-tabbar__icon', 'aria-hidden': 'true' });
  span.innerHTML = ICONS[name];
  return span;
};

function applyActive() {
  if (!state.root) return;
  const key = tabKey(state.route);
  for (const el of state.root.querySelectorAll('[data-key]')) {
    const on = el.dataset.key === key;
    el.classList.toggle('is-active', on);
    if (on) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
    if (el.dataset.key === 'home') el.querySelector('.lfx-plus-tabbar__icon').innerHTML = ICONS[on ? 'homeFill' : 'home'];
  }
}

function closeProfile() {
  state.seq++;
  const c = state.sheet;
  state.sheet = null;
  if (c && isCurrent(c)) closeChooser();
}

async function openProfile() {
  if (state.sheet && isCurrent(state.sheet)) {
    closeProfile();
    return;
  }
  const seq = ++state.seq;
  const anchor = state.profileBtn;
  let libs = [];
  let profile = [];
  let user = { name: '' };
  try { libs = (await getLibraries()) || []; } catch { /* ohne Bibliotheken */ }
  try { profile = await profileEntries({ theme: 'plus', returnFocus: anchor }); } catch { /* ohne Profil-Einträge */ }
  try { user = await getUserChip(); } catch { /* ohne Namen */ }
  if (seq !== state.seq || !state.root) return;
  const c = openSheet(anchor, 'Profil');
  state.sheet = c;
  const entries = sheetEntries(libs, profile, { go, close: () => closeChooser() });
  renderSheet(c, (user && user.name) || 'Profil', entries);
  const buttons = c.list ? c.list.querySelectorAll('.lfx-sheet__item') : [];
  entries.forEach((e, i) => { if (e.stats && buttons[i]) buttons[i].classList.add('is-stats'); });
}

async function fillAvatar(seq) {
  let user = { name: '', imageUrl: null };
  try { user = await getUserChip(); } catch { /* Platzhalter bleibt */ }
  if (seq !== state.seq || !state.profileBtn) return;
  const avatar = state.profileBtn.querySelector('.lfx-plus-tabbar__avatar');
  if (user.imageUrl) {
    avatar.style.backgroundImage = `url("${user.imageUrl}")`;
    avatar.textContent = '';
  } else {
    avatar.textContent = (user.name || '?').trim().charAt(0).toUpperCase();
  }
  if (user.name) state.profileBtn.setAttribute('aria-label', `Profil: ${user.name}`);
}

export const plusTabbar = {
  name: 'plus-tabbar',
  match(route) {
    return isTheme('plus') && isModern() && !isTv() && isPhone() && isReady() && !EXCLUDED.test(route.path);
  },
  mount(route) {
    const seq = ++state.seq;
    state.route = route;
    const root = mountPoint(ROOT_ID, { tag: 'nav', className: 'lfx-plus-tabbar' });
    root.textContent = '';
    root.setAttribute('aria-label', 'Hauptnavigation');
    for (const t of TABS) {
      root.append(h('a', { class: 'lfx-plus-tabbar__tab', href: t.href, 'aria-label': t.label, dataset: { key: t.key } }, [iconEl(t.icon)]));
    }
    const profileBtn = h('button', {
      type: 'button',
      class: 'lfx-plus-tabbar__tab',
      'aria-label': 'Profil',
      'aria-haspopup': 'dialog',
      dataset: { key: 'profile' },
    }, [h('span', { class: 'lfx-plus-tabbar__avatar', 'aria-hidden': 'true' })]);
    profileBtn.addEventListener('click', openProfile);
    root.append(profileBtn);
    state.root = root;
    state.profileBtn = profileBtn;

    const cl = document.documentElement.classList;
    const onFocusIn = (e) => { if (e.target && e.target.matches && e.target.matches(TEXT_INPUT)) cl.add(KB_CLASS); };
    const onFocusOut = () => cl.remove(KB_CLASS);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    state.cleanups.push(() => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      cl.remove(KB_CLASS);
    });

    // Wechsel in den Player: Leiste sofort weg (hashchange feuert vor dem Route-unmount), sonst im ersten Frame sichtbar
    const onHash = () => cl.toggle(HIDE_CLASS, isVideoHash(window.location.hash));
    window.addEventListener('hashchange', onHash);
    state.cleanups.push(() => {
      window.removeEventListener('hashchange', onHash);
      cl.remove(HIDE_CLASS);
    });
    cl.remove(HIDE_CLASS);

    cl.add(ON_CLASS);
    applyActive();
    fillAvatar(seq);
  },
  update(route) {
    const changed = !state.route || state.route.hash !== route.hash;
    state.route = route;
    if (changed) closeProfile();
    applyActive();
  },
  unmount() {
    closeProfile();
    for (const fn of state.cleanups.splice(0)) fn();
    unmountPoint(ROOT_ID);
    document.documentElement.classList.remove(ON_CLASS);
    state.root = null;
    state.profileBtn = null;
  },
};

export default plusTabbar;
