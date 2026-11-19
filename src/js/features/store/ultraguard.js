// VIDEOTHEK LENZ: Absturzschutz für die Handy-Ultra-Stufe (nur Hülle, nie im 3D-Bundle).
// Merker „ultraLive“ steht in localStorage, solange ein Handy (ultraCompact) mit sichtbarer Seite auf Stufe Ultra läuft, und wird bei jedem
// geordneten Ende gelöscht (pagehide, Seite verdeckt, Bühne ausgesetzt/entsorgt, Stufenwechsel). Steht er beim nächsten Start noch,
// war die Seite abgestürzt (Speicher): „ultraBlock“ sperrt dann das automatische Hochschalten auf Ultra, bis der Nutzer Ultra selbst wählt.
// Auf Desktop/Tablet (compact false) passiert nichts.
import * as prefs from './prefs.js';

let compact = false;
let lastLevel = null; // zuletzt gemeldete wirksame Stufe (null: Bühne nicht aktiv)
let armed = false;

const hidden = () => { try { return document.hidden === true; } catch { return false; } };

function sync() {
  prefs.setUltraLive(compact && lastLevel === 'ultra' && !hidden());
}
const onVis = () => sync();
const onPageHide = () => prefs.setUltraLive(false);
const onPageShow = () => sync();

function arm() {
  if (armed) return;
  armed = true;
  document.addEventListener('visibilitychange', onVis);
  window.addEventListener('pagehide', onPageHide);
  window.addEventListener('pageshow', onPageShow);
}

function disarm() {
  if (!armed) return;
  armed = false;
  document.removeEventListener('visibilitychange', onVis);
  window.removeEventListener('pagehide', onPageHide);
  window.removeEventListener('pageshow', onPageShow);
}

/** Beim Start der Bühne (buildOpts): true = Automatik darf auf Ultra hochschalten (opts.ultraAuto). Ein übrig gebliebener Merker zählt als Absturz. */
export function startUltraGuard(isCompact) {
  compact = isCompact === true;
  if (!compact) return true;
  if (prefs.getUltraLive()) {
    prefs.setUltraLive(false);
    prefs.setUltraBlock(true);
  }
  return !prefs.getUltraBlock();
}

/** deps.onLevel: wirksame Stufe der Bühne (Start, Automatik, manuell, VR-Klemmung, resume). */
export function reportUltraLevel(level) {
  if (!compact) return;
  lastLevel = level;
  arm();
  sync();
}

/** Bühne ausgesetzt, entsorgt oder Seite zerstört: Merker löschen, Listener entfernen. */
export function clearUltraGuard() {
  lastLevel = null;
  disarm();
  if (compact) prefs.setUltraLive(false);
}

/** Nutzer wählt Ultra ausdrücklich (Pause-Menü): Sperre der Automatik aufheben. */
export function manualUltraChosen() {
  if (compact) prefs.setUltraBlock(false);
}
