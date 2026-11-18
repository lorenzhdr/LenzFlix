// LenzFlix: <meta name="theme-color"> passend zum Design (= --lfx-bg). Alleiniger Besitzer dieses Meta-Elements.
// Sollwert = Override ?? Designfarbe. Override (z. B. #000 im Player, features/playerbg.js) wirkt auch ohne
// angewandtes Design (pending, vor dem ersten Abgleich), die Designfarbe nur zwischen applyThemeColor und removeThemeColor.
// Unter TV und auf Admin-Seiten bleibt der Original-Wert von Jellyfin stehen.
//
// Original: der Wert, den Jellyfin (oder die Seite) zuletzt selbst geschrieben hat. Er wird beim ersten Übernehmen
// gemerkt. Jellyfin kann das Meta jederzeit neu schreiben: bei jedem Abgleich wird der DOM-Wert mit dem zuletzt von
// uns geschriebenen verglichen; weicht er ab und ist nicht unser Sollwert, ist es ein neuer Jellyfin-Wert und ersetzt
// das gemerkte Original (so stellt removeThemeColor nie einen veralteten Wert wieder her). Der Abgleich läuft bei
// jedem applyThemeColor-Aufruf (main.js sync, Designwechsel) und bei Routenwechseln, nie mit eigenem Observer.
import { isTv } from './layout.js';
import { currentRoute, onRoute } from './router.js';

export const THEME_COLORS = {
  flix: '#141414',
  plus: '#10131f',
  prime: '#00050d',
  retro: '#0a0603',
  store: '#0d1330',
};

const OWN_ATTR = 'data-lfx-themecolor';
const ADMIN = /^\/(dashboard|configurationpage)/;

let active = false;
let theme = null;
let override = null;
let unsub = null;
let meta = null; // aktuell besessenes Element
let own = false; // Element von uns angelegt (Jellyfin hatte keines)
let captured = false;
let orig = null; // Originalwert (null = Attribut fehlte)
let written = null; // zuletzt von uns geschriebener Wert

function designColor() {
  if (!active || !theme) return null;
  if (isTv()) return null;
  const route = currentRoute();
  if (ADMIN.test(route.path)) return null;
  return THEME_COLORS[theme] || THEME_COLORS.flix;
}

function target() {
  return override ?? designColor();
}

function findMeta() {
  const all = [...document.head.querySelectorAll('meta[name="theme-color"]')];
  return all.find((m) => !m.hasAttribute(OWN_ATTR)) || all[0] || null;
}

function release() {
  if (!meta) return;
  if (own) meta.remove();
  else if (captured) {
    if (orig === null) meta.removeAttribute('content');
    else if (meta.getAttribute('content') !== orig) meta.setAttribute('content', orig);
  }
  meta = null;
  own = false;
  captured = false;
  orig = null;
  written = null;
}

function sync() {
  if (!document.head) return;
  const want = target();
  if (want === null) {
    release();
    return;
  }
  const found = findMeta();
  if (found && found !== meta) {
    // Jellyfin hat ein Meta (neu) angelegt oder ersetzt: dieses übernehmen, ein eigenes davon verwerfen
    if (own && meta) meta.remove();
    meta = found;
    own = found.hasAttribute(OWN_ATTR);
    captured = false;
    written = null;
  }
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    meta.setAttribute(OWN_ATTR, '');
    document.head.appendChild(meta);
    own = true;
  }
  const dom = meta.getAttribute('content');
  if (!own) {
    // Erstes Übernehmen oder neuer Jellyfin-Wert (weder unser letzter noch der Sollwert): als Original merken
    if (!captured || (dom !== written && dom !== want)) {
      orig = dom;
      captured = true;
    }
  }
  if (dom !== want) meta.setAttribute('content', want);
  written = want;
}

/** Design anwenden (idempotent; vergleicht bei jedem Aufruf den DOM-Wert mit dem Sollwert). */
export function applyThemeColor(next = 'flix') {
  active = true;
  theme = next;
  if (!unsub) unsub = onRoute(() => sync());
  sync();
}

/** Farbe erzwingen (z. B. '#000000' im Player); null gibt sie wieder frei. */
export function setThemeColorOverride(color) {
  override = color || null;
  sync();
}

/** Design lösen und das Original wiederherstellen (ein gesetzter Override bleibt bis zu seiner Freigabe bestehen). */
export function removeThemeColor() {
  active = false;
  theme = null;
  if (unsub) {
    unsub();
    unsub = null;
  }
  sync();
}
