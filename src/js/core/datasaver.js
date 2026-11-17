// LenzFlix: Datensparmodus (LENZFLIX/LENZ+/LENZPRIME/LENZ//84). Manueller Schalter, pro Gerät und Nutzer in localStorage
// (lfx.datasaver.<userId|anon> = '1'|'0', Standard aus). Aktiv = an UND Design in DATASAVER_THEMES; in store wirkungslos.
// Teilschalter: lfx.datasaver.parts.<uid|anon> = JSON-Array der ABGESCHALTETEN Teile (DATASAVER_PARTS), isDataSaver(part).
// Bei Änderung von „aktiv“: <html>-Klasse lfx-datasaver, Bild-Skala (core/imgscale.js → core/api.js setImageScale), window-Event
// lfx:datasaver { active }. Vertrag: docs/js-contracts.md („Datensparmodus“).
import { getUserId, setImageScale } from './api.js';
import { getTheme, onThemeChange } from './theme.js';
import { DATASAVER_SCALE, getNormalScale, getSaverScale, onImageScaleChange } from './imgscale.js';

const KEY = 'lfx.datasaver.';
export const DATASAVER_EVENT = 'lfx:datasaver';
export const DATASAVER_CLASS = 'lfx-datasaver';
export const DATASAVER_THEMES = ['flix', 'plus', 'prime', 'retro'];
export { DATASAVER_SCALE };
const PARTS_KEY = 'lfx.datasaver.parts.';
const PARTS_EVENT = 'lfx:datasaver-parts';
export const FLASH_CLASS = 'lfx-ds-flash';
export const DATASAVER_PARTS = ['trailer', 'hero', 'images', 'prefetch', 'lazy', 'tvwarm'];
export const DATASAVER_PART_LABELS = {
  trailer: 'Keine automatischen Trailer',
  hero: 'Hero nur 5 Titel',
  images: 'Kleinere Bilder',
  prefetch: 'Kein Vorladen der Startseite',
  lazy: 'Zeilen erst kurz vor Sichtbarkeit',
  tvwarm: 'TV: kein Vorwärmen',
};

let active = false;
let lastUid;
let offTheme = null;
let offScale = null;
let offParts = null;
let flashTimer = 0;

const storageKey = () => `${KEY}${getUserId() || 'anon'}`;

/** Gespeicherter Schalterwert (unabhängig vom Design). */
export function isDataSaverOn() {
  try { return window.localStorage.getItem(storageKey()) === '1'; } catch { return false; }
}

/** Schalter wird im aktuellen Design angeboten (siehe DATASAVER_THEMES). */
export function dataSaverAvailable() {
  return DATASAVER_THEMES.includes(getTheme());
}

const partsKey = () => `${PARTS_KEY}${getUserId() || 'anon'}`;

function disabledParts() {
  try {
    const arr = JSON.parse(window.localStorage.getItem(partsKey()) || '[]');
    return Array.isArray(arr) ? arr.filter((p) => DATASAVER_PARTS.includes(p)) : [];
  } catch { return []; }
}

/**
 * Modus wirkt gerade: an UND Design in DATASAVER_THEMES. Mit Teil-Name zusätzlich: Teil nicht abgeschaltet
 * (unbekannter Teil = an). Immer live ausgewertet.
 */
export function isDataSaver(part) {
  if (!(dataSaverAvailable() && isDataSaverOn())) return false;
  return !part || !disabledParts().includes(part);
}

/** Zustand aller Teile: {part: bool} (true = Teil gespart). */
export function getDataSaverParts() {
  const off = disabledParts();
  return Object.fromEntries(DATASAVER_PARTS.map((p) => [p, !off.includes(p)]));
}

function emitParts() {
  window.dispatchEvent(new CustomEvent(PARTS_EVENT, { detail: { parts: getDataSaverParts() } }));
}

export function setDataSaverPart(part, on) {
  if (!DATASAVER_PARTS.includes(part)) return getDataSaverParts();
  const off = new Set(disabledParts());
  if (on) off.delete(part); else off.add(part);
  try {
    if (off.size) window.localStorage.setItem(partsKey(), JSON.stringify([...off]));
    else window.localStorage.removeItem(partsKey());
  } catch { /* Speicher gesperrt */ }
  apply();
  emitParts();
  return getDataSaverParts();
}

export function resetDataSaverParts() {
  try { window.localStorage.removeItem(partsKey()); } catch { /* Speicher gesperrt */ }
  apply();
  emitParts();
  return getDataSaverParts();
}

/** Abo auf Teil-Änderungen: cb(parts). Rückgabe: Abmelden. */
export function onDataSaverPartsChange(cb) {
  const fn = (e) => cb(e && e.detail && e.detail.parts);
  window.addEventListener(PARTS_EVENT, fn);
  return () => window.removeEventListener(PARTS_EVENT, fn);
}

/** Abgeleiteten Zustand (Klasse, Bild-Skala, Event) angleichen; Event nur bei echter Änderung. */
function apply() {
  const next = isDataSaver();
  document.documentElement.classList.toggle(DATASAVER_CLASS, next);
  setImageScale(isDataSaver('images') ? getSaverScale() : getNormalScale());
  if (next === active) return;
  active = next;
  window.dispatchEvent(new CustomEvent(DATASAVER_EVENT, { detail: { active } }));
}

function flash() {
  const cl = document.documentElement.classList;
  clearTimeout(flashTimer);
  cl.add(FLASH_CLASS);
  flashTimer = setTimeout(() => { flashTimer = 0; cl.remove(FLASH_CLASS); }, 1200);
}

export function setDataSaver(on) {
  const was = isDataSaver();
  try { window.localStorage.setItem(storageKey(), on ? '1' : '0'); } catch { /* Speicher gesperrt */ }
  apply();
  if (on && !was && isDataSaver()) flash();
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
  if (!offScale) offScale = onImageScaleChange(() => apply());
  if (!offParts) offParts = onDataSaverPartsChange(() => apply());
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
  if (offScale) offScale();
  offScale = null;
  if (offParts) offParts();
  offParts = null;
  clearTimeout(flashTimer);
  flashTimer = 0;
  lastUid = undefined;
  active = false;
  document.documentElement.classList.remove(DATASAVER_CLASS, FLASH_CLASS);
  setImageScale(1);
}
