// LENZ+: Titel-Vollseite (#/home?lfx=title&id=). Mount in #homeTab (eigener Container #lfx-plus-title),
// Daten über features/modal/data.js, Aktionen über shared/titleactions.js, Wiedergabe über core/playback.js.
import * as api from '../../core/api.js';
import { h, mountPoint, unmountPoint } from '../../core/dom.js';
import { isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { play } from '../../core/playback.js';
import { openPopover, closePopover } from '../../core/popover.js';
import { onItemsChanged } from '../../core/itemmenu.js';
import { canDownload } from '../../core/download.js';
import { toast } from '../../core/toast.js';
import { ICON_DOWNLOAD, ICON_MORE, ICON_EYE, ICON_EYE_CHECK } from '../../core/icons.js';
import { parseLfxRoute } from '../../shared/routes.js';
import { togglePlayed, toggleFavorite, startDownloadFor, openTitleMenu } from '../../shared/titleactions.js';
import { loadLocalTrailer, trailerUrl, directRemoteTrailerUrl } from '../../shared/trailer.js';
import * as data from '../modal/data.js';
import { hasResume, pickInitialSeason, progressPercent, formatRuntime, ratingText, peopleOf } from '../modal/format.js';
import { landscapeFor } from '../rows/card.js';
import { whenHomeTab, setPageOn, scrollTop } from './title-mount.js';
import { metaLine, gridCard, episodeCode } from './title-cards.js';

const ROOT_ID = 'lfx-plus-title';
const TRAILER_ID = 'lfx-plus-trailer';
const ON_CLASS = 'lfx-plus-title-on';
const TICKS_PER_MIN = 600_000_000;

const svg = (path) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" focusable="false">${path}</svg>`;
const ICON_PLAY = svg('<path d="M7 4.5v15l12-7.5z"/>');
const ICON_PLUS = svg('<path d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z"/>');
const ICON_CHECK = svg('<path d="M9.2 16.6 4.9 12.3l1.4-1.4 2.9 2.9 8.5-8.5 1.4 1.4z"/>');
const ICON_TRAILER = svg('<path d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v10h14V7zm4 1.5 6 3.5-6 3.5z"/>');
const ICON_CHEVRON = svg('<path d="M7.4 8.6 12 13.2l4.6-4.6L18 10l-6 6-6-6z"/>');
const ICON_CLOSE = svg('<path d="M6.4 5 12 10.6 17.6 5 19 6.4 13.4 12 19 17.6 17.6 19 12 13.4 6.4 19 5 17.6 10.6 12 5 6.4z"/>');

let state = null; // { g, id, root, cleanups, cancelWait }
let gen = 0;

const routeId = (route) => {
  const r = parseLfxRoute(route);
  return r.kind === 'title' ? r.id : null;
};

const stalenessOf = (g) => () => !state || state.g !== g;

// ---------------------------------------------------------------- Aufräumen

function closeTrailer() {
  const el = document.getElementById(TRAILER_ID);
  if (!el) return;
  const v = el.querySelector('video');
  if (v) {
    try {
      v.pause();
      v.removeAttribute('src');
      if (v.load) v.load();
    } catch { /* jsdom */ }
  }
  if (typeof el.__lfxCleanup === 'function') el.__lfxCleanup();
  unmountPoint(el);
}

function dispose() {
  gen += 1;
  const s = state;
  state = null;
  closeTrailer();
  try { closePopover(); } catch { /* egal */ }
  if (s) {
    if (s.cancelWait) s.cancelWait();
    for (const fn of s.cleanups.splice(0)) {
      try { fn && fn(); } catch (e) { console.error('[LenzFlix] plus-title cleanup', e); }
    }
    if (s.root) s.root.remove();
  }
  document.getElementById(ROOT_ID)?.remove();
  setPageOn(ON_CLASS, false);
}

// ---------------------------------------------------------------- Kleinteile

function circle(mod, label, icon, onClick) {
  const b = h('button', { type: 'button', class: `lfx-plus-circle lfx-plus-circle--${mod}`, 'aria-label': label, title: label });
  const ico = h('span', { class: 'lfx-plus-circle__ico', 'aria-hidden': 'true' });
  ico.innerHTML = icon;
  b.append(ico);
  b.addEventListener('click', (e) => {
    e.preventDefault();
    onClick(b);
  });
  return b;
}

function setIcon(btn, icon) {
  const ico = btn.querySelector('.lfx-plus-circle__ico');
  if (ico) ico.innerHTML = icon;
}

function setLabel(btn, label) {
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

const remainingText = (it) => {
  const total = Number(it && it.RunTimeTicks) || 0;
  const pos = Number(it && it.UserData && it.UserData.PlaybackPositionTicks) || 0;
  const left = Math.round((total - pos) / TICKS_PER_MIN);
  return total && pos && left > 0 ? `Noch ${left} Min.` : '';
};

function backdropUrl(item) {
  return api.imageUrl(item, { type: 'Backdrop', maxWidth: 1920, quality: 80 }) || api.landscapeImage(item, { maxWidth: 1920, quality: 80 });
}

function errorBox(message) {
  return h('div', { class: 'lfx-plus-title__error', role: 'alert' }, [
    h('h1', { class: 'lfx-plus-title__errtitle' }, 'Titel konnte nicht geladen werden'),
    h('p', null, message || 'Bitte später erneut versuchen.'),
    h('a', { class: 'lfx-plus-pill', href: '#/home' }, 'Zur Startseite'),
  ]);
}

// ---------------------------------------------------------------- Trailer

function openTrailer(src, returnFocus) {
  closeTrailer();
  const overlay = mountPoint(TRAILER_ID, { className: 'lfx-plus-trailer' });
  overlay.replaceChildren();
  const video = h('video', { class: 'lfx-plus-trailer__video', controls: true, autoplay: true, playsinline: true });
  const close = () => {
    closeTrailer();
    if (returnFocus && returnFocus.isConnected && returnFocus.focus) {
      try { returnFocus.focus({ preventScroll: true }); } catch { /* egal */ }
    }
  };
  const closeBtn = h('button', { type: 'button', class: 'lfx-plus-trailer__close', 'aria-label': 'Trailer schließen', title: 'Schließen', onclick: close });
  const ico = h('span', { 'aria-hidden': 'true' });
  ico.innerHTML = ICON_CLOSE;
  closeBtn.append(ico);
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Trailer');
  overlay.append(video, closeBtn);
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.preventDefault();
    e.stopPropagation();
    close();
  };
  const onBackdrop = (e) => { if (e.target === overlay) close(); };
  window.addEventListener('keydown', onKey, true);
  overlay.addEventListener('click', onBackdrop);
  overlay.__lfxCleanup = () => {
    window.removeEventListener('keydown', onKey, true);
    overlay.removeEventListener('click', onBackdrop);
  };
  video.addEventListener('error', () => {
    toast('Trailer konnte nicht abgespielt werden');
    close();
  });
  video.addEventListener('ended', close);
  video.src = src;
  try {
    const p = video.play && video.play();
    if (p && p.catch) p.catch(() => {});
  } catch { /* Autoplay-Sperre: Bedienelemente bleiben */ }
  closeBtn.focus();
}

// ---------------------------------------------------------------- Aufbau

/** id -> { target: Id des anzuzeigenden Titels, seasonId, episodeId } (Episode/Staffel -> Serie). */
async function resolveTarget(id) {
  const first = data.getStoredItem(id) || (await data.loadItem(id));
  if (!first) throw new Error('Titel nicht gefunden');
  const sel = { target: id, seasonId: null, episodeId: null };
  if (first.Type === 'Episode') {
    sel.target = first.SeriesId || first.ParentId || id;
    sel.episodeId = first.Id;
    sel.seasonId = first.SeasonId || first.ParentId || null;
  } else if (first.Type === 'Season') {
    sel.target = first.SeriesId || first.ParentId || id;
    sel.seasonId = first.Id;
  }
  return sel;
}

function buildDetails(main) {
  const rows = [];
  const add = (label, value) => {
    if (!value) return;
    rows.push(h('div', { class: 'lfx-plus-details__row' }, [h('dt', null, label), h('dd', null, value)]));
  };
  const runtime = main.Type === 'Series' ? '' : formatRuntime(main.RunTimeTicks);
  add('Laufzeit', runtime);
  if (main.Type === 'Series' && main.ChildCount) add('Staffeln', String(main.ChildCount));
  add('Erscheinungsjahr', main.ProductionYear ? String(main.ProductionYear) : '');
  add('Altersfreigabe', ratingText(main.OfficialRating));
  add('Genres', (main.Genres || []).join(', '));
  add('Studio', (main.Studios || []).map((s) => s.Name).filter(Boolean).slice(0, 4).join(', '));
  add('Regie', peopleOf(main, 'Director').map((p) => p.Name).slice(0, 4).join(', '));
  add('Besetzung', peopleOf(main, 'Actor').map((p) => p.Name).slice(0, 12).join(', '));
  const streams = (main.MediaSources && main.MediaSources[0] && main.MediaSources[0].MediaStreams) || [];
  const langs = (type) => [...new Set(streams.filter((s) => s.Type === type).map((s) => s.DisplayLanguage || s.Language).filter(Boolean))];
  add('Audio', langs('Audio').join(', '));
  add('Untertitel', langs('Subtitle').join(', '));
  const left = h('div', { class: 'lfx-plus-details__main' }, [
    h('h2', { class: 'lfx-plus-details__title' }, main.Name || ''),
    main.Taglines && main.Taglines[0] ? h('p', { class: 'lfx-plus-details__tagline' }, main.Taglines[0]) : null,
    main.Overview ? h('p', { class: 'lfx-plus-details__text' }, main.Overview) : null,
  ]);
  return h('div', { class: 'lfx-plus-details' }, [left, h('dl', { class: 'lfx-plus-details__list' }, rows)]);
}

function episodeCard(ep, selected, onPlay) {
  const img = (api.imageUrl(ep, { type: 'Primary', maxWidth: 640, quality: 85 }) || (landscapeFor(ep, 640) || {}).url) || null;
  const p = progressPercent(ep);
  const played = ep.UserData && ep.UserData.Played === true;
  const mins = formatRuntime(ep.RunTimeTicks);
  const media = h('span', { class: 'lfx-plus-ep__media' }, [
    img ? h('img', { class: 'lfx-plus-ep__img', src: img, alt: '', loading: 'lazy', decoding: 'async' }) : null,
    played ? h('span', { class: 'lfx-plus-ep__seen', 'aria-label': 'Gesehen', title: 'Gesehen' }) : null,
    p > 0 ? h('span', { class: 'lfx-plus-progress lfx-plus-ep__progress' }, [h('span', { class: 'lfx-plus-progress__bar', style: { width: `${Math.round(p * 10) / 10}%` } })]) : null,
  ]);
  const num = ep.IndexNumber != null ? `${ep.IndexNumber}. ` : '';
  const btn = h('button', {
    type: 'button',
    class: `lfx-plus-ep${selected ? ' is-selected' : ''}`,
    dataset: { id: ep.Id },
    'aria-label': `${num}${ep.Name || ''} abspielen`,
    onclick: () => onPlay(ep),
  }, [
    media,
    h('span', { class: 'lfx-plus-ep__title' }, `${num}${ep.Name || ''}`),
    mins ? h('span', { class: 'lfx-plus-ep__dur' }, mins) : null,
    ep.Overview ? h('span', { class: 'lfx-plus-ep__text' }, ep.Overview) : null,
  ]);
  return btn;
}

async function load(g) {
  const stale = stalenessOf(g);
  const s = state;
  const root = s.root;
  let sel;
  let main;
  try {
    sel = await resolveTarget(s.id);
    if (stale()) return;
    main = await data.loadItem(sel.target);
    if (!main) throw new Error('Titel nicht gefunden');
  } catch (e) {
    if (stale()) return;
    root.replaceChildren(errorBox(e && e.message ? 'Der Server hat nicht geantwortet.' : ''));
    root.classList.add('is-error');
    return;
  }
  if (stale()) return;

  const isSeries = main.Type === 'Series';
  const isBox = main.Type === 'BoxSet';
  const c = { main, seasons: [], seasonId: sel.seasonId, selectedEp: sel.episodeId, focusEp: null, nextUp: null, trailerSrc: null };

  // ---- Hintergrund
  const bg = backdropUrl(main);
  const backdrop = h('div', { class: 'lfx-plus-title__backdrop', 'aria-hidden': 'true' }, [
    bg ? h('img', { class: 'lfx-plus-title__bgimg', src: bg, alt: '', decoding: 'async' }) : null,
    h('div', { class: 'lfx-plus-title__shade' }),
    h('div', { class: 'lfx-plus-title__dim' }),
  ]);

  // ---- Kopf
  const logo = api.logoImage(main, { maxWidth: 720 });
  const name = h('h1', { class: `lfx-plus-title__name${logo ? ' has-logo' : ''}` }, logo
    ? [h('img', { class: 'lfx-plus-title__logo', src: logo, alt: main.Name || '' })]
    : main.Name || '');
  const progressSlot = h('div', { class: 'lfx-plus-title__progress', hidden: true });
  const playLabel = h('span', { class: 'lfx-plus-pill__label' }, 'Abspielen');
  const playIco = h('span', { class: 'lfx-plus-pill__ico', 'aria-hidden': 'true' });
  playIco.innerHTML = ICON_PLAY;
  const playBtn = h('button', { type: 'button', class: 'lfx-plus-pill lfx-plus-pill--primary' }, [playIco, playLabel]);

  const code = episodeCode;
  const target = () => {
    if (!isSeries) return { item: main, resume: hasResume(main), label: hasResume(main) ? 'Fortsetzen' : 'Abspielen' };
    const ep = c.focusEp || c.nextUp;
    if (!ep) return { item: null, resume: false, label: 'Abspielen' };
    const cd = code(ep);
    const resume = hasResume(ep);
    if (resume) return { item: ep, resume, label: cd ? `${cd} fortsetzen` : 'Fortsetzen' };
    return { item: ep, resume, label: c.focusEp && cd ? `${cd} abspielen` : 'Abspielen' };
  };
  const paintPlay = () => {
    playLabel.textContent = target().label;
    const it = isSeries ? c.focusEp || c.nextUp : main;
    const p = it ? progressPercent(it) : 0;
    progressSlot.replaceChildren();
    progressSlot.hidden = !(p > 0);
    if (p > 0) {
      const left = remainingText(it);
      if (isSeries) {
        const cd = code(it);
        progressSlot.append(h('div', { class: 'lfx-plus-title__eptitle' }, [cd, it.Name].filter(Boolean).join(' ')));
      }
      progressSlot.append(h('div', { class: 'lfx-plus-title__progressrow' }, [
        h('span', { class: 'lfx-plus-progress' }, [h('span', { class: 'lfx-plus-progress__bar', style: { width: `${Math.round(p * 10) / 10}%` } })]),
        left ? h('span', { class: 'lfx-plus-title__left' }, left) : null,
      ]));
    }
  };
  playBtn.addEventListener('click', async () => {
    let t = target();
    if (isSeries && !t.item) {
      try {
        const eps = c.seasons.length ? await data.loadEpisodes(main.Id, pickInitialSeason(c.seasons, null)) : [];
        t = { item: eps[0] || null, resume: false };
      } catch { t = { item: null }; }
      if (stale()) return;
    }
    if (t.item) await play(t.item, { resume: Boolean(t.resume) });
  });

  // ---- Rundknöpfe
  const circles = [];
  const favBtn = circle('fav', 'Zu Meine Liste hinzufügen', ICON_PLUS, async () => {
    favBtn.disabled = true;
    const on = await toggleFavorite(main);
    favBtn.disabled = false;
    if (!stale()) paintFav(on);
  });
  const paintFav = (on) => {
    setIcon(favBtn, on ? ICON_CHECK : ICON_PLUS);
    setLabel(favBtn, on ? 'Aus Meine Liste entfernen' : 'Zu Meine Liste hinzufügen');
    favBtn.classList.toggle('is-on', on);
    favBtn.setAttribute('aria-pressed', String(on));
  };
  paintFav(Boolean(main.UserData && main.UserData.IsFavorite));
  circles.push(favBtn);

  const trailerBtn = circle('trailer', 'Trailer ansehen', ICON_TRAILER, (b) => { if (c.trailerSrc) openTrailer(c.trailerSrc, b); });
  trailerBtn.hidden = true;
  circles.push(trailerBtn);

  const dlBtn = circle('dl', isSeries ? 'Episoden herunterladen' : 'Herunterladen', ICON_DOWNLOAD, (b) => { startDownloadFor(main, { anchorEl: b }); });
  dlBtn.hidden = true;
  circles.push(dlBtn);

  const seenBtn = circle('seen', 'Als gesehen markieren', ICON_EYE, async (b) => {
    b.disabled = true;
    const on = await togglePlayed(main, { anchorEl: b });
    b.disabled = false;
    if (stale()) return;
    paintSeen(on);
    if (isSeries) refreshEpisodes();
  });
  const paintSeen = (on) => {
    setIcon(seenBtn, on ? ICON_EYE_CHECK : ICON_EYE);
    setLabel(seenBtn, on ? 'Als ungesehen markieren' : 'Als gesehen markieren');
    seenBtn.classList.toggle('is-on', on);
    seenBtn.setAttribute('aria-pressed', String(on));
  };
  paintSeen(Boolean(main.UserData && main.UserData.Played));
  circles.push(seenBtn);

  const moreBtn = circle('more', 'Mehr', ICON_MORE, (b) => { openTitleMenu(main, b); });
  moreBtn.setAttribute('aria-haspopup', 'menu');
  circles.push(moreBtn);

  const hero = h('section', { class: 'lfx-plus-title__hero', 'aria-label': main.Name || 'Titel' }, [
    name,
    metaLine(main, { genres: 3 }),
    main.Overview ? h('p', { class: 'lfx-plus-title__overview' }, main.Overview) : null,
    progressSlot,
    h('div', { class: 'lfx-plus-title__buttons' }, [playBtn, ...circles]),
  ]);

  // ---- Tabs
  const panels = [];
  const addTab = (id, label, panel) => panels.push({ id, label, panel });
  const episodesBody = h('div', { class: 'lfx-plus-grid lfx-plus-grid--eps', role: 'list' });
  const seasonBar = h('div', { class: 'lfx-plus-title__seasonbar' });
  if (isSeries) addTab('eps', 'Folgen', h('div', { class: 'lfx-plus-panel' }, [seasonBar, episodesBody]));
  const listBody = h('div', { class: 'lfx-plus-grid lfx-plus-grid--cards', role: 'list' });
  if (isBox) addTab('items', 'Titel', h('div', { class: 'lfx-plus-panel' }, [listBody]));
  else addTab('similar', 'Empfehlungen', h('div', { class: 'lfx-plus-panel' }, [listBody]));
  addTab('details', 'Details', h('div', { class: 'lfx-plus-panel' }, [buildDetails(main)]));

  const tablist = h('div', { class: 'lfx-plus-title__tabs', role: 'tablist', 'aria-label': 'Bereiche' });
  const panelWrap = h('div', { class: 'lfx-plus-title__panels' });
  const tabBtns = new Map();
  const select = (id) => {
    for (const t of panels) {
      const on = t.id === id;
      tabBtns.get(t.id).classList.toggle('is-active', on);
      tabBtns.get(t.id).setAttribute('aria-selected', String(on));
      tabBtns.get(t.id).tabIndex = on ? 0 : -1;
      t.panel.hidden = !on;
    }
  };
  for (const t of panels) {
    const b = h('button', { type: 'button', class: 'lfx-plus-title__tab', role: 'tab', id: `lfx-plus-tab-${t.id}`, onclick: () => select(t.id) }, t.label);
    t.panel.setAttribute('role', 'tabpanel');
    t.panel.setAttribute('aria-labelledby', `lfx-plus-tab-${t.id}`);
    tabBtns.set(t.id, b);
    tablist.append(b);
    panelWrap.append(t.panel);
  }
  tablist.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const ids = panels.map((t) => t.id);
    const cur = ids.findIndex((i) => tabBtns.get(i).classList.contains('is-active'));
    const next = ids[(cur + (e.key === 'ArrowRight' ? 1 : ids.length - 1)) % ids.length];
    select(next);
    tabBtns.get(next).focus();
  });
  select(panels[0].id);

  const footer = h('footer', { class: 'lfx-plus-title__footer' });
  root.classList.remove('is-loading');
  root.replaceChildren(backdrop, h('div', { class: 'lfx-plus-title__content' }, [hero, tablist, panelWrap, footer]));
  paintPlay();

  // Abdunkeln des Hintergrunds beim Scrollen
  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const vh = window.innerHeight || 800;
      const v = Math.max(0, Math.min(1, (window.scrollY || document.documentElement.scrollTop || 0) / (vh * 0.55)));
      root.style.setProperty('--lfx-plus-dim', String(Math.round(v * 100) / 100));
      tablist.classList.toggle('is-stuck', tablist.getBoundingClientRect().top <= 67);
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  s.cleanups.push(() => {
    window.removeEventListener('scroll', onScroll);
    if (raf) cancelAnimationFrame(raf);
  });

  // ---- Folgen
  const playEpisode = (ep) => play(ep, { resume: hasResume(ep) });

  async function showSeason() {
    const sid = c.seasonId;
    if (!sid) return;
    let eps;
    try {
      eps = await data.loadEpisodes(main.Id, sid);
    } catch {
      if (!stale() && c.seasonId === sid) episodesBody.replaceChildren(h('p', { class: 'lfx-plus-empty' }, 'Folgen konnten nicht geladen werden.'));
      return;
    }
    if (stale() || c.seasonId !== sid) return;
    c.episodes = eps;
    if (c.selectedEp && !c.focusEp) {
      const hit = eps.find((e) => e.Id === c.selectedEp);
      if (hit) { c.focusEp = hit; paintPlay(); }
    }
    episodesBody.replaceChildren(...eps.map((e) => {
      const card = episodeCard(e, e.Id === c.selectedEp, playEpisode);
      card.setAttribute('role', 'listitem');
      return card;
    }));
    if (!eps.length) episodesBody.append(h('p', { class: 'lfx-plus-empty' }, 'Keine Folgen vorhanden.'));
  }
  const refreshEpisodes = () => { showSeason(); };

  function paintSeasonBar() {
    seasonBar.replaceChildren();
    const cur = c.seasons.find((x) => x.Id === c.seasonId);
    if (!cur) return;
    if (c.seasons.length < 2) {
      seasonBar.append(h('span', { class: 'lfx-plus-season lfx-plus-season--static' }, cur.Name || 'Staffel 1'));
      return;
    }
    const label = h('span', null, cur.Name || 'Staffel');
    const ico = h('span', { class: 'lfx-plus-season__chev', 'aria-hidden': 'true' });
    ico.innerHTML = ICON_CHEVRON;
    const btn = h('button', { type: 'button', class: 'lfx-plus-season', 'aria-haspopup': 'menu' }, [label, ico]);
    btn.addEventListener('click', () => {
      openPopover(btn, {
        label: 'Staffel wählen',
        align: 'start',
        className: 'lfx-plus-season-menu',
        items: c.seasons.map((x) => ({
          key: x.Id,
          label: x.Name || 'Staffel',
          className: x.Id === c.seasonId ? 'is-active' : '',
          onClick: () => {
            closePopover();
            if (x.Id === c.seasonId) return;
            c.seasonId = x.Id;
            c.selectedEp = null;
            paintSeasonBar();
            showSeason();
          },
        })),
      });
    });
    seasonBar.append(btn);
  }

  const tasks = [];
  if (isSeries) {
    tasks.push(data.loadSeasons(main.Id).then(async (list) => {
      if (stale()) return;
      c.seasons = list;
      c.seasonId = pickInitialSeason(list, c.seasonId);
      paintSeasonBar();
      if (sel.episodeId) select('eps');
      await showSeason();
    }).catch(() => {}));
    tasks.push(data.loadNextUp(main.Id).then((ep) => {
      if (stale()) return;
      c.nextUp = ep;
      paintPlay();
    }).catch(() => {}));
  }
  const fillCards = (items, emptyText) => {
    if (stale()) return;
    if (!items.length) {
      listBody.replaceChildren(h('p', { class: 'lfx-plus-empty' }, emptyText));
      return;
    }
    listBody.replaceChildren(...items.map((it) => gridCard(it)));
  };
  if (isBox) tasks.push(data.loadCollection(main.Id).then((l) => fillCards(l, 'Diese Sammlung ist leer.')).catch(() => fillCards([], 'Titel konnten nicht geladen werden.')));
  else tasks.push(data.loadSimilar(main.Id).then((l) => fillCards(l.filter((i) => i.Id !== main.Id), 'Keine Empfehlungen verfügbar.')).catch(() => fillCards([], 'Keine Empfehlungen verfügbar.')));

  // Trailer + Download (verspätet einblenden)
  (async () => {
    let src;
    try {
      const t = await loadLocalTrailer(main);
      src = t ? trailerUrl(t.Id) : directRemoteTrailerUrl(main);
    } catch {
      src = directRemoteTrailerUrl(main);
    }
    if (stale() || !src) return;
    c.trailerSrc = src;
    trailerBtn.hidden = false;
  })();
  Promise.resolve(canDownload(main)).then((ok) => {
    if (!stale() && ok) dlBtn.hidden = false;
  }, () => {});

  // Bibliothek geändert (Löschen/Bearbeiten über das Titelmenü)
  s.cleanups.push(onItemsChanged(({ removed = [], updated = [] } = {}) => {
    if (stale()) return;
    if (removed.includes(main.Id) || removed.includes(s.id)) {
      location.hash = '#/home';
    } else if (updated.includes(main.Id)) {
      begin(s.id, { keepScroll: true });
    }
  }));

  await Promise.all(tasks);
}

function begin(id, { keepScroll = false } = {}) {
  dispose();
  const g = gen;
  state = { g, id, root: null, cleanups: [], cancelWait: null };
  const s = state;
  s.cancelWait = whenHomeTab((tab) => {
    if (state !== s) return;
    const root = h('div', { id: ROOT_ID, class: 'lfx-plus-page lfx-plus-title is-loading', 'aria-busy': 'true' }, [
      h('div', { class: 'lfx-plus-title__skeleton' }),
    ]);
    s.root = root;
    tab.prepend(root);
    setPageOn(ON_CLASS, true);
    if (!keepScroll) scrollTop();
    load(g).then(() => { if (state === s) root.removeAttribute('aria-busy'); }).catch((e) => console.error('[LenzFlix] plus-title', e));
  });
}

export default {
  name: 'plus-title',
  match: (route) => isTheme('plus') && isModern() && !isTv() && api.isReady() && routeId(route) != null,
  mount(route) {
    const id = routeId(route);
    if (id) begin(id);
  },
  update(route) {
    const id = routeId(route);
    if (!id) return;
    if (state && state.id === id && state.root && state.root.isConnected) return;
    begin(id);
  },
  unmount: dispose,
};
