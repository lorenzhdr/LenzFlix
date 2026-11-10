// LENZ//84: Effekte, Eastereggs, Sound (retro-fx). Besitzt ALLE Effekt-Schleifen und globalen Listener des Designs:
// CRT-Overlay, Boot-Screen, Glitch, Sound, Cheat-Code/Overdrive, Terminal, Code-Regen-Bildschirmschoner.
// Aktiv nur im Retro-Design (Modern, nicht TV), nie im Player und nie auf der Dashboard-Seite. unmount() stoppt und entfernt alles.
import { h } from '../../../core/dom.js';
import { isReady, getItems } from '../../../core/api.js';
import { isModern, isTv } from '../../../core/layout.js';
import { THEMES, isTheme, getTheme, setTheme, brandName } from '../../../core/theme.js';
import { currentRoute } from '../../../core/router.js';
import { getStoredItem, putItems } from '../../../core/itemstore.js';
import { getLibraries } from '../../../shared/libraries.js';
import { getUserChip } from '../../../shared/profile.js';
import { searchItems } from '../../../shared/search.js';
import { searchHref, titleHref } from '../../../shared/routes.js';
import { FX_EVENT, PREFS_EVENT, LOGO_ATTR, OVERDRIVE_CLASS, NO_CRT_CLASS, getPref, setPref } from '../prefs.js';
import { createCrt } from './crt.js';
import { runBoot, hasBooted, markBooted, clearBooted } from './boot.js';
import { createGlitch } from './glitch.js';
import { createSound } from './sound.js';
import { createSequence, createTapCounter } from './cheat.js';
import { createTerminal } from './terminal.js';
import { createScreensaver } from './screensaver.js';
import { createTimers, isEditable, isDialogOpen, isPlayerVisible, isVideoPlaying, prefersReducedMotion } from './util.js';

export const OVERDRIVE_MS = 20000;
export const LONG_PRESS_MS = 700;
export const TAP_COUNT = 7;
const TOAST_ID = 'lfx-retro-od-toast';

let S = null; // Laufzeitzustand, null = nicht gemountet

/** Dieses Feature ist aktiv (Retro, Modern, nicht TV, eingeloggt, kein Player/Dashboard)? */
export function shouldRun(route) {
  if (!isTheme('retro') || !isModern() || isTv() || !isReady()) return false;
  if (document.body && document.body.classList.contains('dashboardDocument')) return false;
  return !isPlayerVisible(route);
}

function logoOf(e) {
  const t = e.target;
  return t && t.closest ? t.closest(`[${LOGO_ATTR}]`) : null;
}

function mount() {
  if (S) return;
  const reduced = prefersReducedMotion();
  const timers = createTimers();
  const crt = createCrt();
  const sound = createSound(() => getPref('sound'));
  const seq = createSequence();
  const taps = createTapCounter({ gap: 400 });
  const html = document.documentElement;
  S = { timers, crt, sound, reduced, boot: null, overdriveTimer: 0, pressTimer: 0, pressX: 0, pressY: 0, suppressClickUntil: 0, listeners: [] };

  const listen = (target, type, fn, opts) => {
    target.addEventListener(type, fn, opts);
    S.listeners.push(() => target.removeEventListener(type, fn, opts));
  };

  // ---------------------------------------------------------- Aktionen
  const unlockSound = () => sound.unlock();

  function endOverdrive() {
    html.classList.remove(OVERDRIVE_CLASS);
    const t = document.getElementById(TOAST_ID);
    if (t) t.remove();
    if (S) S.overdriveTimer = 0;
  }

  function overdrive() {
    if (!S) return;
    html.classList.add(OVERDRIVE_CLASS);
    let toast = document.getElementById(TOAST_ID);
    if (toast) toast.remove();
    toast = h('div', { id: TOAST_ID, class: 'lfx-retro-od-toast', role: 'status' }, '>> OVERDRIVE AKTIVIERT <<');
    document.body.append(toast);
    timers.timeout(() => { if (toast.isConnected) toast.remove(); }, 3600);
    crt.shake();
    sound.play('jingle');
    if (S.overdriveTimer) timers.clear(S.overdriveTimer);
    S.overdriveTimer = timers.timeout(endOverdrive, OVERDRIVE_MS);
  }

  function startBoot() {
    if (S.boot) S.boot.cancel();
    markBooted();
    S.boot = runBoot({
      reduced,
      getName: async () => (await getUserChip({ retries: 0 })).name,
      onSound: (n) => sound.play(n),
      onDone: () => { if (S) S.boot = null; },
    });
  }

  const screensaver = createScreensaver({
    reduced,
    isBlocked: () => Boolean(S.boot) || terminal.isOpen() || isDialogOpen() || isVideoPlaying() || isPlayerVisible(currentRoute()),
    getTitles: () => {
      const names = [];
      for (const c of document.querySelectorAll('.lfx-card[data-lfx-id]')) {
        const it = getStoredItem(c.getAttribute('data-lfx-id'));
        if (it && it.Name) names.push(String(it.Name).toUpperCase());
        if (names.length >= 20) break;
      }
      return names;
    },
    onStart: () => sound.startRain(),
    onStop: () => sound.stopRain(),
  });
  const glitch = createGlitch({ crt, enabled: () => !reduced });

  const terminal = createTerminal({
    userName: async () => (await getUserChip({ retries: 0 })).name,
    libraries: () => getLibraries(),
    searchTitles: async (q) => {
      const r = await searchItems(q, { limit: 10 });
      const all = [...r.movies, ...r.series];
      putItems(all);
      return all.map((i) => ({ id: i.Id, name: i.Name, year: i.ProductionYear || null }));
    },
    randomTitle: async () => {
      const res = await getItems({ IncludeItemTypes: 'Movie', Recursive: true, SortBy: 'Random', Limit: 1, EnableUserData: false });
      const it = res && Array.isArray(res.Items) ? res.Items[0] : null;
      if (!it) return null;
      putItems([it]);
      return { id: it.Id, name: it.Name };
    },
    setTheme: (id) => setTheme(id, { source: 'user' }),
    themeName: (id) => brandName(id),
    themes: THEMES,
    currentTheme: () => getTheme(),
    getPref,
    setPref,
    unlockSound,
    regen: () => screensaver.run(true),
    overdrive,
    reboot: () => { clearBooted(); if (S) startBoot(); },
    now: () => new Date(),
    searchHref,
    titleHref,
  });
  Object.assign(S, { terminal, screensaver, glitch, endOverdrive });

  // ---------------------------------------------------------- Tastatur
  listen(document, 'keydown', (e) => {
    if (!S || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isEditable(e.target) || S.boot || terminal.isOpen() || isDialogOpen()) return;
    if (e.code === 'Backquote' && !e.repeat) { e.preventDefault(); terminal.open(); return; }
    if (e.repeat) return;
    if (seq.feed(e.key)) overdrive();
  });

  // ---------------------------------------------------------- Logo-Gesten (7x Tippen, Langdruck)
  const cancelPress = () => { if (S.pressTimer) { timers.clear(S.pressTimer); S.pressTimer = 0; } };
  listen(document, 'pointerdown', (e) => {
    if (e.button > 0) return;
    const logo = logoOf(e);
    if (!logo) return;
    if (taps.tap() >= TAP_COUNT) {
      taps.reset();
      cancelPress();
      S.suppressClickUntil = Date.now() + 700;
      overdrive();
      return;
    }
    S.pressX = e.clientX;
    S.pressY = e.clientY;
    cancelPress();
    S.pressTimer = timers.timeout(() => {
      S.pressTimer = 0;
      taps.reset();
      S.suppressClickUntil = Date.now() + 1500;
      terminal.open();
    }, LONG_PRESS_MS);
  }, true);
  listen(document, 'pointermove', (e) => {
    if (S.pressTimer && Math.abs(e.clientX - S.pressX) + Math.abs(e.clientY - S.pressY) > 12) cancelPress();
  }, { capture: true, passive: true });
  for (const type of ['pointerup', 'pointercancel']) listen(document, type, cancelPress, true);
  listen(document, 'click', (e) => {
    if (!logoOf(e)) return;
    if (Date.now() < S.suppressClickUntil || taps.count >= 2) { e.preventDefault(); e.stopPropagation(); }
  }, true);
  listen(document, 'contextmenu', (e) => {
    if (logoOf(e) && (S.pressTimer || Date.now() < S.suppressClickUntil)) e.preventDefault();
  }, true);

  // ---------------------------------------------------------- Sound
  const gesture = () => { if (S && getPref('sound') && !sound.isRunning()) sound.unlock(); };
  for (const type of ['pointerdown', 'keydown', 'click', 'touchend']) listen(document, type, gesture, { capture: true, passive: true });
  listen(document, FX_EVENT, (e) => {
    const name = e.detail && e.detail.name;
    if (name) sound.play(name === 'hover' ? 'blip' : name);
  });
  listen(window, 'hashchange', () => sound.play('nav'));
  listen(document, 'visibilitychange', () => { if (document.hidden) sound.suspend(); });

  // ---------------------------------------------------------- Vorlieben
  listen(document, PREFS_EVENT, (e) => {
    const d = e.detail || {};
    if (d.name === 'crt') crt.sync(d.value);
    else if (d.name === 'sound') {
      if (d.value) { sound.unlock(); timers.timeout(() => sound.play('click'), 80); } else sound.suspend();
    }
  });

  // ---------------------------------------------------------- Start
  crt.sync(getPref('crt'));
  if (!hasBooted()) startBoot();
  if (!reduced) glitch.start();
  screensaver.start();
}

function unmount() {
  if (!S) return;
  const s = S;
  S = null;
  for (const off of s.listeners) off();
  s.timers.clearAll();
  if (s.boot) s.boot.cancel();
  s.glitch.stop();
  s.screensaver.stop();
  s.terminal.destroy();
  s.sound.suspend();
  s.crt.unmount();
  s.endOverdrive();
  const html = document.documentElement;
  html.classList.remove(OVERDRIVE_CLASS, NO_CRT_CLASS, 'lfx-retro-term-open');
  for (const id of ['lfx-retro-crt', 'lfx-retro-boot', 'lfx-retro-terminal', 'lfx-retro-rain', TOAST_ID]) {
    const el = document.getElementById(id);
    if (el) el.remove();
  }
}

export default {
  name: 'retro-fx',
  match: (route) => shouldRun(route),
  mount,
  update() {},
  unmount,
};
