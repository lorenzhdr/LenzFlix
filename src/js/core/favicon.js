// LenzFlix: Tab-Icon (Favicon), Home-Bildschirm-Icon (apple-touch-icon) und Web-App-Titel passend zum Design.
// Tab-Icons als data-URI eingebettet (kein Netzwerkzugriff pro Seitenaufruf). removeFavicon stellt alles wieder her.
// Tab-Icons (FAVICONS) und Home-Bildschirm-Icons (touchFor) sind getrennt: Tab = SVG oder PNG, Home-Bildschirm = PNG.
// LENZFLIX: PNG (Quelle: assets/logo/favicon.png).
const FLIX_HREF = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAACACAYAAADDPmHLAAACKElEQVR42u3az2oTQQDH8V801SY2LUoOwryCF1/Ji4+lL+HVJ2hToo2xHqXRy0IPha40Ch6cQgjJRSo07ucLc1kYdpf5sH9getmRFoPxWZLLJJMkx0lOk8xL2/yK/rreDgG4SFLWDl8lma6gmCeZlrZZWtpuANjUzyTnFcVJHcelbX5Y7m4A2NQyyZc1FJPSNtcAdAPANhTn9VvibWmb910E0O8w/r0kL+pYJOkkgAfegt0OAAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgAASAABAAAkAACAABIAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgAASAABAAAkAACAABIAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgAASAABAAAkAACAABIAAEgAAQAAJAAAgAASAABIAAEAACQAAAIAAEgAAQAAJAAAiArvV8MRg/6+KN93blQheD8UWS8o9Pc5lkluRTHSdJpqVtrgDoBoBtfa8gZitAJqVtrgHoBoBNLZN8TfI5yVmFMU/yobTNDQD/P4Bt3aw8KWZJPiY5LW3z7T5ebN/33533KMnLOm57k+SVvwABIAAEgAAQAAJAAAgAASAABIAAEAACQAAIAAEgABR7ApPkdZJRksMke0kOkjxOMkwySLKf5Ek9Nqr3dlSRH9U5o5W52iUApW3e5W53Ge9XOMOKZ1jxHObPbumnSR5WPP2KZx3c7dyDCmsVXH8F673tN5bcY1gLzpx6AAAAAElFTkSuQmCC';
// Tab-Icons LENZ+, LENZPRIME, LENZ//84 (SVG, kompakt codiert: ' statt ", nur % # < > escaped; Quellen in assets/logo/).
// Quelle: assets/logo/favicon-plus.svg
const PLUS_HREF = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='lfx-plusm-g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' stop-color='%231bb3e8'/%3E%3Cstop offset='1' stop-color='%234f7cff'/%3E%3C/linearGradient%3E%3Cfilter id='lfx-plusm-a' x='-80%25' y='-80%25' width='260%25' height='260%25'%3E%3CfeGaussianBlur stdDeviation='2.2'/%3E%3C/filter%3E%3C/defs%3E%3Crect width='64' height='64' rx='14' fill='%2310131f'/%3E%3Cg transform='translate(8.31 50)'%3E%3Cpath d='M25.69 0L7.8 0Q5.82 0 4.76-1.09Q3.69-2.18 3.69-4.11L3.69-4.11L3.69-32.66Q3.69-34.68 4.73-35.72Q5.77-36.76 7.75-36.76L7.75-36.76Q9.67-36.76 10.71-35.72Q11.75-34.68 11.75-32.66L11.75-32.66L11.75-6.81L25.69-6.81Q27.35-6.81 28.26-5.93Q29.17-5.04 29.17-3.43L29.17-3.43Q29.17-1.77 28.26-.88Q27.35 0 25.69 0L25.69 0Z' fill='%23fff' stroke='%23fff' stroke-width='.6' stroke-linejoin='round'/%3E%3C/g%3E%3Cg fill='%231bb3e8' filter='url(%23lfx-plusm-a)' opacity='.8'%3E%3Crect x='35' y='17.8' width='20' height='6.4' rx='2.4'/%3E%3Crect x='41.8' y='11' width='6.4' height='20' rx='2.4'/%3E%3C/g%3E%3Cg fill='url(%23lfx-plusm-g)'%3E%3Crect x='35' y='17.8' width='20' height='6.4' rx='2.4'/%3E%3Crect x='41.8' y='11' width='6.4' height='20' rx='2.4'/%3E%3C/g%3E%3C/svg%3E";
// Quelle: assets/logo/favicon-prime.svg
const PRIME_HREF = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='14' fill='%2300050d'/%3E%3Cg transform='translate(0 37) scale(1.35)'%3E%3Cpath d='M20 6.58L13.8 6.58L13.8-20.74L17.64-20.74Q18.22-20.74 18.61-20.48Q19-20.22 19.16-19.7L19.16-19.7L19.62-18.18Q20.22-18.84 20.91-19.38Q21.6-19.92 22.39-20.31Q23.18-20.7 24.09-20.92Q25-21.14 26.08-21.14L26.08-21.14Q27.7-21.14 29.08-20.42Q30.46-19.7 31.46-18.34Q32.46-16.98 33.03-15.01Q33.6-13.04 33.6-10.54L33.6-10.54Q33.6-8.2 32.95-6.22Q32.3-4.24 31.13-2.78Q29.96-1.32 28.33-.5Q26.7 .32 24.72 .32L24.72 .32Q23.1 .32 22-.14Q20.9-.6 20-1.38L20-1.38L20 6.58ZM23.92-16.4L23.92-16.4Q23.24-16.4 22.69-16.27Q22.14-16.14 21.67-15.9Q21.2-15.66 20.8-15.29Q20.4-14.92 20-14.44L20-14.44L20-5.64Q20.7-4.86 21.52-4.55Q22.34-4.24 23.24-4.24L23.24-4.24Q24.1-4.24 24.82-4.58Q25.54-4.920 26.07-5.67Q26.6-6.42 26.9-7.62Q27.2-8.82 27.2-10.54L27.2-10.54Q27.2-12.18 26.96-13.3Q26.72-14.42 26.29-15.11Q25.86-15.8 25.26-16.1Q24.66-16.4 23.92-16.4Z' fill='%23fff'/%3E%3C/g%3E%3Cpath d='M10.5 54.2Q32 59.8 53.5 51.4Q32 53.4 10.5 54.2Z' fill='%231a98ff'/%3E%3C/svg%3E";
// Quelle: assets/logo/favicon-retro.svg
const RETRO_HREF = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Cdefs%3E%3ClinearGradient id='c' x1='0' y1='9.6' x2='0' y2='54.4' gradientUnits='userSpaceOnUse'%3E%3Cstop offset='0' stop-color='%23ffe2a8'/%3E%3Cstop offset='.45' stop-color='%23ffb000'/%3E%3Cstop offset='1' stop-color='%23ff5a1f'/%3E%3C/linearGradient%3E%3Cmask id='m' maskUnits='userSpaceOnUse' x='0' y='0' width='64' height='64'%3E%3Crect width='64' height='64' fill='%23fff'/%3E%3Crect y='34.7' width='64' height='1' fill='%23000'/%3E%3Crect y='40.75' width='64' height='1.7' fill='%23000'/%3E%3Crect y='46.8' width='64' height='2.4' fill='%23000'/%3E%3C/mask%3E%3C/defs%3E%3Crect width='64' height='64' rx='14' fill='%230a0603'/%3E%3Cg transform='translate(6.4 7) scale(.8)'%3E%3Cg mask='url(%23m)'%3E%3Cpath fill='url(%23c)' d='M7.7 9.6h16.2v6.4h-16.2zM2.3 16h5.4v6.4h-5.4zM23.9 16h5.4v6.4h-5.4zM2.3 22.4h5.4v6.4h-5.4zM23.9 22.4h5.4v6.4h-5.4zM7.7 28.8h16.2v6.4h-16.2zM2.3 35.2h5.4v6.4h-5.4zM23.9 35.2h5.4v6.4h-5.4zM2.3 41.6h5.4v6.4h-5.4zM23.9 41.6h5.4v6.4h-5.4zM7.7 48h16.2v6.4h-16.2zM50.9 9.6h5.4v6.4h-5.4zM45.5 16h10.8v6.4h-10.8zM40.1 22.4h5.4v6.4h-5.4zM50.9 22.4h5.4v6.4h-5.4zM34.7 28.8h5.4v6.4h-5.4zM50.9 28.8h5.4v6.4h-5.4zM34.7 35.2h27v6.4h-27zM50.9 41.6h5.4v6.4h-5.4zM50.9 48h5.4v6.4h-5.4z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E";
// VIDEOTHEK LENZ: SVG (Quelle: assets/logo/lenzstore-mark.svg).
const STORE_HREF = 'data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2064%2064%22%20role=%22img%22%3E%3Ctitle%3EVIDEOTHEK%20LENZ%3C/title%3E%3Crect%20width=%2264%22%20height=%2264%22%20rx=%2212%22%20fill=%22%230d1330%22/%3E%3Crect%20x=%224%22%20y=%224%22%20width=%2256%22%20height=%2256%22%20rx=%229%22%20fill=%22none%22%20stroke=%22%23ff3d7f%22%20stroke-width=%222.5%22/%3E%3Cpath%20d=%22M12%2018l9%2028%209-28h-5.5L21%2033.5%2017.5%2018zM34%2018h5.5v23H52v5H34z%22%20fill=%22%23ffd23f%22/%3E%3C/svg%3E';
const FAVICONS = { flix: FLIX_HREF, plus: PLUS_HREF, prime: PRIME_HREF, retro: RETRO_HREF, store: STORE_HREF };
// Home-Bildschirm-Icons (PNG 180×180, randlos, deckend; iOS kann kein SVG und rundet selbst). LENZFLIX: eingebettet;
// die übrigen liegen als Datei neben dist/ (assets/logo/touch-<id>.png, gleiche Basis wie das Design-CSS) und lädt
// der Browser nur bei Bedarf (z. B. „Zum Home-Bildschirm“). So bleibt das Hauptbundle klein.
const TOUCH_FILES = { plus: 'touch-plus.png', prime: 'touch-prime.png', retro: 'touch-retro.png', store: 'touch-store.png' };

import { brandName } from './theme.js';
import { resolveThemeCssBase } from './themecss.js';

/** Home-Bildschirm-Icon des Designs: Datei-URL relativ zur Kern-Basis (…/dist/ → …/assets/logo/), sonst LENZFLIX. */
export function touchFor(theme) {
  const file = TOUCH_FILES[theme];
  if (!file) return FLIX_HREF;
  try {
    return new URL(`../assets/logo/${file}`, resolveThemeCssBase().base).href;
  } catch {
    return FLIX_HREF;
  }
}

const typeFor = (href) => (href.startsWith('data:image/svg') ? 'image/svg+xml' : 'image/png');
const ATTR = 'data-lfx-orig';
const ATTR_SIZES = 'data-lfx-orig-sizes';
const ATTR_TYPE = 'data-lfx-orig-type';
const TITLE_META = 'meta[name="apple-mobile-web-app-title"]';

let created = null;
let createdTitle = null; // selbst angelegtes Web-App-Titel-Meta
let patchedIcons = [];
let patchedTouch = [];
let patchedTitle = null; // vorhandenes Web-App-Titel-Meta (Original in ATTR)
let currentTheme = null;

const pick = (map, theme) => map[theme] || map.flix;

function setLink(l, href) {
  l.setAttribute('href', href);
  l.setAttribute('type', typeFor(href));
}

function setTitle(theme) {
  const el = patchedTitle || createdTitle;
  if (el) el.setAttribute('content', brandName(theme));
}

export function applyFavicon(theme = 'flix') {
  if (!document.head) return;
  const href = pick(FAVICONS, theme);
  const touch = touchFor(theme);
  if (created) {
    // Design gewechselt: alles umstellen
    if (theme !== currentTheme) {
      currentTheme = theme;
      for (const l of [...patchedIcons, created]) setLink(l, href);
      for (const l of patchedTouch) setLink(l, touch);
      setTitle(theme);
    }
    return;
  }
  currentTheme = theme;
  // Vorhandene Icon-Links umbiegen und Original merken: rel="icon" / "shortcut icon" bekommen das Tab-Icon,
  // rel="apple-touch-icon" das Home-Bildschirm-Icon.
  patchedIcons = [...document.head.querySelectorAll('link[rel~="icon"]')];
  patchedTouch = [...document.head.querySelectorAll('link[rel~="apple-touch-icon"], link[rel~="apple-touch-icon-precomposed"]')]
    .filter((l) => !patchedIcons.includes(l));
  for (const [list, h] of [[patchedIcons, href], [patchedTouch, touch]]) {
    for (const l of list) {
      l.setAttribute(ATTR, l.getAttribute('href') ?? '');
      if (l.hasAttribute('sizes')) l.setAttribute(ATTR_SIZES, l.getAttribute('sizes'));
      if (l.hasAttribute('type')) l.setAttribute(ATTR_TYPE, l.getAttribute('type'));
      setLink(l, h);
      l.removeAttribute('sizes');
    }
  }
  created = document.createElement('link');
  created.id = 'lfx-favicon';
  created.rel = 'icon';
  setLink(created, href);
  document.head.append(created);
  // Web-App-Titel (Name unter dem Home-Bildschirm-Symbol)
  patchedTitle = document.head.querySelector(TITLE_META);
  if (patchedTitle) {
    patchedTitle.setAttribute(ATTR, patchedTitle.getAttribute('content') ?? '');
  } else {
    createdTitle = document.createElement('meta');
    createdTitle.setAttribute('name', 'apple-mobile-web-app-title');
    document.head.append(createdTitle);
  }
  setTitle(theme);
}

export function removeFavicon() {
  created?.remove();
  created = null;
  createdTitle?.remove();
  createdTitle = null;
  currentTheme = null;
  for (const l of [...patchedIcons, ...patchedTouch]) {
    if (l.hasAttribute(ATTR)) {
      const orig = l.getAttribute(ATTR);
      if (orig) l.setAttribute('href', orig);
      else l.removeAttribute('href'); // Original hatte kein href
      for (const [a, name] of [[ATTR_SIZES, 'sizes'], [ATTR_TYPE, 'type']]) {
        if (l.hasAttribute(a)) l.setAttribute(name, l.getAttribute(a));
        else l.removeAttribute(name);
        l.removeAttribute(a);
      }
      l.removeAttribute(ATTR);
    }
  }
  patchedIcons = [];
  patchedTouch = [];
  if (patchedTitle && patchedTitle.hasAttribute(ATTR)) {
    const orig = patchedTitle.getAttribute(ATTR);
    if (orig) patchedTitle.setAttribute('content', orig);
    else patchedTitle.removeAttribute('content'); // Original hatte kein content
    patchedTitle.removeAttribute(ATTR);
  }
  patchedTitle = null;
}
