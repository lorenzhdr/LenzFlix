// LENZPRIME: Titel-Vollseite (#/home?lfx=title&id=).
// Eigener Mount #lfx-prime-title als erstes Kind von #homeTab (damit der Proxy-Klick fürs Abspielen greift);
// native Sektionen werden per html.lfx-prime-title-on ausgeblendet. Episode/Staffel -> Serie, BoxSet -> Titel-Raster.
import * as api from '../../core/api.js';
import { h } from '../../core/dom.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { play } from '../../core/playback.js';
import { canDownload } from '../../core/download.js';
import { onItemsChanged } from '../../core/itemmenu.js';
import { closePopover } from '../../core/popover.js';
import { ICON_DOWNLOAD, ICON_MORE, ICON_EYE, ICON_EYE_CHECK } from '../../core/icons.js';
import { getStoredItem } from '../../core/itemstore.js';
import { parseLfxRoute } from '../../shared/routes.js';
import { togglePlayed, toggleFavorite, startDownloadFor, openTitleMenu } from '../../shared/titleactions.js';
import { getTrendInfo, heroTrendLine } from '../../shared/trend.js';
import { getNewContentInfo } from '../../shared/newcontent.js';
import { loadLocalTrailer, trailerUrl, directRemoteTrailerUrl, applyStartAt } from '../../shared/trailer.js';
import { autoPause } from './preview-gate.js';
import * as data from '../modal/data.js';
import { hasResume, pickInitialSeason } from '../modal/format.js';
import { resolveTarget, playInfo, metaItems, detailTiles } from './title-logic.js';
import { ICONS, iconEl, circleButton, setIcon, ratingChipEl, buildTile, buildEpisode, buildCardGrid, buildSeasonSelect } from './title-dom.js';

const ROOT_ID = 'lfx-prime-title';
const ON_CLASS = 'lfx-prime-title-on';
const TRAILER_DELAY_MS = 1200;
const HEADER_H = 80;

let root = null;
let session = null; // { id, dead, cleanups, video, ... }
let waitTimer = null;

const isPlainRoute = (route) => {
  const r = parseLfxRoute(route);
  return r.kind === 'title' && r.id ? r : null;
};

function findHomeTab() {
  const tab = document.querySelector('#indexPage:not(.hide) #homeTab');
  return tab && tab.isConnected ? tab : null;
}

function reducedMotion() {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------- Video

function stopVideo(s) {
  if (!s || !s.video) return;
  const v = s.video;
  s.video = null;
  if (s.gate) { s.gate.stop(); s.gate = null; }
  try {
    v.pause();
    v.removeAttribute('src');
    if (v.load) v.load();
  } catch { /* jsdom: nicht implementiert */ }
  v.remove();
  if (s.stage) s.stage.classList.remove('has-video');
  if (s.muteBtn) s.muteBtn.hidden = true;
}

function paintMute(s) {
  if (!s.video || !s.muteBtn) return;
  setIcon(s.muteBtn, s.video.muted ? ICONS.muted : ICONS.sound);
  const label = s.video.muted ? 'Ton einschalten' : 'Ton ausschalten';
  s.muteBtn.setAttribute('aria-label', label);
  s.muteBtn.title = label;
}

/** Lokaler Trailer (Stream) oder direkt abspielbarer Remote-Trailer; null, wenn keiner da ist. */
async function resolveTrailerSrc(item) {
  try {
    const t = await loadLocalTrailer({ ...item, LocalTrailerCount: item.LocalTrailerCount == null ? 1 : item.LocalTrailerCount });
    if (t) return trailerUrl(t.Id);
  } catch { /* Fallback */ }
  return directRemoteTrailerUrl(item);
}

function startVideo(s, { muted = true } = {}) {
  if (s.dead || !s.trailerSrc || !s.bg) return;
  if (s.video) {
    s.video.muted = muted;
    try { s.video.currentTime = 0; const p = s.video.play && s.video.play(); if (p && p.catch) p.catch(() => {}); } catch { /* egal */ }
    paintMute(s);
    return;
  }
  const v = h('video', { class: 'lfx-pt__video', playsinline: true, preload: 'auto', 'aria-hidden': 'true' });
  v.muted = muted;
  if (muted) v.setAttribute('muted', '');
  v.addEventListener('playing', () => {
    if (s.dead || s.video !== v) return;
    v.classList.add('is-in');
    s.stage.classList.add('has-video');
    s.muteBtn.hidden = false;
    paintMute(s);
  });
  const end = () => { if (s.video === v) stopVideo(s); };
  v.addEventListener('ended', end);
  v.addEventListener('error', end);
  s.video = v;
  if (muted) applyStartAt(v, 4);
  v.src = s.trailerSrc;
  s.bg.append(v);
  s.gate = autoPause(v);
  try {
    const p = v.play && v.play();
    if (p && p.catch) p.catch(end);
  } catch { end(); }
}

// ---------------------------------------------------------------- Seite

function buildSkeleton() {
  return h('div', { class: 'lfx-pt__skeleton', 'aria-busy': 'true', 'aria-label': 'Wird geladen' }, [
    h('div', { class: 'lfx-pt__sk-bar lfx-pt__sk-bar--title' }),
    h('div', { class: 'lfx-pt__sk-bar' }),
    h('div', { class: 'lfx-pt__sk-bar lfx-pt__sk-bar--btn' }),
  ]);
}

function buildError(message) {
  return h('div', { class: 'lfx-pt__error', role: 'alert' }, [
    h('p', null, message),
    h('a', { class: 'lfx-pt__back', href: '#/home' }, 'Zur Startseite'),
  ]);
}

function backdropOf(main) {
  return api.imageUrl(main, { type: 'Backdrop', maxWidth: 1920, quality: 85 })
    || api.landscapeImage(main, { maxWidth: 1920, quality: 85 })
    || api.imageUrl(main, { type: 'Primary', maxWidth: 900, quality: 85 });
}

function paintPlay(s, info) {
  const btn = s.playBtn;
  if (!btn) return;
  btn.replaceChildren(
    iconEl(ICONS.play),
    h('span', { class: 'lfx-pt__play-text' }, [
      h('span', { class: 'lfx-pt__play-label' }, info.label),
      info.sub ? h('span', { class: 'lfx-pt__play-sub' }, info.sub) : null,
    ]),
  );
  btn.classList.toggle('is-two-line', Boolean(info.sub));
  s.playInfo = info;
  const wrap = s.playWrap;
  const old = wrap.querySelector('.lfx-pt__progress');
  if (old) old.remove();
  if (info.progress > 0) {
    wrap.append(h('div', { class: 'lfx-pt__progress', 'aria-hidden': 'true' }, [h('span', { style: { width: `${Math.round(info.progress)}%` } })]));
  }
}

function buildStage(s, main) {
  const bgUrl = backdropOf(main);
  s.bg = h('div', { class: 'lfx-pt__bg', 'aria-hidden': 'true' }, [
    bgUrl ? h('img', { class: 'lfx-pt__bg-img', src: bgUrl, alt: '', decoding: 'async' }) : null,
    h('div', { class: 'lfx-pt__shade lfx-pt__shade--a' }),
    h('div', { class: 'lfx-pt__shade lfx-pt__shade--b' }),
  ]);
  s.muteBtn = circleButton({
    label: 'Ton einschalten', icon: ICONS.muted, mod: 'mute', hidden: true,
    onClick: () => {
      if (!s.video) return;
      s.video.muted = !s.video.muted;
      paintMute(s);
    },
  });
  s.muteBtn.classList.add('lfx-pt__mute');

  const logo = api.logoImage(main, { maxWidth: 720 });
  const title = logo
    ? h('img', { class: 'lfx-pt__logo', src: logo, alt: main.Name || '', decoding: 'async' })
    : h('h1', { class: 'lfx-pt__title' }, main.Name || '');
  s.rankEl = h('div', { class: 'lfx-pt__rank', hidden: true });

  const meta = h('div', { class: 'lfx-pt__meta' });
  const fill = (seasonCount) => {
    const parts = metaItems(main, seasonCount);
    const chip = ratingChipEl(main.OfficialRating);
    meta.replaceChildren(
      ...(chip ? [chip] : []),
      ...parts.map((p) => h('span', { class: 'lfx-pt__meta-item' }, p)),
    );
  };
  fill(0);
  s.fillMeta = fill;

  s.playBtn = h('button', { type: 'button', class: 'lfx-pt__play' });
  s.playBtn.addEventListener('click', () => {
    const info = s.playInfo;
    if (info && info.target) play(info.target, { resume: info.resume });
  });
  s.playWrap = h('div', { class: 'lfx-pt__play-wrap' }, [s.playBtn]);
  paintPlay(s, playInfo(main, null));

  const isFav = () => Boolean(main.UserData && main.UserData.IsFavorite);
  const isPlayed = () => Boolean(main.UserData && main.UserData.Played);
  const favLabel = () => (isFav() ? 'Aus Meine Liste entfernen' : 'Zu Meine Liste hinzufügen');
  s.favBtn = circleButton({
    label: favLabel(), icon: isFav() ? ICONS.check : ICONS.plus, mod: 'fav',
    onClick: async (b) => {
      await toggleFavorite(main);
      if (!s.dead) syncButtons(s, main);
      b.blur();
    },
  });
  s.playedBtn = circleButton({
    label: isPlayed() ? 'Als ungesehen markieren' : 'Als gesehen markieren', icon: isPlayed() ? ICON_EYE_CHECK : ICON_EYE, mod: 'seen',
    onClick: async (b) => {
      await togglePlayed(main, { anchorEl: b });
      if (!s.dead) syncButtons(s, main);
    },
  });
  s.trailerBtn = circleButton({
    label: 'Trailer ansehen', icon: ICONS.trailer, mod: 'trailer', hidden: true,
    onClick: () => startVideo(s, { muted: false }),
  });
  s.dlBtn = circleButton({
    label: main.Type === 'Series' || main.Type === 'Season' ? 'Episoden herunterladen' : 'Herunterladen', icon: ICON_DOWNLOAD, mod: 'dl', hidden: true,
    onClick: (b) => startDownloadFor(main, { anchorEl: b }),
  });
  const more = circleButton({ label: 'Mehr', icon: ICON_MORE, mod: 'more', onClick: (b) => openTitleMenu(main, b) });
  more.setAttribute('aria-haspopup', 'menu');
  s.circles = h('div', { class: 'lfx-pt__circles' }, [s.trailerBtn, s.favBtn, s.playedBtn, s.dlBtn, more]);

  const content = h('div', { class: 'lfx-pt__content' }, [
    title,
    s.rankEl,
    meta,
    main.Overview ? h('p', { class: 'lfx-pt__desc' }, main.Overview) : null,
    h('div', { class: 'lfx-pt__actions' }, [s.playWrap, s.circles]),
  ]);
  s.stage = h('div', { class: 'lfx-pt__stage' }, [s.bg, s.muteBtn, content]);
  return s.stage;
}

function syncButtons(s, main) {
  const fav = Boolean(main.UserData && main.UserData.IsFavorite);
  const played = Boolean(main.UserData && main.UserData.Played);
  setIcon(s.favBtn, fav ? ICONS.check : ICONS.plus);
  s.favBtn.classList.toggle('is-on', fav);
  s.favBtn.setAttribute('aria-pressed', String(fav));
  const favLabel = fav ? 'Aus Meine Liste entfernen' : 'Zu Meine Liste hinzufügen';
  s.favBtn.setAttribute('aria-label', favLabel);
  s.favBtn.title = favLabel;
  setIcon(s.playedBtn, played ? ICON_EYE_CHECK : ICON_EYE);
  s.playedBtn.classList.toggle('is-on', played);
  s.playedBtn.setAttribute('aria-pressed', String(played));
  const pl = played ? 'Als ungesehen markieren' : 'Als gesehen markieren';
  s.playedBtn.setAttribute('aria-label', pl);
  s.playedBtn.title = pl;
}

// ---------------------------------------------------------------- Registerkarten

function buildTabs(s, defs) {
  const bar = h('div', { class: 'lfx-pt__tabs', role: 'tablist' });
  const panels = h('div', { class: 'lfx-pt__panels' });
  const sentinel = h('div', { class: 'lfx-pt__sentinel', 'aria-hidden': 'true' });
  const btns = new Map();
  const panelEls = new Map();

  function select(id) {
    for (const [pid, b] of btns) {
      const on = pid === id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-selected', String(on));
      b.tabIndex = on ? 0 : -1;
      panelEls.get(pid).hidden = !on;
    }
  }

  for (const d of defs) {
    const b = h('button', {
      type: 'button', class: 'lfx-pt__tab', role: 'tab', id: `lfx-pt-tab-${d.id}`, 'aria-controls': `lfx-pt-panel-${d.id}`,
    }, d.label);
    b.addEventListener('click', () => select(d.id));
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const ids = defs.map((x) => x.id);
      const next = ids[(ids.indexOf(d.id) + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
      select(next);
      btns.get(next).focus();
    });
    btns.set(d.id, b);
    bar.append(b);
    const p = h('div', {
      class: 'lfx-pt__panel', role: 'tabpanel', id: `lfx-pt-panel-${d.id}`, 'aria-labelledby': `lfx-pt-tab-${d.id}`, hidden: true,
    });
    panelEls.set(d.id, p);
    panels.append(p);
  }
  select(defs[0].id);

  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver(([e]) => {
      bar.classList.toggle('is-stuck', !e.isIntersecting && e.boundingClientRect.top < HEADER_H);
    }, { rootMargin: `-${HEADER_H}px 0px 0px 0px` });
    io.observe(sentinel);
    s.cleanups.push(() => io.disconnect());
  }
  return { bar, panels, sentinel, panel: (id) => panelEls.get(id), select };
}

const empty = (text) => h('p', { class: 'lfx-pt__empty' }, text);

function fillEpisodes(s, main, panel, sel) {
  let seasons = [];
  let seq = 0;
  let firstReveal = Boolean(sel.episodeId);

  async function showSeason(seasonId) {
    const mine = ++seq;
    const slot = panel.querySelector('.lfx-pt__eps');
    slot.replaceChildren(h('p', { class: 'lfx-pt__empty' }, 'Folgen werden geladen …'));
    let eps;
    try {
      eps = await data.loadEpisodes(main.Id, seasonId);
    } catch {
      if (!s.dead && mine === seq) slot.replaceChildren(empty('Folgen konnten nicht geladen werden.'));
      return;
    }
    if (s.dead || mine !== seq) return;
    if (!eps.length) { slot.replaceChildren(empty('Keine Folgen vorhanden.')); return; }
    const onPlay = (ep) => play(ep, { resume: hasResume(ep) });
    slot.replaceChildren(...eps.map((ep) => buildEpisode(ep, { onPlay, selected: ep.Id === sel.episodeId })));
    if (firstReveal) {
      firstReveal = false;
      const row = slot.querySelector('.is-selected');
      if (row && typeof row.scrollIntoView === 'function') {
        try { row.scrollIntoView({ block: 'center', behavior: reducedMotion() ? 'auto' : 'smooth' }); } catch { /* egal */ }
      }
    }
  }

  return (async () => {
    try {
      seasons = await data.loadSeasons(main.Id);
    } catch {
      if (!s.dead) panel.replaceChildren(empty('Folgen konnten nicht geladen werden.'));
      return;
    }
    if (s.dead) return;
    if (!seasons.length) { panel.replaceChildren(empty('Keine Folgen vorhanden.')); return; }
    s.fillMeta(seasons.length);
    let seasonId = pickInitialSeason(seasons, sel.seasonId);
    const head = h('div', { class: 'lfx-pt__eps-head' });
    const mountSelect = () => {
      const btn = buildSeasonSelect(seasons, seasonId, (id) => {
        seasonId = id;
        mountSelect();
        showSeason(id);
      });
      head.replaceChildren(btn);
    };
    if (seasons.length > 1) mountSelect();
    panel.replaceChildren(head, h('div', { class: 'lfx-pt__eps' }));
    await showSeason(seasonId);
  })();
}

// ---------------------------------------------------------------- Laden und Rendern

function teardownSession() {
  const s = session;
  session = null;
  if (!s) return;
  s.dead = true;
  stopVideo(s);
  for (const fn of s.cleanups.splice(0)) {
    try { fn && fn(); } catch (e) { console.error('[LenzFlix] prime-title cleanup', e); }
  }
  closePopover();
}

async function load(id) {
  teardownSession();
  const s = { id, dead: false, cleanups: [], video: null, trailerSrc: null };
  session = s;
  root.replaceChildren(buildSkeleton());
  try { window.scrollTo(0, 0); } catch { /* egal */ }

  let main;
  let sel;
  try {
    const peek = getStoredItem(id) || (await data.loadItem(id));
    if (s.dead) return;
    if (!peek) throw new Error('Titel nicht gefunden');
    const r = resolveTarget(peek, id);
    sel = r.sel;
    main = await data.loadItem(r.targetId); // immer vollständig laden (Karten-Items haben nicht alle Felder; 5 min gecacht)
    if (!main) throw new Error('Titel nicht gefunden');
  } catch {
    if (!s.dead) root.replaceChildren(buildError('Der Titel konnte nicht geladen werden.'));
    return;
  }
  if (s.dead) return;

  s.main = main;
  const isSeries = main.Type === 'Series';
  const isBox = main.Type === 'BoxSet';
  const defs = [];
  if (isSeries) defs.push({ id: 'episodes', label: 'Folgen' });
  if (isBox) defs.push({ id: 'titles', label: 'Titel' });
  else defs.push({ id: 'similar', label: 'Ähnliches' });
  defs.push({ id: 'details', label: 'Details' });

  const stage = buildStage(s, main);
  const tabs = buildTabs(s, defs);
  root.replaceChildren(stage, tabs.sentinel, tabs.bar, tabs.panels);

  // Details (sofort)
  const tilesEl = h('div', { class: 'lfx-pt__tiles' }, detailTiles(main).map(buildTile));
  tabs.panel('details').append(tilesEl);

  const tasks = [];

  // Fortsetzen / nächste Folge
  if (isSeries) {
    tasks.push(data.loadNextUp(main.Id).then((ep) => {
      if (!s.dead && ep) paintPlay(s, playInfo(main, ep));
    }).catch(() => {}));
    tasks.push(fillEpisodes(s, main, tabs.panel('episodes'), sel).catch(() => {}));
  }

  // Raster: Ähnliches bzw. Sammlung
  const gridPromise = Promise.all([getTrendInfo().catch(() => null), getNewContentInfo().catch(() => null)]);
  const renderGrid = (panel, items, emptyText) => gridPromise.then(([trend, newInfo]) => {
    if (s.dead) return;
    panel.replaceChildren(items.length ? buildCardGrid(items, { trend, newInfo }) : empty(emptyText));
  });
  if (isBox) {
    tasks.push(data.loadCollection(main.Id).then((items) => renderGrid(tabs.panel('titles'), items, 'Diese Sammlung ist leer.'))
      .catch(() => { if (!s.dead) tabs.panel('titles').replaceChildren(empty('Titel konnten nicht geladen werden.')); }));
  } else {
    tasks.push(data.loadSimilar(main.Id).then((items) => renderGrid(tabs.panel('similar'), items.filter((i) => i.Id !== main.Id), 'Keine ähnlichen Titel gefunden.'))
      .catch(() => { if (!s.dead) tabs.panel('similar').replaceChildren(empty('Ähnliche Titel konnten nicht geladen werden.')); }));
  }

  // Rangzeile
  getTrendInfo().then((trend) => {
    if (s.dead) return;
    const line = heroTrendLine(main, trend);
    if (!line) return;
    s.rankEl.replaceChildren(iconEl(ICONS.trend, 'lfx-pt__rank-ico'), h('span', null, line));
    s.rankEl.hidden = false;
  }).catch(() => {});

  // Download-Knopf
  Promise.resolve(canDownload(main)).then((ok) => {
    if (ok && !s.dead && s.dlBtn.isConnected) s.dlBtn.hidden = false;
  }, () => {});

  // Trailer (stumm, Autoplay) – Backdrop bleibt, bis das Video läuft
  resolveTrailerSrc(main).then((src) => {
    if (s.dead || !src) return;
    s.trailerSrc = src;
    s.trailerBtn.hidden = false;
    if (reducedMotion()) return;
    const t = setTimeout(() => startVideo(s, { muted: true }), TRAILER_DELAY_MS);
    s.cleanups.push(() => clearTimeout(t));
  }).catch(() => {});

  const onVis = () => {
    if (!s.video) return;
    try {
      if (document.hidden) s.video.pause();
      else { const p = s.video.play(); if (p && p.catch) p.catch(() => {}); }
    } catch { /* egal */ }
  };
  document.addEventListener('visibilitychange', onVis);
  s.cleanups.push(() => document.removeEventListener('visibilitychange', onVis));

  // Bibliothek geändert (Titelmenü: löschen/bearbeiten)
  s.cleanups.push(onItemsChanged(({ removed = [], updated = [] }) => {
    if (s.dead) return;
    if (removed.includes(main.Id)) { window.location.hash = '#/home'; return; }
    if (updated.includes(main.Id)) {
      const fresh = getStoredItem(main.Id);
      if (fresh) {
        main.UserData = fresh.UserData || main.UserData;
        syncButtons(s, main);
      }
    }
  }));

  await Promise.all(tasks);
}

// ---------------------------------------------------------------- Mount

function stop() {
  clearTimeout(waitTimer);
  waitTimer = null;
  teardownSession();
  if (root) root.remove();
  root = null;
  document.getElementById(ROOT_ID)?.remove();
  document.documentElement.classList.remove(ON_CLASS);
}

/** Die Bühne beginnt am oberen Fensterrand (unter der schwebenden Kopfzeile): einen evtl. nativen Abstandhalter ausgleichen. */
function pullToTop(el) {
  el.style.marginTop = '';
  const top = el.getBoundingClientRect().top + (window.scrollY || 0);
  if (top > 2 && top < 240) el.style.marginTop = `-${Math.round(top)}px`;
}

function start(route) {
  const r = isPlainRoute(route);
  if (!r) return;
  clearTimeout(waitTimer);
  if (root && root.isConnected && session && session.id === r.id) return;
  const run = (tab) => {
    if (!root || !root.isConnected || !tab.contains(root)) {
      document.getElementById(ROOT_ID)?.remove();
      root = h('div', { id: ROOT_ID, class: 'lfx-pt' });
      tab.prepend(root);
    }
    document.documentElement.classList.add(ON_CLASS);
    pullToTop(root);
    load(r.id);
  };
  const tab = findHomeTab();
  if (tab) { run(tab); return; }
  let tries = 0;
  const poll = () => {
    const t = findHomeTab();
    if (t) run(t);
    else if (++tries < 30) waitTimer = setTimeout(poll, 200);
  };
  waitTimer = setTimeout(poll, 200);
}

export default {
  name: 'prime-title',
  match: (route) => isTheme('prime') && isModern() && !isTv() && api.isReady() && Boolean(isPlainRoute(route)),
  mount: (route) => start(route),
  update: (route) => start(route),
  unmount: () => stop(),
};
