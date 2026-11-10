// LENZ//84: gemeinsame Mount-Helfer der Unterseiten (Titel, Suche, Bibliothek): #homeTab finden, Seitenklassen setzen.
// Gehört Worker P2. Bewusst eigene Kopie (Retro darf die Features von LENZ+/LENZPRIME nicht importieren).
const root = () => document.documentElement;

export const PAGE_CLASS = 'lfx-retro-page-on';

export function findHomeTab() {
  const tab = document.querySelector('#indexPage:not(.hide) #homeTab');
  return tab && tab.isConnected ? tab : null;
}

/** Ruft cb(tab) auf, sobald #homeTab existiert (sofort oder per Polling, max. ~6 s). Rückgabe: cancel(). */
export function whenHomeTab(cb, { tries = 30, every = 200 } = {}) {
  let dead = false;
  let timer = null;
  let n = 0;
  const poll = () => {
    timer = null;
    if (dead) return;
    const t = findHomeTab();
    if (t) cb(t);
    else if (++n < tries) timer = setTimeout(poll, every);
  };
  poll();
  return () => {
    dead = true;
    if (timer) clearTimeout(timer);
    timer = null;
  };
}

/** Klassen auf <html>: Seiten-Marker (lfx-retro-page-on) plus Seitenklasse (z. B. lfx-retro-title-on). */
export function setPageOn(cls, on) {
  const cl = root().classList;
  cl.toggle(PAGE_CLASS, on);
  cl.toggle(cls, on);
}

export function scrollTop() {
  try { window.scrollTo(0, 0); } catch { /* jsdom */ }
}

export function reducedMotion() {
  try {
    return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch { return false; }
}

/** Gedrosselter Aufruf: fn läuft höchstens alle `ms` Millisekunden. */
export function throttle(fn, ms) {
  let last = 0;
  return (...args) => {
    const now = Date.now();
    if (now - last < ms) return;
    last = now;
    fn(...args);
  };
}
