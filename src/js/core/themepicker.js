// LenzFlix: Design-Auswahl (Dialog am Desktop, Bottom-Sheet am Handy).
// Singleton #lfx-themepicker an document.body, unabhängig von Features (überlebt Design-Wechsel).
import { h, mountPoint, unmountPoint } from './dom.js';
import { attachSwipeClose } from './swipe.js';
import { THEMES, THEME_META, getChosenTheme, setTheme, onThemeChange } from './theme.js';

const ID = 'lfx-themepicker';
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
    const shelf = (n) => span('lfx-tp__shelf', Array.from({ length: n }, (_, i) => span(`lfx-tp__cover lfx-tp__cover--${i % 6}`)));
    root.append(span('lfx-tp__shopsign', ['VIDEOTHEK LENZ']), shelf(7), shelf(6), span('lfx-tp__carpet'));
  } else if (id === 'live') {
    root.append(
      span('lfx-tp__tv', [span('lfx-tp__screen', [span('lfx-tp__chno', ['5']), span('lfx-tp__rec')]), span('lfx-tp__ant')]),
      span('lfx-tp__remote', [span('lfx-tp__rbtn lfx-tp__rbtn--power'), span('lfx-tp__rbtn'), span('lfx-tp__rbtn'), span('lfx-tp__rbtn')]),
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
    id !== 'flix' ? span('lfx-tp__beta', ['Beta']) : null, // alle Designs außer LENZFLIX sind Beta
  ]);
  btn.setAttribute('aria-label', `${meta.name}${id !== 'flix' ? ' (Beta)' : ''}${meta.tagline ? `, ${meta.tagline}` : ''}`);
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

  const activeCard = c.cards.get(getChosenTheme()) || grid.querySelector('button');
  if (activeCard) activeCard.focus({ preventScroll: true });
  // Einblend-Animation im nächsten Frame auslösen
  const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (fn) => setTimeout(fn, 0);
  raf(() => { if (current === c) overlay.classList.add('is-open'); });
  return c;
}
