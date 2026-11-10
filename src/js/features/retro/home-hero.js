// LENZ//84 Hero: Vollbreite Bühne (Backdrop in Bernstein, Retro-Sonne, Neon-Gitter) mit Terminal-Fenster.
// Titel tippt sich als „TITEL.MOV“ ein, Rotation mit „Kanalwechsel“, Pause bei Hover/Fokus/versteckt/unsichtbar. Gehört Worker P1.
import { getItems, imageUrl } from '../../core/api.js';
import { h } from '../../core/dom.js';
import { putItems } from '../../core/itemstore.js';
import { titleHref } from '../../shared/routes.js';
import { buildPool, formatRating, formatSeasons } from '../billboard/format.js';
import { playLabel, playTitle } from '../prime/hero-play.js';
import { emitFx } from './prefs.js';
import { isPhone } from './header-nav.js';
import { svgIcon } from './header-ui.js';

export const ROTATE_MS = 9000;
export const TYPE_MS = 46;
export const CHANNEL_SWAP_MS = 220; // Moment des Inhaltswechsels im Kanalwechsel
export const CHANNEL_END_MS = 520;
const FIELDS = 'Overview,Genres,OfficialRating,ProductionYear,RunTimeTicks,ChildCount,DateCreated';
const FIRST_KEY = 'lfx-retro-hero-first';
const MAX_NAME = 22;

const reducedMotion = () => typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Titel-Text setzen: Umbruch nur nach „_“ (<wbr>), letztes Segment samt Endung bleibt zusammen (nowrap). */
export function setTitleText(el, text) {
  el.textContent = '';
  const cut = text.lastIndexOf('_') + 1;
  const head = text.slice(0, cut);
  const tail = text.slice(cut);
  head.split(/(?<=_)/).filter(Boolean).forEach((seg) => {
    el.append(document.createTextNode(seg), document.createElement('wbr'));
  });
  if (tail) el.append(h('span', { class: 'lfx-retro-hero__seg' }, tail));
}

/** Größenstufe nach Länge des Dateinamens (0 = normal). */
export function titleSize(text) {
  const n = String(text || '').length;
  return n > 24 ? 3 : n > 20 ? 2 : n > 16 ? 1 : 0;
}

const pad2 = (n) => String(n).padStart(2, '0');

/** „Neon Läufer: Teil 2“ -> „NEON_LAEUFER_TEIL_2“ (max. 22 Zeichen, nur A–Z/0–9/_). */
export function dosName(name) {
  const s = String(name || '')
    .replace(/ä/gi, 'AE').replace(/ö/gi, 'OE').replace(/ü/gi, 'UE').replace(/ß/g, 'SS')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return (s || 'UNBEKANNT').slice(0, MAX_NAME).replace(/_+$/, '');
}

/** „TITEL.MOV“ (Film) bzw. „TITEL.SER“ (Serie). */
export function fileName(item) {
  return `${dosName(item && item.Name)}.${item && item.Type === 'Series' ? 'SER' : 'MOV'}`;
}

/** Pfadzeile des Terminal-Fensters. */
export function pathLine(item) {
  return `C:\\LENZ84\\${item && item.Type === 'Series' ? 'SERIEN' : 'FILME'}>`;
}

/** Laufzeit kurz: 1H57 / 45MIN; leer ohne Laufzeit. */
export function runtimeShort(ticks) {
  const total = Math.round((Number(ticks) || 0) / 600000000);
  if (total <= 0) return '';
  const hrs = Math.floor(total / 60);
  const min = total % 60;
  return hrs ? `${hrs}H${pad2(min)}` : `${min}MIN`;
}

/** Metazeile „1982 · FSK 16 · 1H57 · SCI-FI“ (Serien: Staffeln statt Laufzeit). */
export function metaLine(item) {
  if (!item) return '';
  const rating = formatRating(item.OfficialRating);
  const extra = item.Type === 'Series' ? formatSeasons(item.ChildCount) : runtimeShort(item.RunTimeTicks);
  const genre = Array.isArray(item.Genres) && item.Genres[0] ? item.Genres[0] : '';
  return [item.ProductionYear ? String(item.ProductionYear) : '', rating ? `FSK ${rating}` : '', extra, genre]
    .filter(Boolean).join(' · ').toUpperCase();
}

function readFirst() {
  try { return sessionStorage.getItem(FIRST_KEY); } catch { return null; }
}
function writeFirst(id) {
  try { sessionStorage.setItem(FIRST_KEY, id); } catch { /* ignorieren */ }
}

/** Hero-Pool der Startseite (neueste + zufällige Titel mit Backdrop). */
export async function fetchHomePool() {
  const base = { Recursive: true, IncludeItemTypes: 'Movie,Series', ImageTypes: 'Logo,Backdrop', Fields: FIELDS, EnableUserData: true, Limit: 40 };
  const [latest, random] = await Promise.all([
    getItems({ ...base, SortBy: 'DateCreated', SortOrder: 'Descending' }).catch(() => null),
    getItems({ ...base, SortBy: 'Random' }).catch(() => null),
  ]);
  const pool = buildPool(latest && latest.Items, random && random.Items, { avoidFirstId: readFirst(), newCount: 2, randomCount: 4 });
  if (pool[0]) writeFirst(pool[0].Id);
  return pool;
}

/** loadPool: () => Promise<Item[]>. Rückgabe: Cleanup-Funktion. */
export function renderHero(slot, { loadPool }) {
  const phone = isPhone();
  let disposed = false;
  let pool = [];
  let index = 0;
  let target = 0; // zuletzt angeforderter Kanal (index folgt erst nach dem Wechsel)
  let gen = 0;
  let hovering = false;
  let inView = true;
  let rotateTimer = 0;
  let hero = null;
  let bd = null;
  let win = null;
  const refs = {};
  const timers = new Set();
  const cleanups = [];

  const later = (fn, ms) => {
    const t = setTimeout(() => { timers.delete(t); fn(); }, ms);
    timers.add(t);
    return t;
  };
  const clearLater = (t) => { clearTimeout(t); timers.delete(t); };
  const paused = () => hovering || !inView || document.hidden || document.documentElement.classList.contains('lfx-modal-open');

  function scheduleRotate() {
    if (rotateTimer) clearLater(rotateTimer);
    rotateTimer = 0;
    if (disposed || pool.length < 2 || reducedMotion()) return;
    rotateTimer = later(() => {
      rotateTimer = 0;
      if (paused()) scheduleRotate();
      else show((target + 1) % pool.length);
    }, ROTATE_MS);
  }

  /** Zeichen für Zeichen tippen (reduced-motion: sofort); emitFx('type') je ~3 Zeichen. */
  function typeText(text, myGen) {
    const el = refs.title;
    el.textContent = '';
    refs.heading.dataset.size = String(titleSize(text));
    if (reducedMotion()) { setTitleText(el, text); return; }
    let n = 0;
    const step = () => {
      if (disposed || myGen !== gen) return;
      n += 1;
      setTitleText(el, text.slice(0, n));
      if (n % 3 === 1) emitFx('type');
      if (n < text.length) later(step, TYPE_MS);
    };
    later(step, TYPE_MS * 3);
  }

  function updateCounter() {
    refs.count.textContent = `${pad2(index + 1)}/${pad2(pool.length)}`;
    refs.nav.hidden = pool.length < 2;
  }

  /** Inhalt (Backdrop + Fenster) auf Titel i setzen und Tippen starten. */
  function apply(i) {
    if (disposed || !pool[i]) return;
    const item = pool[i];
    index = i;
    gen += 1;
    const myGen = gen;
    const src = imageUrl(item, { type: 'Backdrop', maxWidth: phone ? 1280 : 1920, quality: 80 });
    bd.replaceChildren(...(src ? [h('img', { class: 'lfx-retro-hero__img', src, alt: '', decoding: 'async' })] : []));
    refs.path.textContent = pathLine(item);
    refs.heading.setAttribute('aria-label', item.Name || '');
    refs.meta.textContent = metaLine(item);
    refs.desc.textContent = item.Overview || '';
    refs.desc.hidden = !item.Overview;
    refs.playLabel.textContent = playLabel(item).line1;
    refs.info.setAttribute('href', titleHref(item.Id));
    refs.info.setAttribute('aria-label', `Info: ${item.Name || ''}`);
    refs.play.onclick = () => { playTitle(item); };
    updateCounter();
    putItems([item]);
    typeText(fileName(item), myGen);
    scheduleRotate();
  }

  function show(i, { immediate = false } = {}) {
    if (disposed || !pool[i]) return;
    target = i;
    if (immediate || reducedMotion() || !hero) { apply(i); return; }
    gen += 1; // laufendes Tippen/Wechsel des alten Titels abbrechen
    const myGen = gen;
    emitFx('nav');
    hero.classList.add('is-changing');
    later(() => { if (!disposed && myGen === gen) apply(i); }, CHANNEL_SWAP_MS);
    later(() => { hero.classList.remove('is-changing'); }, CHANNEL_END_MS);
  }

  const step = (dir) => { if (pool.length > 1) show((target + dir + pool.length) % pool.length); };

  function arrow(dir, label) {
    const b = h('button', { type: 'button', class: `lfx-retro-hero__arrow lfx-retro-hero__arrow--${dir}`, 'aria-label': label }, [svgIcon(dir)]);
    b.addEventListener('click', () => step(dir === 'next' ? 1 : -1));
    return b;
  }

  function build() {
    refs.path = h('span', { class: 'lfx-retro-hero__path' });
    refs.title = h('span', { class: 'lfx-retro-hero__typed lfx-retro-caret', 'aria-hidden': 'true' });
    refs.heading = h('h2', { class: 'lfx-retro-hero__title' }, [refs.title]);
    refs.meta = h('p', { class: 'lfx-retro-hero__meta' });
    refs.desc = h('p', { class: 'lfx-retro-hero__desc' });
    refs.playLabel = h('span', null, 'Abspielen');
    refs.play = h('button', { type: 'button', class: 'lfx-retro-btn lfx-retro-hero__play' }, [svgIcon('play'), refs.playLabel]);
    refs.info = h('a', { class: 'lfx-retro-btn lfx-retro-hero__info', href: '#/home' }, [svgIcon('info'), h('span', null, 'Info')]);
    refs.count = h('span', { class: 'lfx-retro-hero__count', 'aria-live': 'off' });
    refs.nav = h('div', { class: 'lfx-retro-hero__channel', role: 'group', 'aria-label': 'Empfehlung wählen' }, [
      arrow('prev', 'Vorherige Empfehlung'), refs.count, arrow('next', 'Nächste Empfehlung'),
    ]);
    win = h('div', { class: 'lfx-retro-frame lfx-retro-hero__win' }, [
      h('div', { class: 'lfx-retro-hero__bar', 'aria-hidden': 'true' }, [refs.path]),
      h('div', { class: 'lfx-retro-hero__body' }, [
        refs.heading, refs.meta, refs.desc,
        h('div', { class: 'lfx-retro-hero__actions' }, [refs.play, refs.info]),
        refs.nav,
      ]),
    ]);
    bd = h('div', { class: 'lfx-retro-hero__bd' });
    const stage = h('div', { class: 'lfx-retro-hero__stage', 'aria-hidden': 'true' }, [
      h('div', { class: 'lfx-retro-hero__stars' }),
      bd,
      h('div', { class: 'lfx-retro-hero__sun' }, [h('div', { class: 'lfx-retro-hero__cuts' })]),
      h('div', { class: 'lfx-retro-hero__horizon' }),
      h('div', { class: 'lfx-retro-hero__grid' }, [h('div', { class: 'lfx-retro-hero__plane' })]),
      h('div', { class: 'lfx-retro-hero__fog' }),
    ]);
    hero = h('div', { class: 'lfx-retro-hero' }, [
      stage,
      h('div', { class: 'lfx-retro-hero__noise', 'aria-hidden': 'true' }),
      win,
    ]);
    slot.replaceChildren(hero);
    slot.setAttribute('aria-roledescription', 'Karussell');

    const onEnter = () => { hovering = true; };
    const onLeave = () => { hovering = false; scheduleRotate(); };
    hero.addEventListener('mouseenter', onEnter);
    hero.addEventListener('mouseleave', onLeave);
    hero.addEventListener('focusin', onEnter);
    hero.addEventListener('focusout', onLeave);
    const onVis = () => { if (!document.hidden) scheduleRotate(); };
    document.addEventListener('visibilitychange', onVis);
    cleanups.push(() => document.removeEventListener('visibilitychange', onVis));

    // Wischen (Handy) wechselt den Kanal
    let sx = 0;
    let sy = 0;
    hero.addEventListener('touchstart', (e) => {
      const t = e.touches && e.touches[0];
      if (t) { sx = t.clientX; sy = t.clientY; }
    }, { passive: true });
    hero.addEventListener('touchend', (e) => {
      const t = e.changedTouches && e.changedTouches[0];
      if (!t) return;
      const dx = t.clientX - sx;
      if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(t.clientY - sy) * 1.5) step(dx < 0 ? 1 : -1);
    }, { passive: true });

    if (typeof IntersectionObserver === 'function') {
      const io = new IntersectionObserver((entries) => {
        for (const en of entries) inView = en.isIntersecting;
        hero.classList.toggle('is-offscreen', !inView); // Animationen pausieren, solange der Hero nicht sichtbar ist
        if (inView) scheduleRotate();
      }, { threshold: 0.2 });
      io.observe(hero);
      cleanups.push(() => io.disconnect());
    }
  }

  async function init() {
    let items = [];
    try { items = await loadPool(); } catch { /* leer */ }
    if (disposed) return;
    if (!items || !items.length) { slot.classList.remove('is-loading'); slot.hidden = true; return; }
    pool = items;
    putItems(pool);
    build();
    slot.hidden = false;
    slot.classList.remove('is-loading');
    apply(0);
  }

  // Platz reservieren, bis der Pool geladen ist
  slot.hidden = false;
  slot.classList.add('is-loading');
  init();

  return () => {
    disposed = true;
    gen += 1;
    timers.forEach(clearTimeout);
    timers.clear();
    rotateTimer = 0;
    cleanups.splice(0).forEach((f) => f());
    slot.replaceChildren();
    slot.classList.remove('is-loading');
    slot.removeAttribute('aria-roledescription');
  };
}
