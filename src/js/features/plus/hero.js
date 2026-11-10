// LENZ+: Hero-Karussell mit Seitenvorschau (Slide, ~7 s, Punkte, Randpfeile). Ganze Folie ist Link zur Titelseite.
import { h } from '../../core/dom.js';
import * as api from '../../core/api.js';
import { titleHref } from '../../shared/routes.js';
import { plusBadge } from '../../shared/newcontent.js';
import { BASE_PARAMS } from '../rows/logic.js';
import { buildPool } from '../billboard/format.js';
import { yearGenres, ratingBox } from './card.js';

export const HERO_INTERVAL = 7000;
const HERO_FIELDS = `${BASE_PARAMS.Fields},Taglines`;
const asItems = (res) => (Array.isArray(res) ? res : (res && Array.isArray(res.Items) ? res.Items : []));
const CHEVRON = '<svg viewBox="0 0 14 27" aria-hidden="true" focusable="false"><polyline points="1.5,1.5 12.5,13.5 1.5,25.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Tagline oder gekürzte Beschreibung (max. ~150 Zeichen, an Wortgrenze). */
export function taglineFor(item) {
  const t = Array.isArray(item.Taglines) ? item.Taglines.find(Boolean) : '';
  if (t) return t;
  const o = String(item.Overview || '').replace(/\s+/g, ' ').trim();
  if (o.length <= 150) return o;
  const cut = o.slice(0, 150);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), 100)).replace(/[\s,.;:!?-]+$/, '')}…`;
}

/** Hero-Kandidaten der Startseite (Format wie buildPool im Billboard); Fallback: nur Backdrop. */
export async function loadHomeHeroPool() {
  const q = (params) => api.getItems({
    ...BASE_PARAMS, Fields: HERO_FIELDS, IncludeItemTypes: 'Movie,Series', Recursive: true, ...params,
  }).then(asItems);
  const [latest, random] = await Promise.all([
    q({ SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 30 }).catch(() => []),
    q({ SortBy: 'Random', Limit: 40 }).catch(() => []),
  ]);
  const pool = buildPool(latest, random, { newCount: 3, randomCount: 7 });
  if (pool.length) return pool;
  const seen = new Set();
  return [...latest, ...random].filter((it) => {
    if (!it || !it.Id || seen.has(it.Id) || !(it.BackdropImageTags && it.BackdropImageTags.length)) return false;
    seen.add(it.Id);
    return true;
  }).slice(0, 8);
}

function buildSlide(item, i, info) {
  const bd = api.imageUrl(item, { type: 'Backdrop', maxWidth: 1920, quality: 80 });
  const logo = api.logoImage(item, { maxWidth: 520 });
  const badge = plusBadge(item, info);
  const tag = taglineFor(item);
  const meta = yearGenres(item);
  const rating = ratingBox(item);
  return h('a', {
    class: 'lfx-plus-hero__slide',
    href: titleHref(item.Id),
    dataset: { index: String(i) },
    'aria-label': item.Name || '',
  }, [
    bd ? h('img', { class: 'lfx-plus-hero__img', src: bd, alt: '', decoding: 'async', loading: i < 3 ? 'eager' : 'lazy' }) : null,
    h('div', { class: 'lfx-plus-hero__shade', 'aria-hidden': 'true' }),
    h('div', { class: 'lfx-plus-hero__content' }, [
      badge ? h('span', { class: 'lfx-plus-badge lfx-plus-hero__badge' }, badge) : null,
      logo
        ? h('img', { class: 'lfx-plus-hero__logo', src: logo, alt: item.Name || '', decoding: 'async' })
        : h('span', { class: 'lfx-plus-hero__title' }, item.Name || ''),
      tag ? h('p', { class: 'lfx-plus-hero__tagline' }, tag) : null,
      (rating || meta) ? h('div', { class: 'lfx-plus-hero__meta' }, [rating, meta ? h('span', null, meta) : null]) : null,
    ]),
  ]);
}

/**
 * Baut das Karussell. Rückgabe: { el, destroy, go(i), index() } oder null (leer).
 * Timer läuft nur bei sichtbarem Tab, ohne Hover und ohne Fokus in der Hero.
 */
export function createHero(items, { info = null, interval = HERO_INTERVAL } = {}) {
  const list = (items || []).filter((it) => it && it.Id);
  if (!list.length) return null;
  const n = list.length;
  const slides = list.map((it, i) => buildSlide(it, i, info));
  const track = h('div', { class: 'lfx-plus-hero__track' }, slides);
  const prev = h('button', { type: 'button', class: 'lfx-plus-hero__nav lfx-plus-hero__nav--prev', 'aria-label': 'Vorherige Empfehlung', tabindex: '-1' });
  const next = h('button', { type: 'button', class: 'lfx-plus-hero__nav lfx-plus-hero__nav--next', 'aria-label': 'Nächste Empfehlung', tabindex: '-1' });
  prev.innerHTML = CHEVRON;
  next.innerHTML = CHEVRON;
  const dots = list.map((it, i) => h('button', {
    type: 'button', class: 'lfx-plus-hero__dot', 'aria-label': `Empfehlung ${i + 1} von ${n}`,
    onclick: () => go(i),
  }));
  const dotsEl = h('div', { class: 'lfx-plus-hero__dots' }, n > 1 ? dots : []);
  const el = h('section', { class: 'lfx-plus-hero', 'aria-roledescription': 'carousel', 'aria-label': 'Empfehlungen' }, [
    h('div', { class: 'lfx-plus-hero__viewport' }, [track]),
    n > 1 ? prev : null, n > 1 ? next : null, dotsEl,
  ]);

  let idx = 0;
  let timer = null;
  let hover = false;
  let focus = false;

  const running = () => n > 1 && !hover && !focus && !document.hidden;
  function stop() { clearTimeout(timer); timer = null; }
  function schedule() {
    stop();
    if (running()) timer = setTimeout(() => go(idx + 1), interval);
  }
  function paint() {
    el.style.setProperty('--i', String(idx));
    slides.forEach((s, i) => {
      const active = i === idx;
      s.classList.toggle('is-active', active);
      s.setAttribute('aria-hidden', active ? 'false' : 'true');
      s.tabIndex = active ? 0 : -1;
    });
    dots.forEach((d, i) => {
      d.classList.toggle('is-active', i === idx);
      if (i === idx) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current');
    });
  }
  function go(i) {
    idx = ((i % n) + n) % n;
    paint();
    schedule();
  }
  const onPrev = (e) => { e.preventDefault(); go(idx - 1); };
  const onNext = (e) => { e.preventDefault(); go(idx + 1); };
  const onSlideClick = (e) => {
    const s = e.target.closest && e.target.closest('.lfx-plus-hero__slide');
    if (!s || s.classList.contains('is-active')) return;
    e.preventDefault(); // Nachbarfolie: erst einblenden, dann per zweitem Klick öffnen
    go(Number(s.dataset.index));
  };
  const onEnter = () => { hover = true; stop(); };
  const onLeave = () => { hover = false; schedule(); };
  const onFocusIn = () => { focus = true; stop(); };
  const onFocusOut = (e) => { if (!el.contains(e.relatedTarget)) { focus = false; schedule(); } };
  const onVis = () => (document.hidden ? stop() : schedule());
  const onKey = (e) => {
    if (e.key === 'ArrowLeft') go(idx - 1);
    else if (e.key === 'ArrowRight') go(idx + 1);
  };

  prev.addEventListener('click', onPrev);
  next.addEventListener('click', onNext);
  track.addEventListener('click', onSlideClick);
  el.addEventListener('mouseenter', onEnter);
  el.addEventListener('mouseleave', onLeave);
  el.addEventListener('focusin', onFocusIn);
  el.addEventListener('focusout', onFocusOut);
  el.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onVis);
  paint();
  schedule();

  return {
    el,
    go,
    index: () => idx,
    destroy() {
      stop();
      prev.removeEventListener('click', onPrev);
      next.removeEventListener('click', onNext);
      track.removeEventListener('click', onSlideClick);
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mouseleave', onLeave);
      el.removeEventListener('focusin', onFocusIn);
      el.removeEventListener('focusout', onFocusOut);
      el.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVis);
      el.remove();
    },
  };
}
