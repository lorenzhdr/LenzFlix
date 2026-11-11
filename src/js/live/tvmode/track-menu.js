// TV-Modus · Popover für Ton- und Untertitelwahl (über der Bedienleiste). Vertrag: docs/tvmode.md („Player (F)“).
// Kein Komponenten-Schema (kein update/tick): wird von controls.js angelegt, el hängt player-view.js in den Player.

/**
 * @param {{ doc?: Document, ctl: object, trigger?: HTMLElement|null, onClose?: () => void }} o
 *   trigger: Knopf, der das Menü öffnet (Klick darauf zählt nicht als „daneben“; Fokus kehrt dorthin zurück).
 * @returns {{ el: HTMLElement, open(): void, close(restoreFocus?: boolean): void, toggle(): void, isOpen(): boolean, hasChoice(): boolean, destroy(): void }}
 */
export function createTrackMenu({ doc = document, ctl, trigger = null, onClose = null } = {}) {
  const el = doc.createElement('div');
  el.className = 'lfx-tvm__menu lfx-tvm__menu--tracks lfx-tvm__menu--audio lfx-tvm__menu--subs';
  el.setAttribute('role', 'menu');
  el.setAttribute('aria-label', 'Ton und Untertitel');
  el.hidden = true;

  let opened = false;
  let alive = true;

  const readTracks = () => {
    let t;
    try {
      t = ctl && ctl.tracks && ctl.tracks();
    } catch {
      /* ohne Spuren */
    }
    return {
      audio: (t && t.audio) || [],
      subs: (t && t.subs) || [],
      audioIndex: t ? t.audioIndex : null,
      subtitleIndex: t && typeof t.subtitleIndex === 'number' ? t.subtitleIndex : -1,
    };
  };

  /** Lohnt sich ein Menü? Mehr als eine Tonspur oder mindestens ein Untertitel. */
  function hasChoice() {
    const t = readTracks();
    return t.audio.length > 1 || t.subs.length > 0;
  }

  const items = () => Array.from(el.querySelectorAll('.lfx-tvm__menu-item'));

  function pick(fn) {
    try {
      const r = fn();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch {
      /* Fehler meldet der Controller per 'message' */
    }
    close(true);
  }

  function group(kind, title, list, activeIndex, onPick, withOff) {
    const g = doc.createElement('div');
    g.className = `lfx-tvm__menu-group lfx-tvm__menu-group--${kind}`;
    g.setAttribute('role', 'group');
    const h = doc.createElement('div');
    h.className = 'lfx-tvm__menu-title';
    h.textContent = title;
    g.setAttribute('aria-label', title);
    g.appendChild(h);
    const add = (label, index) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'lfx-tvm__menu-item';
      b.setAttribute('role', 'menuitemradio');
      b.tabIndex = -1;
      const active = index === activeIndex;
      b.classList.toggle('is-active', active);
      b.setAttribute('aria-checked', active ? 'true' : 'false');
      const mark = doc.createElement('span');
      mark.className = 'lfx-tvm__menu-check';
      mark.setAttribute('aria-hidden', 'true');
      mark.textContent = active ? '✓' : '';
      const txt = doc.createElement('span');
      txt.className = 'lfx-tvm__menu-label';
      txt.textContent = label;
      b.append(mark, txt);
      b.addEventListener('click', () => pick(() => onPick(index)));
      g.appendChild(b);
    };
    if (withOff) add('Aus', -1);
    list.forEach((t, i) => add(t.label || `${title} ${i + 1}`, t.index));
    return g;
  }

  function render() {
    const t = readTracks();
    el.textContent = '';
    if (t.audio.length) {
      el.appendChild(group('audio', 'Ton', t.audio, t.audioIndex, (i) => ctl.setAudio(i), false));
    }
    if (t.subs.length) {
      el.appendChild(group('subs', 'Untertitel', t.subs, t.subtitleIndex, (i) => ctl.setSubtitle(i), true));
    }
  }

  function onKey(e) {
    if (!opened) return;
    if (e.key === 'Escape' || e.key === 'Esc') {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    if (e.key === 'Tab') {
      close(false);
      return;
    }
    const list = items();
    if (!list.length || !el.contains(doc.activeElement)) {
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && list.length) {
        e.preventDefault();
        (e.key === 'ArrowDown' ? list[0] : list[list.length - 1]).focus();
      }
      return;
    }
    const at = list.indexOf(doc.activeElement);
    let next = -1;
    if (e.key === 'ArrowDown') next = (at + 1) % list.length;
    else if (e.key === 'ArrowUp') next = (at - 1 + list.length) % list.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = list.length - 1;
    if (next >= 0) {
      e.preventDefault();
      e.stopPropagation();
      list[next].focus();
    }
  }

  function onOutside(e) {
    const t = e.target;
    if (el.contains(t) || (trigger && trigger.contains(t))) return;
    close(false);
  }

  function open() {
    if (!alive || opened || !hasChoice()) return;
    render();
    opened = true;
    el.hidden = false;
    if (trigger) trigger.setAttribute('aria-expanded', 'true');
    doc.addEventListener('keydown', onKey, true);
    doc.addEventListener('pointerdown', onOutside, true);
    const list = items();
    const first = list.find((b) => b.classList.contains('is-active')) || list[0];
    if (first) first.focus();
  }

  function close(restoreFocus = false) {
    if (!opened) return;
    opened = false;
    el.hidden = true;
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('pointerdown', onOutside, true);
    if (trigger) {
      trigger.setAttribute('aria-expanded', 'false');
      if (restoreFocus) trigger.focus();
    }
    if (onClose) onClose();
  }

  return {
    el,
    open,
    close,
    toggle() {
      if (opened) close(true);
      else open();
    },
    isOpen: () => opened,
    hasChoice,
    destroy() {
      if (!alive) return;
      close(false);
      alive = false;
      el.remove();
    },
  };
}
