// LENZ//84 Kopfzeile (Desktop ≥ 800 px): Terminal-Statuszeile mit Wortmarke, Navigation als Befehle, Uhr, Sound-/CRT-Schalter und Profil.
// Eigener Mount #lfx-retro-header; die native AppBar wird nur per html.lfx-retro-header-on ausgeblendet. Gehört Worker P1.
import { h, mountPoint, unmountPoint } from '../../core/dom.js';
import { isReady } from '../../core/api.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { openPopover, closePopover, isPopoverOpen } from '../../core/popover.js';
import { getLibraries } from '../../shared/libraries.js';
import { profileEntries, getUserChip } from '../../shared/profile.js';
import { emitFx } from './prefs.js';
import { EXCLUDED, activeKey, isPhone, navItems } from './header-nav.js';
import { createClock, createLogo, createToggle } from './header-ui.js';

const ID = 'lfx-retro-header';
const HTML_CLASS = 'lfx-retro-header-on';
const SCROLL_THRESHOLD = 10;
const HOVER_GAP_MS = 140;

const state = {
  el: null, route: null, libs: [], seq: 0, raf: 0, busy: false, lastHover: 0, cleanups: [],
};

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
  const nav = state.el && state.el.querySelector('.lfx-retro-header__nav');
  if (!nav) return;
  nav.replaceChildren(...navItems(state.libs).map((it) => h('a', {
    class: 'lfx-retro-header__link', href: it.href, dataset: { key: it.key },
  }, it.label)));
  applyActive();
}

function profileIsOpen() {
  const el = document.getElementById('lfx-popover');
  return isPopoverOpen() && Boolean(el && el.classList.contains('lfx-retro-profile'));
}

async function toggleProfile(btn) {
  if (profileIsOpen()) { closePopover({ restoreFocus: true }); return; }
  if (state.busy) return;
  state.busy = true;
  try {
    const items = await profileEntries({ theme: 'retro', returnFocus: btn });
    if (!state.el || !btn.isConnected) return;
    openPopover(btn, { label: 'Profil', items, align: 'end', className: 'lfx-retro-profile' });
  } finally {
    state.busy = false;
  }
}

function build() {
  const logo = createLogo('lfx-retro-header__logo');
  const nav = h('nav', { class: 'lfx-retro-header__nav', 'aria-label': 'Hauptnavigation' });
  const clock = createClock();
  const sound = createToggle('sound');
  const crt = createToggle('crt');
  const avatar = h('button', {
    type: 'button', class: 'lfx-retro-header__avatar', 'aria-label': 'Profil', 'aria-haspopup': 'true',
  }, [h('span', { class: 'lfx-retro-header__initial', 'aria-hidden': 'true' }, '?')]);
  avatar.addEventListener('click', () => toggleProfile(avatar));
  const right = h('div', { class: 'lfx-retro-header__right' }, [clock.el, sound.el, crt.el, avatar]);
  state.el.replaceChildren(h('div', { class: 'lfx-retro-header__bar' }, [logo, nav, right]));
  state.cleanups.push(clock.destroy, sound.destroy, crt.destroy);

  nav.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('a')) emitFx('nav'); });
  nav.addEventListener('pointerover', (e) => {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    if (!e.target.closest || !e.target.closest('a')) return;
    const now = Date.now();
    if (now - state.lastHover < HOVER_GAP_MS) return;
    state.lastHover = now;
    emitFx('hover');
  });
  return { avatar };
}

async function loadLibs(seq) {
  let libs;
  try { libs = (await getLibraries()) || []; } catch { libs = []; }
  if (seq !== state.seq || !state.el) return;
  state.libs = libs;
  renderNav();
}

async function loadAvatar(seq, avatar) {
  let chip = { name: '', imageUrl: null };
  try {
    chip = await getUserChip({ retries: 20, isAlive: () => seq === state.seq && Boolean(state.el) });
  } catch { /* Initial genügt */ }
  if (seq !== state.seq || !state.el) return;
  avatar.replaceChildren();
  if (chip.imageUrl) avatar.append(h('img', { src: chip.imageUrl, alt: '', draggable: 'false' }));
  else avatar.append(h('span', { class: 'lfx-retro-header__initial', 'aria-hidden': 'true' }, (chip.name || '?').trim().charAt(0).toUpperCase() || '?'));
  if (chip.name) avatar.setAttribute('aria-label', `Profil: ${chip.name}`);
}

function applyScroll() {
  if (!state.el) return;
  const y = window.scrollY || document.documentElement.scrollTop || 0;
  const on = y > SCROLL_THRESHOLD;
  if (state.el.classList.contains('is-scrolled') !== on) state.el.classList.toggle('is-scrolled', on);
}

function onScroll() {
  if (state.raf) return;
  state.raf = requestAnimationFrame(() => { state.raf = 0; applyScroll(); });
}

export default {
  name: 'retro-header',
  match(route) {
    return isTheme('retro') && isModern() && !isTv() && !isPhone() && isReady() && !EXCLUDED.test(route.path);
  },
  mount(route) {
    const seq = ++state.seq;
    state.route = route;
    state.el = mountPoint(ID, { tag: 'header', className: 'lfx-retro-header' });
    const { avatar } = build();
    document.documentElement.classList.add(HTML_CLASS);
    window.addEventListener('scroll', onScroll, { passive: true });
    state.cleanups.push(() => window.removeEventListener('scroll', onScroll));
    renderNav();
    applyScroll();
    loadLibs(seq);
    loadAvatar(seq, avatar);
  },
  update(route) {
    state.route = route;
    if (!state.el) return;
    if (profileIsOpen()) closePopover();
    applyActive();
  },
  unmount() {
    state.seq++;
    for (const fn of state.cleanups.splice(0)) fn();
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    if (profileIsOpen()) closePopover();
    unmountPoint(ID);
    document.documentElement.classList.remove(HTML_CLASS);
    state.el = null;
    state.route = null;
    state.libs = [];
    state.busy = false;
  },
};
