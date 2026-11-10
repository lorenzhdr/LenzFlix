// LenzFlix: Ansicht „Neu und beliebt“ (Route #/home?lfx=new).
// Eigener Container #lfx-newpopular als erstes Kind von #homeTab; native Sektionen und #lfx-home
// werden per CSS (html.lfx-newpopular-on) ausgeblendet. Karten/Scroller kommen aus rows/*.
import * as api from '../core/api.js';
import { h } from '../core/dom.js';
import { isTv } from '../core/layout.js';
import { putItems, getStoredItem } from '../core/itemstore.js';
import { ICON_DOWNLOAD, ICON_MORE } from '../core/icons.js';
import { canDownload, startDownload } from '../core/download.js';
import { openItemMenu, onItemsChanged } from '../core/itemmenu.js';
import { getCharts, resolveChartItems } from '../core/charts.js';
import { play } from '../core/playback.js';
import { openModal } from './modal.js';
import { createCard, detailHref, landscapeFor } from './rows/card.js';
import { BASE_PARAMS, badgeFor } from './rows/logic.js';
import { attachScroller, chevronButton } from './rows/scroller.js';
import { asItems, getNewSeriesIds } from './rows/sources.js';
import { dateParts, hasPlayCounts, sinceLabel, uniqueTitles } from './newpopular/format.js';

const ROOT_ID = 'lfx-newpopular';
const ON_CLASS = 'lfx-newpopular-on';
const TYPES = 'Movie,Series';

const SECTIONS = [
  { id: 'new', label: 'Neu bei LENZFLIX', icon: '🍿' },
  { id: 'watched', label: 'Am häufigsten geschaut', icon: '🔥' },
  { id: 'top-series', label: 'Top 10 Serien', icon: '🔟' },
  { id: 'top-movies', label: 'Top 10 Filme', icon: '🔟' },
];

let cleanups = [];
let waitTimer = null;

function isNewRoute(route) {
  return route.path === '/home' && route.params.get('lfx') === 'new';
}

function findHomeTab() {
  const tab = document.querySelector('#indexPage:not(.hide) #homeTab');
  return tab && tab.isConnected ? tab : null;
}

function teardown() {
  for (const fn of cleanups.splice(0)) {
    try { fn && fn(); } catch (e) { console.error('[LenzFlix] newpopular cleanup', e); }
  }
  document.getElementById(ROOT_ID)?.remove();
  document.documentElement.classList.remove(ON_CLASS);
}

// ---------------------------------------------------------------- Abfragen

const query = (params) => api.getItems({
  ...BASE_PARAMS, IncludeItemTypes: TYPES, Recursive: true, ...params,
}).then(asItems);

export function loadNew() {
  return query({ SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 20 }).then((l) => uniqueTitles(l, 20));
}

const MIN_CHART_TITLES = 3;

/** Untertitel unter Chart-Sektionen. */
export const chartSubtitle = (days) => `Meistgesehen auf LENZFLIX · letzte ${days || 30} Tage`;

/** Charts-Titel einer Liste auflösen. Rückgabe: {items, charted, windowDays}; zu dünn/kein Chart -> charted false. */
async function loadChart(key, limit, type) {
  try {
    const charts = await getCharts();
    if (!charts || !(charts[key] || []).length) return { items: [], charted: false };
    const items = await resolveChartItems(charts[key], { type, limit });
    return items.length >= MIN_CHART_TITLES
      ? { items, charted: true, windowDays: charts.windowDays }
      : { items: [], charted: false };
  } catch (e) {
    console.warn('[LenzFlix] Charts nicht auflösbar', e && e.message);
    return { items: [], charted: false };
  }
}

/** „Am häufigsten geschaut“: echte Charts, sonst eigene PlayCount, sonst CommunityRating. */
export async function loadMostWatchedSection() {
  const chart = await loadChart('all', 20);
  if (chart.charted) return { ...chart, items: uniqueTitles(chart.items, 20) };
  return { items: await loadMostWatched(), charted: false };
}

/** „Top 10 Serien/Filme“ (type: 'Series'|'Movie'): echte Charts, sonst neueste (Titel dann ehrlich „Neueste …“). */
export async function loadTopSection(type) {
  const chart = await loadChart(type === 'Series' ? 'series' : 'movies', 10);
  if (chart.charted) return chart;
  return { items: await loadTop(type), charted: false };
}

/** PlayCount (pro Benutzer); sind alle Zähler 0, Fallback auf CommunityRating. */
export async function loadMostWatched() {
  const byPlays = await query({ SortBy: 'PlayCount', SortOrder: 'Descending', Limit: 20 });
  if (hasPlayCounts(byPlays)) return uniqueTitles(byPlays, 20);
  return uniqueTitles(await query({ SortBy: 'CommunityRating', SortOrder: 'Descending', Limit: 20 }), 20);
}

export const loadTop = (type) => query({
  IncludeItemTypes: type, SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 10,
}).then((l) => uniqueTitles(l, 10));

// ---------------------------------------------------------------- Rendering

function svg(path) {
  const w = h('span', { class: 'lfx-np__ico', 'aria-hidden': 'true' });
  w.innerHTML = `<svg viewBox="0 0 24 24" focusable="false">${path}</svg>`;
  return w;
}
const ICON_PLAY = '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>';
const ICON_PLUS = '<path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>';
const ICON_CHECK = '<path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';
const ICON_DOWN = '<path d="M5 9l7 7 7-7" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>';

function roundButton(label, icon, onClick, extra = '') {
  const b = h('button', { type: 'button', class: `lfx-np__btn ${extra}`.trim(), 'aria-label': label, title: label, onclick: onClick });
  b.append(svg(icon));
  return b;
}

/** Runder Button mit fertigem SVG-String (core/icons.js); Klick stoppt die Weitergabe. */
function iconButton(mod, label, icon, onClick) {
  const b = h('button', { type: 'button', class: `lfx-np__btn lfx-np__btn--${mod}`, 'aria-label': label, title: label });
  b.append(h('span', { class: 'lfx-np__ico', 'aria-hidden': 'true' }));
  b.firstChild.innerHTML = icon;
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick(b);
  });
  return b;
}

/** Download (versteckt bis canDownload true) und „Mehr“ (⋮) für einen Eintrag. */
function extraButtons(item) {
  const folder = item.Type === 'Series' || item.Type === 'Season';
  const dl = iconButton('dl', folder ? 'Episoden herunterladen' : 'Herunterladen', ICON_DOWNLOAD, (b) => startDownload(item, b));
  dl.hidden = true;
  // Race: nur einblenden, solange der Button noch im Dokument hängt (Liste kann neu gerendert worden sein).
  Promise.resolve(canDownload(item)).then((ok) => {
    if (ok && dl.isConnected) dl.hidden = false;
  }, () => {});
  const menu = iconButton('menu', 'Mehr', ICON_MORE, (b) => openItemMenu(item, b));
  menu.setAttribute('aria-haspopup', 'menu');
  return [dl, menu];
}

function favoriteButton(item) {
  let fav = Boolean(item.UserData && item.UserData.IsFavorite);
  function paint() {
    const label = fav ? 'Aus Meine Liste entfernen' : 'Zu Meine Liste hinzufügen';
    btn.setAttribute('aria-label', label);
    btn.title = label;
    btn.querySelector('svg').innerHTML = fav ? ICON_CHECK : ICON_PLUS;
    btn.classList.toggle('is-on', fav);
    btn.setAttribute('aria-pressed', String(fav));
  }
  const btn = roundButton('Meine Liste', ICON_PLUS, async () => {
    const next = !fav;
    try {
      await api.setFavorite(item.Id, next);
      fav = next;
      if (item.UserData) item.UserData.IsFavorite = next;
      paint();
    } catch (e) {
      console.warn('[LenzFlix] Meine Liste fehlgeschlagen', e && e.message);
    }
  }, 'lfx-np__btn--fav');
  paint();
  return btn;
}

/** Ein Eintrag der „Neu bei LENZFLIX“-Liste. */
export function createNewEntry(item, newSeries) {
  const parts = dateParts(item.DateCreated);
  const title = item.Name || '';
  const bg = api.imageUrl(item, { type: 'Backdrop', maxWidth: 1000, quality: 85 }) || (landscapeFor(item, 1000) || {}).url;
  const logo = api.logoImage(item, { maxWidth: 400 });
  const open = (e) => {
    if (e && e.preventDefault) e.preventDefault();
    openModal(item);
  };
  const media = h('a', { class: 'lfx-np__media', href: detailHref(item), 'aria-label': title, onclick: open }, [
    bg ? h('img', { class: 'lfx-np__img', src: bg, alt: '', loading: 'lazy', decoding: 'async' }) : null,
    logo
      ? h('img', { class: 'lfx-np__media-logo', src: logo, alt: '', loading: 'lazy', decoding: 'async' })
      : h('span', { class: 'lfx-np__media-title' }, title),
  ]);
  const buttons = h('div', { class: 'lfx-np__btns' }, [
    roundButton('Abspielen', ICON_PLAY, () => { play(item, { resume: false }); }),
    favoriteButton(item),
    ...extraButtons(item),
    roundButton('Weitere Infos', ICON_DOWN, open),
  ]);
  const genres = (item.Genres || []).slice(0, 4).join(' • ');
  const body = h('div', { class: 'lfx-np__body' }, [
    h('div', { class: 'lfx-np__name' }, title),
    h('div', { class: 'lfx-np__since' }, sinceLabel(item, newSeries)),
    item.Overview ? h('p', { class: 'lfx-np__overview' }, item.Overview) : null,
    genres ? h('div', { class: 'lfx-np__genres' }, genres) : null,
  ]);
  return h('article', { class: 'lfx-np__entry', dataset: { lfxId: item.Id } }, [
    h('div', { class: 'lfx-np__date', 'aria-hidden': parts ? 'true' : null }, parts
      ? [h('span', { class: 'lfx-np__month' }, parts.month), h('span', { class: 'lfx-np__day' }, parts.day)]
      : []),
    h('div', { class: 'lfx-np__main' }, [h('div', { class: 'lfx-np__mediawrap' }, [media, buttons]), body]),
  ]);
}

/** Karten-Zeile (Klassen aus rows.css). Rückgabe: {el, scroller}. */
export function createRow(title, items, kind, newSeries) {
  const now = Date.now();
  const cards = items.map((it, i) => createCard(it, {
    kind, rank: kind === 'top10' ? i + 1 : 0, badge: badgeFor(it, newSeries, now),
  }));
  const track = h('div', { class: 'lfx-row__track', role: 'list', 'aria-label': title }, cards);
  const prev = chevronButton('prev', 'Zurück');
  const next = chevronButton('next', 'Weiter');
  const indicator = h('div', { class: 'lfx-row__pages', 'aria-hidden': 'true', hidden: true });
  const el = h('div', { class: 'lfx-rows' }, [
    h('section', { class: `lfx-row lfx-row--${kind}` }, [
      h('div', { class: 'lfx-row__head' }, [h('h2', { class: 'lfx-row__title' }, title), indicator]),
      h('div', { class: 'lfx-row__viewport' }, [prev, track, next]),
    ]),
  ]);
  return { el, scroller: { track, prev, next, indicator } };
}

function sectionShell(def) {
  return h('section', { class: 'lfx-np__section', id: `lfx-np-${def.id}`, dataset: { np: def.id } }, [
    h('h2', { class: 'lfx-np__heading' }, def.label),
  ]);
}

function build(tab) {
  teardown();
  let disposed = false;
  const scrollers = [];
  const sections = new Map(SECTIONS.map((d) => [d.id, sectionShell(d)]));
  const pills = new Map();
  const nav = h('nav', { class: 'lfx-np__tabs', 'aria-label': 'Neu und beliebt' });

  function setActive(id) {
    for (const [pid, pill] of pills) pill.classList.toggle('is-active', pid === id);
  }

  for (const d of SECTIONS) {
    const pill = h('button', {
      type: 'button',
      class: 'lfx-np__pill',
      dataset: { np: d.id },
      onclick: () => {
        const sec = sections.get(d.id);
        setActive(d.id);
        if (sec && typeof sec.scrollIntoView === 'function') sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
    }, [h('span', { class: 'lfx-np__pill-ico', 'aria-hidden': 'true' }, d.icon), d.label]);
    pills.set(d.id, pill);
    nav.append(pill);
  }
  const root = h('div', { id: ROOT_ID, class: 'lfx-np' }, [nav, ...sections.values()]);
  tab.prepend(root);
  document.documentElement.classList.add(ON_CLASS);
  setActive('new');

  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      let current = null;
      for (const [id, sec] of sections) {
        if (sec.isConnected && sec.getBoundingClientRect().top <= 170) current = id;
      }
      if (current) setActive(current);
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  function drop(id) {
    sections.get(id)?.remove();
    sections.delete(id);
    pills.get(id)?.remove();
    pills.delete(id);
  }

  function relabel(id, label) {
    const heading = sections.get(id)?.querySelector('.lfx-np__heading');
    if (heading) heading.textContent = label;
    const pill = pills.get(id);
    if (pill && pill.lastChild) pill.lastChild.textContent = label;
  }

  let newSeriesIds = new Set();

  /** Bibliothek geändert: entfernte Titel aus der Ansicht nehmen, geänderte „Neu“-Einträge neu zeichnen. */
  function onChanged({ removed = [], updated = [] }) {
    if (disposed) return;
    const list = root.querySelector('.lfx-np__list');
    for (const id of removed) {
      root.querySelectorAll('[data-lfx-id]').forEach((el) => {
        if (el.dataset.lfxId === id) el.remove();
      });
    }
    if (list && removed.length && !list.children.length) drop('new');
    if (list) {
      for (const id of updated) {
        const fresh = getStoredItem(id);
        const entry = [...list.children].find((el) => el.dataset.lfxId === id);
        if (fresh && entry) entry.replaceWith(createNewEntry(fresh, newSeriesIds));
      }
    }
  }
  cleanups.push(onItemsChanged(onChanged));

  /** loader liefert Items oder {items, charted, windowDays, fallbackLabel}. */
  async function fill(id, loader, renderer, fallbackLabel) {
    try {
      const res = await loader();
      const items = Array.isArray(res) ? res : res.items;
      const meta = Array.isArray(res) ? {} : res;
      if (disposed) return;
      if (!items.length) { drop(id); return; }
      putItems(items);
      const newSeries = await getNewSeriesIds();
      if (disposed) return;
      newSeriesIds = newSeries;
      if (fallbackLabel && !meta.charted) relabel(id, fallbackLabel);
      renderer(sections.get(id), items, newSeries, meta);
    } catch (e) {
      console.warn(`[LenzFlix] Neu und beliebt "${id}" nicht geladen`, e && e.message);
      if (!disposed) drop(id);
    }
  }
  const rowRenderer = (title, kind, fallbackTitle) => (sec, items, newSeries, meta = {}) => {
    const row = createRow(meta.charted || !fallbackTitle ? title : fallbackTitle, items, kind, newSeries);
    sec.querySelector('.lfx-np__heading')?.remove();
    if (meta.charted) {
      row.el.querySelector('.lfx-row__head').after(h('p', { class: 'lfx-np__sub' }, chartSubtitle(meta.windowDays)));
    }
    sec.append(row.el);
    scrollers.push(attachScroller(row.scroller));
  };

  if (api.isReady()) {
    fill('new', loadNew, (sec, items, newSeries) => {
      sec.append(h('div', { class: 'lfx-np__list' }, items.map((it) => createNewEntry(it, newSeries))));
    });
    fill('watched', loadMostWatchedSection, rowRenderer('Am häufigsten geschaut', 'landscape'));
    fill('top-series', () => loadTopSection('Series'), rowRenderer('Top 10 Serien', 'top10', 'Neueste Serien'), 'Neueste Serien');
    fill('top-movies', () => loadTopSection('Movie'), rowRenderer('Top 10 Filme', 'top10', 'Neueste Filme'), 'Neueste Filme');
  } else {
    console.warn('[LenzFlix] Neu und beliebt: keine Anmeldung');
  }

  cleanups.push(() => {
    disposed = true;
    window.removeEventListener('scroll', onScroll);
    if (raf) cancelAnimationFrame(raf);
    for (const d of scrollers.splice(0)) {
      try { d && d(); } catch { /* ignorieren */ }
    }
  });
}

function ensure() {
  clearTimeout(waitTimer);
  const existing = document.getElementById(ROOT_ID);
  const tab = findHomeTab();
  if (tab && existing && tab.contains(existing)) return;
  if (tab) { build(tab); return; }
  let tries = 0;
  const poll = () => {
    const t = findHomeTab();
    if (t) build(t);
    else if (++tries < 30) waitTimer = setTimeout(poll, 200);
  };
  waitTimer = setTimeout(poll, 200);
}

const newPopularFeature = {
  name: 'newpopular',
  match: (route) => isNewRoute(route) && !isTv(),
  mount: () => ensure(),
  update: () => ensure(),
  unmount: () => { clearTimeout(waitTimer); teardown(); },
};

export default newPopularFeature;
