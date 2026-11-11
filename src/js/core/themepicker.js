// LenzFlix: Design-Auswahl (Dialog am Desktop, Bottom-Sheet am Handy).
// Singleton #lfx-themepicker an document.body, unabhängig von Features (überlebt Design-Wechsel).
import { h, mountPoint, unmountPoint } from './dom.js';
import { attachSwipeClose } from './swipe.js';
import { THEMES, THEME_META, getChosenTheme, setTheme, onThemeChange } from './theme.js';
import * as api from './api.js';
import { getCharts } from './charts.js';
import { cached, clearCache } from './cache.js';
import { dayKey, seededShuffle } from './dayseed.js';

const ID = 'lfx-themepicker';
const BETA = new Set(['retro', 'store', 'live']); // Designs mit Beta-Kennzeichnung
const STORE_ROWS = [7, 6]; // Cover pro Regalreihe in der Vorschau der VIDEOTHEK LENZ
const STORE_COVERS = STORE_ROWS.reduce((a, b) => a + b, 0);
const COVER_TTL_MS = 6 * 60 * 60 * 1000;
const OPEN_CLASS = 'lfx-themepicker-open';
const MOBILE_QUERY = '(max-width: 799px)';

let current = null;

export function isThemePickerOpen() {
  return current !== null;
}

function isMobileViewport() {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia(MOBILE_QUERY).matches;
  } catch {
    return false;
  }
}

const span = (cls, children) => h('span', { class: cls }, children);

/** Mini-Vorschau, rein per CSS gezeichnet (Divs/Gradients). */
function buildPreview(id) {
  const tiles = (n) => Array.from({ length: n }, () => span('lfx-tp__tile'));
  const root = span(`lfx-tp__preview lfx-tp__preview--${id}`);
  root.setAttribute('aria-hidden', 'true');
  if (id === 'plus') {
    root.append(
      span('lfx-tp__bar', [span('lfx-tp__dot'), span('lfx-tp__dot'), span('lfx-tp__dot'), span('lfx-tp__dot')]),
      span('lfx-tp__hero lfx-tp__hero--side lfx-tp__hero--l'),
      span('lfx-tp__hero'),
      span('lfx-tp__hero lfx-tp__hero--side lfx-tp__hero--r'),
      span('lfx-tp__pager', [span('lfx-tp__pdot is-on'), span('lfx-tp__pdot'), span('lfx-tp__pdot')]),
      span('lfx-tp__row', tiles(5)),
    );
  } else if (id === 'prime') {
    root.append(
      span('lfx-tp__hero', [span('lfx-tp__line'), span('lfx-tp__line lfx-tp__line--s'), span('lfx-tp__btn')]),
      span('lfx-tp__row', tiles(4).map((t) => { t.append(span('lfx-tp__badge-mini')); return t; })),
    );
  } else if (id === 'retro') {
    root.append(span('lfx-tp__sun'), span('lfx-tp__grid'), span('lfx-tp__scan'));
  } else if (id === 'store') {
    // Regalwand von innen: Schild, zwei Regalreihen mit Platzhalter-Covern (echte Cover kommen per fillStoreCovers), Teppich
    let k = 0;
    const shelf = (n) => span('lfx-tp__shelf', Array.from({ length: n }, () => span(`lfx-tp__cover lfx-tp__cover--${k++ % 6}`)));
    root.append(span('lfx-tp__shopsign', ['VIDEOTHEK LENZ']), ...STORE_ROWS.map(shelf), span('lfx-tp__carpet'));
  } else if (id === 'live') {
    // Bildschirm mit laufenden Zeilen und Rollbalken (CSS-Animation), Fernbedienung wie in LENZ LIVE: Ein, Ziffern, Steuerkreuz, Farbtasten
    const keys = Array.from({ length: 9 }, () => span('lfx-tp__rkey'));
    const colors = ['r', 'g', 'y', 'b'].map((c) => span(`lfx-tp__rcol lfx-tp__rcol--${c}`));
    root.append(
      span('lfx-tp__tv', [span('lfx-tp__screen', [span('lfx-tp__roll'), span('lfx-tp__chno', ['5']), span('lfx-tp__rec')]), span('lfx-tp__ant')]),
      span('lfx-tp__remote', [
        span('lfx-tp__rtop', [span('lfx-tp__rled'), span('lfx-tp__rpower')]),
        span('lfx-tp__rkeys', keys),
        span('lfx-tp__rpad', [span('lfx-tp__rok')]),
        span('lfx-tp__rcols', colors),
      ]),
    );
  } else {
    root.append(span('lfx-tp__logo'), span('lfx-tp__hero'), span('lfx-tp__row', tiles(4)));
  }
  return root;
}

function buildMark(id, name) {
  if (id === 'plus') {
    return span('lfx-tp__mark lfx-tp__mark--plus', [span('lfx-tp__mark-text', ['LENZ']), span('lfx-tp__mark-plus', ['+'])]);
  }
  if (id === 'prime') {
    return span('lfx-tp__mark lfx-tp__mark--prime', [span('lfx-tp__mark-text', ['lenzprime'])]);
  }
  if (id === 'retro') {
    return span('lfx-tp__mark lfx-tp__mark--retro', [name]);
  }
  if (id === 'store') {
    return span('lfx-tp__mark lfx-tp__mark--store', [span('lfx-tp__mark-store-a', ['VIDEOTHEK']), span('lfx-tp__mark-store-b', ['LENZ'])]);
  }
  if (id === 'live') {
    return span('lfx-tp__mark lfx-tp__mark--live', [span('lfx-tp__mark-live-a', ['LENZ']), span('lfx-tp__mark-live-b', [span('lfx-tp__mark-live-dot'), 'LIVE'])]);
  }
  return span('lfx-tp__mark lfx-tp__mark--flix', [name]);
}

// ---------------------------------------------------------------- Cover der Store-Vorschau

const normId = (id) => String(id || '').replace(/-/g, '').toLowerCase();

/** Charts-Einträge (Filme/Serien abwechselnd, Top 20) -> Ids. */
function chartIds(charts) {
  if (!charts) return [];
  const movies = Array.isArray(charts.movies) ? charts.movies : [];
  const series = Array.isArray(charts.series) ? charts.series : [];
  const out = [];
  for (let i = 0; out.length < 20 && (i < movies.length || i < series.length); i++) {
    for (const e of [movies[i], series[i]]) if (e && e.id && out.length < 20) out.push(String(e.id));
  }
  return out;
}

const itemList = (res) => (Array.isArray(res) ? res : res && Array.isArray(res.Items) ? res.Items : []);

/** Cover-URLs nur aus den Items, die der Server dem aktuellen Nutzer zurückgibt (ohne api_key). */
function coverUrls(items) {
  const out = [];
  for (const it of items) {
    const tag = it && it.Id && it.ImageTags && it.ImageTags.Primary;
    if (!tag) continue;
    const url = api.imageUrlFor(it.Id, { maxWidth: 160, quality: 80, tag });
    if (url) out.push(url);
  }
  return out;
}

async function loadCoverUrls(day) {
  const want = STORE_COVERS;
  const urls = [];
  const used = new Set();
  const take = (items) => {
    for (const it of items) {
      if (urls.length >= want) return;
      const key = normId(it && it.Id);
      if (!key || used.has(key)) continue;
      const u = coverUrls([it]);
      if (!u.length) continue;
      used.add(key);
      urls.push(u[0]);
    }
  };
  const charts = await getCharts().catch(() => null);
  const ids = seededShuffle(chartIds(charts), `${day}:charts`);
  if (ids.length) {
    try {
      const res = await api.getItems({ Ids: ids.join(','), IncludeItemTypes: 'Movie,Series', Fields: 'ImageTags', EnableImageTypes: 'Primary', ImageTypeLimit: 1 });
      const byId = new Map(itemList(res).filter((i) => i && i.Id).map((i) => [normId(i.Id), i]));
      take(ids.map((id) => byId.get(normId(id))).filter(Boolean)); // nur Items aus der Antwort, in Seed-Reihenfolge
    } catch {
      /* weiter mit Fallback */
    }
  }
  if (urls.length < want) {
    try {
      const res = await api.getItems({
        IncludeItemTypes: 'Movie,Series', Recursive: true, SortBy: 'DateCreated', SortOrder: 'Descending', Limit: 30,
        Fields: 'ImageTags', EnableImageTypes: 'Primary', ImageTypeLimit: 1,
      });
      take(seededShuffle(itemList(res), `${day}:latest`));
    } catch {
      /* Rest bleibt Platzhalter */
    }
  }
  return urls;
}

/** Cover-Liste für heute (pro Nutzer und Tag im Speicher gecacht). Fehler: leere Liste. */
export function loadStoreCoverUrls() {
  try {
    if (!api.isReady()) return Promise.resolve([]);
    const day = dayKey();
    const key = `tp-store-covers:${api.getUserId()}:${day}`;
    return cached(key, () => loadCoverUrls(day), COVER_TTL_MS).then((urls) => {
      if (!urls.length) clearCache(key); // Fehlschlag nicht für Stunden merken
      return urls;
    }, () => []);
  } catch {
    return Promise.resolve([]);
  }
}

/** Blendet die echten Cover einzeln ein, sobald sie geladen sind. Nur wenn die Karte noch zum offenen Picker gehört. */
function fillStoreCovers(c) {
  const card = c.cards.get('store');
  if (!card) return;
  loadStoreCoverUrls().then((urls) => {
    if (current !== c || !card.isConnected) return;
    const covers = card.querySelectorAll('.lfx-tp__cover');
    urls.slice(0, covers.length).forEach((url, i) => {
      const img = document.createElement('img');
      img.className = 'lfx-tp__coverimg';
      img.alt = '';
      img.decoding = 'async';
      img.draggable = false;
      img.addEventListener('load', () => img.classList.add('is-in'));
      img.addEventListener('error', () => img.remove());
      img.src = url;
      covers[i].append(img);
    });
  }).catch(() => {});
}

function buildCard(c, id) {
  const meta = THEME_META[id] || { id, name: id, tagline: '', palette: [] };
  const btn = h('button', {
    type: 'button',
    class: `lfx-tp__card lfx-tp__card--${id}`,
    'aria-pressed': 'false',
    dataset: { theme: id },
  }, [
    buildPreview(id),
    span('lfx-tp__info', [
      buildMark(id, meta.name),
      span('lfx-tp__tagline', [meta.tagline || '']),
      span('lfx-tp__palette', (meta.palette || []).map((hex) => h('span', { class: 'lfx-tp__swatch', style: { background: hex } }))),
    ]),
    span('lfx-tp__state', [span('lfx-tp__active', ['Aktiv']), span('lfx-tp__spin')]),
    BETA.has(id) ? span('lfx-tp__beta', ['Beta']) : null,
  ]);
  btn.setAttribute('aria-label', `${meta.name}${BETA.has(id) ? ' (Beta)' : ''}${meta.tagline ? `, ${meta.tagline}` : ''}`);
  btn.addEventListener('click', () => choose(c, id));
  return btn;
}

function refresh(c) {
  const chosen = getChosenTheme();
  for (const [id, btn] of c.cards) {
    const on = id === chosen;
    btn.setAttribute('aria-pressed', String(on));
    btn.classList.toggle('is-active', on);
    const busy = c.loading === id;
    if (busy) btn.setAttribute('aria-busy', 'true');
    else btn.removeAttribute('aria-busy');
    btn.classList.toggle('is-loading', busy);
  }
}

function choose(c, id) {
  if (current !== c || c.loading) return;
  if (id === getChosenTheme()) return;
  c.loading = id;
  refresh(c);
  const done = () => {
    if (c.loading === id) c.loading = null;
    if (current === c) refresh(c);
  };
  let p;
  try {
    p = Promise.resolve(setTheme(id, { source: 'user' }));
  } catch {
    done();
    return;
  }
  // Erfolg: Dialog schließt sich automatisch (Ladezustand bleibt bis dahin sichtbar); Fehler: bleibt offen.
  const ok = () => {
    done();
    if (current === c && getChosenTheme() === id) closeThemePicker();
  };
  p.then(ok, done);
}

export function closeThemePicker() {
  const c = current;
  if (!c) return;
  current = null;
  if (c.detachSwipe) c.detachSwipe();
  if (c.unsub) c.unsub();
  window.removeEventListener('keydown', c.onKeydown, true);
  c.overlay.removeEventListener('click', c.onOverlayClick);
  unmountPoint(c.overlay);
  document.documentElement.classList.remove(OPEN_CLASS);
  const back = c.returnFocus;
  if (back && typeof back.focus === 'function' && back.isConnected) {
    try {
      back.focus({ preventScroll: true });
    } catch {
      /* Fokus ist optional */
    }
  }
}

export const destroyThemePicker = closeThemePicker;

export function openThemePicker({ returnFocus } = {}) {
  if (current) closeThemePicker();
  const sheet = isMobileViewport();
  const overlay = mountPoint(ID, { className: `lfx-tp${sheet ? ' lfx-tp--sheet' : ''}` });
  overlay.className = `lfx-tp${sheet ? ' lfx-tp--sheet' : ''}`;
  const c = { overlay, cards: new Map(), loading: null, returnFocus: returnFocus || null };

  const closeBtn = h('button', { type: 'button', class: 'lfx-tp__close', 'aria-label': 'Schließen' }, '×');
  closeBtn.addEventListener('click', () => closeThemePicker());
  const dialog = h('div', { class: 'lfx-tp__dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'lfx-tp-title', tabindex: '-1' }, [
    h('div', { class: 'lfx-tp__handle', 'aria-hidden': 'true' }),
    closeBtn,
    h('div', { class: 'lfx-tp__head' }, [
      h('h2', { class: 'lfx-tp__title', id: 'lfx-tp-title' }, 'Design'),
      h('p', { class: 'lfx-tp__sub' }, 'Wähle, wie deine Mediathek aussieht.'),
    ]),
  ]);
  const grid = h('div', { class: 'lfx-tp__grid' });
  for (const id of THEMES) {
    const card = buildCard(c, id);
    c.cards.set(id, card);
    grid.append(card);
  }
  dialog.append(grid);
  overlay.replaceChildren(dialog);
  c.dialog = dialog;

  c.onKeydown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      closeThemePicker();
      return;
    }
    if (e.key !== 'Tab') return;
    const nodes = [...dialog.querySelectorAll('button:not([disabled])')];
    if (!nodes.length) {
      e.preventDefault();
      return;
    }
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (!dialog.contains(active) || active === dialog) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    } else if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };
  c.onOverlayClick = (e) => {
    if (e.target === overlay) closeThemePicker();
  };
  window.addEventListener('keydown', c.onKeydown, true);
  overlay.addEventListener('click', c.onOverlayClick);
  c.unsub = onThemeChange(() => {
    if (current === c) refresh(c);
  });
  if (sheet) {
    c.detachSwipe = attachSwipeClose(dialog, { onClose: () => { if (current === c) closeThemePicker(); } });
  }
  document.documentElement.classList.add(OPEN_CLASS);
  current = c;
  refresh(c);
  fillStoreCovers(c);

  const activeCard = c.cards.get(getChosenTheme()) || grid.querySelector('button');
  if (activeCard) activeCard.focus({ preventScroll: true });
  // Einblend-Animation im nächsten Frame auslösen
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
  raf(() => { if (current === c) overlay.classList.add('is-open'); });
  return c;
}
