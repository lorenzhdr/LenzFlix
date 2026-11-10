// LenzFlix: Netflix-Hover-Popup („Mini-Modal“) für Karten am Desktop (Feature "hovercard").
// Ein einziger Delegations-Listener am document (pointerover/pointerout), Popup = eigener Knoten #lfx-hovercard in <body>.
import { h } from '../core/dom.js';
import {
  buildUrl,
  getAuth,
  getItem,
  getUserId,
  isReady,
  landscapeImage,
  logoImage,
  pickLandscape,
  setFavorite,
} from '../core/api.js';
import { cached, clearCache } from '../core/cache.js';
import { getStoredItem, putItems } from '../core/itemstore.js';
import { isMobile, isTv } from '../core/layout.js';
import { play } from '../core/playback.js';
import { canDownload, isChooserOpen, startDownload } from '../core/download.js';
import { isMenuOpen, onItemsChanged, openItemMenu } from '../core/itemmenu.js';
import { ICON_DOWNLOAD, ICON_LIKE, ICON_LIKE_OUTLINE, ICON_MORE } from '../core/icons.js';
import { openModal } from './modal.js';
import {
  computePopupRect,
  episodeLabel,
  formatDuration,
  formatRating,
  genreList,
  progressPercent,
  qualityBadge,
  remainingText,
} from './hovercard/meta.js';

export * from './hovercard/meta.js';

const POPUP_ID = 'lfx-hovercard';
const EXCLUDED = /^\/(video|login|dashboard|selectserver|addserver|startup|forgotpassword|resetpassword|wizard)/;
const NATIVE_TYPES = new Set(['Movie', 'Series', 'Episode', 'Season', 'BoxSet', 'Video']);
const DEFAULT_DELAY = 500;
const CLOSE_GRACE = 150;
const CLOSE_ANIM = 200;
const SCALE = 1.5;
const MIN_WIDTH = 300;
const ITEM_TTL = 5 * 60_000;

// ---------------------------------------------------------------- Zielerkennung

/**
 * Liefert {card, id, type, own} für ein Element innerhalb einer hover-fähigen Karte, sonst null.
 * Eigene Karten: .lfx-card[data-lfx-id]; native: .emby-scroller .card[data-id] mit passendem Typ. Grids/Personen ignoriert.
 */
export function resolveTarget(el) {
  if (!el || typeof el.closest !== 'function') return null;
  if (el.closest(`#${POPUP_ID}, #lfx-modal, .lfx-modal, .vertical-wrap`)) return null;
  const own = el.closest('.lfx-card[data-lfx-id]');
  if (own) return { card: own, id: own.dataset.lfxId, type: own.dataset.lfxType || '', own: true };
  const card = el.closest('.emby-scroller .card[data-id]');
  if (!card || !NATIVE_TYPES.has(card.dataset.type)) return null;
  return { card, id: card.dataset.id, type: card.dataset.type, own: false };
}

function stubItem(target) {
  const d = target.card.dataset;
  if (target.own) return { Id: target.id, Type: target.type };
  return {
    Id: target.id,
    Type: target.type,
    ServerId: d.serverid || undefined,
    MediaType: d.mediatype || undefined,
    IsFolder: d.isfolder === 'true',
  };
}

function cardImageUrl(card) {
  const img = card.querySelector('img.lfx-card__img, img.cardImage');
  const src = img && (img.getAttribute('src') || img.getAttribute('data-src'));
  if (src) return src;
  const bg = card.querySelector('.cardImageContainer');
  if (bg) {
    const m = /url\(["']?(.*?)["']?\)/.exec(bg.style.backgroundImage || '');
    if (m) return m[1];
  }
  return null;
}

// ---------------------------------------------------------------- Icons (statisch, eigene Strings)

const ICONS = {
  play: '<path d="M8 5v14l11-7z"/>',
  plus: '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/>',
  check: '<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>',
  chevron: '<path d="M16.59 8.59 12 13.17 7.41 8.59 6 10l6 6 6-6z"/>',
};

function svg(name) {
  return `<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;
}

// ---------------------------------------------------------------- Zustand

let active = false;
let session = null; // {card, target, el, item, own, fav, like, pending, closing, removeTimer, ...}
let openTimer = null;
let closeTimer = null;
let listeners = [];
let unsubItems = null;
let lastOver = null; // letztes Pointer-Ziel (für die Prüfung nach Menü/Chooser)
let wasHeld = false; // Menü/Chooser war offen und wurde noch nicht ausgewertet

/** Solange das native Menü oder der Download-Chooser offen ist, darf die Hovercard nicht schließen. */
function holdOpen() {
  return Boolean(isMenuOpen() || isChooserOpen());
}

function readDelay() {
  try {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--lfx-hover-delay').trim();
    const m = /^([\d.]+)(ms|s)$/.exec(v);
    if (m) return m[2] === 's' ? parseFloat(m[1]) * 1000 : parseFloat(m[1]);
  } catch {
    /* Default */
  }
  return DEFAULT_DELAY;
}

function hoverCapable() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
}

function enabled() {
  const cl = document.documentElement.classList;
  return cl.contains('lfx-js') && !cl.contains('lfx-tv') && !isTv() && !isMobile() && hoverCapable();
}

function clearOpen() {
  if (openTimer) clearTimeout(openTimer);
  openTimer = null;
}

function clearClose() {
  if (closeTimer) clearTimeout(closeTimer);
  closeTimer = null;
}

// ---------------------------------------------------------------- Aktionen

async function setLike(id, likes) {
  const { token, userId } = getAuth();
  const res = await fetch(buildUrl(`/Users/${userId}/Items/${id}/Rating`, likes ? { likes: true } : undefined), {
    method: likes ? 'POST' : 'DELETE',
    headers: { Authorization: `MediaBrowser Token="${token}"` },
  });
  if (!res.ok) throw new Error(`LenzFlix API: HTTP ${res.status} (Bewertung)`);
}

function userData(s) {
  return (s.item && s.item.UserData) || {};
}

function patchUserData(s, patch) {
  s.item = { ...s.item, UserData: { ...userData(s), ...patch } };
  putItems([s.item]);
  clearCache(`hc:${getUserId()}:${s.item.Id}`);
}

async function toggleFavorite(s) {
  if (s.busyFav) return;
  s.busyFav = true;
  const before = Boolean(s.fav);
  s.fav = !before;
  updateButtons(s);
  try {
    await setFavorite(s.item.Id, s.fav);
    patchUserData(s, { IsFavorite: s.fav });
  } catch (e) {
    s.fav = before;
    console.error('[LenzFlix] Favorit', e && e.message);
  } finally {
    s.busyFav = false;
    updateButtons(s);
  }
}

async function toggleLike(s) {
  if (s.busyLike) return;
  s.busyLike = true;
  const before = Boolean(s.like);
  s.like = !before;
  updateButtons(s);
  try {
    await setLike(s.item.Id, s.like);
    patchUserData(s, { Likes: s.like ? true : undefined });
  } catch (e) {
    s.like = before;
    console.error('[LenzFlix] Bewertung', e && e.message);
  } finally {
    s.busyLike = false;
    updateButtons(s);
  }
}

function startPlayback(s) {
  const ud = userData(s);
  const resume = (ud.PlaybackPositionTicks || 0) > 0 || progressPercent(s.item) > 0;
  const item = s.item;
  closeNow();
  play(item, { resume });
}

function openMenu(s) {
  wasHeld = true;
  clearClose();
  openItemMenu(s.item, s.btns.menu.btn, { onClose: () => onMenuClosed(s) });
}

function downloadClick(s) {
  wasHeld = true;
  clearClose();
  startDownload(s.item, s.btns.dl.btn);
}

function showDetails(s) {
  const item = s.item;
  closeNow();
  openModal(item);
}

// ---------------------------------------------------------------- Rendering

function circleButton(cls, label, onClick) {
  const btn = h('button', { type: 'button', class: `lfx-hc__btn ${cls}`, 'aria-label': label });
  const tip = h('span', { class: 'lfx-hc__tip', 'aria-hidden': 'true' }, label);
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return { btn, tip, wrap: h('span', { class: 'lfx-hc__btnwrap' }, [btn, tip]) };
}

function setButton(b, label, iconHtml, pressed) {
  b.btn.setAttribute('aria-label', label);
  b.tip.textContent = label;
  b.btn.innerHTML = iconHtml;
  if (pressed === undefined) b.btn.removeAttribute('aria-pressed');
  else b.btn.setAttribute('aria-pressed', String(pressed));
  b.btn.classList.toggle('is-on', Boolean(pressed));
}

function updateButtons(s) {
  setButton(s.btns.play, 'Abspielen', svg('play'));
  setButton(
    s.btns.list,
    s.fav ? 'Aus Meiner Liste entfernen' : 'Zu Meiner Liste hinzufügen',
    s.fav ? svg('check') : svg('plus'),
    Boolean(s.fav),
  );
  setButton(
    s.btns.like,
    s.like ? 'Gefällt mir nicht mehr' : 'Gefällt mir',
    s.like ? ICON_LIKE : ICON_LIKE_OUTLINE,
    Boolean(s.like),
  );
  setButton(s.btns.dl, /^(Series|Season)$/.test(s.item.Type) ? 'Episoden herunterladen' : 'Herunterladen', ICON_DOWNLOAD);
  setButton(s.btns.menu, 'Mehr', ICON_MORE);
  setButton(s.btns.more, 'Weitere Infos', svg('chevron'));
}

function badge(text, cls = '') {
  return h('span', { class: `lfx-hc__badge ${cls}`.trim() }, text);
}

function renderBody(s) {
  const it = s.item;
  const body = s.body;
  body.textContent = '';
  const pct = progressPercent(it);
  if (it.Type === 'Episode') {
    const label = episodeLabel(it);
    if (label) body.append(h('div', { class: 'lfx-hc__ep' }, label));
    if (pct > 0) {
      body.append(
        h('div', { class: 'lfx-hc__progress' }, [
          h('div', { class: 'lfx-hc__rail' }, h('div', { class: 'lfx-hc__fill', style: { width: `${pct}%` } })),
          h('span', { class: 'lfx-hc__remain' }, remainingText(it)),
        ]),
      );
    }
  }
  if (!(it.Type === 'Episode' && pct > 0)) {
    const parts = [];
    const rating = formatRating(it.OfficialRating);
    if (rating) parts.push(badge(rating, 'lfx-hc__badge--rating'));
    const dur = formatDuration(it);
    if (dur) parts.push(h('span', { class: 'lfx-hc__dur' }, dur));
    const q = qualityBadge(it);
    if (q) parts.push(badge(q, 'lfx-hc__badge--q'));
    if (it.ProductionYear) parts.push(h('span', { class: 'lfx-hc__year' }, String(it.ProductionYear)));
    if (parts.length) body.append(h('div', { class: 'lfx-hc__meta' }, parts));
  }
  const genres = genreList(it, 3);
  if (genres.length) {
    const row = h('div', { class: 'lfx-hc__genres' });
    genres.forEach((g, i) => {
      if (i) row.append(h('span', { class: 'lfx-hc__dot', 'aria-hidden': 'true' }, '•'));
      row.append(h('span', null, g));
    });
    body.append(row);
  }
}

function applyMedia(s) {
  const it = s.item;
  const portrait = !s.own && /Portrait|Square/i.test(s.card.className);
  const fromCard = cardImageUrl(s.card);
  const landscape = it && it.ImageTags ? landscapeImage(it) : null;
  const url = (portrait || !fromCard ? landscape || fromCard : fromCard) || null;
  if (url && s.img.getAttribute('src') !== url) s.img.src = url;
  // Titel-Overlay (Logo/Text) nur einmal setzen
  if (s.overlay.childNodes.length) return;
  const cardLogo = s.card.querySelector('.lfx-card__logo');
  const cardTitle = s.card.querySelector('.lfx-card__title');
  if (cardLogo && cardLogo.getAttribute('src')) {
    s.overlay.append(h('img', { class: 'lfx-hc__logo', src: cardLogo.getAttribute('src'), alt: '' }));
  } else if (cardTitle) {
    s.overlay.append(h('span', { class: 'lfx-hc__title' }, cardTitle.textContent));
  } else if (!s.own && it && it.ImageTags) {
    const pick = pickLandscape(it);
    if (pick && pick.type !== 'Thumb') {
      const logo = logoImage(it);
      if (logo) s.overlay.append(h('img', { class: 'lfx-hc__logo', src: logo, alt: '' }));
      else if (it.Name) s.overlay.append(h('span', { class: 'lfx-hc__title' }, it.Name));
    }
  }
}

function render(s) {
  s.fav = Boolean(userData(s).IsFavorite);
  s.like = userData(s).Likes === true;
  s.el.setAttribute('aria-label', s.item.Name || s.card.querySelector('[aria-label]')?.getAttribute('aria-label') || 'Titel');
  updateButtons(s);
  renderBody(s);
  applyMedia(s);
  refreshDownload(s);
}

/** Download-Button nur zeigen, wenn canDownload(item) true liefert (async, Race-sicher). */
function refreshDownload(s) {
  const item = s.item;
  Promise.resolve()
    .then(() => canDownload(item))
    .then((ok) => {
      if (session !== s || !s.item || s.item.Id !== item.Id) return;
      s.btns.dl.wrap.hidden = !ok;
    })
    .catch(() => {});
}

async function hydrate(s, force = false) {
  const id = s.item.Id;
  if (!force && s.item.Genres && s.item.UserData) return;
  try {
    const full = await cached(`hc:${getUserId()}:${id}`, () => getItem(id), ITEM_TTL);
    if (session !== s || !full) return;
    // Optimistische Zustände nicht überschreiben, solange eine Anfrage läuft
    const keepFav = s.busyFav ? s.fav : undefined;
    const keepLike = s.busyLike ? s.like : undefined;
    s.item = { ...s.item, ...full };
    putItems([s.item]);
    render(s);
    if (keepFav !== undefined) s.fav = keepFav;
    if (keepLike !== undefined) s.like = keepLike;
    if (keepFav !== undefined || keepLike !== undefined) updateButtons(s);
  } catch {
    /* Popup bleibt mit den vorhandenen Daten stehen */
  }
}

function buildPopup(s) {
  const img = h('img', { class: 'lfx-hc__img', alt: '', decoding: 'async' });
  const overlay = h('div', { class: 'lfx-hc__overlay' });
  const media = h('div', { class: 'lfx-hc__media' }, [img, overlay]);
  media.addEventListener('click', () => showDetails(s));
  s.btns = {
    play: circleButton('lfx-hc__btn--play', 'Abspielen', () => startPlayback(s)),
    list: circleButton('', 'Meine Liste', () => toggleFavorite(s)),
    like: circleButton('lfx-hc__btn--like', 'Gefällt mir', () => toggleLike(s)),
    dl: circleButton('lfx-hc__btn--dl', 'Herunterladen', () => downloadClick(s)),
    menu: circleButton('lfx-hc__btn--menu', 'Mehr', () => openMenu(s)),
    more: circleButton('lfx-hc__btn--more', 'Weitere Infos', () => showDetails(s)),
  };
  s.btns.dl.wrap.hidden = true;
  s.btns.menu.btn.setAttribute('aria-haspopup', 'menu');
  const body = h('div', { class: 'lfx-hc__body' });
  const actions = h('div', { class: 'lfx-hc__actions' }, [
    h('div', { class: 'lfx-hc__actions-main' }, [s.btns.play.wrap, s.btns.list.wrap, s.btns.like.wrap, s.btns.dl.wrap, s.btns.menu.wrap]),
    s.btns.more.wrap,
  ]);
  const info = h('div', { class: 'lfx-hc__info' }, [actions, body]);
  const el = h('div', { id: POPUP_ID, class: 'lfx-hc', role: 'dialog', 'aria-label': 'Titel' }, [media, info]);
  s.el = el;
  s.img = img;
  s.overlay = overlay;
  s.body = body;
  return el;
}

// ---------------------------------------------------------------- Öffnen / Schließen

function open(target) {
  if (!enabled() || !target.card.isConnected) return;
  closeNow();
  const cardRect = target.card.getBoundingClientRect();
  if (!cardRect.width) return;
  const s = {
    card: target.card,
    target,
    own: target.own,
    item: getStoredItem(target.id) || stubItem(target),
    closing: false,
    removeTimer: null,
    busyFav: false,
    busyLike: false,
  };
  const el = buildPopup(s);
  session = s;
  const vw = document.documentElement.clientWidth || window.innerWidth;
  const vh = window.innerHeight;
  const rect = computePopupRect(cardRect, vw, SCALE, { minWidth: MIN_WIDTH, viewportH: vh });
  el.style.left = `${rect.left}px`;
  el.style.top = `${rect.top}px`;
  el.style.width = `${rect.width}px`;
  render(s);
  document.body.append(el);
  // Unterkante im Viewport halten (Höhe erst nach dem Einfügen bekannt)
  const total = el.offsetHeight;
  let top = rect.top;
  if (total && top + total > vh - 8) top = Math.max(8, vh - 8 - total);
  el.style.top = `${top}px`;
  // Startzustand = Position/Größe der Karte (Bildteil mittig auf der Karte)
  const k = cardRect.width / rect.width;
  const dx = cardRect.left - rect.left;
  const dy = cardRect.top + cardRect.height / 2 - (top + (rect.imageHeight * k) / 2);
  el.style.setProperty('--lfx-hc-from', `translate(${dx}px, ${dy}px) scale(${k})`);
  void el.offsetWidth; // Reflow, damit die Transition vom Startzustand läuft
  el.classList.add('is-open');
  hydrate(s);
}

function removeSession(s) {
  if (s.removeTimer) clearTimeout(s.removeTimer);
  s.removeTimer = null;
  s.el.remove();
  if (session === s) session = null;
}

/** Animiert schließen (Rückwärtsanimation 200 ms). */
function close() {
  clearClose();
  const s = session;
  if (!s || s.closing) return;
  s.closing = true;
  s.el.classList.remove('is-open');
  s.el.classList.add('is-closing');
  s.removeTimer = setTimeout(() => removeSession(s), CLOSE_ANIM);
}

/** Sofort ohne Animation entfernen (Scroll, Resize, anderes Ziel, Cleanup). */
function closeNow() {
  clearClose();
  if (session) removeSession(session);
}

function scheduleClose() {
  if (closeTimer || !session || session.closing) return;
  closeTimer = setTimeout(() => {
    closeTimer = null;
    close();
  }, CLOSE_GRACE);
}

// ---------------------------------------------------------------- Events

function leave() {
  clearOpen();
  if (holdOpen()) return;
  if (session) scheduleClose();
}

/** Liegt der Zeiger noch über Karte oder Popup? (letztes Ziel oder :hover) */
function pointerStillInside(s, el) {
  if (el && el.isConnected && (s.el.contains(el) || s.card.contains(el))) return true;
  try {
    return s.el.matches(':hover') || s.card.matches(':hover');
  } catch {
    return false;
  }
}

function onMenuClosed(s) {
  wasHeld = false;
  if (session !== s || s.closing) return;
  if (!pointerStillInside(s, lastOver)) scheduleClose();
}

function onMove(e) {
  if (e.pointerType && e.pointerType !== 'mouse') return;
  lastOver = e.target;
  if (!wasHeld) return;
  if (holdOpen()) return;
  wasHeld = false;
  if (session && !session.closing && !pointerStillInside(session, e.target)) scheduleClose();
}

function onOver(e) {
  if (e.pointerType && e.pointerType !== 'mouse') return;
  const t = e.target;
  lastOver = t;
  if (holdOpen()) {
    wasHeld = true;
    clearOpen();
    return;
  }
  wasHeld = false;
  if (session && !session.closing && session.el.contains(t)) {
    clearClose();
    return;
  }
  const target = resolveTarget(t);
  if (!target || !enabled()) {
    leave();
    return;
  }
  clearClose();
  if (session && !session.closing && session.card === target.card) return;
  clearOpen();
  if (session) closeNow();
  openTimer = setTimeout(() => {
    openTimer = null;
    open(target);
  }, readDelay());
}

function onOut(e) {
  if (e.pointerType && e.pointerType !== 'mouse') return;
  if (holdOpen()) return;
  if (!e.relatedTarget) leave();
}

function onKey(e) {
  if (holdOpen()) return;
  if (e.key === 'Escape' && session) close();
}

function onHash() {
  clearOpen();
  closeNow();
}

function onAbort() {
  if (holdOpen()) return;
  onHash();
}

function onItems({ removed = [], updated = [] } = {}) {
  const s = session;
  if (!s || !s.item) return;
  const id = s.item.Id;
  if (removed.includes(id)) {
    closeNow();
    return;
  }
  if (updated.includes(id)) {
    clearCache(`hc:${getUserId()}:${id}`);
    const fresh = getStoredItem(id);
    if (fresh) s.item = { ...s.item, ...fresh };
    hydrate(s, true);
  }
}

function onClickCapture(e) {
  if (session && session.el.contains(e.target)) return;
  onAbort();
}

function start() {
  if (active) return;
  active = true;
  const add = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    listeners.push(() => target.removeEventListener(type, fn, opts));
  };
  add(document, 'pointerover', onOver, { passive: true });
  add(document, 'pointerout', onOut, { passive: true });
  add(document, 'pointermove', onMove, { passive: true });
  add(document, 'keydown', onKey);
  add(document, 'click', onClickCapture, true);
  add(window, 'scroll', onAbort, { capture: true, passive: true });
  add(window, 'resize', onAbort, { passive: true });
  add(window, 'hashchange', onHash);
  unsubItems = onItemsChanged(onItems);
}

function stop() {
  active = false;
  wasHeld = false;
  lastOver = null;
  if (typeof unsubItems === 'function') unsubItems();
  unsubItems = null;
  clearOpen();
  closeNow();
  for (const off of listeners.splice(0)) off();
}

const hovercardFeature = {
  name: 'hovercard',
  match(route) {
    return !EXCLUDED.test(route.path) && isReady() && !isTv() && !isMobile() && hoverCapable();
  },
  mount() {
    start();
  },
  unmount() {
    stop();
  },
};

export default hovercardFeature;
