// LenzFlix Modal: DOM-Aufbau (Skeleton, Hero, Body, Episoden, Ähnliche Titel, Info).
import { h } from '../../core/dom.js';
import * as api from '../../core/api.js';
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

export function icon(name) {
  const s = h('span', { class: 'lfx-modal__icon', 'aria-hidden': 'true' });
  s.innerHTML = ICONS[name] || '';
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
}

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
  const favBtn = roundButton('Meine Liste', 'plus', () => H.toggleFav(favBtn));
  setFavState(favBtn, Boolean(ud.IsFavorite));
  const likeBtn = roundButton('Gefällt mir', 'like', () => H.toggleLike(likeBtn));
  setLikeState(likeBtn, ud.Likes === true);

  const title = h('h2', { id: TITLE_ID, class: logo ? 'lfx-modal__title lfx-sr' : 'lfx-modal__title' }, item.Name || '');
  const hero = h('div', { class: 'lfx-modal__hero' }, [
    img ? h('img', { class: 'lfx-modal__hero-img', src: img, alt: '' }) : null,
    h('div', { class: 'lfx-modal__hero-fade' }),
    h('div', { class: 'lfx-modal__hero-content' }, [
      logo ? h('img', { class: 'lfx-modal__logo', src: logo, alt: '' }) : null,
      title,
      h('div', { class: 'lfx-modal__actions' }, [playBtn, favBtn, likeBtn]),
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
  return { el, playBtn, favBtn, likeBtn, episodesSlot, extraSlot, similarSlot, infoSlot };
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

function episodeRow(ep, selectedId, H) {
  const img = api.imageUrl(ep, { type: 'Primary', maxWidth: 400 }) || api.landscapeImage(ep, { maxWidth: 400 });
  const pct = progressPercent(ep);
  const rt = formatRuntime(ep.RunTimeTicks);
  return h('div', {
    class: `lfx-modal__ep${ep.Id === selectedId ? ' is-selected' : ''}`,
    role: 'button',
    tabindex: '0',
    'data-id': ep.Id,
    'aria-label': `Episode abspielen: ${ep.Name || ''}`,
    onclick: () => H.playItem(ep),
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); H.playItem(ep); } },
  }, [
    h('span', { class: 'lfx-modal__ep-num' }, episodeLabel(ep)),
    h('div', { class: 'lfx-modal__ep-thumb' }, [
      img ? h('img', { src: img, alt: '', loading: 'lazy' }) : null,
      h('span', { class: 'lfx-modal__ep-playicon' }, [icon('play')]),
      pct > 0 ? h('div', { class: 'lfx-progress' }, [h('div', { class: 'lfx-progress__bar', style: { width: `${pct.toFixed(1)}%` } })]) : null,
    ]),
    h('div', { class: 'lfx-modal__ep-text' }, [
      h('div', { class: 'lfx-modal__ep-head' }, [h('span', { class: 'lfx-modal__ep-title' }, ep.Name || ''), rt ? h('span', { class: 'lfx-modal__ep-rt' }, rt) : null]),
      ep.Overview ? h('p', { class: 'lfx-modal__ep-desc' }, ep.Overview) : null,
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
  const current = seasons.find((s) => s.Id === seasonId);

  const head = h('div', { class: 'lfx-modal__eps-head' }, [h('h3', { class: 'lfx-modal__h' }, 'Folgen')]);
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
    head.append(h('div', { class: 'lfx-modal__dropdown' }, [btn, list]));
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
    listEl.replaceChildren(...episodes.slice(0, shown).map((e) => episodeRow(e, selectedEpisodeId, H)));
    if (shown < episodes.length) listEl.append(moreButton(() => { shown = episodes.length; draw(); }));
  };
  draw();
}

// ---------------------------------------------------------------- Kartenraster

function card(item, H) {
  const img = api.landscapeImage(item, { maxWidth: 500 });
  const rt = formatRuntime(item.RunTimeTicks);
  const fav = h('button', {
    type: 'button', class: 'lfx-modal__round lfx-modal__round--small', 'aria-label': 'Meine Liste', title: 'Meine Liste',
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
