// LENZ//84: gemeinsame Bausteine von Kopfzeile und Funktionstasten-Leiste (Wortmarke, Uhr, Sound-/CRT-Schalter, Icons). Gehört Worker P1.
import { h } from '../../core/dom.js';
import { getPref, togglePref, PREFS_EVENT, LOGO_ATTR } from './prefs.js';

const NS = 'http://www.w3.org/2000/svg';
/** 24er-Raster; stroke = currentColor. Sound = [♪] (Klammern + Note), CRT = Monitor mit Zeilen. */
const ICONS = {
  sound: '<path d="M5 3H2v18h3M19 3h3v18h-3" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M10 16.2V7.6l5-1.2v8.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><ellipse cx="8.4" cy="16.6" rx="2" ry="1.6" fill="currentColor"/><ellipse cx="13.4" cy="15" rx="2" ry="1.6" fill="currentColor"/><path class="lfx-retro-slash" d="M3.5 21 20.5 3" stroke="currentColor" stroke-width="2" fill="none"/>',
  crt: '<rect x="2.5" y="3.5" width="19" height="13" rx="2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M6 8h12M6 12h12M9 20.5h6M12 16.5v4" fill="none" stroke="currentColor" stroke-width="1.6"/><path class="lfx-retro-slash" d="M3.5 21 20.5 3" stroke="currentColor" stroke-width="2" fill="none"/>',
  prev: '<polyline points="16,3 7,12 16,21" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square"/>',
  next: '<polyline points="8,3 17,12 8,21" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="square"/>',
  play: '<path d="M6 3.5v17l14-8.5z" fill="currentColor"/>',
  info: '<circle cx="12" cy="12" r="9.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M10.9 10.5h2.2v7h-2.2zM10.9 6.3h2.2v2.2h-2.2z" fill="currentColor"/>',
};

export function svgIcon(name, cls) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  if (cls) svg.setAttribute('class', cls);
  svg.innerHTML = ICONS[name] || '';
  return svg;
}

/** Wortmarke als Link (Bild per CSS-Hintergrund, trägt LOGO_ATTR für die Gesten von retro-fx). */
export function createLogo(className) {
  return h('a', { class: className, href: '#/home', 'aria-label': 'LENZ//84 – Startseite', [LOGO_ATTR]: '' });
}

const pad2 = (n) => String(n).padStart(2, '0');
/** 'HH:MM' (24 h). */
export function formatClock(date = new Date()) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/** Uhr „23:41“, aktualisiert minütlich (Timer an die volle Minute gebunden). destroy() stoppt ihn. */
export function createClock() {
  const hh = h('span', { class: 'lfx-retro-clock__h' });
  const mm = h('span', { class: 'lfx-retro-clock__m' });
  const el = h('time', { class: 'lfx-retro-clock', 'aria-label': 'Uhrzeit' }, [hh, h('span', { class: 'lfx-retro-clock__c' }, ':'), mm]);
  let timer = 0;
  const tick = () => {
    const d = new Date();
    hh.textContent = pad2(d.getHours());
    mm.textContent = pad2(d.getMinutes());
    el.setAttribute('datetime', formatClock(d));
    timer = setTimeout(tick, 60000 - (d.getSeconds() * 1000 + d.getMilliseconds()) + 20);
  };
  tick();
  return { el, destroy() { clearTimeout(timer); timer = 0; } };
}

const TOGGLES = {
  sound: { icon: 'sound', label: 'Ton' },
  crt: { icon: 'crt', label: 'CRT-Effekt' },
};

/** Schalter für 'sound' | 'crt': aria-pressed folgt getPref + PREFS_EVENT. */
export function createToggle(pref) {
  const cfg = TOGGLES[pref];
  const el = h('button', {
    type: 'button', class: `lfx-retro-switch lfx-retro-switch--${pref}`, 'aria-label': cfg.label, title: cfg.label,
  }, [svgIcon(cfg.icon)]);
  const sync = () => {
    const on = getPref(pref);
    el.setAttribute('aria-pressed', on ? 'true' : 'false');
    el.classList.toggle('is-on', on);
  };
  const onPrefs = () => sync();
  el.addEventListener('click', () => { togglePref(pref); });
  document.addEventListener(PREFS_EVENT, onPrefs);
  sync();
  return { el, sync, destroy() { document.removeEventListener(PREFS_EVENT, onPrefs); } };
}
