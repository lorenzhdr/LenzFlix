// LENZ//84: Kassetten-Vorschau (Desktop, nur Maus). Verweilen (~600 ms) über einer Retro-Karte kippt die Kassette leicht
// (Klasse is-preview, CSS) und zeigt daneben ein Etikett #lfx-retro-hover (fixed, im Viewport geklemmt) mit Titel, Meta,
// [ ABSPIELEN ] / [ + MERKEN ] und nach ~1,5 s einem stummen Trailer (nicht bei Datensparmodus-Teil 'trailer').
// Listener: EIN delegiertes mouseover/mouseout am document (streng auf .lfx-retro-card gefiltert; die Karten stehen auf
// Startseite, Hubs, Browse und Suche in getrennten Wurzeln). Scroll-Listener nur, solange Absicht oder Vorschau offen sind.
import * as api from '../../core/api.js';
import { cached } from '../../core/cache.js';
import { h, mountPoint, unmountPoint } from '../../core/dom.js';
import { isMenuOpen } from '../../core/itemmenu.js';
import { getStoredItem, putItems } from '../../core/itemstore.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { isDataSaver } from '../../core/datasaver.js';
import { play } from '../../core/playback.js';
import { titleHref } from '../../shared/routes.js';
import { toggleFavorite } from '../../shared/titleactions.js';
import { createMutedPreview } from '../../shared/trailer.js';
import * as data from '../modal/data.js';
import { metaParts } from '../modal/format.js';
import { landscapeFor } from '../rows/card.js';
import { displayTitle } from './card.js';
import { isDialogOpen, isPlayerVisible } from './fx/util.js';
import { emitFx } from './prefs.js';

export const POPUP_ID = 'lfx-retro-hover';
const TERMINAL_ID = 'lfx-retro-terminal';
export const INTENT_MS = 600;
export const PREVIEW_MS = 1500;
export const LEAVE_MS = 220;
const POPUP_W = 320;
const GAP = 10;
const EDGE = 12;
const FIELDS = 'Genres,ProductionYear,RunTimeTicks,ChildCount,RemoteTrailers,LocalTrailerCount,UserData,ImageTags,BackdropImageTags,OfficialRating';

const hoverCapable = () => typeof window.matchMedia === 'function' && window.matchMedia('(hover:hover) and (pointer:fine)').matches;
const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Lage des Etiketts (rein rechnerisch): rechts neben der Karte, sonst links; im Viewport geklemmt. */
export function placePopup(r, vw, vh, w, ph) {
  let left = r.right + GAP;
  if (left + w > vw - EDGE) left = r.left - GAP - w;
  left = Math.max(EDGE, Math.min(left, vw - EDGE - w));
  let top = r.top + r.height / 2 - ph / 2;
  top = Math.min(top, vh - EDGE - ph);
  top = Math.max(EDGE, top);
  return { left, top };
}

let active = null; // { card, item, el, preview, timers, g }
let intent = null; // { card, timer }
let leaveTimer = null;
let listeners = [];
let scrollOff = null;
let gen = 0;
let overCard = null; // Karte unter der Maus (für das Nachladen fehlender Item-Daten)
let lastHash = null; // update() schließt nur bei echtem Routenwechsel (Jellyfin feuert viewshow mehrfach, vgl. retro/header.js)

const blocked = () => Boolean(
  document.hidden || isMenuOpen() || isDialogOpen() || isPlayerVisible(null) || document.getElementById(TERMINAL_ID),
);

function loadDetail(id) {
  return cached(`lfx:retro:hover:${id}`, async () => {
    const it = await api.getItem(id, { Fields: FIELDS });
    if (it) putItems([it]);
    return it;
  }, 5 * 60_000);
}

function cardOf(target) {
  if (!target || !target.closest) return null;
  const card = target.closest('.lfx-retro-card[data-lfx-id]');
  if (!card || card.closest(`#${POPUP_ID}, #lfx-retro-title`)) return null;
  return card;
}

function add(target, type, fn, opts) {
  target.addEventListener(type, fn, opts);
  return () => target.removeEventListener(type, fn, opts);
}

function syncScroll() {
  const need = Boolean(active || intent);
  if (need && !scrollOff) scrollOff = add(window, 'scroll', closeNow, { capture: true, passive: true });
  else if (!need && scrollOff) { scrollOff(); scrollOff = null; }
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
  gen += 1;
  const a = active;
  active = null;
  if (a) {
    a.timers.forEach(clearTimeout);
    if (a.preview) a.preview.cancel();
    a.card.classList.remove('is-preview');
  }
  unmountPoint(POPUP_ID);
  syncScroll();
}

function scheduleLeave() {
  clearTimeout(leaveTimer);
  leaveTimer = setTimeout(() => { leaveTimer = null; closeNow(); }, LEAVE_MS);
}

// ---------------------------------------------------------------- Etikett

function metaLine(item) {
  const m = metaParts(item);
  const genres = (Array.isArray(item.Genres) ? item.Genres : []).slice(0, 2).join(' / ');
  return [m.year, m.length, genres].filter(Boolean).join(' · ');
}

function setFavLabel(btn, on) {
  btn.textContent = on ? '✓ Gemerkt' : '+ Merken';
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
}

async function playTarget(item) {
  if (item.Type !== 'Series') return play(item, { resume: Boolean(item.UserData && item.UserData.PlaybackPositionTicks > 0) });
  let ep;
  try {
    ep = await data.loadNextUp(item.Id);
    if (!ep) {
      const seasons = await data.loadSeasons(item.Id);
      const eps = seasons.length ? await data.loadEpisodes(item.Id, seasons[0].Id) : [];
      ep = eps[0] || null;
    }
  } catch { ep = null; }
  if (!ep) { window.location.hash = titleHref(item.Id); return false; }
  return play(ep, { resume: Boolean(ep.UserData && ep.UserData.PlaybackPositionTicks > 0) });
}

function open(card) {
  const stored = getStoredItem(card.dataset.lfxId);
  if (active || blocked()) return;
  if (!stored) {
    // Karten aus dem Startseiten-Cache stehen evtl. (noch) nicht im Item-Speicher: nachladen, dann öffnen,
    // falls die Maus noch auf derselben Karte steht (live gefunden: erster Hover nach dem Laden blieb stumm).
    const g0 = gen;
    loadDetail(card.dataset.lfxId).then((it) => {
      if (it && g0 === gen && overCard === card && card.isConnected && !active) open(card);
    }, () => {});
    return;
  }
  const g = ++gen;
  const a = { card, item: stored, el: null, preview: null, timers: [], g, t0: Date.now() };
  const pic = landscapeFor(stored, 640);
  const media = h('div', { class: 'lfx-retro-hover__media' }, [
    pic ? h('img', { class: 'lfx-retro-hover__img', src: pic.url, alt: '' }) : null,
  ]);
  const meta = h('p', { class: 'lfx-retro-hover__meta' }, metaLine(stored));
  const playBtn = h('button', { type: 'button', class: 'lfx-retro-btn lfx-retro-hover__play' }, '▶ Abspielen');
  const favBtn = h('button', { type: 'button', class: 'lfx-retro-btn lfx-retro-hover__fav' });
  setFavLabel(favBtn, Boolean(stored.UserData && stored.UserData.IsFavorite));
  const label = h('div', { class: 'lfx-retro-hover__label' }, [
    h('h3', { class: 'lfx-retro-hover__title' }, displayTitle(stored)),
    meta,
    h('div', { class: 'lfx-retro-hover__actions' }, [playBtn, favBtn]),
  ]);
  const el = mountPoint(POPUP_ID, { className: 'lfx-retro-hover' });
  el.className = 'lfx-retro-hover';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', displayTitle(stored));
  el.replaceChildren(media, label);
  el.style.width = `${POPUP_W}px`;
  el.style.left = '0px';
  el.style.top = '0px';
  a.el = el;
  const place = () => {
    const pos = placePopup(card.getBoundingClientRect(), window.innerWidth, window.innerHeight, el.offsetWidth || POPUP_W, el.offsetHeight || 220);
    el.style.left = `${Math.round(pos.left)}px`;
    el.style.top = `${Math.round(pos.top)}px`;
  };
  place();
  active = a;
  card.classList.add('is-preview');
  syncScroll();
  emitFx('open');
  const go = () => { if (active === a) el.classList.add('is-in'); };
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(go));
  else go();

  el.addEventListener('mouseenter', () => { clearTimeout(leaveTimer); leaveTimer = null; });
  el.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    const id = a.item.Id;
    closeNow();
    window.location.hash = titleHref(id);
  });
  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const it = a.item;
    emitFx('click');
    closeNow();
    play_(it);
  });
  favBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    favBtn.disabled = true;
    const on = await toggleFavorite(a.item);
    favBtn.disabled = false;
    if (active === a) setFavLabel(favBtn, on);
  });

  loadDetail(stored.Id).then((detail) => {
    if (active !== a || !detail) return;
    a.item = { ...stored, ...detail, UserData: detail.UserData || stored.UserData };
    meta.textContent = metaLine(a.item);
    setFavLabel(favBtn, Boolean(a.item.UserData && a.item.UserData.IsFavorite));
    place();
    if (reducedMotion() || isDataSaver('trailer')) return; // Datensparmodus: keine Trailer-Vorschau (das Etikett bleibt)
    a.preview = createMutedPreview(media, a.item, {
      delay: Math.max(0, PREVIEW_MS - (Date.now() - a.t0)),
      startAt: 4,
      onStart: (v) => { if (active === a) { v.classList.add('is-in'); el.classList.add('is-video'); } },
      onEnd: () => { if (active === a) { a.preview = null; el.classList.remove('is-video'); } },
    });
  }, () => {});
}

function play_(item) {
  return playTarget(item).catch(() => false);
}

// ---------------------------------------------------------------- Ereignisse

function scheduleOpen(card) {
  clearIntent();
  if (blocked()) return;
  const timer = setTimeout(() => {
    if (!intent || intent.card !== card) return;
    intent = null;
    syncScroll();
    if (!card.isConnected) return;
    open(card);
  }, INTENT_MS);
  intent = { card, timer };
  syncScroll();
}

function onOver(e) {
  const t = e.target;
  if (t && t.closest && t.closest(`#${POPUP_ID}`)) {
    clearTimeout(leaveTimer);
    leaveTimer = null;
    return;
  }
  const card = cardOf(t);
  overCard = card;
  if (active && card === active.card) {
    clearTimeout(leaveTimer);
    leaveTimer = null;
    return;
  }
  if (active) {
    if (card) closeNow();
    else { scheduleLeave(); return; }
  }
  if (card) scheduleOpen(card);
  else if (intent) { clearIntent(); syncScroll(); }
}

function onOut(e) {
  if (e.relatedTarget) return; // innerhalb des Dokuments übernimmt mouseover
  overCard = null;
  clearIntent();
  if (active) scheduleLeave();
  else syncScroll();
}

function onKey(e) {
  if (e.key === 'Escape' && (active || intent)) closeNow();
}

function start() {
  if (listeners.length) return;
  listeners = [
    add(document, 'mouseover', onOver),
    add(document, 'mouseout', onOut),
    add(document, 'keydown', onKey),
    add(document, 'visibilitychange', () => { if (document.hidden) closeNow(); }),
    add(window, 'hashchange', closeNow),
    add(window, 'blur', closeNow),
  ];
}

function stop() {
  overCard = null;
  closeNow();
  for (const off of listeners.splice(0)) off();
}

const hover = {
  name: 'retro-hover',
  match: (route) => isTheme('retro') && isModern() && !isTv() && api.isReady() && hoverCapable() && !isPlayerVisible(route),
  mount(route) { lastHash = route && route.hash; start(); },
  update(route) {
    const hash = route && route.hash;
    if (hash === lastHash) return; // gleiche Seite (viewshow): Vorschau/Absicht nicht abbrechen
    lastHash = hash;
    closeNow();
  },
  unmount() { lastHash = null; stop(); },
};

export default hover;
