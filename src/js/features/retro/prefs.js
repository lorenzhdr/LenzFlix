// LENZ//84: gemeinsame FX-Schnittstelle zwischen Seiten-Features (header/tabbar/home/title/…) und retro-fx.
// Gehört dem Orchestrator; Worker nutzen sie nur. Kein Import aus fx/ nötig: Seiten melden Ereignisse per
// emitFx(), retro-fx hört zu (Sound, Glitch, Eastereggs). Vorlieben pro Benutzer in localStorage.
import { getUserId } from '../../core/api.js';

const KEY = 'lfx.retro.';
const DEFAULTS = { sound: false, crt: true };
export const PREFS_EVENT = 'lfx-retro-prefs';
export const FX_EVENT = 'lfx-retro-fx';

function storageKey(name) {
  return `${KEY}${name}.${getUserId() || 'anon'}`;
}

/** Vorliebe lesen: 'sound' (Standard aus) oder 'crt' (Standard an). */
export function getPref(name) {
  try {
    const v = window.localStorage.getItem(storageKey(name));
    if (v === '1') return true;
    if (v === '0') return false;
  } catch { /* Speicher gesperrt */ }
  return Boolean(DEFAULTS[name]);
}

/** Vorliebe setzen und document-Ereignis PREFS_EVENT ({ name, value }) feuern. */
export function setPref(name, value) {
  const on = Boolean(value);
  try { window.localStorage.setItem(storageKey(name), on ? '1' : '0'); } catch { /* egal */ }
  document.dispatchEvent(new CustomEvent(PREFS_EVENT, { detail: { name, value: on } }));
  return on;
}

export function togglePref(name) {
  return setPref(name, !getPref(name));
}

/**
 * Effekt-Ereignis melden, z. B. emitFx('hover'), emitFx('click'), emitFx('type'), emitFx('open').
 * retro-fx spielt dazu ggf. einen Sound (nur wenn 'sound' an ist). Nie werfen.
 */
export function emitFx(name, detail = {}) {
  try {
    document.dispatchEvent(new CustomEvent(FX_EVENT, { detail: { name, ...detail } }));
  } catch { /* egal */ }
}

/** Attribut, das Logos tragen, damit retro-fx Tipp-/Langdruck-Gesten (Cheat-Code, Terminal) erkennt. */
export const LOGO_ATTR = 'data-lfx-retro-logo';
/** Klasse am <html>, solange „Overdrive“ (Cheat-Code) aktiv ist; hero/rows-CSS dürfen darauf reagieren. */
export const OVERDRIVE_CLASS = 'lfx-retro-overdrive';
/** Klasse am <html>, wenn das CRT-Overlay aus ist (gesetzt von retro-fx). */
export const NO_CRT_CLASS = 'lfx-retro-nocrt';
