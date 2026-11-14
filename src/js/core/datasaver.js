// LenzFlix: Datensparmodus (nur LENZFLIX/LENZ+/LENZPRIME). Manueller Schalter, pro Gerät und Nutzer in localStorage
// (lfx.datasaver.<userId|anon> = '1'|'0', Standard aus). Aktiv = an UND Design flix/plus/prime; in retro/store/live wirkungslos.
// Bei Änderung von „aktiv“: <html>-Klasse lfx-datasaver, Bild-Skala 2/3 (core/api.js setImageScale), window-Event
// lfx:datasaver { active }. Vertrag: docs/js-contracts.md („Datensparmodus“).
import { getUserId, setImageScale } from './api.js';
import { getTheme, onThemeChange } from './theme.js';

const KEY = 'lfx.datasaver.';
export const DATASAVER_EVENT = 'lfx:datasaver';
export const DATASAVER_CLASS = 'lfx-datasaver';
export const DATASAVER_THEMES = ['flix', 'plus', 'prime'];
export const DATASAVER_SCALE = 2 / 3;

let active = false;
let lastUid;
let offTheme = null;

const storageKey = () => `${KEY}${getUserId() || 'anon'}`;

/** Gespeicherter Schalterwert (unabhängig vom Design). */
export function isDataSaverOn() {
  try { return window.localStorage.getItem(storageKey()) === '1'; } catch { return false; }
}

/** Schalter wird im aktuellen Design angeboten (flix/plus/prime). */
export function dataSaverAvailable() {
  return DATASAVER_THEMES.includes(getTheme());
}

/** Modus wirkt gerade: an UND Design flix/plus/prime. Immer live ausgewertet. */
export function isDataSaver() {
  return dataSaverAvailable() && isDataSaverOn();
}

/** Abgeleiteten Zustand (Klasse, Bild-Skala, Event) angleichen; Event nur bei echter Änderung. */
function apply() {
  const next = isDataSaver();
  document.documentElement.classList.toggle(DATASAVER_CLASS, next);
  setImageScale(next ? DATASAVER_SCALE : 1);
  if (next === active) return;
  active = next;
  window.dispatchEvent(new CustomEvent(DATASAVER_EVENT, { detail: { active } }));
}

export function setDataSaver(on) {
  try { window.localStorage.setItem(storageKey(), on ? '1' : '0'); } catch { /* Speicher gesperrt */ }
  apply();
  return isDataSaverOn();
}

export function toggleDataSaver() {
  return setDataSaver(!isDataSaverOn());
}

/** Abo auf Änderungen von „aktiv“: cb(active). Rückgabe: Abmelden. */
export function onDataSaverChange(cb) {
  const fn = (e) => cb(!!(e && e.detail && e.detail.active));
  window.addEventListener(DATASAVER_EVENT, fn);
  return () => window.removeEventListener(DATASAVER_EVENT, fn);
}

/**
 * Aus main.js sync() (neben syncThemeUser): beim ersten Aufruf Design-Abo anlegen; wechselt die Nutzer-Id
 * (beim Seitenstart kennt Jellyfin den Nutzer oft noch nicht → erst 'anon'), Wert neu lesen. Idempotent.
 */
export function syncDataSaver() {
  if (!offTheme) offTheme = onThemeChange(() => apply());
  const uid = getUserId() || null;
  if (uid !== lastUid) {
    lastUid = uid;
    apply();
  }
}

/** destroy(): Abo, Klasse und Skala entfernen (gespeicherter Wert bleibt). */
export function destroyDataSaver() {
  if (offTheme) offTheme();
  offTheme = null;
  lastUid = undefined;
  active = false;
  document.documentElement.classList.remove(DATASAVER_CLASS);
  setImageScale(1);
}
