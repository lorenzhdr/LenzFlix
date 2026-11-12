// LenzFlix Modal: DOM-Aufbau (Skeleton, Hero, Body, Episoden, Ähnliche Titel, Info).
import { h } from '../../core/dom.js';
import * as api from '../../core/api.js';
import { putItems } from '../../core/itemstore.js';
import { ICON_MORE, ICON_DOWNLOAD, ICON_LIKE, ICON_LIKE_OUTLINE, ICON_EYE, ICON_EYE_CHECK } from '../../core/icons.js';
import { canDownload, startDownload } from '../../core/download.js';
import { openItemMenu } from '../../core/itemmenu.js';
import { formatRuntime, metaParts, peopleOf, progressPercent, ratingText, episodeLabel } from './format.js';

export const TITLE_ID = 'lfx-modal-title';
export const EPISODES_INITIAL = 10;
export const CARDS_INITIAL = 6;

const ICONS = {
  play: '<svg viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M6 4l15 8-15 8z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M11 4h2v7h7v2h-7v7h-2v-7H4v-2h7z"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>',
  like: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M2 21h4V9H2zm20-11a2 2 0 00-2-2h-6.3l1-4.6v-.3a1.5 1.5 0 00-.4-1L13.2 1 7.6 6.6A2 2 0 007 8v11a2 2 0 002 2h9a2 2 0 001.8-1.2l3-7a2 2 0 00.2-.8z"/></svg>',
  close: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M18.3 5.7L12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3l6.3 6.3 6.3-6.3z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M7.4 8.6L12 13.2l4.6-4.6L18 10l-6 6-6-6z"/></svg>',
};

/** name = Schlüssel aus ICONS oder fertiges SVG-Markup (core/icons.js). */
export function icon(name) {
  const s = h('span', { class: 'lfx-modal__icon', 'aria-hidden': 'true' });
  s.innerHTML = name.startsWith('<svg') ? name : ICONS[name] || '';
  return s;
}

function badge(text, extra = '') {
  return text ? h('span', { class: `lfx-modal__badge ${extra}`.trim() }, text) : null;
}

export function heroImage(item) {
  return api.imageUrl(item, { type: 'Backdrop', maxWidth: 1280 }) || api.landscapeImage(item, { maxWidth: 1280 });
}

export function detailHref(id, serverId) {
  return `#/details?id=${id}&serverId=${serverId || api.getAuth().serverId || ''}`;
}

export function buildSkeleton() {
  const line = (w) => h('div', { class: 'lfx-skel lfx-skel--line', style: w ? { width: w } : null });
  return h('div', { class: 'lfx-modal__skeleton', 'aria-busy': 'true' }, [
    h('div', { class: 'lfx-modal__hero lfx-skel' }),
    h('div', { class: 'lfx-modal__body' }, [
      h('div', {}, [line('40%'), line(), line(), line('70%')]),
      h('div', {}, [line(), line()]),
    ]),
  ]);
}

export function buildError(message, href, onNavigate) {
  return h('div', { class: 'lfx-modal__error', role: 'alert' }, [
    h('h2', { id: TITLE_ID, class: 'lfx-modal__error-title' }, 'Titel konnte nicht geladen werden'),
    h('p', {}, message || 'Bitte später erneut versuchen.'),
    h('a', { class: 'lfx-modal__link', href, onclick: (e) => { e.preventDefault(); onNavigate(href); } }, 'Zur Detailseite'),
  ]);
}

function roundButton(label, iconName, onclick, extra = '') {
  return h('button', { type: 'button', class: `lfx-modal__round ${extra}`.trim(), 'aria-label': label, title: label, onclick }, [icon(iconName)]);
}

export function setFavState(btn, on) {
  btn.classList.toggle('is-on', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.replaceChildren(icon(on ? 'check' : 'plus'));
}
export function setLikeState(btn, on) {
  btn.classList.toggle('is-on', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.replaceChildren(icon(on ? ICON_LIKE : ICON_LIKE_OUTLINE));
}

const PLAYED_LABELS = {
  item: ['Als gesehen markieren', 'Als ungesehen markieren'],
  series: ['Ganze Serie als gesehen markieren', 'Ganze Serie als ungesehen markieren'],
  season: ['Staffel als gesehen markieren', 'Staffel als ungesehen markieren'],
};

/** Gesehen-Button: Zustand, Icon und Beschriftung (scope: item | series | season, steht in data-scope). */
export function setPlayedState(btn, on) {
  const labels = PLAYED_LABELS[btn.dataset.scope] || PLAYED_LABELS.item;
  const label = on ? labels[1] : labels[0];
  btn.classList.toggle('is-on', on);
  btn.setAttribute('aria-pressed', String(on));
  btn.setAttribute('aria-label', label);
  btn.setAttribute('title', label);
  btn.replaceChildren(icon(on ? ICON_EYE_CHECK : ICON_EYE));
}

/** Eckiger Gesehen-Button. opts: {small, scope, on, onclick}. */
export function playedButton(item, { small = false, scope = null, on = null, onclick = null } = {}) {
  const sc = scope || (item.Type === 'Series' ? 'series' : 'item');
  const btn = roundButton(PLAYED_LABELS[sc][0], ICON_EYE, onclick, `${small ? 'lfx-modal__round--small ' : ''}lfx-modal__round--played`);
  btn.dataset.scope = sc;
  setPlayedState(btn, on === null ? Boolean(item.UserData && item.UserData.Played === true) : on);
  return btn;
}

/** Folgenzeile als gesehen/ungesehen darstellen (Klasse, Haken im Thumb). */
export function setEpisodeSeen(row, on) {
  if (!row) return;
  row.classList.toggle('is-played', on);
  const thumb = row.querySelector('.lfx-modal__ep-thumb');
  if (!thumb) return;
  const mark = thumb.querySelector('.lfx-modal__ep-seen');
  if (on && !mark) thumb.append(seenMark());
  if (!on && mark) mark.remove();
}

function seenMark() {
  const m = h('span', { class: 'lfx-modal__ep-seen', 'aria-hidden': 'true' });
  m.innerHTML = '<svg viewBox="0 0 24 24" width="12" height="12"><path fill="currentColor" d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/></svg>';
  return m;
}

const isFolderType = (item) => item.Type === 'Series' || item.Type === 'Season';

/** Download-Button (startet hidden; sichtbar, sobald canDownload true liefert und der Button noch im DOM hängt). */
function downloadButton(item, small = false, label = null) {
  const text = label || (isFolderType(item) ? 'Episoden herunterladen' : 'Herunterladen');
  const btn = roundButton(text, ICON_DOWNLOAD, (e) => { e.stopPropagation(); startDownload(item, btn); }, `${small ? 'lfx-modal__round--small ' : ''}lfx-modal__round--dl`);
  btn.hidden = true;
  Promise.resolve(canDownload(item)).then((ok) => { if (ok && btn.isConnected) btn.hidden = false; }).catch(() => {});
  return btn;
}

function menuButton(item, small = false, label = 'Mehr', opts = null) {
  const btn = roundButton(label, ICON_MORE, (e) => { e.stopPropagation(); (opts ? openItemMenu(item, btn, opts) : openItemMenu(item, btn)); }, `${small ? 'lfx-modal__round--small ' : ''}lfx-modal__round--menu`);
  btn.setAttribute('aria-haspopup', 'menu');
  return btn;
}

const stopKeys = (btn) => { btn.addEventListener('keydown', (e) => e.stopPropagation()); return btn; };

export function setPlayLabel(btn, label) {
  const t = btn.querySelector('.lfx-modal__play-text');
  if (t) t.textContent = label;
}

/**
 * Baut Hero + Body für das angezeigte Item (Film oder Serie).
 * H = Handler {play, toggleFav, toggleLike, toggleFavOf, openItem, navigate, scrollToInfo, season, playItem}
 */
export function buildDetail(item, H, { playLabel = 'Abspielen' } = {}) {
  const ud = item.UserData || {};
  const logo = api.logoImage(item, { maxWidth: 500 });
  const img = heroImage(item);

  const playBtn = h('button', { type: 'button', class: 'lfx-modal__play', onclick: () => H.play() }, [
    icon('play'),
    h('span', { class: 'lfx-modal__play-text' }, playLabel),
  ]);
  const favBtn = roundButton('Meine Liste', 'plus', () => H.toggleFav(favBtn), 'lfx-modal__round--fav');
  setFavState(favBtn, Boolean(ud.IsFavorite));
  const likeBtn = roundButton('Gefällt mir', ICON_LIKE_OUTLINE, () => H.toggleLike(likeBtn), 'lfx-modal__round--like');
  setLikeState(likeBtn, ud.Likes === true);
  const dlBtn = downloadButton(item);
  const menuBtn = menuButton(item);
  const playedBtn = item.Type === 'BoxSet' || item.Type === 'Season'
    ? null
    : playedButton(item, { onclick: () => (item.Type === 'Series' ? H.toggleSeriesPlayed(playedBtn) : H.togglePlayed(item, playedBtn)) });

  const title = h('h2', { id: TITLE_ID, class: logo ? 'lfx-modal__title lfx-sr' : 'lfx-modal__title' }, item.Name || '');
  const hero = h('div', { class: 'lfx-modal__hero' }, [
    img ? h('img', { class: 'lfx-modal__hero-img', src: img, alt: '' }) : null,
    h('div', { class: 'lfx-modal__hero-fade' }),
    h('div', { class: 'lfx-modal__hero-content' }, [
      logo ? h('img', { class: 'lfx-modal__logo', src: logo, alt: '' }) : null,
      title,
      h('div', { class: 'lfx-modal__actions' }, [playBtn, favBtn, likeBtn, dlBtn, menuBtn, playedBtn]),
    ]),
  ]);

  const m = metaParts(item);
  const meta = h('div', { class: 'lfx-modal__meta' }, [
    m.year ? h('span', { class: 'lfx-modal__year' }, m.year) : null,
    m.length ? h('span', { class: 'lfx-modal__length' }, m.length) : null,
    badge(m.quality),
    badge(m.rating),
  ]);
  const tagline = (item.Taglines || [])[0];
  const left = h('div', { class: 'lfx-modal__main' }, [
    meta,
    tagline ? h('p', { class: 'lfx-modal__tagline' }, tagline) : null,
    item.Overview ? h('p', { class: 'lfx-modal__overview' }, item.Overview) : null,
  ]);

  const cast = peopleOf(item, 'Actor');
  const side = h('div', { class: 'lfx-modal__side' });
  if (cast.length) {
    const line = h('p', {}, [h('span', { class: 'lfx-modal__label' }, 'Besetzung: '), h('span', { class: 'lfx-modal__value' }, cast.slice(0, 3).map((p) => p.Name).join(', '))]);
    if (cast.length > 3) {
      line.append(', ', h('a', { class: 'lfx-modal__more-link', href: '#', onclick: (e) => { e.preventDefault(); H.scrollToInfo(); } }, 'mehr'));
    }
    side.append(line);
  }
  const genres = (item.Genres || []).join(', ');
  if (genres) side.append(h('p', {}, [h('span', { class: 'lfx-modal__label' }, 'Genres: '), h('span', { class: 'lfx-modal__value' }, genres)]));
  const studios = (item.Studios || []).map((s) => s.Name).filter(Boolean).join(', ');
  if (studios) side.append(h('p', {}, [h('span', { class: 'lfx-modal__label' }, 'Studio: '), h('span', { class: 'lfx-modal__value' }, studios)]));

  const body = h('div', { class: 'lfx-modal__body' }, [left, side]);

  const episodesSlot = h('section', { class: 'lfx-modal__section lfx-modal__episodes', hidden: true });
  const extraSlot = h('section', { class: 'lfx-modal__section', hidden: true });
  const similarSlot = h('section', { class: 'lfx-modal__section', hidden: true });
  const infoSlot = buildInfo(item, H);
  const href = detailHref(item.Id, item.ServerId);
  const footer = h('div', { class: 'lfx-modal__footer' }, [
    h('a', { class: 'lfx-modal__link', href, onclick: (e) => { e.preventDefault(); H.navigate(href); } }, 'Zur Detailseite'),
  ]);

  const el = h('div', { class: 'lfx-modal__detail' }, [hero, body, episodesSlot, extraSlot, similarSlot, infoSlot, footer]);
  return { el, playBtn, favBtn, likeBtn, dlBtn, menuBtn, playedBtn, episodesSlot, extraSlot, similarSlot, infoSlot };
}

function personLinks(people, H) {
  const span = h('span', { class: 'lfx-modal__value' });
  people.forEach((p, i) => {
    if (i) span.append(', ');
    const href = detailHref(p.Id, null);
    span.append(h('a', { class: 'lfx-modal__person', href, onclick: (e) => { e.preventDefault(); H.navigate(href); } }, p.Name));
  });
  return span;
}

function infoRow(label, valueNode) {
  return h('p', { class: 'lfx-modal__inforow' }, [h('span', { class: 'lfx-modal__label' }, `${label}: `), valueNode]);
}

export function buildInfo(item, H) {
  const sec = h('section', { class: 'lfx-modal__section lfx-modal__info' }, [
    h('h3', { class: 'lfx-modal__h' }, ['Info zu ', h('strong', {}, item.Name || '')]),
  ]);
  const dirs = peopleOf(item, 'Director');
  if (dirs.length) sec.append(infoRow('Regie', personLinks(dirs, H)));
  const cast = peopleOf(item, 'Actor');
  if (cast.length) sec.append(infoRow('Besetzung', personLinks(cast, H)));
  const writers = peopleOf(item, 'Writer');
  if (writers.length) sec.append(infoRow('Drehbuch', personLinks(writers, H)));
  if ((item.Genres || []).length) sec.append(infoRow('Genres', h('span', { class: 'lfx-modal__value' }, item.Genres.join(', '))));
  if (item.OfficialRating) {
    sec.append(infoRow('Altersfreigabe', h('span', { class: 'lfx-modal__value' }, [badge(item.OfficialRating), ' ', ratingText(item.OfficialRating)])));
  }
  const studios = (item.Studios || []).map((s) => s.Name).filter(Boolean);
  if (studios.length) sec.append(infoRow('Studio', h('span', { class: 'lfx-modal__value' }, studios.join(', '))));
  return sec;
}

// ---------------------------------------------------------------- Episoden

function episodeRow(ep, selectedId, H, siblings) {
  const img = api.imageUrl(ep, { type: 'Primary', maxWidth: 400 }) || api.landscapeImage(ep, { maxWidth: 400 });
  const pct = progressPercent(ep);
  const rt = formatRuntime(ep.RunTimeTicks);
  const seen = Boolean(ep.UserData && ep.UserData.Played === true);
  const playedBtn = playedButton(ep, { small: true, scope: 'item', onclick: (e) => { e.stopPropagation(); H.togglePlayed(ep, playedBtn); } });
  return h('div', {
    class: `lfx-modal__ep${ep.Id === selectedId ? ' is-selected' : ''}${seen ? ' is-played' : ''}`,
    role: 'button',
    tabindex: '0',
    'data-id': ep.Id,
    'data-lfx-id': ep.Id,
    'data-lfx-type': 'Episode',
    'aria-label': `Episode abspielen: ${ep.Name || ''}`,
    onclick: () => H.playItem(ep),
    onkeydown: (e) => { if (e.target !== e.currentTarget) return; if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); H.playItem(ep); } },
  }, [
    h('span', { class: 'lfx-modal__ep-num' }, episodeLabel(ep)),
    h('div', { class: 'lfx-modal__ep-thumb' }, [
      img ? h('img', { src: img, alt: '', loading: 'lazy' }) : null,
      h('span', { class: 'lfx-modal__ep-playicon' }, [icon('play')]),
      pct > 0 && !seen ? h('div', { class: 'lfx-progress' }, [h('div', { class: 'lfx-progress__bar', style: { width: `${pct.toFixed(1)}%` } })]) : null,
      seen ? seenMark() : null,
    ]),
    h('div', { class: 'lfx-modal__ep-text' }, [
      h('div', { class: 'lfx-modal__ep-head' }, [h('span', { class: 'lfx-modal__ep-title', 'data-num': ep.IndexNumber != null ? `${ep.IndexNumber}.` : null }, ep.Name || ''), rt ? h('span', { class: 'lfx-modal__ep-rt' }, rt) : null]),
      ep.Overview ? h('p', { class: 'lfx-modal__ep-desc' }, ep.Overview) : null,
    ]),
    h('div', { class: 'lfx-modal__epactions' }, [
      stopKeys(playedBtn),
      stopKeys(downloadButton(ep, true, `Herunterladen: ${ep.Name || 'Episode'}`)),
      stopKeys(menuButton(ep, true, `Mehr zu ${ep.Name || 'Episode'}`, { siblings })),
    ]),
  ]);
}

function moreButton(onclick) {
  return h('div', { class: 'lfx-modal__more' }, [
    h('button', { type: 'button', class: 'lfx-modal__more-btn', 'aria-label': 'Mehr anzeigen', title: 'Mehr anzeigen', onclick }, [icon('chevron')]),
  ]);
}

/** Füllt den Folgen-Abschnitt. state: {seasons, seasonId, episodes, selectedEpisodeId}. */
export function renderEpisodes(slot, state, H) {
  slot.hidden = false;
  slot.replaceChildren();
  const { seasons, seasonId, episodes, selectedEpisodeId } = state;
  putItems(episodes);
  const current = seasons.find((s) => s.Id === seasonId);

  const head = h('div', { class: 'lfx-modal__eps-head' }, [h('h3', { class: 'lfx-modal__h' }, 'Folgen')]);
  const tools = h('div', { class: 'lfx-modal__eps-tools' });
  head.append(tools);
  if (seasonId && episodes.length) {
    const seasonBtn = playedButton({}, {
      scope: 'season',
      on: episodes.every((e) => e.UserData && e.UserData.Played === true),
      onclick: () => H.toggleSeasonPlayed(seasonBtn),
    });
    tools.append(seasonBtn);
  }
  if (seasons.length > 1) {
    const list = h('ul', { class: 'lfx-modal__seasonlist', role: 'listbox', hidden: true });
    const btn = h('button', {
      type: 'button', class: 'lfx-modal__seasonbtn', 'aria-haspopup': 'listbox', 'aria-expanded': 'false',
      onclick: () => toggle(list.hidden),
    }, [h('span', {}, (current && current.Name) || 'Staffel'), icon('chevron')]);
    const toggle = (open) => { list.hidden = !open; btn.setAttribute('aria-expanded', String(open)); };
    for (const s of seasons) {
      list.append(h('li', { role: 'presentation' }, [h('button', {
        type: 'button', role: 'option', class: 'lfx-modal__seasonopt', 'aria-selected': String(s.Id === seasonId), 'data-id': s.Id,
        onclick: () => { toggle(false); if (s.Id !== seasonId) H.season(s.Id); },
      }, s.Name || `Staffel ${s.IndexNumber}`)]));
    }
    tools.append(h('div', { class: 'lfx-modal__dropdown' }, [btn, list]));
    if (tools.querySelector('.lfx-modal__round--played')) tools.classList.add('lfx-modal__eps-tools--joined');
  }
  slot.append(head);

  const listEl = h('div', { class: 'lfx-modal__eplist' });
  slot.append(listEl);
  if (!episodes.length) {
    listEl.append(h('p', { class: 'lfx-modal__empty' }, 'Keine Folgen verfügbar.'));
    return;
  }
  const selIdx = episodes.findIndex((e) => e.Id === selectedEpisodeId);
  let shown = Math.max(EPISODES_INITIAL, selIdx + 1);
  const draw = () => {
    listEl.replaceChildren(...episodes.slice(0, shown).map((e) => episodeRow(e, selectedEpisodeId, H, episodes)));
    if (shown < episodes.length) listEl.append(moreButton(() => { shown = episodes.length; draw(); }));
  };
  draw();
}

// ---------------------------------------------------------------- Kartenraster

function card(item, H) {
  const img = api.landscapeImage(item, { maxWidth: 500 });
  const rt = formatRuntime(item.RunTimeTicks);
  const fav = h('button', {
    type: 'button', class: 'lfx-modal__round lfx-modal__round--small lfx-modal__round--fav', 'aria-label': 'Meine Liste', title: 'Meine Liste',
    onclick: (e) => { e.stopPropagation(); H.toggleFavOf(item, fav); },
  });
  setFavState(fav, Boolean(item.UserData && item.UserData.IsFavorite));
  const open = () => H.openItem(item.Id);
  return h('div', {
    class: 'lfx-modal__card', role: 'button', tabindex: '0', 'data-id': item.Id, 'aria-label': item.Name || '',
    onclick: open,
    onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) { e.preventDefault(); open(); } },
  }, [
    h('div', { class: 'lfx-modal__card-img' }, [
      img ? h('img', { src: img, alt: '', loading: 'lazy' }) : h('span', { class: 'lfx-modal__card-name' }, item.Name || ''),
      rt ? h('span', { class: 'lfx-modal__card-rt' }, rt) : null,
    ]),
    h('div', { class: 'lfx-modal__card-body' }, [
      h('div', { class: 'lfx-modal__card-meta' }, [
        h('div', {}, [badge(item.OfficialRating), item.ProductionYear ? h('span', { class: 'lfx-modal__year' }, String(item.ProductionYear)) : null]),
        fav,
      ]),
      item.Overview ? h('p', { class: 'lfx-modal__card-desc' }, item.Overview) : null,
    ]),
  ]);
}

/** Abschnitt mit Kartenraster (Ähnliche Titel / Sammlung). */
export function renderCards(slot, title, items, H, initial = CARDS_INITIAL) {
  slot.replaceChildren();
  if (!items.length) { slot.hidden = true; return; }
  slot.hidden = false;
  slot.append(h('h3', { class: 'lfx-modal__h' }, title));
  const grid = h('div', { class: 'lfx-modal__grid' });
  slot.append(grid);
  let shown = initial;
  const draw = () => {
    grid.replaceChildren(...items.slice(0, shown).map((it) => card(it, H)));
    slot.querySelector('.lfx-modal__more')?.remove();
    if (shown < items.length) slot.append(moreButton(() => { shown = items.length; draw(); }));
  };
  draw();
}
