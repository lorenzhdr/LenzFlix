// LenzFlix: lädt das lazy JS-Bundle eines Designs nach (VIDEOTHEK LENZ: dist/lenzstore(.min).js → window.LenzFlixStore3D; LENZ LIVE: dist/lenzlive(.min).js → window.LenzFlixLive; TV-Modus: dist/lenztvmode(.min).js → window.LenzFlixTvMode).
// Basis-URL wie beim Design-CSS (resolveThemeCssBase). Siehe docs/store3d.md.
import { resolveThemeCssBase } from './themecss.js';

const CLASS = 'lfx-theme-js';
const FILES = { store: 'lenzstore', live: 'lenzlive', tvmode: 'lenztvmode' };
const GLOBALS = { store: 'LenzFlixStore3D', live: 'LenzFlixLive', tvmode: 'LenzFlixTvMode' };

const inflight = new Map(); // id -> Promise<boolean>

export function themeJsUrl(id) {
  const file = FILES[id];
  if (!file) return null;
  const { base, min, query } = resolveThemeCssBase();
  return `${base}${file}${min ? '.min' : ''}.js${query || ''}`;
}

const hasGlobal = (id) => Boolean(window[GLOBALS[id]]);

function findTag(id) {
  for (const s of document.querySelectorAll(`script.${CLASS}`)) {
    if (s.getAttribute('data-lfx-theme') === id) return s;
  }
  return null;
}

/** Lädt das Design-JS. true, sobald das Global da ist; false bei Fehler/Timeout (Tag wird entfernt). Ohne JS-Bundle: true. */
export function ensureThemeJs(id, { timeout = 20000 } = {}) {
  if (!FILES[id]) return Promise.resolve(true);
  if (hasGlobal(id)) return Promise.resolve(true);
  if (inflight.has(id)) return inflight.get(id);
  findTag(id)?.remove();
  const script = document.createElement('script');
  script.className = CLASS;
  script.setAttribute('data-lfx-theme', id);
  script.async = true;
  const p = new Promise((resolve) => {
    let done = false;
    let timer = null;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      script.onload = script.onerror = null;
      if (inflight.get(id) === p) inflight.delete(id);
      if (!ok) script.remove();
      resolve(ok);
    };
    script.onload = () => finish(hasGlobal(id));
    script.onerror = () => finish(false);
    timer = setTimeout(() => finish(false), timeout);
    script.src = themeJsUrl(id);
    document.head.appendChild(script);
  });
  inflight.set(id, p);
  return p;
}

/** Entfernt alle Design-JS-Tags (das Global bleibt, die Instanz räumt die Hülle selbst ab). */
export function removeThemeJs() {
  for (const s of [...document.querySelectorAll(`script.${CLASS}`)]) {
    inflight.delete(s.getAttribute('data-lfx-theme'));
    s.remove();
  }
}
