// LENZ+: gemeinsame Mount-Helfer der Unterseiten (Titel, Bibliothek, Suche): #homeTab finden, Seitenklassen setzen.
const ROOT = () => document.documentElement;

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

/** Klassen auf <html>: Seiten-Marker (lfx-plus-page-on) plus Seitenklasse (z. B. lfx-plus-title-on). */
export function setPageOn(cls, on) {
  const cl = ROOT().classList;
  cl.toggle('lfx-plus-page-on', on);
  cl.toggle(cls, on);
}

export function scrollTop() {
  try { window.scrollTo(0, 0); } catch { /* jsdom */ }
}
