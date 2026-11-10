// LENZ//84: Titelseite als aufgeklappte Kassettenhülle (#/home?lfx=title&id=). Gehört Worker P2.
// Mount #lfx-retro-title als erstes Kind von #homeTab (damit der Proxy-Klick fürs Abspielen greift); native Sektionen
// verschwinden per html.lfx-retro-title-on. Daten: features/modal/data.js, Aktionen: shared/titleactions.js,
// Wiedergabe: core/playback.js. Pure Logik aus prime/title-logic.js (kein DOM, kein Prime-Feature).
import * as api from '../../core/api.js';
import { h } from '../../core/dom.js';
import { isMobile, isModern, isTv } from '../../core/layout.js';
import { isTheme } from '../../core/theme.js';
import { play } from '../../core/playback.js';
import { closePopover } from '../../core/popover.js';
import { onItemsChanged } from '../../core/itemmenu.js';
import { canDownload } from '../../core/download.js';
import { parseLfxRoute } from '../../shared/routes.js';
import { togglePlayed, toggleFavorite, startDownloadFor, openTitleMenu } from '../../shared/titleactions.js';
import { loadLocalTrailer, trailerUrl, directRemoteTrailerUrl } from '../../shared/trailer.js';
import * as data from '../modal/data.js';
import { hasResume, pickInitialSeason, peopleOf } from '../modal/format.js';
import { resolveTarget, playInfo, remainingLabel } from '../prime/title-logic.js';
import { createTapeCard } from './card.js';
import { emitFx } from './prefs.js';
import { whenHomeTab, setPageOn, scrollTop } from './title-mount.js';
import { createTyped } from './title-type.js';
import { buildFront, buildEpisode, backdropUrl, episodeCode, tapeName, metaList } from './title-dom.js';
import { openTrailer, closeTrailer } from './title-trailer.js';

const ROOT_ID = 'lfx-retro-title';
const ON_CLASS = 'lfx-retro-title-on';

let state = null; // { g, id, root, cleanups, cancelWait }
let gen = 0;

const routeId = (route) => {
  const r = parseLfxRoute(route);
  return r.kind === 'title' ? r.id : null;
};

const stalenessOf = (g) => () => !state || state.g !== g;

function dispose() {
  gen += 1;
  const s = state;
  state = null;
  closeTrailer();
  try { closePopover(); } catch { /* egal */ }
  if (s) {
    if (s.cancelWait) s.cancelWait();
    for (const fn of s.cleanups.splice(0)) {
      try { fn && fn(); } catch (e) { console.error('[LenzFlix] retro-title cleanup', e); }
    }
    if (s.root) s.root.remove();
  }
  document.getElementById(ROOT_ID)?.remove();
  setPageOn(ON_CLASS, false);
}

function errorBox(message) {
  return h('div', { class: 'lfx-rt__error lfx-retro-frame', role: 'alert' }, [
    h('h1', { class: 'lfx-rt__errtitle' }, 'FEHLER 404: KASSETTE NICHT GEFUNDEN'),
    h('p', null, message || 'BITTE SPÄTER ERNEUT VERSUCHEN.'),
    h('a', { class: 'lfx-retro-btn', href: '#/home' }, 'Zur Startseite'),
  ]);
}

/** Kleiner Terminal-Button. Toggle-Zustand per is-on + aria-pressed. */
function btn(mod, label, onClick) {
  const b = h('button', { type: 'button', class: `lfx-retro-btn lfx-rt__btn lfx-rt__btn--${mod}` }, label);
  b.addEventListener('click', (e) => {
    e.preventDefault();
    emitFx('click');
    onClick(b);
  });
  return b;
}

function setToggle(b, on, labelOn, labelOff) {
  b.classList.toggle('is-on', on);
  b.setAttribute('aria-pressed', String(on));
  b.textContent = on ? labelOn : labelOff;
}

function specRow(label, value) {
  if (!value) return null;
  return h('div', { class: 'lfx-rt__spec' }, [h('dt', null, label), h('dd', null, value)]);
}

function buildSpecs(main) {
  const streams = (main.MediaSources && main.MediaSources[0] && main.MediaSources[0].MediaStreams) || [];
  const langs = (type) => [...new Set(streams.filter((x) => x.Type === type).map((x) => x.DisplayLanguage || x.Language).filter(Boolean))];
  const rows = [
    specRow('STUDIO', (main.Studios || []).map((x) => x.Name).filter(Boolean).slice(0, 3).join(', ')),
    specRow('TON', langs('Audio').slice(0, 4).join(', ')),
    specRow('UNTERTITEL', langs('Subtitle').slice(0, 5).join(', ')),
  ].filter(Boolean);
  return rows.length ? h('dl', { class: 'lfx-rt__specs' }, rows) : null;
}

function buildCast(main) {
  const actors = peopleOf(main, 'Actor').map((p) => p.Name).slice(0, 6);
  const dirs = peopleOf(main, 'Director').map((p) => p.Name).slice(0, 2);
  if (!actors.length && !dirs.length) return null;
  return h('dl', { class: 'lfx-rt__cast' }, [
    dirs.length ? h('div', { class: 'lfx-rt__spec' }, [h('dt', null, 'REGIE'), h('dd', null, dirs.join(', '))]) : null,
    actors.length ? h('div', { class: 'lfx-rt__spec' }, [h('dt', null, 'MIT'), h('dd', null, actors.join(', '))]) : null,
  ]);
}

async function load(g) {
  const stale = stalenessOf(g);
  const s = state;
  const root = s.root;
  let sel;
  let main;
  try {
    const first = data.getStoredItem(s.id) || (await data.loadItem(s.id));
    if (!first) throw new Error('Titel nicht gefunden');
    const r = resolveTarget(first, s.id);
    sel = r.sel;
    // Der Speicher kann Teil-Items enthalten: immer vollständig (gecacht) laden
    main = await data.loadItem(r.targetId);
    if (stale()) return;
    if (!main) throw new Error('Titel nicht gefunden');
  } catch (e) {
    if (stale()) return;
    emitFx('error');
    root.replaceChildren(errorBox(e && e.message ? 'DER SERVER HAT NICHT GEANTWORTET.' : ''));
    root.classList.add('is-error');
    root.classList.remove('is-loading');
    return;
  }
  if (stale()) return;

  const isSeries = main.Type === 'Series';
  const isBox = main.Type === 'BoxSet';
  const c = { main, seasons: [], seasonId: sel.seasonId, selectedEp: sel.episodeId, nextUp: null, trailerSrc: null, episodes: [] };

  // ---- Hintergrund: Backdrop abgedunkelt (Duotone per CSS), Scanlines, Vignette
  const bg = backdropUrl(main);
  const backdrop = h('div', { class: 'lfx-rt__bg', 'aria-hidden': 'true' }, [
    bg ? h('img', { class: 'lfx-rt__bg-img', src: bg, alt: '', decoding: 'async' }) : null,
    h('div', { class: 'lfx-rt__bg-tint' }),
    h('div', { class: 'lfx-rt__bg-scan' }),
    h('div', { class: 'lfx-rt__bg-vig' }),
  ]);

  // ---- Rückseite: Logo/Titel, Streifen, Meta, Text, Besetzung, Aktionen
  const logoUrl = api.logoImage(main, { maxWidth: 720 });
  const brand = h('h1', { class: `lfx-rt__brand${logoUrl ? ' has-logo' : ''}` });
  const textTitle = () => { brand.classList.remove('has-logo'); brand.replaceChildren(h('span', { class: 'lfx-rt__chrome', 'data-text': main.Name || '' }, main.Name || '')); };
  if (logoUrl) {
    brand.append(h('img', { class: 'lfx-rt__logo', src: logoUrl, alt: main.Name || '', onerror: textTitle }));
  } else {
    textTitle();
  }

  const tagline = (main.Taglines && main.Taglines[0]) || (isSeries ? 'SERIE' : isBox ? 'SAMMLUNG' : (main.Genres && main.Genres[0]) || 'FILM');
  const stripes = h('div', { class: 'lfx-rt__stripes', 'aria-hidden': 'true' }, [h('span', { class: 'lfx-rt__stripes-text' }, String(tagline).toUpperCase())]);
  const meta = h('ul', { class: 'lfx-rt__meta', 'aria-label': 'Eckdaten' }, metaList(main).map((m) => h('li', null, m)));
  const typed = main.Overview ? createTyped(main.Overview, 'lfx-rt__text') : null;
  const cast = buildCast(main);

  const progress = h('div', { class: 'lfx-rt__progress', hidden: true });
  const playBtn = btn('play', 'Abspielen', async () => {
    let t = playInfo(main, c.nextUp);
    let item = t.target;
    if (isSeries && item === main) {
      try {
        const sid = c.seasons.length ? pickInitialSeason(c.seasons, null) : null;
        const eps = sid ? await data.loadEpisodes(main.Id, sid) : [];
        item = eps[0] || null;
      } catch { item = null; }
      if (stale()) return;
      t = { ...t, resume: false };
    }
    if (item) await play(item, { resume: Boolean(t.resume) });
  });
  playBtn.classList.add('lfx-rt__btn--primary');
  const restartBtn = btn('restart', 'Neu starten', async () => {
    const info = playInfo(main, c.nextUp);
    if (info.target) await play(info.target, { resume: false });
  });
  restartBtn.hidden = true;

  const paintPlay = () => {
    const info = playInfo(main, c.nextUp);
    const ep = isSeries ? c.nextUp : null;
    const code = ep ? episodeCode(ep) : '';
    playBtn.textContent = info.resume ? `Fortsetzen${code ? ` ${code}` : ''}` : `Abspielen${code ? ` ${code}` : ''}`;
    restartBtn.hidden = !info.resume;
    progress.replaceChildren();
    progress.hidden = !(info.progress > 0);
    if (info.progress > 0) {
      const left = remainingLabel(info.target);
      const pct = String(Math.round(info.progress * 10) / 10);
      const bar = h('span', { class: 'lfx-rt__tapebar', role: 'presentation' }, [h('span', { class: 'lfx-rt__tapebar-fill' })]);
      bar.firstChild.style.width = `${pct}%`;
      progress.append(bar, h('span', { class: 'lfx-rt__tapeleft' }, left || `${Math.round(info.progress)} %`));
    }
  };

  const trailerBtn = btn('trailer', 'Trailer', (b) => { if (c.trailerSrc) openTrailer(c.trailerSrc, b); });
  trailerBtn.hidden = true;
  const favBtn = btn('fav', 'Meine Liste', async (b) => {
    b.disabled = true;
    const on = await toggleFavorite(main);
    b.disabled = false;
    if (!stale()) setToggle(b, on, 'Auf der Liste', 'Meine Liste');
  });
  setToggle(favBtn, Boolean(main.UserData && main.UserData.IsFavorite), 'Auf der Liste', 'Meine Liste');
  const seenBtn = btn('seen', 'Gesehen', async (b) => {
    b.disabled = true;
    const on = await togglePlayed(main, { anchorEl: b });
    b.disabled = false;
    if (stale()) return;
    setToggle(b, on, 'Gesehen', 'Als gesehen');
    if (isSeries) showSeason();
  });
  setToggle(seenBtn, Boolean(main.UserData && main.UserData.Played), 'Gesehen', 'Als gesehen');
  const dlBtn = btn('dl', isSeries ? 'Folgen laden' : 'Herunterladen', (b) => { startDownloadFor(main, { anchorEl: b }); });
  dlBtn.hidden = true;
  const moreBtn = btn('more', 'Mehr', (b) => { openTitleMenu(main, b); });
  moreBtn.setAttribute('aria-haspopup', 'menu');

  const actions = h('div', { class: 'lfx-rt__actions', role: 'group', 'aria-label': 'Aktionen' }, [playBtn, restartBtn, trailerBtn, favBtn, seenBtn, dlBtn, moreBtn]);

  const back = h('div', { class: 'lfx-rt__back' }, [
    h('div', { class: 'lfx-rt__sheet' }, [
      brand, stripes, meta,
      typed ? typed.el : null,
      cast, buildSpecs(main), progress, actions,
    ]),
  ]);
  const kase = h('div', { class: 'lfx-rt__case', role: 'region', 'aria-label': main.Name || 'Titel' }, [buildFront(main), back]);

  // ---- Folgen (Serie) bzw. Inhalt (Sammlung) und Regal mit ähnlichen Titeln
  const content = h('div', { class: 'lfx-rt__content' }, [kase]);
  const epList = h('ul', { class: 'lfx-rt__eps' });
  const tabs = h('div', { class: 'lfx-rt__tabs', role: 'tablist', 'aria-label': 'Staffeln' });
  if (isSeries) {
    content.append(h('section', { class: 'lfx-rt__tapes', 'aria-label': 'Folgen' }, [h('h2', { class: 'lfx-retro-label' }, 'Bänder'), tabs, epList]));
  }
  const shelfRow = h('div', { class: `lfx-rt__shelf-row${isBox || isMobile() ? ' is-wrap' : ''}`, role: 'list' });
  const shelf = h('section', { class: 'lfx-rt__shelf', 'aria-label': isBox ? 'Inhalt' : 'Ähnliche Titel', hidden: true }, [
    h('h2', { class: 'lfx-retro-label' }, isBox ? 'Inhalt' : 'Ähnliche Titel'), shelfRow,
  ]);
  content.append(shelf);

  root.classList.remove('is-loading');
  root.replaceChildren(backdrop, content);
  paintPlay();
  emitFx('open');
  if (typed) {
    // Tippen beginnt, wenn die Hülle aufgeklappt ist
    const t = setTimeout(() => typed.start(), isMobile() ? 200 : 420);
    s.cleanups.push(() => { clearTimeout(t); typed.stop(); });
  }

  const playEpisode = (ep) => play(ep, { resume: hasResume(ep) });

  async function showSeason() {
    const sid = c.seasonId;
    if (!sid) return;
    let eps;
    try {
      eps = await data.loadEpisodes(main.Id, sid);
    } catch {
      if (!stale() && c.seasonId === sid) epList.replaceChildren(h('li', { class: 'lfx-rt__empty' }, 'FOLGEN KONNTEN NICHT GELADEN WERDEN.'));
      return;
    }
    if (stale() || c.seasonId !== sid) return;
    c.episodes = eps;
    const nextId = c.nextUp ? c.nextUp.Id : null;
    epList.replaceChildren(...eps.map((e) => buildEpisode(e, { selected: e.Id === c.selectedEp, next: e.Id === nextId, onPlay: playEpisode })));
    if (!eps.length) epList.append(h('li', { class: 'lfx-rt__empty' }, 'KEINE FOLGEN VORHANDEN.'));
  }

  function paintTabs() {
    tabs.replaceChildren();
    c.seasons.forEach((x, i) => {
      const on = x.Id === c.seasonId;
      const b = h('button', {
        type: 'button', role: 'tab', class: `lfx-rt__tab${on ? ' is-active' : ''}`, 'aria-selected': String(on),
        tabindex: on ? '0' : '-1', dataset: { id: x.Id }, title: x.Name || '',
      }, tapeName(x, i));
      b.addEventListener('click', () => {
        if (x.Id === c.seasonId) return;
        emitFx('click');
        c.seasonId = x.Id;
        c.selectedEp = null;
        paintTabs();
        showSeason();
      });
      tabs.append(b);
    });
    tabs.hidden = c.seasons.length < 2;
  }
  const onTabKey = (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    const list = [...tabs.querySelectorAll('.lfx-rt__tab')];
    const cur = list.findIndex((b) => b.classList.contains('is-active'));
    if (cur < 0) return;
    e.preventDefault();
    const next = list[(cur + (e.key === 'ArrowRight' ? 1 : list.length - 1)) % list.length];
    next.click();
    const again = tabs.querySelector('.lfx-rt__tab.is-active');
    if (again) again.focus();
  };
  tabs.addEventListener('keydown', onTabKey);
  s.cleanups.push(() => tabs.removeEventListener('keydown', onTabKey));

  const tasks = [];
  if (isSeries) {
    tasks.push(data.loadNextUp(main.Id).then((ep) => {
      if (stale()) return;
      c.nextUp = ep;
      paintPlay();
    }).catch(() => {}));
    tasks.push(data.loadSeasons(main.Id).then(async (list) => {
      if (stale()) return;
      c.seasons = list;
      c.seasonId = pickInitialSeason(list, c.seasonId);
      paintTabs();
      await showSeason();
      if (stale()) return;
      const hit = epList.querySelector('.lfx-rt__ep.is-selected');
      if (hit && hit.scrollIntoView) {
        try { hit.scrollIntoView({ block: 'center', behavior: 'auto' }); } catch { /* egal */ }
      }
    }).catch(() => {}));
  }

  const fillShelf = (items) => {
    if (stale() || !items.length) return;
    const variant = isBox || isMobile() ? 'cover' : 'spine';
    shelfRow.replaceChildren(...items.map((it) => createTapeCard(it, { variant })));
    shelf.hidden = false;
  };
  if (isBox) tasks.push(data.loadCollection(main.Id).then(fillShelf).catch(() => {}));
  else tasks.push(data.loadSimilar(main.Id).then((l) => fillShelf(l.filter((i) => i.Id !== main.Id))).catch(() => {}));

  // Trailer + Download verspätet einblenden
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
    const root = h('div', { id: ROOT_ID, class: 'lfx-retro-page lfx-rt is-loading', 'aria-busy': 'true' }, [
      h('div', { class: 'lfx-rt__boot lfx-retro-caret' }, 'LADE KASSETTE'),
    ]);
    s.root = root;
    tab.prepend(root);
    setPageOn(ON_CLASS, true);
    if (!keepScroll) scrollTop();
    load(g).then(() => { if (state === s) root.removeAttribute('aria-busy'); }).catch((e) => console.error('[LenzFlix] retro-title', e));
  });
}

export default {
  name: 'retro-title',
  match: (route) => isTheme('retro') && isModern() && !isTv() && api.isReady() && routeId(route) != null,
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
