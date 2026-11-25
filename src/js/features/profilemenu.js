// LenzFlix: eigenes Profilmenü für das Design LENZFLIX (Feature "profilemenu", nur flix, Modern).
// Ersetzt Jellyfins MUI-Benutzermenü: Capture-Klick am document fängt den Profil-Knopf ab (React sieht das
// Ereignis nie, der Knopf wird nur gelesen, nie verändert). Ab 800 px ein Popover unter dem Knopf (Hover öffnet
// per Maus, Klick schaltet um), darunter ein Bottom-Sheet. Einträge liefert shared/profile.js.
import { isReady } from '../core/api.js';
import { isModern, isTv, isNarrow } from '../core/layout.js';
import { isTheme } from '../core/theme.js';
import { openPopover, closePopover, isPopoverOpen } from '../core/popover.js';
import { profileEntries, getUserChip, quickConnectEnabled } from '../shared/profile.js';
import { openProfileSheet, closeProfileSheet, isProfileSheetOpen } from '../shared/profilesheet.js';
import { profileButtonOf } from './profilebtn.js';
import { EXCLUDED } from './nav.js';

const OPEN_CLASS = 'lfx-flix-profile-open';
const SHEET_ID = 'lfx-flix-profilesheet';
const SHEET_PREFIX = 'lfx-flix-psheet';
const SHEET_OPEN_CLASS = 'lfx-flix-profilesheet-open';
const POPOVER_ID = 'lfx-popover';
const HOVER_CLOSE_MS = 200;
const HOVER_CLICK_GRACE = 800; // ms: Klick direkt nach dem Hover-Öffnen schließt das Menü nicht
const HOVER_MQ = '(hover: hover) and (pointer: fine)';

const state = {
  mounted: false,
  seq: 0, // Öffnungszähler gegen veraltete Antworten
  route: null,
  mine: null, // Token des eigenen offenen Popovers
  sheet: null, // eigenes offenes Blatt
  openedAt: 0,
  byHover: false,
  pending: false, // Öffnen läuft (async)
  pendingHover: false, // laufendes Öffnen kam per Hover und wurde (noch) nicht per Klick bestätigt
  hoverTimer: 0,
  cleanups: [],
};

const root = () => document.documentElement;
const inPopover = (n) => Boolean(n && n.closest && n.closest(`#${POPOVER_ID}`));

function ownPopoverOpen() {
  return state.mine !== null && isPopoverOpen();
}
function ownSheetOpen() {
  return state.sheet !== null && isProfileSheetOpen();
}

function clearHoverTimer() {
  if (state.hoverTimer) {
    clearTimeout(state.hoverTimer);
    state.hoverTimer = 0;
  }
}

/** Eigenes Popover/Blatt schließen; laufendes Öffnen verwerfen. */
function closeOwn({ restoreFocus = false } = {}) {
  clearHoverTimer();
  state.seq++;
  state.pending = false;
  state.pendingHover = false;
  if (ownPopoverOpen()) closePopover({ restoreFocus });
  state.mine = null;
  root().classList.remove(OPEN_CLASS);
  if (ownSheetOpen()) closeProfileSheet({ restoreFocus });
  state.sheet = null;
}

// Beim Öffnen ohne Wiederholungen (das Vorwärmen in mount() wartet bereits auf den Benutzer); Fehler → leerer Chip
const safeChip = () => getUserChip().catch(() => ({ name: '', imageUrl: null }));
const safeEntries = (btn) => profileEntries({ theme: 'flix', returnFocus: btn }).catch(() => []);

async function openMenu(btn, { focus, hover }) {
  const seq = ++state.seq;
  state.pending = true;
  state.pendingHover = hover;
  if (isNarrow()) {
    state.sheet = openProfileSheet({
      id: SHEET_ID,
      prefix: SHEET_PREFIX,
      openClass: SHEET_OPEN_CLASS,
      label: 'Profil',
      returnFocus: btn,
      load: async () => {
        const [chip, items] = await Promise.all([safeChip(), safeEntries(btn)]);
        return { chip, sections: [{ items }] };
      },
    }) || {};
    state.pending = false;
    return;
  }
  // Chip und Einträge parallel (Einträge zeigen notfalls nur den Kopf)
  const [chip, entries] = await Promise.all([safeChip(), safeEntries(btn)]);
  if (seq !== state.seq || !state.mounted) return;
  state.pending = false;
  if (!btn.isConnected) return; // React hat den Knopf ersetzt: nächster Klick öffnet neu
  const token = {};
  state.mine = token;
  state.openedAt = Date.now();
  state.byHover = state.pendingHover;
  openPopover(btn, {
    label: 'Profilmenü',
    className: 'lfx-flix-profile',
    align: 'end',
    expand: false,
    focus,
    onClosed: () => {
      if (state.mine !== token) return;
      state.mine = null;
      root().classList.remove(OPEN_CLASS);
    },
    items: [{ head: true, label: chip.name || 'Profil', imageUrl: chip.imageUrl }, ...entries],
  });
  root().classList.add(OPEN_CLASS);
}

function onClick(e) {
  const btn = profileButtonOf(e.target);
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  clearHoverTimer();
  if (ownSheetOpen()) {
    closeOwn({ restoreFocus: true });
    return;
  }
  if (ownPopoverOpen()) {
    if (state.byHover && Date.now() - state.openedAt < HOVER_CLICK_GRACE) return;
    closeOwn({ restoreFocus: e.detail === 0 });
    return;
  }
  if (state.pending) {
    // Öffnen läuft schon (z. B. per Hover): der Klick bestätigt es (keine Schonfrist, Wegfahren bricht nicht ab)
    state.pendingHover = false;
    return;
  }
  openMenu(btn, { focus: e.detail === 0, hover: false });
}

function canHover(e) {
  return e.pointerType === 'mouse' && typeof matchMedia === 'function' && matchMedia(HOVER_MQ).matches && !isNarrow();
}

function onPointerOver(e) {
  if (e.pointerType !== 'mouse') return;
  const btn = profileButtonOf(e.target);
  if (btn) {
    if (!canHover(e)) return;
    clearHoverTimer();
    if (!ownPopoverOpen() && !state.pending && !ownSheetOpen()) openMenu(btn, { focus: false, hover: true });
    return;
  }
  if (ownPopoverOpen() && inPopover(e.target)) clearHoverTimer();
}

function onPointerOut(e) {
  if (e.pointerType !== 'mouse') return;
  const fromBtn = profileButtonOf(e.target);
  if (!fromBtn && !(ownPopoverOpen() && inPopover(e.target))) return;
  const to = e.relatedTarget;
  if (to && (profileButtonOf(to) || inPopover(to))) return;
  if (state.pending && !ownPopoverOpen()) {
    // Hover-Öffnen läuft noch: Wegfahren verwirft es; ein per Klick bestätigtes Öffnen bleibt
    if (state.pendingHover) {
      state.seq++;
      state.pending = false;
    }
    return;
  }
  if (!ownPopoverOpen()) return;
  clearHoverTimer();
  state.hoverTimer = setTimeout(() => {
    state.hoverTimer = 0;
    if (ownPopoverOpen()) closeOwn();
  }, HOVER_CLOSE_MS);
}

const profilemenu = {
  name: 'profilemenu',
  match(route) {
    return isReady() && isModern() && !isTv() && isTheme('flix') && !EXCLUDED.test(route.path);
  },
  mount(route) {
    state.mounted = true;
    state.route = route;
    document.addEventListener('click', onClick, true);
    document.addEventListener('pointerover', onPointerOver);
    document.addEventListener('pointerout', onPointerOut);
    state.cleanups.push(
      () => document.removeEventListener('click', onClick, true),
      () => document.removeEventListener('pointerover', onPointerOver),
      () => document.removeEventListener('pointerout', onPointerOut),
    );
    // Daten vorwärmen (gecacht), Fehler ignorieren
    try {
      Promise.resolve(quickConnectEnabled()).catch(() => {});
      Promise.resolve(getUserChip({ retries: 20, isAlive: () => state.mounted })).catch(() => {});
    } catch {
      /* Vorwärmen ist optional */
    }
  },
  update(route) {
    // Router ruft update() bei jedem viewshow: nur bei echter Routenänderung schließen
    const changed = !state.route || state.route.hash !== route.hash;
    state.route = route;
    if (changed) closeOwn();
  },
  unmount() {
    state.mounted = false;
    closeOwn();
    for (const fn of state.cleanups.splice(0)) fn();
    state.route = null;
  },
};

export default profilemenu;
