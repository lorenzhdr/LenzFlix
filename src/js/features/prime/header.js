// LENZPRIME: Kopfzeile (oben transparent, nach dem Scrollen schwebende Glasleiste) mit Text-Navigation,
// Such-Overlay-Auslöser, Raster-Flyout, Meine Liste und Profil-Panel. Eigener Mount #lfx-prime-header;
// die native AppBar wird nur per html.lfx-prime-header-on ausgeblendet.
import { h, mountPoint, unmountPoint } from '../../core/dom.js';
import { isReady } from '../../core/api.js';
import { isMobile, isNarrow, isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { openPopover, closePopover, isPopoverOpen } from '../../core/popover.js';
import { getLibraries } from '../../shared/libraries.js';
import { createDataSaverButton } from '../../shared/dsbtn.js';
import { getCollections } from '../../shared/collections.js';
import { profileEntries, getUserChip } from '../../shared/profile.js';
import { hubHref, titleHref, tvModeHref } from '../../shared/routes.js';
import { openPrimeSearch, closePrimeSearch, isPrimeSearchOpen } from './search.js';
import { openMenus } from './header-menus.js';
import { openProfileSheet, closeProfileSheet } from './profile-sheet.js';

const ID = 'lfx-prime-header';
const HTML_CLASS = 'lfx-prime-header-on';
const MOBILE_CLASS = 'lfx-prime-mobile'; // Handy-Layout aktiv (isMobile()); alle Handy-Regeln hängen daran
const PILLS_CLASS = 'lfx-prime-header-pills'; // Handy-Kopfzeile mit Pillen (Startseite/Hub): höhere Kopfzeile
const EXCLUDED = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
const SCROLL_THRESHOLD = 10;
const LIST_HREF = '#/home?tab=1';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Eigene Inline-SVGs (24er-Raster). */
const ICONS = {
  search: 'M10.5 3a7.5 7.5 0 0 1 5.9 12.1l4.3 4.3-1.4 1.4-4.3-4.3A7.5 7.5 0 1 1 10.5 3Zm0 2a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z',
  grid: 'M5 4h3v3H5V4Zm5.5 0h3v3h-3V4ZM16 4h3v3h-3V4ZM5 10.5h3v3H5v-3Zm5.5 0h3v3h-3v-3Zm5.5 0h3v3h-3v-3ZM5 17h3v3H5v-3Zm5.5 0h3v3h-3v-3Zm5.5 0h3v3h-3v-3Z',
  back: 'M15.5 4.5 8 12l7.5 7.5-1.6 1.6L4.8 12l9.1-9.1z',
  tv: 'M5 4h14a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-3.5l.8 2H17v2H7v-2h.7l.8-2H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3ZM5 6a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1ZM12 8.8a2.2 2.2 0 1 1 0 4.4 2.2 2.2 0 0 1 0-4.4Z',
  bookmark: 'M6 3h12a1 1 0 0 1 1 1v17l-7-4.6L5 21V4a1 1 0 0 1 1-1Zm1 2v12.2l5-3.3 5 3.3V5H7Z',
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

/** Menüpunkte: Startseite, Filme, Serien (je erste passende Bibliothek), Neu & beliebt. */
export function navItems(libs) {
  const list = Array.isArray(libs) ? libs : [];
  const items = [{ key: 'home', label: 'Startseite', href: '#/home' }];
  const movies = list.find((l) => l.collectionType === 'movies');
  const series = list.find((l) => l.collectionType === 'tvshows');
  if (movies) items.push({ key: `lib:${movies.id}`, label: 'Filme', href: hubHref(movies.id) });
  if (series) items.push({ key: `lib:${series.id}`, label: 'Serien', href: hubHref(series.id) });
  items.push({ key: 'new', label: 'Neu & beliebt', href: '#/home?lfx=new' });
  return items;
}

/** Aktiver Schlüssel: home | new | tv | lib:<id> | list | null. */
export function activeKey(route) {
  if (!route || route.path !== '/home') return null;
  const p = route.params;
  const lfx = p.get('lfx');
  if (lfx === 'new') return 'new';
  if (lfx === 'tv') return 'tv';
  if (lfx === 'hub' && p.get('lib')) return `lib:${p.get('lib')}`;
  if (lfx) return null;
  return p.get('tab') === '1' ? 'list' : 'home';
}

/** Handy-Kopfzeile: 'home' (Wortmarke + Pillen Filme/Serien) oder 'sub' (Zurück-Pfeil + Seitentitel). */
export function mobileKind(route) {
  if (!route || route.path !== '/home') return 'sub';
  const lfx = route.params.get('lfx');
  if (route.params.get('tab') === '1') return 'sub';
  return !lfx || lfx === 'hub' ? 'home' : 'sub';
}

/** Feste Titel nativer Seiten (Einstellungen u. a.); Bibliotheken kommen über die Bibliotheksliste. */
const NATIVE_TITLES = {
  '/mypreferencesmenu': 'Einstellungen',
  '/mypreferencesdisplay': 'Anzeige',
  '/mypreferenceshome': 'Startseite',
  '/mypreferencesplayback': 'Wiedergabe',
  '/mypreferencessubtitles': 'Untertitel',
  '/mypreferencescontrols': 'Steuerung',
  '/mypreferencesquickconnect': 'Quick Connect',
  '/userprofile': 'Profil',
  '/search': 'Suche',
  '/queue': 'Warteschlange',
};

function domText(selector, attr) {
  const el = document.querySelector(selector);
  if (!el) return '';
  return String((attr ? el.getAttribute(attr) : el.textContent) || '').trim();
}

/**
 * Seitentitel der Handy-Kopfzeile auf Unterseiten. Nie document.title (Jellyfin schreibt dort den Servernamen):
 * feste Titel, Bibliotheksname per topParentId/parentId/lib, Titelname aus dem gerenderten DOM, sonst leer.
 */
export function mobileTitle(route, libs = []) {
  if (!route) return '';
  const p = route.params;
  if (route.path === '/home') {
    const lfx = p.get('lfx');
    if (p.get('tab') === '1') return 'Meine Liste';
    if (lfx === 'new') return 'Neu & beliebt';
    if (lfx === 'tv') return 'TV';
    if (lfx === 'search') return 'Suche';
    if (lfx === 'title') return domText('.lfx-pt__title') || domText('.lfx-pt__logo', 'alt');
    if (lfx === 'browse') {
      const lib = libs.find((l) => l.id === p.get('lib'));
      return lib ? lib.name || '' : '';
    }
    return '';
  }
  if (NATIVE_TITLES[route.path]) return NATIVE_TITLES[route.path];
  const libId = p.get('topParentId') || p.get('parentId');
  const lib = libId ? libs.find((l) => l.id === libId) : null;
  if (lib) return lib.name || '';
  if (route.path === '/details' || route.path === '/item') return domText('.page:not(.hide) .nameContainer h1');
  return '';
}

function goBack() {
  if (window.history.length > 1) window.history.back();
  else window.location.hash = '#/home';
}

const state = {
  mobile: false,
  kind: null,
  el: null,
  route: null,
  libs: [],
  cleanups: [],
  menus: null,
  seq: 0,
  raf: 0,
  profileBusy: false,
  titleTimer: 0,
};

/** Titel neu berechnen und setzen (Handy, Unterseite). */
function refreshTitle() {
  if (!state.el || !state.mobile || !state.route) return;
  const t = state.el.querySelector('.lfx-prime-header__title');
  if (!t) return;
  const next = mobileTitle(state.route, state.libs);
  if (t.textContent !== next) t.textContent = next;
}

function stopTitlePoll() {
  if (state.titleTimer) clearInterval(state.titleTimer);
  state.titleTimer = 0;
}

/** Kurzes Polling nach Routenwechsel: DOM-Titel (Titelseite, native Detailseite) erscheint erst nach dem Laden. */
function startTitlePoll() {
  stopTitlePoll();
  if (!state.mobile || state.kind !== 'sub') return;
  let n = 0;
  state.titleTimer = setInterval(() => {
    refreshTitle();
    n += 1;
    if (n >= 24 || !state.el) stopTitlePoll();
  }, 250);
}

function applyActive() {
  if (!state.el || !state.route) return;
  const key = activeKey(state.route);
  for (const el of state.el.querySelectorAll('[data-key]')) {
    const on = el.dataset.key === key;
    el.classList.toggle('is-active', on);
    if (on) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }
}

function renderNav() {
  const nav = state.el && state.el.querySelector('.lfx-prime-header__nav');
  if (!nav) return;
  nav.replaceChildren(...navItems(state.libs).map((it) => h('a', {
    class: 'lfx-prime-header__link',
    href: it.href,
    dataset: { key: it.key },
  }, it.label)));
  applyActive();
}

function profileIsOpen() {
  const el = document.getElementById('lfx-popover');
  return isPopoverOpen() && Boolean(el && el.classList.contains('lfx-prime-profile'));
}

function closeProfile() {
  if (profileIsOpen()) closePopover();
}

async function toggleProfile(btn) {
  if (profileIsOpen()) {
    closePopover({ restoreFocus: true });
    return;
  }
  if (state.profileBusy) return;
  state.profileBusy = true;
  try {
    state.menus.close();
    const items = await profileEntries({ theme: 'prime', returnFocus: btn });
    if (!state.el || !btn.isConnected) return;
    openPopover(btn, { label: 'Profil', items, align: 'end', className: 'lfx-prime-profile' });
  } finally {
    state.profileBusy = false;
  }
}

/** TV-Symbol: Klick meldet synchron die Absicht (die TV-Hülle entsperrt das Video in der Geste), Navigation per href. */
function tvLink() {
  const a = h('a', {
    class: 'lfx-prime-header__icon', href: tvModeHref, 'aria-label': 'TV', title: 'TV', dataset: { key: 'tv' },
  }, [icon('tv')]);
  a.addEventListener('click', () => window.dispatchEvent(new CustomEvent('lfx:tvmode-intent')));
  return a;
}

/** Datensparmodus-Symbol (nur mit html.lfx-datasaver sichtbar, CSS). */
const dsLink = () => createDataSaverButton({ className: 'lfx-prime-header__icon' });

function build() {
  const logo = h('a', { class: 'lfx-prime-header__logo', href: '#/home', 'aria-label': 'LENZPRIME – Startseite' });
  const nav = h('nav', { class: 'lfx-prime-header__nav', 'aria-label': 'Hauptnavigation' });

  const searchBtn = h('button', {
    type: 'button', class: 'lfx-prime-header__icon', 'aria-label': 'Suche', 'aria-haspopup': 'dialog',
  }, [icon('search')]);
  searchBtn.addEventListener('click', () => {
    state.menus.close();
    closeProfile();
    if (isPrimeSearchOpen()) closePrimeSearch();
    else openPrimeSearch({ returnFocus: searchBtn });
  });

  const gridBtn = h('button', {
    type: 'button', class: 'lfx-prime-header__icon', 'aria-label': 'Bibliotheken und Sammlungen',
    'aria-haspopup': 'true', 'aria-expanded': 'false', 'aria-controls': 'lfx-prime-grid',
  }, [icon('grid')]);
  const flyout = h('div', { class: 'lfx-prime-flyout', id: 'lfx-prime-grid', role: 'menu', hidden: true, 'aria-label': 'Bibliotheken und Sammlungen' });
  const gridWrap = h('div', { class: 'lfx-prime-header__flyout-wrap' }, [gridBtn, flyout]);

  const listLink = h('a', {
    class: 'lfx-prime-header__icon', href: LIST_HREF, 'aria-label': 'Meine Liste', dataset: { key: 'list' },
  }, [icon('bookmark')]);

  const avatar = h('button', {
    type: 'button', class: 'lfx-prime-header__avatar', 'aria-label': 'Profil', 'aria-haspopup': 'true',
  });
  avatar.addEventListener('click', () => toggleProfile(avatar));

  const right = h('div', { class: 'lfx-prime-header__right' }, [searchBtn, tvLink(), dsLink(), gridWrap, listLink, avatar]);
  const bar = h('div', { class: 'lfx-prime-header__bar' }, [logo, nav, right]);
  state.el.replaceChildren(bar);
  state.menus = openMenus({ wrap: gridWrap, button: gridBtn, flyout, load: loadFlyoutData });
  return { avatar };
}

function buildMobile(route) {
  const kind = mobileKind(route);
  state.kind = kind;
  const avatar = h('button', {
    type: 'button', class: 'lfx-prime-header__avatar', 'aria-label': 'Profil', 'aria-haspopup': 'dialog',
  });
  avatar.addEventListener('click', () => {
    closePrimeSearch({ restoreFocus: false });
    openProfileSheet({ returnFocus: avatar });
  });
  let left;
  if (kind === 'home') {
    left = [h('a', { class: 'lfx-prime-header__logo', href: '#/home', 'aria-label': 'LENZPRIME – Startseite' })];
  } else {
    const back = h('button', { type: 'button', class: 'lfx-prime-header__back', 'aria-label': 'Zurück' });
    back.append(icon('back'));
    back.addEventListener('click', goBack);
    left = [back, h('h1', { class: 'lfx-prime-header__title' }, mobileTitle(route, state.libs))];
  }
  const bar = h('div', { class: 'lfx-prime-header__bar' }, [...left, h('div', { class: 'lfx-prime-header__right' }, [tvLink(), dsLink(), avatar])]);
  const kids = [bar];
  if (kind === 'home') kids.push(h('nav', { class: 'lfx-prime-header__pills', 'aria-label': 'Filme und Serien' }));
  state.el.replaceChildren(...kids);
  return { avatar };
}

function renderPills() {
  const nav = state.el && state.el.querySelector('.lfx-prime-header__pills');
  if (!nav) return;
  const items = navItems(state.libs).filter((it) => it.key.startsWith('lib:'));
  nav.replaceChildren(...items.map((it) => h('a', {
    class: 'lfx-prime-header__pill', href: it.href, dataset: { key: it.key },
  }, it.label)));
  nav.hidden = !items.length;
  applyActive();
}

async function loadFlyoutData() {
  let libs = state.libs;
  let cols;
  try {
    cols = await getCollections();
  } catch {
    cols = [];
  }
  if (!libs.length) {
    try {
      libs = await getLibraries();
    } catch {
      libs = [];
    }
  }
  return {
    libraries: libs.map((l) => ({ key: l.id, label: l.name, href: l.hubCapable ? hubHref(l.id) : l.href })),
    collections: cols.map((c) => ({ key: c.id, label: c.name, href: titleHref(c.id) })),
  };
}

async function loadLibs(seq) {
  try {
    const libs = await getLibraries();
    if (seq !== state.seq || !state.el) return;
    state.libs = libs;
  } catch {
    if (seq !== state.seq || !state.el) return;
    state.libs = [];
  }
  renderNav();
  renderPills();
  refreshTitle();
}

async function loadAvatar(seq, avatar) {
  let chip = { name: '', imageUrl: null };
  try {
    chip = await getUserChip({ retries: 20, isAlive: () => seq === state.seq && Boolean(state.el) });
  } catch { /* Initial genügt */ }
  if (seq !== state.seq || !state.el) return;
  avatar.replaceChildren();
  if (chip.imageUrl) avatar.append(h('img', { src: chip.imageUrl, alt: '', draggable: 'false' }));
  else avatar.append(h('span', { class: 'lfx-prime-header__initial', 'aria-hidden': 'true' }, (chip.name || '?').trim().charAt(0).toUpperCase() || '?'));
  if (chip.name) avatar.setAttribute('aria-label', `Profil: ${chip.name}`);
}

function onScroll() {
  if (state.raf) return;
  state.raf = requestAnimationFrame(() => {
    state.raf = 0;
    applyScroll();
  });
}

function applyScroll() {
  if (!state.el || state.mobile) return;
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  const on = y > SCROLL_THRESHOLD;
  if (state.el.classList.contains('is-scrolled') !== on) state.el.classList.toggle('is-scrolled', on);
}

function syncHtmlClasses() {
  const cl = document.documentElement.classList;
  cl.toggle(MOBILE_CLASS, state.mobile);
  cl.toggle(PILLS_CLASS, state.mobile && state.kind === 'home');
}

/** Baut die Kopfzeile neu auf (Desktop oder Handy je nach Fensterbreite). */
function render() {
  const seq = ++state.seq;
  if (state.menus) state.menus.destroy();
  state.menus = null;
  closeProfile();
  closeProfileSheet({ restoreFocus: false });
  state.mobile = isMobile() && isNarrow();
  state.kind = null;
  const parts = state.mobile ? buildMobile(state.route) : build();
  state.el.className = `lfx-prime-header${state.mobile ? ` lfx-prime-header--mobile lfx-prime-header--${state.kind}` : ''}`;
  syncHtmlClasses();
  applyScroll();
  renderNav();
  renderPills();
  applyActive();
  loadLibs(seq);
  loadAvatar(seq, parts.avatar);
  startTitlePoll();
}

export default {
  name: 'prime-header',
  match(route) {
    return isTheme('prime') && isModern() && !isTv() && isReady() && !EXCLUDED.test(route.path);
  },
  mount(route) {
    state.route = route;
    state.el = mountPoint(ID, { tag: 'header', className: 'lfx-prime-header' });
    document.documentElement.classList.add(HTML_CLASS);
    window.addEventListener('scroll', onScroll, { passive: true });
    state.cleanups.push(() => window.removeEventListener('scroll', onScroll));
    render();
  },
  update(route) {
    const changed = !state.route || state.route.hash !== route.hash;
    state.route = route;
    if (!state.el) return;
    const mobileNow = isMobile() && isNarrow();
    if (mobileNow !== state.mobile || (mobileNow && mobileKind(route) !== state.kind)) {
      // Fensterwechsel Desktop <-> Handy bzw. Startseite <-> Unterseite am Handy: Kopfzeile neu aufbauen
      closePrimeSearch({ restoreFocus: false });
      render();
      return;
    }
    if (changed && state.menus) state.menus.close();
    if (state.mobile) {
      refreshTitle();
      if (changed) startTitlePoll();
    }
    applyActive();
  },
  unmount() {
    state.seq++;
    stopTitlePoll();
    for (const fn of state.cleanups.splice(0)) fn();
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    if (state.menus) state.menus.destroy();
    state.menus = null;
    closeProfile();
    closeProfileSheet({ restoreFocus: false });
    closePrimeSearch({ restoreFocus: false });
    unmountPoint(ID);
    document.documentElement.classList.remove(HTML_CLASS, MOBILE_CLASS, PILLS_CLASS);
    state.el = null;
    state.libs = [];
    state.mobile = false;
    state.kind = null;
    state.profileBusy = false;
  },
};
