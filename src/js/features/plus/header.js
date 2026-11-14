// LENZ+: Kopfzeile mit Wortmarke, Profil-Chip (Menü), zentrierter Navigation und Suche.
// Eigener Container #lfx-plus-header; die native AppBar wird nur per html-Klasse (lfx-plus-header-on) ausgeblendet.
import { h, mountPoint, unmountPoint } from '../../core/dom.js';
import { isReady } from '../../core/api.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme, brandName } from '../../core/theme.js';
import { openPopover, closePopover, isPopoverOpen } from '../../core/popover.js';
import { parseLfxRoute, browseHref, searchHref, tvModeHref } from '../../shared/routes.js';
import { profileEntries, getUserChip } from '../../shared/profile.js';
import { getLibraries } from '../../shared/libraries.js';
import { createDataSaverButton } from '../../shared/dsbtn.js';
import { ICONS } from './header-icons.js';
import { isPhone } from './mobile.js';

const ROOT_ID = 'lfx-plus-header';
const ON_CLASS = 'lfx-plus-header-on';
const HIDDEN_CLASS = 'lfx-plus-header-hidden';
const EXCLUDED = /^\/(login|selectserver|addserver|startup|forgotpassword|resetpassword|wizard|video|dashboard|queue)/;
const SOLID_AT = 10; // ab dieser Scrollposition schwarz
const HIDE_AFTER = 80; // erst ab hier ausfahren
const SCROLL_DELTA = 4; // Mindestbewegung gegen Zittern
const OPEN_DELAY = 150;
const CLOSE_DELAY = 250;

/** Navigationspunkte; Filme/Serien nur, wenn die Bibliothek existiert. libs = getLibraries()-Ergebnis. */
export function navItems(libs) {
  const list = Array.isArray(libs) ? libs : [];
  const movies = list.find((l) => l.collectionType === 'movies') || null;
  const series = list.find((l) => l.collectionType === 'tvshows') || null;
  const items = [
    { key: 'home', label: 'Startseite', href: '#/home', icon: 'home' },
    { key: 'list', label: 'Meine Liste', href: '#/home?tab=1', icon: 'list' },
  ];
  if (movies) items.push({ key: 'movies', label: 'Filme', href: browseHref(movies.id), icon: 'movies' });
  if (series) items.push({ key: 'series', label: 'Serien', href: browseHref(series.id), icon: 'tv' });
  items.push({ key: 'new', label: 'Neu & beliebt', href: '#/home?lfx=new', icon: 'star' });
  return items;
}

/** Aktiver Schlüssel: home | list | movies | series | new | search | null. route = parseHash-Ergebnis. */
export function activeKey(route, libs) {
  if (!route) return null;
  const list = Array.isArray(libs) ? libs : [];
  const movies = list.find((l) => l.collectionType === 'movies');
  const series = list.find((l) => l.collectionType === 'tvshows');
  const { kind, lib } = parseLfxRoute(route);
  if (route.path === '/home') {
    if (kind === 'new') return 'new';
    if (kind === 'search') return 'search';
    if (kind === 'tv') return 'tv';
    if (kind === 'browse') {
      if (movies && lib === movies.id) return 'movies';
      if (series && lib === series.id) return 'series';
      return null;
    }
    if (kind) return null;
    const tab = route.params.get('tab');
    if (tab === '1') return 'list';
    return !tab || tab === '0' ? 'home' : null;
  }
  const parent = route.params.get('topParentId') || route.params.get('parentId');
  if (route.path === '/movies' && (!parent || (movies && parent === movies.id))) return 'movies';
  if (route.path === '/tv' && (!parent || (series && parent === series.id))) return 'series';
  return null;
}

const state = {
  root: null,
  nav: null,
  chip: null,
  route: null,
  libs: [],
  seq: 0, // Menü-Öffnen
  mountSeq: 0, // Mount-Generation (async Füllung)
  cleanups: [],
  menu: null,
  pinned: false,
  openTimer: null,
  closeTimer: null,
  raf: 0,
  lastY: 0,
};

const icon = (name, cls) => {
  const span = h('span', { class: cls, 'aria-hidden': 'true' });
  span.innerHTML = ICONS[name];
  return span;
};

// ------------------------------------------------------------------ Navigation

function applyActive() {
  if (!state.root) return;
  const key = state.route ? activeKey(state.route, state.libs) : null;
  for (const el of state.root.querySelectorAll('[data-key]')) {
    const on = el.dataset.key === key;
    el.classList.toggle('is-active', on);
    if (on) el.setAttribute('aria-current', 'page');
    else el.removeAttribute('aria-current');
  }
}

function renderNav() {
  if (!state.nav) return;
  state.nav.textContent = '';
  for (const it of navItems(state.libs)) {
    state.nav.append(
      h('a', { class: 'lfx-plus-header__item', href: it.href, dataset: { key: it.key } }, [
        icon(it.icon, 'lfx-plus-header__icon'),
        h('span', { class: 'lfx-plus-header__label' }, it.label),
      ]),
    );
  }
  applyActive();
}

// ------------------------------------------------------------------ Profilmenü

const menuOpen = () => Boolean(state.menu && state.menu.el.isConnected && isPopoverOpen());

function clearTimers() {
  clearTimeout(state.openTimer);
  clearTimeout(state.closeTimer);
  state.openTimer = null;
  state.closeTimer = null;
}

function closeMenu() {
  clearTimers();
  state.seq++;
  if (menuOpen()) closePopover();
  state.menu = null;
  state.pinned = false;
}

async function openMenu() {
  if (!state.chip || menuOpen()) return;
  const seq = ++state.seq;
  let items;
  try {
    items = await profileEntries({ theme: 'plus', returnFocus: state.chip });
  } catch {
    items = [];
  }
  if (seq !== state.seq || !state.chip || menuOpen()) return;
  const menu = openPopover(state.chip, { label: 'Profilmenü', items, align: 'start', className: 'lfx-plus-menu' });
  state.menu = menu;
  menu.el.addEventListener('mouseenter', () => clearTimeout(state.closeTimer));
  menu.el.addEventListener('mouseleave', () => scheduleClose());
}

function scheduleOpen() {
  clearTimeout(state.closeTimer);
  if (menuOpen() || state.openTimer) return;
  state.openTimer = setTimeout(() => {
    state.openTimer = null;
    openMenu();
  }, OPEN_DELAY);
}

function scheduleClose() {
  clearTimeout(state.openTimer);
  state.openTimer = null;
  if (state.pinned || !menuOpen()) return;
  clearTimeout(state.closeTimer);
  state.closeTimer = setTimeout(() => {
    state.closeTimer = null;
    if (!state.pinned) closeMenu();
  }, CLOSE_DELAY);
}

function onChipClick() {
  clearTimers();
  if (menuOpen()) {
    if (state.pinned) closeMenu();
    else state.pinned = true; // per Hover geöffnet: Klick hält das Menü offen
    return;
  }
  state.pinned = true;
  openMenu();
}

async function fillChip(mountSeq) {
  let user = { name: '', imageUrl: null };
  try {
    user = await getUserChip({ retries: 20, isAlive: () => mountSeq === state.mountSeq && Boolean(state.chip) });
  } catch { /* Platzhalter bleibt */ }
  if (mountSeq !== state.mountSeq || !state.chip) return;
  const avatar = state.chip.querySelector('.lfx-plus-header__avatar');
  const name = state.chip.querySelector('.lfx-plus-header__name');
  name.textContent = user.name || '';
  if (user.imageUrl) {
    avatar.style.backgroundImage = `url("${user.imageUrl}")`;
    avatar.textContent = '';
  } else {
    avatar.textContent = (user.name || '?').trim().charAt(0).toUpperCase();
  }
  if (user.name) state.chip.setAttribute('aria-label', `Profilmenü: ${user.name}`);
}

// ------------------------------------------------------------------ Scrollen

/** Ausgefahren-Zustand an Kopfzeile und html (die Pille wechselt dann von top 84px auf 20px). */
function setHidden(on) {
  if (state.root) state.root.classList.toggle('is-hidden', on);
  document.documentElement.classList.toggle(HIDDEN_CLASS, on);
}

function scrollTick() {
  state.raf = 0;
  const root = state.root;
  if (!root) return;
  const y = Math.max(0, window.scrollY || document.documentElement.scrollTop || 0);
  const dy = y - state.lastY;
  root.classList.toggle('is-solid', y > SOLID_AT);
  if (y <= SOLID_AT) {
    setHidden(false);
  } else if (dy >= SCROLL_DELTA && y > HIDE_AFTER) {
    if (!root.contains(document.activeElement) && !menuOpen()) setHidden(true);
  } else if (dy <= -SCROLL_DELTA) {
    setHidden(false);
  }
  if (Math.abs(dy) >= SCROLL_DELTA || y <= SOLID_AT) state.lastY = y;
}

function onScroll() {
  if (state.raf) return;
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 16);
  state.raf = raf(scrollTick);
}

// ------------------------------------------------------------------ Feature

async function loadLibraries(mountSeq) {
  let libs = [];
  try {
    libs = (await getLibraries()) || [];
  } catch { /* ohne Filme/Serien weiter */ }
  if (mountSeq !== state.mountSeq || !state.root) return;
  state.libs = libs;
  renderNav();
}

export const plusHeader = {
  name: 'plus-header',
  match(route) {
    return isTheme('plus') && isModern() && !isTv() && !isPhone() && isReady() && !EXCLUDED.test(route.path);
  },
  mount(route) {
    const mountSeq = ++state.mountSeq;
    state.route = route;
    state.libs = [];
    state.pinned = false;
    const root = mountPoint(ROOT_ID, { tag: 'header', className: 'lfx-plus-header' });
    root.textContent = '';
    state.root = root;

    const brand = h('a', { class: 'lfx-plus-header__brand', href: '#/home', 'aria-label': `${brandName('plus')} Startseite` });
    const chip = h('button', {
      type: 'button',
      class: 'lfx-plus-header__chip',
      'aria-haspopup': 'menu',
      'aria-label': 'Profilmenü',
    }, [
      h('span', { class: 'lfx-plus-header__avatar', 'aria-hidden': 'true' }),
      h('span', { class: 'lfx-plus-header__name' }),
    ]);
    const nav = h('nav', { class: 'lfx-plus-header__nav', 'aria-label': 'Hauptnavigation' });
    const search = h('a', { class: 'lfx-plus-header__search', href: searchHref(), 'aria-label': 'Suche', dataset: { key: 'search' } });
    search.append(icon('search', 'lfx-plus-header__icon'));
    const tv = h('a', { class: 'lfx-plus-header__tv', href: tvModeHref, 'aria-label': 'TV', title: 'TV', dataset: { key: 'tv' } });
    tv.append(icon('tvmode', 'lfx-plus-header__icon'));
    tv.addEventListener('click', () => window.dispatchEvent(new CustomEvent('lfx:tvmode-intent')));
    const ds = createDataSaverButton({ className: 'lfx-plus-header__ds' });
    root.append(h('div', { class: 'lfx-plus-header__left' }, [brand, chip]), nav, ds, tv, search);
    state.nav = nav;
    state.chip = chip;

    chip.addEventListener('click', onChipClick);
    chip.addEventListener('mouseenter', scheduleOpen);
    chip.addEventListener('mouseleave', scheduleClose);
    chip.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.pinned = true;
        clearTimers();
        openMenu();
      }
    });

    document.documentElement.classList.add(ON_CLASS);
    renderNav();
    window.addEventListener('scroll', onScroll, { passive: true });
    state.cleanups.push(() => window.removeEventListener('scroll', onScroll));
    state.lastY = Math.max(0, window.scrollY || 0);
    scrollTick();
    fillChip(mountSeq);
    loadLibraries(mountSeq);
  },
  update(route) {
    // Der Router ruft update() bei jedem viewshow auf: Menü nur bei echter Routenänderung schließen.
    const changed = !state.route || state.route.hash !== route.hash;
    state.route = route;
    if (changed) {
      closeMenu();
      setHidden(false);
    }
    applyActive();
  },
  unmount() {
    state.mountSeq++;
    closeMenu();
    for (const fn of state.cleanups.splice(0)) fn();
    if (state.raf && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(state.raf);
    state.raf = 0;
    unmountPoint(ROOT_ID);
    document.documentElement.classList.remove(ON_CLASS, HIDDEN_CLASS);
    state.root = null;
    state.nav = null;
    state.chip = null;
    state.libs = [];
  },
};

export default plusHeader;
