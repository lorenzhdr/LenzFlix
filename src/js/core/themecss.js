// LenzFlix: lädt das Design-CSS (dist/lenzplus(.min).css, dist/lenzprime(.min).css, dist/lenzretro(.min).css) nach.
// Die Basis-URL wird aus dem Ort abgeleitet, von dem das Kern-CSS/-JS kommt (siehe resolveThemeCssBase).
import { VERSION } from './version.js';

const CLASS = 'lfx-theme-css';
const ACTIVE_ID = 'lfx-theme-css';
const CORE_RE = /lenzflix(\.min)?\.(css|js)(?=$|[?#])/i;
const CORE_CSS_RE = /lenzflix(\.min)?\.css(?=$|[?#])/i;
const FILES = { plus: 'lenzplus', prime: 'lenzprime', retro: 'lenzretro' };

// Beim Laden des Bundles gilt document.currentScript noch (später ist es null).
const BOOT_SCRIPT_SRC = (() => {
  try {
    const s = document.currentScript;
    return (s && s.src) || '';
  } catch {
    return '';
  }
})();

/** 'https://x/dist/lenzflix.min.css?1' -> { base:'https://x/dist/', min:true, query:'?1' } oder null. */
function parseCoreUrl(href, withQuery = false) {
  const s = String(href || '');
  const m = s.match(CORE_RE);
  if (!m) return null;
  const cut = s.indexOf(m[0]);
  const rest = s.slice(cut + m[0].length);
  return { base: s.slice(0, cut), min: Boolean(m[1]), query: withQuery && rest.startsWith('?') ? rest.split('#')[0] : '' };
}

function fromImportRules(rules, depth = 0) {
  if (!rules || depth > 4) return null;
  for (const rule of Array.from(rules)) {
    if (rule && rule.href && CORE_CSS_RE.test(rule.href)) {
      const hit = parseCoreUrl(rule.href);
      if (hit) return hit;
    }
    // @import innerhalb eines importierten Sheets
    try {
      if (rule && rule.styleSheet) {
        const hit = fromImportRules(rule.styleSheet.cssRules, depth + 1);
        if (hit) return hit;
      }
    } catch { /* CORS */ }
  }
  return null;
}

function fromStyleSheets() {
  let sheets;
  try {
    sheets = Array.from(document.styleSheets || []);
  } catch {
    return null;
  }
  for (const sheet of sheets) {
    if (sheet.href && CORE_CSS_RE.test(sheet.href)) {
      const hit = parseCoreUrl(sheet.href);
      if (hit) return hit;
    }
    try {
      const hit = fromImportRules(sheet.cssRules);
      if (hit) return hit;
    } catch { /* Zugriff auf fremde Sheets (CORS) verboten */ }
  }
  return null;
}

function fromElements() {
  for (const l of document.querySelectorAll('link[rel~="stylesheet"]')) {
    const hit = parseCoreUrl(l.getAttribute('href') || '');
    if (hit) return hit;
  }
  const hit = parseCoreUrl(BOOT_SCRIPT_SRC);
  if (hit) return hit;
  for (const s of document.querySelectorAll('script[src]')) {
    const h = parseCoreUrl(s.getAttribute('src') || '');
    if (h) return h;
  }
  return null;
}

function normBase(b) {
  const s = String(b || '');
  return s.endsWith('/') ? s : `${s}/`;
}

/** Ermittelt Basis-Verzeichnis des Kern-CSS/-JS. Rückgabe: { base (mit "/"), min, query }. */
export function resolveThemeCssBase() {
  const cfg = window.LenzFlixConfig && window.LenzFlixConfig.themeCssBase;
  if (typeof cfg === 'string' && cfg.trim()) {
    const detected = fromStyleSheets() || fromElements();
    return { base: normBase(cfg.trim()), min: Boolean(detected && detected.min), query: '' };
  }
  const dev = document.getElementById('lfx-dev-css');
  if (dev) {
    const hit = parseCoreUrl(dev.getAttribute('href') || dev.href || '', true);
    if (hit) return { base: hit.base, min: false, query: hit.query };
  }
  const hit = fromStyleSheets() || fromElements();
  if (hit) return { base: hit.base, min: hit.min, query: '' };
  return { base: `https://cdn.jsdelivr.net/gh/lorenzhdr/LenzFlix@v${VERSION}/dist/`, min: true, query: '' };
}

/** URL des Design-CSS (null für 'flix': das Kern-CSS ist das Design). */
export function themeCssUrl(id) {
  const file = FILES[id];
  if (!file) return null;
  const { base, min, query } = resolveThemeCssBase();
  return `${base}${file}${min ? '.min' : ''}.css${query || ''}`;
}

export function getThemeCssLink(id) {
  for (const l of document.querySelectorAll(`link.${CLASS}`)) {
    if (l.getAttribute('data-lfx-theme') === id) return l;
  }
  return null;
}

const inflight = new Map(); // id -> Promise<boolean>

/** Lädt das Design-CSS (Link am Ende von <head>). true bei load, false bei Fehler/Timeout (Link wird dann entfernt). */
export function ensureThemeCss(id, { timeout = 1500 } = {}) {
  if (!FILES[id]) return Promise.resolve(true);
  const existing = getThemeCssLink(id);
  if (existing && existing.getAttribute('data-lfx-loaded') === '1') return Promise.resolve(true);
  if (inflight.has(id) && existing) return inflight.get(id);
  existing?.remove();
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.className = CLASS;
  link.setAttribute('data-lfx-theme', id);
  const p = new Promise((resolve) => {
    let done = false;
    let timer = null;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      link.onload = link.onerror = null;
      if (inflight.get(id) === p) inflight.delete(id);
      if (ok) link.setAttribute('data-lfx-loaded', '1');
      else link.remove();
      resolve(ok);
    };
    link.onload = () => finish(true);
    link.onerror = () => finish(false);
    timer = setTimeout(() => finish(false), timeout);
    link.href = themeCssUrl(id);
    document.head.appendChild(link);
  });
  inflight.set(id, p);
  return p;
}

/** Entfernt alle Design-Links außer dem von exceptId (undefined/null: alle). Der verbleibende bekommt id="lfx-theme-css". */
export function removeThemeCss(exceptId) {
  for (const l of [...document.querySelectorAll(`link.${CLASS}`)]) {
    if (exceptId && l.getAttribute('data-lfx-theme') === exceptId) {
      l.id = ACTIVE_ID;
    } else {
      inflight.delete(l.getAttribute('data-lfx-theme'));
      l.remove();
    }
  }
}
