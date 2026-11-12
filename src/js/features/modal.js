// LenzFlix: Netflix-Detail-Modal.
// Öffentliche API: openModal(itemOrId), closeModal(). Klicks auf Karten werden im Capture-Handler abgefangen.
// History: beim Öffnen history.pushState({...history.state, lfxModal:id}, '', location.href) – gleiche URL, kein Hash-Wechsel.
// Der react-router-Hash-Router hört nur auf popstate/hashchange (pushState löst nichts aus). Beim Zurück (popstate) bekommt er
// dieselbe URL und – weil wir idx/key/usr des vorherigen State mitkopieren – dieselbe Location; ViewManagerPage lädt nur bei
// Änderung von pathname/search neu (ViewManagerPage.tsx, Deps). Risiko damit gering (ein Re-Render ohne View-Reload).
import { h, mountPoint, unmountPoint } from '../core/dom.js';
import { isTv } from '../core/layout.js';
import { parseHash } from '../core/router.js';
import { play } from '../core/playback.js';
import { show as showCover, hide as hideCover } from '../core/startcover.js';
import { setFavorite, setPlayed, getAuth } from '../core/api.js';
import { onItemsChanged } from '../core/itemmenu.js';
import { isChooserOpen } from '../core/download.js';
import { confirmAction } from '../core/sheet.js';
import { toast } from '../core/toast.js';
import { putItems } from '../core/itemstore.js';
import { attachSwipeClose } from '../core/swipe.js';
import { clearCache } from '../core/cache.js';
import { getTheme, isTheme } from '../core/theme.js';
import { titleHref } from '../shared/routes.js';
import * as data from './modal/data.js';
import { hasResume, pickInitialSeason } from './modal/format.js';
import { TITLE_ID, buildSkeleton, buildError, buildDetail, renderEpisodes, renderCards, icon, setFavState, setLikeState, setPlayLabel, setPlayedState, setEpisodeSeen, detailHref } from './modal/render.js';

const ROOT_ID = 'lfx-modal';
const ALLOWED_TYPES = new Set(['Movie', 'Series', 'Episode', 'Season', 'BoxSet', 'Video', 'MusicVideo']);
const BLOCKED_PATHS = ['/video', '/login', '/dashboard'];
const SKIP_IN_CARD = '.cardOverlayButton, .lfx-card__action, button, [data-action="menu"], [data-action="play"], [data-action="resume"]';
const IMAGE_LINK = 'a.cardImageContainer, a.lfx-card__link';

let state = null; // offenes Modal
let clickInstalled = false;

const rootEl = () => document.documentElement;

/** Natives Jellyfin-Menü/Dialog oder LenzFlix-Download-Sheet liegt über dem Modal. */
const overlayOnTop = () => Boolean(document.querySelector('.dialogContainer')) || isChooserOpen();

function isBlockedRoute(route) {
  return BLOCKED_PATHS.some((p) => route.path === p || route.path.startsWith(`${p}/`) || (p === '/dashboard' && route.path.startsWith('/dashboard')));
}

function featureActive() {
  const cl = rootEl().classList;
  return cl.contains('lfx-js') && !cl.contains('lfx-tv') && !cl.contains('layout-tv') && !isTv();
}

// ---------------------------------------------------------------- Klick-Abfang

/** Liefert {card, id, type} wenn der Klick ein Modal öffnen soll, sonst null. */
export function findInterceptTarget(e) {
  if (e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return null;
  if (!featureActive() || isBlockedRoute(parseHash(window.location.hash))) return null;
  const t = e.target;
  if (!t || !t.closest) return null;
  if (t.closest('.dialog, .dialogContainer, [role="dialog"], .MuiPopover-root, .lfx-modal-overlay, .detailImageContainer')) return null;
  const card = t.closest('.lfx-card[data-lfx-id], .card[data-id]');
  if (!card) return null;
  if (document.querySelector('.selectionCommandsPanel, .itemSelectionPanel')) return null;
  const skip = t.closest(SKIP_IN_CARD);
  if (skip && card.contains(skip) && !skip.matches(IMAGE_LINK)) return null;
  const id = card.dataset.lfxId || card.dataset.id;
  const type = card.dataset.lfxType || card.dataset.type;
  if (!id || !ALLOWED_TYPES.has(type)) return null;
  return { card, id, type, opener: t.closest('a, button') || card };
}

function onDocumentClick(e) {
  const hit = findInterceptTarget(e);
  if (!hit) return;
  e.preventDefault();
  e.stopImmediatePropagation();
  openModal(hit.id, { opener: hit.opener });
}

// ---------------------------------------------------------------- Öffnen / Schließen

function resolveId(itemOrId) {
  return typeof itemOrId === 'string' ? itemOrId : itemOrId && itemOrId.Id;
}

export function openModal(itemOrId, opts = {}) {
  const id = resolveId(itemOrId);
  if (!id) return Promise.resolve();
  if (!featureActive()) {
    const sid = (itemOrId && itemOrId.ServerId) || getAuth().serverId || '';
    location.hash = `#/details?id=${id}${sid ? `&serverId=${sid}` : ''}`;
    return Promise.resolve();
  }
  // Designs ohne Modal (plus/prime): eigene Titelseite. Theme noch offen (null) -> Standardverhalten (Modal).
  const theme = getTheme();
  if (theme && theme !== 'flix') {
    location.hash = titleHref(id);
    return Promise.resolve();
  }
  const hint = typeof itemOrId === 'object' ? itemOrId : null;
  if (state) return loadInto(id, hint, true);
  create(opts.opener || (document.activeElement !== document.body ? document.activeElement : null));
  return loadInto(id, hint, false);
}

function create(opener) {
  const overlay = mountPoint(ROOT_ID, { className: 'lfx-modal-overlay' });
  overlay.replaceChildren();
  const closeBtn = h('button', { type: 'button', class: 'lfx-modal__close', 'aria-label': 'Schließen', title: 'Schließen', onclick: () => closeModal() }, [icon('close')]);
  const content = h('div', { class: 'lfx-modal__content' });
  const modal = h('div', { class: 'lfx-modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': TITLE_ID, tabindex: '-1' }, [closeBtn, content]);
  overlay.append(modal);
  overlay.scrollTop = 0;
  const onOverlayClick = (e) => {
    if (e.target !== overlay) return;
    if (e.target.closest && e.target.closest('.dialogContainer, .dialogBackdrop, #lfx-sheet')) return;
    if (overlayOnTop()) return;
    closeModal();
  };
  overlay.addEventListener('click', onOverlayClick);

  state = { overlay, modal, content, closeBtn, opener, token: 0, pushed: false, after: null, fallback: null, main: null, parts: null, scrollY: window.scrollY || 0, seasons: [], episodes: [], seasonId: null, selectedEpisodeId: null, onOverlayClick, unsub: null };
  state.unsub = onItemsChanged(onChanged);
  if (typeof window.matchMedia === 'function' && window.matchMedia('(max-width: 799px)').matches) {
    // Handy: Modal per Wischgeste nach unten schließen (nur am Anfang des Inhalts, nicht über Menü/Auswahl).
    state.detachSwipe = attachSwipeClose(modal, {
      backdrop: overlay,
      canStart: () => overlay.scrollTop <= 0 && !overlayOnTop(),
      holdBackdrop: true, // Hintergrund bleibt beim Wegwischen abgedunkelt, bis die Scrollposition der Seite wiederhergestellt ist
      onClose: () => closeModal(),
    });
  }
  rootEl().classList.add('lfx-modal-open');
  document.addEventListener('keydown', onKeydown, true);
  window.addEventListener('popstate', onPopState);
  window.addEventListener('hashchange', onHashChange);
  try {
    history.pushState({ ...(history.state || {}), lfxModal: true }, '', location.href);
    state.pushed = true;
  } catch { /* ohne History weiter */ }
  closeBtn.focus({ preventScroll: true });
}

function teardown() {
  if (!state) return null;
  const s = state;
  state = null;
  clearTimeout(s.fallback);
  if (typeof s.unsub === 'function') s.unsub();
  if (s.detachSwipe) s.detachSwipe();
  s.overlay.removeEventListener('click', s.onOverlayClick);
  document.removeEventListener('keydown', onKeydown, true);
  window.removeEventListener('popstate', onPopState);
  window.removeEventListener('hashchange', onHashChange);
  rootEl().classList.remove('lfx-modal-open');
  unmountPoint(s.overlay);
  const op = s.opener;
  if (op && op.isConnected && typeof op.focus === 'function' && !overlayOnTop()) op.focus({ preventScroll: true });
  return s.after;
}

/** opts.after: Callback nach dem Schließen (z. B. Navigation). */
export function closeModal(opts = {}) {
  if (!state) return;
  if (opts.after) state.after = opts.after;
  if (state.closing) return; // schon im Abbau: kein zweites history.back()
  state.closing = true;
  if (state.pushed) {
    // history.back() löst popstate aus -> onPopState schließt. Fallback, falls das Event ausbleibt.
    state.fallback = setTimeout(() => finish(), 600);
    history.back();
  } else {
    finish();
  }
}

/** Stellt die Scrollposition der Seite wieder her (Jellyfin/Router setzt sie beim history.back() ggf. zurück). */
function restoreScroll(y) {
  const fix = () => { if (Math.abs((window.scrollY || 0) - y) > 1) window.scrollTo(0, y); };
  fix();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(fix);
  setTimeout(fix, 150);
}

function finish() {
  const y = state ? state.scrollY : 0;
  const after = teardown();
  if (after) after();
  else restoreScroll(y);
}

function onPopState() {
  if (!state) return;
  const st = history.state;
  if (st && st.lfxModal) return;
  state.pushed = false;
  finish();
}

function onHashChange() {
  if (!state) return;
  state.pushed = false;
  const after = state.after;
  teardown();
  if (after) after();
}

// ---------------------------------------------------------------- Tastatur / Fokus

function focusables() {
  if (!state) return [];
  const sel = 'button:not([disabled]), a[href], input:not([disabled]), [tabindex="0"]';
  return [...state.modal.querySelectorAll(sel)].filter((el) => !el.closest('[hidden]'));
}

function onKeydown(e) {
  if (!state) return;
  if (overlayOnTop()) return;
  if (e.key === 'Escape') {
    const open = state.modal.querySelector('.lfx-modal__seasonbtn[aria-expanded="true"]');
    e.stopPropagation();
    e.preventDefault();
    if (open) { open.click(); open.focus(); } else closeModal();
    return;
  }
  if (e.key !== 'Tab') return;
  const list = focusables();
  if (!list.length) { e.preventDefault(); return; }
  const first = list[0];
  const last = list[list.length - 1];
  const active = document.activeElement;
  if (!state.modal.contains(active)) { e.preventDefault(); first.focus(); }
  else if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
}

// ---------------------------------------------------------------- Laden / Rendern

async function resolveTarget(id, hint) {
  const item = hint || data.getStoredItem(id) || (await data.loadItem(id));
  const sel = { seasonId: null, episodeId: null };
  let targetId = id;
  if (item.Type === 'Episode') {
    targetId = item.SeriesId || item.ParentId || id;
    sel.episodeId = item.Id;
    sel.seasonId = item.SeasonId || item.ParentId || null;
  } else if (item.Type === 'Season') {
    targetId = item.SeriesId || item.ParentId || id;
    sel.seasonId = item.Id;
  }
  return { targetId, sel };
}

async function loadInto(id, hint, replace, refresh = false) {
  const s = state;
  const token = ++s.token;
  const stale = () => state !== s || s.token !== token;
  if (refresh) {
    // Aktualisierung: bisherigen Inhalt stehen lassen, kein Skeleton, kein Scroll-Reset, keine History-Änderung.
  } else if (replace) {
    s.content.replaceChildren(buildSkeleton());
    s.overlay.scrollTop = 0;
    if (s.pushed) { try { history.replaceState({ ...(history.state || {}), lfxModal: true }, '', location.href); } catch { /* egal */ } }
  } else {
    s.content.replaceChildren(buildSkeleton());
  }
  let main;
  let sel;
  try {
    const r = await resolveTarget(id, hint);
    sel = refresh ? { seasonId: s.seasonId, episodeId: s.selectedEpisodeId } : r.sel;
    main = await data.loadItem(r.targetId);
    if (!main) throw new Error('Titel nicht gefunden');
  } catch (err) {
    if (stale()) return;
    if (refresh) return;
    const href = detailHref(id, null);
    s.content.replaceChildren(buildError(err && err.message ? 'Der Server hat nicht geantwortet.' : '', href, (hash) => navigate(hash)));
    return;
  }
  if (stale()) return;

  s.main = main;
  s.seasonId = sel.seasonId;
  s.selectedEpisodeId = sel.episodeId;
  const H = makeHandlers(s, token);
  const isSeries = main.Type === 'Series';
  const parts = buildDetail(main, H, { playLabel: !isSeries && hasResume(main) ? 'Fortsetzen' : 'Abspielen' });
  s.parts = parts;
  s.content.replaceChildren(parts.el);
  if (!refresh) s.overlay.scrollTop = 0;

  const tasks = [];
  if (isSeries) {
    tasks.push(loadSeriesParts(s, token, H));
    tasks.push(data.loadNextUp(main.Id).then((ep) => {
      if (!stale() && ep && hasResume(ep)) setPlayLabel(parts.playBtn, 'Fortsetzen');
    }).catch(() => {}));
  }
  if (main.Type === 'BoxSet') {
    tasks.push(data.loadCollection(main.Id).then((items) => {
      if (!stale()) renderCards(parts.extraSlot, 'Filme dieser Sammlung', items, H, items.length);
    }).catch(() => {}));
  } else {
    tasks.push(data.loadSimilar(main.Id).then((items) => {
      if (!stale()) renderCards(parts.similarSlot, 'Ähnliche Titel', items.filter((i) => i.Id !== main.Id), H);
    }).catch(() => {}));
  }
  await Promise.all(tasks);
}

async function loadSeriesParts(s, token, H) {
  const stale = () => state !== s || s.token !== token;
  try {
    s.seasons = await data.loadSeasons(s.main.Id);
    if (stale()) return;
    s.seasonId = pickInitialSeason(s.seasons, s.seasonId);
    if (!s.seasonId) return;
    await showSeason(s, token, H);
  } catch { /* Folgenliste bleibt aus */ }
}

/** Das Info-Fenster öffnet immer oben; die gewählte Folge ist nur per .is-selected markiert (kein automatisches Scrollen des Overlays). */
async function showSeason(s, token, H) {
  const episodes = await data.loadEpisodes(s.main.Id, s.seasonId);
  if (state !== s || s.token !== token) return;
  s.episodes = episodes;
  renderEpisodes(s.parts.episodesSlot, { seasons: s.seasons, seasonId: s.seasonId, episodes, selectedEpisodeId: s.selectedEpisodeId }, H);
  const row = s.parts.episodesSlot.querySelector('.lfx-modal__ep.is-selected');
  if (!row) return;
  // Interne Folgenliste (falls scrollbar) auf die Zeile setzen – ohne das Overlay zu bewegen (kein scrollIntoView).
  const list = row.parentElement;
  if (list && list.scrollHeight > list.clientHeight) {
    const lr = list.getBoundingClientRect();
    const rr = row.getBoundingClientRect();
    if (rr.top < lr.top || rr.bottom > lr.bottom) list.scrollTop = Math.max(0, rr.top - lr.top + list.scrollTop - (list.clientHeight - rr.height) / 2);
  }
}

/** Reaktion auf Bibliotheksänderungen (core/itemmenu.js). */
function onChanged({ removed = [], updated = [] } = {}) {
  const s = state;
  if (!s || !s.main) return;
  const id = s.main.Id;
  if (removed.includes(id)) { closeModal(); return; }
  const gone = removed.filter((rid) => s.episodes.some((e) => e.Id === rid));
  if (gone.length) {
    s.episodes = s.episodes.filter((e) => !gone.includes(e.Id));
    clearCache(`lfx:modal:eps:${id}:`);
    for (const rid of gone) {
      s.overlay.querySelectorAll('.lfx-modal__ep').forEach((row) => { if (row.dataset.id === rid) row.remove(); });
    }
  }
  if (updated.includes(id)) {
    for (const key of ['item', 'seasons', 'next', 'similar', 'coll']) clearCache(`lfx:modal:${key}:${id}`);
    clearCache(`lfx:modal:eps:${id}:`);
    loadInto(id, null, true, true);
  }
}

function navigate(hash) {
  closeModal({ after: () => { location.hash = hash; } });
}

async function toggleFavGeneric(item, btn) {
  item.UserData = item.UserData || {};
  const next = !item.UserData.IsFavorite;
  item.UserData.IsFavorite = next;
  setFavState(btn, next);
  try {
    await setFavorite(item.Id, next);
  } catch {
    item.UserData.IsFavorite = !next;
    setFavState(btn, !next);
  }
}

// ---------------------------------------------------------------- Gesehen-Status

const isPlayed = (it) => Boolean(it && it.UserData && it.UserData.Played === true);
const folgen = (n) => (n === 1 ? '1 Folge' : `${n} Folgen`);
const SAVE_ERROR = 'Konnte nicht gespeichert werden';

function clearPlayedCaches(itemId, seriesId) {
  clearCache(`lfx:modal:item:${itemId}`);
  if (seriesId) {
    clearCache(`lfx:modal:next:${seriesId}`);
    clearCache(`lfx:modal:eps:${seriesId}:`);
  }
}

/** Staffel-Button aus den geladenen Folgen neu berechnen (aktiv, wenn alle Folgen gesehen). */
function syncSeasonBtn(s) {
  const btn = s.parts && s.parts.episodesSlot.querySelector('.lfx-modal__round--played[data-scope="season"]');
  if (btn) setPlayedState(btn, s.episodes.length > 0 && s.episodes.every(isPlayed));
}

/** Setzt Gesehen für Serie/Staffel (rekursiv serverseitig) und zieht Folgen mit falschem Status einzeln nach. Liefert Anzahl Fehlschläge. */
async function bulkPlayed(s, targetId, next) {
  const seriesId = s.main.Id;
  await setPlayed(targetId, next);
  clearPlayedCaches(seriesId, seriesId);
  const seasonIds = targetId === seriesId ? s.seasons.map((x) => x.Id) : [targetId];
  const wrong = [];
  for (const sid of seasonIds) {
    try {
      for (const e of await data.loadEpisodes(seriesId, sid)) if (isPlayed(e) !== next) wrong.push(e);
    } catch { /* Absicherung best effort */ }
  }
  let failed = 0;
  for (let i = 0; i < wrong.length; i += 6) {
    const res = await Promise.allSettled(wrong.slice(i, i + 6).map((e) => setPlayed(e.Id, next)));
    failed += res.filter((r) => r.status === 'rejected').length;
  }
  clearPlayedCaches(seriesId, seriesId);
  return failed;
}

async function seriesEpisodeCount(s) {
  try {
    let n = 0;
    for (const se of s.seasons) n += (await data.loadEpisodes(s.main.Id, se.Id)).length;
    return n;
  } catch {
    return 0;
  }
}

function makeHandlers(s, token) {
  const main = s.main;
  const stale = () => state !== s || s.token !== token;
  // Wiedergabe-Start läuft (Doppelklick-Schutz). Erst Modal samt History-Eintrag abbauen, dann Proxy-Klick.
  let starting = false;
  // Ladebild sofort (verdeckt die Startseite, die beim Schließen kurz aufblitzt), dann Modal schließen, dann Proxy-Klick.
  const coverFor = (it) => {
    if (!it || it.Type !== 'Episode') return it;
    const hasBd = main.Type === 'Series' && (main.BackdropImageTags || []).length > 0;
    return {
      ...it,
      SeriesName: it.SeriesName || main.Name,
      SeriesId: it.SeriesId || (main.Type === 'Series' ? main.Id : undefined),
      ParentBackdropItemId: it.ParentBackdropItemId || (hasBd ? main.Id : undefined),
      ParentBackdropImageTags: it.ParentBackdropImageTags || (hasBd ? main.BackdropImageTags : undefined),
    };
  };
  const startPlayback = (target, resume) => {
    showCover({ item: coverFor(target) });
    closeModal({ after: () => { play(target, { resume }).catch(() => {}); } });
  };
  const askBulk = ({ btn, n, next, targetId, isSeries }) => {
    const verb = next ? 'gesehen' : 'ungesehen';
    confirmAction({
      title: n ? `${folgen(n)} als ${verb} markieren?` : `Alle Folgen als ${verb} markieren?`,
      confirmLabel: `Als ${verb} markieren`,
      anchorEl: btn,
      onConfirm: async () => {
        if (stale()) return;
        btn.disabled = true;
        try {
          const failed = await bulkPlayed(s, targetId, next);
          if (stale()) return;
          if (isSeries || !next) {
            main.UserData = main.UserData || {};
            main.UserData.Played = isSeries ? next : false;
            if (s.parts && s.parts.playedBtn) setPlayedState(s.parts.playedBtn, main.UserData.Played);
          }
          await showSeason(s, token, H).catch(() => {});
          if (failed) toast(SAVE_ERROR);
          else toast(isSeries ? `Serie als ${verb} markiert` : `${folgen(n)} als ${verb} markiert`);
        } catch {
          toast(SAVE_ERROR);
        } finally {
          btn.disabled = false;
        }
      },
    });
  };
  const H = {
    async togglePlayed(item, btn) {
      const prev = { ...(item.UserData || {}) };
      const next = prev.Played !== true;
      const row = btn.closest('.lfx-modal__ep');
      item.UserData = { ...prev, Played: next, PlaybackPositionTicks: 0 };
      delete item.UserData.PlayedPercentage;
      setPlayedState(btn, next);
      setEpisodeSeen(row, next);
      syncSeasonBtn(s);
      try {
        await setPlayed(item.Id, next);
      } catch {
        item.UserData = prev;
        setPlayedState(btn, !next);
        setEpisodeSeen(row, !next);
        if (!stale()) syncSeasonBtn(s);
        toast(SAVE_ERROR);
        return;
      }
      putItems([item]);
      clearPlayedCaches(item.Id, item.Type === 'Episode' ? main.Id : null);
      if (next && row) row.querySelector('.lfx-progress')?.remove();
      if (!next && item.Type === 'Episode' && main.Type === 'Series' && isPlayed(main) && !stale()) {
        main.UserData.Played = false;
        if (s.parts && s.parts.playedBtn) setPlayedState(s.parts.playedBtn, false);
      }
    },
    async toggleSeriesPlayed(btn) {
      const next = !isPlayed(main);
      const n = await seriesEpisodeCount(s);
      if (stale()) return;
      askBulk({ btn, n, next, targetId: main.Id, isSeries: true });
    },
    toggleSeasonPlayed(btn) {
      if (!s.seasonId || !s.episodes.length) return;
      askBulk({ btn, n: s.episodes.length, next: !s.episodes.every(isPlayed), targetId: s.seasonId, isSeries: false });
    },
    async play() {
      if (starting) return;
      starting = true;
      showCover({ item: main });
      let target = main;
      let resume = hasResume(main);
      try {
        if (main.Type === 'Series') {
          target = await data.loadNextUp(main.Id).catch(() => null);
          if (!target && !stale()) {
            const eps = s.seasons.length ? await data.loadEpisodes(main.Id, pickInitialSeason(s.seasons, null)).catch(() => []) : [];
            target = eps[0] || null;
          }
          resume = hasResume(target);
        }
      } catch {
        target = null;
      }
      if (!target || stale()) { starting = false; hideCover(); return; }
      startPlayback(target, resume);
    },
    toggleFav: (btn) => toggleFavGeneric(main, btn),
    toggleFavOf: (item, btn) => toggleFavGeneric(item, btn),
    async toggleLike(btn) {
      main.UserData = main.UserData || {};
      const next = main.UserData.Likes !== true;
      main.UserData.Likes = next ? true : null;
      setLikeState(btn, next);
      try {
        await data.setLike(main.Id, next);
      } catch {
        main.UserData.Likes = next ? null : true;
        setLikeState(btn, !next);
      }
    },
    openItem: (id) => loadInto(id, null, true),
    navigate,
    scrollToInfo() {
      const el = s.parts && s.parts.infoSlot;
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    async season(seasonId) {
      s.seasonId = seasonId;
      s.selectedEpisodeId = null;
      await showSeason(s, token, H).catch(() => {});
    },
    playItem(ep) {
      if (starting) return;
      starting = true;
      startPlayback(ep, hasResume(ep));
    },
  };
  return H;
}

// ---------------------------------------------------------------- Feature

function destroyAll() {
  if (state) {
    state.pushed = false;
    teardown();
  }
  if (clickInstalled) {
    document.removeEventListener('click', onDocumentClick, true);
    clickInstalled = false;
  }
}

const modalFeature = {
  name: 'modal',
  match: (route) => !isBlockedRoute(route) && !isTv() && !isTheme('live'),
  mount() {
    if (!clickInstalled) {
      document.addEventListener('click', onDocumentClick, true);
      clickInstalled = true;
    }
  },
  unmount: destroyAll,
};

export default modalFeature;
