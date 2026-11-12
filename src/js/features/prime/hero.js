// LENZPRIME: Vollbreiter Hero mit Crossfade, stummem Hintergrund-Trailer, Abspielen/Meine Liste/Info und grüner Rangzeile.
import { getItems, getUserId, imageUrl, logoImage } from '../../core/api.js';
import { cached, clearCache, peekCached, HOME_TTL, homeKey } from '../../core/cache.js';
import { h } from '../../core/dom.js';
import { isMobile, isNarrow } from '../../core/layout.js';
import { putItems } from '../../core/itemstore.js';
import { isChooserOpen } from '../../core/download.js';
import { isMenuOpen, onItemsChanged } from '../../core/itemmenu.js';
import { titleHref } from '../../shared/routes.js';
import { toggleFavorite } from '../../shared/titleactions.js';
import { createMutedPreview } from '../../shared/trailer.js';
import { getNewContentInfo } from '../../shared/newcontent.js';
import { cardBadge, getTrendInfo, heroTrendLine } from '../../shared/trend.js';
import { buildPool, formatRating, formatRuntime, formatSeasons } from '../billboard/format.js';
import * as data from '../modal/data.js';
import { playLabel, playTitle } from './hero-play.js';
import { autoPause } from './preview-gate.js';

export const ROTATE_MS = 20000;
export const TRAILER_DELAY_MS = 3000;
const IMG_FADE_MS = 1000;
const TEXT_FADE_MS = 350;
const FIELDS = 'Overview,Genres,OfficialRating,ProductionYear,RunTimeTicks,ChildCount,DateCreated,RemoteTrailers,LocalTrailerCount';
const FIRST_KEY = 'lfx-prime-hero-first';
const NS = 'http://www.w3.org/2000/svg';

function svg(html, cls) {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', '0 0 24 24');
  el.setAttribute('aria-hidden', 'true');
  if (cls) el.setAttribute('class', cls);
  el.innerHTML = html;
  return el;
}
export const ICON_PLAY = '<path fill="currentColor" d="M6 3.5v17a1 1 0 0 0 1.5.86l14-8.5a1 1 0 0 0 0-1.72l-14-8.5A1 1 0 0 0 6 3.5z"/>';
export const ICON_PLUS = '<path fill="currentColor" d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/>';
export const ICON_CHECK = '<path fill="currentColor" d="M9.2 16.6 4.9 12.3l-1.4 1.4 5.7 5.7L20.5 8.1l-1.4-1.4z"/>';
export const ICON_INFO = '<path fill="currentColor" d="M11 10h2v8h-2zM11 6h2v2h-2z"/>';
export const ICON_MUTED = '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.7-2.7-1.4-1.4-2.7 2.7-2.7-2.7-1.4 1.4 2.7 2.7-2.7 2.7 1.4 1.4 2.7-2.7 2.7 2.7 1.4-1.4z"/>';
export const ICON_SOUND = '<path fill="currentColor" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 8v8a4.5 4.5 0 0 0 2.5-4zM14 3.2v2.1a7 7 0 0 1 0 13.4v2.1a9 9 0 0 0 0-17.6z"/>';
export const ICON_TREND = '<path fill="currentColor" d="M3 17.6 9.5 11l4 4L21 7.5V12h2V4h-8v2h4.6l-6.1 6.1-4-4L1.6 16.2z"/>';
const ICON_CHEV = '<polyline points="8,3 17,12 8,21" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>';

export function svgIcon(html, cls) { return svg(html, cls); }

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function readFirst() {
  try { return sessionStorage.getItem(FIRST_KEY); } catch { return null; }
}
function writeFirst(id) {
  try { sessionStorage.setItem(FIRST_KEY, id); } catch { /* ignorieren */ }
}

let poolWarm = false; // letzter Pool kam aus dem Cache: Bilder ohne async-Dekodierung

/** Hero-Pool der Startseite, 10 min pro Nutzer gecacht (gleiche Titel bei Rückkehr; Rotation von FIRST_KEY nur beim Neuabruf). */
export function fetchHomePool() {
  const key = homeKey(getUserId(), 'prime-hero');
  poolWarm = peekCached(key) !== undefined;
  const p = cached(key, loadHomePool, HOME_TTL);
  p.then((pool) => { if (!pool.length) clearCache(key); }, () => {});
  return p;
}

/** Hero-Pool der Startseite (neueste + zufällige Titel mit Logo und Backdrop). */
async function loadHomePool() {
  const base = { Recursive: true, IncludeItemTypes: 'Movie,Series', ImageTypes: 'Logo,Backdrop', Fields: FIELDS, EnableUserData: true, Limit: 40 };
  const [latest, random] = await Promise.all([
    getItems({ ...base, SortBy: 'DateCreated', SortOrder: 'Descending' }).catch(() => null),
    getItems({ ...base, SortBy: 'Random' }).catch(() => null),
  ]);
  const pool = buildPool(latest && latest.Items, random && random.Items, { avoidFirstId: readFirst(), newCount: 3, randomCount: 7 });
  if (pool[0]) writeFirst(pool[0].Id);
  return pool;
}

/** loadPool: () => Promise<Item[]>. Rückgabe: Cleanup-Funktion. */
export function renderHero(slot, { loadPool }) {
  // Handy (<800 px): 16:9-Rahmen, Meta + Abspielen darunter, kein Autoplay-Trailer (Datenverbrauch). Wechsel baut home.js neu auf.
  const mobile = isMobile() && isNarrow();
  let newInfo = null;
  let logoBox = null;
  let disposed = false;
  let pool = [];
  let index = 0;
  let gen = 0;
  let hovering = false;
  let trailerActive = false;
  let rotateTimer = null;
  let preview = null;
  let gate = null;
  let video = null;
  let trend = null;
  let media = null;
  let content = null;
  let muteBtn = null;
  let dots = null;
  let hero = null;
  const timers = new Set();
  const cleanupFns = [];

  const later = (fn, ms) => {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
    return t;
  };

  const paused = () => hovering || trailerActive || document.hidden
    || document.documentElement.classList.contains('lfx-modal-open') || isMenuOpen() || isChooserOpen();

  function stopTrailer() {
    if (gate) { gate.stop(); gate = null; }
    if (preview) { preview.cancel(); preview = null; }
    video = null;
    trailerActive = false;
    if (muteBtn) muteBtn.hidden = true;
    if (hero) hero.classList.remove('is-trailer');
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

  function setMuteIcon() {
    if (!video) return;
    muteBtn.replaceChildren(svg(video.muted ? ICON_MUTED : ICON_SOUND));
    muteBtn.setAttribute('aria-label', video.muted ? 'Ton einschalten' : 'Ton ausschalten');
  }

  function startTrailer(item, myGen) {
    if (mobile || reducedMotion() || disposed || myGen !== gen) return;
    preview = createMutedPreview(media, item, {
      delay: TRAILER_DELAY_MS,
      startAt: 4,
      onStart: (v) => {
        if (disposed || myGen !== gen) return;
        video = v;
        gate = autoPause(v, { respectHold: true });
        trailerActive = true;
        v.classList.add('is-in');
        hero.classList.add('is-trailer');
        muteBtn.hidden = false;
        setMuteIcon();
      },
      onEnd: () => {
        if (disposed || myGen !== gen) return;
        preview = null;
        stopTrailer();
        scheduleRotate();
      },
    });
  }

  function playButton(item, myGen) {
    const label = h('span', { class: 'lfx-prime-hero__label' });
    const btn = h('button', { type: 'button', class: 'lfx-prime-hero__play' }, [svg(ICON_PLAY), label]);
    const bar = h('span', { class: 'lfx-prime-hero__bar' });
    const progress = h('span', { class: 'lfx-prime-hero__progress', hidden: true }, [bar]);
    const paint = (state) => {
      label.replaceChildren(...[
        h('span', { class: 'lfx-prime-hero__label1' }, state.line1),
        state.line2 ? h('span', { class: 'lfx-prime-hero__label2' }, state.line2) : null,
      ].filter(Boolean));
      btn.classList.toggle('is-two', Boolean(state.line2));
      progress.hidden = !(state.progress > 0);
      bar.style.width = `${Math.round(state.progress)}%`;
    };
    paint(playLabel(item));
    if (item.Type === 'Series') {
      data.loadNextUp(item.Id).then((ep) => {
        if (disposed || myGen !== gen || !btn.isConnected) return;
        paint(playLabel(item, ep));
      }, () => {});
    }
    btn.addEventListener('click', () => { playTitle(item); });
    return h('div', { class: 'lfx-prime-hero__playwrap' }, [btn, progress]);
  }

  function listButton(item) {
    const btn = h('button', { type: 'button', class: 'lfx-prime-hero__round lfx-prime-hero__round--list', title: 'Meine Liste' });
    const paint = () => {
      const on = Boolean(item.UserData && item.UserData.IsFavorite);
      btn.replaceChildren(svg(on ? ICON_CHECK : ICON_PLUS));
      btn.classList.toggle('is-on', on);
      btn.setAttribute('aria-pressed', on ? 'true' : 'false');
      btn.setAttribute('aria-label', on ? 'Aus Meine Liste entfernen' : 'Zu Meine Liste hinzufügen');
    };
    paint();
    btn.addEventListener('click', async () => {
      await toggleFavorite(item);
      if (btn.isConnected) paint();
    });
    return btn;
  }

  function buildContent(item, myGen) {
    const logo = logoImage(item, { maxWidth: 720 });
    const rank = heroTrendLine(item, trend);
    const info = h('a', {
      class: 'lfx-prime-hero__round lfx-prime-hero__round--info',
      href: titleHref(item.Id),
      'aria-label': 'Weitere Informationen',
      title: 'Weitere Informationen',
    }, [svg(ICON_INFO)]);
    const fsk = formatRating(item.OfficialRating);
    return h('div', null, [
      h('div', { class: 'lfx-prime-hero__text' }, [
        logo
          ? h('img', { class: 'lfx-prime-hero__logo', src: logo, alt: item.Name || '', decoding: 'async' })
          : h('h2', { class: 'lfx-prime-hero__title' }, item.Name || ''),
        rank ? h('div', { class: 'lfx-prime-hero__rank' }, [svg(ICON_TREND), h('span', null, rank)]) : null,
        h('div', { class: 'lfx-prime-hero__actions' }, [playButton(item, myGen), listButton(item), info]),
      ]),
      fsk ? h('span', { class: 'lfx-prime-chip lfx-prime-hero__fsk' }, fsk) : null,
    ]);
  }

  /** Handy: Titel-Logo im Bild, darunter Metazeile (Badge, Altersfreigabe, Laufzeit/Jahr/Genre), Rangzeile und Abspielen. */
  function buildMobileParts(item, myGen) {
    const logo = logoImage(item, { maxWidth: 480 });
    const title = logo
      ? h('img', { class: 'lfx-prime-hero__logo', src: logo, alt: item.Name || '', decoding: 'async' })
      : h('h2', { class: 'lfx-prime-hero__title' }, item.Name || '');
    const badge = cardBadge(item, { newInfo, trend });
    const fsk = formatRating(item.OfficialRating);
    const extra = item.Type === 'Series' ? formatSeasons(item.ChildCount) : formatRuntime(item.RunTimeTicks);
    const text = [extra, item.ProductionYear ? String(item.ProductionYear) : '', item.Genres && item.Genres[0]].filter(Boolean).join('  ');
    const rank = heroTrendLine(item, trend);
    const info = h('div', { class: 'lfx-prime-hero__below' }, [
      h('div', { class: 'lfx-prime-hero__meta' }, [
        badge ? h('span', { class: 'lfx-prime-badge lfx-prime-badge--inline' }, badge) : null,
        fsk ? h('span', { class: 'lfx-prime-chip lfx-prime-hero__fsk' }, fsk) : null,
        text ? h('span', { class: 'lfx-prime-hero__metatext' }, text) : null,
      ]),
      rank ? h('div', { class: 'lfx-prime-hero__rank' }, [svg(ICON_TREND), h('span', null, rank)]) : null,
      h('div', { class: 'lfx-prime-hero__actions' }, [playButton(item, myGen)]),
    ]);
    return { title, info };
  }

  function buildImage(item) {
    const bd = imageUrl(item, { type: 'Backdrop', maxWidth: 1920, quality: 90 });
    return h('img', { class: 'lfx-prime-hero__img', src: bd, alt: '', decoding: poolWarm ? null : 'async' });
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
      const b = h('button', { type: 'button', class: 'lfx-prime-hero__dot', 'aria-label': `Empfehlung ${i + 1}: ${it.Name || ''}` });
      b.addEventListener('click', () => show(i));
      return b;
    }));
    dots.hidden = pool.length < 2;
    updateDots();
  }

  function show(i, immediate = false) {
    if (disposed || !pool[i]) return;
    const item = pool[i];
    index = i;
    gen += 1;
    const myGen = gen;
    stopTrailer();
    updateDots();
    const pic = buildImage(item);
    const olds = [...media.querySelectorAll('.lfx-prime-hero__img')];
    media.append(pic);
    if (immediate || !olds.length) {
      olds.forEach((o) => o.remove());
      pic.classList.add('is-in');
    } else {
      requestAnimationFrame(() => pic.classList.add('is-in'));
      later(() => olds.forEach((o) => o.remove()), IMG_FADE_MS + 50);
    }
    const swap = () => {
      if (disposed || myGen !== gen) return;
      if (mobile) {
        const parts = buildMobileParts(item, myGen);
        logoBox.replaceChildren(parts.title);
        content.replaceChildren(parts.info);
      } else {
        content.replaceChildren(...buildContent(item, myGen).childNodes);
      }
      content.classList.remove('is-out');
    };
    if (immediate || !content.firstChild) swap();
    else {
      content.classList.add('is-out');
      later(swap, TEXT_FADE_MS);
    }
    putItems([item]);
    scheduleRotate();
    startTrailer(item, myGen);
  }

  function step(dir) {
    if (pool.length > 1) show((index + dir + pool.length) % pool.length);
  }

  function onChanged({ removed = [] }) {
    if (disposed || !hero || !removed.length || !pool.some((it) => removed.includes(it.Id))) return;
    const cur = pool[index];
    const curGone = cur && removed.includes(cur.Id);
    pool = pool.filter((it) => !removed.includes(it.Id));
    if (!pool.length) {
      gen += 1;
      stopTrailer();
      clearTimeout(rotateTimer);
      slot.hidden = true;
      return;
    }
    index = curGone ? Math.min(index, pool.length - 1) : pool.indexOf(cur);
    fillDots();
    if (curGone) show(index);
  }

  function buildMobile() {
    logoBox = h('div', { class: 'lfx-prime-hero__mlogo' });
    fillDots();
    const frame = h('div', { class: 'lfx-prime-hero__frame' }, [
      media,
      h('div', { class: 'lfx-prime-hero__shade', 'aria-hidden': 'true' }),
      logoBox,
    ]);
    hero = h('div', { class: 'lfx-prime-hero lfx-prime-hero--mobile' }, [frame, content, dots]);
    slot.replaceChildren(hero);
    slot.setAttribute('aria-roledescription', 'Karussell');
    // Wischen wechselt die Empfehlung
    let sx = 0;
    let sy = 0;
    frame.addEventListener('touchstart', (e) => {
      const t = e.touches && e.touches[0];
      if (t) { sx = t.clientX; sy = t.clientY; }
    }, { passive: true });
    frame.addEventListener('touchend', (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - sx;
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(t.clientY - sy) * 1.5) step(dx < 0 ? 1 : -1);
    }, { passive: true });
    const onVis = () => { if (!document.hidden) scheduleRotate(); };
    document.addEventListener('visibilitychange', onVis);
    cleanupFns.push(() => document.removeEventListener('visibilitychange', onVis));
    cleanupFns.push(onItemsChanged(onChanged));
  }

  function build() {
    media = h('div', { class: 'lfx-prime-hero__media' });
    content = h('div', { class: 'lfx-prime-hero__live', 'aria-live': 'off' });
    muteBtn = h('button', { type: 'button', class: 'lfx-prime-hero__mute', hidden: true, 'aria-label': 'Ton einschalten' });
    muteBtn.addEventListener('click', () => {
      if (!video) return;
      video.muted = !video.muted;
      setMuteIcon();
    });
    dots = h('div', { class: 'lfx-prime-hero__dots', role: 'group', 'aria-label': 'Empfehlung wählen' });
    if (mobile) { buildMobile(); return; }
    const prev = h('button', { type: 'button', class: 'lfx-prime-hero__arrow lfx-prime-hero__arrow--prev', 'aria-label': 'Vorherige Empfehlung' });
    const next = h('button', { type: 'button', class: 'lfx-prime-hero__arrow lfx-prime-hero__arrow--next', 'aria-label': 'Nächste Empfehlung' });
    prev.append(svg(ICON_CHEV));
    next.append(svg(ICON_CHEV));
    prev.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));
    fillDots();
    hero = h('div', { class: 'lfx-prime-hero' }, [
      media,
      h('div', { class: 'lfx-prime-hero__shade', 'aria-hidden': 'true' }),
      h('div', { class: 'lfx-prime-hero__shade lfx-prime-hero__shade--corner', 'aria-hidden': 'true' }),
      prev, next, muteBtn, content, dots,
    ]);
    slot.replaceChildren(hero);
    slot.setAttribute('aria-roledescription', 'Karussell');
    const onEnter = () => { hovering = true; };
    const onLeave = () => { hovering = false; scheduleRotate(); };
    const onVis = () => { if (!document.hidden) scheduleRotate(); };
    hero.addEventListener('mouseenter', onEnter);
    hero.addEventListener('mouseleave', onLeave);
    document.addEventListener('visibilitychange', onVis);
    cleanupFns.push(() => document.removeEventListener('visibilitychange', onVis));
    cleanupFns.push(onItemsChanged(onChanged));
  }

  async function init() {
    let items = [];
    try { items = await loadPool(); } catch { /* leer */ }
    try { trend = await getTrendInfo(); } catch { trend = null; }
    if (mobile) { try { newInfo = await getNewContentInfo(); } catch { newInfo = null; } }
    if (disposed) return;
    if (!items || !items.length) { slot.classList.remove('is-loading'); slot.hidden = true; return; }
    pool = items;
    putItems(pool);
    build();
    slot.hidden = false;
    slot.classList.remove('is-loading');
    show(0, true);
  }

  // Platz reservieren (Skeleton per CSS), bis der Pool geladen ist; hidden erst, wenn es keinen Hero gibt
  slot.hidden = false;
  slot.classList.add('is-loading');
  init();

  return () => {
    disposed = true;
    gen += 1;
    clearTimeout(rotateTimer);
    timers.forEach(clearTimeout);
    timers.clear();
    stopTrailer();
    cleanupFns.splice(0).forEach((f) => f());
    slot.replaceChildren();
    slot.classList.remove('is-loading');
    slot.removeAttribute('aria-roledescription');
  };
}
