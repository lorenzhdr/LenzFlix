// LenzFlix: lädt Zusatz-CSS eines lazy Bundles nach (z. B. dist/lenztvmode(.min).css für den TV-Modus, docs/tvmode.md).
// Basis-URL und .min-Suffix wie beim Design-CSS (resolveThemeCssBase). Eigene Klasse `lfx-addon-css`, damit
// removeThemeCss() (core/themecss.js, Klasse `lfx-theme-css`) diese Links nie entfernt.
import { resolveThemeCssBase } from './themecss.js';

const CLASS = 'lfx-addon-css';
const inflight = new Map(); // name -> Promise<boolean>

/** URL von dist/<name>(.min).css. */
export function addonCssUrl(name) {
  const { base, min, query } = resolveThemeCssBase();
  return `${base}${name}${min ? '.min' : ''}.css${query || ''}`;
}

function findLink(name) {
  for (const l of document.querySelectorAll(`link.${CLASS}`)) {
    if (l.getAttribute('data-lfx-addon') === name) return l;
  }
  return null;
}

/** Lädt das Zusatz-CSS (Link am Ende von <head>). true bei load, false bei Fehler/Timeout (Link wird entfernt). Idempotent. */
export function ensureAddonCss(name, { timeout = 8000 } = {}) {
  const existing = findLink(name);
  if (existing && existing.getAttribute('data-lfx-loaded') === '1') return Promise.resolve(true);
  if (existing && inflight.has(name)) return inflight.get(name);
  existing?.remove();
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.className = CLASS;
  link.setAttribute('data-lfx-addon', name);
  const p = new Promise((resolve) => {
    let done = false;
    let timer = null;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      link.onload = link.onerror = null;
      if (inflight.get(name) === p) inflight.delete(name);
      if (ok) link.setAttribute('data-lfx-loaded', '1');
      else link.remove();
      resolve(ok);
    };
    link.onload = () => finish(true);
    link.onerror = () => finish(false);
    timer = setTimeout(() => finish(false), timeout);
    link.href = addonCssUrl(name);
    document.head.appendChild(link);
  });
  inflight.set(name, p);
  return p;
}

/** Entfernt das Zusatz-CSS `name` (ohne Argument: alle). */
export function removeAddonCss(name) {
  for (const l of [...document.querySelectorAll(`link.${CLASS}`)]) {
    if (name && l.getAttribute('data-lfx-addon') !== name) continue;
    inflight.delete(l.getAttribute('data-lfx-addon'));
    l.remove();
  }
}
