// LenzFlix library: „Genres ▾“-Dropdown der Serien-/Filme-Seite (Desktop). Mehrspaltig, per Tastatur bedienbar.
import { h } from '../../core/dom.js';
import { libraryHref } from '../../shared/routes.js';

/** Rückgabe: {el, setData({kind, genre, genres}), close(), destroy()}. */
export function createGenresMenu() {
  let kind = 'series';
  let genre = null;
  let genres = [];
  let open = false;

  const btn = h('button', {
    type: 'button', class: 'lfx-lib__genres-btn', 'aria-haspopup': 'true', 'aria-expanded': 'false',
  }, [h('span', {}, 'Genres'), h('span', { class: 'lfx-lib__caret', 'aria-hidden': 'true' }, '▾')]);
  const panel = h('div', { class: 'lfx-lib__genres-panel', role: 'menu', 'aria-label': 'Genres', hidden: true });
  const el = h('div', { class: 'lfx-lib__genres' }, [btn, panel]);

  const links = () => [...panel.querySelectorAll('a')];

  function paint() {
    panel.replaceChildren(...genres.map((g) => h('a', {
      class: `lfx-lib__genre${g.id === genre ? ' is-current' : ''}`,
      role: 'menuitem',
      href: libraryHref(kind, { genre: g.id }),
      'aria-current': g.id === genre ? 'true' : null,
      tabindex: '-1',
    }, g.name)));
    btn.disabled = !genres.length;
  }

  function onDocDown(e) {
    if (!el.contains(e.target)) close();
  }

  function setOpen(on, focusFirst) {
    if (on === open) return;
    if (on && !genres.length) return;
    open = on;
    panel.hidden = !on;
    btn.setAttribute('aria-expanded', String(on));
    el.classList.toggle('is-open', on);
    if (on) {
      document.addEventListener('pointerdown', onDocDown, true);
      if (focusFirst) {
        const all = links();
        (all.find((a) => a.classList.contains('is-current')) || all[0] || btn).focus();
      }
    } else {
      document.removeEventListener('pointerdown', onDocDown, true);
    }
  }
  function close() { setOpen(false); }

  btn.addEventListener('click', () => setOpen(!open, true));
  btn.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true, true); }
  });
  panel.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('a')) close();
  });
  el.addEventListener('keydown', (e) => {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
      btn.focus();
      return;
    }
    const all = links();
    if (!all.length) return;
    const i = all.indexOf(document.activeElement);
    let next = null;
    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = all[(i + 1) % all.length];
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = all[(i <= 0 ? all.length : i) - 1];
    else if (e.key === 'Home') next = all[0];
    else if (e.key === 'End') next = all[all.length - 1];
    else if (e.key === 'Tab') close();
    if (next) { e.preventDefault(); next.focus(); }
  });

  return {
    el,
    setData(next) {
      kind = next.kind || kind;
      genre = next.genre || null;
      genres = next.genres || [];
      paint();
    },
    close,
    destroy() {
      close();
      el.remove();
    },
  };
}
