// LENZPRIME: Raster-Flyout der Kopfzeile (Bibliotheken + Empfohlene Sammlungen). Öffnet bei Hover und Klick,
// schließt bei Escape, Klick außerhalb, Fokusverlust oder Wegbewegen der Maus.
import { h } from '../../core/dom.js';

const LEAVE_MS = 180;
const ITEM = '.lfx-prime-flyout__item';

function column(title, entries) {
  return h('section', { class: 'lfx-prime-flyout__col' }, [
    h('h3', { class: 'lfx-prime-flyout__head' }, title),
    entries.length
      ? h('div', { class: 'lfx-prime-flyout__list' }, entries.map((e) => h('a', {
        class: 'lfx-prime-flyout__item', href: e.href, role: 'menuitem', dataset: { key: e.key },
      }, e.label)))
      : h('p', { class: 'lfx-prime-flyout__empty' }, 'Nichts vorhanden'),
  ]);
}

/**
 * { wrap, button, flyout, load } -> { open(), close(), isOpen(), destroy() }
 * load(): Promise<{ libraries: [{key,label,href}], collections: [{key,label,href}] }>, wird beim ersten Öffnen aufgerufen.
 */
export function openMenus({ wrap, button, flyout, load }) {
  let opened = false;
  let loaded = false;
  let leaveTimer = null;
  let pinned = false; // per Klick festgesetzt: Wegbewegen der Maus schließt nicht
  let gen = 0;

  const items = () => [...flyout.querySelectorAll(ITEM)];

  async function ensureLoaded() {
    if (loaded) return;
    loaded = true;
    const mine = ++gen;
    let data;
    try {
      data = await load();
    } catch {
      data = { libraries: [], collections: [] };
    }
    if (mine !== gen) return;
    flyout.replaceChildren(
      column('Bibliotheken', data.libraries),
      h('span', { class: 'lfx-prime-flyout__sep', 'aria-hidden': 'true' }),
      column('Empfohlene Sammlungen', data.collections),
    );
  }

  function open({ focus = false } = {}) {
    clearTimeout(leaveTimer);
    if (!opened) {
      opened = true;
      flyout.hidden = false;
      wrap.classList.add('is-open');
      button.setAttribute('aria-expanded', 'true');
    }
    const p = ensureLoaded();
    if (focus) p.then(() => { if (opened) { const f = items()[0]; if (f) f.focus(); } });
  }

  function close({ restoreFocus = false } = {}) {
    clearTimeout(leaveTimer);
    if (!opened) return;
    opened = false;
    pinned = false;
    flyout.hidden = true;
    wrap.classList.remove('is-open');
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button.focus();
  }

  const onEnter = () => open();
  const onLeave = () => {
    clearTimeout(leaveTimer);
    if (pinned) return;
    leaveTimer = setTimeout(() => close(), LEAVE_MS);
  };
  const onClick = (e) => {
    if (e.detail === 0) {
      // per Tastatur ausgelöst: Fokus in das Menü
      if (opened) close(); else open({ focus: true });
    } else if (opened && !pinned) {
      pinned = true; // Hover hat es schon geöffnet: Klick hält es offen
    } else if (opened) close();
    else {
      open();
      pinned = true;
    }
  };
  const onFlyoutClick = (e) => {
    if (e.target.closest && e.target.closest(ITEM)) close();
  };
  const onKeydown = (e) => {
    if (!opened) {
      if (e.key === 'ArrowDown' && e.target === button) {
        e.preventDefault();
        open({ focus: true });
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close({ restoreFocus: true });
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
      const list = items();
      if (!list.length) return;
      const i = list.indexOf(document.activeElement);
      let next;
      if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = list.length - 1;
      else if (e.key === 'ArrowDown') next = i < 0 ? 0 : (i + 1) % list.length;
      else next = i < 0 ? list.length - 1 : (i - 1 + list.length) % list.length;
      e.preventDefault();
      list[next].focus();
    }
  };
  const onFocusOut = (e) => {
    if (opened && e.relatedTarget && !wrap.contains(e.relatedTarget)) close();
  };
  const onDocClick = (e) => {
    if (opened && !wrap.contains(e.target)) close();
  };

  wrap.addEventListener('mouseenter', onEnter);
  wrap.addEventListener('mouseleave', onLeave);
  button.addEventListener('click', onClick);
  flyout.addEventListener('click', onFlyoutClick);
  wrap.addEventListener('keydown', onKeydown);
  wrap.addEventListener('focusout', onFocusOut);
  document.addEventListener('click', onDocClick, true);

  return {
    open,
    close,
    isOpen: () => opened,
    destroy() {
      gen++;
      close();
      document.removeEventListener('click', onDocClick, true);
      wrap.removeEventListener('mouseenter', onEnter);
      wrap.removeEventListener('mouseleave', onLeave);
      wrap.removeEventListener('keydown', onKeydown);
      wrap.removeEventListener('focusout', onFocusOut);
    },
  };
}
