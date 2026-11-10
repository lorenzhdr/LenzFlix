// LENZ//84 retro-fx: kleine gemeinsame Helfer (Eingabefeld-Erkennung, Dialog-Erkennung, reduced-motion, Zufall, Timer).

const EDITABLE = 'input, textarea, select, [contenteditable=""], [contenteditable="true"]';

/** True, wenn das Ereignisziel ein Eingabefeld (oder darin) ist. */
export function isEditable(target) {
  try {
    return Boolean(target && target.closest && target.closest(EDITABLE));
  } catch {
    return false;
  }
}

// Nur SICHTBARE Dialoge zählen (Jellyfins AppBar hält dauerhaft versteckte Popover im DOM).
const DIALOG_SELECTOR = [
  '.dialogContainer .dialog',
  '.MuiDialog-root:not(.MuiModal-hidden)',
  '.MuiPopover-root:not(.MuiModal-hidden)',
  '.MuiModal-root:not(.MuiModal-hidden)[role=presentation]',
  '#lfx-popover', '#lfx-sheet', '#lfx-themepicker',
].map((q) => `${q}:not([aria-hidden=true]):not([hidden])`).join(', ');

/** True, wenn gerade ein Jellyfin-/LenzFlix-Dialog, Menü oder Sheet offen ist. */
export function isDialogOpen() {
  try {
    const cl = document.documentElement.classList;
    if (['lfx-sheet-open', 'lfx-themepicker-open', 'lfx-popover-open', 'lfx-modal-open'].some((c) => cl.contains(c))) return true;
    return Boolean(document.querySelector(DIALOG_SELECTOR));
  } catch {
    return false;
  }
}

/** True, wenn der Player sichtbar ist (Route /video oder #videoOsdPage ohne .hide). */
export function isPlayerVisible(route) {
  if (route && typeof route.path === 'string' && route.path.startsWith('/video')) return true;
  return Boolean(document.querySelector('#videoOsdPage:not(.hide)'));
}

/** True, wenn irgendwo ein Video läuft. */
export function isVideoPlaying() {
  try {
    return [...document.querySelectorAll('video')].some((v) => !v.paused && !v.ended && v.readyState > 2);
  } catch {
    return false;
  }
}

export function prefersReducedMotion() {
  try {
    return Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch {
    return false;
  }
}

/** Zufallszahl in [min, max). */
export function rand(min, max) {
  return min + Math.random() * (max - min);
}

/** Verwaltet Timer eines Moduls, damit clearAll() sie sicher alle löscht. */
export function createTimers() {
  const set = new Set();
  return {
    timeout(fn, ms) {
      const id = setTimeout(() => { set.delete(id); fn(); }, ms);
      set.add(id);
      return id;
    },
    interval(fn, ms) {
      const id = setInterval(fn, ms);
      set.add(id);
      return id;
    },
    clear(id) {
      clearTimeout(id);
      clearInterval(id);
      set.delete(id);
    },
    clearAll() {
      for (const id of set) { clearTimeout(id); clearInterval(id); }
      set.clear();
    },
    get size() { return set.size; },
  };
}
