// LENZPRIME: Hover auf Karten der Startseite/Hubs (Desktop, nur Maus).
// 16:9-Karten: Overlay-Popup #lfx-prime-hover (fixed, Ankerpunkt auf der Karte, im Viewport geklemmt, kein Trailer).
// Poster: klappen horizontal auf, Nachbarn rutschen; nach 1,5 s stummer Trailer. Wirkt nur auf .lfx-prime-card in #lfx-prime-home.
import * as api from '../../core/api.js';
import { cached } from '../../core/cache.js';
import { h, mountPoint, unmountPoint } from '../../core/dom.js';
import { isMenuOpen } from '../../core/itemmenu.js';
import { isChooserOpen } from '../../core/download.js';
import { getStoredItem, putItems } from '../../core/itemstore.js';
import { isMobile, isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { titleHref } from '../../shared/routes.js';
import { createMutedPreview } from '../../shared/trailer.js';
import { getTrendInfo } from '../../shared/trend.js';
import { landscapeFor } from '../rows/card.js';
import { progressPercent } from '../rows/logic.js';
import { ICON_MUTED, ICON_SOUND, svgIcon } from './hero.js';
import { buildTitleInfo } from './hover-content.js';
import { setPreviewHold } from './preview-gate.js';
import { primeHomeRoute, ROOT_ID } from './home-route.js';

const POPUP_ID = 'lfx-prime-hover';
export const INTENT_WIDE_MS = 300;
export const INTENT_POSTER_MS = 420;
export const PREVIEW_MS = 1500;
const LEAVE_MS = 140;
const HOLD_POLL_MS = 300;
const SCALE = 1.56;
const MIN_WIDTH = 340;
const EDGE = 12;
const TOP_GUARD = 72; // Kopfzeile
const FIELDS = 'Overview,Genres,OfficialRating,ProductionYear,RunTimeTicks,ChildCount,CommunityRating,RemoteTrailers,LocalTrailerCount,UserData,ImageTags,BackdropImageTags';

const hoverCapable = () => typeof window.matchMedia === 'function' && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Lage des Popups (rein rechnerisch, testbar): zentriert auf der Karte, im Viewport geklemmt. */
export function popupGeometry(r, vw, vh, infoH = 0) {
  const width = Math.max(Math.round(r.width * SCALE), MIN_WIDTH);
  const imgH = Math.round((width * 9) / 16);
  const total = imgH + infoH;
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let left = cx - width / 2;
  left = Math.max(EDGE, Math.min(left, vw - EDGE - width));
  let top = cy - imgH / 2;
  top = Math.min(top, vh - EDGE - total);
  top = Math.max(top, Math.min(TOP_GUARD, Math.max(0, vh - EDGE - total)));
  return { left, top, width, imgH, originX: cx - left, originY: cy - top, scale: r.width / width };
}

let active = null; // { card, kind, el, preview, video, timers }
let intent = null; // { card, timer }
let leaveTimer = null;
let pointerInside = false;
let listeners = [];
let trendP = null;
let selfScrollUntil = 0;

const holdOpen = () => Boolean(isMenuOpen() || isChooserOpen());
const blocked = () => holdOpen() || document.documentElement.classList.contains('lfx-modal-open')
  || Boolean(document.querySelector('.dialogContainer')) || document.hidden;

function loadDetail(id) {
  return cached(`lfx:prime:hover:${id}`, async () => {
    const it = await api.getItem(id, { Fields: FIELDS });
    if (it) putItems([it]);
    return it;
  }, 5 * 60_000);
}

function trend() {
  if (!trendP) trendP = getTrendInfo().catch(() => null);
  return trendP;
}

function cardOf(target) {
  if (!target || !target.closest) return null;
  const card = target.closest('.lfx-prime-card');
  return card && card.closest(`#${ROOT_ID}`) ? card : null;
}

// ---------------------------------------------------------------- Schließen

function clearIntent() {
  if (intent) clearTimeout(intent.timer);
  intent = null;
}

function closeNow() {
  clearIntent();
  clearTimeout(leaveTimer);
  leaveTimer = null;
  const a = active;
  active = null;
  if (!a) return;
  a.timers.forEach(clearTimeout);
  if (a.preview) a.preview.cancel();
  if (a.holding) setPreviewHold(false);
  if (a.kind === 'popup') {
    unmountPoint(POPUP_ID);
  } else {
    a.card.classList.remove('is-expanded');
    a.el.remove();
  }
}

function scheduleLeave() {
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(function check() {
    leaveTimer = null;
    if (!active || pointerInside) return;
    if (holdOpen()) { leaveTimer = setTimeout(check, HOLD_POLL_MS); return; }
    closeNow();
  }, LEAVE_MS);
}

// ---------------------------------------------------------------- 16:9-Popup

async function openPopup(card) {
  const item = getStoredItem(card.dataset.lfxId);
  const link = card.querySelector('.lfx-card__link');
  if (!item || !link) return;
  const trendInfo = await trend();
  if (!intent || intent.card !== card) return;
  clearIntent();
  if (active || blocked()) return;
  const a = { card, kind: 'popup', el: null, preview: null, video: null, timers: [] };
  const pic = landscapeFor(item, 900);
  const p = progressPercent(item);
  const media = h('a', { class: 'lfx-prime-hover__media', href: titleHref(item.Id), 'aria-label': item.Name || '' }, [
    pic ? h('img', { class: 'lfx-prime-hover__img', src: pic.url, alt: '' }) : null,
    p > 0 ? h('div', { class: 'lfx-prime-card__progress' }, [h('div', { class: 'lfx-prime-card__bar', style: { width: `${Math.round(p)}%` } })]) : null,
  ]);
  const info = h('div', { class: 'lfx-prime-hover__info' }, [
    buildTitleInfo(item, 'popup', { trend: trendInfo, isCurrent: () => active === a }),
  ]);
  const el = mountPoint(POPUP_ID, { className: 'lfx-prime-hover' });
  el.className = 'lfx-prime-hover';
  el.replaceChildren(media, info);
  el.dataset.lfxId = item.Id;
  a.el = el;
  const r = link.getBoundingClientRect();
  const width = Math.max(Math.round(r.width * SCALE), MIN_WIDTH);
  el.style.width = `${width}px`;
  el.style.visibility = 'hidden';
  el.style.left = '0px';
  el.style.top = '0px';
  const imgH = Math.round((width * 9) / 16);
  media.style.height = `${imgH}px`; // vor dem Messen setzen, sonst fehlt die Bildhöhe in offsetHeight
  const g = popupGeometry(r, window.innerWidth, window.innerHeight, Math.max(0, el.offsetHeight - imgH));
  el.style.left = `${g.left}px`;
  el.style.top = `${g.top}px`;
  el.style.transformOrigin = `${g.originX}px ${g.originY}px`;
  el.style.setProperty('--lfx-prime-s0', String(g.scale));
  el.style.visibility = '';
  active = a;
  pointerInside = true;
  const go = () => { if (active === a) el.classList.add('is-in'); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(go));
  else go();
  el.addEventListener('click', (e) => {
    if (e.target.closest('button, a')) return;
    closeNow();
    window.location.hash = titleHref(item.Id);
  });
}

// ---------------------------------------------------------------- Poster aufklappen

async function openPoster(card) {
  const item = getStoredItem(card.dataset.lfxId);
  if (!item) return;
  const trendInfo = await trend();
  if (!intent || intent.card !== card) return;
  clearIntent();
  if (active || blocked()) return;
  const a = { card, kind: 'poster', el: null, preview: null, video: null, timers: [], t0: Date.now() };
  const pic = landscapeFor(item, 1000);
  const mediaEl = h('div', { class: 'lfx-prime-expand__media' }, [
    pic ? h('img', { class: 'lfx-prime-expand__img', src: pic.url, alt: '' }) : null,
  ]);
  const mute = h('button', { type: 'button', class: 'lfx-prime-expand__mute', hidden: true, 'aria-label': 'Ton einschalten' });
  mute.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!a.video) return;
    a.video.muted = !a.video.muted;
    mute.replaceChildren(svgIcon(a.video.muted ? ICON_MUTED : ICON_SOUND));
    mute.setAttribute('aria-label', a.video.muted ? 'Ton einschalten' : 'Ton ausschalten');
  });
  const body = h('div', { class: 'lfx-prime-expand__body' }, [buildTitleInfo(item, 'expand', { trend: trendInfo, isCurrent: () => active === a })]);
  const el = h('div', { class: 'lfx-prime-expand' }, [mediaEl, h('div', { class: 'lfx-prime-expand__shade', 'aria-hidden': 'true' }), mute, body]);
  a.el = el;
  card.append(el);
  card.classList.add('is-expanded');
  active = a;
  pointerInside = true;
  a.timers.push(setTimeout(() => { // aufgeklapptes Poster ganz in die Zeile holen
    const track = card.closest('.lfx-prime-row__track');
    if (!track || active !== a) return;
    const cr = card.getBoundingClientRect();
    const tr = track.getBoundingClientRect();
    const over = cr.right - (tr.right - EDGE * 2);
    if (over > 0) {
      selfScrollUntil = Date.now() + 700;
      if (typeof track.scrollBy === 'function') track.scrollBy({ left: over, behavior: reducedMotion() ? 'auto' : 'smooth' });
    }
  }, 340));
  if (reducedMotion()) return;
  loadDetail(item.Id).then((detail) => {
    if (active !== a || !detail) return;
    a.preview = createMutedPreview(mediaEl, detail, {
      delay: Math.max(0, PREVIEW_MS - (Date.now() - a.t0)),
      startAt: 4,
      onStart: (v) => {
        if (active !== a) return;
        a.video = v;
        a.holding = true;
        setPreviewHold(true);
        v.classList.add('is-in');
        el.classList.add('is-video');
        mute.hidden = false;
        mute.replaceChildren(svgIcon(ICON_MUTED));
      },
      onEnd: () => {
        if (active !== a) return;
        a.preview = null;
        a.video = null;
        if (a.holding) { a.holding = false; setPreviewHold(false); }
        el.classList.remove('is-video');
        mute.hidden = true;
      },
    });
  }, () => {});
}

// ---------------------------------------------------------------- Ereignisse

function scheduleOpen(card) {
  clearIntent();
  if (blocked()) return;
  const poster = card.classList.contains('lfx-prime-card--poster');
  const timer = setTimeout(() => {
    if (!intent || intent.card !== card) return;
    if (!card.isConnected) { clearIntent(); return; }
    (poster ? openPoster : openPopup)(card);
  }, poster ? INTENT_POSTER_MS : INTENT_WIDE_MS);
  intent = { card, timer };
}

function onOver(e) {
  const t = e.target;
  const inPopup = Boolean(t && t.closest && t.closest(`#${POPUP_ID}`));
  const card = inPopup ? null : cardOf(t);
  if (inPopup || (card && active && active.card === card)) {
    pointerInside = true;
    clearTimeout(leaveTimer);
    leaveTimer = null;
    return;
  }
  pointerInside = false;
  if (active) {
    // Poster-Inhalt liegt innerhalb der Karte, also ist `card` schon oben abgefangen; alles andere = verlassen.
    if (!card || card !== active.card) {
      if (card) closeNow();
      else scheduleLeave();
    }
  }
  if (card && !active) scheduleOpen(card);
  else if (!card) clearIntent();
}

function onOut(e) {
  if (e.relatedTarget) return;
  pointerInside = false;
  clearIntent();
  if (active) scheduleLeave();
}

function onScroll() {
  if (!active && !intent) return;
  if (Date.now() < selfScrollUntil) return;
  closeNow();
}

function onKey(e) {
  if (e.key === 'Escape' && active) closeNow();
}

function add(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  listeners.push(() => target.removeEventListener(type, fn, opts));
}

function start() {
  add(document, 'mouseover', onOver);
  add(document, 'mouseout', onOut);
  add(document, 'keydown', onKey);
  add(window, 'scroll', onScroll, { capture: true, passive: true });
  add(window, 'hashchange', closeNow);
  add(window, 'blur', closeNow);
}

function stop() {
  closeNow();
  for (const off of listeners.splice(0)) off();
  unmountPoint(POPUP_ID);
  trendP = null;
  pointerInside = false;
}

const primeHover = {
  name: 'prime-hover',
  match: (route) => isTheme('prime') && isModern() && !isTv() && !isMobile() && api.isReady() && hoverCapable()
    && Boolean(primeHomeRoute(route)),
  mount: start,
  unmount: stop,
};

export default primeHover;
