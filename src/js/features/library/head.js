// LenzFlix library: Unterkopf der Serien-/Filme-Seite (Desktop): Titel, Genres-Dropdown, Zeilen/Raster, Sortierung.
import { h } from '../../core/dom.js';
import { libraryHref } from '../../shared/routes.js';
import { createGenresMenu } from './genres.js';

const SORTS = [
  ['az', 'A–Z'],
  ['za', 'Z–A'],
  ['new', 'Neu hinzugefügt'],
  ['year', 'Erscheinungsjahr'],
];
const KIND_LABEL = { series: 'Serien', movies: 'Filme' };
const ICON_ROWS = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>';
const ICON_GRID = '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z" fill="currentColor"/></svg>';

function iconLink(cls, label, svg) {
  const a = h('a', { class: `lfx-lib__view ${cls}`, 'aria-label': label, title: label });
  a.innerHTML = svg;
  return a;
}

/** Rückgabe: {el, update({kind, genre, view, sort}), setGenres(list), setCount(n), setStuck(bool), destroy()}. */
export function createHead() {
  let state = { kind: 'series', genre: null, view: null, sort: null };
  let genres = [];
  const menu = createGenresMenu();
  const title = h('h1', { class: 'lfx-lib__title' });
  const rowsLink = iconLink('lfx-lib__view--rows', 'Zeilenansicht', ICON_ROWS);
  const gridLink = iconLink('lfx-lib__view--grid', 'Rasteransicht', ICON_GRID);
  const select = h('select', { class: 'lfx-lib__sort', 'aria-label': 'Sortierung' },
    SORTS.map(([v, t]) => h('option', { value: v }, t)));
  const count = h('span', { class: 'lfx-lib__count', 'aria-live': 'polite' });
  const tools = h('div', { class: 'lfx-lib__tools' }, [count, select]);
  const views = h('div', { class: 'lfx-lib__views', role: 'group', 'aria-label': 'Ansicht' }, [rowsLink, gridLink]);
  const el = h('div', { class: 'lfx-lib__head' }, [
    h('div', { class: 'lfx-lib__lead' }, [title, menu.el]),
    h('div', { class: 'lfx-lib__right' }, [tools, views]),
  ]);

  const onSort = () => {
    window.location.hash = libraryHref(state.kind, { genre: state.genre, view: 'grid', sort: select.value });
  };
  select.addEventListener('change', onSort);

  function paint() {
    const { kind, genre, view, sort } = state;
    const label = KIND_LABEL[kind] || KIND_LABEL.movies;
    title.replaceChildren();
    if (genre) {
      const name = (genres.find((g) => g.id === genre) || {}).name || '…';
      title.append(
        h('a', { class: 'lfx-lib__crumb', href: libraryHref(kind) }, label),
        h('span', { class: 'lfx-lib__sep', 'aria-hidden': 'true' }, '›'),
        h('span', { class: 'lfx-lib__current', 'aria-current': 'page' }, name),
      );
    } else {
      title.append(h('span', { class: 'lfx-lib__current' }, label));
    }
    const grid = view === 'grid';
    rowsLink.href = libraryHref(kind, { genre });
    gridLink.href = libraryHref(kind, { genre, view: 'grid', sort });
    // Links: aktuelle Ansicht per aria-current (aria-pressed ist für <a> ungültig)
    for (const [a, on] of [[rowsLink, !grid], [gridLink, grid]]) {
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    }
    rowsLink.classList.toggle('is-active', !grid);
    gridLink.classList.toggle('is-active', grid);
    tools.hidden = !grid;
    select.value = sort || 'az';
    menu.setData({ kind, genre, genres });
  }

  return {
    el,
    update(next) {
      const changedView = state.kind !== next.kind || state.genre !== next.genre || state.view !== next.view;
      state = { kind: next.kind, genre: next.genre || null, view: next.view || null, sort: next.sort || null };
      if (changedView) count.textContent = '';
      menu.close();
      paint();
    },
    setGenres(list) {
      genres = list || [];
      paint();
    },
    setCount(n) {
      count.textContent = typeof n === 'number' ? `${n} Titel` : '';
    },
    setStuck(on) { el.classList.toggle('is-stuck', Boolean(on)); },
    destroy() {
      select.removeEventListener('change', onSort);
      menu.destroy();
      el.remove();
    },
  };
}
