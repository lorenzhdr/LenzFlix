// LenzFlix: Billboard (Hero) auf der Startseite. render(slot, ctx) -> Cleanup.
import { getItems, getUserId, imageUrl, logoImage, setFavorite } from '../core/api.js';
import { cached, clearCache, peekCached, HOME_TTL, homeKey } from '../core/cache.js';
import { setAmbient, resetAmbient } from '../core/ambient.js';
import { ambientFromPixels } from '../core/color.js';
import { h } from '../core/dom.js';
import { isMobile } from '../core/layout.js';
import { putItems, getStoredItem } from '../core/itemstore.js';
import { ICON_DOWNLOAD, ICON_MORE } from '../core/icons.js';
import { canDownload, startDownload, isChooserOpen } from '../core/download.js';
import { openItemMenu, isMenuOpen, onItemsChanged } from '../core/itemmenu.js';
import { play } from '../core/playback.js';
import { openModal } from './modal.js';
import { loadLocalTrailer, trailerUrl } from '../shared/trailer.js';
import { buildPool, metaParts, genreLine, badgeFor, hasProgress } from './billboard/format.js';

export const ROTATE_MS = 10000;
export const TRAILER_MIN_IMAGE_MS = 3000; // Titelbild steht mindestens so lange, bevor der Trailer eingeblendet wird
export const TRAILER_BUFFER_S = 6; // so viel Vorlauf gilt als „abspielbereit“ (zusätzlich zu canplaythrough)
export const TRAILER_STALL_MS = 1500; // ohne Pufferfortschritt so lange -> play() trotzdem versuchen (iOS puffert ohne play() nicht)
export const TRAILER_WAIT_MAX_MS = 25000; // so lange hält die Rotation für einen ladenden Trailer an
export const ROWS_WAIT_MAX_MS = 8000; // Trailer lädt spätestens dann vor, auch ohne „lfx:rows-ready“
const ROWS_READY_EVENT = 'lfx:rows-ready';
const IMG_FADE_MS = 1000;
const TEXT_FADE_MS = 400;
// Nur, was Billboard/Modal-Hint brauchen (Overview/RemoteTrailers werden nicht angezeigt: das Modal lädt den Titel selbst).
const FIELDS = 'Genres,OfficialRating,ProductionYear,RunTimeTicks,ChildCount,DateCreated,LocalTrailerCount';
const NS = 'http://www.w3.org/2000/svg';

function svg(html, cls) {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('aria-hidden', 'true');
  if (cls) el.setAttribute('class', cls);
  el.innerHTML = html;
  return el;
}
const ICON_PLAY = '<path fill="currentColor" d="M6 3.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 6 3.5z"/>';
const ICON_MUTED = '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/>';
const ICON_SOUND = '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>';
const ICON_PLUS = '<path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>';
const ICON_CHECK = '<path fill="currentColor" d="M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L20.5 8.1l-1.4-1.4z"/>';
const ICON_BADGE = '<defs><linearGradient id="lfx-bb-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5fa2"/><stop offset="1" stop-color="#e50914"/></linearGradient></defs><path fill="url(#lfx-bb-grad)" d="M3 10.5v3a1 1 0 0 0 1 1h1.5l2.5 5h2.2l-1.7-5H11l8 4.5v-13L11 10H4a1 1 0 0 0-1 .5zM21 9.5v5a2.5 2.5 0 0 0 0-5z"/>';

const LAST_FIRST_KEY = 'lfx-bb-first';

function readLastFirst() {
  try { return sessionStorage.getItem(LAST_FIRST_KEY); } catch { return null; }
}

function writeLastFirst(id) {
  try { sessionStorage.setItem(LAST_FIRST_KEY, id); } catch { /* ignorieren */ }
}

const poolKey = () => homeKey(getUserId(), 'billboard');

async function fetchPool() {
  const base = {
    Recursive: true,
    IncludeItemTypes: 'Movie,Series',
    ImageTypes: 'Logo,Backdrop',
    Fields: FIELDS,
    EnableUserData: true,
    EnableImageTypes: 'Logo,Backdrop,Primary',
    ImageTypeLimit: 1,
    Limit: 12,
  };
  const [latest, random] = await Promise.all([
    getItems({ ...base, SortBy: 'DateCreated', SortOrder: 'Descending' }).catch(() => null),
    getItems({ ...base, SortBy: 'Random' }).catch(() => null),
  ]);
  const pool = buildPool(latest && latest.Items, random && random.Items, { avoidFirstId: readLastFirst() });
  if (pool[0]) writeLastFirst(pool[0].Id);
  return pool;
}

/** Pool 10 min pro Nutzer: innerhalb der TTL derselbe Pool/erste Titel; die Rotation (LAST_FIRST_KEY) greift nur beim Neuabruf. */
function loadPool() {
  const key = poolKey();
  const p = cached(key, fetchPool, HOME_TTL);
  p.then((pool) => { if (!pool.length) clearCache(key); }, () => {});
  return p;
}

function reducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Liest eine 64px-Version des Backdrops und setzt die Ambient-Farbe. Fehler werden still ignoriert. */
function loadAmbient(item, isCurrent) {
  const url = imageUrl(item, { type: 'Backdrop', maxWidth: 64, quality: 60 });
  if (!url || typeof Image === 'undefined') return;
  const img = new Image();
  img.onload = () => {
    if (!isCurrent()) return;
    try {
      const w = img.naturalWidth || 64;
      const hh = img.naturalHeight || 36;
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = hh;
      const ctx2d = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx2d) return;
      ctx2d.drawImage(img, 0, 0, w, hh);
      const [r, g, b] = ambientFromPixels(ctx2d.getImageData(0, 0, w, hh).data);
      setAmbient(r, g, b);
    } catch { /* ignorieren */ }
  };
  img.src = url;
}

export function render(slot) {
  let disposed = false;
  let pool = [];
  let index = 0;
  let gen = 0; // Generation: macht asynchrone Antworten alter Slides ungültig
  let hovering = false;
  let trailerActive = false;
  let rotateTimer = null;
  let slide = null; // aktuelle Folie: {item, gen, t0, imgAt, started, ready, failed, revealTimer}
  let rowsReady = false;
  let warm = false; // Pool kam aus dem Cache (Rückkehr zur Startseite < 10 min)
  const timers = new Set();
  let video = null;
  let card = null;
  let media = null;
  let content = null;
  let muteBtn = null;
  let dots = null;
  const cleanupFns = [];

  // Signal fürs Vorladen der Zeilen (rows/prefetch.js): „wait“ = Trailer steht noch aus, „on“ = läuft, leer = keiner/aufgegeben.
  const setTr = (v) => { if (v) slot.dataset.lfxTr = v; else delete slot.dataset.lfxTr; };

  const later = (fn, ms) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
    return t;
  };

  // Ein ladender Trailer hält die Rotation an (höchstens TRAILER_WAIT_MAX_MS), damit das Bild stehen bleibt.
  const trailerPending = () =>
    Boolean(slide && slide.item.LocalTrailerCount > 0 && !slide.failed && !trailerActive
      && Date.now() - slide.t0 < TRAILER_WAIT_MAX_MS);

  const paused = () =>
    hovering || trailerActive || trailerPending() || document.hidden || document.documentElement.classList.contains('lfx-modal-open')
    || isMenuOpen() || isChooserOpen();

  function stopTrailer() {
    if (slide) clearTimeout(slide.revealTimer);
    trailerActive = false;
    if (video) {
      const v = video;
      video = null;
      try {
        v.pause();
        v.removeAttribute('src');
        if (v.load) v.load();
      } catch { /* jsdom: nicht implementiert */ }
      v.remove();
    }
    if (muteBtn) muteBtn.hidden = true;
    if (card) card.classList.remove('is-trailer');
  }

  function scheduleRotate() {
    clearTimeout(rotateTimer);
    rotateTimer = null;
    if (disposed || pool.length < 2 || reducedMotion()) return;
    rotateTimer = setTimeout(() => {
      rotateTimer = null;
      if (paused()) scheduleRotate();
      else show((index + 1) % pool.length);
    }, ROTATE_MS);
  }

  function buildListButton(item) {
    const btn = h('button', { type: 'button', class: 'lfx-bb__btn lfx-bb__btn--list', 'aria-label': 'Meine Liste' });
    const paint = () => {
      const on = Boolean(item.UserData && item.UserData.IsFavorite);
      btn.replaceChildren(svg(on ? ICON_CHECK : ICON_PLUS), h('span', null, 'Meine Liste'));
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    };
    paint();
    btn.addEventListener('click', async () => {
      const prev = Boolean(item.UserData && item.UserData.IsFavorite);
      item.UserData = { ...(item.UserData || {}), IsFavorite: !prev };
      paint();
      try {
        await setFavorite(item.Id, !prev);
        clearCache('home:');
      } catch {
        item.UserData = { ...(item.UserData || {}), IsFavorite: prev };
        paint();
      }
    });
    return btn;
  }

  /** Runde Aktions-Buttons: Download (erst nach canDownload sichtbar) und „Mehr“ (⋮). */
  function buildRoundButtons(item) {
    const folder = item.Type === 'Series' || item.Type === 'Season';
    const dlLabel = folder ? 'Episoden herunterladen' : 'Herunterladen';
    const dl = h('button', {
      type: 'button', class: 'lfx-bb__btn lfx-bb__btn--dl', 'aria-label': dlLabel, title: dlLabel, hidden: true,
    });
    dl.innerHTML = ICON_DOWNLOAD;
    dl.addEventListener('click', (e) => {
      e.stopPropagation();
      startDownload(item, dl);
    });
    // Race: Der Button gilt nur, solange er noch im Slot hängt (Item gewechselt/neu gerendert -> verworfen).
    Promise.resolve(canDownload(item)).then((ok) => {
      if (ok && !disposed && slot.contains(dl)) dl.hidden = false;
    }, () => {});
    const menu = h('button', {
      type: 'button', class: 'lfx-bb__btn lfx-bb__btn--menu', 'aria-label': 'Mehr', title: 'Mehr', 'aria-haspopup': 'menu',
    });
    menu.innerHTML = ICON_MORE;
    menu.addEventListener('click', (e) => {
      e.stopPropagation();
      openItemMenu(item, menu);
    });
    return [dl, menu];
  }

  function buildContent(item) {
    const logo = logoImage(item, { maxWidth: 720 });
    const meta = h('div', { class: 'lfx-bb__meta' });
    metaParts(item).forEach((p, i) => {
      if (i) meta.append(h('span', { class: 'lfx-bb__dot', 'aria-hidden': 'true' }, '•'));
      meta.append(h('span', { class: p.rating ? 'lfx-bb__rating' : null }, p.text));
    });
    const playBtn = h('button', { type: 'button', class: 'lfx-bb__btn lfx-bb__btn--play' }, [svg(ICON_PLAY), h('span', null, 'Abspielen')]);
    playBtn.addEventListener('click', () => play(item, { resume: hasProgress(item) }));
    const infoBtn = h('button', { type: 'button', class: 'lfx-bb__btn lfx-bb__btn--info' }, [h('span', null, 'Weitere Infos')]);
    infoBtn.addEventListener('click', () => openModal(item));
    const listBtn = buildListButton(item);
    const genres = genreLine(item);
    const badgeText = badgeFor(item);
    return h('div', null, [
      h('div', { class: 'lfx-bb__text' }, [
        logo
          ? h('img', { class: 'lfx-bb__logo', src: logo, alt: item.Name || '', decoding: warm ? null : 'async' })
          : h('h2', { class: 'lfx-bb__title' }, item.Name || ''),
        meta,
        genres ? h('div', { class: 'lfx-bb__genres' }, genres) : null,
        item.Overview ? h('p', { class: 'lfx-bb__desc' }, item.Overview) : null,
      ]),
      h('div', { class: 'lfx-bb__buttons' }, [playBtn, infoBtn, listBtn, ...buildRoundButtons(item)]),
      badgeText ? h('span', { class: 'lfx-bb__badge' }, [svg(ICON_BADGE), badgeText]) : null,
    ]);
  }

  function buildImage(item, first = false) {
    const dec = warm ? null : 'async'; // Cache-Pfad: Bild sofort dekodieren, nichts blitzt leer auf
    const bd = imageUrl(item, { type: 'Backdrop', maxWidth: 1600, quality: 80 });
    const poster = imageUrl(item, { type: 'Primary', maxWidth: 720, quality: 80 });
    return h('picture', { class: 'lfx-bb__pic' }, [
      poster ? h('source', { media: '(max-width: 799px)', srcset: poster }) : null,
      // Erstes Bild: sofort und mit hoher Priorität laden (ohne Überblendung, siehe show()).
      h('img', { class: 'lfx-bb__img', src: bd, alt: '', decoding: dec, fetchpriority: first ? 'high' : null }),
    ]);
  }

  function updateDots() {
    if (!dots) return;
    [...dots.children].forEach((b, i) => {
      b.classList.toggle('is-active', i === index);
      b.setAttribute('aria-current', i === index ? 'true' : 'false');
    });
  }

  function fillDots() {
    dots.replaceChildren(...pool.map((it, i) => {
      const b = h('button', { type: 'button', class: 'lfx-bb__dotbtn', 'aria-label': `Empfehlung ${i + 1}: ${it.Name || ''}` });
      b.addEventListener('click', () => show(i));
      return b;
    }));
    dots.hidden = pool.length < 2;
    updateDots();
  }

  /** Bibliothek hat sich geändert (Löschen/Bearbeiten über das Titelmenü). */
  function onChanged({ removed = [], updated = [] }) {
    if (disposed || !card) return;
    const cur = pool[index];
    if (removed.length && pool.some((it) => removed.includes(it.Id))) {
      const curGone = cur && removed.includes(cur.Id);
      pool = pool.filter((it) => !removed.includes(it.Id));
      if (!pool.length) {
        gen += 1;
        stopTrailer();
        clearTimeout(rotateTimer);
        timers.forEach(clearTimeout);
        timers.clear();
        content.replaceChildren();
        slot.hidden = true;
        resetAmbient();
        return;
      }
      index = curGone ? Math.min(index, pool.length - 1) : pool.indexOf(cur);
      fillDots();
      if (curGone) show(index);
      return;
    }
    if (cur && updated.includes(cur.Id)) {
      const fresh = getStoredItem(cur.Id);
      if (!fresh) return;
      const merged = { ...cur, ...fresh };
      pool[index] = merged;
      if (!content.classList.contains('is-out')) content.replaceChildren(...buildContent(merged).childNodes);
    }
  }

  function setMuteIcon() {
    if (!video) return;
    muteBtn.replaceChildren(svg(video.muted ? ICON_MUTED : ICON_SOUND));
    muteBtn.setAttribute('aria-label', video.muted ? 'Ton einschalten' : 'Ton ausschalten');
  }

  /** Vorladen starten: erst wenn das Titelbild geladen ist UND die ersten Zeilen gefüllt sind. */
  function tryPreload() {
    const sl = slide;
    if (!sl || disposed || sl.gen !== gen || sl.started || sl.failed) return;
    if (!(sl.item.LocalTrailerCount > 0) || !sl.imgAt || !rowsReady) return;
    sl.started = true;
    startTrailer(sl);
  }

  /** Trailer unsichtbar und stumm vorladen; sichtbar erst, wenn das Bild >= 3 s stand UND er abspielbereit ist. */
  async function startTrailer(sl) {
    try {
      const t = await loadLocalTrailer(sl.item);
      if (sl.gen !== gen || disposed) return;
      if (!t) { sl.failed = true; setTr(''); return; }
      const v = h('video', { class: 'lfx-bb__video', playsinline: true, preload: 'auto', 'aria-hidden': 'true' });
      v.muted = true;
      v.setAttribute('muted', '');
      v.addEventListener('playing', () => {
        if (sl.gen !== gen || video !== v) return;
        trailerActive = true;
        setTr('on');
        v.classList.add('is-in');
        card.classList.add('is-trailer');
        muteBtn.hidden = false;
        setMuteIcon();
      });
      const end = () => {
        if (video !== v) return;
        sl.failed = true;
        setTr('');
        stopTrailer();
        scheduleRotate();
      };
      const buffered = () => {
        try { return v.buffered.length ? v.buffered.end(v.buffered.length - 1) : 0; } catch { return 0; }
      };
      const enough = () => v.readyState >= 4
        || buffered() - (v.currentTime || 0) >= TRAILER_BUFFER_S
        || (Number.isFinite(v.duration) && v.duration > 0 && buffered() >= v.duration - 0.3);
      const reveal = () => {
        if (video !== v || sl.gen !== gen || disposed) return;
        const p = v.play && v.play();
        if (p && p.catch) p.catch(end);
      };
      const check = (force = false) => {
        if (sl.ready || video !== v || sl.gen !== gen || !(force === true || enough())) return;
        sl.ready = true;
        const wait = sl.imgAt + TRAILER_MIN_IMAGE_MS - Date.now();
        if (wait > 0) sl.revealTimer = later(reveal, wait);
        else reveal();
      };
      // Rückfall (iOS-Safari puffert ohne play() nicht): nach der Mindestzeit und TRAILER_STALL_MS ohne
      // Fortschritt trotzdem play() (stumm, playsinline); eingeblendet wird erst bei „playing“, bei Ablehnung gibt end() auf.
      let lastProgress = Date.now();
      const touch = () => { lastProgress = Date.now(); };
      const stallCheck = () => {
        if (sl.ready || video !== v || sl.gen !== gen || disposed) return;
        if (v.readyState < 3 && Date.now() - lastProgress >= TRAILER_STALL_MS) {
          sl.ready = true;
          reveal();
          return;
        }
        later(stallCheck, 500);
      };
      v.addEventListener('ended', end);
      v.addEventListener('error', end);
      v.addEventListener('canplaythrough', () => { touch(); check(true); });
      for (const ev of ['canplay', 'loadeddata', 'loadedmetadata', 'progress', 'durationchange']) {
        v.addEventListener(ev, () => { touch(); check(); });
      }
      later(stallCheck, Math.max(0, sl.imgAt + TRAILER_MIN_IMAGE_MS - Date.now()));
      v.src = trailerUrl(t.Id);
      video = v;
      media.append(v);
      check();
    } catch { sl.failed = true; setTr(''); }
  }

  function show(i, immediate = false) {
    if (disposed || !pool[i]) return;
    const item = pool[i];
    index = i;
    gen += 1;
    const myGen = gen;
    stopTrailer();
    updateDots();
    // Bild: neues Bild blendet über dem alten ein (1 s), danach wird das alte entfernt.
    const olds = [...media.querySelectorAll('.lfx-bb__pic')];
    const firstPic = !olds.length;
    const pic = buildImage(item, firstPic);
    media.append(pic);
    if (immediate || !olds.length) {
      olds.forEach((o) => o.remove());
      pic.classList.add('is-in');
    } else {
      requestAnimationFrame(() => pic.classList.add('is-in'));
      later(() => olds.forEach((o) => o.remove()), IMG_FADE_MS + 50);
    }
    // Text: ausblenden (400 ms), tauschen, einblenden
    const swap = () => {
      if (disposed || myGen !== gen) return;
      content.replaceChildren(...buildContent(item).childNodes);
      content.classList.remove('is-out');
    };
    if (immediate || !content.firstChild) swap();
    else {
      content.classList.add('is-out');
      later(swap, TEXT_FADE_MS);
    }
    putItems([item]);
    loadAmbient(item, () => myGen === gen && !disposed);
    scheduleRotate();
    // Trailer: erst das Titelbild; Vorladen startet, sobald Bild geladen + Zeilen gefüllt (tryPreload).
    const sl = { item, gen: myGen, t0: Date.now(), imgAt: 0, started: false, ready: false, failed: false, revealTimer: null };
    slide = sl;
    setTr(item.LocalTrailerCount > 0 ? 'wait' : '');
    const img = pic.querySelector('.lfx-bb__img');
    const onLoaded = () => {
      if (disposed || sl.gen !== gen || sl.imgAt) return;
      sl.imgAt = Date.now();
      tryPreload();
    };
    if (img.complete && img.naturalWidth > 0) onLoaded();
    else {
      img.addEventListener('load', onLoaded, { once: true });
      img.addEventListener('error', onLoaded, { once: true });
    }
  }

  function build() {
    media = h('div', { class: 'lfx-bb__media' });
    content = h('div', { class: 'lfx-bb__live', 'aria-live': 'off' });
    muteBtn = h('button', { type: 'button', class: 'lfx-bb__mute', hidden: true, 'aria-label': 'Ton einschalten' });
    muteBtn.addEventListener('click', () => {
      if (!video) return;
      video.muted = !video.muted;
      setMuteIcon();
    });
    dots = h('div', { class: 'lfx-bb__dots', role: 'group', 'aria-label': 'Empfehlung wählen' });
    fillDots();
    card = h('div', { class: 'lfx-bb' }, [
      media,
      h('div', { class: 'lfx-bb__shade', 'aria-hidden': 'true' }),
      h('span', { class: 'lfx-bb__mark', 'aria-hidden': 'true' }),
      muteBtn,
      content,
      dots,
    ]);
    slot.replaceChildren(card);
    slot.setAttribute('aria-roledescription', 'Karussell');
    const onEnter = () => { hovering = true; };
    const onLeave = () => { hovering = false; scheduleRotate(); };
    const onVis = () => { if (!document.hidden) scheduleRotate(); };
    // Mobil: Tipp auf das Poster oeffnet das Modal (Buttons/Punkte/Mute ausgenommen).
    const onCardClick = (e) => {
      if (!isMobile() || (e.target.closest && e.target.closest('button, a'))) return;
      if (pool[index]) openModal(pool[index]);
    };
    card.addEventListener('click', onCardClick);
    card.addEventListener('mouseenter', onEnter);
    card.addEventListener('mouseleave', onLeave);
    document.addEventListener('visibilitychange', onVis);
    cleanupFns.push(() => document.removeEventListener('visibilitychange', onVis));
    cleanupFns.push(onItemsChanged(onChanged));
  }

  async function init() {
    let items = peekCached(poolKey()) || [];
    warm = items.length > 0;
    if (!warm) {
      try {
        items = await loadPool();
      } catch { /* leer */ }
    }
    if (disposed) return;
    if (!items.length) {
      slot.replaceChildren();
      slot.hidden = true;
      resetAmbient();
      return;
    }
    pool = items.slice(); // Cache-Array nie mutieren (onChanged)
    putItems(pool);
    build();
    slot.hidden = false;
    show(0, true);
  }

  // Skelett in Billboard-Größe, bis der Pool da ist (verhindert Layout-Sprung der Zeilen darunter).
  slot.replaceChildren(h('div', { class: 'lfx-bb lfx-bb--skel', 'aria-hidden': 'true' }));
  slot.hidden = false;
  const onRowsReady = () => { rowsReady = true; tryPreload(); };
  document.addEventListener(ROWS_READY_EVENT, onRowsReady);
  cleanupFns.push(() => document.removeEventListener(ROWS_READY_EVENT, onRowsReady));
  later(onRowsReady, ROWS_WAIT_MAX_MS);
  init();

  return () => {
    disposed = true;
    gen += 1;
    clearTimeout(rotateTimer);
    timers.forEach(clearTimeout);
    timers.clear();
    stopTrailer();
    setTr('');
    cleanupFns.forEach((f) => f());
    slot.replaceChildren();
    slot.removeAttribute('aria-roledescription');
    resetAmbient();
  };
}
