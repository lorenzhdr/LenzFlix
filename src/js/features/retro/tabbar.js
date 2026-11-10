// LENZ//84 Handy (< 800 px): schmale Kopfzeile oben (Wortmarke + Uhr) und Funktionstasten-Leiste unten (F1 START … F5 MEHR).
// Mounts #lfx-retro-topbar und #lfx-retro-tabbar; html-Klassen lfx-retro-tabbar-on / lfx-retro-mobile. „MEHR“ öffnet ein Sheet. Gehört Worker P1.
import { h, mountPoint, unmountPoint } from '../../core/dom.js';
import { isReady } from '../../core/api.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { openSheet, renderSheet, closeChooser, isCurrent } from '../../core/sheet.js';
import { getLibraries } from '../../shared/libraries.js';
import { profileEntries, getUserChip } from '../../shared/profile.js';
import { hubHref, searchHref } from '../../shared/routes.js';
import { emitFx, getPref, togglePref, PREFS_EVENT } from './prefs.js';
import { EXCLUDED, LIST_HREF, NEW_HREF, activeKey, go, isPhone } from './header-nav.js';
import { createClock, createLogo } from './header-ui.js';

const ROOT_ID = 'lfx-retro-tabbar';
const TOP_ID = 'lfx-retro-topbar';
const ON_CLASS = 'lfx-retro-tabbar-on';
const MOBILE_CLASS = 'lfx-retro-mobile';
const KB_CLASS = 'lfx-retro-kb';
const HIDE_CLASS = 'lfx-retro-tabbar-hide'; // Wechsel in den Player: Leiste sofort weg (hashchange feuert vor unmount)
const TEXT_INPUT = 'input:not([type=button]):not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=range]), textarea, select';

const KEYS = [
  { key: 'home', n: 'F1', label: 'START', name: 'Start', href: '#/home' },
  { key: 'search', n: 'F2', label: 'SUCHE', name: 'Suche', href: searchHref() },
  { key: 'new', n: 'F3', label: 'NEU', name: 'Neu und beliebt', href: NEW_HREF },
  { key: 'list', n: 'F4', label: 'LISTE', name: 'Meine Liste', href: LIST_HREF },
];

/** Aktive Taste: home | search | new | list | more | null (Hubs zählen zu MEHR, Einstellungen ebenfalls). */
export function tabKey(route) {
  if (!route) return null;
  const k = activeKey(route);
  if (k === 'home' || k === 'search' || k === 'new' || k === 'list') return k;
  if (k && k.startsWith('lib:')) return 'more';
  if (/^\/(mypreferences|usermenu)/.test(route.path)) return 'more';
  return null;
}

/** True, wenn der Hash auf den Player zeigt (#/video). */
export const isVideoHash = (hash) => /^#!?[/]video(?:[/?]|$)/.test(String(hash || ''));

const PREF_LABEL = { sound: 'Sound', crt: 'CRT-Effekt' };

/**
 * Einträge des MEHR-Blatts: Bibliotheken (Filme/Serien zuerst), Profil-Einträge, Schalter Sound/CRT.
 * go(href) navigiert, close() schließt das Blatt (vor jeder Aktion außer den Schaltern), toggle(pref) schaltet.
 */
export function moreEntries(libs, profile, { go: goFn, close, toggle }) {
  const entries = [];
  const order = { movies: 0, tvshows: 1 };
  const sorted = (Array.isArray(libs) ? libs : []).map((l, i) => ({ l, i }))
    .sort((a, b) => ((order[a.l.collectionType] ?? 9) - (order[b.l.collectionType] ?? 9)) || (a.i - b.i));
  for (const { l } of sorted) {
    const href = l.hubCapable ? hubHref(l.id) : l.href;
    if (href) entries.push({ key: `lib:${l.id}`, label: l.name, onClick: () => { close(); goFn(href); } });
  }
  for (const p of Array.isArray(profile) ? profile : []) {
    if (p.href) entries.push({ key: p.key, label: p.label, badge: p.badge, stats: p.key === 'stats', onClick: () => { close(); goFn(p.href); } });
    else if (typeof p.onClick === 'function') entries.push({ key: p.key, label: p.label, badge: p.badge, onClick: () => { close(); p.onClick(); } });
  }
  for (const pref of ['sound', 'crt']) {
    entries.push({ key: `pref-${pref}`, label: PREF_LABEL[pref], pref, onClick: () => toggle(pref) });
  }
  return entries;
}

const state = { root: null, top: null, route: null, moreBtn: null, sheet: null, seq: 0, clock: null, cleanups: [] };

function paintToggle(btn, pref) {
  const on = getPref(pref);
  btn.dataset.pref = pref;
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.textContent = `${PREF_LABEL[pref]}: ${on ? 'AN' : 'AUS'}`;
}

function syncSheetToggles() {
  const c = state.sheet;
  if (!c || !isCurrent(c) || !c.list) return;
  for (const b of c.list.querySelectorAll('[data-pref]')) paintToggle(b, b.dataset.pref);
}

function applyActive() {
  if (!state.root) return;
  const sheetOpen = Boolean(state.sheet && isCurrent(state.sheet));
  const key = sheetOpen ? 'more' : tabKey(state.route);
  for (const el of state.root.querySelectorAll('[data-key]')) {
    const on = el.dataset.key === key;
    el.classList.toggle('is-active', on);
    if (on) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }
}

function closeMore() {
  state.seq++;
  const c = state.sheet;
  state.sheet = null;
  if (c && isCurrent(c)) closeChooser();
  applyActive();
}

async function openMore() {
  if (state.sheet && isCurrent(state.sheet)) { closeMore(); return; }
  const seq = ++state.seq;
  const anchor = state.moreBtn;
  let libs = [];
  let profile = [];
  try { libs = (await getLibraries()) || []; } catch { /* ohne Bibliotheken */ }
  try { profile = await profileEntries({ theme: 'retro', returnFocus: anchor }); } catch { /* ohne Profil-Einträge */ }
  if (seq !== state.seq || !state.root) return;
  emitFx('open');
  const c = openSheet(anchor, 'Mehr');
  c.sheet.classList.add('lfx-retro-sheet');
  state.sheet = c;
  const entries = moreEntries(libs, profile, {
    go, close: () => closeChooser(), toggle: (pref) => { togglePref(pref); syncSheetToggles(); },
  });
  renderSheet(c, 'Mehr', entries);
  const buttons = c.list ? c.list.querySelectorAll('.lfx-sheet__item') : [];
  entries.forEach((e, i) => {
    const b = buttons[i];
    if (!b) return;
    if (e.stats) b.classList.add('is-stats');
    if (e.pref) paintToggle(b, e.pref);
  });
  applyActive();
}

function fkey(k) {
  return h('a', {
    class: 'lfx-retro-fkey', href: k.href, 'aria-label': k.name, dataset: { key: k.key },
  }, [h('span', { class: 'lfx-retro-fkey__n', 'aria-hidden': 'true' }, k.n), h('span', { class: 'lfx-retro-fkey__l', 'aria-hidden': 'true' }, k.label)]);
}

async function fillTopbar() {
  // Benutzername als Terminal-Kennung neben der Wortmarke (Deko; ohne Namen bleibt die Zeile leer)
  let chip = { name: '' };
  try { chip = await getUserChip({ retries: 20, isAlive: () => Boolean(state.top) }); } catch { /* egal */ }
  if (!state.top || !chip.name) return;
  const who = state.top.querySelector('.lfx-retro-topbar__user');
  if (who) who.textContent = chip.name;
}

export const retroTabbar = {
  name: 'retro-tabbar',
  match(route) {
    return isTheme('retro') && isModern() && !isTv() && isPhone() && isReady() && !EXCLUDED.test(route.path);
  },
  mount(route) {
    state.seq++;
    state.route = route;
    const top = mountPoint(TOP_ID, { tag: 'header', className: 'lfx-retro-topbar' });
    state.clock = createClock();
    top.replaceChildren(h('div', { class: 'lfx-retro-topbar__bar' }, [
      createLogo('lfx-retro-topbar__logo'),
      h('span', { class: 'lfx-retro-topbar__user', 'aria-hidden': 'true' }),
      state.clock.el,
    ]));
    state.top = top;

    const root = mountPoint(ROOT_ID, { tag: 'nav', className: 'lfx-retro-tabbar' });
    root.setAttribute('aria-label', 'Hauptnavigation');
    const more = h('button', {
      type: 'button', class: 'lfx-retro-fkey', 'aria-label': 'Mehr', 'aria-haspopup': 'dialog', dataset: { key: 'more' },
    }, [h('span', { class: 'lfx-retro-fkey__n', 'aria-hidden': 'true' }, 'F5'), h('span', { class: 'lfx-retro-fkey__l', 'aria-hidden': 'true' }, 'MEHR')]);
    more.addEventListener('click', openMore);
    root.replaceChildren(...KEYS.map(fkey), more);
    root.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a')) emitFx('nav'); });
    state.root = root;
    state.moreBtn = more;

    const cl = document.documentElement.classList;
    const onFocusIn = (e) => { if (e.target && e.target.matches && e.target.matches(TEXT_INPUT)) cl.add(KB_CLASS); };
    const onFocusOut = () => cl.remove(KB_CLASS);
    const onHash = () => cl.toggle(HIDE_CLASS, isVideoHash(window.location.hash));
    const onPrefs = () => syncSheetToggles();
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    window.addEventListener('hashchange', onHash);
    document.addEventListener(PREFS_EVENT, onPrefs);
    state.cleanups.push(() => {
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      window.removeEventListener('hashchange', onHash);
      document.removeEventListener(PREFS_EVENT, onPrefs);
      cl.remove(KB_CLASS, HIDE_CLASS);
    });
    cl.remove(HIDE_CLASS);
    cl.add(ON_CLASS, MOBILE_CLASS);
    applyActive();
    fillTopbar();
  },
  update(route) {
    const changed = !state.route || state.route.hash !== route.hash;
    state.route = route;
    if (changed) closeMore();
    applyActive();
  },
  unmount() {
    closeMore();
    for (const fn of state.cleanups.splice(0)) fn();
    if (state.clock) state.clock.destroy();
    state.clock = null;
    unmountPoint(ROOT_ID);
    unmountPoint(TOP_ID);
    document.documentElement.classList.remove(ON_CLASS, MOBILE_CLASS);
    state.root = null;
    state.top = null;
    state.moreBtn = null;
    state.route = null;
  },
};

export default retroTabbar;
