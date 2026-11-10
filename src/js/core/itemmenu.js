// LenzFlix: natives Jellyfin-Titelmenü per Proxy-Klick (siehe docs/dom-map.md, „Kontextmenü per Proxy-Klick“).
// Ein verstecktes .itemAction[data-action="menu"] in einem echten .itemsContainer öffnet das native .actionSheet.
import { getAuth, getItem } from './api.js';
import { findProxyContainer } from './playback.js';
import { putItems } from './itemstore.js';
import { toast } from './toast.js';
import { attachSwipeClose } from './swipe.js';

const END_QUIET_MS = 800;
const NO_DIALOG_TIMEOUT_MS = 4000;
const HIDDEN_FIRST = ['download', 'downloadall', 'multiSelect'];
const CHANGING_COMMANDS = ['delete', 'edit', 'editimages', 'editsubtitles', 'identify', 'refresh', 'addtocollection', 'removefromcollection'];
const RETRY_COMMANDS = ['delete', 'refresh'];
const RETRY_DELAYS = [1000, 3000, 8000];
const FOLDER_TYPES = ['Series', 'Season', 'BoxSet'];
const EDGE = 8;

// ------------------------------------------------------------ Position

function rectOf(anchor) {
  if (anchor && typeof anchor.getBoundingClientRect === 'function') return anchor.getBoundingClientRect();
  const x = Number(anchor && anchor.x) || 0;
  const y = Number(anchor && anchor.y) || 0;
  return { left: x, right: x, top: y, bottom: y, width: 0, height: 0 };
}

/**
 * Menüposition (links/oben): unter dem Anker, rechte Kanten bündig, an den Viewport geklemmt;
 * ohne Platz unten über dem Anker.
 */
export function computeMenuPosition(anchorRect, viewport, menu = { w: 300, h: 320 }) {
  const vp = viewport || { w: window.innerWidth, h: window.innerHeight };
  const gap = 4;
  const clamp = (v, min, max) => Math.max(min, Math.min(v, Math.max(min, max)));
  // Punkt-Anker (Rechtsklick/langes Drücken): Menü beginnt am Punkt; Button-Anker: rechte Kanten bündig.
  const isPoint = anchorRect.right === anchorRect.left;
  let x = isPoint ? anchorRect.left : anchorRect.right - menu.w;
  x = clamp(x, EDGE, vp.w - menu.w - EDGE);
  let y = anchorRect.bottom + gap;
  if (y + menu.h > vp.h - EDGE) {
    const above = anchorRect.top - gap - menu.h;
    y = above >= EDGE ? above : y;
  }
  y = clamp(y, EDGE, vp.h - menu.h - EDGE);
  return { x, y };
}

export { rectOf as anchorRect };

// ------------------------------------------------------------ Event-Bus

const listeners = new Set();
const ownDeletes = new Set();

export function onItemsChanged(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit({ removed = [], updated = [] }) {
  if (!removed.length && !updated.length) return;
  if (removed.some((id) => ownDeletes.has(id))) {
    for (const id of removed) ownDeletes.delete(id);
    toast('Gelöscht');
  }
  for (const fn of [...listeners]) {
    try {
      fn({ removed, updated });
    } catch {
      /* ein Abonnent darf die anderen nicht stören */
    }
  }
}

// ------------------------------------------------------------ Nachladen

let retryTimers = [];

function clearRetries() {
  retryTimers.forEach(clearTimeout);
  retryTimers = [];
}

function isNetworkError(err) {
  return err instanceof TypeError || /failed to fetch|network/i.test(String(err && err.message));
}

/** Lädt das Item neu. Rückgabe: true = als entfernt gemeldet. */
async function verifyItem(id, removalOnly = false) {
  let item;
  try {
    item = await getItem(id);
  } catch (err) {
    // Nur ein eindeutiges 404 gilt als „entfernt“ (5xx oder Offline-Momente löschen keine Karte).
    if (isNetworkError(err) || !/\b404\b/.test(String(err && err.message))) return false;
    emit({ removed: [id], updated: [] });
    return true;
  }
  if (!item || !item.Id) {
    emit({ removed: [id], updated: [] });
    return true;
  }
  // Nach „Löschen“ zählt nur das Verschwinden (abgebrochene Rückfrage = keine Änderung).
  if (removalOnly) return false;
  putItems([item]);
  emit({ removed: [], updated: [id] });
  return false;
}

function afterSession(id, command) {
  if (!id || !CHANGING_COMMANDS.includes(command)) return;
  if (command === 'delete') ownDeletes.add(id);
  let done = false;
  const run = async () => {
    if (done) return;
    if (await verifyItem(id, command === 'delete')) done = true;
  };
  run();
  if (RETRY_COMMANDS.includes(command)) {
    const last = RETRY_DELAYS[RETRY_DELAYS.length - 1];
    for (const delay of RETRY_DELAYS) {
      retryTimers.push(
        setTimeout(async () => {
          await run();
          // Nach dem letzten Versuch nicht mehr auf das eigene Löschen warten (sonst falscher „Gelöscht“-Toast später).
          if (delay === last && !done) ownDeletes.delete(id);
        }, delay),
      );
    }
  }
}

// ------------------------------------------------------------ Sitzung

let session = null;

function clearMarker() {
  const root = document.documentElement;
  root.classList.remove('lfx-menu-open');
  root.style.removeProperty('--lfx-menu-x');
  root.style.removeProperty('--lfx-menu-y');
}

function setPosition(pos) {
  const root = document.documentElement;
  root.style.setProperty('--lfx-menu-x', `${Math.round(pos.x)}px`);
  root.style.setProperty('--lfx-menu-y', `${Math.round(pos.y)}px`);
}

const isTouchSheet = () => typeof window.matchMedia === 'function' && window.matchMedia('(hover: none), (max-width: 799px)').matches;

/** Bottom-Sheet (Touch/schmal): per Wischgeste nach unten schließen, auf demselben Weg wie Escape (history.back). */
function attachSheetSwipe(s, sheet) {
  if (!isTouchSheet()) return;
  const backdrop = document.querySelector('.dialogBackdrop');
  s.detachSwipe = attachSwipeClose(sheet, {
    backdrop,
    onClose: () => {
      if (s.escaped || !sheet.isConnected) return;
      s.escaped = true;
      history.back();
    },
  });
}

function teardown(s) {
  if (s.detachSwipe) {
    s.detachSwipe();
    s.detachSwipe = null;
  }
  s.observer.disconnect();
  clearTimeout(s.endTimer);
  clearTimeout(s.startTimer);
  document.removeEventListener('click', s.onClick, true);
  window.removeEventListener('keydown', s.onKey, true);
  s.wrapper.remove();
  clearMarker();
  if (session === s) session = null;
}

function finish(s) {
  if (session !== s) return;
  teardown(s);
  const { anchor, opts, command, item } = s;
  if (anchor && typeof anchor.focus === 'function' && anchor.isConnected) {
    try {
      anchor.focus({ preventScroll: true });
    } catch {
      /* Fokus ist optional */
    }
  }
  if (typeof opts.onClose === 'function') {
    try {
      opts.onClose({ command });
    } catch {
      /* Callback-Fehler ignorieren */
    }
  }
  afterSession(item.Id, command);
}

function focusFirstEntry(sheet) {
  const entries = [...sheet.querySelectorAll('.actionSheetMenuItem')].filter(
    (el) => !HIDDEN_FIRST.includes(el.getAttribute('data-id')) && !el.hidden && el.style.display !== 'none',
  );
  if (entries[0]) entries[0].focus({ preventScroll: true });
}

function onMutation(s) {
  const containers = document.querySelectorAll('.dialogContainer');
  if (containers.length) {
    s.sawDialog = true;
    clearTimeout(s.endTimer);
    s.endTimer = null;
    clearTimeout(s.startTimer);
    s.startTimer = null;
    if (!s.sheet) {
      const sheet = document.querySelector('.dialogContainer .dialog.actionSheet');
      if (sheet) {
        s.sheet = sheet;
        // Mit der echten Größe neu ausrichten (die erste Position rechnet mit einer Schätzung).
        const w = sheet.offsetWidth;
        const hgt = sheet.offsetHeight;
        if (w && hgt) setPosition(computeMenuPosition(rectOf(s.anchor), undefined, { w, h: hgt }));
        focusFirstEntry(sheet);
        attachSheetSwipe(s, sheet);
      }
    }
  }
  if (s.sheet && !s.sheet.isConnected && !s.markerCleared) {
    s.markerCleared = true;
    clearMarker();
  }
  if (!containers.length && s.sawDialog && !s.endTimer) {
    s.endTimer = setTimeout(() => finish(s), END_QUIET_MS);
  }
}

function buildProxyFor(item) {
  const isFolder = Boolean(item.IsFolder) || FOLDER_TYPES.includes(item.Type);
  const el = document.createElement('div');
  el.className = 'lfx-proxy itemAction';
  el.setAttribute('data-action', 'menu');
  el.setAttribute('data-id', item.Id);
  el.setAttribute('data-serverid', item.ServerId || getAuth().serverId || '');
  el.setAttribute('data-type', item.Type || '');
  el.setAttribute('data-isfolder', String(isFolder));
  el.setAttribute('data-mediatype', item.MediaType || (isFolder ? '' : 'Video'));
  return el;
}

/**
 * Öffnet das native Titelmenü. anchor = Element oder {x, y}. Rückgabe: true = Proxy-Klick ausgelöst.
 */
export function openItemMenu(item, anchor, opts = {}) {
  if (!item || !item.Id) return false;
  if (session) teardown(session);
  const container = findProxyContainer();
  if (!container) {
    toast('Menü hier nicht verfügbar');
    return false;
  }

  const wrapper = document.createElement('div');
  wrapper.className = 'lfx-proxywrap itemsContainer';
  wrapper.style.display = 'none';
  const list = Array.isArray(opts.siblings) && opts.siblings.some((s) => s && s.Id === item.Id) ? opts.siblings : [item];
  let target = null;
  for (const it of list) {
    if (!it || !it.Id) continue;
    const proxy = buildProxyFor(it);
    wrapper.append(proxy);
    if (it.Id === item.Id) target = proxy;
  }
  container.append(wrapper);

  const s = {
    item,
    anchor,
    opts,
    wrapper,
    command: null,
    sheet: null,
    sawDialog: false,
    markerCleared: false,
    endTimer: null,
    startTimer: null,
    observer: null,
    onClick: null,
  };
  s.onClick = (e) => {
    if (s.command) return;
    const entry = e.target && e.target.closest && e.target.closest('.actionSheetMenuItem[data-id]');
    if (entry && (!s.sheet || s.sheet.contains(entry))) s.command = entry.getAttribute('data-id');
  };
  // Jellyfin schließt das Sheet im Desktop-Layout nicht per Escape (live geprüft): selbst über den
  // nativen Weg (history.back) schließen. Folgedialoge behandeln ihre Tasten selbst.
  s.onKey = (e) => {
    if (e.key !== 'Escape') return;
    // Sheet schon wieder zu (Folgedialog oder Nachlauf): nicht eingreifen.
    if (s.sheet && !s.sheet.isConnected) return;
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
    // Sheet lädt noch: Escape nur schlucken, damit das Modal/die Hovercard dahinter nicht schließt.
    if (!s.sheet || s.escaped) return;
    s.escaped = true;
    history.back();
  };
  window.addEventListener('keydown', s.onKey, true);
  s.observer = new MutationObserver(() => onMutation(s));
  s.observer.observe(document.body, { childList: true });
  document.addEventListener('click', s.onClick, true);
  s.startTimer = setTimeout(() => finish(s), NO_DIALOG_TIMEOUT_MS);
  session = s;

  setPosition(computeMenuPosition(rectOf(anchor)));
  document.documentElement.classList.add('lfx-menu-open');

  target.click();
  return true;
}

export function isMenuOpen() {
  return session !== null;
}

/** Sofortiges Aufräumen ohne Nachlade-Logik (unmount/destroy). */
export function closeItemMenu() {
  if (session) teardown(session);
  else clearMarker();
  clearRetries();
  ownDeletes.clear();
}

// ------------------------------------------------------------ LibraryChanged

let unsubscribeWatch = null;

function onLibraryChanged(msg) {
  const data = (msg && msg.Data) || {};
  const removed = Array.isArray(data.ItemsRemoved) ? data.ItemsRemoved.filter(Boolean) : [];
  const updated = Array.isArray(data.ItemsUpdated) ? data.ItemsUpdated.filter(Boolean) : [];
  emit({ removed, updated });
}

export function startItemWatch() {
  if (unsubscribeWatch) return;
  const client = window.ApiClient;
  if (!client || typeof client.subscribe !== 'function') return;
  try {
    const res = client.subscribe(['LibraryChanged'], onLibraryChanged);
    unsubscribeWatch =
      typeof res === 'function'
        ? res
        : () => {
            if (typeof client.unsubscribe === 'function') client.unsubscribe(['LibraryChanged'], onLibraryChanged);
          };
  } catch {
    unsubscribeWatch = null;
  }
}

export function stopItemWatch() {
  if (unsubscribeWatch) {
    try {
      unsubscribeWatch();
    } catch {
      /* defensiv */
    }
    unsubscribeWatch = null;
  }
  closeItemMenu();
}
